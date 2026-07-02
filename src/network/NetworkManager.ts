// NetworkManager — the single coordinator for the app's network client.
//
// Friend/Sync model (mutual, no one-way): tapping "Add Friend" generates a short
// code that lives 30 minutes and can be used by several people in that window.
// You enter their code and they enter yours; the link only becomes connected
// once BOTH sides have entered the other's code.
//
// Mechanism: while a code is active the app publishes its signed identity to the
// node's rendezvous under hash(code). Entering someone's code looks up their
// record, then sends a signed "connect" over the E2E channel. Each side flips to
// 'accepted' only once it has both entered the other's code AND received their
// connect — so neither can be added one-way.

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { store, KEYS } from '../storage';
import {
  Identity,
  FriendIdentity,
  loadOrCreateIdentity,
} from './identity';
import { NodeClient, PacketReceived } from './NodeClient';
import { sealMessage, openMessage } from './crypto';
import { resolveNetwork } from './defaultNetwork';
import {
  rendezvousNamespace,
  makeRendezvousRecord,
  openRendezvousRecord,
} from './rendezvous';
import { decodeBase64, encodeBase64 } from './bytes';
import { generateFriendCode, generateSyncCode, Member } from '../utils';
import { buildFrontShare } from './frontShare';
import {
  Friend,
  FrontShare,
  NetMessage,
  NetworkSettings,
  ConnStatus,
  RENDEZVOUS_TTL_SECONDS,
  FRIENDS_STORAGE_KEY,
  NETWORK_SETTINGS_KEY,
  SYNC_EXCLUDE_KEYS,
  SYNC_STATE_KEY,
} from './types';

// Live-sync tuning. A large initial sync must trickle out, not fire all at once:
// messages are kept small, large single values are split into parts, and every
// message is paced apart so a big sync spreads over time instead of bursting.
const SYNC_DEBOUNCE_MS = 8000; // coalesce bursts of edits
const SYNC_MIN_INTERVAL_MS = 8000; // floor between push cycles
const SYNC_MSG_BUDGET = 64 * 1024; // max value bytes packed into one 'sync' message
const SYNC_CHUNK_SIZE = 48 * 1024; // a value larger than the budget streams in parts this big
const SYNC_PACE_MS = 300; // delay between consecutive messages (the anti-burst throttle)
const SYNC_MAX_PARTS = 4096; // reject absurd part counts on receive

const SYNC_EXCLUDE = new Set(SYNC_EXCLUDE_KEYS);

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

// A human-readable label for THIS device, sent on device links so your devices
// list (and sync-conflict prompts) can say which physical device is which —
// both your devices share the same system name, so that can't distinguish them.
const deviceLabel = (): string => {
  try {
    if (Platform.OS === 'ios') {
      const idiom = (Platform as any).constants?.interfaceIdiom;
      const kind = idiom === 'pad' ? 'iPad' : idiom === 'mac' ? 'Mac' : 'iPhone';
      return `${kind} (iOS ${Platform.Version})`;
    }
    const c: any = (Platform as any).constants || {};
    const name = [c.Brand, c.Model].filter(Boolean).join(' ');
    return name || `Android ${Platform.Version}`;
  } catch {
    return Platform.OS === 'ios' ? 'iPhone' : 'Android device';
  }
};

// Fast non-cryptographic content hash for change detection (FNV-1a, 32-bit).
const contentHash = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
};

export interface NetworkState {
  enabled: boolean;
  status: ConnStatus;
  peerId: string | null;
  friends: Friend[];
  devices: Friend[];
  onlinePeers: string[];
  relayConfigured: boolean;
  activeFriendCode: string | null;
  activeFriendExpiresAt: number | null;
  activeDeviceCode: string | null;
  activeDeviceExpiresAt: number | null;
}

type LinkKind = 'friend' | 'device';

export interface IncomingDM {
  peerId: string;
  body: string;
  ts: number;
}

interface ActiveCode {
  code: string;
  namespace: string;
  expiresAt: number;
}

type StateListener = (s: NetworkState) => void;
type DMListener = (dm: IncomingDM) => void;

class NetworkManagerImpl {
  private identity: Identity | null = null;
  private client: NodeClient | null = null;
  private settings: NetworkSettings = { enabled: false };
  private friends: Friend[] = [];
  private online: Set<string> = new Set();
  private status: ConnStatus = 'disabled';
  private active: { friend: ActiveCode | null; device: ActiveCode | null } = { friend: null, device: null };
  private codeTimers: { friend: ReturnType<typeof setTimeout> | null; device: ReturnType<typeof setTimeout> | null } = { friend: null, device: null };
  private systemName = 'Plural Star user';
  private myFront: FrontShare | null = null;

