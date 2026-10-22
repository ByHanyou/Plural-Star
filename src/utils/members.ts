import i18n from '../i18n/i18n';
import type {Member, MemberSortMode} from '../model/types';
import {PALETTE} from '../themeColors';
import {uid} from './collections';
import {nameCompare} from './intl';
import {tagKey} from './tags';
import {asStr} from './text';

export const isRosterMember = (m: Member): boolean =>
  !m.isCustomFront && !m.isFacet && !m.deleted;

export const isFacetMember = (m: Member): boolean =>
  !!m.isFacet && !m.isCustomFront && !m.deleted;

export const isCustomFrontMember = (m: Member): boolean =>
  !!m.isCustomFront && !m.deleted;

export const activeRosterAndFacets = (members: Member[]): {members: Member[]; facets: Member[]} => ({
  members: members.filter(m => !m.archived && isRosterMember(m)),
  facets: members.filter(m => !m.archived && isFacetMember(m)),
});

export const membersByIds = (ids: readonly string[] | undefined, lookup: ReadonlyMap<string, Member> | ((id: string) => Member | undefined)): Member[] => {
  const get = typeof lookup === 'function' ? lookup : (id: string) => lookup.get(id);
  return (ids || []).map(id => get(id)).filter((m): m is Member => !!m);
};

export const memberNames = (ids: readonly string[], members: readonly Member[]): string =>
  ids.map(id => members.find(m => m.id === id)?.name).filter(Boolean).join(', ');

export const findSelfMember = (members: Member[], selfMemberId: string | undefined): Member | undefined =>
  members.find(m => m.id === selfMemberId && isRosterMember(m))
  || members.find(m => isRosterMember(m) && !m.archived);

export const blankMember = (patch: Partial<Member> = {}): Member => ({id: uid(), name: '', pronouns: '', role: '', color: PALETTE[0], description: '', tags: [], groupIds: [], createdAt: Date.now(), ...patch});

export const randomPaletteColor = (): string => PALETTE[Math.floor(Math.random() * PALETTE.length)];

export const newSelfMember = (name: string): Member => blankMember({name, customFields: []});

export type CloneSelection = {name: boolean; pronouns: boolean; role: boolean; color: boolean; description: boolean};

export const CLONE_ALL: CloneSelection = {name: true, pronouns: true, role: true, color: true, description: true};

export const cloneMemberFrom = (f: Member, sel: CloneSelection): Member => ({
  id: uid(),
  name: sel.name && (f.name || '').trim() ? f.name : String(Math.floor(10000 + Math.random() * 90000)),
  pronouns: sel.pronouns ? (f.pronouns || '') : '',
  role: sel.role ? (f.role || '') : '',
  color: sel.color ? f.color : PALETTE[0],
  emoji: sel.color ? f.emoji : undefined,
  description: sel.description ? (f.description || '') : '',
  tags: [],
  groupIds: [],
  createdAt: Date.now(),
  isFacet: f.isFacet || undefined,
});

const DEFAULT_CUSTOM_FRONT_KEYS = ['chatty', 'nonVerbal', 'iwc', 'dni', 'blurry', 'blendy', 'rapidSwitching', 'foggy', 'grounded', 'dissociated', 'anxious', 'depressed', 'cheerful', 'happy', 'sad', 'crisis', 'melancholy', 'stimming', 'stressed', 'working', 'traveling', 'sleeping', 'hyperfocus'];

const CUSTOM_FRONT_COLORS = PALETTE;

export const makeDefaultCustomFronts = (): Member[] =>
  DEFAULT_CUSTOM_FRONT_KEYS.map((seedKey, i) => ({
    id: uid(),
    name: i18n.t(`customFronts.seed.${seedKey}`),
    seedKey,
    pronouns: '',
    role: '',
    color: CUSTOM_FRONT_COLORS[i % CUSTOM_FRONT_COLORS.length],
    description: '',
    isCustomFront: true,
    tags: [],
    groupIds: [],
    customFields: [],
  }));

export const SINGLET_HIDDEN_STATUS_NAMES = ['Blurry', 'Blendy', 'Rapid Switching', 'Dissociated'];
const SINGLET_HIDDEN_SEED_KEYS = ['blurry', 'blendy', 'rapidSwitching', 'dissociated'];
export const isSingletHiddenStatus = (m: Member): boolean =>
  m.seedKey ? SINGLET_HIDDEN_SEED_KEYS.includes(m.seedKey) : SINGLET_HIDDEN_STATUS_NAMES.includes(m.name);
export const singletStatuses = (members: Member[]): Member[] =>
  members.filter(m => m.isCustomFront && !m.archived && !isSingletHiddenStatus(m));

export const memberMatchesSearch = (m: {name: string; nickname?: string; tags?: string[]}, search: string): boolean => {
  const q = asStr(search).trim().toLowerCase();
  if (!q) return true;
  return asStr(m.name).toLowerCase().includes(q) || asStr(m.nickname || '').toLowerCase().includes(q)
    || (m.tags || []).some(tag => tagKey(tag).includes(q));
};

export const sortMembersBySearch = <T extends {name: string; nickname?: string}>(items: T[], search: string): T[] => {
  if (!search) return [...items].sort((a, b) => nameCompare(a.name, b.name));
  const q = search.toLowerCase();
  const starts = (x: T) => asStr(x.name).toLowerCase().startsWith(q) || asStr(x.nickname || '').toLowerCase().startsWith(q);
  return [...items].sort((a, b) => {
    const aStarts = starts(a);
    const bStarts = starts(b);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return nameCompare(asStr(a.name).toLowerCase(), asStr(b.name).toLowerCase());
  });
};

export const MEMBER_SORT_MODES: readonly MemberSortMode[] = ['alphabetical', 'reverse-alphabetical', 'age', 'color', 'role', 'manual'];

export const sortMembers = (members: Member[], mode: MemberSortMode = 'alphabetical'): Member[] => {
  const sorted = [...members];
  switch (mode) {
    case 'alphabetical': return sorted.sort((a, b) => nameCompare(a.name, b.name));
    case 'reverse-alphabetical': return sorted.sort((a, b) => nameCompare(b.name, a.name));
    case 'age': return sorted.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    case 'color': return sorted.sort((a, b) => asStr(a.color).localeCompare(asStr(b.color)));
    case 'role': return sorted.sort((a, b) => nameCompare(a.role, b.role));
    case 'manual': return sorted.sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER));
    default: return sorted;
  }
};
