import { CHAT_KEY_PREFIX, KEYS } from '../storage';
import type { MediaAdapter, StorageAdapter } from '../network/adapters';
import { resolveNetwork } from '../network/defaultNetwork';
import type { FriendStore } from '../network/friends';
import { parseIdentity } from '../network/inbound';
import { isChatMediaKey, isMediaKey, parseMediaKey } from '../network/mediaKey';
import { IDENTITY_STORAGE_KEY, MIRROR_CACHE_PREFIX, NetworkSettings, SYNC_EXCLUDE_KEYS } from '../network/types';
import type { CloneService } from '../sync/clone';
import { syncHash, syncHashAsync } from '../sync/hash';
import {
  addChatMediaToSnapshot,
  clearMediaField,
  markUnreadableMedia,
  neutralizeInlineMedia,
  preserveLocalChatMedia,
  preserveLocalMedia,
  preserveLocalSystemMedia,
} from '../sync/media';
import type { SyncService } from '../sync/service';
import { buildSnapshot } from '../sync/snapshot';
import { logError } from '../utils/log';
import { CLOUD_FRIENDS_KEY, CLOUD_TOMBSTONES_KEY } from './cloudKeys';

const CLOUD_EXCLUDE = new Set(SYNC_EXCLUDE_KEYS);

export interface CloudBridgeDeps {
  storage: StorageAdapter;
  media: MediaAdapter;
  friends: FriendStore;
  sync: SyncService;
  clone: CloneService;
  settings(): NetworkSettings;
  afterLocalWrite(): void;
}

const byPeer = (a: {peerId: string}, b: {peerId: string}) => (a.peerId < b.peerId ? -1 : a.peerId > b.peerId ? 1 : 0);

export class CloudBridge {
  constructor(private readonly deps: CloudBridgeDeps) {}

  cloudRelay(): {relayUrl: string; token: string} {
    const net = resolveNetwork(this.deps.settings());
    return {relayUrl: net.relayUrl, token: net.token};
  }

  cloudLocalHash(raw: string): Promise<string> {
    return syncHashAsync(raw);
  }

  readMediaDataUri(ref: string): Promise<string | null> {
    return this.deps.media.readDataUri(ref);
  }

  async cloudSnapshot(): Promise<Record<string, string>> {
    const {storage, media, friends} = this.deps;
    const snap = await buildSnapshot(storage, media);
    const identityRaw = await storage.getRaw(IDENTITY_STORAGE_KEY);
    if (identityRaw) snap[IDENTITY_STORAGE_KEY] = identityRaw;
    const records = friends.all()
      .filter(f => f.kind !== 'device')
      .map(f => friends.cloudFriendRecord(f))
      .sort(byPeer);
    snap[CLOUD_FRIENDS_KEY] = JSON.stringify(records);
    friends.pruneTombstones();
    if (friends.removed().length) snap[CLOUD_TOMBSTONES_KEY] = JSON.stringify([...friends.removed()].sort(byPeer));
    await addChatMediaToSnapshot(media, snap);
    neutralizeInlineMedia(snap);
    markUnreadableMedia(snap);
    return snap;
  }

  async applyCloudSnapshot(keys: Record<string, string>): Promise<void> {
    const {storage, media, sync} = this.deps;
    sync.clearSnapshot();
    const applied: string[] = [];
    const mediaKeys: [string, string][] = [];
    for (const k in keys) {
      if (!k.startsWith('ps:') || CLOUD_EXCLUDE.has(k) || k.startsWith(MIRROR_CACHE_PREFIX)) continue;
      if (isMediaKey(k)) {
        mediaKeys.push([k, keys[k]]);
        continue;
      }
      const incoming = keys[k];
      const localRaw = await storage.getRaw(k);
      const v = k === KEYS.members ? preserveLocalMedia(media, incoming, localRaw)
        : k === KEYS.system ? preserveLocalSystemMedia(incoming, localRaw)
        : k.startsWith(CHAT_KEY_PREFIX) ? preserveLocalChatMedia(incoming, localRaw)
        : incoming;
      await storage.setRaw(k, v);
      sync.setHash(k, syncHash(v));
      applied.push(k);
    }
    for (const [k, v] of mediaKeys) {
      const ok = await sync.applyMediaKey(k, v);
      if (ok) applied.push(k);
      else sync.stashPendingMedia(k, v, syncHash(v));
    }
    if (applied.some(k => k === KEYS.members || k === KEYS.system || k.startsWith(CHAT_KEY_PREFIX))) await sync.flushPendingMedia(applied);
    sync.clearSnapshot();
    this.deps.afterLocalWrite();
    if (applied.length) {
      await sync.persistHashes();
      sync.emitSyncApplied(applied);
    }
  }

  async removeCloudKey(key: string): Promise<void> {
    const {storage, media, sync} = this.deps;
    if (!key.startsWith('ps:') || CLOUD_EXCLUDE.has(key)) return;
    if (isChatMediaKey(key)) {
      const mk = parseMediaKey(key);
      if (mk && mk.kind === 'chat') await media.deleteChatMedia(mk.msgId);
      return;
    }
    if (isMediaKey(key)) {
      if (await clearMediaField(sync.io, key)) sync.emitSyncApplied([key]);
      return;
    }
    if (key === KEYS.members || key === KEYS.system || key === KEYS.settings) return;
    await storage.remove(key);
    sync.deleteHash(key);
    await sync.persistHashes();
    sync.emitSyncApplied([key]);
  }

  async adoptCloudIdentity(identityRaw: string, friendsRaw: string | null): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(identityRaw);
    } catch (e) {
      logError('cloud', e);
      return;
    }
    const identity = parseIdentity(parsed);
    if (!identity) return;
    let friends: unknown[] = [];
    try {
      const list: unknown = friendsRaw ? JSON.parse(friendsRaw) : [];
      if (Array.isArray(list)) friends = list;
    } catch (e) {
      logError('cloud', e);
    }
    await this.deps.clone.adoptSystemIdentity(identity, friends);
  }

  mergeCloudFriends(friendsRaw: string | null, tombstonesRaw: string | null): Promise<void> {
    return this.deps.friends.mergeCloudFriends(friendsRaw, tombstonesRaw);
  }
}
