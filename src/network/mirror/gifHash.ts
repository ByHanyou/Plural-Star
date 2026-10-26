import { GIF_B64_MAGIC, MIRROR_GIF_ASK_MAX, MIRROR_GIF_MAX_B64, MIRROR_SYSTEM_BANNER_ID, MirrorFeature, MirrorGifAsk, MirrorMember, MirrorSystemProfile } from '../types';

const MIRROR_GIF_HASH_RE = /^[A-Za-z0-9-]{1,64}$/;

export const isMirrorGifHash = (h: unknown): h is string => typeof h === 'string' && MIRROR_GIF_HASH_RE.test(h);

export const FNV_OFFSET = 0x811c9dc5;

export const fnv = (h: number, s: string, from: number, to: number, step = 1): number => {
  for (let i = from; i < to; i += step) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h;
};

export const fnvHex = (h: number): string => (h >>> 0).toString(16);

export const mirrorGifHash = (b64: string): string => {
  const n = b64.length;
  const h = fnv(fnv(FNV_OFFSET, b64, 0, n, Math.max(1, Math.floor(n / 8192))), b64, Math.max(0, n - 512), n);
  return `${n.toString(36)}-${fnvHex(h)}`;
};

export const isMirrorGifB64 = (b64: string): boolean => {
  const n = b64.length;
  if (n === 0 || n > MIRROR_GIF_MAX_B64 || n % 4 !== 0 || !b64.startsWith(GIF_B64_MAGIC)) return false;
  const valid = (i: number): boolean => {
    const c = b64.charCodeAt(i);
    return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 47 || (c === 61 && i >= n - 2);
  };
  const step = Math.max(1, Math.floor(n / 4096));
  for (let i = 0; i < n; i += step) if (!valid(i)) return false;
  for (let i = Math.max(0, n - 4); i < n; i++) if (!valid(i)) return false;
  return true;
};

export const mirrorGifDataB64 = (src: unknown): string | null => {
  if (typeof src !== 'string' || !src.startsWith('data:')) return null;
  const comma = src.indexOf(',');
  if (comma < 0 || !src.slice(0, comma).endsWith(';base64')) return null;
  const b64 = src.slice(comma + 1);
  return b64.startsWith(GIF_B64_MAGIC) && b64.length <= MIRROR_GIF_MAX_B64 ? b64 : null;
};

export const mirrorGifWants = (feature: MirrorFeature, data: unknown): Map<string, string> => {
  const out = new Map<string, string>();
  if (feature === 'members' && Array.isArray(data)) {
    for (const mm of data as MirrorMember[]) {
      if (!mm || typeof mm.id !== 'string' || !mm.id) continue;
      if (isMirrorGifHash(mm.bannerGif)) out.set(`${mm.id}#banner`, mm.bannerGif);
      for (const cf of Array.isArray(mm.customFields) ? mm.customFields : []) {
        if (cf && cf.type === 'image' && typeof cf.fieldId === 'string' && cf.fieldId && isMirrorGifHash(cf.gif)) out.set(`${mm.id}#cf:${cf.fieldId}`, cf.gif);
      }
    }
  } else if (feature === 'systemProfile' && data && typeof data === 'object') {
    const sp = data as MirrorSystemProfile;
    if (isMirrorGifHash(sp.bannerGif)) out.set(MIRROR_SYSTEM_BANNER_ID, sp.bannerGif);
  }
  return out;
};

export const sanitizeMirrorGifAsk = (v: unknown): MirrorGifAsk[] => {
  if (!Array.isArray(v)) return [];
  const out: MirrorGifAsk[] = [];
  for (const x of v.slice(0, MIRROR_GIF_ASK_MAX)) {
    if (!x || typeof x !== 'object') continue;
    const id = (x as MirrorGifAsk).id;
    const h = (x as MirrorGifAsk).h;
    if (typeof id !== 'string' || !id || id.length > 128 || !isMirrorGifHash(h)) continue;
    out.push({id, h});
  }
  return out;
};
