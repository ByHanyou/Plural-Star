import type {FrontSortMode, FrontState, FrontTier, FrontTierKey, HistoryChangeType, HistoryEntry, Member} from '../model/types';
import {asRecord} from './collections';
import {nameCompare} from './intl';

export const TIER_I18N_KEY: Record<FrontTierKey, string> = {
  primary: 'tier.primaryFront',
  coFront: 'tier.coFront',
  coConscious: 'tier.coConscious',
};
export const TIER_SHORT_I18N_KEY: Record<FrontTierKey, string> = {
  primary: 'tier.primaryShort',
  coFront: 'tier.coFrontShort',
  coConscious: 'tier.coConShort',
};
export const FRONT_TIER_KEYS: readonly FrontTierKey[] = ['primary', 'coFront', 'coConscious'];

export const EMPTY_TIER: FrontTier = {memberIds: [], note: ''};

const stringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const optString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const optNumber = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

const parseFrontTier = (v: unknown): FrontTier => {
  const r = asRecord(v);
  return {
    memberIds: stringList(r?.memberIds),
    mood: optString(r?.mood),
    note: optString(r?.note) || '',
    location: optString(r?.location),
    energyLevel: optNumber(r?.energyLevel),
  };
};

export const migrateFrontState = (raw: unknown): FrontState | null => {
  const r = asRecord(raw);
  if (!r) return null;
  if (r.primary) {
    const sinceRaw = asRecord(r.memberSince);
    const memberSince: Record<string, number> = {};
    if (sinceRaw) {
      for (const [id, at] of Object.entries(sinceRaw)) {
        const n = optNumber(at);
        if (n !== undefined) memberSince[id] = n;
      }
    }
    return {
      primary: parseFrontTier(r.primary),
      coFront: parseFrontTier(r.coFront),
      coConscious: parseFrontTier(r.coConscious),
      startTime: optNumber(r.startTime) ?? Date.now(),
      ...(sinceRaw ? {memberSince} : {}),
    };
  }
  return {
    primary: parseFrontTier(r),
    coFront: {memberIds: [], note: ''},
    coConscious: {memberIds: [], note: ''},
    startTime: optNumber(r.startTime) || Date.now(),
  };
};

export const SESSION_JOIN_MS = 1000;

export const historyTierIds = (entry: HistoryEntry, tier: FrontTierKey): string[] =>
  (tier === 'coFront' ? entry.coFrontIds : tier === 'coConscious' ? entry.coConsciousIds : entry.memberIds) || [];

export const historyTier = (entry: HistoryEntry, tier: FrontTierKey): FrontTier => {
  const memberIds = historyTierIds(entry, tier);
  if (tier === 'coFront') return {memberIds, mood: entry.coFrontMood, note: entry.coFrontNote || '', location: entry.coFrontLocation, energyLevel: entry.coFrontEnergy};
  if (tier === 'coConscious') return {memberIds, mood: entry.coConsciousMood, note: entry.coConsciousNote || '', location: entry.coConsciousLocation, energyLevel: entry.coConsciousEnergy};
  return {memberIds, mood: entry.mood, note: entry.note || '', location: entry.location, energyLevel: entry.energyLevel};
};

export const historyTierOf = (entry: HistoryEntry, memberId: string): FrontTierKey | null =>
  FRONT_TIER_KEYS.find(tier => historyTierIds(entry, tier).includes(memberId)) ?? null;

export const historyAllIds = (entry: HistoryEntry): string[] =>
  FRONT_TIER_KEYS.flatMap(tier => historyTierIds(entry, tier));

const historyEntryToFrontState = (entry: HistoryEntry): FrontState => ({
  primary: historyTier(entry, 'primary'),
  coFront: historyTier(entry, 'coFront'),
  coConscious: historyTier(entry, 'coConscious'),
  startTime: entry.startTime,
});

