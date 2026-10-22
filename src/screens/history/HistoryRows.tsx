import React from 'react';
import {View, TouchableOpacity, StyleSheet} from 'react-native';
import {Trans, useTranslation} from 'react-i18next';
import {useMappingHelper} from '@shopify/flash-list';
import {Text} from '../../components/AppText';
import {Avatar} from '../../components/Avatar';
import {AccentText} from '../../components/AccentText';
import {sectionLabel} from '../../components/controls';
import {fontScale, tierAccent} from '../../theme';
import {useTheme} from '../../themeContext';
import {HistoryEntry, JournalEntry, Member, fmtTime, fmtDur, fmtNum, membersByIds, translateMood, TIER_SHORT_I18N_KEY} from '../../utils';
import {MemberEvent, MemberSummary, TierDetails, detailsForTier, hasEntry} from '../../history/memberHistory';

const CO_TIERS = ['coFront', 'coConscious'] as const;
const NAME_CAP = 6;
const PRIMARY_TRUNC_THRESHOLD = 32;
const EVENT_ICONS: Record<MemberEvent['type'], string> = {front: '◈', mood: '◉', location: '⊙', note: '✎', journal: '📖'};
const ACTION_HIT = {top: 12, bottom: 12, left: 6, right: 6};

const NoteBox = ({text, roomy = false}: {text: string; roomy?: boolean}) => {
  const T = useTheme();
  const fs = fontScale(T);
  return (
    <View style={{backgroundColor: T.surface, borderRadius: 6, padding: roomy ? 8 : 7}}>
      <Text style={{fontSize: fs(12), color: T.dim, lineHeight: fs(roomy ? 18 : 17)}}>{text}</Text>
    </View>
  );
};

const TierRow = React.memo(function TierRow({label, ids, color, expanded, cap, memberMap}: {
  label: string; ids: string[] | undefined; color: string; expanded?: boolean; cap?: number;
  memberMap: Map<string, Member>;
}) {
  const T = useTheme();
  const fs = fontScale(T);
  const allMembers = membersByIds(ids, memberMap);
  if (allMembers.length === 0) return null;
  const visible = (expanded || cap === undefined) ? allMembers : allMembers.slice(0, Math.max(0, cap));
  const hidden = allMembers.length - visible.length;
  const namesText = visible.map(m => m.name).join(', ') + (hidden > 0 ? `, +${hidden}` : '');
  return (
    <View style={{flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 2}}>
      <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginTop: 5}} />
      <Text style={{fontSize: fs(10), color, fontWeight: '600', letterSpacing: 0.5, marginTop: 1}}>{label}</Text>
      <Text style={{flex: 1, fontSize: fs(11), color: T.dim}} numberOfLines={expanded ? undefined : 1}>{namesText}</Text>
    </View>
  );
});

const DetailBadges = ({mood, location, energy}: {mood?: string; location?: string; energy?: number}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  const strong = <Text style={{fontSize: fs(11), color: T.text, fontWeight: '500'}} />;
  return (
    <>
      {mood ? (
        <View style={[s.badge, {backgroundColor: T.surface}]}>
          <Text style={{fontSize: fs(10), color: T.dim}}><Trans i18nKey="history.moodBadge" values={{mood: translateMood(mood, t)}} components={{b: strong}} /></Text>
        </View>
      ) : null}
      {location ? (
        <View style={[s.badge, {backgroundColor: T.surface}]}>
          <Text style={{flexShrink: 1, fontSize: fs(10), color: T.dim}} numberOfLines={1}><Trans i18nKey="history.atBadge" values={{location}} components={{b: strong}} /></Text>
        </View>
      ) : null}
      {energy != null ? (
        <View style={[s.badge, {backgroundColor: T.surface}]}>
          <Text style={{fontSize: fs(10), color: T.dim}}><Trans i18nKey="history.energyBadge" values={{value: t('energy.outOfTen', {n: fmtNum(energy, 0)})}} components={{b: strong}} /></Text>
        </View>
      ) : null}
    </>
  );
};

