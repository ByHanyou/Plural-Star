import type { Member } from '../utils';
import type { StorageAdapter } from './adapters';
import type { FriendStore } from './friends';
import { log, logError } from '../utils/log';
import {
  allowedCustomFrontIdsFor,
  allowedFacetIdsFor,
  allowedMemberIdsFor,
  buildFrontShare,
  frontVisibilityFor,
  parsePrivacyBuckets,
  ShareableFront,
} from './frontShare';
import { FrontShare, NetMessage, PENDING_FRONTS_KEY, PrivacyBucket, PRIVACY_BUCKETS_KEY } from './types';
import { isAcceptedFriend } from './friendState';

export interface FrontShareDeps {
  storage: StorageAdapter;
  friends: FriendStore;
  sendTo(peerId: string, msg: NetMessage): Promise<unknown>;
  isReachable(peerId: string): boolean;
  announceFront(): void;
  pullGatewayFronts(): void;
}

export class FrontShareService {
  private myFront: FrontShare | null = null;
  private myFrontKnown = false;
  private myFrontAt = 0;
  private myFrontRaw: {front: ShareableFront | null; members: Member[]} | null = null;
  private pendingFrontReqs: Set<string> = new Set();
  private pendingFronts: Set<string> = new Set();

  constructor(private readonly deps: FrontShareDeps) {}

  get known(): boolean {
    return this.myFrontKnown;
  }

  get current(): FrontShare | null {
    return this.myFront;
  }

  async load(): Promise<void> {
    try {
      const saved = await this.deps.storage.get<string[]>(PENDING_FRONTS_KEY, []);
      this.pendingFronts = new Set(Array.isArray(saved) ? saved : []);
    } catch (e) {
      logError('network', e);
    }
  }

  reset(): void {
    this.myFront = null;
    this.myFrontKnown = false;
    this.myFrontAt = 0;
    this.myFrontRaw = null;
  }

  async loadPrivacyBuckets(): Promise<PrivacyBucket[]> {
    try {
      return parsePrivacyBuckets(await this.deps.storage.getRaw(PRIVACY_BUCKETS_KEY));
    } catch (e) {
      logError('network', e);
      return [];
    }
  }

  scopedFrontFor(buckets: PrivacyBucket[], peerId: string): FrontShare | null {
    const vis = frontVisibilityFor(buckets, peerId);
    if (!vis.show) return null;
    if (!this.myFrontRaw) return this.myFront;
    return buildFrontShare(this.myFrontRaw.front, this.myFrontRaw.members, allowedMemberIdsFor(buckets, peerId), allowedFacetIdsFor(buckets, peerId), allowedCustomFrontIdsFor(buckets, peerId), {mood: vis.mood, location: vis.location, note: vis.note});
  }

  gatewayVisibleFront(buckets: PrivacyBucket[]): FrontShare | null {
    const watchers = this.deps.friends.all().filter(f => isAcceptedFriend(f) && frontVisibilityFor(buckets, f.peerId).show);
    if (watchers.length === 0) return null;
    if (!this.myFrontRaw) return this.myFront;
    const roster = this.myFrontRaw.members;
    const facetIdsAll = roster.filter(m => m.isFacet && !m.isCustomFront).map(m => m.id);
    const customFrontIdsAll = roster.filter(m => m.isCustomFront).map(m => m.id);
    const plainIdsAll = roster.filter(m => !m.isCustomFront && !m.isFacet).map(m => m.id);
    let allowed: Set<string> | null = null;
    for (const f of watchers) {
      const mIds = allowedMemberIdsFor(buckets, f.peerId);
      const fIds = allowedFacetIdsFor(buckets, f.peerId);
      const cIds = allowedCustomFrontIdsFor(buckets, f.peerId);
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

  async updateMyFront(front: ShareableFront | null, members: Member[]): Promise<void> {
    const shareable = members.filter(m => !m.private);
    this.myFrontRaw = {front, members: shareable};
    this.myFront = buildFrontShare(front, shareable);
    this.myFrontAt = Date.now();
    const wasUnknown = !this.myFrontKnown;
    this.myFrontKnown = true;
    this.deps.announceFront();
    const buckets = await this.loadPrivacyBuckets();
    const friends = this.deps.friends;
    if (wasUnknown && this.pendingFrontReqs.size > 0) {
      const waiting = [...this.pendingFrontReqs];
      this.pendingFrontReqs.clear();
      for (const peerId of waiting) {
        const f = friends.find(peerId);
        if (f && isAcceptedFriend(f)) this.sendMyFrontTo(peerId);
      }
    }
    for (const f of friends.all()) {
      if (!isAcceptedFriend(f)) continue;
      let delivered = false;
      try {
        await this.deps.sendTo(f.peerId, this.frontMsg(buckets, f.peerId));
        delivered = this.deps.isReachable(f.peerId);
      } catch (e) {
        log.debug('network', e);
      }
      if (!delivered) this.pendingFronts.add(f.peerId);
      else this.pendingFronts.delete(f.peerId);
    }
    await this.persistPendingFronts();
  }

  private frontMsg(buckets: PrivacyBucket[], peerId: string): NetMessage {
    return { t: 'front', status: this.scopedFrontFor(buckets, peerId), at: this.myFrontAt };
  }

  private async pushFrontTo(peerId: string): Promise<void> {
    const buckets = await this.loadPrivacyBuckets();
    await this.deps.sendTo(peerId, this.frontMsg(buckets, peerId));
  }

  async sendMyFrontTo(peerId: string): Promise<void> {
    try {
      await this.pushFrontTo(peerId);
    } catch (e) {
      log.debug('network', e);
    }
  }

  onFrontRequested(peerId: string): void {
    if (this.myFrontKnown) this.sendMyFrontTo(peerId);
    else this.pendingFrontReqs.add(peerId);
  }

  private async persistPendingFronts(): Promise<void> {
    try {
      await this.deps.storage.set(PENDING_FRONTS_KEY, [...this.pendingFronts]);
    } catch (e) {
      logError('network', e);
    }
  }

  flushPendingFronts(): void {
    if (!this.myFrontKnown) return;
    for (const f of this.deps.friends.all()) {
      if (!isAcceptedFriend(f)) continue;
      if (!this.pendingFronts.has(f.peerId)) continue;
      this.deliverPendingFront(f.peerId).catch(e => log.debug('network', e));
    }
  }

  async deliverPendingFront(peerId: string): Promise<void> {
    if (!this.myFrontKnown) return;
    try {
      await this.pushFrontTo(peerId);
    } catch (e) {
      log.debug('network', e);
      return;
    }
    if (!this.deps.isReachable(peerId)) return;
    this.pendingFronts.delete(peerId);
    await this.persistPendingFronts();
  }

  async requestFrontFrom(peerId: string): Promise<void> {
    try {
      await this.deps.sendTo(peerId, { t: 'front_req' });
    } catch (e) {
      log.debug('network', e);
    }
  }

  requestFriendFronts(): void {
    for (const f of this.deps.friends.all()) {
      if (!isAcceptedFriend(f)) continue;
      this.requestFrontFrom(f.peerId);
    }
    this.deps.pullGatewayFronts();
  }
}
