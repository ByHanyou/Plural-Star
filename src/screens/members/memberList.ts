import {Member, MemberSortMode, nameCompare, sortMembers, tagKey, upperRune} from '../../utils';
import type {MemberTab} from './shared';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const LETTER_RE: RegExp | null = (() => { try { return new RegExp('^\\p{L}$', 'u'); } catch { return null; } })();
const isRailLetter = (c: string): boolean => (LETTER_RE ? LETTER_RE.test(c) : c.toLowerCase() !== c.toUpperCase());
const railFirstChar = (name: string): string =>
  upperRune(Array.from((Array.from((name || '').trim())[0] || '').normalize('NFD'))[0] || '');

export const tabOf = (m: Member): MemberTab => (m.isCustomFront ? 'customFronts' : m.isFacet ? 'facets' : 'active');

export const countByTab = (members: Member[], archiveOnly: boolean): Record<MemberTab, number> => {
  const counts: Record<MemberTab, number> = {active: 0, facets: 0, customFronts: 0};
  for (const m of members) {
    if (!m.deleted && archiveOnly === !!m.archived) counts[tabOf(m)]++;
  }
  return counts;
};

export const filterMembers = (tabMembers: Member[], query: string, activeGroupIds: Set<string> | null, activeTagKey: string | null, sortMode: MemberSortMode): Member[] => {
  const q = query.toLowerCase();
  return sortMembers(tabMembers.filter(m => {
    const textMatch = !q || [m.name, m.nickname, m.role].some(v => String(v ?? '').toLowerCase().includes(q))
      || (m.tags || []).some(tag => tagKey(tag).includes(q));
    const groupMatch = !activeGroupIds || (m.groupIds || []).some(id => activeGroupIds.has(id));
    const tagMatch = !activeTagKey || (m.tags || []).some(tag => tagKey(tag) === activeTagKey);
    return textMatch && groupMatch && tagMatch;
  }), sortMode);
};

export const letterIndex = (list: Member[], letter: string, sortMode: MemberSortMode): number => {
  let idx = list.findIndex(m => railFirstChar(m.name) === letter);
  if (idx < 0) {
    const sign = sortMode === 'reverse-alphabetical' ? -1 : 1;
    idx = list.findIndex(m => nameCompare(railFirstChar(m.name), letter) * sign > 0);
  }
  if (idx < 0) idx = list.length - 1;
  return idx;
};

export const railLettersFor = (list: Member[], sortMode: MemberSortMode): string[] => {
  const set = new Set(ALPHABET);
  for (const m of list) {
    const c = railFirstChar(m.name);
    if (c && Array.from(c).length === 1 && isRailLetter(c)) set.add(c);
  }
  const letters = [...set].sort(nameCompare);
  return sortMode === 'reverse-alphabetical' ? letters.reverse() : letters;
};
