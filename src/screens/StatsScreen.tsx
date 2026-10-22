import React, {useState, useMemo, useEffect} from 'react';
import {log} from '../utils/log';
import {View, TouchableOpacity} from 'react-native';
import {KeyboardAwareScrollView} from 'react-native-keyboard-controller';
import {Text} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {useAppStore} from '../store/appStore';
import {loadChatMessages} from '../store/actions';
import {FrontTierKey, Member, DAY_MS, fmtDur, fmtNum, translateMood, isSingletHiddenStatus} from '../utils';
import {StatsRange, computeStats, memberDetail, memberKind, statsWindow} from '../stats/compute';
import type {MemberKind} from '../stats/compute';
import {DateTimeEditor} from '../components/DateTimeEditor';
import {Avatar} from '../components/Avatar';
import {MemberPicker} from '../components/MemberPicker';
import {pickerPool} from '../picker/memberPicker';
import type {PickerPool} from '../picker/memberPicker';
import {getTierNameOverride} from '../i18n/terminology';
import {sectionLabel} from '../components/controls';
import {CoGroup, HourChart, Leaderboard, MemberStatDetail, RangeBtn, StatCard, TierBoard, hourSummary, nextBoardLimit} from './stats/StatsParts';

interface Props {
  singlet?: boolean;
  selfId?: string;
}

