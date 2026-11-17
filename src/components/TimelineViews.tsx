import React, {useMemo} from 'react';
import {Alert, StyleSheet, TouchableOpacity, View} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {useTranslation} from 'react-i18next';
import {Avatar} from './Avatar';
import {Text} from './AppText';
import {ensureReadable, fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {dateFormatter, fmtDate, fmtDur, fmtList, TIER_I18N_KEY, TIER_SHORT_I18N_KEY} from '../utils';
import {buildTimelineRows, TIER_BAR, verticalTimelineRows} from '../stats/timeline';
import type {TimelineEntry, TimelineInterval} from '../stats/timeline';

interface TimelineProps {
  entries: TimelineEntry[];
  start: number;
  singlet: boolean;
  spanLabel: (interval: TimelineInterval) => string;
}

export const VerticalTimeline = ({entries, start, singlet, spanLabel, newestFirst, now}: TimelineProps & {
  newestFirst: boolean; now: number;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  const clock = dateFormatter('clock', {hour: 'numeric', minute: '2-digit'});
  const rows = useMemo(() => verticalTimelineRows(entries, start, newestFirst), [entries, start, newestFirst]);
  return (
    <FlashList data={rows} keyExtractor={row => row.key} getItemType={row => row.kind}
      contentContainerStyle={{paddingBottom: 16}}
      renderItem={({item}) => {
        if (item.kind === 'day') {
          return <Text accessibilityRole="header" style={[s.day, {fontSize: fs(12), color: T.dim}]}>{fmtDate(item.at)}</Text>;
        }
        const entry = item.entry;
        const groups = entry.tiers.map(({tier, members}) => ({tier, names: fmtList(members.map(m => m.name))}));
        const details = groups.map(({tier, names}) => singlet ? names : `${t(TIER_I18N_KEY[tier])} · ${names}`);
        const description = [...details, spanLabel(entry)].join('\n');
        const color = ensureReadable(entry.tiers[0].members[0].color || T.accent, T.bg, 3);
        return (
          <TouchableOpacity style={[s.entry, {borderBottomColor: T.border}]} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel={description}
            onPress={() => Alert.alert(t('history.timeline'), description)}>
            <Text style={{width: fs(63), color: T.dim, fontSize: fs(12)}}>
              {entry.start < start ? t('history.tlEarlier') : clock(new Date(entry.start))}
            </Text>
            <View style={s.rail} accessible={false}>
              <View style={[s.railLine, {backgroundColor: T.borderLt}]} />
              <View style={[s.dot, {backgroundColor: color}]} />
            </View>
            <View style={s.names}>
              {groups.map(({tier, names}) => (
                <Text key={tier} numberOfLines={2} style={{color: T.text, fontSize: fs(14), fontWeight: '600'}}>
                  {names}
                  {!singlet && <Text style={{color: T.dim, fontSize: fs(11), fontWeight: '400'}}>{'  '}{t(TIER_SHORT_I18N_KEY[tier])}</Text>}
                </Text>
              ))}
            </View>
            <View style={s.duration}>
              {entry.end === null && <Text style={{color: T.accent, fontSize: fs(11)}}>{t('history.tlNow')}</Text>}
              <Text style={{color: T.dim, fontSize: fs(12)}}>{fmtDur(entry.start, entry.end ?? now)}</Text>
            </View>
          </TouchableOpacity>
        );
      }} />
  );
};

export const HorizontalTimeline = ({entries, start, end, singlet, spanLabel, tickLabel, onSelectMember}: TimelineProps & {
  end: number; tickLabel: (ts: number) => string; onSelectMember: (id: string) => void;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  const rows = useMemo(() => buildTimelineRows(entries, start, end), [entries, start, end]);
  const duration = end - start;
  return (
    <>
      <View style={s.chartRow}>
        <View style={s.memberLabel} />
        <View style={s.axis}>
          {[0, 0.5, 1].map(f => (
            <Text key={f} numberOfLines={1} style={{flex: 1, fontSize: fs(10), color: T.dim, textAlign: f === 0 ? 'left' : f === 1 ? 'right' : 'center'}}>
              {tickLabel(start + f * duration)}
            </Text>
          ))}
        </View>
      </View>
      <FlashList data={rows} keyExtractor={row => row.member.id} contentContainerStyle={{paddingBottom: 16}}
        renderItem={({item}) => (
          <View style={s.chartRow}>
            <TouchableOpacity style={s.memberLabel} onPress={() => onSelectMember(item.member.id)}
              accessibilityRole="button" accessibilityLabel={`${item.member.name}, ${t(singlet ? 'history.byStatus' : 'history.memberHistory')}`}>
              <Avatar member={item.member} size={20} />
              <Text numberOfLines={1} style={{flex: 1, color: T.text, fontSize: fs(12)}}>{item.member.name}</Text>
            </TouchableOpacity>
            <View style={s.track}>
              <View style={[s.midline, {backgroundColor: T.border}]} />
              <View style={{height: 1, backgroundColor: T.borderLt}} />
              {item.spans.map((sp, i) => {
                const left = (Math.max(start, sp.start) - start) / duration;
                const right = (end - Math.min(end, sp.end ?? end)) / duration;
                const bar = TIER_BAR[sp.tier];
                const anchor = left > 0.5 ? {right: `${right * 100}%` as const} : {left: `${left * 100}%` as const};
                const label = [singlet ? null : t(TIER_I18N_KEY[sp.tier]), spanLabel(sp)].filter(Boolean).join('\n');
                return (
                  <TouchableOpacity key={i} onPress={() => Alert.alert(item.member.name, label)}
                    accessibilityRole="button" accessibilityLabel={`${item.member.name}, ${label}`} hitSlop={{top: 8, bottom: 8}}
                    style={[s.bar, anchor, {
                      width: `${Math.max(0, 1 - left - right) * 100}%`, height: bar.height, top: (36 - bar.height) / 2,
                      backgroundColor: item.member.color || T.accent, opacity: bar.opacity,
                    }]} />
                );
              })}
            </View>
          </View>
        )} />
    </>
  );
};

const s = StyleSheet.create({
  day: {fontWeight: '600', paddingTop: 8, paddingBottom: 3},
  entry: {minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth},
  rail: {alignSelf: 'stretch', width: 8, alignItems: 'center', justifyContent: 'center'},
  railLine: {position: 'absolute', top: 0, bottom: 0, width: 1},
  dot: {width: 8, height: 8, borderRadius: 4},
  names: {flex: 1, paddingVertical: 6, gap: 2},
  duration: {maxWidth: '25%', alignItems: 'flex-end'},
  chartRow: {flexDirection: 'row', alignItems: 'center'},
  memberLabel: {width: '30%', maxWidth: 150, flexDirection: 'row', alignItems: 'center', paddingRight: 8, gap: 5, paddingVertical: 4},
  axis: {flex: 1, flexDirection: 'row'},
  track: {flex: 1, height: 36, justifyContent: 'center', overflow: 'hidden'},
  bar: {position: 'absolute', minWidth: 3, borderRadius: 3},
  midline: {position: 'absolute', left: '50%', top: 0, bottom: 0, width: StyleSheet.hairlineWidth},
});