  // ---- sync engine state ----
  private lastHashes: Record<string, string> = {};
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPushAt = 0;
  private syncing = false; // guard against overlapping push cycles
  private chunkBuffers: Map<string, {parts: string[]; total: number; seqs: Set<number>; init: boolean}> = new Map();
  private pendingConflicts: Map<string, {key: string; remoteValue: string; remoteHash: string}[]> = new Map();
  private syncAppliedListeners: Set<() => void> = new Set();
  private syncConflictListeners: Set<(c: {peerId: string; deviceName: string; keys: string[]}) => void> = new Set();
  private syncRoleMismatchListeners: Set<(c: {peerId: string; deviceName: string}) => void> = new Set();
  private syncCloneDoneListeners: Set<(c: {peerId: string}) => void> = new Set();

  private stateListeners: Set<StateListener> = new Set();
  private dmListeners: Set<DMListener> = new Set();
  private loaded = false;

  subscribe(fn: StateListener): () => void {
    this.stateListeners.add(fn);
    fn(this.getState());
    return () => this.stateListeners.delete(fn);
  }

  onDM(fn: DMListener): () => void {
    this.dmListeners.add(fn);
    return () => this.dmListeners.delete(fn);
  }

  getState(): NetworkState {
    const net = resolveNetwork(this.settings);
    return {
      enabled: this.settings.enabled,
      status: this.status,
      peerId: this.identity?.peerId ?? null,
      friends: this.friends.filter(f => f.kind !== 'device'),
      devices: this.friends.filter(f => f.kind === 'device'),
      onlinePeers: Array.from(this.online),
      relayConfigured: !!net.relayUrl,
      activeFriendCode: this.active.friend?.code ?? null,
      activeFriendExpiresAt: this.active.friend?.expiresAt ?? null,
      activeDeviceCode: this.active.device?.code ?? null,
      activeDeviceExpiresAt: this.active.device?.expiresAt ?? null,
    };
  }

  private notify(): void {
    const snap = this.getState();
    this.stateListeners.forEach(fn => {
      try {
        fn(snap);
      } catch (e) {
        console.error('[NETWORK] state listener threw:', e);
      }
    });
  }

  private async persistFriends(): Promise<void> {
    await store.set(FRIENDS_STORAGE_KEY, this.friends);
  }

  private async persistSettings(): Promise<void> {
    await store.set(NETWORK_SETTINGS_KEY, this.settings);
  }

  async init(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    this.settings = (await store.get<NetworkSettings>(NETWORK_SETTINGS_KEY, null)) || {
      enabled: false,
    };
    this.friends = (await store.get<Friend[]>(FRIENDS_STORAGE_KEY, null)) || [];
    this.lastHashes = (await store.get<Record<string, string>>(SYNC_STATE_KEY, null)) || {};
    this.identity = await loadOrCreateIdentity();
    try {
      const sys = await store.get<{ name?: string }>(KEYS.system, null);
      if (sys && sys.name) this.systemName = sys.name;
    } catch {}
    if (this.settings.enabled) await this.connect();
    else this.notify();
  }

  private setStatus(s: ConnStatus): void {
    this.status = s;
    this.notify();
  }

  private async connect(): Promise<void> {
    const self = this.identity ?? (this.identity = await loadOrCreateIdentity());
    const net = resolveNetwork(this.settings);
    if (!net.relayUrl) {
      this.setStatus('error');
      return;
    }
    if (this.client) this.client.disconnect();

    const client = new NodeClient(net.relayUrl, net.token, self.peerId);
    this.client = client;

    client.on('status', (s: ConnStatus) => {
      this.setStatus(s);
      if (s === 'online') {
        // Seed presence: peer_online events only cover TRANSITIONS after this
        // point — anyone already online when we connected would show Offline
        // forever without this snapshot.
        this.refreshOnlinePeers();
        // Re-publish an active code after a (re)connect so it stays resolvable.
        this.republishActiveCode();
        // The relay does NOT store-and-forward: a connect sent while the other
        // side was offline is gone. Retransmit for every still-pending link so
        // a lost connect can't strand the handshake.
        this.resendPendingConnects();
        // Likewise restart any initial clone we owe as source (e.g. we went
        // offline mid-clone) — the push is idempotent on the target.
        this.restartPendingClones();
      }
    });
    client.on('packet_received', (p: PacketReceived) => this.handlePacket(p));
    client.on('peer_online', (e: any) => {
      if (e?.peer_id && e.peer_id !== this.identity?.peerId) {
        this.online.add(e.peer_id);
        // If we're mid-handshake with this peer, retry now that they can hear us.
        const pending = this.friends.find(f => f.peerId === e.peer_id && f.status === 'entered_theirs');
        if (pending) this.sendConnectTo(pending.peerId, pending.kind, false).catch(() => {});
        // If we owe this peer its initial clone, deliver it now that it can hear us.
        const owed = this.friends.find(
          f => f.peerId === e.peer_id && f.kind === 'device' && f.status === 'accepted' && f.initRole === 'source' && f.initPending,
        );
        if (owed) this.doInitClonePush(owed.peerId).catch(() => {});
        this.notify();
      }
    });
    client.on('peer_offline', (e: any) => {
      if (e?.peer_id) {
        this.online.delete(e.peer_id);
        this.notify();
      }
    });
    client.on('error', (e: any) => console.warn('[NETWORK] client error:', e));

    client.connect();
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.settings = { ...this.settings, enabled };
    await this.persistSettings();
    if (enabled) {
      await this.connect();
    } else {
      if (this.client) this.client.disconnect();
      this.client = null;
      this.online.clear();
      this.clearActiveCode('friend');
      this.clearActiveCode('device');
      this.setStatus('disabled');
    }
  }

