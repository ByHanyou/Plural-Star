import React, {useMemo, useState} from 'react';
import {View, TouchableOpacity, Alert} from 'react-native';
import {Text} from './AppText';
import {Avatar} from './Avatar';
import {useTranslation} from 'react-i18next';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {FlashList} from '@shopify/flash-list';
import {HistoryEntry, Member, fmtTime, fmtDur, getLocale, TIER_I18N_KEY} from '../utils';
import {RANGE_MS, RANGE_KEYS, RANGE_LABEL, TIER_BAR, buildTimelineRows} from '../stats/timeline';
import type {RangeKey, Span, Row} from '../stats/timeline';

const LABEL_W = 96;
const ROW_H = 34;

export const FrontTimeline = ({history, members, singlet = false}: {
  history: HistoryEntry[];
  members: Member[];
  singlet?: boolean;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [range, setRange] = useState<RangeKey>('week');
  const [endAnchor, setEndAnchor] = useState<number | null>(null);

  const span = RANGE_MS[range];
  const end = endAnchor ?? Math.ceil(Date.now() / 60000) * 60000;
  const start = end - span;
  const live = endAnchor === null;

  const rows = useMemo(() => buildTimelineRows(history, members, start, end, Date.now()), [history, members, start, end]);

  const tickLabel = (ts: number): string => range === 'day'
    ? new Date(ts).toLocaleTimeString(getLocale(), {hour: 'numeric', minute: '2-digit'})
    : new Date(ts).toLocaleDateString(getLocale(), {month: 'short', day: 'numeric'});

  const goEarlier = () => setEndAnchor(end - span);
  const goLater = () => {
    const next = end + span;
    setEndAnchor(next >= Date.now() ? null : next);
  };

  const spanLabel = (sp: Span): string =>
    t('history.tlSpan', {start: fmtTime(sp.start), end: sp.open && live ? t('history.now') : fmtTime(sp.end), dur: fmtDur(sp.start, sp.end)});

  const tierLineOf = (sp: Span): string | null =>
    singlet ? null : t(TIER_I18N_KEY[sp.tier]);

  const showSpan = (member: Member, sp: Span) => {
    const tierLine = tierLineOf(sp);
    Alert.alert(member.name, [tierLine, spanLabel(sp)].filter(Boolean).join('\n'));
  };

  const renderRow = ({item}: {item: Row}) => (
    <View style={{flexDirection: 'row', alignItems: 'center', height: ROW_H}}>
      <View style={{width: LABEL_W, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 6}}>
        <Avatar member={item.member} size={20} />
        <Text style={{flex: 1, fontSize: fs(11), color: T.text}} numberOfLines={1}>{item.member.name}</Text>
      </View>
      <View style={{flex: 1, height: ROW_H, justifyContent: 'center'}}>
        <View style={{height: 1, backgroundColor: T.border, opacity: 0.6}} />
        {item.spans.map((sp, i) => {
          const bar = TIER_BAR[sp.tier];
          return (
            <TouchableOpacity
              key={`${sp.start}-${sp.tier}-${i}`}
              onPress={() => showSpan(item.member, sp)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={[item.member.name, tierLineOf(sp), spanLabel(sp)].filter(Boolean).join(', ')}
              hitSlop={{top: 9, bottom: 9}}
              style={{
                position: 'absolute',
                left: `${((sp.start - start) / span) * 100}%`,
                width: `${((sp.end - sp.start) / span) * 100}%`,
                minWidth: 3,
                height: bar.height,
                top: (ROW_H - bar.height) / 2,
                borderRadius: 3,
                backgroundColor: item.member.color,
                opacity: bar.opacity,
              }}
            />
          );
        })}
      </View>
    </View>
  );

  const chip = (selected: boolean) => ({
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
    backgroundColor: selected ? `${T.accent}20` : T.surface,
    borderColor: selected ? `${T.accent}50` : T.border,
  } as const);

  const navBtn = {paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface};

  return (
    <View style={{flex: 1, paddingHorizontal: 16}}>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12}}>
        {RANGE_KEYS.map(k => (
          <TouchableOpacity key={k} onPress={() => setRange(k)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityState={{selected: range === k}} accessibilityLabel={t(RANGE_LABEL[k])}
            hitSlop={{top: 6, bottom: 6}}
            style={chip(range === k)}>
            <Text style={{fontSize: fs(11), color: range === k ? T.accent : T.dim, fontWeight: range === k ? '600' : '400'}}>{t(RANGE_LABEL[k])}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 8}}>
        <TouchableOpacity onPress={goEarlier} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('history.tlEarlier')}
          hitSlop={{top: 8, bottom: 8}}
          style={navBtn}>
          <Text style={{fontSize: fs(13), color: T.dim}} allowFontScaling={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">‹</Text>
        </TouchableOpacity>
        <Text style={{flex: 1, textAlign: 'center', fontSize: fs(11), color: T.dim}} numberOfLines={1} accessibilityLiveRegion="polite">
          {t('history.tlRange', {start: tickLabel(start), end: live ? t('history.tlNow') : tickLabel(end)})}
        </Text>
        <TouchableOpacity onPress={goLater} disabled={live} activeOpacity={0.7} accessibilityRole="button"
          accessibilityState={{disabled: live}} accessibilityLabel={t('history.tlLater')}
          hitSlop={{top: 8, bottom: 8}}
          style={[navBtn, {opacity: live ? 0.4 : 1}]}>
          <Text style={{fontSize: fs(13), color: T.dim}} allowFontScaling={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">›</Text>
        </TouchableOpacity>
        {!live && (
          <TouchableOpacity onPress={() => setEndAnchor(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('history.tlNow')}
            hitSlop={{top: 9, bottom: 9}}
            style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: `${T.accent}40`, backgroundColor: T.accentBg}}>
            <Text style={{fontSize: fs(11), color: T.accent}}>{t('history.tlNow')}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={{flexDirection: 'row', marginBottom: 4}}>
        <View style={{width: LABEL_W}} />
        {[0, 1 / 3, 2 / 3].map(f => (
          <Text key={f} style={{flex: 1, fontSize: fs(9), color: T.muted}} numberOfLines={1}>{tickLabel(start + f * span)}</Text>
        ))}
      </View>
      {rows.length === 0 ? (
        <View style={{alignItems: 'center', paddingVertical: 48}}>
          <Text style={{fontSize: fs(36), opacity: 0.4, marginBottom: 12}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">◷</Text>
          <Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center'}}>
            {singlet ? t('history.noHistorySinglet') : t('history.noHistory')}
          </Text>
        </View>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={r => r.member.id}
          renderItem={renderRow}
          contentContainerStyle={{paddingBottom: 32}}
        />
      )}
    </View>
  );
};
