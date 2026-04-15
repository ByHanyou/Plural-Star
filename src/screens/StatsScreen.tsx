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
  const [selectedStatMember, setSelectedStatMember] = useState<string | null>(null);

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

    const energyMap: Record<string, {sum: number; count: number}> = {};
    const peakHoursArr = new Array(24).fill(0);
    filteredHistory.forEach(e => {
      peakHoursArr[new Date(e.startTime).getHours()]++;
      if (e.energyLevel) {
        (e.memberIds || []).forEach(id => {
          if (!energyMap[id]) energyMap[id] = {sum: 0, count: 0};
          energyMap[id].sum += e.energyLevel!; energyMap[id].count++;
        });
      }
      if (e.coFrontEnergy) {
        (e.coFrontIds || []).forEach(id => {
          if (!energyMap[id]) energyMap[id] = {sum: 0, count: 0};
          energyMap[id].sum += e.coFrontEnergy!; energyMap[id].count++;
        });
      }
    });

    const energyAvgs = Object.entries(energyMap)
      .map(([id, {sum, count}]) => ({id, avg: Math.round((sum / count) * 10) / 10}))
      .sort((a, b) => b.avg - a.avg);

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
      energyAvgs,
      peakHours: peakHoursArr,
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

      {/* Energy Averages */}
      {stats.energyAvgs.length > 0 && (
        <View style={{marginBottom: 16}}>
          <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{t('energy.avgEnergy')}</Text>
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

      {/* Peak Hours */}
      {stats.peakHours.some((v: number) => v > 0) && (
        <View style={{marginBottom: 16}}>
          <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{t('stats.peakHours')}</Text>
          <View style={{flexDirection: 'row', alignItems: 'flex-end', height: 50, gap: 1}}>
            {stats.peakHours.map((count: number, h: number) => {
              const max = Math.max(...stats.peakHours as number[], 1);
              return (
                <View key={h} style={{flex: 1, alignItems: 'center'}}>
                  <View style={{width: '100%', height: Math.max((count / max) * 45, 1), backgroundColor: count === max && count > 0 ? T.accent : `${T.dim}40`, borderRadius: 1}} />
                  <Text style={{fontSize: 7, color: h % 6 === 0 ? T.muted : 'transparent', marginTop: 2}}>{h % 6 === 0 ? h : ''}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Member Leaderboard */}
      <View style={{marginBottom: 16}}>
        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{t('stats.topCoMembers')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 10, flexGrow: 0}}>
          <View style={{flexDirection: 'row', gap: 6}}>
            {members.filter((m: Member) => !m.archived).map((m: Member) => (
              <TouchableOpacity key={m.id} onPress={() => setSelectedStatMember(selectedStatMember === m.id ? null : m.id)} activeOpacity={0.7}
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
              if (id !== selectedStatMember) coMembers[id] = (coMembers[id] || 0) + 1;
            });
            if (e.mood) moods[e.mood] = (moods[e.mood] || 0) + 1;
            if (e.energyLevel && (e.memberIds || []).includes(selectedStatMember)) { eSum += e.energyLevel; eCount++; }
            if (e.coFrontEnergy && (e.coFrontIds || []).includes(selectedStatMember)) { eSum += e.coFrontEnergy; eCount++; }
          });
          const sm = getMember(selectedStatMember);
          const topCo = Object.entries(coMembers).sort((a, b) => b[1] - a[1]).slice(0, 5);
          const topMd = Object.entries(moods).sort((a, b) => b[1] - a[1]).slice(0, 5);
          const avgE = eCount > 0 ? Math.round((eSum / eCount) * 10) / 10 : null;

          return (
            <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12}}>
              <View style={{flexDirection: 'row', gap: 16, marginBottom: 10}}>
                <View><Text style={{fontSize: fs(18), fontWeight: '700', color: sm?.color || T.accent}}>{entries.length}</Text><Text style={{fontSize: fs(10), color: T.muted}}>sessions</Text></View>
                {avgE !== null && <View><Text style={{fontSize: fs(18), fontWeight: '700', color: sm?.color || T.accent}}>{avgE}</Text><Text style={{fontSize: fs(10), color: T.muted}}>/10 energy</Text></View>}
              </View>
              {topCo.length > 0 && (
                <View style={{marginBottom: 8}}>
                  <Text style={{fontSize: fs(9), letterSpacing: 1, textTransform: 'uppercase', color: T.muted, marginBottom: 6}}>{t('stats.topCoMembers')}</Text>
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
                </View>
              )}
              {topMd.length > 0 && (
                <View>
                  <Text style={{fontSize: fs(9), letterSpacing: 1, textTransform: 'uppercase', color: T.muted, marginBottom: 6}}>{t('stats.topMoods')}</Text>
                  {topMd.map(([mood, count]) => (
                    <View key={mood} style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4}}>
                      <Text style={{flex: 1, fontSize: fs(12), color: T.text}}>{mood}</Text>
                      <Text style={{fontSize: fs(11), color: T.muted}}>{count}x</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })()}
      </View>
    </ScrollView>
  );
};