  async setRelayOverride(relayUrl?: string, token?: string): Promise<void> {
    this.settings = { ...this.settings, relayUrl, token };
    await this.persistSettings();
    if (this.settings.enabled) await this.connect();
    else this.notify();
  }

  // ---- code lifecycle ----

  // Generate (or regenerate) my shareable code and publish my identity under it.
  // PUBLISH FIRST, show second: a code that failed to register is a dead code —
  // silently displaying it made friends get "code wasn't found" with no clue why.
  async generateCode(kind: LinkKind = 'friend'): Promise<string> {
    if (!this.identity) this.identity = await loadOrCreateIdentity();
    const client = this.client;
    if (!client) throw new Error('network not connected');
    const code = kind === 'device' ? generateSyncCode() : generateFriendCode();
    const namespace = rendezvousNamespace(code, kind === 'device' ? 'sync' : 'friend');
    const record = makeRendezvousRecord(this.identity);
    await client.rendezvousRegister(namespace, record, RENDEZVOUS_TTL_SECONDS); // throws -> UI alert
    this.active[kind] = { code, namespace, expiresAt: Date.now() + RENDEZVOUS_TTL_SECONDS * 1000 };
    const prev = this.codeTimers[kind];
    if (prev) clearTimeout(prev);
    this.codeTimers[kind] = setTimeout(() => this.clearActiveCode(kind), RENDEZVOUS_TTL_SECONDS * 1000);
    this.notify();
    return code;
  }

  private async republishActiveCode(): Promise<void> {
    const self = this.identity;
    if (!this.client || !self) return;
    const record = makeRendezvousRecord(self);
    for (const kind of ['friend', 'device'] as const) {
      const a = this.active[kind];
      if (!a) continue;
      if (a.expiresAt <= Date.now()) {
        this.clearActiveCode(kind);
        continue;
      }
      try {
        const remainingSec = Math.max(1, Math.round((a.expiresAt - Date.now()) / 1000));
        await this.client.rendezvousRegister(a.namespace, record, remainingSec);
      } catch (e) {
        console.warn('[NETWORK] rendezvous register failed:', e);
      }
    }
  }

  // Replace the online set with the node's current view (/peers now includes
  // apps connected locally to that node as well as remotely routed ones).
  private async refreshOnlinePeers(): Promise<void> {
    const client = this.client;
    const self = this.identity;
    if (!client) return;
    try {
      const peers = await client.peers();
      if (!Array.isArray(peers)) return;
      this.online = new Set(
        peers
          .map((p: any) => (p && typeof p.peer_id === 'string' ? p.peer_id : null))
          .filter((id: string | null): id is string => !!id && id !== self?.peerId),
      );
      this.notify();
    } catch {
      // Snapshot is best-effort; live events still apply on top.
    }
  }

  clearActiveCode(kind: LinkKind): void {
    const tm = this.codeTimers[kind];
    if (tm) {
      clearTimeout(tm);
      this.codeTimers[kind] = null;
    }
    this.active[kind] = null;
    this.notify();
  }

  // ---- entering a friend's code ----

