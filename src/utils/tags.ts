import {nameCompare} from './intl';
import {asStr} from './text';

export const tagKey = (tag: string): string => asStr(tag).normalize('NFC').toLowerCase();

export const tagFromInput = (input: string): string | null => {
  const raw = asStr(input).trim().replace(/^#/, '').normalize('NFC');
  return raw ? `#${raw}` : null;
};

export const hasTag = (tags: string[], tag: string): boolean => tags.some(x => tagKey(x) === tagKey(tag));

export const withTag = (tags: string[], tag: string | null): string[] => (tag ? mergeTags(tags, [tag]) : tags);

export const uniqueTags = (tags: Iterable<string>): string[] => {
  const seen = new Map<string, string>();
  for (const tag of tags) {
    const k = tagKey(tag);
    if (!seen.has(k)) seen.set(k, tag);
  }
  return [...seen.values()].sort((a, b) => nameCompare(tagKey(a), tagKey(b)));
};

export const tagSuggestions = (pool: Iterable<string>, mine: string[], query: string, limit = 30): string[] => {
  const q = tagKey(query.trim().replace(/^#/, ''));
  return uniqueTags(pool).filter(tag => !hasTag(mine, tag) && (!q || tagKey(tag).includes(q))).slice(0, limit);
};

export const mergeTags = (cur: string[] | undefined, add: string[]): string[] => {
  const out = [...(cur || [])];
  const have = new Set(out.map(tagKey));
  for (const tag of add) {
    const k = tagKey(tag);
    if (!k || have.has(k)) continue;
    have.add(k);
    out.push(tag);
  }
  return out;
};
