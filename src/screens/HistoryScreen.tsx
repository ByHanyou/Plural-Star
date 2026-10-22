import React, {useState, useMemo, useCallback, useDeferredValue} from 'react';
import {View, TouchableOpacity, StyleSheet, useWindowDimensions} from 'react-native';
import {Text} from '../components/AppText';
import {Avatar} from '../components/Avatar';
import {useTranslation} from 'react-i18next';
import {Fonts, scaledFont, tierAccent} from '../theme';
import {useTheme} from '../themeContext';
import {useAppStore} from '../store/appStore';
import {useUiStore} from '../store/uiStore';
import {useMinuteTick} from '../hooks/useMinuteTick';
import {saveHistory} from '../store/actions';
import {reportSaveError} from '../utils/saveError';
import {confirmSteps} from '../utils/confirmSteps';
import {AccentText} from '../components/AccentText';
import {HistoryEntry, HistoryChangeType, JournalEntry, Member, FrontTierKey, singletStatuses, buildEffectiveEnd, TIER_I18N_KEY, isRosterMember, isFacetMember, isCustomFrontMember, toggleInSet} from '../utils';
import {FlashList} from '@shopify/flash-list';
import {FrontTimeline} from '../components/FrontTimeline';
import {MemberPicker} from '../components/MemberPicker';
import {pickerPool} from '../picker/memberPicker';
import {sectionLabel} from '../components/controls';
import {FrontHistoryRow, MemberEvent, MemberSummary, TierDetails, eventDetails, frontHistoryRows, hasEntry, memberEvents, mergedFrontSessions, sessionsTotalMs, summarizeMemberEvents} from '../history/memberHistory';
import {FrontHistoryEntryRow, MemberEventRow, MemberSummaryCards} from './history/HistoryRows';

type SubTab = 'front' | 'member' | 'timeline';

const SUB_TABS: SubTab[] = ['front', 'member', 'timeline'];

interface Props {
  singlet?: boolean;
  selfId?: string;
  readOnly?: boolean;
  historyOverride?: HistoryEntry[];
  membersOverride?: Member[];
  journalOverride?: JournalEntry[];
}