export const isFrontEntry = (e: HistoryEntry): boolean => !e.changeType || e.changeType === 'front';

export const isOpenFrontEntry = (e: HistoryEntry, startTime: number): boolean =>
  e.endTime === null && e.startTime === startTime && isFrontEntry(e);

export const findOpenFrontInHistory = (history: HistoryEntry[]): FrontState | null => {
  const openFrontEntry = history.find(entry =>
    entry.endTime === null &&
    FRONT_TIER_KEYS.some(tier => historyTierIds(entry, tier).length > 0) &&
    isFrontEntry(entry)
  );

  return openFrontEntry ? historyEntryToFrontState(openFrontEntry) : null;
};

export const buildEffectiveEnd = (history: HistoryEntry[]): ((e: HistoryEntry) => number | null) => {
  const starts = history
    .filter(isFrontEntry)
    .map(e => e.startTime)
    .sort((a, b) => a - b);
  return (e: HistoryEntry): number | null => {
    if (e.endTime != null) return e.endTime;
    let lo = 0; let hi = starts.length - 1; let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] > e.startTime) { ans = mid; hi = mid - 1; } else { lo = mid + 1; }
    }
    return ans === -1 ? null : starts[ans];
  };
};

export const isFrontEmpty = (f: FrontState | null): boolean =>
  !f || (f.primary.memberIds.length === 0 && f.coFront.memberIds.length === 0 && f.coConscious.memberIds.length === 0);

export const allFrontMemberIds = (f: FrontState | null): string[] =>
  f ? [...f.primary.memberIds, ...f.coFront.memberIds, ...f.coConscious.memberIds] : [];

export const statusIdsOf = (f: FrontState | null | undefined, selfId?: string): string[] =>
  (f?.primary.memberIds || []).filter(id => id !== selfId);

export const pruneFrontOfGone = (members: Member[], front: FrontState | null): FrontState | null | undefined => {
  if (!front) return undefined;
  const gone = new Set(members.filter(m => m.archived || m.deleted).map(m => m.id));
  if (gone.size === 0) return undefined;
  const pruneTier = (tier: FrontTier): FrontTier => ({...tier, memberIds: tier.memberIds.filter(id => !gone.has(id))});
  const next: FrontState = {...front, primary: pruneTier(front.primary), coFront: pruneTier(front.coFront), coConscious: pruneTier(front.coConscious)};
  if (allFrontMemberIds(next).length === allFrontMemberIds(front).length) return undefined;
  return isFrontEmpty(next) ? null : next;
};

export const frontTiersWithout = (front: FrontState | null, memberId: string): Record<FrontTierKey, FrontTier> => {
  const strip = (tier: FrontTierKey): FrontTier =>
    front ? {...front[tier], memberIds: front[tier].memberIds.filter(id => id !== memberId)} : {memberIds: [], note: ''};
  return {primary: strip('primary'), coFront: strip('coFront'), coConscious: strip('coConscious')};
};

export const frontTiersWith = (front: FrontState | null, memberId: string, tier: FrontTierKey): Record<FrontTierKey, FrontTier> => {
  const tiers = frontTiersWithout(front, memberId);
  tiers[tier] = {...tiers[tier], memberIds: [...tiers[tier].memberIds, memberId]};
  return tiers;
};
export const frontersFirst = <T extends {id: string}>(items: T[], front: FrontState | null): T[] => {
  const ids = allFrontMemberIds(front);
  if (ids.length === 0) return items;
  const rank = new Map<string, number>();
  ids.forEach((id, i) => { if (!rank.has(id)) rank.set(id, i); });
  const fronting: T[] = [];
  const rest: T[] = [];
  for (const it of items) (rank.has(it.id) ? fronting : rest).push(it);
  fronting.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...fronting, ...rest];
};

