import {HistoryEntry, Member, FrontTierKey, DAY_MS, FRONT_TIER_KEYS, historyTierIds, isFrontEntry, localDateKey, membersByIds, nameCompare} from '../utils';

export type RangeKey = 'day' | 'week' | 'month' | 'quarter';

export const RANGE_MS: Record<RangeKey, number> = {
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
  quarter: 90 * DAY_MS,
};

export const RANGE_KEYS: RangeKey[] = ['day', 'week', 'month', 'quarter'];

export const RANGE_LABEL: Record<RangeKey, string> = {day: 'history.tlDay', week: 'history.tlWeek', month: 'history.tlMonth', quarter: 'history.tlQuarter'};

export type TimelineInterval = {start: number; end: number | null};
export type TimelineEntry = TimelineInterval & {
  key: string;
  tiers: {tier: FrontTierKey; members: Member[]}[];
};
export type Span = TimelineInterval & {tier: FrontTierKey};

export type Row = {member: Member; spans: Span[]; total: number};

export const TIER_BAR: Record<FrontTierKey, {height: number; opacity: number}> = {
  primary: {height: 16, opacity: 1},
  coFront: {height: 16, opacity: 0.75},
  coConscious: {height: 7, opacity: 0.45},
};

export const timelineEntriesInRange = (
  history: HistoryEntry[], members: Member[], start: number, end: number, effectiveEnd: (entry: HistoryEntry) => number | null,
): TimelineEntry[] => {
  const memberMap = new Map(members.filter(m => m && !m.deleted).map(m => [m.id, m]));
  const entries: TimelineEntry[] = [];
  const startsSeen = new Map<number, number>();
  for (const entry of history) {
    if (!entry || !isFrontEntry(entry) || !Number.isFinite(entry.startTime) || entry.startTime >= end) continue;
    const until = effectiveEnd(entry);
    if (until != null && (!Number.isFinite(until) || until <= Math.max(entry.startTime, start))) continue;
    const tiers: TimelineEntry['tiers'] = [];
    for (const tier of FRONT_TIER_KEYS) {
      const present = membersByIds(historyTierIds(entry, tier), memberMap);
      if (present.length) tiers.push({tier, members: present});
    }
    if (!tiers.length) continue;
    const n = startsSeen.get(entry.startTime) ?? 0;
    startsSeen.set(entry.startTime, n + 1);
    entries.push({key: `${entry.startTime}-${n}`, start: entry.startTime, end: until, tiers});
  }
  return entries.sort((a, b) => a.start - b.start);
};

export type VerticalRow =
  | {kind: 'day'; key: string; at: number}
  | {kind: 'entry'; key: string; entry: TimelineEntry};

export const verticalTimelineRows = (entries: TimelineEntry[], start: number, newestFirst: boolean): VerticalRow[] => {
  const rows: VerticalRow[] = [];
  let previousDay = '';
  for (const entry of newestFirst ? [...entries].reverse() : entries) {
    const at = Math.max(entry.start, start);
    const day = localDateKey(new Date(at));
    if (day !== previousDay) rows.push({kind: 'day', key: day, at});
    previousDay = day;
    rows.push({kind: 'entry', key: entry.key, entry});
  }
  return rows;
};

export const buildTimelineRows = (entries: TimelineEntry[], start: number, end: number): Row[] => {
  const byMember = new Map<string, Row>();
  for (const entry of entries) {
    const visibleMs = Math.min(entry.end ?? end, end) - Math.max(entry.start, start);
    for (const {tier, members} of entry.tiers) {
      for (const member of members) {
        let row = byMember.get(member.id);
        if (!row) {
          row = {member, spans: [], total: 0};
          byMember.set(member.id, row);
        }
        row.spans.push({start: entry.start, end: entry.end, tier});
        if (tier !== 'coConscious') row.total += visibleMs;
      }
    }
  }
  return [...byMember.values()].sort((a, b) => b.total - a.total || nameCompare(a.member.name, b.member.name));
};
