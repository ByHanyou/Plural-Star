import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { saveAvatar, saveBannerFromBase64, mirrorThumbDataUri } from '../utils/mediaUtils';
import { logError } from '../utils/log';
import { store, KEYS } from '../storage';
import {
  Identity,
  FriendIdentity,
  loadOrCreateIdentity,
} from './identity';
import nacl from 'tweetnacl';
import { NodeClient, PacketReceived } from './NodeClient';
import { sealMessage, openMessage } from './crypto';
import { resolveNetwork, DEFAULT_GATEWAY_URL } from './defaultNetwork';
import { getFriendsPushToken, endFriendsActivity, getAPNsDeviceToken } from '../services/LiveActivityService';
import {
  rendezvousNamespace,
  makeRendezvousRecord,
  openRendezvousRecord,
} from './rendezvous';
import { decodeBase64, encodeBase64, decodeUTF8 } from './bytes';
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
  MAX_NOTIF_FRIENDS,
  FriendNotifyLevel,
  friendNotifyLevel,
  MirrorFeature,
  MirrorMember,
  MirrorCacheEntry,
  MIRROR_CACHE_PREFIX,
  MIRROR_SERVED_KEY,
  PrivacyBucket,
  PrivacyScope,
  PRIVACY_BUCKETS_KEY,
} from './types';

const SYNC_DEBOUNCE_MS = 8000;
const SYNC_MIN_INTERVAL_MS = 8000;
const SYNC_MSG_BUDGET = 64 * 1024;
const SYNC_CHUNK_SIZE = 48 * 1024;
const SYNC_PACE_MS = 300;
const SYNC_MAX_PARTS = 4096;
const MIRROR_MEDIA_MAX = 600 * 1024;

const SYNC_EXCLUDE = new Set(SYNC_EXCLUDE_KEYS);

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

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

const contentHash = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
};

