import React, {useMemo, useState} from 'react';
import {View, TouchableOpacity, Alert} from 'react-native';
import {Text} from './AppText';
import {Avatar} from './Avatar';
import {useTranslation} from 'react-i18next';
import {fontScale, ThemeColors} from '../theme';
import {FlashList} from '@shopify/flash-list';
import {HistoryEntry, Member, FrontTierKey, fmtTime, fmtDur, getLocale, nameCompare, buildEffectiveEnd} from '../utils';

/**
 * SP-style front history graph: one row per member, colored spans on a shared
 * time axis. The window is a fixed range ending "now" until the user pages
 * back — buttons, not gestures, so it works under VoiceOver/TalkBack and every
 * bar is its own labeled element. Open entries take their effective end from
 * buildEffectiveEnd (the next switch closes them), matching the list view, and
 * a truly-current entry runs to the live now edge.
 */
type RangeKey = 'day' | 'week' | 'month' | 'quarter';
const RANGE_MS: Record<RangeKey, number> = {
  day: 86400000,
  week: 7 * 86400000,
  month: 30 * 86400000,
  quarter: 90 * 86400000,
};
const RANGE_KEYS: RangeKey[] = ['day', 'week', 'month', 'quarter'];
const RANGE_LABEL: Record<RangeKey, string> = {day: 'history.tlDay', week: 'history.tlWeek', month: 'history.tlMonth', quarter: 'history.tlQuarter'};

type Span = {start: number; end: number; tier: FrontTierKey; open: boolean};
type Row = {member: Member; spans: Span[]; total: number};

const LABEL_W = 96;
const ROW_H = 34;

// Visual weight per tier: primary solid, co-front slightly lighter, and
// co-conscious a thin faint strip — same member color throughout.
const TIER_BAR: Record<FrontTierKey, {height: number; opacity: number}> = {
  primary: {height: 16, opacity: 1},
  coFront: {height: 16, opacity: 0.75},
  coConscious: {height: 7, opacity: 0.45},
};

export const buildTimelineRows = (
  history: HistoryEntry[],
  members: Member[],
  start: number,
  end: number,
  now: number,
): Row[] => {
  const memberMap = new Map<string, Member>();
  for (const m of members) if (m && !m.deleted) memberMap.set(m.id, m);
  const effEnd = buildEffectiveEnd(history);
  const byMember = new Map<string, Span[]>();
  for (const e of history) {
    if (!e || (e.changeType && e.changeType !== 'front')) continue;
    if (!e.startTime) continue;
    const eff = effEnd(e);
    const open = eff == null;
    const rawEnd = eff ?? now;
    if (e.startTime >= end || rawEnd <= start) continue;
    const s = Math.max(e.startTime, start);
    const en = Math.min(rawEnd, end);
    if (en <= s) continue;
    const tiers: [FrontTierKey, string[] | undefined][] = [
      ['primary', e.memberIds],
      ['coFront', e.coFrontIds],
      ['coConscious', e.coConsciousIds],
    ];
    for (const [tier, ids] of tiers) {
      for (const id of ids || []) {
        if (!memberMap.has(id)) continue;
        let list = byMember.get(id);
        if (!list) { list = []; byMember.set(id, list); }
        list.push({start: s, end: en, tier, open});
      }
    }
  }
  const rows: Row[] = [];
  for (const [id, spans] of byMember) {
    const member = memberMap.get(id)!;
    // Co-conscious time is presence, not front time; it does not decide rank.
    const total = spans.reduce((acc, sp) => acc + (sp.tier === 'coConscious' ? 0 : sp.end - sp.start), 0);
    rows.push({member, spans, total});
  }
  rows.sort((a, b) => b.total - a.total || nameCompare(a.member.name, b.member.name));
  return rows;
};

export const FrontTimeline = ({T, history, members, singlet = false}: {
  T: ThemeColors;
  history: HistoryEntry[];
  members: Member[];
  singlet?: boolean;
}) => {
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [range, setRange] = useState<RangeKey>('week');
  // null anchor = the window ends at the live "now"; paging back pins it.
  const [endAnchor, setEndAnchor] = useState<number | null>(null);

  const now = Date.now();
  const span = RANGE_MS[range];
  const end = endAnchor ?? now;
  const start = end - span;
  const live = endAnchor === null;

  const rows = useMemo(
    () => buildTimelineRows(history, members, start, end, now),
    // `now` moves every render; the window bounds are what matter for rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, members, start, end],
  );

  const tickLabel = (ts: number): string => range === 'day'
    ? new Date(ts).toLocaleTimeString(getLocale(), {hour: 'numeric', minute: '2-digit'})
    : new Date(ts).toLocaleDateString(getLocale(), {month: 'short', day: 'numeric'});

  const goEarlier = () => setEndAnchor(end - span);
  const goLater = () => {
    const next = end + span;
    if (next >= Date.now()) setEndAnchor(null); else setEndAnchor(next);
  };

  const spanLabel = (sp: Span): string =>
    `${fmtTime(sp.start)} → ${sp.open && live ? t('history.now') : fmtTime(sp.end)} (${fmtDur(sp.start, sp.end)})`;

  const showSpan = (member: Member, sp: Span) => {
    const tierLine = singlet ? null : t(sp.tier === 'primary' ? 'tier.primaryFront' : sp.tier === 'coFront' ? 'tier.coFront' : 'tier.coConscious');
    Alert.alert(member.name, [tierLine, spanLabel(sp)].filter(Boolean).join('\n'));
  };

  const renderRow = ({item}: {item: Row}) => (
    <View style={{flexDirection: 'row', alignItems: 'center', height: ROW_H}}>
      <View style={{width: LABEL_W, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 6}}>
        <Avatar member={item.member} size={20} T={T} />
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
              accessibilityLabel={`${item.member.name}, ${spanLabel(sp)}`}
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

  return (
    <View style={{flex: 1, paddingHorizontal: 16}}>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12}}>
        {RANGE_KEYS.map(k => (
          <TouchableOpacity key={k} onPress={() => setRange(k)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityState={{selected: range === k}} accessibilityLabel={t(RANGE_LABEL[k])}
            style={chip(range === k)}>
            <Text style={{fontSize: fs(11), color: range === k ? T.accent : T.dim, fontWeight: range === k ? '600' : '400'}}>{t(RANGE_LABEL[k])}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 8}}>
        <TouchableOpacity onPress={goEarlier} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('history.tlEarlier')}
          style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface}}>
          <Text style={{fontSize: fs(13), color: T.dim}} allowFontScaling={false}>‹</Text>
        </TouchableOpacity>
        <Text style={{flex: 1, textAlign: 'center', fontSize: fs(11), color: T.dim}} numberOfLines={1}>
          {`${tickLabel(start)} → ${live ? t('history.tlNow') : tickLabel(end)}`}
        </Text>
        <TouchableOpacity onPress={goLater} disabled={live} activeOpacity={0.7} accessibilityRole="button"
          accessibilityState={{disabled: live}} accessibilityLabel={t('history.tlLater')}
          style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, opacity: live ? 0.4 : 1}}>
          <Text style={{fontSize: fs(13), color: T.dim}} allowFontScaling={false}>›</Text>
        </TouchableOpacity>
        {!live && (
          <TouchableOpacity onPress={() => setEndAnchor(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('history.tlNow')}
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
          <Text style={{fontSize: fs(36), opacity: 0.4, marginBottom: 12}}>◷</Text>
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
