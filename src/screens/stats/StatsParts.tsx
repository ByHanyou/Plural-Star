import React from 'react';
import {View, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {Avatar} from '../../components/Avatar';
import {sectionLabel} from '../../components/controls';
import {fontScale, ThemeColors} from '../../theme';
import {useTheme} from '../../themeContext';
import {Member, fmtDur, fmtNum, fmtPercent, fmtClock, translateMood} from '../../utils';
import type {MemberDetail, StatsRange, TierBoardEntry} from '../../stats/compute';

const MAX_BOARD = 25;
export const nextBoardLimit = (cur: number) => (cur < 10 ? 10 : MAX_BOARD);

export type CoGroup = {key: string; label: string; all: [string, number][]};

export function MemberStatDetail({color, detail, coGroups, getMember, limitFor, onExpand}: {
  color: string; detail: MemberDetail; coGroups: CoGroup[];
  getMember: (id: string) => Member | undefined; limitFor: (key: string) => number; onExpand: (key: string) => void;
}) {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const groupHeader = {fontSize: fs(9), letterSpacing: 1, textTransform: 'uppercase' as const, color: T.muted, marginBottom: 6};
  const countText = (count: number) => <Text style={{fontSize: fs(11), color: T.muted}}>{t('stats.timesCount', {count: fmtNum(count, 0)})}</Text>;
  const mdLimit = limitFor('coMoods');
  const topMd = detail.moods.slice(0, mdLimit);
  return (
    <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12}}>
      <View style={{flexDirection: 'row', gap: 16, marginBottom: 10}}>
        <View><Text style={{fontSize: fs(18), fontWeight: '700', color}}>{fmtNum(detail.sessions, 0)}</Text><Text style={{fontSize: fs(10), color: T.muted}}>{t('stats.sessionsSuffix', {count: detail.sessions})}</Text></View>
        {detail.avgEnergy !== null && <View><Text style={{fontSize: fs(18), fontWeight: '700', color}}>{fmtNum(detail.avgEnergy, 1)}</Text><Text style={{fontSize: fs(10), color: T.muted}}>{t('energy.outOf10')}</Text></View>}
      </View>
      {coGroups.map(g => {
        if (g.all.length === 0) return null;
        const limit = limitFor(g.key);
        return (
          <View key={g.key} style={{marginBottom: 8}}>
            <Text accessibilityRole="header" style={groupHeader}>{g.label}</Text>
            {g.all.slice(0, limit).map(([id, count]) => {
              const cm = getMember(id);
              return (
                <View key={id} style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4}}>
                  <Avatar member={cm} size={18} />
                  <Text style={{flex: 1, fontSize: fs(12), color: T.text}}>{cm?.name || '?'}</Text>
                  {countText(count)}
                </View>
              );
            })}
            <ShowMoreRow onExpand={onExpand} boardKey={g.key} total={g.all.length} limit={limit} />
          </View>
        );
      })}
      {topMd.length > 0 && (
        <View>
          <Text accessibilityRole="header" style={groupHeader}>{t('stats.topMoods')}</Text>
          {topMd.map(([mood, count]) => (
            <View key={mood} style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4}}>
              <Text style={{flex: 1, fontSize: fs(12), color: T.text}}>{translateMood(mood, t)}</Text>
              {countText(count)}
            </View>
          ))}
          <ShowMoreRow onExpand={onExpand} boardKey="coMoods" total={detail.moods.length} limit={mdLimit} />
        </View>
      )}
    </View>
  );
}

export function RangeBtn({id, label, selected, onSelect}: {id: StatsRange; label: string; selected: StatsRange; onSelect: (id: StatsRange) => void}) {
  const T = useTheme();
  const fs = fontScale(T);
  return (
  <TouchableOpacity onPress={() => onSelect(id)} activeOpacity={0.7}
    accessibilityRole="button" accessibilityState={{selected: selected === id}}
    hitSlop={{top: 6, bottom: 9}} style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
      backgroundColor: selected === id ? `${T.accent}20` : T.surface, borderColor: selected === id ? `${T.accent}60` : T.border}}>
    <Text style={{fontSize: fs(12), color: selected === id ? T.accent : T.dim, fontWeight: selected === id ? '600' : '400'}}>{label}</Text>
  </TouchableOpacity>
  );
}

export function StatCard({label, value, accent}: {label: string; value: string; accent?: boolean}) {
  const T = useTheme();
  const fs = fontScale(T);
  return (
  <View style={{flex: 1, backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12}}>
    <Text style={sectionLabel(T, {fontSize: fs(9), marginBottom: 4})}>{label}</Text>
    <Text style={{fontSize: fs(16), fontWeight: '700', color: accent ? T.accent : T.text}}>{value}</Text>
  </View>
  );
}

const rankColor = (i: number, T: ThemeColors) => i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : T.dim;