export const HistoryScreen = ({singlet = false, selfId, readOnly = false, historyOverride, membersOverride, journalOverride}: Props) => {
  const T = useTheme();
  useMinuteTick();
  const storeHistory = useAppStore(s => s.history);
  const storeJournal = useAppStore(s => s.journal);
  const storeMembers = useAppStore(s => s.members);
  const systemJournalPassword = useAppStore(s => s.system.journalPassword);
  const history = historyOverride ?? storeHistory;
  const journal = journalOverride ?? storeJournal;
  const members = membersOverride ?? storeMembers;
  const editHistoryEntry = useUiStore(s => s.editHistoryEntry);
  const {t} = useTranslation();
  const fs = useMemo(() => scaledFont(T.textScale), [T.textScale]);
  const win = useWindowDimensions();
  const landscape = win.width > win.height;
  const [subTab, setSubTab] = useState<SubTab>('front');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  const memberMap = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);

  const toggleEntryExpanded = useCallback((key: string) => {
    setExpandedEntries(prev => toggleInSet(prev, key));
  }, []);

  const startDelete = useCallback((entryIndex: number) => {
    const title = t('history.deleteEntry');
    confirmSteps([
      {title, message: t('history.deleteConfirm1'), action: t('common.confirm')},
      {title, message: t('history.deleteConfirm2'), action: t('common.confirm')},
      {title, message: t('history.deleteConfirm3'), action: t('common.delete')},
    ], () => { saveHistory(history.filter((_, i) => i !== entryIndex)).catch(reportSaveError); });
  }, [history, t]);

  const selectedMember = selectedMemberId ? memberMap.get(selectedMemberId) : undefined;

  const effEnd = useMemo(() => buildEffectiveEnd(history), [history]);
  const frontRows = useMemo<FrontHistoryRow[]>(() => frontHistoryRows(history, effEnd), [history, effEnd]);

  const deferredRows = useDeferredValue(frontRows);

  const renderFrontRow = useCallback(({item}: {item: FrontHistoryRow}) => {
    if (item.kind === 'header') {
      return <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8, marginTop: 16})}>{item.date}</Text>;
    }
    return (
      <FrontHistoryEntryRow
        entry={item.entry}
        isLastInGroup={item.isLastInGroup}
        originalIndex={item.originalIndex}
        entryKey={item.key}
        isExpanded={expandedEntries.has(item.key)}
        memberMap={memberMap}
        selfId={selfId}
        singlet={singlet}
        effectiveEnd={item.effectiveEnd}
        onToggleExpand={toggleEntryExpanded}
        onEditEntry={readOnly ? undefined : editHistoryEntry}
        onDelete={readOnly ? undefined : startDelete}
      />
    );
  }, [expandedEntries, memberMap, T, singlet, selfId, toggleEntryExpanded, editHistoryEntry, startDelete, readOnly]);

  const mergedSessions = useMemo(() => (selectedMemberId ? mergedFrontSessions(history, selectedMemberId) : []), [history, selectedMemberId]);

  const allMemberEvents = useMemo<MemberEvent[]>(
    () => (selectedMemberId ? memberEvents(selectedMemberId, mergedSessions, history, journal) : []),
    [selectedMemberId, mergedSessions, history, journal],
  );

  const memberSummary = useMemo<MemberSummary | null>(
    () => (selectedMember ? summarizeMemberEvents(selectedMember.id, allMemberEvents) : null),
    [selectedMember, allMemberEvents],
  );

  const withTier = (key: string, tier?: FrontTierKey | null): string =>
    tier && tier !== 'primary' ? t(key, {context: 'tier', tier: t(TIER_I18N_KEY[tier])}) : t(key);

  const getEventLabel = (type: HistoryChangeType, entry: HistoryEntry, d: TierDetails, frontTier?: FrontTierKey | null): string => {
    if ((type === 'mood' || type === 'location') && d.mood && d.location) return withTier('history.moodLocationChanged', entry.changeTier);
    if (type === 'mood') return withTier('history.moodChanged', entry.changeTier);
    if (type === 'location') return withTier('history.locationChanged', entry.changeTier);
    if (type === 'note') return withTier('history.noteUpdated', entry.changeTier);
    return singlet ? t('history.statusChange') : withTier('history.frontSwitch', frontTier);
  };

  const renderMemberEvent = ({item: event, index}: {item: MemberEvent; index: number}) => {
    const details = hasEntry(event) ? eventDetails(event.type, event.entry, selectedMemberId) : {};
    const label = hasEntry(event) ? getEventLabel(event.type, event.entry, details, event.tier) : t('history.journalEntry');
    const color = !hasEntry(event) ? T.info : event.type === 'front' ? tierAccent(T, event.tier || 'primary') : T.dim;
    return (
      <MemberEventRow event={event} isLast={index === allMemberEvents.length - 1} label={label} details={details} color={color}
        journalLocked={!!systemJournalPassword} />
    );
  };

  const subTabLabel = (tab: SubTab): string => {
    if (tab === 'front') return singlet ? t('history.statusHistory') : t('history.frontHistory');
    if (tab === 'member') return singlet ? t('history.byStatus') : t('history.memberHistory');
    return t('history.timeline');
  };

  const pickerMembers = singlet
    ? [...members.filter(m => m.id === selfId), ...singletStatuses(members)]
    : members.filter(isRosterMember);
  const pickerCustomFronts = singlet ? [] : members.filter(isCustomFrontMember);
  const historyPools = singlet
    ? [pickerPool('members', pickerMembers, t)]
    : [pickerPool('members', pickerMembers, t), pickerPool('facets', members.filter(isFacetMember), t), pickerPool('customFronts', pickerCustomFronts, t)];

  return (
    <View style={{flex: 1, backgroundColor: T.bg}}>
      <View style={{backgroundColor: T.bg, paddingHorizontal: 16, paddingTop: landscape ? 6 : 16}}>
        <Text
          accessibilityRole="header"
          style={[s.heading, {color: T.text, fontSize: fs(22)}, landscape && {fontSize: fs(15)}]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}>
          {t('history.title')}
        </Text>
        <View style={{flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border, marginTop: 4}}>
          {SUB_TABS.map(tab => (
            <TouchableOpacity key={tab} onPress={() => setSubTab(tab)} activeOpacity={0.7}
              accessibilityRole="tab" accessibilityState={{selected: subTab === tab}}
              hitSlop={{top: 6, bottom: 6}} style={[s.subtab, {
                flex: 1,
                alignItems: 'center',
                paddingVertical: landscape ? 5 : 10,
                borderBottomWidth: 2,
                borderBottomColor: subTab === tab ? T.accent : 'transparent',
              }]}>
              <AccentText numberOfLines={2} maxFontSizeMultiplier={1.3} style={{
                fontSize: fs(13),
                fontWeight: subTab === tab ? '600' : '400',
                color: subTab === tab ? T.accent : T.dim,
                textAlign: 'center',
              }}>
                {subTabLabel(tab)}
              </AccentText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {subTab === 'front' && (
        <FlashList
          data={deferredRows}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.kind}
          contentContainerStyle={{padding: 16, paddingBottom: 32}}
          ListEmptyComponent={
            <View style={{alignItems: 'center', paddingVertical: 48}}>
              <Text style={{fontSize: fs(36), opacity: 0.4, marginBottom: 12}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">◷</Text>
              <Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center'}}>
                {singlet ? t('history.noHistorySinglet') : t('history.noHistory')}
              </Text>
            </View>
          }
          renderItem={renderFrontRow}
        />
      )}

      {subTab === 'timeline' && (
        <FrontTimeline history={history} members={members} singlet={singlet} />
      )}

      {subTab === 'member' && (
        <View style={{flex: 1}}>
          {pickerMembers.length === 0 && pickerCustomFronts.length === 0 && !members.some(isFacetMember) ? (
            <View style={{alignItems: 'center', paddingVertical: 48}}>
              <Text style={{fontSize: fs(13), color: T.dim}}>{singlet ? t('profile.noStatuses') : t('history.noMembers')}</Text>
            </View>
          ) : (
            <>
              <View style={{margin: 16, marginBottom: 0}}>
                {selectedMember && (
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1,
                    backgroundColor: T.card, borderColor: `${selectedMember.color}50`, marginBottom: 8}}>
                    <Avatar member={selectedMember} size={32} />
                    <View style={{flex: 1}}>
                      <Text style={{fontSize: fs(15), fontWeight: '500', color: T.text}}>{selectedMember.name}</Text>
                      {selectedMember.pronouns ? <Text style={{fontSize: fs(11), color: T.dim}}>{selectedMember.pronouns}</Text> : null}
                    </View>
                    <TouchableOpacity hitSlop={{top: 12, bottom: 12, left: 12, right: 12}} onPress={() => {setSelectedMemberId(null); setMemberSearch('');}} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.clearItem', {name: selectedMember.name})}>
                      <Text style={{fontSize: fs(14), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✕</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <MemberPicker pools={historyPools} selected={selectedMemberId} onPick={m => setSelectedMemberId(m.id)} requireSearch
                  search={memberSearch} onSearch={setMemberSearch} maxResults={Infinity} listMaxHeight={280} rowSize={28}
                  searchLabel={singlet ? t('history.searchStatus') : t('history.searchMember')} />
              </View>

              {selectedMember && allMemberEvents.length > 0 && memberSummary && (
                <MemberSummaryCards totalMs={sessionsTotalMs(mergedSessions, effEnd)} sessions={mergedSessions.length} summary={memberSummary} />
              )}

              <FlashList
                data={allMemberEvents}
                keyExtractor={(event: MemberEvent, i: number) => `${event.type}-${event.time}-${i}`}
                getItemType={(event: MemberEvent) => event.type === 'journal' ? 'journal' : 'entry'}
                contentContainerStyle={{padding: 16, paddingTop: 8, paddingBottom: 32}}
                ListEmptyComponent={
                  <View style={{alignItems: 'center', paddingVertical: 32}}>
                    <Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center'}}>
                      {selectedMember ? t('history.noActivity', {name: selectedMember.name}) : t('history.selectMember')}
                    </Text>
                  </View>
                }
                renderItem={renderMemberEvent}
              />
            </>
          )}
        </View>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  heading: {fontFamily: Fonts.display, fontSize: 22, fontWeight: '600', fontStyle: 'italic', marginBottom: 0},
  subtab: {paddingHorizontal: 16, paddingVertical: 10, marginBottom: -1},
});
