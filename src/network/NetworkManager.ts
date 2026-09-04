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
  getDeviceSubId,
  getDeviceIdentity,
  resetIdentityCache,
  IDENTITY_STORAGE_KEY,
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
import { generateFriendCode, generateSyncCode, Member, allRelationshipTypes, nameCompare } from '../utils';
import { buildFrontShare, gatewayFrontToShare } from './frontShare';
import {
  Friend,
  FrontShare,
  NetMessage,
  NetworkSettings,
  ConnStatus,
  RENDEZVOUS_TTL_SECONDS,
  FRIENDS_STORAGE_KEY,
  FriendTombstone,
  FRIEND_TOMBSTONES_KEY,
  FRIEND_TOMBSTONE_TTL_MS,
  FRIEND_TOMBSTONE_CAP,
  NETWORK_SETTINGS_KEY,
  SYNC_EXCLUDE_KEYS,
  SYNC_STATE_KEY,
  GW_REGISTERED_KEY,
  FRONT_CLEARED_KEY,
  PROTO_VERSION,
  MAX_NOTIF_FRIENDS,
  FriendNotifyLevel,
  friendNotifyLevel,
  MirrorFeature,
  MirrorMember,
  MirrorSystemProfile,
  MirrorCacheEntry,
  MIRROR_CACHE_PREFIX,
  MIRROR_SERVED_KEY,
  MIRROR_SYSTEM_AVATAR_ID,
  MIRROR_SYSTEM_BANNER_ID,
  PENDING_FRONTS_KEY,
  PrivacyBucket,
  PrivacyScope,
  PRIVACY_BUCKETS_KEY,
} from './types';

const SYNC_DEBOUNCE_MS = 8000;
const MIRROR_DEBOUNCE_MS = 10000;
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
    return Array.isArray(list) ? list.filter((m: any) => m && !m.isCustomFront && !m.isFacet && !m.deleted).length : 0;
  } catch {
    return 0;
  }
};