export const StatsScreen = ({singlet = false, selfId}: Props) => {
  const T = useTheme();
  const history = useAppStore(s => s.history);
  const members = useAppStore(s => s.members);
  const chatMessages = useAppStore(s => s.allChatMessages);
  const chatChannels = useAppStore(s => s.chatChannels);
  useEffect(() => {
    if (chatChannels.length > 0) loadChatMessages(chatChannels).catch(e => log.error('stats', 'chat load:', e));
  }, [chatChannels]);
  const {t} = useTranslation();
  const fs = fontScale(T);
  const tierHeading = (tier: FrontTierKey, stock: string): string => {
    const custom = getTierNameOverride(tier);
    return custom ? t('stats.topTier', {tier: custom}) : stock;
  };
  const [range, setRange] = useState<StatsRange>('all');
  const [customStart, setCustomStart] = useState<number>(Date.now() - 30 * DAY_MS);
  const [customEnd, setCustomEnd] = useState<number>(Date.now());
  const [selectedStatMember, setSelectedStatMember] = useState<string | null>(null);
  const [boardLimits, setBoardLimits] = useState<Record<string, number>>({});
  const limitFor = (k: string) => boardLimits[k] ?? 5;
  const expandBoard = (k: string) => setBoardLimits(p => ({...p, [k]: nextBoardLimit(p[k] ?? 5)}));

  const timeWindow = useMemo(() => statsWindow(range, customStart, customEnd), [range, customStart, customEnd]);

  const stats = useMemo(
    () => computeStats({history, chatMessages, members, period: timeWindow, singlet, selfId}),
    [history, chatMessages, members, timeWindow, singlet, selfId],
  );
  const statPools: PickerPool[] = useMemo(() => {
    const eligible = (m: Member) => !m.archived && (!singlet || (m.isCustomFront && !isSingletHiddenStatus(m)));
    return [
      {kind: 'members', label: '', members: members.filter(m => !m.isFacet && (singlet || !m.isCustomFront) && eligible(m))},
      pickerPool('facets', members.filter(m => m.isFacet && eligible(m)), t),
      pickerPool('customFronts', singlet ? [] : members.filter(m => m.isCustomFront && !m.isFacet && eligible(m)), t),
    ];
  }, [members, singlet, t]);

  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const getMember = (id: string) => memberById.get(id);

  const statDetail = useMemo(() => {
    if (!selectedStatMember) return null;
    const detail = memberDetail(stats.entries, selectedStatMember, singlet, selfId);
    const coOfKind = (kind: MemberKind) => detail.coMembers.filter(([id]) => memberKind(memberById.get(id)) === kind);
    const coGroups: CoGroup[] = singlet
      ? [{key: 'coMembers', label: t('stats.coStatuses'), all: detail.coMembers}]
      : [
        {key: 'coMembers', label: t('stats.topCoMembers'), all: coOfKind('member')},
        {key: 'coFacets', label: t('members.facets'), all: coOfKind('facet')},
        {key: 'coCustomFronts', label: t('members.customFronts'), all: coOfKind('customFront')},
      ];
    return {detail, coGroups};
  }, [stats.entries, selectedStatMember, singlet, selfId, memberById, t]);

  const board = {onExpand: expandBoard, getMember};
  const peakMax = Math.max(...stats.peakHours, 1);
  const quickRange = (label: string, apply: () => void) => (
    <TouchableOpacity onPress={apply} activeOpacity={0.7} accessibilityRole="button"
      hitSlop={{top: 7, bottom: 7}} style={{flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
      <Text style={{fontSize: fs(11), color: T.dim}}>{label}</Text>
    </TouchableOpacity>
  );
  const rangeFrom = (start: number) => {
    setCustomStart(start);
    setCustomEnd(Date.now());
  };

  return (
    <KeyboardAwareScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={{padding: 16, paddingBottom: 40}} bottomOffset={24}>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16}}>
        <RangeBtn selected={range} onSelect={setRange} id="all" label={t('stats.allTime')} />
        <RangeBtn selected={range} onSelect={setRange} id="7d" label={t('stats.last7')} />
        <RangeBtn selected={range} onSelect={setRange} id="30d" label={t('stats.last30')} />
        <RangeBtn selected={range} onSelect={setRange} id="custom" label={t('stats.customRange')} />
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
          />
          <View style={{flexDirection: 'row', gap: 8, marginTop: 4}}>
            {quickRange(t('stats.last30'), () => rangeFrom(Date.now() - 30 * DAY_MS))}
            {quickRange(t('stats.thisMonth'), () => { const now = new Date(); rangeFrom(new Date(now.getFullYear(), now.getMonth(), 1).getTime()); })}
            {quickRange(t('stats.thisYear'), () => rangeFrom(new Date(new Date().getFullYear(), 0, 1).getTime()))}
          </View>
        </View>
      )}

      <View style={{flexDirection: 'row', gap: 8, marginBottom: 16}}>
        <StatCard label={t('stats.totalTime')} value={fmtDur(0, stats.totalMs)} accent />
        <StatCard label={t('stats.sessions')} value={fmtNum(stats.totalSessions, 0)} />
        {!singlet && <StatCard label={t('stats.messages')} value={fmtNum(stats.totalMessages, 0)} />}
      </View>

      <TierBoard {...board} title={singlet ? t('stats.topStatuses') : tierHeading('primary', t('stats.topFronters'))} boardKey="fronters" limit={limitFor('fronters')} entries={stats.fronters} />
      {!singlet && <TierBoard {...board} title={tierHeading('coFront', t('stats.topCoFronters'))} boardKey="cofronters" limit={limitFor('cofronters')} entries={stats.coFronters} />}
      {!singlet && <TierBoard {...board} title={tierHeading('coConscious', t('stats.topCoCon'))} boardKey="cocon" limit={limitFor('cocon')} entries={stats.coConscious} />}
      {!singlet && <Leaderboard {...board} title={t('stats.topChatters')} boardKey="chatters" limit={limitFor('chatters')} entries={stats.chatters} renderValue={v => t('stats.msgsCount', {count: v})} />}
      <Leaderboard {...board} title={t('stats.topMoods')} boardKey="moods" limit={limitFor('moods')} entries={stats.moods} renderValue={v => t('stats.timesCount', {count: fmtNum(v, 0)})} formatKey={m => translateMood(m, t)} />
      <Leaderboard {...board} title={t('stats.topLocations')} boardKey="locations" limit={limitFor('locations')} entries={stats.locations} renderValue={v => t('stats.timesCount', {count: fmtNum(v, 0)})} />

      {stats.energyAvgs.length > 0 && (
        <View style={{marginBottom: 16}}>
          <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{t('energy.avgEnergy')}</Text>
          {stats.energyAvgs.slice(0, 8).map(({id, avg}) => {
            const m = getMember(id);
            return (
              <View key={id} style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6}}>
                <Avatar member={m} size={22} />
                <Text style={{flex: 1, fontSize: fs(12), color: T.text}}>{m?.name || '?'}</Text>
                <View style={{width: 80, height: 6, backgroundColor: T.surface, borderRadius: 3, overflow: 'hidden'}}>
                  <View style={{height: '100%', width: `${(avg / 10) * 100}%`, backgroundColor: m?.color || T.accent, borderRadius: 3}} />
                </View>
                <Text style={{fontSize: fs(11), color: T.muted, minWidth: 40, textAlign: 'right'}}>{fmtNum(avg, 1)}/10</Text>
              </View>
            );
          })}
        </View>
      )}

      {stats.peakHours.some(v => v > 0) && (
        <View style={{marginBottom: 16}}>
          <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{t('stats.peakHours')}</Text>
          <HourChart values={stats.peakHours}
            a11yLabel={t('a11y.labelValue', {label: t('stats.peakHours'), value: hourSummary(stats.peakHours, c => fmtNum(c))})}
            bar={count => ({height: Math.max((count / peakMax) * 45, 1), color: count === peakMax && count > 0 ? T.accent : `${T.dim}40`})} />
        </View>
      )}

      {stats.energyByHour.some(v => v > 0) && (
        <View style={{marginBottom: 16}}>
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8}}>
            <Text accessibilityRole="header" style={sectionLabel(T)}>{t('stats.energyByHour')}</Text>
            <Text style={{fontSize: fs(9), color: T.muted}}>{t('energy.outOf10')}</Text>
          </View>
          <HourChart values={stats.energyByHour}
            a11yLabel={`${t('stats.energyByHour')}, ${t('a11y.labelValue', {label: t('energy.outOf10'), value: hourSummary(stats.energyByHour, avg => fmtNum(avg, 1))})}`}
            bar={avg => ({height: avg > 0 ? Math.max((avg / 10) * 45, 2) : 1, color: avg > 0 ? T.accent : `${T.dim}40`})} />
        </View>
      )}

      <View style={{marginBottom: 16}}>
        <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{singlet ? t('stats.statusDetails') : t('stats.memberDetails')}</Text>
        <MemberPicker pools={statPools} selected={selectedStatMember} onPick={m => setSelectedStatMember(selectedStatMember === m.id ? null : m.id)}
          variant="chips" showSearch={false} keepOrder maxResults={Infinity} />

        {selectedStatMember && statDetail && (
          <MemberStatDetail color={getMember(selectedStatMember)?.color || T.accent} detail={statDetail.detail} coGroups={statDetail.coGroups}
            getMember={getMember} limitFor={limitFor} onExpand={expandBoard} />
        )}
      </View>
    </KeyboardAwareScrollView>
  );
};
