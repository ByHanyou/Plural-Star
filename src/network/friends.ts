import { log, logError } from '../utils/log';
import type { StorageAdapter } from './adapters';
import { encodeBase64 } from './bytes';
import type { FriendIdentity, Identity } from './identity';
import { sanitizeInboundFriend } from './inbound';
import {
  Friend,
  FriendTombstone,
  FRIENDS_STORAGE_KEY,
  FRIEND_TOMBSTONES_KEY,
  FRIEND_TOMBSTONE_TTL_MS,
  FRIEND_TOMBSTONE_CAP,
  NetMessage,
} from './types';
import { isAcceptedDevice } from './friendState';

export type LinkKind = 'friend' | 'device';

export interface FriendStoreDeps {
  identity(): Identity | null;
  sendTo(peerId: string, msg: NetMessage): Promise<unknown>;
  announceFront(): void;
  clearMirrorCaches(peerId: string): void;
  notify(): void;
}

const isCloudFriend = (v: unknown): v is Friend => {
  if (!v || typeof v !== 'object') return false;
  const f = v as Partial<Friend>;
  if (typeof f.peerId !== 'string' || !f.peerId || f.kind === 'device') return false;
  return typeof f.edPublicKey === 'string' && typeof f.boxPublicKey === 'string' && typeof f.displayName === 'string';
};

export class FriendStore {
  private list: Friend[] = [];
  private tombstones: FriendTombstone[] = [];
  private applyingSiblingFriends = false;

  constructor(private readonly storage: StorageAdapter, private readonly deps: FriendStoreDeps) {}

  async load(): Promise<void> {
    this.list = (await this.storage.get<Friend[]>(FRIENDS_STORAGE_KEY, null)) || [];
    this.tombstones = (await this.storage.get<FriendTombstone[]>(FRIEND_TOMBSTONES_KEY, null)) || [];
    this.pruneTombstones();
  }

  all(): Friend[] {
    return this.list;
  }

  find(peerId: string): Friend | undefined {
    return this.list.find(f => f.peerId === peerId);
  }

  replace(list: Friend[]): void {
    this.list = list;
  }

  reset(): void {
    this.list = [];
    this.tombstones = [];
  }

  removed(): FriendTombstone[] {
    return this.tombstones;
  }

  upsert(partial: Friend): void {
    const idx = this.list.findIndex(f => f.peerId === partial.peerId);
    if (idx >= 0) this.list[idx] = { ...this.list[idx], ...partial };
    else this.list.push(partial);
  }

  remove(peerId: string): Friend | undefined {
    const removed = this.find(peerId);
    this.list = this.list.filter(f => f.peerId !== peerId);
    return removed;
  }

