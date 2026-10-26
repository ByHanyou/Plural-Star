import { config } from '../../config';
import { logError } from '../../utils/log';
import { SYNC_MAX_PARTS } from '../../sync/transfer';
import type { FriendIdentity } from '../identity';
import { sanitizeInboundJson } from '../inbound';
import {
  MirrorCacheEntry,
  MirrorFeature,
  MirrorPayload,
  MIRROR_MEDIA_MAX,
  MIRROR_MEDIA_REQ_MAX,
  MIRROR_SYSTEM_AVATAR_ID,
  MIRROR_SYSTEM_BANNER_ID,
  MirrorMediaMessage,
  MirrorPayloadMessage,
  NetMessage,
} from '../types';
import { mirrorGifWants } from './gifHash';
import { mirrorMembersOf } from './payload';
import { MirrorCache, MIRROR_CACHE_FEATURES, mirrorMediaIds, mirrorMediaKeep } from './cache';
import type { MirrorGifs } from './gif';

export interface MirrorInboundDeps {
  cache: MirrorCache;
  gifs: MirrorGifs;
  sendTo(peerId: string, msg: NetMessage): Promise<unknown>;
}

export class MirrorInbound {
  private buffers: Map<string, {parts: string[]; total: number; seqs: Set<number>}> = new Map();
  private mediaTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private mediaPending: Map<string, Record<string, string>> = new Map();
  private askTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private askState: Map<string, {at: number; missing: number}> = new Map();

  constructor(private readonly deps: MirrorInboundDeps) {}

  reset(): void {
    this.askTimers.forEach(t => clearTimeout(t));
    this.askTimers = new Map();
    this.askState = new Map();
  }

  clearFor(peerId: string): void {
    for (const feat of MIRROR_CACHE_FEATURES) this.askState.delete(`${peerId}|${feat}`);
  }

  async requestMirror(peerId: string, feature: MirrorFeature): Promise<void> {
    await this.deps.sendTo(peerId, { t: 'mirror_req', feature, v: 2 });
  }

  async handleMirror(sender: FriendIdentity, m: MirrorPayloadMessage): Promise<void> {
    if (!m || typeof m.seq !== 'number' || typeof m.total !== 'number' || m.total < 1 || m.total > SYNC_MAX_PARTS) return;
    const id = `${sender.peerId}|${m.feature}`;
    let buf = this.buffers.get(id);
    if (!buf || buf.total !== m.total || m.seq === 0) {
      buf = {parts: new Array(m.total).fill(''), total: m.total, seqs: new Set()};
      this.buffers.set(id, buf);
    }
    if (m.seq < 0 || m.seq >= buf.total || buf.seqs.has(m.seq)) return;
    buf.parts[m.seq] = m.data || '';
    buf.seqs.add(m.seq);
    if (buf.seqs.size !== buf.total) return;
    this.buffers.delete(id);
    const joined = buf.parts.join('');
    let data: MirrorPayload | null = null;
    if (!m.none && joined) {
      try {
        data = sanitizeInboundJson(JSON.parse(joined)) as MirrorPayload | null;
      } catch {
        return;
      }
    }
    const cache = this.deps.cache;
    const entry: MirrorCacheEntry = {feature: m.feature, fetchedAt: Date.now(), none: !!m.none, data};
    await cache.writeEntry(sender.peerId, m.feature, entry);
    if (m.feature === 'members' || m.feature === 'systemProfile') {
      await cache.clearMedia(sender.peerId, m.feature, mirrorMediaKeep(m.feature, m.none ? null : data));
      const wants = m.none ? new Map<string, string>() : mirrorGifWants(m.feature, data);
      await this.deps.gifs.prune(sender.peerId, m.feature, wants);
      this.deps.gifs.ask(sender.peerId, m.feature, wants).catch(e => logError('network', e));
    }
    cache.notify(sender.peerId, m.feature);
  }

  scheduleMissingMediaAsk(peerId: string, feature: MirrorFeature): void {
    const key = `${peerId}|${feature}`;
    const old = this.askTimers.get(key);
    if (old) clearTimeout(old);
    this.askTimers.set(key, setTimeout(() => {
      this.askTimers.delete(key);
      this.askMissingMedia(peerId, feature).catch(e => logError('network', e));
    }, config().mirror.mediaAskDelayMs));
  }

  private async askMissingMedia(peerId: string, feature: MirrorFeature): Promise<void> {
    const key = `${peerId}|${feature}`;
    const now = Date.now();
    const entry = await this.deps.cache.readEntry(peerId, feature);
    if (!entry || entry.none) return;
    const ids = mirrorMediaIds(feature, entry.data);
    if (ids.length === 0) return;
    const have = await this.deps.cache.loadMedia(peerId, feature, ids);
    const missingAll = ids.filter(id => !have[id]);
    if (missingAll.length === 0) return;
    const prev = this.askState.get(key);
    if (prev && now - prev.at < config().mirror.mediaAskTtlMs && missingAll.length >= prev.missing) return;
    const missing = missingAll.slice(0, MIRROR_MEDIA_REQ_MAX);
    this.askState.set(key, {at: now, missing: missingAll.length});
    try {
      await this.deps.sendTo(peerId, { t: 'mirror_media_req', feature, ids: missing });
    } catch (e) {
      this.askState.delete(key);
      logError('network', e);
    }
  }

  handleMirrorMedia(sender: FriendIdentity, m: MirrorMediaMessage): void {
    if (!m?.memberId || typeof m.memberId !== 'string' || m.memberId.length > 128 || typeof m.data !== 'string' || !m.data.startsWith('data:image/') || m.data.length > MIRROR_MEDIA_MAX) return;
    const id = `${sender.peerId}|${m.feature}`;
    const pend = this.mediaPending.get(id) || {};
    pend[m.memberId] = m.data;
    this.mediaPending.set(id, pend);
    const old = this.mediaTimers.get(id);
    if (old) clearTimeout(old);
    this.mediaTimers.set(id, setTimeout(() => {
      this.mediaTimers.delete(id);
      const batch = this.mediaPending.get(id);
      this.mediaPending.delete(id);
      if (batch) this.flushMirrorMedia(sender.peerId, m.feature, batch).catch(e => logError('network', e));
    }, config().mirror.mediaBatchMs));
  }

  private async flushMirrorMedia(peerId: string, feature: MirrorFeature, batch: Record<string, string>): Promise<void> {
    const cache = this.deps.cache;
    const prev = await cache.readEntry(peerId, feature);
    if (!prev || prev.none) return;
    const accepted: Record<string, string> = {};
    if (feature === 'systemProfile') {
      for (const mid in batch) {
        if (mid !== MIRROR_SYSTEM_AVATAR_ID && mid !== MIRROR_SYSTEM_BANNER_ID) continue;
        accepted[mid] = batch[mid];
      }
    } else {
      if (!Array.isArray(prev.data)) return;
      const idsPresent = new Set(mirrorMembersOf(prev.data).map(x => x?.id));
      for (const mid in batch) {
        const cut = mid.endsWith('#banner') ? mid.length - '#banner'.length : mid.indexOf('#cf:');
        const baseId = cut >= 0 ? mid.slice(0, cut) : mid;
        if (!idsPresent.has(baseId)) continue;
        accepted[mid] = batch[mid];
      }
    }
    if (await cache.putMedia(peerId, feature, accepted)) cache.notify(peerId, feature);
  }
}
