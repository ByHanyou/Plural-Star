import {Member, activeRosterAndFacets, memberMatchesSearch, sortMembersBySearch, tagKey} from '../utils';

export type PickerKind = 'members' | 'facets' | 'customFronts';

export type PickerPool = {kind?: PickerKind; label: string; members: Member[]};

export type PickerKinds = Record<PickerKind, boolean>;

export const PICKER_KIND_ORDER: PickerKind[] = ['members', 'facets', 'customFronts'];

export const ALL_PICKER_KINDS: PickerKinds = {members: true, facets: true, customFronts: true};

export const PICKER_RESULTS_MAX = 20;

export interface PickerAnnotation {
  label?: string;
  dim?: boolean;
}

export interface PickerGroup {
  pool: PickerPool;
  rows: Member[];
}

const PICKER_KIND_KEY: Record<PickerKind, string> = {members: 'members.title', facets: 'members.facets', customFronts: 'members.customFronts'};

export const pickerKindLabel = (kind: PickerKind, t: (k: string) => string): string => t(PICKER_KIND_KEY[kind]);

export const pickerPool = (kind: PickerKind, members: Member[], t: (k: string) => string): PickerPool =>
  ({kind, label: pickerKindLabel(kind, t), members});

export const memberFacetPools = (members: Member[], t: (k: string) => string): PickerPool[] => {
  const split = activeRosterAndFacets(members);
  return [pickerPool('members', split.members, t), pickerPool('facets', split.facets, t)];
};

export const selectionSet = (selected: Iterable<string> | string | null | undefined): Set<string> => {
  if (!selected) return new Set();
  if (typeof selected === 'string') return new Set([selected]);
  return new Set(selected);
};

export const activePickerPools = (pools: PickerPool[], kinds: PickerKinds | null): PickerPool[] =>
  kinds ? pools.filter(p => !p.kind || kinds[p.kind]) : pools;

export const pickerGroups = (pools: PickerPool[], opts: {
  query: string;
  selected: Set<string>;
  hideSelected?: boolean;
  tag?: string | null;
  maxResults?: number;
  orderRows?: (rows: Member[], pool: PickerPool) => Member[];
  keepOrder?: boolean;
}): {grouped: PickerGroup[]; total: number; shown: number} => {
  const wanted = opts.tag ? tagKey(opts.tag) : null;
  const grouped: PickerGroup[] = [];
  let budget = opts.maxResults ?? PICKER_RESULTS_MAX;
  let total = 0;
  let shown = 0;
  for (const pool of pools) {
    const matches = pool.members.filter(m => {
      if (opts.hideSelected && opts.selected.has(m.id)) return false;
      if (wanted && !(m.tags || []).some(tag => tagKey(tag) === wanted)) return false;
      return memberMatchesSearch(m, opts.query);
    });
    const sorted = opts.keepOrder ? matches : sortMembersBySearch(matches, opts.query);
    const ordered = opts.orderRows ? opts.orderRows(sorted, pool) : sorted;
    total += ordered.length;
    if (budget <= 0 || ordered.length === 0) continue;
    const rows = ordered.slice(0, budget);
    budget -= rows.length;
    shown += rows.length;
    grouped.push({pool, rows});
  }
  return {grouped, total, shown};
};