const StatCard = ({label, children}: {label: string; children: React.ReactNode}) => {
  const T = useTheme();
  const fs = fontScale(T);
  return (
    <View style={[s.stat, {backgroundColor: T.card, borderColor: T.border}]}>
      <Text style={sectionLabel(T, {fontSize: fs(9), fontWeight: 'normal', marginBottom: 3})}>{label}</Text>
      {children}
    </View>
  );
};

export const MemberSummaryCards = ({totalMs, sessions, summary}: {totalMs: number; sessions: number; summary: MemberSummary}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  const valueStyle = {fontSize: fs(12), fontWeight: '600' as const, color: T.text};
  return (
    <View style={{flexDirection: 'row', gap: 8, margin: 16, marginBottom: 8}}>
      <StatCard label={t('history.totalTime')}>
        <AccentText style={{fontSize: fs(15), fontWeight: '700', color: T.accent}}>{fmtDur(0, totalMs)}</AccentText>
      </StatCard>
      <StatCard label={t('history.sessions')}>
        <Text style={{fontSize: fs(15), fontWeight: '700', color: T.text}}>{fmtNum(sessions, 0)}</Text>
      </StatCard>
      {summary.topMood && (
        <StatCard label={t('history.topMood')}>
          <Text style={valueStyle} numberOfLines={1}>{translateMood(summary.topMood, t)}</Text>
        </StatCard>
      )}
      {summary.topLoc && (
        <StatCard label={t('history.topLocation')}>
          <Text style={valueStyle} numberOfLines={1}>{summary.topLoc}</Text>
        </StatCard>
      )}
      {summary.avgEnergy !== null && (
        <StatCard label={t('stats.avgEnergy')}>
          <Text style={valueStyle} numberOfLines={1}>{t('energy.outOfTen', {n: fmtNum(summary.avgEnergy, 1, 1)})}</Text>
        </StatCard>
      )}
    </View>
  );
};

interface FrontHistoryEntryRowProps {
  entry: HistoryEntry;
  isLastInGroup: boolean;
  originalIndex: number;
  entryKey: string;
  isExpanded: boolean;
  memberMap: Map<string, Member>;
  selfId?: string;
  singlet?: boolean;
  effectiveEnd: number | null;
  onToggleExpand: (key: string) => void;
  onEditEntry?: (originalIndex: number) => void;
  onDelete?: (originalIndex: number) => void;
}

