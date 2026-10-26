import {EMPTY_TIER, FrontState, FrontTier, FrontTierKey, HistoryEntry, buildEffectiveEnd, frontToHistoryEntry, historyTier, isFrontEntry} from '../utils';

export interface RetroTierDraft {
  ids: string[];
  mood: string;
  location: string;
  note: string;
  energy?: number;
}

export type RetroDrafts = Record<FrontTierKey, RetroTierDraft>;

const retroDraftFrom = (e: HistoryEntry | undefined, tier: FrontTierKey): RetroTierDraft => {
  const d = e ? historyTier(e, tier) : EMPTY_TIER;
  return {ids: d.memberIds, mood: d.mood || '', location: d.location || '', note: d.note || '', energy: d.energyLevel};
};

export const retroDraftsFrom = (e: HistoryEntry | undefined, dropId?: string): RetroDrafts => {
  const primary = retroDraftFrom(e, 'primary');
  return {
    primary: {...primary, ids: primary.ids.filter(id => id !== dropId)},
    coFront: retroDraftFrom(e, 'coFront'),
    coConscious: retroDraftFrom(e, 'coConscious'),
  };
};

export const retroHasMembers = (d: RetroDrafts): boolean =>
  d.primary.ids.length > 0 || d.coFront.ids.length > 0 || d.coConscious.ids.length > 0;

const retroTier = (d: RetroTierDraft, ids: string[] = d.ids): FrontTier => ({
  memberIds: ids,
  note: d.note,
  mood: d.mood || undefined,
  location: d.location || undefined,
  energyLevel: d.energy,
});

export const retroFront = (d: RetroDrafts, primaryIds: string[], start: number): FrontState => ({
  primary: retroTier(d.primary, primaryIds),
  coFront: retroTier(d.coFront),
  coConscious: retroTier(d.coConscious),
  startTime: start,
});

export const retroEntry = (d: RetroDrafts, primaryIds: string[], start: number, end: number | null): HistoryEntry =>
  frontToHistoryEntry(retroFront(d, primaryIds, start), end);

const mergeTier = (tier: FrontTier, d: RetroTierDraft, ids: string[]): FrontTier => ({
  memberIds: [...tier.memberIds, ...ids.filter(id => !tier.memberIds.includes(id))],
  mood: d.mood || tier.mood,
  note: d.note || tier.note || '',
  location: d.location || tier.location,
  energyLevel: d.energy ?? tier.energyLevel,
});

export const mergeRetroIntoFront = (front: FrontState, d: RetroDrafts, primaryIds: string[]): FrontState => ({
  primary: mergeTier(front.primary, d.primary, primaryIds),
  coFront: mergeTier(front.coFront, d.coFront, d.coFront.ids),
  coConscious: mergeTier(front.coConscious, d.coConscious, d.coConscious.ids),
  startTime: front.startTime,
});

export const historyEntryKey = (e: HistoryEntry): string => `${e.startTime}-${(e.memberIds || []).join(',')}`;

export const findRetroOverlaps = (history: HistoryEntry[], start: number, end: number | null, skipIndex?: number): HistoryEntry[] => {
  const now = Date.now();
  const until = end ?? now;
  const effectiveEnd = buildEffectiveEnd(history);
  return history.filter((e, i) => !!e.startTime && i !== skipIndex && isFrontEntry(e) && e.startTime < until && start < (effectiveEnd(e) ?? now));
};

export const insertHistoryEntry = (history: HistoryEntry[], entry: HistoryEntry, opts: {dropKeys?: Set<string>; replaceIndex?: number} = {}): HistoryEntry[] => {
  const {dropKeys, replaceIndex} = opts;
  const replacing = replaceIndex !== undefined && replaceIndex >= 0 ? history[replaceIndex] : undefined;
  const replacingKey = replacing ? historyEntryKey(replacing) : null;
  const kept = history.filter((e, i) => {
    if (dropKeys && dropKeys.has(historyEntryKey(e))) return false;
    if (!replacing) return true;
    return dropKeys ? historyEntryKey(e) !== replacingKey : i !== replaceIndex;
  });
  return [entry, ...kept].sort((a, b) => b.startTime - a.startTime);
};