  friendFrom(id: FriendIdentity, displayName: string, status: Friend['status'], kind: LinkKind): Friend {
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

  siblingDevices(): Friend[] {
    const self = this.deps.identity();
    if (!self) return [];
    return this.list.filter(
      f => isAcceptedDevice(f) && !f.initPending && f.peerId === self.peerId,
    );
  }

  acceptedDevices(): Friend[] {
    return this.list.filter(f => isAcceptedDevice(f) && !f.initPending);
  }

  async persist(): Promise<void> {
    await this.storage.set(FRIENDS_STORAGE_KEY, this.list);
    if (!this.applyingSiblingFriends) this.pushToSiblings();
    this.deps.announceFront();
  }

  persistSoon(): void {
    this.persist().catch(e => logError('network', e));
  }

  pruneTombstones(): void {
    const cutoff = Date.now() - FRIEND_TOMBSTONE_TTL_MS;
    this.tombstones = this.tombstones
      .filter(tb => tb && typeof tb.peerId === 'string' && tb.removedAt > cutoff)
      .sort((a, b) => b.removedAt - a.removedAt)
      .slice(0, FRIEND_TOMBSTONE_CAP);
  }

  async persistTombstones(): Promise<void> {
    this.pruneTombstones();
    await this.storage.set(FRIEND_TOMBSTONES_KEY, this.tombstones);
  }

  tombstoneFor(peerId: string): FriendTombstone | undefined {
    return this.tombstones.find(tb => tb.peerId === peerId);
  }

  setTombstone(peerId: string, removedAt: number): void {
    this.tombstones = this.tombstones.filter(tb => tb.peerId !== peerId);
    this.tombstones.push({ peerId, removedAt });
  }

  clearTombstone(peerId: string): void {
    const before = this.tombstones.length;
    this.tombstones = this.tombstones.filter(tb => tb.peerId !== peerId);
    if (this.tombstones.length !== before) this.persistTombstones().catch(e => logError('network', e));
  }

  private pushToSiblings(): void {
    const sibs = this.siblingDevices();
    if (sibs.length === 0) return;
    const payload = this.list.filter(f => f.kind !== 'device');
    for (const s of sibs) {
      this.deps.sendTo(s.peerId, {t: 'friends_push', friends: payload, removed: this.tombstones}).catch(e => log.debug('network', e));
    }
  }

  async mergeSiblingFriends(incoming: unknown[], removed?: unknown[]): Promise<void> {
    const byId = new Map(this.list.map(f => [f.peerId, f]));
    let changed = false;
    if (Array.isArray(removed)) {
      for (const raw of removed) {
        const tb = raw as Partial<FriendTombstone> | null;
        if (!tb || typeof tb.peerId !== 'string' || typeof tb.removedAt !== 'number') continue;
        const mine = byId.get(tb.peerId);
        const mineAt = mine?.addedAt ?? 0;
        if (mine && mine.kind !== 'device' && tb.removedAt > mineAt) {
          this.list = this.list.filter(f => f.peerId !== tb.peerId);
          byId.delete(tb.peerId);
          this.deps.clearMirrorCaches(tb.peerId);
          changed = true;
        }
        const local = this.tombstoneFor(tb.peerId);
        if ((!mine || tb.removedAt > mineAt) && (!local || tb.removedAt > local.removedAt)) {
          this.setTombstone(tb.peerId, tb.removedAt);
        }
      }
      this.persistTombstones().catch(e => logError('network', e));
    }
    const self = this.deps.identity();
    for (const raw of incoming) {
      const inc = sanitizeInboundFriend(raw);
      if (!inc) continue;
      if (inc.kind === 'device') continue;
      if (self && inc.peerId === self.peerId) continue;
      const mine = byId.get(inc.peerId);
      const incAdded = inc.addedAt ?? 0;
      const tb = this.tombstoneFor(inc.peerId);
      if (tb && tb.removedAt >= incAdded) continue;
      if (tb) this.clearTombstone(inc.peerId);
      if (!mine) {
        this.list.push(inc);
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
      this.upsert(merged);
      changed = true;
    }
    if (!changed) return;
    await this.persistQuietly();
    this.deps.notify();
  }

  private async persistQuietly(): Promise<void> {
    this.applyingSiblingFriends = true;
    try {
      await this.persist();
    } finally {
      this.applyingSiblingFriends = false;
    }
  }

  cloudFriendRecord(f: Friend): {peerId: string} & Record<string, unknown> {
    const omit = new Set(['lastStatus', 'statusUpdatedAt', 'statusAuthoredAt', 'showInNotification', 'notifyLevel']);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(f).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      if (!omit.has(k)) out[k] = v;
    }
    return {...out, peerId: f.peerId};
  }

  async mergeCloudFriends(friendsRaw: string | null, tombstonesRaw: string | null): Promise<void> {
    let friends: unknown[] = [];
    let removed: unknown[] | undefined;
    try {
      const parsed: unknown = friendsRaw ? JSON.parse(friendsRaw) : [];
      if (Array.isArray(parsed)) friends = parsed;
    } catch (e) {
      logError('network', e);
    }
    try {
      const parsed: unknown = tombstonesRaw ? JSON.parse(tombstonesRaw) : undefined;
      if (Array.isArray(parsed)) removed = parsed;
    } catch (e) {
      logError('network', e);
    }
    await this.mergeSiblingFriends(friends, removed);
    let changed = false;
    for (const inc of friends) {
      if (!isCloudFriend(inc)) continue;
      const idx = this.list.findIndex(f => f.peerId === inc.peerId);
      if (idx < 0) continue;
      const mine = this.list[idx];
      if (mine.kind === 'device') continue;
      const theirs = this.cloudFriendRecord(inc);
      if (JSON.stringify(this.cloudFriendRecord(mine)) === JSON.stringify(theirs)) continue;
      this.list[idx] = {
        ...inc,
        lastStatus: mine.lastStatus,
        statusUpdatedAt: mine.statusUpdatedAt,
        statusAuthoredAt: mine.statusAuthoredAt,
        showInNotification: mine.showInNotification,
        notifyLevel: mine.notifyLevel,
      };
      changed = true;
    }
    if (!changed) return;
    await this.persistQuietly();
    this.deps.notify();
  }
}