interface BoardProps {
  title: string;
  boardKey: string;
  limit: number;
  onExpand: (boardKey: string) => void;
  getMember: (id: string) => Member | undefined;
}

function ShowMoreRow({boardKey, total, limit, onExpand}: {boardKey: string; total: number; limit: number; onExpand: (boardKey: string) => void}) {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  if (total <= limit || limit >= MAX_BOARD) return null;
  return (
    <TouchableOpacity onPress={() => onExpand(boardKey)} activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t('stats.showMoreN', {shown: fmtNum(limit, 0), total: fmtNum(total, 0)})}
      hitSlop={{top: 6, bottom: 6}} style={{paddingVertical: 9, alignItems: 'center', borderTopWidth: 1, borderTopColor: T.border}}>
      <Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>
        {t('stats.showMoreShort', {shown: fmtNum(Math.min(limit, total), 0), total: fmtNum(total, 0)})}
      </Text>
    </TouchableOpacity>
  );
}

type BoardItem = {key: string; value: number; fallbackName: string; sub?: string; valueText: string};

function RankedBoard({title, boardKey, items, limit, onExpand, getMember}: BoardProps & {items: BoardItem[]}) {
  const T = useTheme();
  const fs = fontScale(T);
  if (items.length === 0) return null;
  const shown = items.slice(0, limit);
  const max = Math.max(...shown.map(e => e.value), 1);
  const total = items.reduce((s, e) => s + e.value, 0) || 1;
  return (
    <View style={{marginBottom: 18}}>
      <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{title}</Text>
      <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border}}>
        {shown.map((item, i) => {
          const member = getMember(item.key);
          const isLast = i === shown.length - 1;
          const pct = Math.max(4, Math.round((item.value / max) * 100));
          return (
            <View key={item.key} style={{padding: 10, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: T.border}}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6}}>
                <Text style={{fontSize: fs(13), fontWeight: '700', color: rankColor(i, T), width: 22, textAlign: 'center'}}>{i + 1}</Text>
                {member ? <Avatar member={member} size={24} /> : null}
                <View style={{flex: 1}}>
                  <Text style={{fontSize: fs(13), color: T.text, fontWeight: '500'}} numberOfLines={1}>{member ? member.name : item.fallbackName}</Text>
                  {item.sub ? <Text style={{fontSize: fs(10), color: T.muted}}>{item.sub}</Text> : null}
                </View>
                <Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>{`${fmtPercent(item.value / total, 1, 1)} / ${item.valueText}`}</Text>
              </View>
              <View style={{height: 6, borderRadius: 3, backgroundColor: T.surface, overflow: 'hidden'}}>
                <View style={{height: 6, width: `${pct}%`, borderRadius: 3, backgroundColor: member?.color || T.accent}} />
              </View>
            </View>
          );
        })}
        <ShowMoreRow onExpand={onExpand} boardKey={boardKey} total={items.length} limit={limit} />
      </View>
    </View>
  );
}

export function Leaderboard({entries, renderValue, formatKey, ...board}: BoardProps & {entries: [string, number][]; renderValue: (v: number) => string; formatKey?: (k: string) => string}) {
  return <RankedBoard {...board} items={entries.map(([key, value]) => ({key, value, fallbackName: formatKey ? formatKey(key) : key, valueText: renderValue(value)}))} />;
}

export function TierBoard({entries, ...board}: BoardProps & {entries: TierBoardEntry[]}) {
  const {t} = useTranslation();
  return <RankedBoard {...board} items={entries.map(e => ({key: e.id, value: e.time, fallbackName: e.id, sub: t('stats.sessionsCount', {count: e.sessions}), valueText: fmtDur(0, e.time)}))} />;
}

export const hourSummary = (values: number[], fmt: (v: number) => string): string =>
  values.map((v, h) => (v > 0 ? `${fmtClock(h, 0)} (${fmt(v)})` : '')).filter(Boolean).join(', ');

export function HourChart({values, a11yLabel, bar}: {values: number[]; a11yLabel: string; bar: (v: number) => {height: number; color: string}}) {
  const T = useTheme();
  const fs = fontScale(T);
  return (
    <>
      <View accessible accessibilityRole="image" accessibilityLabel={a11yLabel} style={{flexDirection: 'row', alignItems: 'flex-end', height: 50, gap: 1}}>
        {values.map((v, h) => {
          const b = bar(v);
          return (
            <View key={h} style={{flex: 1, justifyContent: 'flex-end', height: '100%'}}>
              <View style={{width: '100%', height: b.height, backgroundColor: b.color, borderRadius: 1}} />
            </View>
          );
        })}
      </View>
      <View style={{flexDirection: 'row', gap: 1, marginTop: 2}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {values.map((_, h) => (
          <View key={h} style={{flex: 1, alignItems: 'center'}}>
            <Text style={{fontSize: fs(7), color: T.muted}}>{h % 6 === 0 ? h : ''}</Text>
          </View>
        ))}
      </View>
    </>
  );
}