export const withMemberSince = (next: FrontState | null, prev: FrontState | null, now: number): FrontState | null => {
  if (!next) return next;
  const prevSince = prev?.memberSince || {};
  const prevIds = new Set(prev ? allFrontMemberIds(prev) : []);
  const since: Record<string, number> = {};
  for (const id of allFrontMemberIds(next)) {
    since[id] = prevIds.has(id) ? (prevSince[id] ?? prev?.startTime ?? now) : now;
  }
  return {...next, memberSince: since};
};

export interface FrontTimes {
  primary: {memberIds: string[]};
  coFront: {memberIds: string[]};
  coConscious: {memberIds: string[]};
  startTime: number;
  memberSince?: Record<string, number>;
}

export const frontSessionStart = (f: FrontTimes, include?: (id: string) => boolean): number => {
  const since = f.memberSince || {};
  const segment = f.startTime > 0 ? f.startTime : 0;
  for (const key of FRONT_TIER_KEYS) {
    const ids = f[key].memberIds.filter(id => !include || include(id));
    if (ids.length === 0) continue;
    let earliest = segment;
    for (const id of ids) {
      const at = since[id];
      if (typeof at === 'number' && Number.isFinite(at) && at > 0 && (earliest === 0 || at < earliest)) earliest = at;
    }
    return earliest || f.startTime;
  }
  return f.startTime;
};

export const frontToHistoryEntry = (f: FrontState, endTime: number | null, changeType: HistoryChangeType = 'front', changeTier?: FrontTierKey): HistoryEntry => ({
  memberIds: f.primary.memberIds,
  startTime: f.startTime,
  endTime,
  note: f.primary.note,
  mood: f.primary.mood,
  location: f.primary.location,
  energyLevel: f.primary.energyLevel,
  coFrontIds: f.coFront.memberIds.length > 0 ? f.coFront.memberIds : undefined,
  coFrontMood: f.coFront.mood,
  coFrontNote: f.coFront.note || undefined,
  coFrontEnergy: f.coFront.energyLevel,
  coFrontLocation: f.coFront.location || undefined,
  coConsciousIds: f.coConscious.memberIds.length > 0 ? f.coConscious.memberIds : undefined,
  coConsciousMood: f.coConscious.mood,
  coConsciousNote: f.coConscious.note || undefined,
  coConsciousEnergy: f.coConscious.energyLevel,
  coConsciousLocation: f.coConscious.location || undefined,
  changeType,
  changeTime: changeType !== 'front' ? Date.now() : undefined,
  changeTier,
});

export interface FrontWrite {
  front: FrontState | null;
  history: HistoryEntry[];
}

export interface TierDetailChanges {
  mood: boolean;
  location: boolean;
  note: boolean;
}

const differs = (a: string | undefined, b: string | undefined): boolean => (a || undefined) !== (b || undefined);

export const tierDetailChanges = (prev: FrontTier, next: FrontTier): TierDetailChanges => ({
  mood: differs(next.mood, prev.mood),
  location: differs(next.location, prev.location),
  note: differs(next.note, prev.note),
});

export const detailChangeEntries = (f: FrontState, changed: TierDetailChanges, now: number, tier?: FrontTierKey): HistoryEntry[] => {
  const out: HistoryEntry[] = [];
  if (changed.mood || changed.location) out.push({...frontToHistoryEntry(f, null, changed.mood ? 'mood' : 'location', tier), changeTime: now});
  if (changed.note) out.push({...frontToHistoryEntry(f, null, 'note', tier), changeTime: now + 1});
  return out;
};

export const closeOpenFrontEntry = (history: HistoryEntry[], startTime: number, now: number): HistoryEntry[] =>
  history.map(e => (isOpenFrontEntry(e, startTime) ? {...e, endTime: now} : e));