  async enterCode(theirCode: string, kind: LinkKind, role?: 'source' | 'target'): Promise<void> {
    const self = this.identity;
    const client = this.client;
    if (!self || !client) throw new Error('network not connected');
    const code = (theirCode || '').trim();
    if (!code) throw new Error('empty code');

    const namespace = rendezvousNamespace(code, kind === 'device' ? 'sync' : 'friend');
    const record = await client.rendezvousLookup(namespace);
    if (!record) throw new Error('code not found or expired');
    const id = openRendezvousRecord(record);
    if (!id) throw new Error('invalid record');
    if (id.peerId === self.peerId) throw new Error('that is your own code');

    const existing = this.friends.find(f => f.peerId === id.peerId);
    // If they already entered my code, both sides have now acted -> accepted.
    // NEVER downgrade an already-accepted link: users re-enter codes when
    // things look stuck, and turning 'accepted' back into 'entered_theirs'
    // broke working links ("putting in the code again makes it stop working").
    const status: Friend['status'] =
      existing?.status === 'accepted' || existing?.status === 'entered_mine' ? 'accepted' : 'entered_theirs';
    const fallbackName = kind === 'device' ? 'Device' : 'Friend';
    this.upsertFriend({
      ...this.friendFrom(id, existing?.displayName || fallbackName, status, kind),
      // Device links: record which side of the initial clone I chose. The clone
      // stays pending until it completes (or roles turn out mismatched).
      ...(kind === 'device' && role ? { initRole: role, initPending: true } : {}),
    });
    await this.persistFriends();
    this.notify();

    // Tell them I entered their code (rides the E2E channel).
    await this.sendConnectTo(id.peerId, kind, false);
    // If this completed the link, kick off the right initial exchange.
    if (status === 'accepted') {
      if (kind === 'friend') await this.sendMyFrontTo(id.peerId);
      else {
        const merged = this.friends.find(f => f.peerId === id.peerId);
        if (merged) this.onDeviceLinkAccepted(merged);
      }
    }
  }

  async enterFriendCode(code: string): Promise<void> {
    return this.enterCode(code, 'friend');
  }

  async enterDeviceCode(code: string, role: 'source' | 'target'): Promise<void> {
    return this.enterCode(code, 'device', role);
  }

  // ---- inbound ----

  private handlePacket(p: PacketReceived): void {
    const self = this.identity;
    if (!self || !p?.sender_peer_id || !p?.payload) return;
    const opened = openMessage(self, p.sender_peer_id, p.payload);
    if (!opened) return;
    this.routeMessage(opened.sender, opened.message);
  }

  private upsertFriend(partial: Friend): void {
    const idx = this.friends.findIndex(f => f.peerId === partial.peerId);
    if (idx >= 0) this.friends[idx] = { ...this.friends[idx], ...partial };
    else this.friends.push(partial);
  }

  private friendFrom(id: FriendIdentity, displayName: string, status: Friend['status'], kind: LinkKind): Friend {
    return {
      peerId: id.peerId,
      edPublicKey: encodeBase64(id.edPublicKey),
      boxPublicKey: encodeBase64(id.boxPublicKey),
      displayName,
      addedAt: Date.now(),
      kind,
      status,
    };
  }

  private routeMessage(sender: FriendIdentity, msg: NetMessage): void {
    switch (msg.t) {
      case 'connect': {
        const existing = this.friends.find(f => f.peerId === sender.peerId);
        if (existing && existing.status === 'entered_theirs') {
          // I had entered their code; their connect (or ack) completes the link.
          const accepted: Friend = {
            ...existing,
            status: 'accepted',
            displayName: msg.name || existing.displayName,
            peerRole: msg.role ?? existing.peerRole,
          };
          this.upsertFriend(accepted);
          // Confirm back unless this WAS the confirmation — without this ack the
          // other side never learns its connect landed and stays stuck one-way.
          if (!msg.ack) this.sendConnectTo(sender.peerId, existing.kind, true).catch(() => {});
          if (existing.kind === 'device') this.onDeviceLinkAccepted(accepted);
          else this.sendMyFrontTo(sender.peerId);
        } else if (existing && existing.status === 'accepted') {
          this.upsertFriend({ ...existing, displayName: msg.name || existing.displayName, peerRole: msg.role ?? existing.peerRole });
          // A repeated connect means THEY still think the link is pending
          // (their original never got our reply) — re-ack to heal them.
          if (!msg.ack) this.sendConnectTo(sender.peerId, existing.kind, true).catch(() => {});
        } else if (msg.ack) {
          // A confirmation for a link we no longer have (e.g. removed) — ignore;
          // never create an entry from an ack, and never reply to one.
          break;
        } else {
          // They entered my code first; wait until I enter theirs.
          const kind = msg.kind || 'friend';
          this.upsertFriend({
            ...this.friendFrom(sender, msg.name || (kind === 'device' ? 'Device' : 'Friend'), 'entered_mine', kind),
            peerRole: msg.role,
          });
        }
        this.persistFriends();
        this.notify();
        break;
      }
      case 'disconnect': {
        this.friends = this.friends.filter(f => f.peerId !== sender.peerId);
        this.persistFriends();
        this.notify();
        break;
      }
      case 'dm': {
        const existing = this.friends.find(f => f.peerId === sender.peerId);
        if (existing && existing.status === 'accepted') {
          this.dmListeners.forEach(fn => {
            try {
              fn({ peerId: sender.peerId, body: msg.body, ts: msg.ts });
            } catch {}
          });
        }
        break;
      }
      case 'front': {
        const existing = this.friends.find(f => f.peerId === sender.peerId);
        if (existing && existing.status === 'entered_theirs') {
          // Peers only send 'front' to links they consider accepted, and I've
          // already entered their code — so the link is mutual; my accept just
          // never reached me. Heal instead of dropping (dropping is exactly what
          // stranded one side of every one-way friendship).
          this.upsertFriend({ ...existing, status: 'accepted', lastStatus: msg.status, statusUpdatedAt: Date.now() });
          this.persistFriends();
          this.notify();
          this.sendMyFrontTo(sender.peerId);
        } else if (existing && existing.status === 'accepted') {
          this.upsertFriend({ ...existing, lastStatus: msg.status, statusUpdatedAt: Date.now() });
          this.persistFriends();
          this.notify();
        }
        break;
      }
      case 'sync': {
        this.applySync(sender, msg.keys, !!msg.init, !!msg.initDone).catch(e => console.warn('[NETWORK] applySync failed:', e));
        break;
      }
      case 'sync_chunk': {
        // Only buffer chunks from a linked device. 'entered_theirs' counts:
        // devices only sync to links they consider accepted, so applySync will
        // heal the status when the reassembled value is applied.
        const dev = this.friends.find(
          f => f.peerId === sender.peerId && f.kind === 'device' && (f.status === 'accepted' || f.status === 'entered_theirs'),
        );
        if (dev) this.handleSyncChunk(sender, msg);
        break;
      }
      case 'ping':
        break;
    }
  }

