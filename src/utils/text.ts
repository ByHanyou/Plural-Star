export const truncateRunes = (s: string, max: number, ellipsis = ''): string => {
  const runes = Array.from(String(s ?? ''));
  if (runes.length <= max) return runes.join('');
  return runes.slice(0, Math.max(0, max)).join('') + ellipsis;
};

const isEmojiModifier = (cp: number): boolean =>
  cp === 0x200d || cp === 0xfe0e || cp === 0xfe0f || (cp >= 0x1f3fb && cp <= 0x1f3ff) || cp === 0x20e3 || (cp >= 0xe0020 && cp <= 0xe007f);
const isRegionalIndicator = (cp: number): boolean => cp >= 0x1f1e6 && cp <= 0x1f1ff;

export const emojiClusters = (s: string): string[] => {
  const cps = Array.from(s);
  const out: string[] = [];
  let i = 0;
  while (i < cps.length) {
    let cluster = cps[i];
    const cp = cps[i].codePointAt(0) ?? 0;
    i++;
    if (isRegionalIndicator(cp) && i < cps.length && isRegionalIndicator(cps[i].codePointAt(0) ?? 0)) {
      cluster += cps[i];
      i++;
    }
    while (i < cps.length) {
      const next = cps[i].codePointAt(0) ?? 0;
      if (!isEmojiModifier(next)) break;
      cluster += cps[i];
      i++;
      if (next === 0x200d && i < cps.length) {
        cluster += cps[i];
        i++;
      }
    }
    out.push(cluster);
  }
  return out;
};

export const normalizeMemberEmoji = (v: string): string | undefined => {
  const s = emojiClusters(String(v ?? '').replace(/\s+/g, '')).slice(0, 3).join('').replace(/\u200D+$/, '');
  return s || undefined;
};

export const upperRune = (ch: string): string => {
  const up = ch.toUpperCase();
  const cp = up.codePointAt(0) ?? 0;
  if (cp >= 0x1c90 && cp <= 0x1cbf) return ch;
  return up;
};

export const upperText = (s: string): string => Array.from(String(s ?? '')).map(upperRune).join('');

export const lowerRune = (ch: string): string => {
  const low = ch.toLowerCase();
  const cp = low.codePointAt(0) ?? 0;
  if (cp >= 0xab70 && cp <= 0xabbf) return ch;
  return low;
};

export const fileSlug = (name: string, fallback = 'plural-star'): string => {
  const cleaned = String(name ?? '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001F\u007F]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  const slug = Array.from(truncateRunes(cleaned, 60)).map(lowerRune).join('').replace(/^-+|-+$/g, '');
  return slug || fallback;
};

export const getInitials = (name: string): string =>
  Array.from(String(name ?? '').split(' ').map(w => Array.from(w)[0] ?? '').join('')).slice(0, 2).map(ch => {
    const up = upperRune(ch);
    return Array.from(up).length === 1 ? up : ch;
  }).join('');

export const asStr = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
