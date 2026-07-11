import React, {useState, useMemo} from 'react';
import {View, ScrollView, TouchableOpacity} from 'react-native';
import {Text} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Fonts, fontScale, ThemeColors} from '../theme';
import {useAppStore} from '../store/appStore';
import {Member, HistoryEntry, ChatMessage, fmtDur, translateMood, SINGLET_HIDDEN_STATUS_NAMES, buildEffectiveEnd} from '../utils';
import {DateTimeEditor} from '../components/DateTimeEditor';
import {Avatar} from '../components/Avatar';

type TimeRange = 'all' | '7d' | '30d' | 'custom';

const MAX_BOARD = 25;
const nextBoardLimit = (cur: number) => (cur < 10 ? 10 : MAX_BOARD);

interface Props {
  theme: ThemeColors;
  singlet?: boolean;
  selfId?: string;
}

export const StatsScreen = ({theme: T, singlet = false, selfId}: Props) => {
  const history = useAppStore(s => s.history);
  const members = useAppStore(s => s.members);
  const chatMessages = useAppStore(s => s.allChatMessages);
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [range, setRange] = useState<TimeRange>('all');
  const [customStart, setCustomStart] = useState<number>(Date.now() - 30 * 86400000);
  const [customEnd, setCustomEnd] = useState<number>(Date.now());
  const [selectedStatMember, setSelectedStatMember] = useState<string | null>(null);
  const [boardLimits, setBoardLimits] = useState<Record<string, number>>({});
  const limitFor = (k: string) => boardLimits[k] ?? 5;
  const expandBoard = (k: string) => setBoardLimits(p => ({...p, [k]: nextBoardLimit(p[k] ?? 5)}));

  const rangeStart = useMemo(() => {
    if (range === '7d') return Date.now() - 7 * 86400000;
    if (range === '30d') return Date.now() - 30 * 86400000;
    if (range === 'custom') {
      const d = new Date(customStart);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    return 0;
  }, [range, customStart]);

  const rangeEnd = useMemo(() => {
    if (range === 'custom') {
      const d = new Date(customEnd);
      d.setHours(23, 59, 59, 999);
      return d.getTime();
    }
    return Date.now();
  }, [range, customEnd]);

  const filteredHistory = useMemo(() =>
    history.filter(e => {
      const frontOnly = !e.changeType || e.changeType === 'front';
      const inRange = e.startTime >= rangeStart && e.startTime <= rangeEnd;
      return frontOnly && inRange;
    }),
  [history, rangeStart, rangeEnd]);

  const filteredChat = useMemo(() =>
    chatMessages.filter(m => m.timestamp >= rangeStart && m.timestamp <= rangeEnd),
  [chatMessages, rangeStart, rangeEnd]);

  const stats = useMemo(() => {
    const customFrontIds = new Set(members.filter(m => m.isCustomFront).map(m => m.id));
    const hiddenStatusIds = new Set(members.filter(m => m.isCustomFront && SINGLET_HIDDEN_STATUS_NAMES.includes(m.name)).map(m => m.id));
    const rankExclude = (id: string): boolean => singlet
      ? (id === selfId || !customFrontIds.has(id) || hiddenStatusIds.has(id))
      : customFrontIds.has(id);
    const effEnd = buildEffectiveEnd(history);
    const entryDur = (e: HistoryEntry): number => Math.max(0, (effEnd(e) ?? Date.now()) - e.startTime);
    const totalMs = filteredHistory.reduce((sum, e) => sum + entryDur(e), 0);

    const frontCounts: Record<string, {time: number; sessions: number}> = {};
    const coFrontCounts: Record<string, number> = {};
    const coConCounts: Record<string, number> = {};
    const moodCounts: Record<string, number> = {};
    const locCounts: Record<string, number> = {};

    const lastSeen: Record<string, {end: number | null; tier: string}> = {};
    [...filteredHistory].sort((a, b) => a.startTime - b.startTime).forEach(e => {
      const dur = entryDur(e);
      const entryEnd = e.endTime ?? effEnd(e) ?? null;
      const isNewSession = (id: string, tier: string): boolean => {
        const prev = lastSeen[id];
        const contiguous = !!prev && prev.tier === tier && prev.end !== null && Math.abs(e.startTime - prev.end) <= 1000;
        lastSeen[id] = {end: entryEnd, tier};
        return !contiguous;
      };
      (e.memberIds || []).forEach(id => {
        if (!frontCounts[id]) frontCounts[id] = {time: 0, sessions: 0};
        frontCounts[id].time += dur;
        if (isNewSession(id, 'primary')) frontCounts[id].sessions += 1;
      });
      (e.coFrontIds || []).forEach(id => { if (isNewSession(id, 'coFront')) coFrontCounts[id] = (coFrontCounts[id] || 0) + 1; });
      (e.coConsciousIds || []).forEach(id => { if (isNewSession(id, 'coConscious')) coConCounts[id] = (coConCounts[id] || 0) + 1; });
      if (e.mood) moodCounts[e.mood] = (moodCounts[e.mood] || 0) + 1;
      if (e.location) locCounts[e.location] = (locCounts[e.location] || 0) + 1;
    });

    const chatCounts: Record<string, number> = {};
    filteredChat.forEach(m => { chatCounts[m.authorId] = (chatCounts[m.authorId] || 0) + 1; });

    const energyMap: Record<string, {sum: number; count: number}> = {};
    const peakHoursArr = new Array(24).fill(0);
    const energyHourSum = new Array(24).fill(0);
    const energyHourCount = new Array(24).fill(0);
    filteredHistory.forEach(e => {
      const hour = new Date(e.startTime).getHours();
      peakHoursArr[hour]++;
      if (e.energyLevel) {
        energyHourSum[hour] += e.energyLevel; energyHourCount[hour]++;
        (e.memberIds || []).forEach(id => {
          if (!energyMap[id]) energyMap[id] = {sum: 0, count: 0};
          energyMap[id].sum += e.energyLevel!; energyMap[id].count++;
        });
      }
      if (e.coFrontEnergy) {
        energyHourSum[hour] += e.coFrontEnergy; energyHourCount[hour]++;
        (e.coFrontIds || []).forEach(id => {
          if (!energyMap[id]) energyMap[id] = {sum: 0, count: 0};
          energyMap[id].sum += e.coFrontEnergy!; energyMap[id].count++;
        });
      }
    });
    const energyByHour = energyHourSum.map((s, h) => energyHourCount[h] > 0 ? Math.round((s / energyHourCount[h]) * 10) / 10 : 0);

    const energyAvgs = Object.entries(energyMap)
      .filter(([id]) => !rankExclude(id))
      .map(([id, {sum, count}]) => ({id, avg: Math.round((sum / count) * 10) / 10}))
      .sort((a, b) => b.avg - a.avg);

    const topN = (obj: Record<string, number>, n: number) =>
      Object.entries(obj).filter(([id]) => !rankExclude(id)).sort((a, b) => b[1] - a[1]).slice(0, n);

    const topNPlain = (obj: Record<string, number>, n: number) =>
      Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);

    const topFronters = Object.entries(frontCounts)
      .filter(([id]) => !rankExclude(id))
      .sort((a, b) => b[1].time - a[1].time)
      .slice(0, MAX_BOARD)
      .map(([id, data]) => ({id, ...data}));

    return {
      totalMs,
      totalSessions: filteredHistory.length,
      topFronters,
      topCoFronters: topN(coFrontCounts, MAX_BOARD),
      topCoCon: topN(coConCounts, MAX_BOARD),
      topMoods: topNPlain(moodCounts, MAX_BOARD),
      topLocations: topNPlain(locCounts, MAX_BOARD),
      topChatters: topN(chatCounts, MAX_BOARD),
      totalMessages: filteredChat.length,
      energyAvgs,
      peakHours: peakHoursArr,
      energyByHour,
    };
  }, [filteredHistory, filteredChat, members, history, singlet, selfId]);

  const getMember = (id: string) => members.find(m => m.id === id);

  const RangeBtn = ({id, label}: {id: TimeRange; label: string}) => (
    <TouchableOpacity onPress={() => setRange(id)} activeOpacity={0.7}
      accessibilityRole="button" accessibilityState={{selected: range === id}}
      style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
        backgroundColor: range === id ? `${T.accent}20` : T.surface, borderColor: range === id ? `${T.accent}60` : T.border}}>
      <Text style={{fontSize: fs(12), color: range === id ? T.accent : T.dim, fontWeight: range === id ? '600' : '400'}}>{label}</Text>
    </TouchableOpacity>
  );

  const StatCard = ({label, value, accent}: {label: string; value: string; accent?: boolean}) => (
    <View style={{flex: 1, backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12}}>
      <Text style={{fontSize: fs(9), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 4, fontWeight: '600'}}>{label}</Text>
      <Text style={{fontSize: fs(16), fontWeight: '700', color: accent ? T.accent : T.text}}>{value}</Text>
    </View>
  );

  const rankColor = (i: number) => i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : T.dim;

  const ShowMoreRow = ({boardKey, total, limit}: {boardKey: string; total: number; limit: number}) => {
    if (total <= limit || limit >= MAX_BOARD) return null;
    const next = nextBoardLimit(limit);
    return (
      <TouchableOpacity onPress={() => expandBoard(boardKey)} activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('stats.showMoreN', {shown: limit, total})}
        style={{paddingVertical: 9, alignItems: 'center', borderTopWidth: 1, borderTopColor: T.border}}>
        <Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>
          {t('stats.showMore', {count: Math.min(next, total) - limit})} ({Math.min(limit, total)}/{total})
        </Text>
      </TouchableOpacity>
    );
  };

  const Leaderboard = ({title, boardKey, entries, renderValue, formatKey}: {title: string; boardKey: string; entries: [string, number][]; renderValue: (v: number) => string; formatKey?: (k: string) => string}) => {
    if (entries.length === 0) return null;
    const limit = limitFor(boardKey);
    const shown = entries.slice(0, limit);
    const max = Math.max(...shown.map(([, v]) => v), 1);
    const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
    return (
      <View style={{marginBottom: 18}}>
        <Text accessibilityRole="header" style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{title}</Text>
        <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border}}>
          {shown.map(([key, value], i) => {
            const member = getMember(key);
            const isLast = i === shown.length - 1;
            const pct = Math.max(4, Math.round((value / max) * 100));
            const barColor = member?.color || T.accent;
            return (
              <View key={key} style={{padding: 10, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: T.border}}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6}}>
                  <Text style={{fontSize: fs(13), fontWeight: '700', color: rankColor(i), width: 22, textAlign: 'center'}}>{i + 1}</Text>
                  {member ? <Avatar member={member} size={24} T={T} /> : null}
                  <Text style={{flex: 1, fontSize: fs(13), color: T.text, fontWeight: '500'}} numberOfLines={1}>
                    {member ? member.name : (formatKey ? formatKey(key) : key)}
                  </Text>
                  <Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>{`${((value / total) * 100).toFixed(1)}% / ${renderValue(value)}`}</Text>
                </View>
                <View style={{height: 6, borderRadius: 3, backgroundColor: T.surface, overflow: 'hidden'}}>
                  <View style={{height: 6, width: `${pct}%`, borderRadius: 3, backgroundColor: barColor}} />
                </View>
              </View>
            );
          })}
          <ShowMoreRow boardKey={boardKey} total={entries.length} limit={limit} />
        </View>
      </View>
    );
  };

  const FrontLeaderboard = () => {
    if (stats.topFronters.length === 0) return null;
    const limit = limitFor('fronters');
    const shown = stats.topFronters.slice(0, limit);
    const maxT = Math.max(...shown.map(e => e.time), 1);
    const totalT = stats.topFronters.reduce((s, e) => s + e.time, 0) || 1;
    return (
      <View style={{marginBottom: 18}}>
        <Text accessibilityRole="header" style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{singlet ? t('stats.topStatuses') : t('stats.topFronters')}</Text>
        <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border}}>
          {shown.map((entry, i) => {
            const member = getMember(entry.id);
            const isLast = i === shown.length - 1;
            const pct = Math.max(4, Math.round((entry.time / maxT) * 100));
            const barColor = member?.color || T.accent;
            return (
              <View key={entry.id} style={{padding: 10, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: T.border}}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6}}>
                  <Text style={{fontSize: fs(13), fontWeight: '700', color: rankColor(i), width: 22, textAlign: 'center'}}>{i + 1}</Text>
                  {member ? <Avatar member={member} size={24} T={T} /> : null}
                  <View style={{flex: 1}}>
                    <Text style={{fontSize: fs(13), color: T.text, fontWeight: '500'}} numberOfLines={1}>{member ? member.name : entry.id}</Text>
                    <Text style={{fontSize: fs(10), color: T.muted}}>{entry.sessions} {t('stats.sessions').toLowerCase()}</Text>
                  </View>
                  <Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>{`${((entry.time / totalT) * 100).toFixed(1)}% / ${fmtDur(0, entry.time)}`}</Text>
                </View>
                <View style={{height: 6, borderRadius: 3, backgroundColor: T.surface, overflow: 'hidden'}}>
                  <View style={{height: 6, width: `${pct}%`, borderRadius: 3, backgroundColor: barColor}} />
                </View>
              </View>
            );
          })}
          <ShowMoreRow boardKey="fronters" total={stats.topFronters.length} limit={limit} />
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={{padding: 16, paddingBottom: 40}}>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16}}>
        <RangeBtn id="all" label={t('stats.allTime')} />
        <RangeBtn id="7d" label={t('stats.last7')} />
        <RangeBtn id="30d" label={t('stats.last30')} />
        <RangeBtn id="custom" label={t('stats.customRange')} />
      </View>

      {range === 'custom' && (
        <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12, marginBottom: 16}}>
          <DateTimeEditor
            date={new Date(customStart)}
            onChange={d => {
              const t0 = d.getTime();
              setCustomStart(t0);
              if (t0 > customEnd) setCustomEnd(t0);
            }}
            mode="date"
            label={t('stats.rangeStart')}
            T={T}
          />
          <DateTimeEditor
            date={new Date(customEnd)}
            onChange={d => {
              const t1 = d.getTime();
              setCustomEnd(t1);
              if (t1 < customStart) setCustomStart(t1);
            }}
            mode="date"
            label={t('stats.rangeEnd')}
            T={T}
          />
          <View style={{flexDirection: 'row', gap: 8, marginTop: 4}}>
            <TouchableOpacity onPress={() => {
              const now = Date.now();
              setCustomStart(now - 30 * 86400000);
              setCustomEnd(now);
            }} activeOpacity={0.7} accessibilityRole="button"
              style={{flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
              <Text style={{fontSize: fs(11), color: T.dim}}>{t('stats.last30')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {
              const now = new Date();
              const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
              setCustomStart(start);
              setCustomEnd(Date.now());
            }} activeOpacity={0.7} accessibilityRole="button"
              style={{flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
              <Text style={{fontSize: fs(11), color: T.dim}}>{t('stats.thisMonth')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {
              const start = new Date(new Date().getFullYear(), 0, 1).getTime();
              setCustomStart(start);
              setCustomEnd(Date.now());
            }} activeOpacity={0.7} accessibilityRole="button"
              style={{flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
              <Text style={{fontSize: fs(11), color: T.dim}}>{t('stats.thisYear')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={{flexDirection: 'row', gap: 8, marginBottom: 16}}>
        <StatCard label={t('stats.totalTime')} value={fmtDur(0, stats.totalMs)} accent />
        <StatCard label={t('stats.sessions')} value={String(stats.totalSessions)} />
        {!singlet && <StatCard label={t('stats.messages')} value={String(stats.totalMessages)} />}
      </View>

      <FrontLeaderboard />
      {!singlet && <Leaderboard title={t('stats.topCoFronters')} boardKey="cofronters" entries={stats.topCoFronters} renderValue={v => `${v}x`} />}
      {!singlet && <Leaderboard title={t('stats.topCoCon')} boardKey="cocon" entries={stats.topCoCon} renderValue={v => `${v}x`} />}
      {!singlet && <Leaderboard title={t('stats.topChatters')} boardKey="chatters" entries={stats.topChatters} renderValue={v => `${v} ${t('stats.msgsSuffix')}`} />}
      <Leaderboard title={t('stats.topMoods')} boardKey="moods" entries={stats.topMoods} renderValue={v => `${v}x`} formatKey={m => translateMood(m, t)} />
      <Leaderboard title={t('stats.topLocations')} boardKey="locations" entries={stats.topLocations} renderValue={v => `${v}x`} />

      {stats.energyAvgs.length > 0 && (
        <View style={{marginBottom: 16}}>
          <Text accessibilityRole="header" style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{t('energy.avgEnergy')}</Text>
          {stats.energyAvgs.slice(0, 8).map(({id, avg}) => {
            const m = getMember(id);
            return (
              <View key={id} style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6}}>
                <Avatar member={m} size={22} T={T} />
                <Text style={{flex: 1, fontSize: fs(12), color: T.text}}>{m?.name || '?'}</Text>
                <View style={{width: 80, height: 6, backgroundColor: T.surface, borderRadius: 3, overflow: 'hidden'}}>
                  <View style={{height: '100%', width: `${(avg / 10) * 100}%`, backgroundColor: m?.color || T.accent, borderRadius: 3}} />
                </View>
                <Text style={{fontSize: fs(11), color: T.muted, width: 40, textAlign: 'right'}}>{avg}/10</Text>
              </View>
            );
          })}
        </View>
      )}

      {stats.peakHours.some((v: number) => v > 0) && (
        <View style={{marginBottom: 16}}>
          <Text accessibilityRole="header" style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{t('stats.peakHours')}</Text>
          <View style={{flexDirection: 'row', alignItems: 'flex-end', height: 50, gap: 1}}>
            {stats.peakHours.map((count: number, h: number) => {
              const max = Math.max(...stats.peakHours as number[], 1);
              return (
                <View key={h} style={{flex: 1, justifyContent: 'flex-end', height: '100%'}}>
                  <View style={{width: '100%', height: Math.max((count / max) * 45, 1), backgroundColor: count === max && count > 0 ? T.accent : `${T.dim}40`, borderRadius: 1}} />
                </View>
              );
            })}
          </View>
          <View style={{flexDirection: 'row', gap: 1, marginTop: 2}}>
            {stats.peakHours.map((_: number, h: number) => (
              <View key={h} style={{flex: 1, alignItems: 'center'}}>
                <Text style={{fontSize: fs(7), color: T.muted}}>{h % 6 === 0 ? h : ''}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {stats.energyByHour.some((v: number) => v > 0) && (
        <View style={{marginBottom: 16}}>
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8}}>
            <Text accessibilityRole="header" style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600'}}>{t('stats.energyByHour')}</Text>
            <Text style={{fontSize: fs(9), color: T.muted}}>{t('energy.outOf10')}</Text>
          </View>
          <View style={{flexDirection: 'row', alignItems: 'flex-end', height: 50, gap: 1}}>
            {stats.energyByHour.map((avg: number, h: number) => (
              <View key={h} style={{flex: 1, justifyContent: 'flex-end', height: '100%'}}>
                <View style={{width: '100%', height: avg > 0 ? Math.max((avg / 10) * 45, 2) : 1, backgroundColor: avg > 0 ? T.accent : `${T.dim}40`, borderRadius: 1}} />
              </View>
            ))}
          </View>
          <View style={{flexDirection: 'row', gap: 1, marginTop: 2}}>
            {stats.energyByHour.map((_: number, h: number) => (
              <View key={h} style={{flex: 1, alignItems: 'center'}}>
                <Text style={{fontSize: fs(7), color: T.muted}}>{h % 6 === 0 ? h : ''}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={{marginBottom: 16}}>
        <Text accessibilityRole="header" style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{singlet ? t('stats.statusDetails') : t('stats.topCoMembers')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 10, flexGrow: 0}}>
          <View style={{flexDirection: 'row', gap: 6}}>
            {members.filter((m: Member) => !m.archived && (!singlet || (m.isCustomFront && !SINGLET_HIDDEN_STATUS_NAMES.includes(m.name)))).map((m: Member) => (
              <TouchableOpacity key={m.id} onPress={() => setSelectedStatMember(selectedStatMember === m.id ? null : m.id)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={m.name} accessibilityState={{selected: selectedStatMember === m.id}}
                style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
                  backgroundColor: selectedStatMember === m.id ? `${m.color}20` : T.surface,
                  borderColor: selectedStatMember === m.id ? `${m.color}50` : T.border}}>
                <Text style={{fontSize: fs(11), color: selectedStatMember === m.id ? m.color : T.dim}}>{m.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {selectedStatMember && (() => {
          const entries = filteredHistory.filter(e =>
            (e.memberIds || []).includes(selectedStatMember) ||
            (e.coFrontIds || []).includes(selectedStatMember) ||
            (e.coConsciousIds || []).includes(selectedStatMember)
          );
          const coMembers: Record<string, number> = {};
          const moods: Record<string, number> = {};
          let eSum = 0; let eCount = 0;
          entries.forEach(e => {
            [...(e.memberIds || []), ...(e.coFrontIds || []), ...(e.coConsciousIds || [])].forEach(id => {
              if (id !== selectedStatMember && !(singlet && id === selfId)) coMembers[id] = (coMembers[id] || 0) + 1;
            });
            if (e.mood) moods[e.mood] = (moods[e.mood] || 0) + 1;
            if (e.energyLevel && (e.memberIds || []).includes(selectedStatMember)) { eSum += e.energyLevel; eCount++; }
            if (e.coFrontEnergy && (e.coFrontIds || []).includes(selectedStatMember)) { eSum += e.coFrontEnergy; eCount++; }
          });
          const sm = getMember(selectedStatMember);
          const topCoAll = Object.entries(coMembers).sort((a, b) => b[1] - a[1]);
          const coLimit = limitFor('coMembers');
          const topCo = topCoAll.slice(0, coLimit);
          const topMdAll = Object.entries(moods).sort((a, b) => b[1] - a[1]);
          const mdLimit = limitFor('coMoods');
          const topMd = topMdAll.slice(0, mdLimit);
          const avgE = eCount > 0 ? Math.round((eSum / eCount) * 10) / 10 : null;

          return (
            <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12}}>
              <View style={{flexDirection: 'row', gap: 16, marginBottom: 10}}>
                <View><Text style={{fontSize: fs(18), fontWeight: '700', color: sm?.color || T.accent}}>{entries.length}</Text><Text style={{fontSize: fs(10), color: T.muted}}>{t('stats.sessionsSuffix')}</Text></View>
                {avgE !== null && <View><Text style={{fontSize: fs(18), fontWeight: '700', color: sm?.color || T.accent}}>{avgE}</Text><Text style={{fontSize: fs(10), color: T.muted}}>{t('energy.outOf10')}</Text></View>}
              </View>
              {topCo.length > 0 && (
                <View style={{marginBottom: 8}}>
                  <Text style={{fontSize: fs(9), letterSpacing: 1, textTransform: 'uppercase', color: T.muted, marginBottom: 6}}>{singlet ? t('stats.coStatuses') : t('stats.topCoMembers')}</Text>
                  {topCo.map(([id, count]) => {
                    const cm = getMember(id);
                    return (
                      <View key={id} style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4}}>
                        <Avatar member={cm} size={18} T={T} />
                        <Text style={{flex: 1, fontSize: fs(12), color: T.text}}>{cm?.name || '?'}</Text>
                        <Text style={{fontSize: fs(11), color: T.muted}}>{count}x</Text>
                      </View>
                    );
                  })}
                  <ShowMoreRow boardKey="coMembers" total={topCoAll.length} limit={coLimit} />
                </View>
              )}
              {topMd.length > 0 && (
                <View>
                  <Text style={{fontSize: fs(9), letterSpacing: 1, textTransform: 'uppercase', color: T.muted, marginBottom: 6}}>{t('stats.topMoods')}</Text>
                  {topMd.map(([mood, count]) => (
                    <View key={mood} style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4}}>
                      <Text style={{flex: 1, fontSize: fs(12), color: T.text}}>{translateMood(mood, t)}</Text>
                      <Text style={{fontSize: fs(11), color: T.muted}}>{count}x</Text>
                    </View>
                  ))}
                  <ShowMoreRow boardKey="coMoods" total={topMdAll.length} limit={mdLimit} />
                </View>
              )}
            </View>
          );
        })()}
      </View>
    </ScrollView>
  );
};