  // ---- outbound ----

  private async sendTo(recipientPeerId: string, msg: NetMessage): Promise<void> {
    const self = this.identity;
    const client = this.client;
    if (!self || !client) throw new Error('network not connected');
    const friend = this.friends.find(f => f.peerId === recipientPeerId) || null;
    if (!friend) throw new Error('no public key for recipient');
    const payload = sealMessage(self, decodeBase64(friend.boxPublicKey), msg);
    await client.send(recipientPeerId, payload);
  }

  // Send a connect (or its ack). Device links carry a device label instead of
  // the system name — both your devices share the system name, so it can't
  // identify which device a sync is coming from; the label can.
  private async sendConnectTo(peerId: string, kind: LinkKind, ack: boolean): Promise<void> {
    const name = kind === 'device' ? deviceLabel() : this.systemName;
    // Device links state which side of the initial clone we chose, so the other
    // device can detect a mismatch (both "source" / both "target").
    const role = kind === 'device' ? this.friends.find(f => f.peerId === peerId)?.initRole : undefined;
    const msg: NetMessage = {
      t: 'connect',
      name,
      kind,
      ...(ack ? { ack: true } : {}),
      ...(role ? { role } : {}),
    };
    await this.sendTo(peerId, msg);
  }

  // Retransmit connect for every link still waiting on the other side. Called on
  // (re)connect; delivery is best-effort and the handler is idempotent, so a
  // duplicate connect is harmless while a lost one is what causes one-way links.
  // Accepted DEVICE links get one too: it refreshes the device label on both
  // sides (their handler re-acks with theirs), so devices linked before labels
  // existed stop showing as the shared system name.
  private resendPendingConnects(): void {
    for (const f of this.friends) {
      const pending = f.status === 'entered_theirs';
      const deviceRefresh = f.kind === 'device' && f.status === 'accepted';
      if (!pending && !deviceRefresh) continue;
      this.sendConnectTo(f.peerId, f.kind, false).catch(() => {});
    }
  }

  // Re-run any initial clone this device still owes as source.
  private restartPendingClones(): void {
    for (const f of this.friends) {
      if (f.kind === 'device' && f.status === 'accepted' && f.initRole === 'source' && f.initPending) {
        this.doInitClonePush(f.peerId).catch(() => {});
      }
    }
  }

  async removeFriend(peerId: string): Promise<void> {
    try {
      await this.sendTo(peerId, { t: 'disconnect' });
    } catch {
      // best-effort; remove locally regardless
    }
    this.friends = this.friends.filter(f => f.peerId !== peerId);
    await this.persistFriends();
    this.notify();
  }

  async sendDM(peerId: string, body: string): Promise<void> {
    await this.sendTo(peerId, { t: 'dm', body, ts: Date.now() });
  }

  // Called by the app whenever the local front (or members) change. Caches the
  // resolved status and broadcasts it to all accepted friends (best-effort).
  async updateMyFront(front: any, members: Member[]): Promise<void> {
    this.myFront = buildFrontShare(front, members);
    for (const f of this.friends) {
      if (f.status !== 'accepted' || f.kind === 'device') continue;
      try {
        await this.sendTo(f.peerId, { t: 'front', status: this.myFront });
      } catch {}
    }
  }

  private async sendMyFrontTo(peerId: string): Promise<void> {
    try {
      await this.sendTo(peerId, { t: 'front', status: this.myFront });
    } catch {}
  }

  // ---- live data sync (between your own linked devices) ----

