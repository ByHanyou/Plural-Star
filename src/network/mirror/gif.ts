import { config } from '../../config';
import { logError } from '../../utils/log';
import type { MediaAdapter } from '../adapters';
import type { FriendIdentity } from '../identity';
import {
  MirrorFeature,
  MirrorGifAsk,
  MirrorGifMessage,
  MIRROR_GIF_ASK_MAX,
  MIRROR_GIF_MAX_PARTS,
  MIRROR_GIF_PART,
  NetMessage,
} from '../types';
import { isMirrorGifB64, isMirrorGifHash, mirrorGifWants } from './gifHash';
import type { MirrorCache } from './cache';

export interface MirrorGifDeps {
  media: MediaAdapter;
  cache: MirrorCache;
  sendTo(peerId: string, msg: NetMessage): Promise<unknown>;
}

export class MirrorGifs {
  private buffers: Map<string, {peerId: string; h: string; total: number; parts: string[]; seqs: Set<number>; at: number}> = new Map();
  private asked: Map<string, number> = new Map();

  constructor(private readonly deps: MirrorGifDeps) {}

  private bufKey(peerId: string, feature: MirrorFeature, id: string): string {
    return `${peerId}|${feature}|${id}`;
  }

  private key(peerId: string, feature: MirrorFeature, id: string, h: string): string {
    return `${this.bufKey(peerId, feature, id)}|${h}`;
  }

  pruneStale(): void {
    const cutoff = Date.now() - config().sync.chunkIdleMs;
    for (const [id, buf] of this.buffers) {
      if (buf.at < cutoff) this.buffers.delete(id);
    }
    const askCutoff = Date.now() - config().mirror.gifAskKeepMs;
    for (const [id, at] of this.asked) {
      if (at < askCutoff) this.asked.delete(id);
    }
  }

  clearFor(peerId: string): void {
    this.deps.media.clearGifs(peerId).catch(e => logError('mirror', e));
    const prefix = `${peerId}|`;
    for (const k of [...this.buffers.keys()]) if (k.startsWith(prefix)) this.buffers.delete(k);
    for (const k of [...this.asked.keys()]) if (k.startsWith(prefix)) this.asked.delete(k);
  }

  prune(peerId: string, feature: MirrorFeature, wants: Map<string, string>): Promise<void> {
    return this.deps.media.pruneGifs(peerId, feature, wants);
  }

  async ask(peerId: string, feature: MirrorFeature, wants: Map<string, string>): Promise<void> {
    if (wants.size === 0) return;
    const have = await this.deps.media.gifsPresent(peerId, feature, wants);
    const now = Date.now();
    const items: MirrorGifAsk[] = [];
    wants.forEach((h, id) => {
      if (have.has(id) || items.length >= MIRROR_GIF_ASK_MAX) return;
      const key = this.key(peerId, feature, id, h);
      const at = this.asked.get(key);
      const buf = this.buffers.get(this.bufKey(peerId, feature, id));
      if (buf && buf.h === h && now - buf.at < config().mirror.gifAskTtlMs) return;
      if (at && now - at < config().mirror.gifAskTtlMs) return;
      this.asked.set(key, now);
      items.push({id, h});
    });
    if (items.length === 0) return;
    try {
      await this.deps.sendTo(peerId, { t: 'mirror_gif_req', feature, items });
    } catch (e) {
      for (const it of items) this.asked.delete(this.key(peerId, feature, it.id, it.h));
      logError('network', e);
    }
  }

  handleGif(sender: FriendIdentity, m: MirrorGifMessage): void {
    if (!m || typeof m.memberId !== 'string' || !m.memberId || m.memberId.length > 128 || !isMirrorGifHash(m.h)) return;
    if (!Number.isInteger(m.seq) || !Number.isInteger(m.total) || m.total < 1 || m.total > MIRROR_GIF_MAX_PARTS || m.seq < 0 || m.seq >= m.total) return;
    if (typeof m.data !== 'string' || m.data.length === 0 || m.data.length > MIRROR_GIF_PART) return;
    const askKey = this.key(sender.peerId, m.feature, m.memberId, m.h);
    if (!this.asked.has(askKey)) return;
    const bufKey = this.bufKey(sender.peerId, m.feature, m.memberId);
    let buf = this.buffers.get(bufKey);
    if (!buf || buf.h !== m.h || buf.total !== m.total) {
      const mine = [...this.buffers].filter(([k, b]) => k !== bufKey && b.peerId === sender.peerId).sort((a, b) => a[1].at - b[1].at);
      while (mine.length >= config().mirror.gifBuffersPerPeer) {
        const oldest = mine.shift();
        if (oldest) this.buffers.delete(oldest[0]);
      }
      buf = {peerId: sender.peerId, h: m.h, total: m.total, parts: new Array(m.total).fill(''), seqs: new Set(), at: Date.now()};
      this.buffers.set(bufKey, buf);
    }
    buf.at = Date.now();
    if (buf.seqs.has(m.seq)) return;
    buf.parts[m.seq] = m.data;
    buf.seqs.add(m.seq);
    if (buf.seqs.size !== buf.total) return;
    this.buffers.delete(bufKey);
    this.asked.delete(askKey);
    this.store(sender.peerId, m.feature, m.memberId, m.h, buf.parts.join('')).catch(e => logError('network', e));
  }

  private async store(peerId: string, feature: MirrorFeature, id: string, h: string, b64: string): Promise<void> {
    if (!isMirrorGifB64(b64)) return;
    const entry = await this.deps.cache.readEntry(peerId, feature);
    if (!entry || entry.none || mirrorGifWants(feature, entry.data).get(id) !== h) return;
    if (await this.deps.media.saveGif(peerId, feature, id, h, b64)) this.deps.cache.notify(peerId, feature);
  }
}
