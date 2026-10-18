import i18n from '../i18n/i18n';

type Translate = (key: string, opts?: Record<string, unknown>) => string;

const PATTERN_KEYS: string[] = ['share.fieldN', 'share.systemN', 'share.groupN', 'share.channelN'];
const PLAIN_KEYS: string[] = ['share.unnamedMember', 'share.ageField', 'common.unknown', 'memberGroups.group'];
const MARK = '\u0001';

export const makeImportNameKey = (t: Translate, langs: string[]) => {
  const cache = new Map<string, string>();
  return (name: unknown): string => {
    const s = String(name ?? '').trim().toLowerCase();
    if (!s) return s;
    const hit = cache.get(s);
    if (hit !== undefined) return hit;
    let out = s;
    found: {
      for (const key of PLAIN_KEYS) for (const lng of langs) {
        if (String(t(key, {lng})).trim().toLowerCase() === s) { out = `\u0000${key}`; break found; }
      }
      for (const key of PATTERN_KEYS) for (const lng of langs) {
        const parts = String(t(key, {n: MARK, lng})).toLowerCase().split(MARK);
        if (parts.length !== 2) continue;
        const [a, b] = parts;
        if (s.length > a.length + b.length && s.startsWith(a) && s.endsWith(b)) {
          const mid = s.slice(a.length, s.length - b.length);
          if (/^\d+$/.test(mid)) { out = `\u0000${key}:${Number(mid)}`; break found; }
        }
      }
    }
    cache.set(s, out);
    return out;
  };
};

let current: {lang: string; fn: (name: unknown) => string} | null = null;

export const importNameKey = (name: unknown): string => {
  const lang = String(i18n.language || 'en');
  if (!current || current.lang !== lang) {
    current = {lang, fn: makeImportNameKey((key, opts) => String(i18n.t(key as never, opts as never)), lang === 'en' ? ['en'] : [lang, 'en'])};
  }
  return current.fn(name);
};