export const FrontHistoryEntryRow = React.memo(function FrontHistoryEntryRow({
  entry, isLastInGroup, originalIndex, entryKey, isExpanded, memberMap, selfId, singlet, effectiveEnd, onToggleExpand, onEditEntry, onDelete,
}: FrontHistoryEntryRowProps) {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  const {getMappingKey} = useMappingHelper();
  const allPrimary = membersByIds(entry.memberIds, memberMap);
  const withoutSelf = singlet && selfId ? allPrimary.filter(m => m.id !== selfId) : allPrimary;
  const primaryFronters = singlet && withoutSelf.length === 0 ? allPrimary : withoutSelf;
  const coFrontMembers = membersByIds(entry.coFrontIds, memberMap);
  const coConMembers = membersByIds(entry.coConsciousIds, memberMap);
  const shownFronters = primaryFronters.length ? primaryFronters : coFrontMembers.length ? coFrontMembers : coConMembers;
  const displayEnd = entry.endTime ?? effectiveEnd;
  const isOpen = displayEnd === null;
  const coFrontCount = entry.coFrontIds?.length || 0;
  const coConCount = entry.coConsciousIds?.length || 0;
  const totalMembers = primaryFronters.length + coFrontCount + coConCount;
  const primaryBudget = isExpanded ? primaryFronters.length : Math.min(primaryFronters.length, NAME_CAP);
  const remainAfterPrimary = Math.max(0, NAME_CAP - primaryBudget);
  const coFrontBudget = isExpanded ? coFrontCount : Math.min(coFrontCount, remainAfterPrimary);
  const remainAfterCoFront = Math.max(0, remainAfterPrimary - coFrontBudget);
  const coConBudget = isExpanded ? coConCount : Math.min(coConCount, remainAfterCoFront);
  const visiblePrimary = primaryFronters.slice(0, primaryBudget);
  const hiddenPrimary = primaryFronters.length - visiblePrimary.length;
  const primaryDisplay = visiblePrimary.map(m => m.name).join(', ') + (hiddenPrimary > 0 ? `, +${hiddenPrimary}` : '');
  const fallbackDisplay = primaryFronters.length ? '' : shownFronters.slice(0, NAME_CAP).map(m => m.name).join(', ') + (shownFronters.length > NAME_CAP ? `, +${shownFronters.length - NAME_CAP}` : '');
  const showToggle = totalMembers > NAME_CAP || primaryDisplay.length > PRIMARY_TRUNC_THRESHOLD;
  return (
    <View style={{flexDirection: 'row', gap: 10}}>
      <View style={{alignItems: 'center', width: 16}}>
        <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: isOpen ? T.accent : T.dim, marginTop: 16}} />
        {!isLastInGroup && <View style={{flex: 1, width: 1, backgroundColor: T.border, marginTop: 2}} />}
      </View>
      <View style={[s.card, {flex: 1, backgroundColor: T.card, borderColor: isOpen ? `${T.accent}40` : T.border, marginBottom: 8}]}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4}}>
          <View style={{flexDirection: 'row'}}>
            {shownFronters.slice(0, 3).map((m, j) => (
              <View key={getMappingKey(m.id, j)} style={{marginLeft: j ? -8 : 0, zIndex: 10 - j}}>
                <Avatar member={m} size={26} />
              </View>
            ))}
          </View>
          <Text style={{flex: 1, fontSize: fs(14), fontWeight: '500', color: T.text}} numberOfLines={isExpanded ? undefined : 1}>
            {primaryDisplay || fallbackDisplay || t('common.unknown')}
          </Text>
          <AccentText style={{fontSize: fs(12), color: T.accent, fontWeight: '500'}}>
            {fmtDur(entry.startTime, displayEnd)}
          </AccentText>
        </View>
        {coFrontCount + coConCount > 0 && (
          <View style={{marginBottom: 4}}>
            <TierRow label={t(TIER_SHORT_I18N_KEY.coFront)} ids={entry.coFrontIds} color={tierAccent(T, 'coFront')} expanded={isExpanded} cap={coFrontBudget} memberMap={memberMap} />
            <TierRow label={t(TIER_SHORT_I18N_KEY.coConscious)} ids={entry.coConsciousIds} color={tierAccent(T, 'coConscious')} expanded={isExpanded} cap={coConBudget} memberMap={memberMap} />
          </View>
        )}
        <Text style={{fontSize: fs(11), color: T.muted, marginBottom: 4}}>
          {fmtTime(entry.startTime)}
          {isOpen ? ` → ${t('history.now')}` : displayEnd ? ` → ${fmtTime(displayEnd)}` : ''}
        </Text>
        {(entry.mood || entry.location || entry.energyLevel != null) && (
          <View style={{flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4}}>
            <DetailBadges mood={entry.mood} location={entry.location} energy={entry.energyLevel} />
          </View>
        )}
        {isExpanded && CO_TIERS.map((tier, ti) => {
          const td = detailsForTier(entry, tier);
          if (!td.mood && !td.location && td.energy === undefined && !td.note) return null;
          return (
            <View key={getMappingKey(tier, ti)} style={{marginBottom: 4}}>
              <View style={{flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center'}}>
                <Text style={{fontSize: fs(10), color: tierAccent(T, tier), fontWeight: '600'}}>{t(TIER_SHORT_I18N_KEY[tier])}</Text>
                <DetailBadges mood={td.mood} location={td.location} energy={td.energy} />
              </View>
              {td.note ? <View style={{marginTop: 4}}><NoteBox text={td.note} /></View> : null}
            </View>
          );
        })}
        {entry.note ? <NoteBox text={entry.note} roomy /> : null}
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4}}>
          {showToggle ? (
            <TouchableOpacity onPress={() => onToggleExpand(entryKey)} activeOpacity={0.7}
              accessibilityRole="button" accessibilityState={{expanded: isExpanded}}
              hitSlop={ACTION_HIT} style={{paddingVertical: 2, paddingHorizontal: 6}}>
              <Text style={{fontSize: fs(10), color: T.accent, fontWeight: '500'}}>{isExpanded ? t('history.showLess') : t('history.showMore')}</Text>
            </TouchableOpacity>
          ) : <View />}
          <View style={{flexDirection: 'row', gap: 12}}>
            {onEditEntry && (
              <TouchableOpacity onPress={() => onEditEntry(originalIndex)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={t('history.editEntry')}
                hitSlop={ACTION_HIT} style={{paddingVertical: 2, paddingHorizontal: 6}}>
                <Text style={{fontSize: fs(10), color: T.accent, opacity: 0.8}}>{t('history.editEntry')}</Text>
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity onPress={() => onDelete(originalIndex)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={t('history.deleteEntry')}
                hitSlop={ACTION_HIT} style={{paddingVertical: 2, paddingHorizontal: 6}}>
                <Text style={{fontSize: fs(10), color: T.danger, opacity: 0.6}}>{t('history.deleteEntry')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  );
});

const JournalEventBody = ({entry, locked}: {entry: JournalEntry; locked: boolean}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  const tags = entry.hashtags || [];
  return (
    <>
      <Text style={{fontSize: fs(14), fontWeight: '500', color: T.text, marginBottom: 2}}>
        {locked ? '🔒 ' : ''}{entry.title || t('common.untitled')}
      </Text>
      {entry.body && !locked ? (
        <Text style={{fontSize: fs(12), color: T.dim, lineHeight: fs(17)}} numberOfLines={2}>{entry.body}</Text>
      ) : null}
      {!locked && tags.length > 0 && (
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6}}>
          {tags.map(tag => (
            <View key={tag} style={{paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: `${T.info}12`, borderWidth: 1, borderColor: `${T.info}30`}}>
              <Text style={{fontSize: fs(10), color: T.info}}>{tag}</Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
};

export const MemberEventRow = ({event, isLast, label, details, color, journalLocked}: {
  event: MemberEvent; isLast: boolean; label: string; details: TierDetails; color: string; journalLocked: boolean;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  return (
    <View style={{flexDirection: 'row', gap: 10, marginBottom: 8}}>
      <View style={{alignItems: 'center', width: 16}}>
        <View style={{width: 8, height: 8, borderRadius: event.type === 'front' ? 4 : 2, backgroundColor: color, marginTop: 14}} />
        {!isLast && <View style={{flex: 1, width: 1, backgroundColor: T.border, marginTop: 2}} />}
      </View>
      <View style={[s.card, {flex: 1, backgroundColor: T.card, borderColor: T.border}]}>
        <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 4}}>
          <Text style={{fontSize: fs(12), color, marginRight: 6, fontWeight: '600'}} accessibilityLabel={label}>{EVENT_ICONS[event.type]} {label}</Text>
          <Text style={{fontSize: fs(11), color: T.muted, marginLeft: 'auto'}}>{fmtTime(event.time)}</Text>
        </View>
        {hasEntry(event) ? (
          <>
            {event.type === 'front' && (
              <Text style={{fontSize: fs(11), color: T.muted, marginBottom: 4}}>
                {fmtTime(event.entry.startTime)}{event.entry.endTime === null ? ` → ${t('history.now')}` : event.entry.endTime ? ` → ${fmtTime(event.entry.endTime)}` : ''}
                {'  '}<AccentText style={{color: T.accent}}>{fmtDur(event.entry.startTime, event.entry.endTime)}</AccentText>
              </Text>
            )}
            {(details.mood || details.location || details.energy !== undefined) && (
              <View style={{flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: details.note ? 4 : 0}}>
                <DetailBadges mood={details.mood} location={details.location} energy={details.energy} />
              </View>
            )}
            {details.note ? <NoteBox text={details.note} /> : null}
          </>
        ) : (
          <JournalEventBody entry={event.journalEntry} locked={journalLocked || !!event.journalEntry.password} />
        )}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  card: {borderRadius: 12, borderWidth: 1, padding: 12},
  badge: {flexDirection: 'row', alignItems: 'center', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, maxWidth: '100%'},
  stat: {flex: 1, borderRadius: 10, borderWidth: 1, padding: 10},
});
