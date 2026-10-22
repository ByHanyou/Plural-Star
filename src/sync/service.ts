import { config } from '../config';
import { KEYS } from '../storage';
import { log, logError } from '../utils/log';
import { Emitter } from '../utils/emitter';
import type { MediaAdapter, StorageAdapter } from '../network/adapters';
import type { FriendStore } from '../network/friends';
import type { FriendIdentity } from '../network/identity';
import { isChatMediaKey, isMediaKey } from '../network/mediaKey';
import { FRONT_CLEARED_KEY, NetMessage, NetworkSettings, SYNC_STATE_KEY, SyncChunk, SyncKeys, SyncValue } from '../network/types';
import { isAcceptedDevice } from '../network/friendState';
import { emptyListOverPopulated, frontStartTime, mergeCustomFieldDefs, realMemberCount, remapMemberFieldIds, rosterDropsLiveMembers } from './conflicts';
import { canonicalForSync, clearMediaHashMemo, hashAll, syncHash } from './hash';
import { applyChatMedia, applyMedia, preserveLocalMedia, preserveLocalSystemMedia, SyncIO } from './media';
import { SnapshotMemo, SYNC_EXCLUDE } from './snapshot';
import { fanoutSender, pacedSender, sendSyncItems, SYNC_MAX_PARTS, SyncItem } from './transfer';

export type SyncConflict = {peerId: string; deviceName: string; keys: string[]};
export type SyncRoleMismatch = {peerId: string; deviceName: string};
type PendingConflict = {key: string; remoteValue: string; remoteHash: string};
type ChunkBuffer = {parts: string[]; total: number; seqs: Set<number>; init: boolean; resolved: boolean; at: number};

export interface SyncDeps {
  storage: StorageAdapter;
  media: MediaAdapter;
  friends: FriendStore;
  settings(): NetworkSettings;
  sendTo(peerId: string, msg: NetMessage): Promise<unknown>;
  isReachable(peerId: string): boolean;
  notify(): void;
  notifyDataChanged(): void;
  afterLocalWrite(): void;
}

export class SyncService {
  private lastHashes: Record<string, string> = {};
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPushAt = 0;
  busy = false;
  private chunkBuffers: Map<string, ChunkBuffer> = new Map();
  private pendingConflicts: Map<string, PendingConflict[]> = new Map();
  private readonly appliedEvents = new Emitter<[string[]]>('sync');
  private readonly conflictEvents = new Emitter<[SyncConflict]>('sync');
  private readonly roleMismatchEvents = new Emitter<[SyncRoleMismatch]>('sync');
  private readonly cloneDoneEvents = new Emitter<[{peerId: string}]>('sync');
  private pendingMedia: Map<string, SyncValue> = new Map();
  private readonly snap: SnapshotMemo;
  readonly io: SyncIO;

  constructor(private readonly deps: SyncDeps) {
    this.snap = new SnapshotMemo(deps.storage, deps.media);
    this.io = {
      storage: deps.storage,
      media: deps.media,
      setHash: (key, hash) => {
        this.lastHashes[key] = hash;
      },
    };
  }

  async load(): Promise<void> {
    this.lastHashes = (await this.deps.storage.get<Record<string, string>>(SYNC_STATE_KEY, null)) || {};
  }

  reset(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    this.lastHashes = {};
    this.pendingConflicts = new Map();
    this.snap.clear();
    clearMediaHashMemo();
  }

  snapshot(): Promise<Record<string, string>> {
    return this.snap.get();
  }

  clearSnapshot(): void {
    this.snap.clear();
  }

  hashAll(snap: Record<string, string>): Promise<Record<string, string>> {
    return hashAll(snap, v => this.deps.media.materialize(v));
  }

  item(snap: Record<string, string>, k: string, h: string): SyncItem {
    return {k, h, load: () => this.deps.media.materialize(snap[k])};
  }

  hashOf(key: string): string | undefined {
    return this.lastHashes[key];
  }

  setHash(key: string, hash: string): void {
    this.lastHashes[key] = hash;
  }

  deleteHash(key: string): void {
    delete this.lastHashes[key];
  }

  resetHashes(): void {
    this.lastHashes = {};
  }

