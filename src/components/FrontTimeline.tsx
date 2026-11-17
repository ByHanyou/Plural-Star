import React, {useMemo, useState} from 'react';
import {StyleSheet, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from './AppText';
import {HorizontalTimeline, VerticalTimeline} from './TimelineViews';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {useAppStore} from '../store/appStore';
import {saveTimelineLayout} from '../store/actions';
import {reportSaveError} from '../utils/saveError';
import {dateFormatter, fmtDur, fmtTime} from '../utils';
import type {HistoryEntry, Member} from '../utils';
import {RANGE_MS, RANGE_KEYS, RANGE_LABEL, timelineEntriesInRange} from '../stats/timeline';
import type {RangeKey, TimelineInterval} from '../stats/timeline';

const LAYOUTS = [
  {value: 'newestFirst', arrow: '↑', label: 'history.tlNewestFirst'},
  {value: 'oldestFirst', arrow: '↓', label: 'history.tlOldestFirst'},
  {value: 'horizontal', arrow: '→', label: 'history.tlHorizontal'},
] as const;

interface Props {
  history: HistoryEntry[];
  members: Member[];
  singlet: boolean;
  effectiveEnd: (entry: HistoryEntry) => number | null;
  now: number;
  onSelectMember: (id: string) => void;
}

export const FrontTimeline = ({history, members, singlet, effectiveEnd, now, onSelectMember}: Props) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const savedLayout = useAppStore(s => s.appSettings.timelineLayout);
  const layout = LAYOUTS.find(option => option.value === savedLayout) ?? LAYOUTS[0];
  const [choosingLayout, setChoosingLayout] = useState(false);
  const [range, setRange] = useState<RangeKey>('week');
  const [page, setPage] = useState<{end: number; liveEnd: number} | null>(null);
  const end = page?.end ?? now;
  const duration = RANGE_MS[range];
  const start = end - duration;
  const entries = useMemo(() => timelineEntriesInRange(history, members, start, end, effectiveEnd),
    [history, members, start, end, effectiveEnd]);

  const earlier = () => setPage(prev => ({end: (prev?.end ?? now) - duration, liveEnd: prev?.liveEnd ?? now}));
  const later = () => setPage(prev => {
    if (!prev || prev.end + duration >= prev.liveEnd) return null;
    return {...prev, end: prev.end + duration};
  });

  const shortDate = dateFormatter('timelineDate', {month: 'short', day: 'numeric'});
  const fullDate = dateFormatter('timelineDateYear', {month: 'short', day: 'numeric', year: 'numeric'});
  const rangeDate = (ts: number) => {
    const d = new Date(ts);
    return d.getFullYear() === new Date(now).getFullYear() ? shortDate(d) : fullDate(d);
  };
  const tickFormat = range === 'day' ? dateFormatter('clock', {hour: 'numeric', minute: '2-digit'}) : shortDate;
  const spanLabel = (sp: TimelineInterval) => t('history.tlSpan', {
    start: fmtTime(sp.start), end: sp.end === null ? t('history.now') : fmtTime(sp.end), dur: fmtDur(sp.start, sp.end ?? now),
  });
  const chipColors = (selected: boolean) => ({
    backgroundColor: selected ? T.accentBg : T.surface, borderColor: selected ? T.accent : T.border,
  });
  const viewKey = `${layout.value}-${range}-${page?.end ?? 'live'}`;

  return (
    <View style={s.container}>
      <View style={s.toolbar}>
        {RANGE_KEYS.map(k => (
          <TouchableOpacity key={k} onPress={() => setRange(k)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityState={{selected: range === k}} style={[s.chip, chipColors(range === k)]}>
            <Text style={{fontSize: fs(12), color: range === k ? T.accent : T.dim}}>{t(RANGE_LABEL[k])}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={() => setChoosingLayout(open => !open)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel={t('history.tlLayout')} accessibilityState={{expanded: choosingLayout}}
          accessibilityValue={{text: t(layout.label)}} style={[s.chip, s.layoutButton, chipColors(choosingLayout)]}>
          <Text style={{fontSize: fs(12), color: T.text}}>{layout.arrow} {t('history.tlLayout')}</Text>
        </TouchableOpacity>
      </View>
      {choosingLayout && (
        <View accessibilityRole="radiogroup" accessibilityLabel={t('history.tlLayout')} style={s.options}>
          {LAYOUTS.map(option => (
            <TouchableOpacity key={option.value} accessibilityRole="radio" accessibilityLabel={t(option.label)}
              accessibilityState={{checked: layout.value === option.value}} style={[s.chip, chipColors(layout.value === option.value)]}
              onPress={() => {
                setChoosingLayout(false);
                if (option.value !== savedLayout) saveTimelineLayout(option.value).catch(reportSaveError);
              }}>
              <Text style={{fontSize: fs(12), color: layout.value === option.value ? T.accent : T.text}}>{option.arrow} {t(option.label)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={[s.navigation, {borderBottomColor: T.border}]}>
        <TouchableOpacity onPress={earlier} accessibilityRole="button" accessibilityLabel={t('history.tlEarlier')} style={s.navButton}>
          <Text style={{fontSize: fs(19), color: T.dim}} allowFontScaling={false}>‹</Text>
        </TouchableOpacity>
        <Text style={{flex: 1, textAlign: 'center', fontSize: fs(12), color: T.text}} accessibilityLiveRegion="polite">
          {t('history.tlRange', {start: rangeDate(start), end: page ? rangeDate(end) : t('history.tlNow')})}
        </Text>
        <TouchableOpacity onPress={later} disabled={!page} accessibilityRole="button" accessibilityLabel={t('history.tlLater')}
          accessibilityState={{disabled: !page}} style={[s.navButton, !page && {opacity: 0.4}]}>
          <Text style={{fontSize: fs(19), color: T.dim}} allowFontScaling={false}>›</Text>
        </TouchableOpacity>
        {page && (
          <TouchableOpacity onPress={() => setPage(null)} accessibilityRole="button" style={s.navButton}>
            <Text style={{fontSize: fs(12), color: T.accent}}>{t('history.tlNow')}</Text>
          </TouchableOpacity>
        )}
      </View>
      {entries.length === 0 ? (
        <Text style={{paddingVertical: 16, textAlign: 'center', color: T.dim, fontSize: fs(13)}}>
          {t(history.length ? 'history.tlEmptyRange' : singlet ? 'history.noHistorySinglet' : 'history.noHistory')}
        </Text>
      ) : layout.value === 'horizontal' ? (
        <HorizontalTimeline key={viewKey} entries={entries} start={start} end={end} singlet={singlet} spanLabel={spanLabel}
          tickLabel={ts => tickFormat(new Date(ts))} onSelectMember={onSelectMember} />
      ) : (
        <VerticalTimeline key={viewKey} entries={entries} start={start} now={now} singlet={singlet} spanLabel={spanLabel}
          newestFirst={layout.value === 'newestFirst'} />
      )}
    </View>
  );
};

const s = StyleSheet.create({
  container: {flex: 1, paddingHorizontal: 16},
  toolbar: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, paddingTop: 6},
  chip: {minHeight: 32, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1},
  layoutButton: {marginLeft: 'auto'},
  options: {flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingTop: 4},
  navigation: {flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 3},
  navButton: {minHeight: 34, minWidth: 36, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center'},
});
