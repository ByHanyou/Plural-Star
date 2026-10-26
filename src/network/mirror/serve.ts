import { config } from '../../config';
import { asRecord, isRecord } from '../../utils';
import { logError } from '../../utils/log';
import { syncHashAsync } from '../../sync/hash';
import { chunkTotal, sendChunked, SYNC_CHUNK_SIZE, SYNC_MAX_PARTS } from '../../sync/transfer';
import { sleep, withTimeout } from '../../utils/concurrency';
import type { MediaAdapter, StorageAdapter } from '../adapters';
import type { FriendStore } from '../friends';
import { effectiveScope, parsePrivacyBuckets } from '../frontShare';
import {
  MirrorFeature,
  MirrorGifAsk,
  MIRROR_GIF_MAX_PARTS,
  MIRROR_GIF_MIN_PART,
  MIRROR_GIF_PART,
  MIRROR_MEDIA_MAX,
  MIRROR_MEDIA_REQ_MAX,
  MIRROR_SENT_KEY,
  MIRROR_SERVED_KEY,
  NetMessage,
  NetworkSettings,
  PRIVACY_BUCKETS_KEY,
} from '../types';
import { isAcceptedFriend } from '../friendState';
import { isMirrorFeature } from './payload';
import { buildMirror, isServedFeature, MirrorBuild, MirrorGifSources, MirrorSource } from './build';
import { MIRROR_CACHE_FEATURES } from './cache';

export type MirrorReqOpts = {gifAsk?: MirrorGifAsk[]; mediaOnly?: Set<string>; fullMedia?: boolean; requested?: boolean};
type GifItem = {id: string; h: string; src: string};

const stringMap = (o: Record<string, unknown>): Map<string, string> =>
  new Map(Object.entries(o).filter((e): e is [string, string] => typeof e[1] === 'string'));

export interface MirrorServeDeps {
  storage: StorageAdapter;
  media: MediaAdapter;
  friends: FriendStore;
  settings(): NetworkSettings;
  sendTo(peerId: string, msg: NetMessage): Promise<unknown>;
  isReachable(peerId: string): boolean;
}

export class MirrorServe {
  private served: Map<string, Set<MirrorFeature>> = new Map();
  private sentHash: Map<string, string> = new Map();
  private mediaSig: Map<string, string> = new Map();
  private sentTimer: ReturnType<typeof setTimeout> | null = null;
  private reads: Map<string, Promise<string | null>> | null = null;
  private refreshing = false;
  private refreshAgain = false;
  private dataVersion = 0;
  private peerVersion: Map<string, number> = new Map();
  private refreshInFlight: Set<string> = new Set();
  private reqChain: Map<string, Promise<boolean>> = new Map();
  private gifSrc: Map<string, MirrorGifSources> = new Map();
  private gifQueues: Map<string, {items: GifItem[]; current: string | null}> = new Map();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly source: MirrorSource;

  constructor(private readonly deps: MirrorServeDeps) {
    this.source = {
      read: key => this.read(key),
      gifHash: src => deps.media.gifHash(src),
      isSource: (v): v is string => deps.media.isSource(v),
    };
  }

  async load(): Promise<void> {
    await this.loadServed();
    await this.loadSent();
  }

  reset(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.served = new Map();
    this.sentHash = new Map();
    this.mediaSig = new Map();
    this.peerVersion = new Map();
    this.reqChain = new Map();
    this.gifSrc = new Map();
    if (this.sentTimer) {
      clearTimeout(this.sentTimer);
      this.sentTimer = null;
    }
    this.deps.storage.remove(MIRROR_SENT_KEY).catch(e => logError('mirror', e));
  }

  invalidate(): void {
    this.gifSrc = new Map();
  }

