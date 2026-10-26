import { config } from '../config';
import { logError } from '../utils/log';
import type { StorageAdapter } from '../network/adapters';
import { decodeBase64, encodeBase64 } from '../network/bytes';
import type { FriendStore } from '../network/friends';
import { getDeviceIdentity, Identity, loadOrCreateIdentity, resetIdentityCache } from '../network/identity';
import { sanitizeInboundFriend } from '../network/inbound';
import { Friend, IDENTITY_STORAGE_KEY, NetMessage, NetworkSettings, PROTO_VERSION, StoredIdentity } from '../network/types';
import { isAcceptedDevice } from '../network/friendState';
import { SyncService } from './service';
import { pacedSender, sendSyncItems, SyncItem } from './transfer';

export interface CloneDeps {
  storage: StorageAdapter;
  friends: FriendStore;
  sync: SyncService;
  identity(): Identity | null;
  setIdentity(id: Identity): void;
  settings(): NetworkSettings;
  sendTo(peerId: string, msg: NetMessage): Promise<unknown>;
  isReachable(peerId: string): boolean;
  notify(): void;
  notifyDataChanged(): void;
  connect(): Promise<void>;
  forgetOnline(peerId: string): void;
  retryPendingLinks(): void;
}

export class CloneService {
  constructor(private readonly deps: CloneDeps) {}

  onDeviceLinkAccepted(f: Friend): void {
    if (f.kind !== 'device') return;
    if (f.initRole === 'source') {
      if (f.peerRole === 'source') {
        this.failRolePairing(f);
        return;
      }
      this.doInitClonePush(f.peerId).catch(e => logError('network', e));
    } else if (f.initRole === 'target') {
      if (f.peerRole !== 'source') {
        this.failRolePairing(f);
        return;
      }
    } else {
      this.deps.notifyDataChanged();
    }
  }

  failRolePairing(f: Friend): void {
    this.deps.friends.upsert({ ...f, initPending: false });
    this.deps.friends.persistSoon();
    this.deps.notify();
    this.deps.sync.emitRoleMismatch({ peerId: f.peerId, deviceName: f.displayName });
  }

  expireStaleClones(): void {
    const friends = this.deps.friends;
    let changed = false;
    friends.replace(friends.all().map(f => {
      if (isAcceptedDevice(f) && f.initPending) {
        if (!f.initStartedAt || Date.now() - f.initStartedAt > config().sync.cloneIdleTimeoutMs) {
          changed = true;
          return { ...f, initPending: false };
        }
      }
      return f;
    }));
    if (changed) {
      friends.persistSoon();
      this.deps.notify();
    }
    this.deps.retryPendingLinks();
  }

  restartPendingClones(): void {
    for (const f of this.deps.friends.all()) {
      if (isAcceptedDevice(f) && f.initRole === 'source' && f.initPending) {
        this.doInitClonePush(f.peerId).catch(e => logError('sync', e));
      }
    }
  }

  async doInitClonePush(peerId: string): Promise<void> {
    const friends = this.deps.friends;
    const sync = this.deps.sync;
    const dev = friends.find(peerId);
    if (!dev || !isAcceptedDevice(dev) || dev.initRole !== 'source' || !dev.initPending) return;
    if (!this.deps.isReachable(peerId)) return;
    if (sync.busy) {
      setTimeout(() => this.doInitClonePush(peerId).catch(e => logError('sync', e)), config().sync.minIntervalMs);
      return;
    }
    sync.busy = true;
    try {
      const snap = await sync.snapshot();
      const hashes = await sync.hashAll(snap);
      const send = pacedSender(msg => this.deps.sendTo(peerId, msg));
      const items: SyncItem[] = [];
      for (const k in hashes) items.push(sync.item(snap, k, hashes[k]));
      await sendSyncItems(items, {init: true}, send, keys => {
        for (const {k, h} of keys) sync.setHash(k, h);
      });
      await send({t: 'sync', keys: {}, init: true, initDone: true});
      const stored = await this.deps.storage.get<StoredIdentity>(IDENTITY_STORAGE_KEY, null);
      const adoptCapable = (dev.peerV ?? 0) >= PROTO_VERSION;
      if (adoptCapable && stored?.edSecretKey && stored?.boxSecretKey) {
        await send({
          t: 'device_adopt',
          identity: stored,
          friends: friends.all().filter(f => f.kind !== 'device'),
        });
        const selfNow = this.deps.identity();
        if (selfNow) {
          friends.replace(friends.all().filter(f => f.peerId !== peerId));
          if (friends.find(selfNow.peerId)?.kind !== 'device') {
            friends.upsert({
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
          await sync.persistHashes();
          await friends.persist();
          this.deps.notify();
          sync.emitCloneDone(peerId);
          return;
        }
      }
      await sync.persistHashes();
      friends.upsert({ ...dev, initPending: false });
      await friends.persist();
      this.deps.notify();
      sync.emitCloneDone(peerId);
    } finally {
      sync.busy = false;
    }
  }

  async adoptSystemIdentity(identity: StoredIdentity, friends: unknown[]): Promise<void> {
    const keyLen = (s: unknown, n: number) => typeof s === 'string' && decodeBase64(s).length === n;
    if (!keyLen(identity.edSecretKey, 64) || !keyLen(identity.boxSecretKey, 32)) return;
    const store = this.deps.friends;
    const sync = this.deps.sync;
    const previousPeerId = this.deps.identity()?.peerId;
    await getDeviceIdentity();
    await this.deps.storage.set(IDENTITY_STORAGE_KEY, identity);
    resetIdentityCache();
    const adopted = await loadOrCreateIdentity();
    this.deps.setIdentity(adopted);

    const ownDeviceLinks = store.all().filter(f => f.kind === 'device');
    const incoming = friends
      .map(sanitizeInboundFriend)
      .filter((f): f is Friend => !!f && f.kind !== 'device');
    const merged = [...incoming];
    for (const d of ownDeviceLinks) {
      if (!merged.some(f => f.peerId === d.peerId)) merged.push(d);
    }
    store.replace(merged);
    await store.persist();

    sync.resetHashes();
    await sync.persistHashes();

    if (previousPeerId) this.deps.forgetOnline(previousPeerId);
    this.deps.notify();
    if (this.deps.settings().enabled) await this.deps.connect();
  }
}
