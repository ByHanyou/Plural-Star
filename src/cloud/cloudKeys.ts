import type {EntryKind, Tier} from './cloudTypes';
import {asRecord, isRosterMember} from '../utils';
import type {Member} from '../utils';

export const CLOUD_IDENTITY_KEY = 'ps:networkIdentity';
export const CLOUD_FRIENDS_KEY = 'ps:cloud:friends';
export const CLOUD_TOMBSTONES_KEY = 'ps:cloud:friendTombstones';
export const CLOUD_MEDIA_MISSING = 'cloud:missing';
export const CLOUD_MEDIA_MARK = 'cloud:media';
export const CLOUD_MEDIA_REF = 'ref:';
export const CLOUD_OBJECT_MAX_MB = 25;

export const kindOf = (key: string): EntryKind => {
  if (key.startsWith('ps:media:av:') || key === 'ps:media:sysav') return 'avatar';
  if (key.startsWith('ps:media:bn:') || key === 'ps:media:sysbn') return 'banner';
  if (key.startsWith('ps:media:cf:')) return 'cfImage';
  if (key.startsWith('ps:media:chat:')) return 'chatMedia';
  return 'data';
};

export const tierOf = (kind: EntryKind): Tier => (kind === 'data' || kind === 'avatar' ? 'base' : 'media');

export const isMediaKey = (key: string): boolean => key.startsWith('ps:media:');

export const canonicalRecord = (key: string, raw: string): string => {
  if (key !== 'ps:members' && key !== 'ps:system') return raw;
  try {
    const v: unknown = JSON.parse(raw);
    const scrub = (o: unknown): void => {
      const rec = asRecord(o);
      if (!rec) return;
      for (const f of ['avatar', 'banner'] as const) {
        const s = rec[f];
        if (typeof s === 'string' && (s.startsWith('file://') || s.startsWith('data:') || s === CLOUD_MEDIA_MARK)) rec[f] = CLOUD_MEDIA_MARK;
      }
      if (!Array.isArray(rec.customFields)) return;
      for (const c of rec.customFields as unknown[]) {
        const cv = asRecord(c);
        const s = cv ? cv.value : undefined;
        if (cv && typeof s === 'string' && (s.startsWith('file://') || s.startsWith('data:image') || s === CLOUD_MEDIA_MARK)) cv.value = CLOUD_MEDIA_MARK;
      }
    };
    if (Array.isArray(v)) v.forEach(scrub);
    else scrub(v);
    return JSON.stringify(v);
  } catch {
    return raw;
  }
};

export const ownerKeyOf = (path: string): string => {
  if (path.startsWith('ps:media:chat:')) return `ps:chat:${path.slice('ps:media:chat:'.length).split(':')[0]}`;
  if (path === 'ps:media:sysav' || path === 'ps:media:sysbn') return 'ps:system';
  return 'ps:members';
};

export const rosterOf = (raw: string | undefined): string[] | null => {
  if (raw === undefined) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(list)) return null;
  const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  return list
    .filter((m): m is Member => !!m && typeof m === 'object' && isRosterMember(m as Member))
    .map(m => JSON.stringify([text(m.name), text(m.emoji), text(m.avatar) !== '', text(m.banner) !== '']))
    .sort();
};