export const computeFrontUpdate = (
  front: FrontState | null,
  history: HistoryEntry[],
  primary: FrontTier,
  coFront: FrontTier,
  coConscious: FrontTier,
  now: number = Date.now(),
): FrontWrite => {
  const cleanTier = (tier: FrontTier): FrontTier =>
    tier.memberIds.length === 0
      ? {memberIds: [], mood: undefined, note: '', location: undefined, energyLevel: undefined}
      : tier;
  const cleanPrimary = cleanTier(primary);
  const cleanCoFront = cleanTier(coFront);
  const cleanCoConscious = cleanTier(coConscious);
  const isEmpty = cleanPrimary.memberIds.length === 0 && cleanCoFront.memberIds.length === 0 && cleanCoConscious.memberIds.length === 0;

  const sameMembers = (a: string[] = [], b: string[] = []) =>
    a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
  const continued = front && !isEmpty
    && sameMembers(front.primary.memberIds, cleanPrimary.memberIds)
    && sameMembers(front.coFront.memberIds, cleanCoFront.memberIds)
    && sameMembers(front.coConscious.memberIds, cleanCoConscious.memberIds)
    ? front : null;

  const explicitLocation = cleanPrimary.location?.trim() || undefined;
  const nf: FrontState | null = isEmpty ? null : withMemberSince({primary: {...cleanPrimary, location: explicitLocation}, coFront: cleanCoFront, coConscious: cleanCoConscious, startTime: continued ? continued.startTime : now}, front, now);

  let newHistory = [...history];
  if (front && !continued) {
    newHistory = closeOpenFrontEntry(newHistory, front.startTime, now);
  }

  let finalFront = nf;
  if (nf) {
    if (continued) {
      const changed = tierDetailChanges(continued.primary, nf.primary);
      const extras = detailChangeEntries(nf, changed, now);
      const tierTracked = (a: FrontTier, b: FrontTier) =>
        differs(a.mood, b.mood) || (a.energyLevel ?? undefined) !== (b.energyLevel ?? undefined);
      const segment = tierTracked(nf.primary, continued.primary) || tierTracked(nf.coFront, continued.coFront)
        || tierTracked(nf.coConscious, continued.coConscious) || changed.location;
      if (segment) {
        finalFront = {...nf, startTime: now};
        const segEntry = frontToHistoryEntry(finalFront, null, 'front');
        newHistory = closeOpenFrontEntry(newHistory, continued.startTime, now);
        newHistory = [segEntry, ...extras, ...newHistory];
      } else {
        const frontEntry = frontToHistoryEntry(nf, null, 'front');
        newHistory = newHistory.map(e => (isOpenFrontEntry(e, continued.startTime) ? frontEntry : e));
        newHistory = [...extras, ...newHistory];
      }
    } else {
      const frontEntry = frontToHistoryEntry(nf, null, 'front');
      newHistory = [frontEntry, ...newHistory];
    }
  }

  return {front: finalFront, history: newHistory};
};

export const orderFronters = (ids: string[], mode: FrontSortMode | undefined, nameOf: (id: string) => string, custom?: string[]): string[] => {
  if (mode === 'az') return [...ids].sort((a, b) => nameCompare(nameOf(a), nameOf(b)));
  if (mode === 'za') return [...ids].sort((a, b) => nameCompare(nameOf(b), nameOf(a)));
  if (mode === 'custom' && custom && custom.length > 0) {
    const rank = new Map(custom.map((id, i) => [id, i]));
    return ids
      .map((id, i) => ({id, key: rank.get(id) ?? custom.length + i}))
      .sort((a, b) => a.key - b.key)
      .map(x => x.id);
  }
  return ids;
};

export const placeInCustomOrder = (custom: string[] | undefined, ordered: string[], keep: (id: string) => boolean): string[] => {
  const tier = [...new Set(ordered)];
  const inTier = new Set(tier);
  const base = [...new Set((custom || []).filter(id => inTier.has(id) || keep(id)))];
  for (const id of tier) if (!base.includes(id)) base.push(id);
  let k = 0;
  return base.map(id => (inTier.has(id) ? tier[k++] : id));
};
