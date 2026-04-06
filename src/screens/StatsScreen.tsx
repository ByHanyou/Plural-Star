import React, {useState, useMemo} from 'react';
import {View, Text, ScrollView, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Fonts} from '../theme';
import {Member, HistoryEntry, ChatMessage, fmtDur, getInitials} from '../utils';

const Avatar = ({member, size = 28, T}: {member?: Member | null; size?: number; T: any}) => (
  <View style={{width: size, height: size, borderRadius: size / 2, backgroundColor: member?.color || T.toggleOff,
    alignItems: 'center', justifyContent: 'center'}}>
    <Text style={{fontSize: size * 0.35, fontWeight: '700', color: 'rgba(0,0,0,0.75)'}}>{getInitials(member?.name || '?')}</Text>
  </View>
);

type TimeRange = 'all' | '7d' | '30d' | 'custom';

interface Props {
  theme: any;
  history: HistoryEntry[];
  members: Member[];
  chatMessages: ChatMessage[];
}

export const StatsScreen = ({theme: T, history, members, chatMessages}: Props) => {
  const {t} = useTranslation();
  const fs = (s: number) => Math.round(s * (T.textScale || 1));
  const [range, setRange] = useState<TimeRange>('all');
  const [customStart, setCustomStart] = useState<number>(Date.now() - 30 * 86400000);
  const [customEnd, setCustomEnd] = useState<number>(Date.now());

  const rangeStart = useMemo(() => {
    if (range === '7d') return Date.now() - 7 * 86400000;
    if (range === '30d') return Date.now() - 30 * 86400000;
    if (range === 'custom') return customStart;
    return 0;
  }, [range, customStart]);

  const rangeEnd = useMemo(() => {
    if (range === 'custom') return customEnd;
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
    const totalMs = filteredHistory.reduce((sum, e) => sum + ((e.endTime ?? Date.now()) - e.startTime), 0);

    const frontCounts: Record<string, {time: number; sessions: number}> = {};
    const coFrontCounts: Record<string, number> = {};
    const coConCounts: Record<string, number> = {};
    const moodCounts: Record<string, number> = {};
    const locCounts: Record<string, number> = {};

    filteredHistory.forEach(e => {
      const dur = (e.endTime ?? Date.now()) - e.startTime;
      (e.memberIds || []).forEach(id => {
        if (!frontCounts[id]) frontCounts[id] = {time: 0, sessions: 0};
        frontCounts[id].time += dur;
        frontCounts[id].sessions += 1;
      });
      (e.coFrontIds || []).forEach(id => { coFrontCounts[id] = (coFrontCounts[id] || 0) + 1; });
      (e.coConsciousIds || []).forEach(id => { coConCounts[id] = (coConCounts[id] || 0) + 1; });
      if (e.mood) moodCounts[e.mood] = (moodCounts[e.mood] || 0) + 1;
      if (e.location) locCounts[e.location] = (locCounts[e.location] || 0) + 1;
    });

    const chatCounts: Record<string, number> = {};
    filteredChat.forEach(m => { chatCounts[m.authorId] = (chatCounts[m.authorId] || 0) + 1; });

    const topN = (obj: Record<string, number>, n: number) =>
      Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);

    const topFronters = Object.entries(frontCounts)
      .sort((a, b) => b[1].time - a[1].time)
      .slice(0, 5)
      .map(([id, data]) => ({id, ...data}));

    return {
      totalMs,
      totalSessions: filteredHistory.length,
      topFronters,
      topCoFronters: topN(coFrontCounts, 5),
      topCoCon: topN(coConCounts, 5),
      topMoods: topN(moodCounts, 5),
      topLocations: topN(locCounts, 5),
      topChatters: topN(chatCounts, 5),
      totalMessages: filteredChat.length,
    };
  }, [filteredHistory, filteredChat]);

  const getMember = (id: string) => members.find(m => m.id === id);

  const RangeBtn = ({id, label}: {id: TimeRange; label: string}) => (
    <TouchableOpacity onPress={() => setRange(id)} activeOpacity={0.7}
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

  const Leaderboard = ({title, entries, renderValue}: {title: string; entries: [string, number][]; renderValue: (v: number) => string}) => {
    if (entries.length === 0) return null;
    return (
      <View style={{marginBottom: 18}}>
        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{title}</Text>
        <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden'}}>
          {entries.map(([key, value], i) => {
            const member = getMember(key);
            const isLast = i === entries.length - 1;
            return (
              <View key={key} style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10,
                borderBottomWidth: isLast ? 0 : 1, borderBottomColor: T.border}}>
                <Text style={{fontSize: fs(12), fontWeight: '700', color: T.dim, width: 20, textAlign: 'center'}}>{i + 1}</Text>
                {member ? <Avatar member={member} size={24} T={T} /> : null}
                <Text style={{flex: 1, fontSize: fs(13), color: T.text, fontWeight: '500'}} numberOfLines={1}>
                  {member ? member.name : key}
                </Text>
                <Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>{renderValue(value)}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const FrontLeaderboard = () => {
    if (stats.topFronters.length === 0) return null;
    return (
      <View style={{marginBottom: 18}}>
        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{t('stats.topFronters')}</Text>
        <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden'}}>
          {stats.topFronters.map((entry, i) => {
            const member = getMember(entry.id);
            const isLast = i === stats.topFronters.length - 1;
            return (
              <View key={entry.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10,
                borderBottomWidth: isLast ? 0 : 1, borderBottomColor: T.border}}>
                <Text style={{fontSize: fs(12), fontWeight: '700', color: T.dim, width: 20, textAlign: 'center'}}>{i + 1}</Text>
                {member ? <Avatar member={member} size={24} T={T} /> : null}
                <View style={{flex: 1}}>
                  <Text style={{fontSize: fs(13), color: T.text, fontWeight: '500'}} numberOfLines={1}>{member ? member.name : entry.id}</Text>
                  <Text style={{fontSize: fs(10), color: T.muted}}>{entry.sessions} {t('stats.sessions').toLowerCase()}</Text>
                </View>
                <Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>{fmtDur(0, entry.time)}</Text>
              </View>
            );
          })}
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
      </View>

      <View style={{flexDirection: 'row', gap: 8, marginBottom: 16}}>
        <StatCard label={t('stats.totalTime')} value={fmtDur(0, stats.totalMs)} accent />
        <StatCard label={t('stats.sessions')} value={String(stats.totalSessions)} />
        <StatCard label={t('stats.messages')} value={String(stats.totalMessages)} />
      </View>

      <FrontLeaderboard />
      <Leaderboard title={t('stats.topCoFronters')} entries={stats.topCoFronters} renderValue={v => `${v}x`} />
      <Leaderboard title={t('stats.topCoCon')} entries={stats.topCoCon} renderValue={v => `${v}x`} />
      <Leaderboard title={t('stats.topChatters')} entries={stats.topChatters} renderValue={v => `${v} msgs`} />
      <Leaderboard title={t('stats.topMoods')} entries={stats.topMoods} renderValue={v => `${v}x`} />
      <Leaderboard title={t('stats.topLocations')} entries={stats.topLocations} renderValue={v => `${v}x`} />
    </ScrollView>
  );
};