  persistHashes(): Promise<void> {
    return this.deps.storage.set(SYNC_STATE_KEY, this.lastHashes);
  }

  onSyncApplied(fn: (keys: string[]) => void): () => void {
    return this.appliedEvents.on(fn);
  }

  onSyncConflict(fn: (c: SyncConflict) => void): () => void {
    return this.conflictEvents.on(fn);
  }

  onSyncRoleMismatch(fn: (c: SyncRoleMismatch) => void): () => void {
    return this.roleMismatchEvents.on(fn);
  }

  onSyncCloneDone(fn: (c: {peerId: string}) => void): () => void {
    return this.cloneDoneEvents.on(fn);
  }

  emitSyncApplied(keys: string[]): void {
    this.appliedEvents.emit(keys);
  }

  emitRoleMismatch(c: SyncRoleMismatch): void {
    this.roleMismatchEvents.emit(c);
  }

  emitCloneDone(peerId: string): void {
    this.cloneDoneEvents.emit({ peerId });
  }

  scheduleSync(): void {
    this.snap.clear();
    const friends = this.deps.friends;
    if (friends.all().some(f => f.kind === 'device' && f.initRole === 'target' && f.initPending)) return;
    if (!this.deps.settings().enabled || friends.acceptedDevices().length === 0) return;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.doSyncPush().catch(e => logError('network', e));
    }, config().sync.debounceMs);
  }

  pruneStaleChunks(): void {
    const cutoff = Date.now() - config().sync.chunkIdleMs;
    for (const [id, buf] of this.chunkBuffers) {
      if (buf.at < cutoff) this.chunkBuffers.delete(id);
    }
  }

  stashPendingMedia(key: string, v: string, h: string): void {
    if (this.pendingMedia.has(key)) this.pendingMedia.delete(key);
    while (this.pendingMedia.size >= config().sync.pendingMediaMax) {
      const first = this.pendingMedia.keys().next().value;
      if (first === undefined) break;
      this.pendingMedia.delete(first);
    }
    this.pendingMedia.set(key, {v, h});
  }

  applyMediaKey(key: string, dataUri: string): Promise<boolean> {
    return isChatMediaKey(key) ? applyChatMedia(this.io, key, dataUri) : applyMedia(this.io, key, dataUri);
  }

  async flushPendingMedia(applied: string[]): Promise<void> {
    if (this.pendingMedia.size === 0) return;
    for (const [key, entry] of Array.from(this.pendingMedia.entries())) {
      const ok = await this.applyMediaKey(key, entry.v);
      if (!ok) continue;
      this.pendingMedia.delete(key);
      this.lastHashes[key] = entry.h;
      applied.push(key);
    }
  }

  private async frontClearedAt(): Promise<number | null> {
    try {
      const raw = await this.deps.storage.getRaw(FRONT_CLEARED_KEY);
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch (e) {
      logError('sync', e);
      return null;
    }
  }

  private async noteFrontCleared(): Promise<void> {
    try {
      await this.deps.storage.set(FRONT_CLEARED_KEY, Date.now());
    } catch (e) {
      logError('sync', e);
    }
  }

  sendSyncReqs(): void {
    for (const d of this.deps.friends.acceptedDevices()) this.sendSyncReqTo(d.peerId).catch(e => log.debug('sync', e));
  }

  async sendSyncReqTo(peerId: string): Promise<void> {
    const snap = await this.snapshot();
    const hashes = await this.hashAll(snap);
    await this.deps.sendTo(peerId, {t: 'sync_req', hashes});
  }

  async handleSyncReq(sender: FriendIdentity, theirs: Record<string, string>): Promise<void> {
    const friends = this.deps.friends;
    const dev = friends.find(sender.peerId);
    if (!dev || !isAcceptedDevice(dev)) return;
    if (dev.initRole === 'target' && dev.initPending) {
      friends.upsert({ ...dev, initPending: false });
      await friends.persist();
      this.deps.notify();
      this.sendSyncReqTo(sender.peerId).catch(e => log.debug('sync', e));
      return;
    }
    if (dev.initPending) return;
    if (this.busy) {
      setTimeout(() => this.handleSyncReq(sender, theirs).catch(e => logError('sync', e)), config().sync.paceMs * 10);
      return;
    }
    const snap = await this.snapshot();
    const hashes = await this.hashAll(snap);
    const diff: SyncItem[] = [];
    for (const k in hashes) {
      if (theirs[k] !== hashes[k]) diff.push(this.item(snap, k, hashes[k]));
    }
    if (diff.length === 0) return;
    this.busy = true;
    try {
      await sendSyncItems(diff, {}, pacedSender(msg => this.deps.sendTo(sender.peerId, msg)));
    } finally {
      this.busy = false;
    }
  }

  async doSyncPush(): Promise<void> {
    if (this.busy) {
      this.deps.notifyDataChanged();
      return;
    }
    const devices = this.deps.friends.acceptedDevices();
    if (devices.length === 0) return;
    if (!devices.some(d => this.deps.isReachable(d.peerId))) return;
    const now = Date.now();
    if (now - this.lastPushAt < config().sync.minIntervalMs) {
      this.deps.notifyDataChanged();
      return;
    }

    const snap = await this.snapshot();
    const hashes = await this.hashAll(snap);
    const changed: SyncItem[] = [];
    for (const k in hashes) {
      if (this.lastHashes[k] !== hashes[k]) changed.push(this.item(snap, k, hashes[k]));
    }
    if (changed.length === 0) return;

    this.busy = true;
    this.lastPushAt = now;
    try {
      let advanced = false;
      const send = fanoutSender(devices.map(d => d.peerId), (p, m) => this.deps.sendTo(p, m), p => this.deps.isReachable(p));
      await sendSyncItems(changed, {}, send, keys => {
        for (const {k, h} of keys) this.lastHashes[k] = h;
        advanced = true;
      });
      if (advanced) await this.persistHashes();
    } finally {
      this.busy = false;
    }
  }

  handleSyncChunk(sender: FriendIdentity, m: SyncChunk): void {
    if (!m.key || m.total <= 0 || m.total > SYNC_MAX_PARTS || m.seq < 0 || m.seq >= m.total) return;
    const id = `${sender.peerId}:${m.key}:${m.h}`;
    let buf = this.chunkBuffers.get(id);
    if (!buf) {
      buf = {parts: new Array(m.total).fill(''), total: m.total, seqs: new Set(), init: !!m.init, resolved: !!m.resolved, at: Date.now()};
      this.chunkBuffers.set(id, buf);
    }
    buf.at = Date.now();
    buf.parts[m.seq] = m.data;
    buf.seqs.add(m.seq);
    if (buf.seqs.size >= buf.total) {
      const v = buf.parts.join('');
      const wasInit = buf.init;
      const wasResolved = buf.resolved;
      this.chunkBuffers.delete(id);
      this.applySync(sender, {[m.key]: {v, h: m.h}}, wasInit, false, wasResolved).catch(e => logError('network', e));
    }
  }

  private async writeIncoming(k: string, incoming: SyncValue, localRaw: string | null): Promise<void> {
    const storage = this.deps.storage;
    if (k === KEYS.members || k === KEYS.system) {
      const v = k === KEYS.members ? preserveLocalMedia(this.deps.media, incoming.v, localRaw) : preserveLocalSystemMedia(incoming.v, localRaw);
      await storage.setRaw(k, v);
      this.lastHashes[k] = syncHash(v);
    } else {
      await storage.setRaw(k, incoming.v);
      this.lastHashes[k] = incoming.h;
    }
  }

  async applySync(sender: FriendIdentity, keys: SyncKeys, init = false, initDone = false, resolved = false): Promise<void> {
    this.snap.clear();
    const friends = this.deps.friends;
    const storage = this.deps.storage;
    let dev = friends.find(sender.peerId);
    if (!dev || dev.kind !== 'device' || dev.status === 'entered_mine') return;
    if (dev.status === 'entered_theirs') {
      dev = { ...dev, status: 'accepted' };
      friends.upsert(dev);
      await friends.persist();
      this.deps.notify();
    }
    const cloning = init && dev.initRole === 'target';
    if (cloning && dev.initPending) {
      friends.upsert({ ...dev, initStartedAt: Date.now() });
    }
    if (!init && dev.initRole === 'target' && dev.initPending) {
      dev = { ...dev, initPending: false };
      friends.upsert(dev);
      await friends.persist();
      this.deps.notify();
    }
    const applied: string[] = [];
    const conflicts: PendingConflict[] = [];
    for (const k in keys) {
      if (!k.startsWith('ps:')) continue;
      if (SYNC_EXCLUDE.has(k)) continue;
      const incoming = keys[k];
      if (isMediaKey(k)) {
        if (this.lastHashes[k] !== incoming.h) {
          const ok = await applyMedia(this.io, k, incoming.v);
          if (ok) {
            this.lastHashes[k] = incoming.h;
            applied.push(k);
          } else {
            this.stashPendingMedia(k, incoming.v, incoming.h);
          }
        }
        continue;
      }
      const localRaw = await storage.getRaw(k);
      if (k === KEYS.front && !cloning && !resolved) {
        const incT = frontStartTime(incoming.v);
        const locT = frontStartTime(localRaw);
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
        const res = mergeCustomFieldDefs(localRaw, incoming.v);
        if (res) {
          await storage.setRaw(k, res.merged);
          this.lastHashes[k] = syncHash(res.merged);
          applied.push(k);
          await remapMemberFieldIds(this.io, res.remap);
          continue;
        }
      }
      const writeValue = async () => {
        await this.writeIncoming(k, incoming, localRaw);
        applied.push(k);
      };
      if (cloning || resolved) {
        await writeValue();
        continue;
      }
      const risky = localRaw != null && (
        (k === KEYS.members && ((realMemberCount(incoming.v) === 0 && realMemberCount(localRaw) > 0) || rosterDropsLiveMembers(localRaw, incoming.v))) ||
        emptyListOverPopulated(localRaw, incoming.v));
      const noConflict = !risky && (localRaw == null || (base !== undefined && localHash === base));
      if (noConflict) await writeValue();
      else conflicts.push({key: k, remoteValue: incoming.v, remoteHash: incoming.h});
    }
    if (resolved) {
      const pending = this.pendingConflicts.get(sender.peerId);
      if (pending) {
        const rest = pending.filter(c => !(c.key in keys));
        if (rest.length) this.pendingConflicts.set(sender.peerId, rest);
        else this.pendingConflicts.delete(sender.peerId);
      }
    }
    if (applied.includes(KEYS.members) || applied.includes(KEYS.system)) {
      await this.flushPendingMedia(applied);
    }
    if (initDone && dev.initRole === 'target' && dev.initPending) {
      friends.upsert({ ...dev, initPending: false });
      await friends.persist();
      this.deps.notify();
      this.emitCloneDone(sender.peerId);
    }
    this.snap.clear();
    this.deps.afterLocalWrite();
    if (applied.length || (initDone && cloning)) {
      await this.persistHashes();
      this.emitSyncApplied(applied);
    }
    if (conflicts.length) {
      this.pendingConflicts.set(sender.peerId, conflicts);
      this.conflictEvents.emit({peerId: sender.peerId, deviceName: dev.displayName, keys: conflicts.map(c => c.key)});
    }
  }

  async resolveConflict(peerId: string, keep: 'mine' | 'theirs'): Promise<void> {
    const conflicts = this.pendingConflicts.get(peerId);
    if (!conflicts) return;
    const storage = this.deps.storage;
    if (keep === 'theirs') {
      for (const c of conflicts) {
        const localRaw = c.key === KEYS.members || c.key === KEYS.system ? await storage.getRaw(c.key) : null;
        await this.writeIncoming(c.key, {v: c.remoteValue, h: c.remoteHash}, localRaw);
      }
      this.snap.clear();
      this.emitSyncApplied(conflicts.map(c => c.key));
    } else {
      const push: SyncItem[] = [];
      for (const c of conflicts) {
        const localRaw = await storage.getRaw(c.key);
        if (localRaw != null) {
          const h = syncHash(localRaw);
          this.lastHashes[c.key] = h;
          push.push({k: c.key, h, load: () => Promise.resolve(localRaw)});
        }
      }
      await sendSyncItems(push, {resolved: true}, pacedSender(msg => this.deps.sendTo(peerId, msg)));
    }
    await this.persistHashes();
    this.pendingConflicts.delete(peerId);
  }
}
