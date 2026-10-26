import {HistoryChangeType, HistoryEntry, JournalEntry, FrontTierKey, SESSION_JOIN_MS, byValueDesc, countUp, fmtDate, historyTier, historyTierOf, isFrontEntry} from '../utils';

export type TierDetails = {mood?: string; note?: string; location?: string; energy?: number};
export type MemberHistoryEvent = {type: HistoryChangeType; time: number; tier?: FrontTierKey; entry: HistoryEntry};
export type MemberJournalEvent = {type: 'journal'; time: number; journalEntry: JournalEntry};
export type MemberEvent = MemberHistoryEvent | MemberJournalEvent;
export type MemberSummary = {topMood?: string; topLoc?: string; avgEnergy: number | null};
export type FrontSession = {startTime: number; endTime: number | null; tier: FrontTierKey; last: HistoryEntry; count: number};
export type FrontHistoryRow =
  | {kind: 'header'; key: string; date: string}
  | {kind: 'entry'; key: string; entry: HistoryEntry; isLastInGroup: boolean; originalIndex: number; effectiveEnd: number | null};

export const detailsForTier = (entry: HistoryEntry, tier?: FrontTierKey | null): TierDetails => {
  const d = historyTier(entry, tier || 'primary');
  return {mood: d.mood, note: d.note || undefined, location: d.location, energy: d.energyLevel};
};

const tierDetailsFor = (memberId: string, entry: HistoryEntry): TierDetails => detailsForTier(entry, historyTierOf(entry, memberId));

export const hasEntry = (e: MemberEvent): e is MemberHistoryEvent => 'entry' in e;

const topCount = (values: (string | undefined)[]): string | undefined => {
  const counts = new Map<string, number>();
  for (const v of values) if (v) countUp(counts, v);
  return byValueDesc(counts)[0]?.[0];
};

export const sessionsTotalMs = (sessions: FrontSession[], effEnd: (e: HistoryEntry) => number | null): number => {
  const now = Date.now();
  return sessions.reduce((sum, m) => sum + Math.max(0, (m.endTime ?? (m.count > 1 ? now : (effEnd(m.last) ?? now))) - m.startTime), 0);
};

export const frontHistoryRows = (history: HistoryEntry[], effEnd: (e: HistoryEntry) => number | null): FrontHistoryRow[] => {
  const frontHistory = history.filter(isFrontEntry);
  if (frontHistory.length === 0) return [];
  const frontGroups: Record<string, HistoryEntry[]> = {};
  for (const e of frontHistory) {
    const k = fmtDate(e.startTime);
    if (!frontGroups[k]) frontGroups[k] = [];
    frontGroups[k].push(e);
  }
  const indexMap = new Map<HistoryEntry, number>();
  history.forEach((e, i) => { indexMap.set(e, i); });
  const rows: FrontHistoryRow[] = [];
  for (const [date, entries] of Object.entries(frontGroups)) {
    rows.push({kind: 'header', key: `h-${date}`, date});
    entries.forEach((entry, i) => {
      rows.push({
        kind: 'entry',
        key: `e-${entry.startTime}-${i}`,
        entry,
        isLastInGroup: i === entries.length - 1,
        originalIndex: indexMap.get(entry) ?? -1,
        effectiveEnd: effEnd(entry),
      });
    });
  }
  return rows;
};

export const mergedFrontSessions = (history: HistoryEntry[], memberId: string): FrontSession[] => {
  const fronts = history
    .filter(e => isFrontEntry(e) && historyTierOf(e, memberId) !== null)
    .sort((a, b) => a.startTime - b.startTime);
  const out: FrontSession[] = [];
  for (const e of fronts) {
    const tier = historyTierOf(e, memberId) || 'primary';
    const prev = out[out.length - 1];
    if (prev && prev.tier === tier && prev.endTime !== null && Math.abs(e.startTime - prev.endTime) <= SESSION_JOIN_MS) {
      prev.endTime = e.endTime;
      prev.last = e;
      prev.count += 1;
    } else {
      out.push({startTime: e.startTime, endTime: e.endTime, tier, last: e, count: 1});
    }
  }
  return out;
};

export const memberEvents = (memberId: string, sessions: FrontSession[], history: HistoryEntry[], journal: JournalEntry[]): MemberEvent[] => {
  const memberHistoryEvents: MemberHistoryEvent[] = [
    ...sessions.map((m): MemberHistoryEvent => ({
      type: 'front',
      time: m.startTime,
      tier: m.tier,
      entry: {...m.last, startTime: m.startTime, endTime: m.endTime},
    })),
    ...history.flatMap(e => (e.changeType && e.changeType !== 'front' && historyTierOf(e, memberId) !== null
      ? [{type: e.changeType, time: e.changeTime ?? e.startTime, entry: e}]
      : [])),
  ];
  const memberJournalEvents = journal
    .filter(e => (e.authorIds || []).includes(memberId))
    .map((e): MemberJournalEvent => ({type: 'journal', time: e.timestamp, journalEntry: e}));
  return [...memberHistoryEvents, ...memberJournalEvents].sort((a, b) => b.time - a.time);
};

export const summarizeMemberEvents = (memberId: string, events: MemberEvent[]): MemberSummary => {
  const details = events.filter(hasEntry).map(e => tierDetailsFor(memberId, e.entry));
  const energies = details.map(d => d.energy).filter((v): v is number => typeof v === 'number');
  return {
    topMood: topCount(details.map(d => d.mood)),
    topLoc: topCount(details.map(d => d.location)),
    avgEnergy: energies.length > 0 ? energies.reduce((a, b) => a + b, 0) / energies.length : null,
  };
};

export const eventDetails = (type: HistoryChangeType, entry: HistoryEntry, memberId: string | null): TierDetails =>
  type === 'front'
    ? detailsForTier(entry, memberId ? historyTierOf(entry, memberId) : null)
    : detailsForTier(entry, entry.changeTier);
