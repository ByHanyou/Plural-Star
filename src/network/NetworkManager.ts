import { KEYS, onStoreWrite } from '../storage';
import { Member } from '../utils';
import { log, logError } from '../utils/log';
import { Emitter } from '../utils/emitter';
import { CloudBridge } from '../cloud/adapter';
import { CloneService } from '../sync/clone';
import { SyncConflict, SyncRoleMismatch, SyncService } from '../sync/service';
import { SYNC_EXCLUDE } from '../sync/snapshot';
import { adapters } from './platform';
import { Connection } from './connection';
import { FriendStore, LinkKind } from './friends';
import { FrontShareService } from './fronts';
import { ShareableFront } from './frontShare';
import { Gateway } from './gateway';
import {
  Identity,
  loadOrCreateIdentity,
  getDeviceSubId,
  readIdentityReset,
  clearIdentityReset,
} from './identity';
import { MirrorCache, MirrorListener } from './mirror/cache';
import { MirrorGifs } from './mirror/gif';
import { MirrorInbound } from './mirror/request';
import { MirrorServe } from './mirror/serve';
import { SendStatus } from './NodeClient';
import { Pairing } from './pairing';
import { IncomingDM, Router } from './router';
import { resolveNetwork } from './defaultNetwork';
import {
  Friend,
  NetMessage,
  NetworkSettings,
  ConnStatus,
  NETWORK_SETTINGS_KEY,
  MAX_NOTIF_FRIENDS,
  FriendNotifyLevel,
  MirrorFeature,
  MirrorCacheEntry,
  MIRROR_CACHE_PREFIX,
} from './types';
import { friendNotifyLevel, isAcceptedDevice, isAcceptedFriend } from './friendState';

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
  identityResetAt: number | null;
}

type StateListener = (s: NetworkState) => void;
type DMListener = (dm: IncomingDM) => void;