const canonicalForSync = (s: string): string =>
  s
    .replace(/file:\/\/[^"\\]*\/Documents\//g, 'file:///Documents/')
    .replace(/(file:[^"\\]*?)\?t=\d+/g, '$1');

const syncHash = (s: string): string => contentHash(canonicalForSync(s));

const HASH_YIELD_STEP = 262144;

const syncHashAsync = async (s: string): Promise<string> => {
  const c = canonicalForSync(s);
  let h = 0x811c9dc5;
  for (let off = 0; off < c.length; off += HASH_YIELD_STEP) {
    const end = Math.min(off + HASH_YIELD_STEP, c.length);
    for (let i = off; i < end; i++) {
      h ^= c.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    if (end < c.length) await new Promise<void>(r => setTimeout(r, 0));
  }
  return (h >>> 0).toString(16);
};

const hashAllAsync = async (snap: Record<string, string>): Promise<Record<string, string>> => {
  const out: Record<string, string> = {};
  let n = 0;
  for (const k in snap) {
    out[k] = await syncHashAsync(snap[k]);
    if (++n % 8 === 0) await new Promise<void>(r => setTimeout(r, 0));
  }
  return out;
};

const realMemberCount = (raw: string): number => {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((m: any) => m && !m.isCustomFront && !m.deleted).length : 0;
  } catch {
    return 0;
  }
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
  private myFrontKnown = false;

  private lastHashes: Record<string, string> = {};
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPushAt = 0;
  private syncing = false;
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
    if (this.friends.length > 0) this.persistFriends().catch(() => {});
    this.persistSettings().catch(() => {});
    this.expireStaleClones();
    await this.loadMirrorServed();
    this.lastHashes = (await store.get<Record<string, string>>(SYNC_STATE_KEY, null)) || {};
    this.identity = await loadOrCreateIdentity();
    try {
      const sys = await store.get<{ name?: string }>(KEYS.system, null);
      if (sys && sys.name) this.systemName = sys.name;
    } catch {}
    AppState.addEventListener('change', s => {
      if (s === 'active') {
        this.expireStaleClones();
        store
          .get<{ name?: string }>(KEYS.system, null)
          .then(sys => {
            if (sys && sys.name) this.systemName = sys.name;
          })
          .catch(() => {});
        if (this.settings.enabled && this.client) this.client.ensureConnected();
      }
    });
    setInterval(() => this.expireStaleClones(), 60 * 1000);
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
        this.expireStaleClones();
        this.refreshOnlinePeers();
        this.republishActiveCode();
        this.resendPendingConnects();
        this.restartPendingClones();
        this.sendSyncReqs();
        this.sendFrontsToFriends();
        this.registerWithGateway().catch(() => {});
      }
    });
    client.on('packet_received', (p: PacketReceived) => this.handlePacket(p));
    client.on('peer_online', (e: any) => {
      if (e?.peer_id && e.peer_id !== this.identity?.peerId) {
        this.online.add(e.peer_id);
        const pending = this.friends.find(f => f.peerId === e.peer_id && f.status === 'entered_theirs');
        if (pending) this.sendConnectTo(pending.peerId, pending.kind, false).catch(() => {});
        const owed = this.friends.find(
          f => f.peerId === e.peer_id && f.kind === 'device' && f.status === 'accepted' && f.initRole === 'source' && f.initPending,
        );
        if (owed) this.doInitClonePush(owed.peerId).catch(() => {});
        const linked = this.friends.find(
          f => f.peerId === e.peer_id && f.kind === 'device' && f.status === 'accepted' && !f.initPending,
        );
        if (linked) this.sendSyncReqTo(linked.peerId).catch(() => {});
        const buddy = this.friends.find(f => f.peerId === e.peer_id && f.kind !== 'device' && f.status === 'accepted');
        if (buddy && this.myFrontKnown) this.sendMyFrontTo(buddy.peerId);
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

  async generateCode(kind: LinkKind = 'friend'): Promise<string> {
    if (!this.identity) this.identity = await loadOrCreateIdentity();
    const client = this.client;
    if (!client) throw new Error('network not connected');
    const code = kind === 'device' ? generateSyncCode() : generateFriendCode();
    const namespace = rendezvousNamespace(code, kind === 'device' ? 'sync' : 'friend');
    const record = makeRendezvousRecord(this.identity);
    await client.rendezvousRegister(namespace, record, RENDEZVOUS_TTL_SECONDS);
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
    } catch {}
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
    const status: Friend['status'] =
      existing?.status === 'accepted' || existing?.status === 'entered_mine' ? 'accepted' : 'entered_theirs';
    const fallbackName = kind === 'device' ? 'Device' : 'Friend';
    this.upsertFriend({
      ...this.friendFrom(id, existing?.displayName || fallbackName, status, kind),
      ...(kind === 'device' && role ? { initRole: role, initPending: true, initStartedAt: Date.now() } : {}),
    });
    await this.persistFriends();
    this.notify();

    await this.sendConnectTo(id.peerId, kind, false);
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
    const known = this.friends.find(f => f.peerId === sender.peerId);
    if (known) {
      const ed = encodeBase64(sender.edPublicKey);
      const box = encodeBase64(sender.boxPublicKey);
      if (known.edPublicKey !== ed || known.boxPublicKey !== box) {
        this.upsertFriend({ ...known, edPublicKey: ed, boxPublicKey: box });
        this.persistFriends();
      }
    }
    switch (msg.t) {
      case 'connect': {
        const existing = this.friends.find(f => f.peerId === sender.peerId);
        if (existing && existing.status === 'entered_theirs') {
          const accepted: Friend = {
            ...existing,
            status: 'accepted',
            displayName: msg.name || existing.displayName,
            peerRole: msg.role ?? existing.peerRole,
          };
          this.upsertFriend(accepted);
          if (!msg.ack) this.sendConnectTo(sender.peerId, existing.kind, true).catch(() => {});
          if (existing.kind === 'device') this.onDeviceLinkAccepted(accepted);
          else this.sendMyFrontTo(sender.peerId);
        } else if (existing && existing.status === 'accepted') {
          this.upsertFriend({ ...existing, displayName: msg.name || existing.displayName, peerRole: msg.role ?? existing.peerRole });
          if (!msg.ack) this.sendConnectTo(sender.peerId, existing.kind, true).catch(() => {});
        } else if (msg.ack) {
          break;
        } else {
          const kind = msg.kind || 'friend';
          this.upsertFriend({
            ...this.friendFrom(sender, msg.name || (kind === 'device' ? 'Device' : 'Friend'), 'entered_mine', kind),
            peerRole: msg.role,
          });
        }
        this.persistFriends();
        this.notify();
        this.registerWithGateway().catch(() => {});
        if (msg.kind !== 'device') this.refreshMirrorsFor(sender.peerId).catch(e => logError('network', e));
        break;
      }
      case 'disconnect': {
        this.friends = this.friends.filter(f => f.peerId !== sender.peerId);
        this.clearMirrorCaches(sender.peerId);
        this.persistFriends();
        this.notify();
        this.registerWithGateway().catch(() => {});
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
          this.upsertFriend({ ...existing, status: 'accepted', lastStatus: msg.status, statusUpdatedAt: Date.now() });
          this.persistFriends();
          this.notify();
          this.sendMyFrontTo(sender.peerId);
          this.registerWithGateway().catch(() => {});
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
      case 'sync_req': {
        this.handleSyncReq(sender, msg.hashes).catch(e => console.warn('[NETWORK] sync_req failed:', e));
        break;
      }
      case 'sync_chunk': {
        const dev = this.friends.find(
          f => f.peerId === sender.peerId && f.kind === 'device' && (f.status === 'accepted' || f.status === 'entered_theirs'),
        );
        if (dev) this.handleSyncChunk(sender, msg);
        break;
      }
      case 'mirror_req': {
        this.handleMirrorReq(sender.peerId, msg.feature).catch(e => console.warn('[NETWORK] mirror_req failed:', e));
        break;
      }
      case 'mirror': {
        const fr = this.friends.find(f => f.peerId === sender.peerId && f.kind !== 'device' && f.status === 'accepted');
        if (fr) this.handleMirror(sender, msg).catch(e => console.warn('[NETWORK] mirror failed:', e));
        break;
      }
      case 'mirror_media': {
        const fr = this.friends.find(f => f.peerId === sender.peerId && f.kind !== 'device' && f.status === 'accepted');
        if (fr) this.handleMirrorMedia(sender, msg);
        break;
      }
      case 'ping':
        break;
    }
  }

  private async sendTo(recipientPeerId: string, msg: NetMessage): Promise<void> {
    const self = this.identity;
    const client = this.client;
    if (!self || !client) throw new Error('network not connected');
    const friend = this.friends.find(f => f.peerId === recipientPeerId) || null;
    if (!friend) throw new Error('no public key for recipient');
    const payload = sealMessage(self, decodeBase64(friend.boxPublicKey), msg);
    await client.send(recipientPeerId, payload);
  }

  private async sendConnectTo(peerId: string, kind: LinkKind, ack: boolean): Promise<void> {
    const name = kind === 'device' ? deviceLabel() : this.systemName;
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

  private resendPendingConnects(): void {
    for (const f of this.friends) {
      const pending = f.status === 'entered_theirs';
      const deviceRefresh = f.kind === 'device' && f.status === 'accepted';
      const friendRefresh = f.kind !== 'device' && f.status === 'accepted';
      if (pending || deviceRefresh) {
        this.sendConnectTo(f.peerId, f.kind, false).catch(() => {});
      } else if (friendRefresh) {
        this.sendConnectTo(f.peerId, f.kind, true).catch(() => {});
      }
    }
  }

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
    }
    this.friends = this.friends.filter(f => f.peerId !== peerId);
    this.clearMirrorCaches(peerId);
    await this.persistFriends();
    this.notify();
    this.registerWithGateway().catch(() => {});
  }

  async sendDM(peerId: string, body: string): Promise<void> {
    await this.sendTo(peerId, { t: 'dm', body, ts: Date.now() });
  }

  async setFriendNotifyLevel(peerId: string, level: FriendNotifyLevel): Promise<void> {
    const f = this.friends.find(x => x.peerId === peerId);
    if (!f) return;
    if (level === 'full') {
      const pinned = this.friends.filter(x => friendNotifyLevel(x) === 'full' && x.peerId !== peerId).length;
      if (pinned >= MAX_NOTIF_FRIENDS) return;
    }
    this.upsertFriend({ ...f, notifyLevel: level, showInNotification: level === 'full' });
    await this.persistFriends();
    this.notify();
    this.registerWithGateway().catch(() => {});
  }

  private gatewayFetch(path: string, body: Record<string, unknown>): Promise<unknown> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('gateway timeout')), 10000),
    );
    return Promise.race([
      fetch(`${DEFAULT_GATEWAY_URL}${path}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
      }),
      timeout,
    ]);
  }

  private async announceFrontToGateway(): Promise<void> {
    const self = this.identity;
    if (!self || !this.settings.enabled) return;
    const fronters = (this.myFront?.fronters || '').slice(0, 120);
    const startTime = this.myFront?.startTime || 0;
    const name = (this.systemName || '').slice(0, 64);
    const ts = Date.now();
    const signed = `psgw-front|${self.peerId}|${ts}|${fronters}|${startTime}|${name}`;
    const sig = nacl.sign.detached(decodeUTF8(signed), self.edSecretKey);
    try {
      await this.gatewayFetch('/gw/front', {
        peer_id: self.peerId,
        ed_pub: encodeBase64(self.edPublicKey),
        sig: encodeBase64(sig),
        ts,
        fronters,
        start_time: startTime,
        name,
      });
    } catch {}
  }

  private gatewayEverRegistered = false;

  private friendsActivityLive = false;

  private async registerWithGateway(): Promise<void> {
    if (Platform.OS !== 'ios') return;
    const self = this.identity;
    if (!self || !this.settings.enabled) return;
    const accepted = this.friends.filter(f => f.kind !== 'device' && f.status === 'accepted');
    const watch = accepted.filter(f => friendNotifyLevel(f) !== 'off').map(f => f.peerId).sort();
    const pinned = accepted
      .filter(f => friendNotifyLevel(f) === 'full')
      .map(f => f.peerId)
      .sort();
    if (pinned.length === 0 && this.friendsActivityLive) {
      endFriendsActivity().catch(() => {});
      this.friendsActivityLive = false;
    }
    if (watch.length === 0) {
      if (!this.gatewayEverRegistered) return;
      this.gatewayEverRegistered = false;
    }
    const token = pinned.length > 0 ? (await getFriendsPushToken()) || '' : '';
    if (token) this.friendsActivityLive = true;
    const deviceToken = watch.length > 0 ? (await getAPNsDeviceToken()) || '' : '';
    if (watch.length > 0 && (token || deviceToken)) this.gatewayEverRegistered = true;
    const env = __DEV__ ? 'sandbox' : 'prod';
    const ts = Date.now();
    const signed = `psgw-register|${self.peerId}|${ts}|${env}|${token}|${deviceToken}|${watch.join(',')}|${pinned.join(',')}`;
    const sig = nacl.sign.detached(decodeUTF8(signed), self.edSecretKey);
    try {
      await this.gatewayFetch('/gw/register', {
        peer_id: self.peerId,
        ed_pub: encodeBase64(self.edPublicKey),
        sig: encodeBase64(sig),
        ts,
        env,
        activity_token: token,
        device_token: deviceToken,
        watch,
        pinned,
      });
    } catch {}
  }

  async updateMyFront(front: any, members: Member[]): Promise<void> {
    this.myFront = buildFrontShare(front, members);
    this.myFrontKnown = true;
    this.announceFrontToGateway().catch(() => {});
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

  private sendFrontsToFriends(): void {
    if (!this.myFrontKnown) return;
    for (const f of this.friends) {
      if (f.kind === 'device' || f.status !== 'accepted') continue;
      this.sendMyFrontTo(f.peerId);
    }
  }

  private mirrorBuffers: Map<string, {parts: string[]; total: number; seqs: Set<number>}> = new Map();
  private mirrorListeners: Set<(peerId: string, feature: MirrorFeature) => void> = new Set();
  private mirrorMediaTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private mirrorMediaPending: Map<string, Record<string, string>> = new Map();
  private mirrorServed: Map<string, Set<MirrorFeature>> = new Map();

  private async loadMirrorServed(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(MIRROR_SERVED_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') {
        this.mirrorServed = new Map(
          Object.entries(parsed as Record<string, MirrorFeature[]>).map(([p, f]) => [p, new Set(f)]),
        );
      }
    } catch (e) {
      logError('network', e);
    }
  }

  private async persistMirrorServed(): Promise<void> {
    try {
      const obj: Record<string, MirrorFeature[]> = {};
      this.mirrorServed.forEach((feats, peer) => {
        obj[peer] = [...feats];
      });
      await AsyncStorage.setItem(MIRROR_SERVED_KEY, JSON.stringify(obj));
    } catch (e) {
      logError('network', e);
    }
  }

  private markMirrorServed(peerId: string, feature: MirrorFeature): void {
    const set = this.mirrorServed.get(peerId) || new Set<MirrorFeature>();
    if (set.has(feature)) return;
    set.add(feature);
    this.mirrorServed.set(peerId, set);
    this.persistMirrorServed().catch(() => {});
  }

  async refreshMirrorsFor(peerId: string): Promise<void> {
    const feats = this.mirrorServed.get(peerId);
    if (!feats || feats.size === 0) return;
    for (const feat of [...feats]) {
      await this.handleMirrorReq(peerId, feat, true).catch(e => logError('network', e));
    }
  }

  refreshAllMirrors(): void {
    for (const f of this.friends) {
      if (f.kind === 'device' || f.status !== 'accepted') continue;
      this.refreshMirrorsFor(f.peerId).catch(e => logError('network', e));
    }
  }

  onMirrorUpdated(fn: (peerId: string, feature: MirrorFeature) => void): () => void {
    this.mirrorListeners.add(fn);
    return () => this.mirrorListeners.delete(fn);
  }

  private notifyMirror(peerId: string, feature: MirrorFeature): void {
    this.mirrorListeners.forEach(fn => {
      try {
        fn(peerId, feature);
      } catch {}
    });
  }

  private mirrorCacheKey(peerId: string, feature: MirrorFeature): string {
    return `${MIRROR_CACHE_PREFIX}${feature}:${peerId}`;
  }

  private mirrorMediaKey(peerId: string, feature: MirrorFeature, memberId: string): string {
    return `${MIRROR_CACHE_PREFIX}media:${feature}:${peerId}:${memberId}`;
  }

  private async loadMirrorMedia(peerId: string, feature: MirrorFeature, ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    const out: Record<string, string> = {};
    const prefix = this.mirrorMediaKey(peerId, feature, '');
    const keys = ids.map(id => this.mirrorMediaKey(peerId, feature, id));
    try {
      const found = await AsyncStorage.getMany(keys);
      for (const key in found) {
        const val = found[key];
        if (!val) continue;
        out[key.slice(prefix.length)] = val;
      }
    } catch (e) {
      logError('network', e);
    }
    return out;
  }

  async loadMirror(peerId: string, feature: MirrorFeature): Promise<MirrorCacheEntry | null> {
    let entry: MirrorCacheEntry | null = null;
    try {
      const raw = await AsyncStorage.getItem(this.mirrorCacheKey(peerId, feature));
      entry = raw ? JSON.parse(raw) : null;
    } catch (e) {
      logError('network', e);
      AsyncStorage.removeItem(this.mirrorCacheKey(peerId, feature)).catch(() => {});
      return null;
    }
    if (!entry || entry.none) return entry;
    if (feature === 'members' && Array.isArray(entry.data)) {
      const ids: string[] = [];
      for (const mm of entry.data as MirrorMember[]) {
        if (!mm?.id) continue;
        ids.push(mm.id);
        for (const cf of mm.customFields || []) {
          if (cf && cf.type === 'image' && cf.fieldId) ids.push(`${mm.id}#cf:${cf.fieldId}`);
        }
      }
      entry.media = await this.loadMirrorMedia(peerId, feature, ids);
    }
    return entry;
  }

  async requestMirror(peerId: string, feature: MirrorFeature): Promise<void> {
    await this.sendTo(peerId, { t: 'mirror_req', feature });
  }

  private async clearMirrorMedia(peerId: string, feature: MirrorFeature, keepIds?: Set<string>): Promise<void> {
    try {
      const prefix = this.mirrorMediaKey(peerId, feature, '');
      const all = await AsyncStorage.getAllKeys();
      const stale = all.filter(k => k.startsWith(prefix) && (!keepIds || !keepIds.has(k.slice(prefix.length))));
      if (stale.length > 0) await AsyncStorage.removeMany(stale);
    } catch (e) {
      logError('network', e);
    }
  }

  private clearMirrorCaches(peerId: string): void {
    for (const feat of ['members', 'groups', 'journal'] as MirrorFeature[]) {
      AsyncStorage.removeItem(this.mirrorCacheKey(peerId, feat)).catch(() => {});
      this.clearMirrorMedia(peerId, feat).catch(() => {});
      this.mirrorSentHash.delete(`${peerId}|${feat}`);
    }
    if (this.mirrorServed.delete(peerId)) this.persistMirrorServed().catch(() => {});
  }

  private effectiveScope(buckets: PrivacyBucket[], peerId: string, feature: MirrorFeature | 'customFields'): {mode: 'all' | 'select' | 'none'; ids: Set<string>} {
    const mine = buckets.filter(b => b && Array.isArray(b.friendPeerIds) && b.friendPeerIds.includes(peerId));
    const ids = new Set<string>();
    let all = false;
    let any = false;
    for (const b of mine) {
      const scope = (b as any)[feature] as PrivacyScope | undefined;
      if (!scope || scope.mode === 'none') continue;
      if (scope.mode === 'all') {
        all = true;
        any = true;
        continue;
      }
      if (scope.mode === 'select') {
        for (const id of scope.ids || []) ids.add(id);
        if ((scope.ids || []).length > 0) any = true;
      }
    }
    if (all) return {mode: 'all', ids: new Set()};
    if (!any) return {mode: 'none', ids: new Set()};
    return {mode: 'select', ids};
  }

  private async readImageDataUri(val: string): Promise<string | null> {
    if (val.startsWith('data:')) return val;
    if (!val.startsWith('file://')) return null;
    const cached = this.mediaCache.get(val);
    if (cached) return cached;
    try {
      const path = val.replace(/^file:\/\//, '').split('?')[0];
      const b64 = await ReactNativeBlobUtil.fs.readFile(path, 'base64');
      const ext = (path.split('.').pop() || 'jpg').toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const uri = `data:${mime};base64,${b64}`;
      if (this.mediaCache.size >= 80) {
        let drop = 20;
        for (const k of this.mediaCache.keys()) {
          this.mediaCache.delete(k);
          if (--drop <= 0) break;
        }
      }
      this.mediaCache.set(val, uri);
      return uri;
    } catch {
      return null;
    }
  }

  private mirrorSentHash: Map<string, string> = new Map();

  private async handleMirrorReq(peerId: string, feature: MirrorFeature, skipIfUnchanged?: boolean): Promise<void> {
    if (feature !== 'members' && feature !== 'groups' && feature !== 'journal') return;
    const fr = this.friends.find(x => x.peerId === peerId && x.kind !== 'device' && x.status === 'accepted');
    if (!fr) return;
    const gateKey = `${peerId}|${feature}`;
    let buckets: PrivacyBucket[] = [];
    try {
      const raw = await AsyncStorage.getItem(PRIVACY_BUCKETS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) buckets = parsed;
    } catch {}
    const scope = this.effectiveScope(buckets, peerId, feature);
    if (scope.mode === 'none') {
      if (skipIfUnchanged && this.mirrorSentHash.get(gateKey) === 'none') return;
      try {
        await this.sendTo(peerId, { t: 'mirror', feature, seq: 0, total: 1, data: '', none: true });
      } catch (e) {
        logError('network', e);
        return;
      }
      this.mirrorSentHash.set(gateKey, 'none');
      this.markMirrorServed(peerId, feature);
      return;
    }
    let payload = '';
    let mediaMembers: {id: string; avatar: string}[] = [];
    let cfImages: {memberId: string; fieldId: string; src: string}[] = [];
    try {
      if (feature === 'members') {
        const raw = await AsyncStorage.getItem(KEYS.members);
        const list: any[] = raw ? JSON.parse(raw) : [];
        const shared = (Array.isArray(list) ? list : [])
          .filter(m => m && !m.deleted && !m.isCustomFront && (scope.mode === 'all' || scope.ids.has(m.id)))
          .sort((a, b) => ((a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)) || String(a.name || '').localeCompare(String(b.name || '')));
        const cfScope = this.effectiveScope(buckets, peerId, 'customFields');
        let grantedDefs: any[] = [];
        if (cfScope.mode !== 'none') {
          const rawDefs = await AsyncStorage.getItem(KEYS.customFieldDefs);
          let defs: any[] = [];
          try {
            defs = rawDefs ? JSON.parse(rawDefs) : [];
          } catch {}
          grantedDefs = (Array.isArray(defs) ? defs : [])
            .filter(d => d && (cfScope.mode === 'all' || cfScope.ids.has(d.id)))
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        }
        const slim: MirrorMember[] = shared.map(m => {
          const cfs = grantedDefs
            .map(d => {
              const v = (m.customFields || []).find((x: any) => x && x.fieldId === d.id);
              if (!v || v.value === null || v.value === '') return null;
              if (d.type === 'image') {
                if (typeof v.value !== 'string' || !v.value) return null;
                cfImages.push({memberId: m.id, fieldId: d.id, src: v.value});
                return {name: d.name, value: '🖼', type: d.type, fieldId: d.id};
              }
              return {name: d.name, value: v.value, type: d.type, markdown: d.markdown || undefined, fieldId: d.id};
            })
            .filter(Boolean) as MirrorMember['customFields'];
          return {
            id: m.id,
            name: m.name || '',
            pronouns: m.pronouns || undefined,
            role: m.role || undefined,
            color: m.color || undefined,
            description: m.description || undefined,
            archived: m.archived || undefined,
            customFields: cfs && cfs.length > 0 ? cfs : undefined,
          };
        });
        payload = JSON.stringify(slim);
        mediaMembers = shared
          .filter(m => typeof m.avatar === 'string' && m.avatar)
          .map(m => ({id: m.id, avatar: m.avatar}));
      } else if (feature === 'groups') {
        const rawG = await AsyncStorage.getItem(KEYS.groups);
        const rawM = await AsyncStorage.getItem(KEYS.members);
        let allGroups: any[] = [];
        let allMembers: any[] = [];
        try {
          allGroups = rawG ? JSON.parse(rawG) : [];
        } catch {}
        try {
          allMembers = rawM ? JSON.parse(rawM) : [];
        } catch {}
        const sharedGroups = (Array.isArray(allGroups) ? allGroups : []).filter(
          g => g && (scope.mode === 'all' || scope.ids.has(g.id)),
        );
        const sharedGroupIds = new Set(sharedGroups.map(g => g.id));
        const mScope = this.effectiveScope(buckets, peerId, 'members');
        const sharedMembers = (Array.isArray(allMembers) ? allMembers : []).filter(
          m => m && !m.deleted && !m.isCustomFront && (mScope.mode === 'all' || mScope.ids.has(m.id)),
        );
        const membership: Record<string, {id: string; name: string}[]> = {};
        for (const m of sharedMembers) {
          const gids = (m.groupIds || []).filter((gid: string) => sharedGroupIds.has(gid));
          if (gids.length === 0) {
            (membership[''] = membership[''] || []).push({id: m.id, name: m.name || ''});
          } else {
            for (const gid of gids) {
              (membership[gid] = membership[gid] || []).push({id: m.id, name: m.name || ''});
            }
          }
        }
        const slimGroups = sharedGroups.map(g => ({
          id: g.id,
          name: g.name || '',
          color: g.color || undefined,
          kind: g.kind || undefined,
          parentId: g.parentId || undefined,
          sortOrder: g.sortOrder ?? undefined,
        }));
        payload = JSON.stringify({groups: slimGroups, membership});
      } else {
        const raw = await AsyncStorage.getItem(KEYS.journal);
        const list: any[] = raw ? JSON.parse(raw) : [];
        const shared = (Array.isArray(list) ? list : []).filter(
          e => e && (scope.mode === 'all' || scope.ids.has(e.id)),
        );
        payload = JSON.stringify(shared);
      }
    } catch (e) {
      console.warn('[NETWORK] mirror build failed:', e);
      return;
    }
    const pHash = await syncHashAsync(payload);
    if (skipIfUnchanged && this.mirrorSentHash.get(gateKey) === pHash) return;
    const total = Math.max(1, Math.ceil(payload.length / SYNC_CHUNK_SIZE));
    if (total > SYNC_MAX_PARTS) return;
    for (let seq = 0; seq < total; seq++) {
      const data = payload.slice(seq * SYNC_CHUNK_SIZE, (seq + 1) * SYNC_CHUNK_SIZE);
      try {
        await this.sendTo(peerId, { t: 'mirror', feature, seq, total, data });
      } catch {
        return;
      }
      if (total > 1) await sleep(SYNC_PACE_MS);
    }
    this.mirrorSentHash.set(gateKey, pHash);
    this.markMirrorServed(peerId, feature);
    for (const m of mediaMembers) {
      const uri = await mirrorThumbDataUri(m.avatar);
      if (!uri || uri.length > MIRROR_MEDIA_MAX) continue;
      try {
        await this.sendTo(peerId, { t: 'mirror_media', feature, memberId: m.id, data: uri });
      } catch (e) {
        logError('network', e);
        continue;
      }
      await sleep(SYNC_PACE_MS);
    }
    for (const ci of cfImages) {
      const uri = await mirrorThumbDataUri(ci.src, 512);
      if (!uri || uri.length > MIRROR_MEDIA_MAX) continue;
      try {
        await this.sendTo(peerId, { t: 'mirror_media', feature, memberId: `${ci.memberId}#cf:${ci.fieldId}`, data: uri });
      } catch (e) {
        logError('network', e);
        continue;
      }
      await sleep(SYNC_PACE_MS);
    }
  }

  private async handleMirror(sender: FriendIdentity, m: {feature: MirrorFeature; seq: number; total: number; data: string; none?: boolean}): Promise<void> {
    if (!m || typeof m.seq !== 'number' || typeof m.total !== 'number' || m.total < 1 || m.total > SYNC_MAX_PARTS) return;
    const id = `${sender.peerId}|${m.feature}`;
    let buf = this.mirrorBuffers.get(id);
    if (!buf || buf.total !== m.total) {
      buf = {parts: new Array(m.total).fill(''), total: m.total, seqs: new Set()};
      this.mirrorBuffers.set(id, buf);
    }
    if (m.seq < 0 || m.seq >= buf.total || buf.seqs.has(m.seq)) return;
    buf.parts[m.seq] = m.data || '';
    buf.seqs.add(m.seq);
    if (buf.seqs.size !== buf.total) return;
    this.mirrorBuffers.delete(id);
    const joined = buf.parts.join('');
    let data: any = null;
    if (!m.none && joined) {
      try {
        data = JSON.parse(joined);
      } catch {
        return;
      }
    }
    const entry: MirrorCacheEntry = {feature: m.feature, fetchedAt: Date.now(), none: !!m.none, data};
    try {
      await AsyncStorage.setItem(this.mirrorCacheKey(sender.peerId, m.feature), JSON.stringify(entry));
    } catch (e) {
      logError('network', e);
    }
    if (m.feature === 'members') {
      const keep = new Set<string>();
      if (!m.none && Array.isArray(data)) {
        for (const mm of data as MirrorMember[]) {
          if (!mm?.id) continue;
          keep.add(mm.id);
          for (const cf of mm.customFields || []) {
            if (cf && cf.type === 'image' && cf.fieldId) keep.add(`${mm.id}#cf:${cf.fieldId}`);
          }
        }
      }
      await this.clearMirrorMedia(sender.peerId, m.feature, keep);
    }
    this.notifyMirror(sender.peerId, m.feature);
  }

  private handleMirrorMedia(sender: FriendIdentity, m: {feature: MirrorFeature; memberId: string; data: string}): void {
    if (!m?.memberId || typeof m.data !== 'string' || !m.data.startsWith('data:')) return;
    const id = `${sender.peerId}|${m.feature}`;
    const pend = this.mirrorMediaPending.get(id) || {};
    pend[m.memberId] = m.data;
    this.mirrorMediaPending.set(id, pend);
    const old = this.mirrorMediaTimers.get(id);
    if (old) clearTimeout(old);
    this.mirrorMediaTimers.set(id, setTimeout(() => {
      this.mirrorMediaTimers.delete(id);
      const batch = this.mirrorMediaPending.get(id);
      this.mirrorMediaPending.delete(id);
      if (batch) this.flushMirrorMedia(sender.peerId, m.feature, batch).catch(e => console.warn('[NETWORK] mirror media failed:', e));
    }, 400));
  }

  private async flushMirrorMedia(peerId: string, feature: MirrorFeature, batch: Record<string, string>): Promise<void> {
    const prev = await this.loadMirror(peerId, feature);
    if (!prev || prev.none || !Array.isArray(prev.data)) return;
    const idsPresent = new Set((prev.data as MirrorMember[]).map(x => x?.id));
    const entries: Record<string, string> = {};
    let count = 0;
    for (const mid in batch) {
      const baseId = mid.includes('#cf:') ? mid.slice(0, mid.indexOf('#cf:')) : mid;
      if (!idsPresent.has(baseId)) continue;
      entries[this.mirrorMediaKey(peerId, feature, mid)] = batch[mid];
      count++;
    }
    if (count === 0) return;
    try {
      await AsyncStorage.setMany(entries);
    } catch (e) {
      logError('network', e);
      return;
    }
    this.notifyMirror(peerId, feature);
  }

  private onDeviceLinkAccepted(f: Friend): void {
    if (f.kind !== 'device') return;
    if (f.initRole === 'source') {
      if (f.peerRole === 'source') {
        this.failRolePairing(f);
        return;
      }
      this.doInitClonePush(f.peerId).catch(e => console.warn('[NETWORK] initial clone failed:', e));
    } else if (f.initRole === 'target') {
      if (f.peerRole !== 'source') {
        this.failRolePairing(f);
        return;
      }
    } else {
      this.notifyDataChanged();
    }
  }

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

  private acceptedDevices(): Friend[] {
    return this.friends.filter(f => f.kind === 'device' && f.status === 'accepted' && !f.initPending);
  }

  notifyDataChanged(): void {
    this.snapMemo = null;
    if (this.friends.some(f => f.kind === 'device' && f.initRole === 'target' && f.initPending)) return;
    if (!this.settings.enabled || this.acceptedDevices().length === 0) return;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.doSyncPush().catch(e => console.warn('[NETWORK] sync push failed:', e));
    }, SYNC_DEBOUNCE_MS);
  }

  private snapMemo: {p: Promise<Record<string, string>>; at: number} | null = null;

  private snapshot(): Promise<Record<string, string>> {
    if (this.snapMemo && Date.now() - this.snapMemo.at < 15000) return this.snapMemo.p;
    const memo = {p: this.buildSnapshot(), at: Date.now()};
    this.snapMemo = memo;
    memo.p.catch(() => {
      if (this.snapMemo === memo) this.snapMemo = null;
    });
    return memo.p;
  }

  private async buildSnapshot(): Promise<Record<string, string>> {
    const keys = (await AsyncStorage.getAllKeys()).filter(
      k => k.startsWith('ps:') && !SYNC_EXCLUDE.has(k) && !k.startsWith(MIRROR_CACHE_PREFIX),
    );
    const got = await AsyncStorage.getMany(keys);
    const out: Record<string, string> = {};
    for (const k in got) {
      const v = got[k];
      if (v != null) out[k] = v;
    }
    Object.assign(out, await this.mediaEntries(out[KEYS.members], out[KEYS.system]));
    return out;
  }

  private mediaCache: Map<string, string> = new Map();
  private async mediaEntries(membersRaw: string | undefined, systemRaw?: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    if (membersRaw) {
      let list: any[] = [];
      try {
        list = JSON.parse(membersRaw);
      } catch {}
      if (Array.isArray(list)) {
        for (const m of list) {
          if (!m || m.deleted) continue;
          for (const [field, kind] of [['avatar', 'av'], ['banner', 'bn']] as const) {
            const val = m[field];
            if (typeof val !== 'string' || !val) continue;
            const key = `ps:media:${kind}:${m.id}`;
            if (val.startsWith('data:')) {
              out[key] = val;
              continue;
            }
            if (!val.startsWith('file://')) continue;
            const uri = await this.readImageDataUri(val);
            if (uri) out[key] = uri;
          }
        }
      }
    }
    if (systemRaw) {
      try {
        const sys = JSON.parse(systemRaw);
        if (sys && typeof sys === 'object' && !Array.isArray(sys)) {
          for (const [field, key] of [['avatar', 'ps:media:sysav'], ['banner', 'ps:media:sysbn']] as const) {
            const val = sys[field];
            if (typeof val !== 'string' || !val) continue;
            const uri = await this.readImageDataUri(val);
            if (uri) out[key] = uri;
          }
        }
      } catch {}
    }
    return out;
  }

  private async applyMedia(key: string, dataUri: string): Promise<void> {
    if (key === 'ps:media:sysav' || key === 'ps:media:sysbn') {
      const isAv = key === 'ps:media:sysav';
      let uri: string;
      try {
        uri = isAv ? await saveAvatar('system-avatar', dataUri) : await saveBannerFromBase64('system-banner', dataUri);
      } catch {
        return;
      }
      const rawSys = await AsyncStorage.getItem(KEYS.system);
      if (!rawSys) return;
      try {
        const sys = JSON.parse(rawSys);
        if (!sys || typeof sys !== 'object' || Array.isArray(sys)) return;
        sys[isAv ? 'avatar' : 'banner'] = uri;
        const v = JSON.stringify(sys);
        await AsyncStorage.setItem(KEYS.system, v);
        this.lastHashes[KEYS.system] = syncHash(v);
      } catch {}
      return;
    }
    const m = key.match(/^ps:media:(av|bn):(.+)$/);
    if (!m) return;
    const kind = m[1];
    const memberId = m[2];
    let uri: string;
    try {
      uri = kind === 'av' ? await saveAvatar(memberId, dataUri) : await saveBannerFromBase64(memberId, dataUri);
    } catch {
      return;
    }
    const raw = await AsyncStorage.getItem(KEYS.members);
    if (!raw) return;
    try {
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return;
      const idx = list.findIndex((x: any) => x && x.id === memberId);
      if (idx < 0) return;
      list[idx][kind === 'av' ? 'avatar' : 'banner'] = uri;
      const v = JSON.stringify(list);
      await AsyncStorage.setItem(KEYS.members, v);
      this.lastHashes[KEYS.members] = syncHash(v);
    } catch {}
  }

  private frontStartTime(raw: string | null | undefined): number | null {
    if (!raw) return null;
    try {
      const f = JSON.parse(raw);
      return f && typeof f.startTime === 'number' ? f.startTime : null;
    } catch {
      return null;
    }
  }

  private preserveLocalSystemMedia(incomingRaw: string, localRaw: string | null): string {
    try {
      const inc = JSON.parse(incomingRaw);
      if (!inc || typeof inc !== 'object' || Array.isArray(inc)) return incomingRaw;
      let loc: any = null;
      try {
        loc = localRaw ? JSON.parse(localRaw) : null;
      } catch {}
      inc.avatar = loc && typeof loc === 'object' ? loc.avatar : undefined;
      inc.banner = loc && typeof loc === 'object' ? loc.banner : undefined;
      return JSON.stringify(inc);
    } catch {
      return incomingRaw;
    }
  }

  private preserveLocalMedia(incomingRaw: string, localRaw: string | null): string {
    try {
      const inc = JSON.parse(incomingRaw);
      if (!Array.isArray(inc)) return incomingRaw;
      const loc = localRaw ? JSON.parse(localRaw) : [];
      const byId = new Map((Array.isArray(loc) ? loc : []).map((x: any) => [x?.id, x]));
      for (const mm of inc) {
        if (!mm) continue;
        const lm = byId.get(mm.id);
        mm.avatar = lm?.avatar;
        mm.banner = lm?.banner;
      }
      return JSON.stringify(inc);
    } catch {
      return incomingRaw;
    }
  }

  private expireStaleClones(): void {
    const CLONE_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
    let changed = false;
    this.friends = this.friends.map(f => {
      if (f.kind === 'device' && f.initRole === 'target' && f.initPending) {
        if (!f.initStartedAt || Date.now() - f.initStartedAt > CLONE_IDLE_TIMEOUT_MS) {
          changed = true;
          return { ...f, initPending: false };
        }
      }
      return f;
    });
    if (changed) {
      this.persistFriends();
      this.notify();
    }
  }

  private sendSyncReqs(): void {
    for (const d of this.acceptedDevices()) this.sendSyncReqTo(d.peerId).catch(() => {});
  }

  private async sendSyncReqTo(peerId: string): Promise<void> {
    const snap = await this.snapshot();
    const hashes = await hashAllAsync(snap);
    await this.sendTo(peerId, {t: 'sync_req', hashes});
  }

  private async handleSyncReq(sender: FriendIdentity, theirs: Record<string, string>): Promise<void> {
    const pending = this.friends.find(f => f.peerId === sender.peerId && f.kind === 'device' && f.status === 'accepted' && f.initRole === 'target' && f.initPending);
    if (pending) {
      this.upsertFriend({ ...pending, initPending: false });
      await this.persistFriends();
      this.notify();
      this.sendSyncReqTo(sender.peerId).catch(() => {});
      return;
    }
    const dev = this.friends.find(f => f.peerId === sender.peerId && f.kind === 'device' && f.status === 'accepted' && !f.initPending);
    if (!dev || !theirs) return;
    if (this.syncing) {
      setTimeout(() => this.handleSyncReq(sender, theirs).catch(() => {}), SYNC_PACE_MS * 10);
      return;
    }
    const snap = await this.snapshot();
    const hashes = await hashAllAsync(snap);
    const diff: {k: string; v: string; h: string}[] = [];
    for (const k in snap) {
      const h = hashes[k];
      if (theirs[k] !== h) diff.push({k, v: snap[k], h});
    }
    if (diff.length === 0) return;
    this.syncing = true;
    try {
      const sendOne = async (msg: NetMessage) => {
        try {
          await this.sendTo(sender.peerId, msg);
        } catch {
          await sleep(SYNC_PACE_MS);
          try {
            await this.sendTo(sender.peerId, msg);
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
      for (const c of diff) {
        if (c.v.length > SYNC_MSG_BUDGET) {
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
      }
      await flush();
    } finally {
      this.syncing = false;
    }
  }

  private async doSyncPush(): Promise<void> {
    if (this.syncing) {
      this.notifyDataChanged();
      return;
    }
    const devices = this.acceptedDevices();
    if (devices.length === 0) return;
    const now = Date.now();
    if (now - this.lastPushAt < SYNC_MIN_INTERVAL_MS) {
      this.notifyDataChanged();
      return;
    }

    const snap = await this.snapshot();
    const hashes = await hashAllAsync(snap);
    const changed: {k: string; v: string; h: string}[] = [];
    for (const k in snap) {
      const h = hashes[k];
      if (this.lastHashes[k] !== h) changed.push({k, v: snap[k], h});
    }
    if (changed.length === 0) return;

    this.syncing = true;
    this.lastPushAt = now;
    try {
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
        this.lastHashes[c.k] = c.h;
      }
      await flush();
      await store.set(SYNC_STATE_KEY, this.lastHashes);
    } finally {
      this.syncing = false;
    }
  }

  private async doInitClonePush(peerId: string): Promise<void> {
    const dev = this.friends.find(f => f.peerId === peerId && f.kind === 'device' && f.status === 'accepted');
    if (!dev || dev.initRole !== 'source' || !dev.initPending) return;
    if (!this.online.has(peerId)) return;
    if (this.syncing) {
      setTimeout(() => this.doInitClonePush(peerId).catch(() => {}), SYNC_MIN_INTERVAL_MS);
      return;
    }
    this.syncing = true;
    try {
      const snap = await this.snapshot();
      const sendOne = async (msg: NetMessage) => {
        try {
          await this.sendTo(peerId, msg);
        } catch {
          await sleep(SYNC_PACE_MS);
          try {
            await this.sendTo(peerId, msg);
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
        await sendOne({t: 'sync', keys: payload, init: true});
      };

      for (const k in snap) {
        const v = snap[k];
        const h = await syncHashAsync(v);
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
        this.lastHashes[k] = h;
      }
      await flush();
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
    this.snapMemo = null;
    let dev = this.friends.find(f => f.peerId === sender.peerId && f.kind === 'device');
    if (!dev || dev.status === 'entered_mine') return;
    if (dev.status === 'entered_theirs') {
      dev = { ...dev, status: 'accepted' };
      this.upsertFriend(dev);
      await this.persistFriends();
      this.notify();
    }
    const cloning = init && dev.initRole === 'target';
    if (cloning && dev.initPending) {
      this.upsertFriend({ ...dev, initStartedAt: Date.now() });
    }
    if (!init && dev.initRole === 'target' && dev.initPending) {
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
      if (k.startsWith('ps:media:')) {
        if (this.lastHashes[k] !== incoming.h) {
          await this.applyMedia(k, incoming.v);
          this.lastHashes[k] = incoming.h;
          applied.push(k);
        }
        continue;
      }
      const localRaw = await AsyncStorage.getItem(k);
      if (k === KEYS.front && !cloning) {
        const incT = this.frontStartTime(incoming.v);
        const locT = this.frontStartTime(localRaw);
        if (incT != null && locT != null && incT < locT) continue;
      }
      const localHash = localRaw != null ? syncHash(localRaw) : '__absent__';
      const base = this.lastHashes[k];
      if (localHash === incoming.h) {
        this.lastHashes[k] = incoming.h;
        continue;
      }
      if (localRaw != null && canonicalForSync(localRaw) === canonicalForSync(incoming.v)) {
        this.lastHashes[k] = localHash;
        continue;
      }
      if (k === KEYS.customFieldDefs && !cloning && localRaw != null) {
        const res = this.mergeCustomFieldDefs(localRaw, incoming.v);
        if (res) {
          await AsyncStorage.setItem(k, res.merged);
          this.lastHashes[k] = syncHash(res.merged);
          applied.push(k);
          await this.remapMemberFieldIds(res.remap);
          continue;
        }
      }
      const writeValue = async () => {
        if (k === KEYS.members) {
          const v = this.preserveLocalMedia(incoming.v, localRaw);
          await AsyncStorage.setItem(k, v);
          this.lastHashes[k] = syncHash(v);
        } else if (k === KEYS.system) {
          const v = this.preserveLocalSystemMedia(incoming.v, localRaw);
          await AsyncStorage.setItem(k, v);
          this.lastHashes[k] = syncHash(v);
        } else {
          await AsyncStorage.setItem(k, incoming.v);
          this.lastHashes[k] = incoming.h;
        }
        applied.push(k);
      };
      if (cloning) {
        await writeValue();
        continue;
      }
      if (k === KEYS.members && localRaw != null && realMemberCount(incoming.v) === 0 && realMemberCount(localRaw) > 0) {
        conflicts.push({key: k, remoteValue: incoming.v, remoteHash: incoming.h});
        continue;
      }
      const noConflict = localRaw == null || (base !== undefined && localHash === base);
      if (noConflict) {
        await writeValue();
      } else {
        conflicts.push({key: k, remoteValue: incoming.v, remoteHash: incoming.h});
      }
    }
    if (initDone && dev.initRole === 'target' && dev.initPending) {
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

  private mergeCustomFieldDefs(localRaw: string | null, incomingRaw: string): {merged: string; remap: Record<string, string>} | null {
    try {
      const localList: any[] = localRaw ? JSON.parse(localRaw) : [];
      const incomingList: any[] = JSON.parse(incomingRaw);
      if (!Array.isArray(localList) || !Array.isArray(incomingList)) return null;
      const nameKey = (d: any) => String(d?.name || '').trim().toLowerCase();
      const remap: Record<string, string> = {};
      const merged = localList.filter(d => d && d.id);
      const byName = new Map<string, any>();
      for (const d of merged) { if (nameKey(d)) byName.set(nameKey(d), d); }
      for (const d of incomingList) {
        if (!d || !d.id || !nameKey(d)) continue;
        const ex = byName.get(nameKey(d));
        if (!ex) {
          byName.set(nameKey(d), d);
          merged.push(d);
          continue;
        }
        if (ex.id === d.id) continue;
        if (String(d.id) < String(ex.id)) {
          remap[ex.id] = d.id;
          const idx = merged.findIndex(x => x.id === ex.id);
          if (idx >= 0) merged[idx] = d;
          byName.set(nameKey(d), d);
        } else {
          remap[d.id] = ex.id;
        }
      }
      const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
      merged.sort((a, b) =>
        ((a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)) ||
        cmp(String(a.name || ''), String(b.name || '')) ||
        cmp(String(a.id), String(b.id)));
      return {merged: JSON.stringify(merged), remap};
    } catch {
      return null;
    }
  }

  private async remapMemberFieldIds(remap: Record<string, string>): Promise<void> {
    if (Object.keys(remap).length === 0) return;
    try {
      const raw = await AsyncStorage.getItem(KEYS.members);
      if (!raw) return;
      const list: any[] = JSON.parse(raw);
      if (!Array.isArray(list)) return;
      let changed = false;
      for (const m of list) {
        if (!m || !Array.isArray(m.customFields) || m.customFields.length === 0) continue;
        const kept = new Set(m.customFields.filter((c: any) => c && !remap[c.fieldId]).map((c: any) => c.fieldId));
        const next: any[] = [];
        let mChanged = false;
        for (const c of m.customFields) {
          if (!c) continue;
          const target = remap[c.fieldId];
          if (!target) { next.push(c); continue; }
          mChanged = true;
          if (kept.has(target)) continue;
          next.push({...c, fieldId: target});
          kept.add(target);
        }
        if (mChanged) {
          m.customFields = next;
          changed = true;
        }
      }
      if (changed) {
        const out = JSON.stringify(list);
        await AsyncStorage.setItem(KEYS.members, out);
        this.lastHashes[KEYS.members] = syncHash(out);
      }
    } catch (e) {
      console.warn('[NETWORK] field-id remap failed:', e);
    }
  }

  async resolveConflict(peerId: string, keep: 'mine' | 'theirs'): Promise<void> {
    const conflicts = this.pendingConflicts.get(peerId);
    if (!conflicts) return;
    if (keep === 'theirs') {
      for (const c of conflicts) {
        if (c.key === KEYS.members) {
          const localRaw = await AsyncStorage.getItem(c.key);
          const v = this.preserveLocalMedia(c.remoteValue, localRaw);
          await AsyncStorage.setItem(c.key, v);
          this.lastHashes[c.key] = syncHash(v);
        } else if (c.key === KEYS.system) {
          const localRaw = await AsyncStorage.getItem(c.key);
          const v = this.preserveLocalSystemMedia(c.remoteValue, localRaw);
          await AsyncStorage.setItem(c.key, v);
          this.lastHashes[c.key] = syncHash(v);
        } else {
          await AsyncStorage.setItem(c.key, c.remoteValue);
          this.lastHashes[c.key] = c.remoteHash;
        }
      }
      this.emitSyncApplied();
    } else {
      const push: Record<string, {v: string; h: string}> = {};
      for (const c of conflicts) {
        const localRaw = await AsyncStorage.getItem(c.key);
        if (localRaw != null) {
          const h = syncHash(localRaw);
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
