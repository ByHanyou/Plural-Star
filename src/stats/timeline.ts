import {HistoryEntry, Member, FrontTierKey, DAY_MS, FRONT_TIER_KEYS, nameCompare, buildEffectiveEnd, historyTierIds, isFrontEntry} from '../utils';

export type RangeKey = 'day' | 'week' | 'month' | 'quarter';

export const RANGE_MS: Record<RangeKey, number> = {
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
  quarter: 90 * DAY_MS,
};

export const RANGE_KEYS: RangeKey[] = ['day', 'week', 'month', 'quarter'];

export const RANGE_LABEL: Record<RangeKey, string> = {day: 'history.tlDay', week: 'history.tlWeek', month: 'history.tlMonth', quarter: 'history.tlQuarter'};

export type Span = {start: number; end: number; tier: FrontTierKey; open: boolean};

export type Row = {member: Member; spans: Span[]; total: number};

export const TIER_BAR: Record<FrontTierKey, {height: number; opacity: number}> = {
  primary: {height: 16, opacity: 1},
  coFront: {height: 16, opacity: 0.75},
  coConscious: {height: 7, opacity: 0.45},
};

export const buildTimelineRows = (history: HistoryEntry[], members: Member[], start: number, end: number, now: number): Row[] => {
  const memberMap = new Map<string, Member>();
  for (const m of members) if (m && !m.deleted) memberMap.set(m.id, m);
  const effEnd = buildEffectiveEnd(history);
  const byMember = new Map<string, Row>();
  for (const e of history) {
    if (!e || !isFrontEntry(e)) continue;
    if (!e.startTime) continue;
    const eff = effEnd(e);
    const open = eff == null;
    const rawEnd = eff ?? now;
    if (e.startTime >= end || rawEnd <= start) continue;
    const s = Math.max(e.startTime, start);
    const en = Math.min(rawEnd, end);
    if (en <= s) continue;
    for (const tier of FRONT_TIER_KEYS) {
      for (const id of historyTierIds(e, tier)) {
        const member = memberMap.get(id);
        if (!member) continue;
        let row = byMember.get(id);
        if (!row) {
          row = {member, spans: [], total: 0};
          byMember.set(id, row);
        }
        row.spans.push({start: s, end: en, tier, open});
        if (tier !== 'coConscious') row.total += en - s;
      }
    }
  }
  return [...byMember.values()].sort((a, b) => b.total - a.total || nameCompare(a.member.name, b.member.name));
};