const byFriendOrder = (a: Friend, b: Friend): number =>
  (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || (a.addedAt - b.addedAt);

class NetworkManagerImpl {
  private identity: Identity | null = null;
  private identityReset: number | null = null;
  private settings: NetworkSettings = { enabled: false };
  private systemName = '';
  private subId: string | null = null;
  private loaded = false;
  private protectedDataLocked = false;
  private cloneExpiryTimer: ReturnType<typeof setInterval> | null = null;
  private readonly stateEvents = new Emitter<[NetworkState]>('network');
  private readonly dmEvents = new Emitter<[IncomingDM]>('network');

  private readonly storage = adapters.storage;
  private readonly media = adapters.media;
  private readonly platform = adapters.platform;

  private readonly friends: FriendStore = new FriendStore(this.storage, {
    identity: () => this.identity,
    sendTo: (peerId, msg) => this.sendTo(peerId, msg),
    announceFront: () => this.gateway.announceFront().catch(e => log.debug('network', e)),
    clearMirrorCaches: peerId => this.clearMirrorCaches(peerId),
    notify: () => this.notify(),
  });

  private readonly conn: Connection = new Connection({
    identity: () => this.identity,
    subId: () => this.subId,
    settings: () => this.settings,
    friendKey: peerId => this.friends.find(peerId)?.boxPublicKey ?? null,
    notify: () => this.notify(),
    onOnline: () => this.onOnline(),
    onPeerOnline: peerId => this.onPeerOnline(peerId),
    onPeerOffline: peerId => {
      if (this.friends.find(peerId)) this.notify();
    },
    afterPeersRefreshed: () => {
      for (const f of this.friends.all()) {
        if (isAcceptedFriend(f) && this.conn.isOnline(f.peerId)) this.mirrorServe.refreshIfStale(f.peerId);
      }
    },
    route: (sender, msg) => this.router.route(sender, msg),
    onResume: () => this.pairing.resendPendingHandshakes(),
    http: (url, req, timeoutMs) => this.platform.http(url, req, timeoutMs),
  });

  private readonly fronts: FrontShareService = new FrontShareService({
    storage: this.storage,
    friends: this.friends,
    sendTo: (peerId, msg) => this.sendTo(peerId, msg),
    isReachable: peerId => this.conn.isReachable(peerId),
    announceFront: () => this.gateway.announceFront().catch(e => log.debug('network', e)),
    pullGatewayFronts: () => this.gateway.pullFronts(),
  });

  private readonly gateway: Gateway = new Gateway({
    storage: this.storage,
    platform: this.platform,
    friends: this.friends,
    identity: () => this.identity,
    settings: () => this.settings,
    systemName: () => this.systemName,
    notify: () => this.notify(),
    loadPrivacyBuckets: () => this.fronts.loadPrivacyBuckets(),
    visibleFront: buckets => this.fronts.gatewayVisibleFront(buckets),
    currentFront: () => this.fronts.current,
  });

  private readonly sync: SyncService = new SyncService({
    storage: this.storage,
    media: this.media,
    friends: this.friends,
    settings: () => this.settings,
    sendTo: (peerId, msg) => this.sendTo(peerId, msg),
    isReachable: peerId => this.conn.isReachable(peerId),
    notify: () => this.notify(),
    notifyDataChanged: () => this.notifyDataChanged(),
    afterLocalWrite: () => this.mirrorServe.invalidate(),
  });

  private readonly clone: CloneService = new CloneService({
    storage: this.storage,
    friends: this.friends,
    sync: this.sync,
    identity: () => this.identity,
    setIdentity: id => {
      this.identity = id;
    },
    settings: () => this.settings,
    sendTo: (peerId, msg) => this.sendTo(peerId, msg),
    isReachable: peerId => this.conn.isReachable(peerId),
    notify: () => this.notify(),
    notifyDataChanged: () => this.notifyDataChanged(),
    connect: () => this.connect(),
    forgetOnline: peerId => this.conn.forgetOnline(peerId),
    retryPendingLinks: () => this.pairing.retryPendingLinks(),
  });

  private readonly pairing: Pairing = new Pairing({
    identity: () => this.identity,
    ensureIdentity: () => this.ensureIdentity(),
    conn: this.conn,
    friends: this.friends,
    platform: this.platform,
    systemName: () => this.systemName,
    notify: () => this.notify(),
    sendMyFrontTo: peerId => this.fronts.sendMyFrontTo(peerId),
    onDeviceLinkAccepted: f => this.clone.onDeviceLinkAccepted(f),
    restartPendingClones: () => this.clone.restartPendingClones(),
    syncBusy: () => this.sync.busy,
  });

  private readonly mirrorCache: MirrorCache = new MirrorCache(this.storage, this.media);

  private readonly mirrorGifs: MirrorGifs = new MirrorGifs({
    media: this.media,
    cache: this.mirrorCache,
    sendTo: (peerId, msg) => this.sendTo(peerId, msg),
  });

  private readonly mirrorInbound: MirrorInbound = new MirrorInbound({
    cache: this.mirrorCache,
    gifs: this.mirrorGifs,
    sendTo: (peerId, msg) => this.sendTo(peerId, msg),
  });

  private readonly mirrorServe: MirrorServe = new MirrorServe({
    storage: this.storage,
    media: this.media,
    friends: this.friends,
    settings: () => this.settings,
    sendTo: (peerId, msg) => this.sendTo(peerId, msg),
    isReachable: peerId => this.conn.isReachable(peerId),
  });

  private readonly cloud: CloudBridge = new CloudBridge({
    storage: this.storage,
    media: this.media,
    friends: this.friends,
    sync: this.sync,
    clone: this.clone,
    settings: () => this.settings,
    afterLocalWrite: () => this.mirrorServe.invalidate(),
  });

  private readonly router: Router = new Router({
    identity: () => this.identity,
    platform: this.platform,
    friends: this.friends,
    conn: this.conn,
    pairing: this.pairing,
    fronts: this.fronts,
    gateway: this.gateway,
    sync: this.sync,
    clone: this.clone,
    mirrorServe: this.mirrorServe,
    mirrorInbound: this.mirrorInbound,
    mirrorGifs: this.mirrorGifs,
    notify: () => this.notify(),
    clearMirrorCaches: peerId => this.clearMirrorCaches(peerId),
    onDM: dm => this.dmEvents.emit(dm),
  });

  subscribe(fn: StateListener): () => void {
    const off = this.stateEvents.on(fn);
    fn(this.getState());
    return off;
  }

  onDM(fn: DMListener): () => void {
    return this.dmEvents.on(fn);
  }

  getState(): NetworkState {
    const net = resolveNetwork(this.settings);
    const friends = this.friends.all();
    const friendCode = this.pairing.activeCode('friend');
    const deviceCode = this.pairing.activeCode('device');
    return {
      enabled: this.settings.enabled,
      status: this.conn.status,
      peerId: this.identity?.peerId ?? null,
      friends: friends.filter(f => f.kind !== 'device').sort(byFriendOrder),
      devices: friends.filter(f => f.kind === 'device'),
      onlinePeers: Array.from(new Set([
        ...friends.filter(f => this.conn.isOnline(f.peerId)).map(f => f.peerId),
        ...(this.identity && this.conn.status === 'online' ? [this.identity.peerId] : []),
      ])),
      relayConfigured: !!net.relayUrl,
      activeFriendCode: friendCode?.code ?? null,
      activeFriendExpiresAt: friendCode?.expiresAt ?? null,
      activeDeviceCode: deviceCode?.code ?? null,
      activeDeviceExpiresAt: deviceCode?.expiresAt ?? null,
      identityResetAt: this.identityReset,
    };
  }

  async dismissIdentityReset(): Promise<void> {
    this.identityReset = null;
    await clearIdentityReset();
    this.notify();
  }

  private notify(): void {
    this.stateEvents.emit(this.getState());
  }

  private async ensureIdentity(): Promise<Identity> {
    return this.identity ?? (this.identity = await loadOrCreateIdentity());
  }

  private sendTo(peerId: string, msg: NetMessage): Promise<SendStatus> {
    return this.conn.sendTo(peerId, msg);
  }

  private async persistSettings(): Promise<void> {
    await this.storage.set(NETWORK_SETTINGS_KEY, this.settings);
  }

  private async loadSystemName(): Promise<void> {
    try {
      const sys = await this.storage.get<{ name?: string }>(KEYS.system, null);
      if (sys && sys.name) this.systemName = sys.name;
    } catch (e) {
      logError('network', e);
    }
  }

  async init(): Promise<void> {
    if (this.loaded) return;
    if (!(await this.platform.waitForStorage())) {
      this.protectedDataLocked = true;
      return;
    }
    this.protectedDataLocked = false;
    this.loaded = true;
    onStoreWrite(key => {
      if (!key.startsWith('ps:')) return;
      if (SYNC_EXCLUDE.has(key) || key.startsWith(MIRROR_CACHE_PREFIX)) return;
      this.notifyDataChanged();
    });
    this.settings = (await this.storage.get<NetworkSettings>(NETWORK_SETTINGS_KEY, null)) || {
      enabled: false,
    };
    await this.friends.load();
    this.subId = await getDeviceSubId();
    await this.fronts.load();
    if (this.friends.all().length > 0) this.friends.persistSoon();
    this.persistSettings().catch(e => logError('network', e));
    this.clone.expireStaleClones();
    await this.mirrorServe.load();
    await this.sync.load();
    this.identity = await loadOrCreateIdentity();
    this.identityReset = await readIdentityReset();
    await this.loadSystemName();
    this.platform.onForeground(() => {
      this.clone.expireStaleClones();
      this.loadSystemName().catch(e => logError('network', e));
      this.conn.ensureConnected();
      this.conn.resume();
    });
    if (this.cloneExpiryTimer) clearInterval(this.cloneExpiryTimer);
    this.cloneExpiryTimer = setInterval(() => {
      this.clone.expireStaleClones();
      this.pairing.keepPendingLinksAlive();
      this.sync.pruneStaleChunks();
      this.mirrorGifs.pruneStale();
    }, 60 * 1000);
    if (this.settings.enabled) await this.connect();
    else this.notify();
  }

  retryInitIfLocked(): void {
    if (this.loaded || !this.protectedDataLocked) return;
    this.init().catch(e => logError('network', e));
  }

  private async connect(): Promise<void> {
    const self = await this.ensureIdentity();
    await this.conn.connect(self);
  }

  private onOnline(): void {
    this.clone.expireStaleClones();
    this.conn.refreshOnlinePeers();
    this.pairing.republishActiveCode();
    this.pairing.resendPendingConnects();
    this.clone.restartPendingClones();
    this.sync.sendSyncReqs();
    this.fronts.flushPendingFronts();
    this.fronts.requestFriendFronts();
    this.gateway.register().catch(e => log.debug('network', e));
    this.gateway.forgetAnnounce();
    this.gateway.announceFront().catch(e => log.debug('network', e));
  }

  private onPeerOnline(peerId: string): void {
    const f = this.friends.find(peerId);
    if (!f) return;
    if (f.status === 'entered_theirs') this.pairing.sendConnectTo(peerId, f.kind, false).catch(e => log.debug('network', e));
    if (isAcceptedDevice(f)) {
      if (f.initRole === 'source' && f.initPending) this.clone.doInitClonePush(peerId).catch(e => logError('sync', e));
      if (!f.initPending) this.sync.sendSyncReqTo(peerId).catch(e => log.debug('sync', e));
    }
    if (isAcceptedFriend(f)) {
      if (this.fronts.known) this.fronts.deliverPendingFront(peerId).catch(e => log.debug('network', e));
      this.fronts.requestFrontFrom(peerId);
      this.mirrorServe.refreshIfStale(peerId);
    }
    this.notify();
  }

  async wipe(): Promise<void> {
    this.conn.reset();
    this.sync.reset();
    this.mirrorServe.reset();
    this.mirrorInbound.reset();
    this.settings = { enabled: false };
    this.friends.reset();
    this.fronts.reset();
    this.gateway.reset();
    this.identity = await loadOrCreateIdentity();
    this.subId = await getDeviceSubId();
    this.conn.setStatus('disabled');
    this.notify();
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.settings = { ...this.settings, enabled };
    await this.persistSettings();
    if (enabled) {
      await this.connect();
    } else {
      this.conn.disconnect();
      this.pairing.clearActiveCode('friend');
      this.pairing.clearActiveCode('device');
      this.conn.setStatus('disabled');
    }
  }

  async setRelayOverride(relayUrl?: string, token?: string): Promise<void> {
    this.settings = { ...this.settings, relayUrl, token };
    await this.persistSettings();
    if (this.settings.enabled) await this.connect();
    else this.notify();
  }

  relaySettings(): {relayUrl?: string; token?: string} {
    return {relayUrl: this.settings.relayUrl, token: this.settings.token};
  }

  generateCode(kind: LinkKind = 'friend'): Promise<string> {
    return this.pairing.generateCode(kind);
  }

  clearActiveCode(kind: LinkKind): void {
    this.pairing.clearActiveCode(kind);
  }

  enterFriendCode(code: string): Promise<void> {
    return this.pairing.enterCode(code, 'friend');
  }

  enterDeviceCode(code: string, role: 'source' | 'target'): Promise<void> {
    return this.pairing.enterCode(code, 'device', role);
  }

  async removeFriend(peerId: string): Promise<void> {
    try {
      await this.sendTo(peerId, { t: 'disconnect' });
    } catch (e) {
      log.debug('network', e);
    }
    const removed = this.friends.remove(peerId);
    if (removed && removed.kind !== 'device') {
      this.friends.setTombstone(peerId, Date.now());
      await this.friends.persistTombstones();
    }
    this.clearMirrorCaches(peerId);
    await this.friends.persist();
    this.notify();
    this.gateway.register().catch(e => log.debug('network', e));
  }

  sendDM(peerId: string, body: string): Promise<SendStatus> {
    return this.sendTo(peerId, { t: 'dm', body, ts: Date.now() });
  }

  async setFriendNotifyLevel(peerId: string, level: FriendNotifyLevel): Promise<void> {
    const f = this.friends.find(peerId);
    if (!f) return;
    if (level === 'full') {
      const pinned = this.friends.all().filter(x => friendNotifyLevel(x) === 'full' && x.peerId !== peerId).length;
      if (pinned >= MAX_NOTIF_FRIENDS) return;
    }
    this.friends.upsert({ ...f, notifyLevel: level, showInNotification: level === 'full' });
    await this.friends.persist();
    this.notify();
    this.gateway.register().catch(e => log.debug('network', e));
  }

  async moveFriend(peerId: string, dir: -1 | 1): Promise<void> {
    const list = this.friends.all().filter(f => f.kind !== 'device').sort(byFriendOrder);
    const idx = list.findIndex(f => f.peerId === peerId);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= list.length) return;
    [list[idx], list[swap]] = [list[swap], list[idx]];
    list.forEach((f, i) => this.friends.upsert({ ...f, sortOrder: i }));
    await this.friends.persist();
    this.notify();
  }

  refreshGatewayRegistration(): void {
    this.gateway.register().catch(e => log.debug('network', e));
  }

  requestFriendFronts(): void {
    this.fronts.requestFriendFronts();
  }

  updateMyFront(front: ShareableFront | null, members: Member[]): Promise<void> {
    return this.fronts.updateMyFront(front, members);
  }

  flushPendingFronts(): void {
    this.fronts.flushPendingFronts();
  }

  refreshMirrorsFor(peerId: string, force = false): Promise<void> {
    return this.mirrorServe.refreshMirrorsFor(peerId, force);
  }

  refreshAllMirrors(): void {
    this.mirrorServe.refreshAll();
  }

  onMirrorUpdated(fn: MirrorListener): () => void {
    return this.mirrorCache.onUpdated(fn);
  }

  loadMirror(peerId: string, feature: MirrorFeature): Promise<MirrorCacheEntry | null> {
    return this.mirrorCache.loadMirror(peerId, feature);
  }

  requestMirror(peerId: string, feature: MirrorFeature): Promise<void> {
    return this.mirrorInbound.requestMirror(peerId, feature);
  }

  private clearMirrorCaches(peerId: string): void {
    this.mirrorCache.clearFor(peerId);
    this.mirrorServe.clearFor(peerId);
    this.mirrorInbound.clearFor(peerId);
    this.mirrorGifs.clearFor(peerId);
  }

  onSyncRoleMismatch(fn: (c: SyncRoleMismatch) => void): () => void {
    return this.sync.onSyncRoleMismatch(fn);
  }

  onSyncCloneDone(fn: (c: {peerId: string}) => void): () => void {
    return this.sync.onSyncCloneDone(fn);
  }

  onSyncApplied(fn: (keys: string[]) => void): () => void {
    return this.sync.onSyncApplied(fn);
  }

  onSyncConflict(fn: (c: SyncConflict) => void): () => void {
    return this.sync.onSyncConflict(fn);
  }

  notifyDataChanged(): void {
    this.mirrorServe.markDataChanged();
    this.sync.scheduleSync();
  }

  resolveConflict(peerId: string, keep: 'mine' | 'theirs'): Promise<void> {
    return this.sync.resolveConflict(peerId, keep);
  }

  cloudRelay(): {relayUrl: string; token: string} {
    return this.cloud.cloudRelay();
  }

  cloudLocalHash(raw: string): Promise<string> {
    return this.cloud.cloudLocalHash(raw);
  }

  cloudSnapshot(): Promise<Record<string, string>> {
    return this.cloud.cloudSnapshot();
  }

  applyCloudSnapshot(keys: Record<string, string>): Promise<void> {
    return this.cloud.applyCloudSnapshot(keys);
  }

  removeCloudKey(key: string): Promise<void> {
    return this.cloud.removeCloudKey(key);
  }

  adoptCloudIdentity(identityRaw: string, friendsRaw: string | null): Promise<void> {
    return this.cloud.adoptCloudIdentity(identityRaw, friendsRaw);
  }

  mergeCloudFriends(friendsRaw: string | null, tombstonesRaw: string | null): Promise<void> {
    return this.cloud.mergeCloudFriends(friendsRaw, tombstonesRaw);
  }

  readMediaDataUri(ref: string): Promise<string | null> {
    return this.cloud.readMediaDataUri(ref);
  }
}

export const NetworkManager = new NetworkManagerImpl();