  markDataChanged(): void {
    this.dataVersion++;
    this.gifSrc = new Map();
    if (this.reads) this.reads = new Map();
    if (this.deps.settings().enabled) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = null;
        this.refreshAll();
      }, config().mirror.debounceMs);
    }
  }

  private async loadServed(): Promise<void> {
    try {
      const raw = await this.deps.storage.getRaw(MIRROR_SERVED_KEY);
      const parsed = asRecord(raw ? JSON.parse(raw) : null);
      if (parsed) {
        this.served = new Map(
          Object.entries(parsed).map(([p, f]) => [p, new Set(Array.isArray(f) ? f.filter(isMirrorFeature) : [])]),
        );
      }
    } catch (e) {
      logError('network', e);
    }
  }

  private async persistServed(): Promise<void> {
    try {
      const obj: Record<string, MirrorFeature[]> = {};
      this.served.forEach((feats, peer) => {
        obj[peer] = [...feats];
      });
      await this.deps.storage.setRaw(MIRROR_SERVED_KEY, JSON.stringify(obj));
    } catch (e) {
      logError('network', e);
    }
  }

  private markServed(peerId: string, feature: MirrorFeature): void {
    const set = this.served.get(peerId) || new Set<MirrorFeature>();
    if (set.has(feature)) return;
    set.add(feature);
    this.served.set(peerId, set);
    this.persistServed().catch(e => logError('mirror', e));
  }

  private async loadSent(): Promise<void> {
    try {
      const raw = await this.deps.storage.getRaw(MIRROR_SENT_KEY);
      const parsed = asRecord(raw ? JSON.parse(raw) : null);
      if (parsed) {
        if (isRecord(parsed.payload)) this.sentHash = stringMap(parsed.payload);
        if (isRecord(parsed.media)) this.mediaSig = stringMap(parsed.media);
      }
    } catch (e) {
      logError('network', e);
    }
  }

  private markSentDirty(): void {
    if (this.sentTimer) return;
    this.sentTimer = setTimeout(() => {
      this.sentTimer = null;
      this.persistSent().catch(e => logError('network', e));
    }, config().mirror.sentPersistMs);
  }

  private async persistSent(): Promise<void> {
    const payload: Record<string, string> = {};
    this.sentHash.forEach((v, k) => { payload[k] = v; });
    const media: Record<string, string> = {};
    this.mediaSig.forEach((v, k) => { media[k] = v; });
    await this.deps.storage.setRaw(MIRROR_SENT_KEY, JSON.stringify({payload, media}));
  }

  private read(key: string): Promise<string | null> {
    const cache = this.reads;
    if (!cache) return this.deps.storage.getRaw(key);
    let p = cache.get(key);
    if (!p) {
      p = this.deps.storage.getRaw(key);
      cache.set(key, p);
    }
    return p;
  }

  async refreshMirrorsFor(peerId: string, force = false): Promise<void> {
    const feats = this.served.get(peerId);
    if (!feats || feats.size === 0 || this.refreshInFlight.has(peerId)) return;
    this.refreshInFlight.add(peerId);
    try {
      const version = this.dataVersion;
      let complete = true;
      for (const feat of [...feats]) {
        const ok = await this.handleMirrorReq(peerId, feat, true, {requested: force}).catch(e => {
          logError('network', e);
          return false;
        });
        if (!ok) complete = false;
      }
      if (complete) this.peerVersion.set(peerId, version);
    } finally {
      this.refreshInFlight.delete(peerId);
    }
  }

  refreshIfStale(peerId: string, force = false): void {
    if (this.peerVersion.get(peerId) === this.dataVersion) return;
    this.refreshMirrorsFor(peerId, force).catch(e => logError('network', e));
  }

  refreshAll(): void {
    if (this.refreshing) {
      this.refreshAgain = true;
      return;
    }
    this.refreshing = true;
    this.reads = new Map();
    (async () => {
      try {
        for (const f of [...this.deps.friends.all()]) {
          if (!isAcceptedFriend(f)) continue;
          await withTimeout(this.refreshMirrorsFor(f.peerId), config().mirror.friendTimeoutMs).catch(e => logError('network', e));
        }
      } finally {
        this.reads = null;
        this.refreshing = false;
        if (this.refreshAgain) {
          this.refreshAgain = false;
          this.refreshAll();
        }
      }
    })().catch(e => logError('network', e));
  }

  clearFor(peerId: string): void {
    for (const feat of MIRROR_CACHE_FEATURES) {
      this.sentHash.delete(`${peerId}|${feat}`);
      this.dropMediaSigs(`${peerId}|${feat}|`);
      this.gifSrc.delete(`${peerId}|${feat}`);
    }
    const prefix = `${peerId}|`;
    for (const [k, q] of [...this.gifQueues]) if (k.startsWith(prefix)) q.items.length = 0;
    if (this.served.delete(peerId)) this.persistServed().catch(e => logError('mirror', e));
    this.peerVersion.delete(peerId);
    this.markSentDirty();
  }

  private dropMediaSigs(prefix: string, keep?: Set<string>): boolean {
    let dropped = false;
    for (const k of [...this.mediaSig.keys()]) {
      if (k.startsWith(prefix) && (!keep || !keep.has(k))) {
        this.mediaSig.delete(k);
        dropped = true;
      }
    }
    return dropped;
  }

  handleMirrorReq(peerId: string, feature: MirrorFeature, skipIfUnchanged?: boolean, opts?: MirrorReqOpts): Promise<boolean> {
    const chainKey = `${peerId}|${feature}`;
    const prev = this.reqChain.get(chainKey) || Promise.resolve(true);
    const run = prev.catch(() => false).then(() => this.handleMirrorReqInner(peerId, feature, skipIfUnchanged, opts));
    this.reqChain.set(chainKey, run);
    run.catch(() => false).then(() => {
      if (this.reqChain.get(chainKey) === run) this.reqChain.delete(chainKey);
    });
    return run;
  }

  private knownGifItems(gateKey: string, gifAsk: MirrorGifAsk[]): GifItem[] | null {
    const known = this.gifSrc.get(gateKey);
    if (!known) return null;
    const items: GifItem[] = [];
    for (const a of gifAsk) {
      const g = known.get(a.id);
      if (!g || g.h !== a.h) return null;
      items.push({id: a.id, h: a.h, src: g.src});
    }
    return items;
  }

  private async handleMirrorReqInner(peerId: string, feature: MirrorFeature, skipIfUnchanged?: boolean, opts?: MirrorReqOpts): Promise<boolean> {
    const gifAsk = opts?.gifAsk;
    const mediaOnly = opts?.mediaOnly;
    const fullMedia = !!opts?.fullMedia;
    const requested = !!opts?.requested;
    if (!isServedFeature(feature)) return false;
    const {friends, media: adapter, sendTo} = this.deps;
    const fr = friends.find(peerId);
    if (!fr || !isAcceptedFriend(fr)) return false;
    const gateKey = `${peerId}|${feature}`;
    const buckets = parsePrivacyBuckets(await this.read(PRIVACY_BUCKETS_KEY));
    const scope = effectiveScope(buckets, peerId, feature);
    if (scope.mode === 'none') {
      if (gifAsk || mediaOnly) return true;
      if (skipIfUnchanged && this.sentHash.get(gateKey) === 'none') return true;
      try {
        await sendTo(peerId, { t: 'mirror', feature, seq: 0, total: 1, data: '', none: true });
      } catch (e) {
        logError('network', e);
        return false;
      }
      this.sentHash.set(gateKey, 'none');
      this.dropMediaSigs(`${gateKey}|`);
      this.markSentDirty();
      this.markServed(peerId, feature);
      return true;
    }
    if (!requested && !this.deps.isReachable(peerId)) return false;
    if (gifAsk) {
      const known = this.knownGifItems(gateKey, gifAsk);
      if (known) {
        this.queueGifs(peerId, feature, known);
        return true;
      }
    }
    let build: MirrorBuild;
    try {
      build = await buildMirror(this.source, feature, buckets, peerId, scope);
    } catch (e) {
      logError('network', e);
      return false;
    }
    const {payload, media, gifSrc} = build;
    if (feature === 'members' || feature === 'systemProfile') this.gifSrc.set(gateKey, gifSrc);
    if (gifAsk) {
      const items: GifItem[] = [];
      for (const a of gifAsk) {
        const g = gifSrc.get(a.id);
        if (g && g.h === a.h) items.push({id: a.id, h: g.h, src: g.src});
      }
      if (items.length > 0) this.queueGifs(peerId, feature, items);
      return true;
    }
    let payloadSent = false;
    if (!mediaOnly) {
      const pHash = await syncHashAsync(payload);
      if (!(skipIfUnchanged && this.sentHash.get(gateKey) === pHash)) {
        if (chunkTotal(payload.length, SYNC_CHUNK_SIZE) > SYNC_MAX_PARTS) return true;
        const ok = await sendChunked(payload, SYNC_CHUNK_SIZE, async (seq, total, data) => {
          try {
            await sendTo(peerId, { t: 'mirror', feature, seq, total, data });
          } catch (e) {
            logError('network', e);
            return false;
          }
          if (total > 1) await sleep(config().sync.paceMs);
          return true;
        }, true);
        if (!ok) return false;
        payloadSent = true;
        this.sentHash.set(gateKey, pHash);
        this.markSentDirty();
        this.markServed(peerId, feature);
      }
    }
    if (!mediaOnly) {
      const live = new Set(media.map(item => `${gateKey}|${item.id}`));
      if (this.dropMediaSigs(`${gateKey}|`, live)) this.markSentDirty();
    }
    let skipped = false;
    for (const item of media) {
      if (mediaOnly && !mediaOnly.has(item.id)) continue;
      const sigKey = `${gateKey}|${item.id}`;
      const sig = adapter.signature(item.src);
      if (!mediaOnly && !fullMedia && this.mediaSig.get(sigKey) === sig) continue;
      if (!requested && !this.deps.isReachable(peerId)) return false;
      let uri: string | null = null;
      try {
        uri = await withTimeout(adapter.thumb(item.src, item.maxDim), config().mirror.thumbTimeoutMs);
      } catch (e) {
        logError('network', e);
      }
      if (!uri) {
        skipped = true;
        continue;
      }
      if (uri.length > MIRROR_MEDIA_MAX) {
        this.mediaSig.set(sigKey, sig);
        this.markSentDirty();
        continue;
      }
      try {
        await sendTo(peerId, { t: 'mirror_media', feature, memberId: item.id, data: uri });
      } catch (e) {
        logError('network', e);
        skipped = true;
        continue;
      }
      this.mediaSig.set(sigKey, sig);
      this.markSentDirty();
      await sleep(config().sync.paceMs);
    }
    const capped = !!mediaOnly && mediaOnly.size >= MIRROR_MEDIA_REQ_MAX;
    if ((payloadSent || capped) && (feature === 'members' || feature === 'systemProfile')) {
      try {
        await sendTo(peerId, { t: 'mirror_media_done', feature });
      } catch (e) {
        logError('network', e);
      }
    }
    return !skipped;
  }

  private queueGifs(peerId: string, feature: MirrorFeature, items: GifItem[]): void {
    const qk = `${peerId}|${feature}`;
    const running = this.gifQueues.get(qk);
    if (running) {
      for (const it of items) {
        const k = `${it.id}|${it.h}`;
        if (running.current === k || running.items.some(x => x.id === it.id && x.h === it.h)) continue;
        running.items.push(it);
      }
      return;
    }
    const q = {items: [...items], current: null as string | null};
    this.gifQueues.set(qk, q);
    (async () => {
      try {
        while (q.items.length > 0) {
          const it = q.items.shift();
          if (!it) break;
          q.current = `${it.id}|${it.h}`;
          await this.sendGif(peerId, feature, it);
        }
      } finally {
        this.gifQueues.delete(qk);
      }
    })().catch(e => logError('network', e));
  }

  private async sendGif(peerId: string, feature: MirrorFeature, it: GifItem): Promise<void> {
    const b64 = await this.deps.media.gifBase64(it.src);
    if (!b64) return;
    const part = Math.min(MIRROR_GIF_PART, Math.max(MIRROR_GIF_MIN_PART, Math.ceil(b64.length / MIRROR_GIF_MAX_PARTS)));
    if (chunkTotal(b64.length, part) > MIRROR_GIF_MAX_PARTS) return;
    await sendChunked(b64, part, async (seq, total, data) => {
      try {
        await this.deps.sendTo(peerId, { t: 'mirror_gif', feature, memberId: it.id, h: it.h, seq, total, data });
      } catch (e) {
        logError('network', e);
        return false;
      }
      await sleep(config().sync.paceMs * 2);
      return true;
    }, true);
  }
}