  // A device link just completed. Decide the initial copy: exactly one side
  // must be 'source' (it clones its full data to the other), the other 'target'
  // (its data is replaced; its outbound sync stays off until the clone lands).
  // After the clone both sides live-sync bidirectionally like before.
  private onDeviceLinkAccepted(f: Friend): void {
    if (f.kind !== 'device') return;
    if (f.initRole === 'source') {
      if (f.peerRole === 'source') {
        this.failRolePairing(f); // both chose "send" — refuse to clone either way
        return;
      }
      // Their role is 'target' (or an older build that never says): we own the copy.
      this.doInitClonePush(f.peerId).catch(e => console.warn('[NETWORK] initial clone failed:', e));
    } else if (f.initRole === 'target') {
      if (f.peerRole !== 'source') {
        this.failRolePairing(f); // both chose "receive", or an older build that can't clone
        return;
      }
      // Wait silently: initPending suppresses our outbound sync until initDone.
    } else {
      // Pre-role link (legacy): the old symmetric behavior.
      this.notifyDataChanged();
    }
  }

  // Roles didn't pair up. Skip the clone entirely — never guess whose data
  // wins — and tell the user. The link stays; ongoing edits still live-sync.
  private failRolePairing(f: Friend): void {
    this.upsertFriend({ ...f, initPending: false });
    this.persistFriends();
    this.notify();
    this.syncRoleMismatchListeners.forEach(fn => {
      try {
        fn({ peerId: f.peerId, deviceName: f.displayName });
      } catch {}
    });
  }

  onSyncRoleMismatch(fn: (c: {peerId: string; deviceName: string}) => void): () => void {
    this.syncRoleMismatchListeners.add(fn);
    return () => this.syncRoleMismatchListeners.delete(fn);
  }

  onSyncCloneDone(fn: (c: {peerId: string}) => void): () => void {
    this.syncCloneDoneListeners.add(fn);
    return () => this.syncCloneDoneListeners.delete(fn);
  }

  private emitSyncCloneDone(peerId: string): void {
    this.syncCloneDoneListeners.forEach(fn => {
      try {
        fn({ peerId });
      } catch {}
    });
  }

  onSyncApplied(fn: () => void): () => void {
    this.syncAppliedListeners.add(fn);
    return () => this.syncAppliedListeners.delete(fn);
  }

  onSyncConflict(fn: (c: {peerId: string; deviceName: string; keys: string[]}) => void): () => void {
    this.syncConflictListeners.add(fn);
    return () => this.syncConflictListeners.delete(fn);
  }

  private emitSyncApplied(): void {
    this.syncAppliedListeners.forEach(fn => {
      try {
        fn();
      } catch {}
    });
  }

  // Devices eligible for live diff-sync. Excludes links mid-initial-clone: a
  // source hasn't established the shared base with them yet, and diff messages
  // interleaved with the clone would race it.
  private acceptedDevices(): Friend[] {
    return this.friends.filter(f => f.kind === 'device' && f.status === 'accepted' && !f.initPending);
  }

