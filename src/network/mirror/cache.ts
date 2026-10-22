import { logError } from '../../utils/log';
import { Emitter } from '../../utils/emitter';
import type { MediaAdapter, StorageAdapter } from '../adapters';
import {
  MirrorCacheEntry,
  MIRROR_FEATURES,
  MirrorFeature,
  MirrorPayload,
  MIRROR_CACHE_PREFIX,
  MIRROR_SYSTEM_AVATAR_ID,
  MIRROR_SYSTEM_BANNER_ID,
} from '../types';
import { mirrorGifWants } from './gifHash';
import { mirrorMembersOf, mirrorProfileOf } from './payload';
import { isServedFeature, MirrorServedFeature } from './build';

export const MIRROR_CACHE_FEATURES: MirrorServedFeature[] = MIRROR_FEATURES.filter(isServedFeature);

export type MirrorListener = (peerId: string, feature: MirrorFeature) => void;

const memberFieldImageIds = (feature: MirrorFeature, data: MirrorPayload | null, bannerIf: (hasBanner: boolean | undefined) => boolean, avatarIf: (hasAvatar: boolean | undefined) => boolean): string[] => {
  const ids: string[] = [];
  if (feature !== 'members') return ids;
  for (const mm of mirrorMembersOf(data)) {
    if (!mm?.id) continue;
    if (avatarIf(mm.hasAvatar)) ids.push(mm.id);
    if (bannerIf(mm.hasBanner)) ids.push(`${mm.id}#banner`);
    for (const cf of mm.customFields || []) {
      if (cf && cf.type === 'image' && cf.fieldId) ids.push(`${mm.id}#cf:${cf.fieldId}`);
    }
  }
  return ids;
};

export const mirrorMediaIds = (feature: MirrorFeature, data: MirrorPayload | null): string[] => {
  if (feature === 'members') return memberFieldImageIds(feature, data, b => b === true, a => a === true);
  const ids: string[] = [];
  if (feature === 'systemProfile') {
    const sp = mirrorProfileOf(data);
    if (sp?.hasAvatar) ids.push(MIRROR_SYSTEM_AVATAR_ID);
    if (sp?.hasBanner) ids.push(MIRROR_SYSTEM_BANNER_ID);
  }
  return ids;
};

export const mirrorMediaKeep = (feature: MirrorFeature, data: MirrorPayload | null): Set<string> => {
  if (feature === 'members') return new Set(memberFieldImageIds(feature, data, b => b !== false, () => true));
  return new Set(mirrorMediaIds(feature, data));
};

export class MirrorCache {
  private readonly updates = new Emitter<[string, MirrorFeature]>('mirror');

  constructor(private readonly storage: StorageAdapter, private readonly media: MediaAdapter) {}

  onUpdated(fn: MirrorListener): () => void {
    return this.updates.on(fn);
  }

  notify(peerId: string, feature: MirrorFeature): void {
    this.updates.emit(peerId, feature);
  }

  cacheKey(peerId: string, feature: MirrorFeature): string {
    return `${MIRROR_CACHE_PREFIX}${feature}:${peerId}`;
  }

  private mediaKey(peerId: string, feature: MirrorFeature, memberId: string): string {
    return `${MIRROR_CACHE_PREFIX}media:${feature}:${peerId}:${memberId}`;
  }

  async readEntry(peerId: string, feature: MirrorFeature): Promise<MirrorCacheEntry | null> {
    try {
      const raw = await this.storage.getRaw(this.cacheKey(peerId, feature));
      const entry = raw ? (JSON.parse(raw) as MirrorCacheEntry) : null;
      if (entry && entry.media) {
        const inline = entry.media;
        delete entry.media;
        await this.putMedia(peerId, feature, inline);
        await this.writeEntry(peerId, feature, entry);
      }
      return entry;
    } catch (e) {
      logError('network', e);
      this.storage.remove(this.cacheKey(peerId, feature)).catch(err => logError('mirror', err));
      return null;
    }
  }

  async writeEntry(peerId: string, feature: MirrorFeature, entry: MirrorCacheEntry): Promise<void> {
    try {
      await this.storage.setRaw(this.cacheKey(peerId, feature), JSON.stringify(entry));
    } catch (e) {
      logError('network', e);
    }
  }

  async loadMedia(peerId: string, feature: MirrorFeature, ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    const out: Record<string, string> = {};
    const prefix = this.mediaKey(peerId, feature, '');
    const keys = ids.map(id => this.mediaKey(peerId, feature, id));
    try {
      const found = await this.storage.getMany(keys);
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

  async putMedia(peerId: string, feature: MirrorFeature, batch: Record<string, string>): Promise<boolean> {
    const entries: Record<string, string> = {};
    let n = 0;
    for (const mid in batch) {
      entries[this.mediaKey(peerId, feature, mid)] = batch[mid];
      n++;
    }
    if (n === 0) return false;
    try {
      await this.storage.setMany(entries);
      return true;
    } catch (e) {
      logError('network', e);
      return false;
    }
  }

  async clearMedia(peerId: string, feature: MirrorFeature, keepIds?: Set<string>): Promise<void> {
    try {
      const prefix = this.mediaKey(peerId, feature, '');
      const all = await this.storage.allKeys();
      const stale = all.filter(k => k.startsWith(prefix) && (!keepIds || !keepIds.has(k.slice(prefix.length))));
      if (stale.length > 0) await this.storage.removeMany(stale);
    } catch (e) {
      logError('network', e);
    }
  }

  async loadMirror(peerId: string, feature: MirrorFeature): Promise<MirrorCacheEntry | null> {
    const entry = await this.readEntry(peerId, feature);
    if (!entry || entry.none) return entry;
    if (feature === 'members' && Array.isArray(entry.data)) {
      entry.media = await this.loadMedia(peerId, feature, [...mirrorMediaKeep(feature, entry.data)]);
    }
    if (feature === 'systemProfile' && entry.data) {
      entry.media = await this.loadMedia(peerId, feature, [MIRROR_SYSTEM_AVATAR_ID, MIRROR_SYSTEM_BANNER_ID]);
    }
    if (feature === 'members' || feature === 'systemProfile') {
      const gifs = await this.media.gifUris(peerId, feature, mirrorGifWants(feature, entry.data));
      if (Object.keys(gifs).length > 0) entry.media = {...(entry.media || {}), ...gifs};
    }
    return entry;
  }

  clearFor(peerId: string): void {
    for (const feat of MIRROR_CACHE_FEATURES) {
      this.storage.remove(this.cacheKey(peerId, feat)).catch(e => logError('mirror', e));
      this.clearMedia(peerId, feat).catch(e => logError('mirror', e));
    }
  }
}