const emptyListOverPopulated = (localRaw: string, incomingRaw: string): boolean => {
  try {
    const inc = JSON.parse(incomingRaw);
    if (!Array.isArray(inc) || inc.length > 0) return false;
    const loc = JSON.parse(localRaw);
    return Array.isArray(loc) && loc.length > 0;
  } catch {
    return false;
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
  private myFrontAt = 0;
  private pendingFrontReqs: Set<string> = new Set();
  private subId = '';

  private lastHashes: Record<string, string> = {};
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private mirrorTimer: ReturnType<typeof setTimeout> | null = null;
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
      friends: this.friends.filter(f => f.kind !== 'device')
        .sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || (a.addedAt - b.addedAt)),
      devices: this.friends.filter(f => f.kind === 'device'),
      onlinePeers: this.identity && this.status === 'online'
        ? Array.from(new Set([...this.online, this.identity.peerId]))
        : Array.from(this.online),
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

  private applyingSiblingFriends = false;

  private friendTombstones: FriendTombstone[] = [];
  private notFriendsSentAt: Map<string, number> = new Map();

  private async persistFriends(): Promise<void> {
    await store.set(FRIENDS_STORAGE_KEY, this.friends);
    if (!this.applyingSiblingFriends) this.pushFriendsToSiblings();
  }

  private pruneTombstones(): void {
    const cutoff = Date.now() - FRIEND_TOMBSTONE_TTL_MS;
    this.friendTombstones = this.friendTombstones
      .filter(tb => tb && typeof tb.peerId === 'string' && tb.removedAt > cutoff)
      .sort((a, b) => b.removedAt - a.removedAt)
      .slice(0, FRIEND_TOMBSTONE_CAP);
  }

  private async persistTombstones(): Promise<void> {
    this.pruneTombstones();
    await store.set(FRIEND_TOMBSTONES_KEY, this.friendTombstones);
  }

  private tombstoneFor(peerId: string): FriendTombstone | undefined {
    return this.friendTombstones.find(tb => tb.peerId === peerId);
  }

  private setTombstone(peerId: string, removedAt: number): void {
    this.friendTombstones = this.friendTombstones.filter(tb => tb.peerId !== peerId);
    this.friendTombstones.push({ peerId, removedAt });
  }

  private clearTombstone(peerId: string): void {
    const before = this.friendTombstones.length;
    this.friendTombstones = this.friendTombstones.filter(tb => tb.peerId !== peerId);
    if (this.friendTombstones.length !== before) this.persistTombstones().catch(() => {});
  }

  private siblingDevices(): Friend[] {
    const self = this.identity;
    if (!self) return [];
    return this.friends.filter(
      f => f.kind === 'device' && f.status === 'accepted' && !f.initPending && f.peerId === self.peerId,
    );
  }

  private pushFriendsToSiblings(): void {
    const sibs = this.siblingDevices();
    if (sibs.length === 0) return;
    const payload = this.friends.filter(f => f.kind !== 'device');
    for (const s of sibs) {
      this.sendTo(s.peerId, {t: 'friends_push', friends: payload, removed: this.friendTombstones}).catch(() => {});
    }
  }

  private async mergeSiblingFriends(incoming: Friend[], removed?: FriendTombstone[]): Promise<void> {
    if (!Array.isArray(incoming)) return;
    const byId = new Map(this.friends.map(f => [f.peerId, f]));
    let changed = false;
    if (Array.isArray(removed)) {
      for (const tb of removed) {
        if (!tb || typeof tb.peerId !== 'string' || typeof tb.removedAt !== 'number') continue;
        const mine = byId.get(tb.peerId);
        const mineAt = mine ? (mine.statusUpdatedAt ?? mine.addedAt ?? 0) : 0;
        if (mine && mine.kind !== 'device' && tb.removedAt > mineAt) {
          this.friends = this.friends.filter(f => f.peerId !== tb.peerId);
          byId.delete(tb.peerId);
          this.clearMirrorCaches(tb.peerId);
          changed = true;
        }
        const local = this.tombstoneFor(tb.peerId);
        if ((!mine || tb.removedAt > mineAt) && (!local || tb.removedAt > local.removedAt)) {
          this.setTombstone(tb.peerId, tb.removedAt);
        }
      }
      this.persistTombstones().catch(() => {});
    }
    for (const inc of incoming) {
      if (!inc || typeof inc.peerId !== 'string' || !inc.peerId) continue;
      if (inc.kind === 'device') continue;
      if (this.identity && inc.peerId === this.identity.peerId) continue;
      const mine = byId.get(inc.peerId);
      const incAt0 = inc.statusUpdatedAt ?? inc.addedAt ?? 0;
      const tb = this.tombstoneFor(inc.peerId);
      if (tb && tb.removedAt >= incAt0) continue;
      if (tb) this.clearTombstone(inc.peerId);
      if (!mine) {
        this.friends.push(inc);
        byId.set(inc.peerId, inc);
        changed = true;
        continue;
      }
      if (mine.kind === 'device') continue;
      const mineAt = mine.statusUpdatedAt ?? mine.addedAt ?? 0;
      const incAt = inc.statusUpdatedAt ?? inc.addedAt ?? 0;
      if (incAt <= mineAt) continue;
      const merged: Friend = {
        ...mine,
        ...inc,
        showInNotification: mine.showInNotification,
        notifyLevel: mine.notifyLevel,
      };
      this.upsertFriend(merged);
      changed = true;
    }
    if (!changed) return;
    this.applyingSiblingFriends = true;
    try {
      await this.persistFriends();
    } finally {
      this.applyingSiblingFriends = false;
    }
    this.notify();
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
    this.friendTombstones = (await store.get<FriendTombstone[]>(FRIEND_TOMBSTONES_KEY, null)) || [];
    this.pruneTombstones();
    this.subId = await getDeviceSubId();
    await this.loadPendingFronts();
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
        this.flushPendingFronts();
        this.requestFriendFronts();
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
        if (buddy && this.myFrontKnown) this.deliverPendingFront(buddy.peerId).catch(() => {});
        if (buddy) this.requestFrontFrom(buddy.peerId);
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
    if (id.peerId === self.peerId) {
      const mine = this.active[kind]?.code;
      const isReallyMine = kind !== 'device' || (!!mine && mine.toUpperCase() === code.toUpperCase());
      if (isReallyMine) throw new Error('that is your own code');
    }

    const existing = this.friends.find(f => f.peerId === id.peerId);
    if (kind !== 'device') this.clearTombstone(id.peerId);
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
    if (opened.dev && this.subId && opened.dev === this.subId) return;
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

  private maybeSendNotFriends(sender: FriendIdentity): void {
    const self = this.identity;
    const client = this.client;
    if (!self || !client) return;
    const last = this.notFriendsSentAt.get(sender.peerId) || 0;
    if (Date.now() - last < 60 * 60 * 1000) return;
    this.notFriendsSentAt.set(sender.peerId, Date.now());
    try {
      const payload = sealMessage(self, sender.boxPublicKey, { t: 'not_friends' }, this.subId || undefined);
      client.send(sender.peerId, payload).catch(() => {});
    } catch {}
  }

  private routeMessage(sender: FriendIdentity, msg: NetMessage): void {
    const known = this.friends.find(f => f.peerId === sender.peerId);
    if (known) {
      const ed = encodeBase64(sender.edPublicKey);
      const box = encodeBase64(sender.boxPublicKey);
      const clearFlag = !!known.needsRefriend && msg.t !== 'not_friends';
      if (known.edPublicKey !== ed || known.boxPublicKey !== box || clearFlag) {
        this.upsertFriend({ ...known, edPublicKey: ed, boxPublicKey: box, ...(clearFlag ? { needsRefriend: false } : {}) });
        this.persistFriends();
        if (clearFlag) this.notify();
      }
    }
    switch (msg.t) {
      case 'connect': {
        const existing = this.friends.find(f => f.peerId === sender.peerId);
        if (existing && existing.kind !== 'device') this.clearTombstone(sender.peerId);
        if (existing && existing.status === 'entered_theirs') {
          const accepted: Friend = {
            ...existing,
            status: 'accepted',
            displayName: msg.name || existing.displayName,
            peerRole: msg.role ?? existing.peerRole,
            peerV: msg.v ?? existing.peerV,
          };
          this.upsertFriend(accepted);
          if (!msg.ack) this.sendConnectTo(sender.peerId, existing.kind, true).catch(() => {});
          if (existing.kind === 'device') this.onDeviceLinkAccepted(accepted);
          else this.sendMyFrontTo(sender.peerId);
        } else if (existing && existing.status === 'accepted') {
          const updated: Friend = { ...existing, displayName: msg.name || existing.displayName, peerRole: msg.role ?? existing.peerRole, peerV: msg.v ?? existing.peerV };
          this.upsertFriend(updated);
          if (!msg.ack) this.sendConnectTo(sender.peerId, existing.kind, true).catch(() => {});
          if (updated.kind === 'device' && updated.initPending && msg.role != null &&
              ((updated.initRole === 'source' && updated.peerRole === 'source') ||
               (updated.initRole === 'target' && updated.peerRole !== 'source'))) {
            this.failRolePairing(updated);
          }
        } else if (msg.ack) {
          break;
        } else {
          const kind = msg.kind || 'friend';
          this.upsertFriend({
            ...this.friendFrom(sender, msg.name || (kind === 'device' ? 'Device' : 'Friend'), 'entered_mine', kind),
            peerRole: msg.role,
            peerV: msg.v,
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
        const authoredAt = typeof (msg as any).at === 'number' ? (msg as any).at : 0;
        if (existing && existing.status === 'entered_theirs') {
          this.upsertFriend({
            ...existing, status: 'accepted', lastStatus: msg.status, statusUpdatedAt: Date.now(),
            ...(authoredAt > 0 ? {statusAuthoredAt: authoredAt} : {}),
          });
          this.persistFriends();
          this.notify();
          this.sendMyFrontTo(sender.peerId);
          this.registerWithGateway().catch(() => {});
        } else if (existing && existing.status === 'accepted') {
          const held = typeof existing.statusAuthoredAt === 'number' ? existing.statusAuthoredAt : 0;
          if (authoredAt > 0 && held > 0 && authoredAt < held) break;
          this.upsertFriend({
            ...existing, lastStatus: msg.status, statusUpdatedAt: Date.now(),
            ...(authoredAt > 0 ? {statusAuthoredAt: authoredAt} : {}),
          });
          this.persistFriends();
          this.notify();
        } else {
          this.maybeSendNotFriends(sender);
        }
        break;
      }
      case 'device_adopt': {
        const dev = this.friends.find(
          f => f.peerId === sender.peerId && f.kind === 'device' && f.status === 'accepted' && f.initRole === 'target',
        );
        if (!dev) break;
        this.adoptSystemIdentity(msg.identity, msg.friends).catch(e => logError('network', e));
        break;
      }
      case 'front_req': {
        const asker = this.friends.find(
          f => f.peerId === sender.peerId && f.kind !== 'device' && f.status === 'accepted',
        );
        if (asker) {
          if (this.myFrontKnown) this.sendMyFrontTo(sender.peerId);
          else this.pendingFrontReqs.add(sender.peerId);
        } else {
          this.maybeSendNotFriends(sender);
        }
        break;
      }
      case 'friends_push': {
        if (!this.identity || sender.peerId !== this.identity.peerId) break;
        this.mergeSiblingFriends(msg.friends, msg.removed).catch(e => logError('network', e));
        break;
      }
      case 'not_friends': {
        const f = this.friends.find(x => x.peerId === sender.peerId && x.kind !== 'device');
        if (f && f.status === 'accepted' && !f.needsRefriend) {
          this.upsertFriend({ ...f, needsRefriend: true });
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
        const requester = this.friends.find(
          f => f.peerId === sender.peerId && f.kind !== 'device' && f.status === 'accepted',
        );
        if (!requester) {
          this.maybeSendNotFriends(sender);
          break;
        }
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
    const payload = sealMessage(self, decodeBase64(friend.boxPublicKey), msg, this.subId || undefined);
    await client.send(recipientPeerId, payload);
  }

  private async sendConnectTo(peerId: string, kind: LinkKind, ack: boolean): Promise<void> {
    const name = kind === 'device' ? deviceLabel() : this.systemName;
    const role = kind === 'device' ? this.friends.find(f => f.peerId === peerId)?.initRole : undefined;
    const msg: NetMessage = {
      t: 'connect',
      name,
      kind,
      v: PROTO_VERSION,
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
    const removed = this.friends.find(f => f.peerId === peerId);
    this.friends = this.friends.filter(f => f.peerId !== peerId);
    if (removed && removed.kind !== 'device') {
      this.setTombstone(peerId, Date.now());
      await this.persistTombstones();
    }
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

  async moveFriend(peerId: string, dir: -1 | 1): Promise<void> {
    const list = this.friends.filter(f => f.kind !== 'device')
      .sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || (a.addedAt - b.addedAt));
    const idx = list.findIndex(f => f.peerId === peerId);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= list.length) return;
    [list[idx], list[swap]] = [list[swap], list[idx]];
    list.forEach((f, i) => this.upsertFriend({ ...f, sortOrder: i }));
    await this.persistFriends();
    this.notify();
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

  private async gatewayVisibleFront(): Promise<FrontShare | null> {
    if (!this.myFrontRaw) return this.myFront;
    const watchers = this.friends.filter(f => f.kind !== 'device' && f.status === 'accepted');
    if (watchers.length === 0) return this.myFront;
    const buckets = await this.loadPrivacyBuckets();
    const roster = this.myFrontRaw.members;
    const facetIdsAll = roster.filter(m => m.isFacet && !m.isCustomFront).map(m => m.id);
    const customFrontIdsAll = roster.filter(m => m.isCustomFront).map(m => m.id);
    const plainIdsAll = roster.filter(m => !m.isCustomFront && !m.isFacet).map(m => m.id);
    let allowed: Set<string> | null = null;
    for (const f of watchers) {
      const mIds = this.allowedMemberIdsFor(buckets, f.peerId);
      const fIds = this.allowedFacetIdsFor(buckets, f.peerId);
      const cIds = this.allowedCustomFrontIdsFor(buckets, f.peerId);
      if (mIds === null && fIds === null && cIds === null) continue;
      const eff = new Set<string>([
        ...(mIds === null ? plainIdsAll : Array.from(mIds)),
        ...(fIds === null ? facetIdsAll : Array.from(fIds)),
        ...(cIds === null ? customFrontIdsAll : Array.from(cIds)),
      ]);
      if (allowed === null) {
        allowed = eff;
      } else {
        const next = new Set<string>();
        allowed.forEach(id => { if (eff.has(id)) next.add(id); });
        allowed = next;
      }
      if (allowed.size === 0) break;
    }
    return buildFrontShare(this.myFrontRaw.front, this.myFrontRaw.members, allowed);
  }

  private async announceFrontToGateway(): Promise<void> {
    const self = this.identity;
    if (!self || !this.settings.enabled) return;
    const gwShare = await this.gatewayVisibleFront();
    const cap = (s: string | undefined) => Array.from(s || '').slice(0, 120).join('');
    const fronters = cap(gwShare?.fronters);
    const primary = cap(gwShare?.primary);
    const coFront = cap(gwShare?.coFront);
    const coConscious = cap(gwShare?.coConscious);
    const startTime = gwShare?.startTime || this.myFront?.startTime || 0;
    const name = Array.from(this.systemName || '').slice(0, 64).join('');
    const readers = this.friends
      .filter(f => f.kind !== 'device' && f.status === 'accepted')
      .map(f => f.peerId)
      .slice(0, 500);
    const contentSig = `${fronters}|${startTime}|${name}|${primary}|${coFront}|${coConscious}|${readers.join(',')}`;
    if (contentSig === this.gwAnnouncedSig) return;
    const ts = this.myFrontAt || Date.now();
    const signed = `psgw-front|${self.peerId}|${ts}|${fronters}|${startTime}|${name}|${primary}|${coFront}|${coConscious}|${readers.join(',')}`;
    const sig = nacl.sign.detached(decodeUTF8(signed), self.edSecretKey);
    try {
      const res: any = await this.gatewayFetch('/gw/front', {
        peer_id: self.peerId,
        ed_pub: encodeBase64(self.edPublicKey),
        sig: encodeBase64(sig),
        ts,
        fronters,
        start_time: startTime,
        name,
        primary,
        co_front: coFront,
        co_conscious: coConscious,
        readers,
      });
      if (res && res.ok === false) {
        const legacy = `psgw-front|${self.peerId}|${ts}|${fronters}|${startTime}|${name}`;
        await this.gatewayFetch('/gw/front', {
          peer_id: self.peerId,
          ed_pub: encodeBase64(self.edPublicKey),
          sig: encodeBase64(nacl.sign.detached(decodeUTF8(legacy), self.edSecretKey)),
          ts,
          fronters,
          start_time: startTime,
          name,
        });
      }
      this.gwAnnouncedSig = contentSig;
    } catch {}
  }

  private async fetchGatewayFronts(): Promise<void> {
    const self = this.identity;
    if (!self || !this.settings.enabled) return;
    const peers = this.friends
      .filter(f => f.kind !== 'device' && f.status === 'accepted')
      .map(f => f.peerId)
      .slice(0, 500);
    if (peers.length === 0) return;
    const ts = Date.now();
    const signed = `psgw-fronts|${self.peerId}|${ts}|${peers.join(',')}`;
    const sig = nacl.sign.detached(decodeUTF8(signed), self.edSecretKey);
    let payload: any = null;
    try {
      const res: any = await this.gatewayFetch('/gw/fronts', {
        peer_id: self.peerId,
        ed_pub: encodeBase64(self.edPublicKey),
        sig: encodeBase64(sig),
        ts,
        peers,
      });
      if (!res || res.ok !== true || typeof res.json !== 'function') return;
      payload = await res.json();
    } catch {
      return;
    }
    const fronts = payload?.fronts;
    if (!fronts || typeof fronts !== 'object') return;
    this.applyGatewayFronts(fronts);
  }

  private applyGatewayFronts(fronts: Record<string, any>): void {
    let changed = false;
    for (const f of this.friends) {
      if (f.kind === 'device' || f.status !== 'accepted') continue;
      const entry = fronts[f.peerId];
      if (!entry) continue;
      const authored = typeof entry.authored_at === 'number' ? entry.authored_at : 0;
      const held = typeof f.statusAuthoredAt === 'number' ? f.statusAuthoredAt : 0;
      if (authored > 0 && held > 0) {
        if (authored <= held) continue;
      } else if (f.lastStatus) {
        const gwStart = typeof entry.start_time === 'number' ? entry.start_time : 0;
        const heldStart = typeof f.lastStatus.startTime === 'number' ? f.lastStatus.startTime : 0;
        if (gwStart <= heldStart) continue;
      }
      const next = gatewayFrontToShare(entry, f.lastStatus);
      this.upsertFriend({
        ...f,
        lastStatus: next,
        statusUpdatedAt: Date.now(),
        ...(authored > 0 ? {statusAuthoredAt: authored} : {}),
      });
      changed = true;
    }
    if (changed) {
      this.persistFriends();
      this.notify();
    }
  }

  private gatewayEverRegistered = false;
  private gwFlagLoaded = false;
  private gwConfirmed: string | null = null;
  private gwRetry: ReturnType<typeof setTimeout> | null = null;
  private gwRetryDelay = 0;

  private friendsActivityLive = false;

  private async registerWithGateway(): Promise<void> {
    if (Platform.OS !== 'ios') return;
    const self = this.identity;
    if (!self || !this.settings.enabled) return;
    if (!this.gwFlagLoaded) {
      this.gatewayEverRegistered = (await store.get<boolean>(GW_REGISTERED_KEY, false)) === true;
      this.gwFlagLoaded = true;
    }
    const accepted = this.friends.filter(
      f => f.kind !== 'device' && f.status === 'accepted' && f.peerId !== self.peerId,
    );
    const watch = accepted.filter(f => friendNotifyLevel(f) !== 'off').map(f => f.peerId).sort();
    const pinned = accepted
      .filter(f => friendNotifyLevel(f) === 'full')
      .map(f => f.peerId)
      .sort();
    if (pinned.length === 0 && this.friendsActivityLive) {
      endFriendsActivity().catch(() => {});
      this.friendsActivityLive = false;
    }
    if (watch.length === 0 && !this.gatewayEverRegistered) return;
    const token = pinned.length > 0 ? (await getFriendsPushToken()) || '' : '';
    if (token) this.friendsActivityLive = true;
    const deviceToken = watch.length > 0 ? (await getAPNsDeviceToken()) || '' : '';
    const env = __DEV__ ? 'sandbox' : 'prod';
    const ts = Date.now();
    const gw = await getDeviceIdentity();
    const signed = `psgw-register|${gw.peerId}|${ts}|${env}|${token}|${deviceToken}|${watch.join(',')}|${pinned.join(',')}`;
    const sig = nacl.sign.detached(decodeUTF8(signed), gw.edSecretKey);
    const state = `${env}|${token}|${deviceToken}|${watch.join(',')}|${pinned.join(',')}`;
    if (state === this.gwConfirmed) return;
    try {
      await this.gatewayFetch('/gw/register', {
        peer_id: gw.peerId,
        ed_pub: encodeBase64(gw.edPublicKey),
        sig: encodeBase64(sig),
        ts,
        env,
        activity_token: token,
        device_token: deviceToken,
        watch,
        pinned,
      });
      this.gwConfirmed = state;
      this.clearGatewayRetry();
      const live = watch.length > 0 && !!(token || deviceToken);
      if (live !== this.gatewayEverRegistered) {
        this.gatewayEverRegistered = live;
        await store.set(GW_REGISTERED_KEY, live);
      }
    } catch {
      this.scheduleGatewayRetry();
    }
  }

  private clearGatewayRetry(): void {
    if (this.gwRetry) {
      clearTimeout(this.gwRetry);
      this.gwRetry = null;
    }
    this.gwRetryDelay = 0;
  }

  private scheduleGatewayRetry(): void {
    if (this.gwRetry) return;
    this.gwRetryDelay = this.gwRetryDelay ? Math.min(this.gwRetryDelay * 3, 5 * 60 * 1000) : 5000;
    this.gwRetry = setTimeout(() => {
      this.gwRetry = null;
      this.registerWithGateway().catch(() => {});
    }, this.gwRetryDelay);
  }

  private myFrontRaw: {front: any; members: Member[]} | null = null;

  private gwAnnouncedSig: string | null = null;

  private async loadPrivacyBuckets(): Promise<PrivacyBucket[]> {
    try {
      const raw = await AsyncStorage.getItem(PRIVACY_BUCKETS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }

  private allowedMemberIdsFor(buckets: PrivacyBucket[], peerId: string): Set<string> | null {
    if (!buckets.some(b => b && Array.isArray(b.friendPeerIds) && b.friendPeerIds.includes(peerId))) return null;
    const scope = this.effectiveScope(buckets, peerId, 'members');
    if (scope.mode === 'all') return null;
    if (scope.mode === 'none') return new Set();
    return scope.ids;
  }

  private allowedFacetIdsFor(buckets: PrivacyBucket[], peerId: string): Set<string> | null {
    return this.allowedKindIdsFor(buckets, peerId, 'facets');
  }

  private allowedCustomFrontIdsFor(buckets: PrivacyBucket[], peerId: string): Set<string> | null {
    return this.allowedKindIdsFor(buckets, peerId, 'customFronts');
  }

  private allowedKindIdsFor(buckets: PrivacyBucket[], peerId: string, kind: 'facets' | 'customFronts'): Set<string> | null {
    if (!buckets.some(b => b && Array.isArray(b.friendPeerIds) && b.friendPeerIds.includes(peerId))) return null;
    const mine = buckets.filter(b => b && Array.isArray(b.friendPeerIds) && b.friendPeerIds.includes(peerId));
    const ids = new Set<string>();
    let all = false;
    for (const b of mine) {
      const scope = (b[kind] ?? b.members) as PrivacyScope | undefined;
      if (!scope || scope.mode === 'none') continue;
      if (scope.mode === 'all') { all = true; continue; }
      for (const id of scope.ids || []) ids.add(id);
    }
    if (all) return null;
    return ids;
  }

  private scopedFrontFor(buckets: PrivacyBucket[], peerId: string): FrontShare | null {
    if (!this.myFrontRaw) return this.myFront;
    return buildFrontShare(this.myFrontRaw.front, this.myFrontRaw.members, this.allowedMemberIdsFor(buckets, peerId), this.allowedFacetIdsFor(buckets, peerId), this.allowedCustomFrontIdsFor(buckets, peerId));
  }

  async updateMyFront(front: any, members: Member[]): Promise<void> {
    this.myFrontRaw = {front, members};
    this.myFront = buildFrontShare(front, members);
    this.myFrontAt = Date.now();
    const wasUnknown = !this.myFrontKnown;
    this.myFrontKnown = true;
    this.announceFrontToGateway().catch(() => {});
    const buckets = await this.loadPrivacyBuckets();
    if (wasUnknown && this.pendingFrontReqs.size > 0) {
      const waiting = [...this.pendingFrontReqs];
      this.pendingFrontReqs.clear();
      for (const peerId of waiting) {
        const f = this.friends.find(x => x.peerId === peerId && x.kind !== 'device' && x.status === 'accepted');
        if (f) this.sendMyFrontTo(peerId);
      }
    }
    for (const f of this.friends) {
      if (f.status !== 'accepted' || f.kind === 'device') continue;
      let delivered = false;
      try {
        await this.sendTo(f.peerId, { t: 'front', status: this.scopedFrontFor(buckets, f.peerId), at: this.myFrontAt });
        delivered = this.isReachable(f.peerId);
      } catch {
        delivered = false;
      }
      if (!delivered) this.queuePendingFront(f.peerId);
      else this.clearPendingFront(f.peerId);
    }
    await this.persistPendingFronts();
  }

  private pendingFronts: Set<string> = new Set();

  private queuePendingFront(peerId: string): void {
    this.pendingFronts.add(peerId);
  }

  private clearPendingFront(peerId: string): void {
    this.pendingFronts.delete(peerId);
  }

  private async persistPendingFronts(): Promise<void> {
    try {
      await store.set(PENDING_FRONTS_KEY, [...this.pendingFronts]);
    } catch {}
  }

  private async loadPendingFronts(): Promise<void> {
    try {
      const saved = await store.get<string[]>(PENDING_FRONTS_KEY, []);
      this.pendingFronts = new Set(Array.isArray(saved) ? saved : []);
    } catch {}
  }

  flushPendingFronts(): void {
    if (!this.myFrontKnown) return;
    for (const f of this.friends) {
      if (f.kind === 'device' || f.status !== 'accepted') continue;
      if (!this.pendingFronts.has(f.peerId)) continue;
      this.deliverPendingFront(f.peerId).catch(() => {});
    }
  }

  private async deliverPendingFront(peerId: string): Promise<void> {
    if (!this.myFrontKnown) return;
    try {
      const buckets = await this.loadPrivacyBuckets();
      await this.sendTo(peerId, { t: 'front', status: this.scopedFrontFor(buckets, peerId), at: this.myFrontAt });
    } catch {
      return;
    }
    if (!this.isReachable(peerId)) return;
    this.clearPendingFront(peerId);
    await this.persistPendingFronts();
  }

  private async sendMyFrontTo(peerId: string): Promise<void> {
    try {
      const buckets = await this.loadPrivacyBuckets();
      await this.sendTo(peerId, { t: 'front', status: this.scopedFrontFor(buckets, peerId), at: this.myFrontAt });
    } catch {}
  }

  private async adoptSystemIdentity(
    identity: {v: number; edSecretKey: string; boxSecretKey: string},
    friends: Friend[],
  ): Promise<void> {
    if (!identity?.edSecretKey || !identity?.boxSecretKey) return;
    const previousPeerId = this.identity?.peerId;
    await getDeviceIdentity();
    await store.set(IDENTITY_STORAGE_KEY, identity);
    resetIdentityCache();
    const adopted = await loadOrCreateIdentity();
    this.identity = adopted;

    const ownDeviceLinks = this.friends.filter(f => f.kind === 'device');
    const incoming = (Array.isArray(friends) ? friends : []).filter(f => f && f.kind !== 'device');
    const merged = [...incoming];
    for (const d of ownDeviceLinks) {
      if (!merged.some(f => f.peerId === d.peerId)) merged.push(d);
    }
    this.friends = merged;
    await this.persistFriends();

    this.lastHashes = {};
    await store.set(SYNC_STATE_KEY, this.lastHashes);

    if (previousPeerId) this.online.delete(previousPeerId);
    this.notify();
    if (this.settings.enabled) await this.connect();
  }

  private async requestFrontFrom(peerId: string): Promise<void> {
    try {
      await this.sendTo(peerId, { t: 'front_req' });
    } catch {}
  }

  private lastGatewayPull = 0;

  requestFriendFronts(): void {
    for (const f of this.friends) {
      if (f.kind === 'device' || f.status !== 'accepted') continue;
      this.requestFrontFrom(f.peerId);
    }
    const now = Date.now();
    if (now - this.lastGatewayPull < 15000) return;
    this.lastGatewayPull = now;
    this.fetchGatewayFronts().catch(() => {});
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
    if (feature === 'systemProfile' && entry.data) {
      entry.media = await this.loadMirrorMedia(peerId, feature, [MIRROR_SYSTEM_AVATAR_ID, MIRROR_SYSTEM_BANNER_ID]);
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
    for (const feat of ['members', 'groups', 'journal', 'history', 'systemProfile', 'whiteboard', 'planner'] as MirrorFeature[]) {
      AsyncStorage.removeItem(this.mirrorCacheKey(peerId, feat)).catch(() => {});
      this.clearMirrorMedia(peerId, feat).catch(() => {});
      this.mirrorSentHash.delete(`${peerId}|${feat}`);
    }
    if (this.mirrorServed.delete(peerId)) this.persistMirrorServed().catch(() => {});
  }

  private effectiveScope(buckets: PrivacyBucket[], peerId: string, feature: MirrorFeature | 'customFields' | 'connections'): {mode: 'all' | 'select' | 'none'; ids: Set<string>} {
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
    if (feature !== 'members' && feature !== 'groups' && feature !== 'journal' && feature !== 'history' && feature !== 'systemProfile' && feature !== 'whiteboard' && feature !== 'planner') return;
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
    let profileImages: {id: string; src: string; maxDim: number}[] = [];
    try {
      if (feature === 'whiteboard') {
        const rawWb = await AsyncStorage.getItem(KEYS.whiteboard);
        let strokes: any[] = [];
        try {
          const parsed = rawWb ? JSON.parse(rawWb) : [];
          if (Array.isArray(parsed)) strokes = parsed;
        } catch {}
        payload = JSON.stringify(strokes);
      } else if (feature === 'planner') {
        const rawPl = await AsyncStorage.getItem(KEYS.planner);
        let appointments: any[] = [];
        let reminders: any[] = [];
        try {
          const parsed = rawPl ? JSON.parse(rawPl) : null;
          if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.appointments)) appointments = parsed.appointments;
            if (Array.isArray(parsed.reminders)) reminders = parsed.reminders;
          }
        } catch {}
        payload = JSON.stringify({
          appointments: appointments.map((a: any) => ({
            id: String(a?.id || ''),
            title: String(a?.title || ''),
            time: Number(a?.time) || 0,
            location: a?.location ? String(a.location) : undefined,
            notes: a?.notes ? String(a.notes) : undefined,
            repeat: a?.repeat ? String(a.repeat) : undefined,
            color: a?.color ? String(a.color) : undefined,
          })),
          reminders: reminders.map((r: any) => ({
            id: String(r?.id || ''),
            title: String(r?.title || ''),
            times: Array.isArray(r?.times) ? r.times.map((x: any) => String(x)) : [],
            enabled: r?.enabled !== false,
            notes: r?.notes ? String(r.notes) : undefined,
            repeat: r?.repeat ? String(r.repeat) : undefined,
          })),
        });
      } else if (feature === 'systemProfile') {
        const rawSys = await AsyncStorage.getItem(KEYS.system);
        let sys: any = {};
        try {
          sys = rawSys ? JSON.parse(rawSys) : {};
        } catch {}
        const hasAvatar = typeof sys?.avatar === 'string' && !!sys.avatar;
        const hasBanner = typeof sys?.banner === 'string' && !!sys.banner;
        payload = JSON.stringify({
          name: String(sys?.name || ''),
          description: sys?.description ? String(sys.description) : undefined,
          hasAvatar: hasAvatar || undefined,
          hasBanner: hasBanner || undefined,
        });
        if (hasAvatar) {
          profileImages.push({id: MIRROR_SYSTEM_AVATAR_ID, src: sys.avatar, maxDim: 256});
        }
        if (hasBanner) {
          profileImages.push({id: MIRROR_SYSTEM_BANNER_ID, src: sys.banner, maxDim: 512});
        }
      } else if (feature === 'members') {
        const raw = await AsyncStorage.getItem(KEYS.members);
        const list: any[] = raw ? JSON.parse(raw) : [];
        const shared = (Array.isArray(list) ? list : [])
          .filter(m => m && !m.deleted && !m.isCustomFront && !m.isFacet && (scope.mode === 'all' || scope.ids.has(m.id)))
          .sort((a, b) => ((a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)) || nameCompare(a.name, b.name));
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
        const sharedIdSet = new Set(shared.map(m => m.id));
        const nameById = new Map(shared.map(m => [m.id, String(m.name || '')]));
        const connScope = this.effectiveScope(buckets, peerId, 'connections');
        let sharedRels: any[] = [];
        let relTypeById = new Map<string, any>();
        if (connScope.mode !== 'none') {
          let rels: any[] = [];
          let types: any[] = [];
          try {
            const rawRel = await AsyncStorage.getItem(KEYS.relationships);
            rels = rawRel ? JSON.parse(rawRel) : [];
          } catch {}
          try {
            const rawTypes = await AsyncStorage.getItem(KEYS.relationshipTypes);
            types = rawTypes ? JSON.parse(rawTypes) : [];
          } catch {}
          for (const td of allRelationshipTypes(Array.isArray(types) ? types : [])) {
            if (td && td.id) relTypeById.set(td.id, td);
          }
          sharedRels = (Array.isArray(rels) ? rels : []).filter(
            r => r && sharedIdSet.has(r.fromId) && sharedIdSet.has(r.toId) && (connScope.mode === 'all' || connScope.ids.has(r.id)),
          );
        }
        const connectionsOf = (memberId: string): MirrorMember['connections'] => {
          const rows = sharedRels
            .filter(r => r.fromId === memberId || r.toId === memberId)
            .map(r => {
              const td = relTypeById.get(r.typeId);
              if (!td) return null;
              const otherId = r.fromId === memberId ? r.toId : r.fromId;
              const inverseSide = r.fromId === memberId;
              const plain = !!td.preset && !td.overridden;
              const useInverse = inverseSide && !!td.directional;
              const labelKey = plain ? `relType.${td.id}${useInverse ? 'Inverse' : ''}` : undefined;
              const label = plain
                ? ''
                : (useInverse ? (td.inverseName || td.name || '') : (td.name || ''));
              return {
                id: r.id,
                otherId,
                otherName: nameById.get(otherId) || '',
                label,
                labelKey,
                color: td.color || undefined,
                note: r.note || undefined,
              };
            })
            .filter(Boolean) as MirrorMember['connections'];
          return rows && rows.length > 0 ? rows : undefined;
        };
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
            connections: connectionsOf(m.id),
          };
        });
        payload = JSON.stringify(slim);
        mediaMembers = shared
          .filter(m => typeof m.avatar === 'string' && m.avatar)
          .map(m => ({id: m.id, avatar: m.avatar}));
        profileImages = shared
          .filter(m => typeof m.banner === 'string' && m.banner)
          .map(m => ({id: `${m.id}#banner`, src: m.banner, maxDim: 720}));
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
          m => m && !m.deleted && !m.isCustomFront && !m.isFacet && (mScope.mode === 'all' || mScope.ids.has(m.id)),
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
      } else if (feature === 'history') {
        const rawH = await AsyncStorage.getItem(KEYS.history);
        const rawM = await AsyncStorage.getItem(KEYS.members);
        let list: any[] = [];
        let allMembers: any[] = [];
        try {
          list = rawH ? JSON.parse(rawH) : [];
        } catch {}
        try {
          allMembers = rawM ? JSON.parse(rawM) : [];
        } catch {}
        const mScope = this.effectiveScope(buckets, peerId, 'members');
        const visibleIds = new Set(
          (Array.isArray(allMembers) ? allMembers : [])
            .filter(m => m && !m.deleted && (mScope.mode === 'all' || mScope.ids.has(m.id)))
            .map(m => m.id),
        );
        const keep = (ids?: string[]) => (ids || []).filter(id => visibleIds.has(id));
        const events = (Array.isArray(list) ? list : [])
          .map(ev => {
            if (!ev) return null;
            const memberIds = keep(ev.memberIds);
            const coFrontIds = keep(ev.coFrontIds);
            const coConsciousIds = keep(ev.coConsciousIds);
            if (memberIds.length === 0 && coFrontIds.length === 0 && coConsciousIds.length === 0) return null;
            return {
              ...ev,
              memberIds,
              coFrontIds: coFrontIds.length > 0 ? coFrontIds : undefined,
              coConsciousIds: coConsciousIds.length > 0 ? coConsciousIds : undefined,
            };
          })
          .filter(Boolean);
        payload = JSON.stringify(events);
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
    for (const pi of profileImages) {
      const uri = await mirrorThumbDataUri(pi.src, pi.maxDim);
      if (!uri || uri.length > MIRROR_MEDIA_MAX) continue;
      try {
        await this.sendTo(peerId, { t: 'mirror_media', feature, memberId: pi.id, data: uri });
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
    if (!buf || buf.total !== m.total || m.seq === 0) {
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
    if (m.feature === 'systemProfile') {
      const keep = new Set<string>();
      if (!m.none && data && typeof data === 'object') {
        if ((data as MirrorSystemProfile).hasAvatar) keep.add(MIRROR_SYSTEM_AVATAR_ID);
        if ((data as MirrorSystemProfile).hasBanner) keep.add(MIRROR_SYSTEM_BANNER_ID);
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
    if (!prev || prev.none) return;
    if (feature === 'systemProfile') {
      const entries: Record<string, string> = {};
      let n = 0;
      for (const mid in batch) {
        if (mid !== MIRROR_SYSTEM_AVATAR_ID && mid !== MIRROR_SYSTEM_BANNER_ID) continue;
        entries[this.mirrorMediaKey(peerId, feature, mid)] = batch[mid];
        n++;
      }
      if (n === 0) return;
      try {
        await AsyncStorage.setMany(entries);
      } catch (e) {
        logError('network', e);
        return;
      }
      this.notifyMirror(peerId, feature);
      return;
    }
    if (!Array.isArray(prev.data)) return;
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
    if (this.settings.enabled) {
      if (this.mirrorTimer) clearTimeout(this.mirrorTimer);
      this.mirrorTimer = setTimeout(() => {
        this.mirrorTimer = null;
        this.refreshAllMirrors();
      }, MIRROR_DEBOUNCE_MS);
    }
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

  private async frontClearedAt(): Promise<number | null> {
    try {
      const raw = await AsyncStorage.getItem(FRONT_CLEARED_KEY);
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }

  private async noteFrontCleared(): Promise<void> {
    try {
      await AsyncStorage.setItem(FRONT_CLEARED_KEY, String(Date.now()));
    } catch {}
  }

  private rosterDropsLiveMembers(localRaw: string, incomingRaw: string): boolean {
    try {
      const loc = JSON.parse(localRaw);
      const inc = JSON.parse(incomingRaw);
      if (!Array.isArray(loc) || !Array.isArray(inc)) return false;
      const incIds = new Set(inc.filter((m: any) => m && m.id).map((m: any) => m.id));
      for (const m of loc) {
        if (m && m.id && !m.deleted && !incIds.has(m.id)) return true;
      }
      return false;
    } catch {
      return false;
    }
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
      if (f.kind === 'device' && f.initPending) {
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
    this.retryPendingLinks();
  }

  private retryPendingLinks(): void {
    for (const f of this.friends) {
      if (f.kind !== 'device' || f.status === 'accepted') continue;
      if (!this.isReachable(f.peerId)) continue;
      this.sendConnectTo(f.peerId, 'device', false).catch(() => {});
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
      const sendOne = async (msg: NetMessage): Promise<boolean> => {
        let delivered = false;
        for (const d of devices) {
          try {
            await this.sendTo(d.peerId, msg);
            if (this.isReachable(d.peerId)) delivered = true;
          } catch {}
        }
        await sleep(SYNC_PACE_MS);
        return delivered;
      };

      let batch: Record<string, {v: string; h: string}> = {};
      let batchKeys: {k: string; h: string}[] = [];
      let size = 0;
      let advanced = false;
      const flush = async () => {
        if (Object.keys(batch).length === 0) return;
        const payload = batch;
        const sentKeys = batchKeys;
        batch = {};
        batchKeys = [];
        size = 0;
        const ok = await sendOne({t: 'sync', keys: payload});
        if (ok) {
          for (const {k, h} of sentKeys) this.lastHashes[k] = h;
          advanced = true;
        }
      };

      for (const c of changed) {
        if (c.v.length > SYNC_MSG_BUDGET) {
          await flush();
          const total = Math.ceil(c.v.length / SYNC_CHUNK_SIZE);
          let allOk = total > 0;
          for (let seq = 0; seq < total; seq++) {
            const data = c.v.slice(seq * SYNC_CHUNK_SIZE, (seq + 1) * SYNC_CHUNK_SIZE);
            const ok = await sendOne({t: 'sync_chunk', key: c.k, h: c.h, seq, total, data});
            if (!ok) allOk = false;
          }
          if (allOk) {
            this.lastHashes[c.k] = c.h;
            advanced = true;
          }
        } else {
          if (size + c.v.length > SYNC_MSG_BUDGET && Object.keys(batch).length) await flush();
          batch[c.k] = {v: c.v, h: c.h};
          batchKeys.push({k: c.k, h: c.h});
          size += c.v.length;
        }
      }
      await flush();
      if (advanced) await store.set(SYNC_STATE_KEY, this.lastHashes);
    } finally {
      this.syncing = false;
    }
  }

  private async doInitClonePush(peerId: string): Promise<void> {
    const dev = this.friends.find(f => f.peerId === peerId && f.kind === 'device' && f.status === 'accepted');
    if (!dev || dev.initRole !== 'source' || !dev.initPending) return;
    if (!this.isReachable(peerId)) return;
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
      const stored = await store.get<{v: number; edSecretKey: string; boxSecretKey: string}>(IDENTITY_STORAGE_KEY, null);
      const adoptCapable = (dev.peerV ?? 0) >= PROTO_VERSION;
      if (adoptCapable && stored?.edSecretKey && stored?.boxSecretKey) {
        await sendOne({
          t: 'device_adopt',
          identity: stored,
          friends: this.friends.filter(f => f.kind !== 'device'),
        });
        const selfNow = this.identity;
        if (selfNow) {
          this.friends = this.friends.filter(f => f.peerId !== peerId);
          if (!this.friends.some(f => f.peerId === selfNow.peerId && f.kind === 'device')) {
            this.friends.push({
              ...dev,
              peerId: selfNow.peerId,
              edPublicKey: encodeBase64(selfNow.edPublicKey),
              boxPublicKey: encodeBase64(selfNow.boxPublicKey),
              status: 'accepted',
              initPending: false,
              initRole: undefined,
              peerRole: undefined,
            });
          }
          await store.set(SYNC_STATE_KEY, this.lastHashes);
          await this.persistFriends();
          this.notify();
          this.emitSyncCloneDone(peerId);
          return;
        }
      }
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
      if (!k.startsWith('ps:')) continue;
      if (SYNC_EXCLUDE.has(k)) continue;
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
        if (incT != null && locT == null) {
          const clearedAt = await this.frontClearedAt();
          if (clearedAt != null && incT < clearedAt) continue;
        }
        if (incT == null && locT != null) await this.noteFrontCleared();
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
      if (k === KEYS.members && localRaw != null && this.rosterDropsLiveMembers(localRaw, incoming.v)) {
        conflicts.push({key: k, remoteValue: incoming.v, remoteHash: incoming.h});
        continue;
      }
      if (localRaw != null && emptyListOverPopulated(localRaw, incoming.v)) {
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
      const merged: any[] = [];
      const seenIds = new Set<string>();
      for (const d of localList) {
        if (!d || !d.id || seenIds.has(String(d.id))) continue;
        seenIds.add(String(d.id));
        merged.push(d);
      }
      const nameCounts = (list: any[]) => {
        const counts = new Map<string, number>();
        for (const d of list) {
          if (!d || !d.id) continue;
          const k = nameKey(d);
          if (!k) continue;
          counts.set(k, (counts.get(k) || 0) + 1);
        }
        return counts;
      };
      const localCounts = nameCounts(merged);
      const incomingCounts = nameCounts(incomingList);
      const byName = new Map<string, any>();
      for (const d of merged) {
        const k = nameKey(d);
        if (k && localCounts.get(k) === 1) byName.set(k, d);
      }
      for (const d of incomingList) {
        if (!d || !d.id || seenIds.has(String(d.id))) continue;
        const k = nameKey(d);
        const ex = k && incomingCounts.get(k) === 1 ? byName.get(k) : undefined;
        if (!ex) {
          seenIds.add(String(d.id));
          merged.push(d);
          continue;
        }
        if (String(d.id) < String(ex.id)) {
          remap[String(ex.id)] = String(d.id);
          const idx = merged.findIndex(x => String(x.id) === String(ex.id));
          if (idx >= 0) merged[idx] = d;
          seenIds.delete(String(ex.id));
          seenIds.add(String(d.id));
          byName.set(k, d);
        } else {
          remap[String(d.id)] = String(ex.id);
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
    return this.isReachable(peerId);
  }

  private isReachable(peerId: string): boolean {
    return peerId === this.identity?.peerId || this.online.has(peerId);
  }
}

export const NetworkManager = new NetworkManagerImpl();
