import {ChatMessage, FrontTierKey, HistoryEntry, Member, DAY_MS, FRONT_TIER_KEYS, SESSION_JOIN_MS, buildEffectiveEnd, byValueDesc, countUp, historyAllIds, historyTierIds, historyTierOf, isFrontEntry, isSingletHiddenStatus} from '../utils';

export type StatsRange = 'all' | '7d' | '30d' | 'custom';

export const STATS_RANGES: StatsRange[] = ['all', '7d', '30d', 'custom'];

export interface StatsWindow {
  start: number;
  end: number;
}

const startOfDay = (ts: number): number => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const endOfDay = (ts: number): number => {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

export const statsWindow = (range: StatsRange, customStart: number, customEnd: number, now = Date.now()): StatsWindow => {
  if (range === '7d') return {start: now - 7 * DAY_MS, end: now};
  if (range === '30d') return {start: now - 30 * DAY_MS, end: now};
  if (range === 'custom') return {start: startOfDay(customStart), end: endOfDay(customEnd)};
  return {start: 0, end: now};
};

export interface TierBoardEntry {
  id: string;
  time: number;
  sessions: number;
}

export type CountBoard = [string, number][];

export interface StatsSummary {
  period: StatsWindow;
  entries: HistoryEntry[];
  totalMs: number;
  totalSessions: number;
  fronters: TierBoardEntry[];
  coFronters: TierBoardEntry[];
  coConscious: TierBoardEntry[];
  chatters: CountBoard;
  totalMessages: number;
  moods: CountBoard;
  locations: CountBoard;
  energyAvgs: {id: string; avg: number}[];
  peakHours: number[];
  energyByHour: number[];
}

export interface StatsInput {
  history: HistoryEntry[];
  chatMessages: ChatMessage[];
  members: Member[];
  period: StatsWindow;
  singlet: boolean;
  selfId?: string;
  now?: number;
}

export type MemberKind = 'member' | 'facet' | 'customFront';

export const memberKind = (m: Member | undefined): MemberKind => {
  if (m?.isFacet) return 'facet';
  if (m?.isCustomFront) return 'customFront';
  return 'member';
};

export const rankExcluder = (members: Member[], singlet: boolean, selfId?: string): ((id: string) => boolean) => {
  const customFrontIds = new Set(members.filter(m => m.isCustomFront).map(m => m.id));
  const hiddenStatusIds = new Set(members.filter(m => m.isCustomFront && isSingletHiddenStatus(m)).map(m => m.id));
  return (id: string): boolean => singlet
    ? (id === selfId || !customFrontIds.has(id) || hiddenStatusIds.has(id))
    : customFrontIds.has(id);
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

export const computeStats = ({history, chatMessages, members, period, singlet, selfId, now = Date.now()}: StatsInput): StatsSummary => {
  const excluded = rankExcluder(members, singlet, selfId);
  const effEnd = buildEffectiveEnd(history);
  const endOf = (e: HistoryEntry): number => effEnd(e) ?? now;
  const inWindow = (e: HistoryEntry): boolean =>
    e.startTime <= period.end && (endOf(e) > period.start || e.startTime >= period.start);
  const clipped = (e: HistoryEntry): number =>
    Math.max(0, Math.min(endOf(e), period.end) - Math.max(e.startTime, period.start));

  const entries = history.filter(e => isFrontEntry(e) && inWindow(e)).sort((a, b) => a.startTime - b.startTime);

  const tiers: Record<FrontTierKey, Map<string, {time: number; sessions: number}>> = {primary: new Map(), coFront: new Map(), coConscious: new Map()};
  const lastSeen = new Map<string, {end: number | null; tier: FrontTierKey}>();
  const moodCounts = new Map<string, number>();
  const locCounts = new Map<string, number>();
  const locDisplay = new Map<string, string>();
  const energyMap = new Map<string, {sum: number; count: number}>();
  const peakHours = new Array<number>(24).fill(0);
  const energyHourSum = new Array<number>(24).fill(0);
  const energyHourCount = new Array<number>(24).fill(0);
  let totalMs = 0;

  for (const e of entries) {
    const dur = clipped(e);
    totalMs += dur;
    const entryEnd = e.endTime ?? effEnd(e) ?? null;
    const isNewSession = (id: string, tier: FrontTierKey): boolean => {
      const prev = lastSeen.get(id);
      const contiguous = !!prev && prev.tier === tier && prev.end !== null && Math.abs(e.startTime - prev.end) <= SESSION_JOIN_MS;
      lastSeen.set(id, {end: entryEnd, tier});
      return !contiguous;
    };
    for (const tier of FRONT_TIER_KEYS) {
      const byMember = tiers[tier];
      for (const id of historyTierIds(e, tier)) {
        const slot = byMember.get(id) || {time: 0, sessions: 0};
        byMember.set(id, slot);
        slot.time += dur;
        if (isNewSession(id, tier)) slot.sessions += 1;
      }
    }

    if (e.mood) countUp(moodCounts, e.mood);
    const loc = (e.location || '').trim();
    if (loc) {
      const norm = loc.toLocaleLowerCase();
      if (!locDisplay.has(norm)) locDisplay.set(norm, loc);
      countUp(locCounts, locDisplay.get(norm) || loc);
    }

    const hour = new Date(e.startTime).getHours();
    peakHours[hour]++;
    const addEnergy = (level: number | undefined, ids: string[] | undefined) => {
      if (!level) return;
      energyHourSum[hour] += level;
      energyHourCount[hour]++;
      for (const id of ids || []) {
        const slot = energyMap.get(id) || {sum: 0, count: 0};
        energyMap.set(id, slot);
        slot.sum += level;
        slot.count++;
      }
    };
    addEnergy(e.energyLevel, e.memberIds);
    addEnergy(e.coFrontEnergy, e.coFrontIds);
  }

  const board = (tier: FrontTierKey): TierBoardEntry[] =>
    [...tiers[tier]]
      .filter(([id]) => !excluded(id))
      .map(([id, v]) => ({id, ...v}))
      .sort((a, b) => b.time - a.time || b.sessions - a.sessions);

  const chatCounts = new Map<string, number>();
  let totalMessages = 0;
  for (const m of chatMessages) {
    if (m.timestamp < period.start || m.timestamp > period.end) continue;
    totalMessages++;
    countUp(chatCounts, m.authorId);
  }

  return {
    period,
    entries,
    totalMs,
    totalSessions: entries.length,
    fronters: board('primary'),
    coFronters: board('coFront'),
    coConscious: board('coConscious'),
    chatters: byValueDesc(chatCounts).filter(([id]) => !excluded(id)),
    totalMessages,
    moods: byValueDesc(moodCounts),
    locations: byValueDesc(locCounts),
    energyAvgs: [...energyMap]
      .filter(([id]) => !excluded(id))
      .map(([id, {sum, count}]) => ({id, avg: round1(sum / count)}))
      .sort((a, b) => b.avg - a.avg),
    peakHours,
    energyByHour: energyHourSum.map((s, h) => (energyHourCount[h] > 0 ? round1(s / energyHourCount[h]) : 0)),
  };
};

export interface MemberDetail {
  sessions: number;
  coMembers: CountBoard;
  moods: CountBoard;
  avgEnergy: number | null;
}

export const memberDetail = (entries: HistoryEntry[], memberId: string, singlet: boolean, selfId?: string): MemberDetail => {
  const involved = entries.filter(e => historyTierOf(e, memberId) !== null);
  const coMembers = new Map<string, number>();
  const moods = new Map<string, number>();
  let eSum = 0;
  let eCount = 0;
  for (const e of involved) {
    for (const id of historyAllIds(e)) {
      if (id !== memberId && !(singlet && id === selfId)) countUp(coMembers, id);
    }
    if (e.mood) countUp(moods, e.mood);
    if (e.energyLevel && (e.memberIds || []).includes(memberId)) { eSum += e.energyLevel; eCount++; }
    if (e.coFrontEnergy && (e.coFrontIds || []).includes(memberId)) { eSum += e.coFrontEnergy; eCount++; }
  }
  return {
    sessions: involved.length,
    coMembers: byValueDesc(coMembers),
    moods: byValueDesc(moods),
    avgEnergy: eCount > 0 ? round1(eSum / eCount) : null,
  };
};