  // Poke from the app whenever local data changes. Debounced + rate-limited so a
  // burst of edits results in at most one push per interval (no relay flooding).
  notifyDataChanged(): void {
    // While this device is the TARGET of a pending initial clone, never push:
    // its data is about to be replaced and must not leak back at the source.
    if (this.friends.some(f => f.kind === 'device' && f.initRole === 'target' && f.initPending)) return;
    if (!this.settings.enabled || this.acceptedDevices().length === 0) return;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.doSyncPush().catch(e => console.warn('[NETWORK] sync push failed:', e));
    }, SYNC_DEBOUNCE_MS);
  }

  private async snapshot(): Promise<Record<string, string>> {
    const keys = (await AsyncStorage.getAllKeys()).filter(
      k => k.startsWith('ps:') && !SYNC_EXCLUDE.has(k),
    );
    // async-storage v3 renamed multiGet -> getMany (returns a Record). One
    // batched native call rather than N round-trips for a large snapshot.
    const got = await AsyncStorage.getMany(keys);
    const out: Record<string, string> = {};
    for (const k in got) {
      const v = got[k];
      if (v != null) out[k] = v;
    }
    return out;
  }

  private async doSyncPush(): Promise<void> {
    if (this.syncing) return; // never overlap push cycles
    const devices = this.acceptedDevices();
    if (devices.length === 0) return;
    const now = Date.now();
    if (now - this.lastPushAt < SYNC_MIN_INTERVAL_MS) {
      this.notifyDataChanged(); // too soon — try again after the floor
      return;
    }

    const snap = await this.snapshot();
    const changed: {k: string; v: string; h: string}[] = [];
    for (const k in snap) {
      const h = contentHash(snap[k]);
      if (this.lastHashes[k] !== h) changed.push({k, v: snap[k], h});
    }
    if (changed.length === 0) return;

    this.syncing = true;
    this.lastPushAt = now;
    try {
      // Send one message to every linked device, then pace before the next so a
      // large sync trickles out instead of bursting all at once.
      const sendOne = async (msg: NetMessage) => {
        for (const d of devices) {
          try {
            await this.sendTo(d.peerId, msg);
          } catch {}
        }
        await sleep(SYNC_PACE_MS);
      };

      let batch: Record<string, {v: string; h: string}> = {};
      let size = 0;
      const flush = async () => {
        if (Object.keys(batch).length === 0) return;
        const payload = batch;
        batch = {};
        size = 0;
        await sendOne({t: 'sync', keys: payload});
      };

      for (const c of changed) {
        if (c.v.length > SYNC_MSG_BUDGET) {
          // Oversized single value (e.g. a big image): flush the pending batch,
          // then stream it in paced parts the receiver reassembles.
          await flush();
          const total = Math.ceil(c.v.length / SYNC_CHUNK_SIZE);
          for (let seq = 0; seq < total; seq++) {
            const data = c.v.slice(seq * SYNC_CHUNK_SIZE, (seq + 1) * SYNC_CHUNK_SIZE);
            await sendOne({t: 'sync_chunk', key: c.k, h: c.h, seq, total, data});
          }
        } else {
          if (size + c.v.length > SYNC_MSG_BUDGET && Object.keys(batch).length) await flush();
          batch[c.k] = {v: c.v, h: c.h};
          size += c.v.length;
        }
        this.lastHashes[c.k] = c.h; // our value becomes the new shared base
      }
      await flush();
      await store.set(SYNC_STATE_KEY, this.lastHashes);
    } finally {
      this.syncing = false;
    }
  }

  // The directed initial copy: push EVERY syncable key to one device, flagged
  // `init` so the target overwrites without conflict prompts, ending with an
  // `initDone` marker that lifts the target's outbound suppression. Afterwards
  // our snapshot hashes become the shared base for normal bidirectional sync.
  private async doInitClonePush(peerId: string): Promise<void> {
    const dev = this.friends.find(f => f.peerId === peerId && f.kind === 'device' && f.status === 'accepted');
    if (!dev || dev.initRole !== 'source' || !dev.initPending) return;
    // Never clone at an offline target — the relay silently drops those packets
    // and we'd wrongly mark the clone done. The peer_online handler retries.
    if (!this.online.has(peerId)) return;
    if (this.syncing) {
      // A diff push is mid-flight; retry once it's done.
      setTimeout(() => this.doInitClonePush(peerId).catch(() => {}), SYNC_MIN_INTERVAL_MS);
      return;
    }
    this.syncing = true;
    try {
      const snap = await this.snapshot();
      const sendOne = async (msg: NetMessage) => {
        try {
          await this.sendTo(peerId, msg);
        } catch {}
        await sleep(SYNC_PACE_MS);
      };

      let batch: Record<string, {v: string; h: string}> = {};
      let size = 0;
      const flush = async () => {
        if (Object.keys(batch).length === 0) return;
        const payload = batch;
        batch = {};
        size = 0;
        await sendOne({t: 'sync', keys: payload, init: true});
      };

      for (const k in snap) {
        const v = snap[k];
        const h = contentHash(v);
        if (v.length > SYNC_MSG_BUDGET) {
          await flush();
          const total = Math.ceil(v.length / SYNC_CHUNK_SIZE);
          for (let seq = 0; seq < total; seq++) {
            const data = v.slice(seq * SYNC_CHUNK_SIZE, (seq + 1) * SYNC_CHUNK_SIZE);
            await sendOne({t: 'sync_chunk', key: k, h, seq, total, data, init: true});
          }
        } else {
          if (size + v.length > SYNC_MSG_BUDGET && Object.keys(batch).length) await flush();
          batch[k] = {v, h};
          size += v.length;
        }
        this.lastHashes[k] = h; // cloned value = the new shared base
      }
      await flush();
      // End-of-clone marker (also fine as the only message when there's no data).
      await sendOne({t: 'sync', keys: {}, init: true, initDone: true});
      await store.set(SYNC_STATE_KEY, this.lastHashes);
      this.upsertFriend({ ...dev, initPending: false });
      await this.persistFriends();
      this.notify();
      this.emitSyncCloneDone(peerId);
    } finally {
      this.syncing = false;
    }
  }

  // Reassemble a streamed oversized value, then apply it like any synced key.
  private handleSyncChunk(sender: FriendIdentity, m: {key: string; h: string; seq: number; total: number; data: string; init?: boolean}): void {
    if (!m.key || m.total <= 0 || m.total > SYNC_MAX_PARTS || m.seq < 0 || m.seq >= m.total) return;
    const id = `${sender.peerId}:${m.key}:${m.h}`;
    let buf = this.chunkBuffers.get(id);
    if (!buf) {
      buf = {parts: new Array(m.total).fill(''), total: m.total, seqs: new Set(), init: !!m.init};
      this.chunkBuffers.set(id, buf);
    }
    buf.parts[m.seq] = m.data;
    buf.seqs.add(m.seq);
    if (buf.seqs.size >= buf.total) {
      const v = buf.parts.join('');
      const wasInit = buf.init;
      this.chunkBuffers.delete(id);
      this.applySync(sender, {[m.key]: {v, h: m.h}}, wasInit).catch(e => console.warn('[NETWORK] applySync(chunk) failed:', e));
    }
  }

  private async applySync(sender: FriendIdentity, keys: Record<string, {v: string; h: string}>, init = false, initDone = false): Promise<void> {
    let dev = this.friends.find(f => f.peerId === sender.peerId && f.kind === 'device');
    if (!dev || dev.status === 'entered_mine') return; // only sync with linked devices
    if (dev.status === 'entered_theirs') {
      // They're syncing to us, so on their side the link is accepted, and we
      // entered their code — mutual. Heal our stuck pending status.
      dev = { ...dev, status: 'accepted' };
      this.upsertFriend(dev);
      await this.persistFriends();
      this.notify();
    }
    // The clone only overwrites unconditionally when WE opted in as the target.
    const cloning = init && dev.initRole === 'target';
    if (!init && dev.initRole === 'target' && dev.initPending) {
      // Normal diff traffic from the source while we still think a clone is
      // pending = the clone era is over on their side (their initDone was lost).
      // Lift our suppression rather than staying muted forever.
      dev = { ...dev, initPending: false };
      this.upsertFriend(dev);
      await this.persistFriends();
      this.notify();
    }
    const applied: string[] = [];
    const conflicts: {key: string; remoteValue: string; remoteHash: string}[] = [];
    for (const k in keys) {
      if (!k.startsWith('ps:') || SYNC_EXCLUDE.has(k)) continue;
      const incoming = keys[k];
      const localRaw = await AsyncStorage.getItem(k);
      const localHash = localRaw != null ? contentHash(localRaw) : '__absent__';
      const base = this.lastHashes[k];
      if (localHash === incoming.h) {
        this.lastHashes[k] = incoming.h;
        continue; // already identical
      }
      if (cloning) {
        // Directed initial copy: the user explicitly chose to replace this
        // device's data, so incoming always wins — no conflict prompts.
        await AsyncStorage.setItem(k, incoming.v);
        this.lastHashes[k] = incoming.h;
        applied.push(k);
        continue;
      }
      const noConflict = localRaw == null || (base !== undefined && localHash === base);
      if (noConflict) {
        await AsyncStorage.setItem(k, incoming.v);
        this.lastHashes[k] = incoming.h;
        applied.push(k);
      } else {
        // Local changed since last sync (or no shared base, both populated) -> ask.
        conflicts.push({key: k, remoteValue: incoming.v, remoteHash: incoming.h});
      }
    }
    if (initDone && dev.initRole === 'target' && dev.initPending) {
      // Clone complete: resume normal bidirectional sync from the shared base.
      this.upsertFriend({ ...dev, initPending: false });
      await this.persistFriends();
      this.notify();
      this.emitSyncCloneDone(sender.peerId);
    }
    if (applied.length || (initDone && cloning)) {
      await store.set(SYNC_STATE_KEY, this.lastHashes);
      this.emitSyncApplied();
    }
    if (conflicts.length) {
      this.pendingConflicts.set(sender.peerId, conflicts);
      this.syncConflictListeners.forEach(fn => {
        try {
          fn({peerId: sender.peerId, deviceName: dev.displayName, keys: conflicts.map(c => c.key)});
        } catch {}
      });
    }
  }

  // Resolve a pending conflict batch: keep this device's data or the other's.
  async resolveConflict(peerId: string, keep: 'mine' | 'theirs'): Promise<void> {
    const conflicts = this.pendingConflicts.get(peerId);
    if (!conflicts) return;
    if (keep === 'theirs') {
      for (const c of conflicts) {
        await AsyncStorage.setItem(c.key, c.remoteValue);
        this.lastHashes[c.key] = c.remoteHash;
      }
      this.emitSyncApplied();
    } else {
      const push: Record<string, {v: string; h: string}> = {};
      for (const c of conflicts) {
        const localRaw = await AsyncStorage.getItem(c.key);
        if (localRaw != null) {
          const h = contentHash(localRaw);
          this.lastHashes[c.key] = h;
          push[c.key] = {v: localRaw, h};
        }
      }
      try {
        await this.sendTo(peerId, {t: 'sync', keys: push});
      } catch {}
    }
    await store.set(SYNC_STATE_KEY, this.lastHashes);
    this.pendingConflicts.delete(peerId);
  }

  isFriendOnline(peerId: string): boolean {
    return this.online.has(peerId);
  }
}

export const NetworkManager = new NetworkManagerImpl();
