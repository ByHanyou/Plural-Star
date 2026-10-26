import React, {useMemo, useState} from 'react';
import {View, TouchableOpacity, Alert} from 'react-native';
import {KeyboardAwareScrollView} from 'react-native-keyboard-controller';
import {useTranslation} from 'react-i18next';
import {Text, TextInput} from '../components/AppText';
import {fontScale, tierAccent} from '../theme';
import {useTheme} from '../themeContext';
import {Member, HistoryEntry, FrontState, FrontTierKey, FRONT_TIER_KEYS, TIER_I18N_KEY, TIER_SHORT_I18N_KEY, fmtTime, fmtList, allFrontMemberIds, singletStatuses, isRosterMember, isFacetMember, isCustomFrontMember, toggleId, closeOpenFrontEntry, isOpenFrontEntry} from '../utils';
import {RetroDrafts, RetroTierDraft, retroDraftsFrom, retroHasMembers, retroEntry, retroFront, mergeRetroIntoFront, historyEntryKey, findRetroOverlaps, insertHistoryEntry} from '../history/retro';
import {DateTimeEditor} from '../components/DateTimeEditor';
import {SectionDivider, sectionLabel, tileTitle} from '../components/controls';
import {EnergyRow} from '../components/FrontDetailPickers';
import {MemberPicker} from '../components/MemberPicker';
import {pickerPool} from '../picker/memberPicker';
import type {PickerPool} from '../picker/memberPicker';
import {TogglePill} from '../components/ToggleSwitch';
import {useAppStore} from '../store/appStore';
import {saveHistory, applyFrontState} from '../store/actions';
import {reportSaveError} from '../utils/saveError';

const RetroTierPicker = ({tierKey, label, color, selected, setSelected, pools, allSelected, searchKind}: {
  tierKey: FrontTierKey; label: string; color: string; selected: string[]; setSelected: (ids: string[]) => void;
  pools: PickerPool[]; allSelected: Record<FrontTierKey, string[]>;
  searchKind?: string;
}) => {
  const {t} = useTranslation();
  const hasKinds = pools.some(p => !!p.kind);
  const kindLabel = searchKind || (hasKinds ? t('terminology.fronters') : '');
  const searchLabel = kindLabel ? t('members.searchToAddKind', {kind: kindLabel}) : t('members.searchToAdd');
  return (
    <View style={{marginBottom: 16}}>
      <SectionDivider label={label} color={color} style={{marginTop: 0, marginBottom: 8}} />
      <MemberPicker pools={pools} selected={selected} onPick={(m: Member) => setSelected(toggleId(selected, m.id))} multi requireSearch selectedChips kindToggles maxResults={8} searchLabel={searchLabel}
        annotate={m => {
          const other = FRONT_TIER_KEYS.find(tk => tk !== tierKey && allSelected[tk].includes(m.id));
          return other && !selected.includes(m.id) ? {label: t(TIER_SHORT_I18N_KEY[other]), dim: true} : null;
        }} />
    </View>
  );
};

const RetroTierDetails = ({label, color, draft, patch}: {
  label: string; color: string; draft: RetroTierDraft; patch: (p: Partial<RetroTierDraft>) => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const inputStyle = {backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(14), marginBottom: 14} as const;
  const labelStyle = sectionLabel(T, {marginBottom: 6});
  const a11y = (key: string) => (label ? `${label}, ${t(key)}` : t(key));
  return (
    <View>
      {label ? (
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4}}>
          <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: color}} />
          <Text accessibilityRole="header" style={{fontSize: fs(12), fontWeight: '600', color}}>{label}</Text>
        </View>
      ) : null}
      <Text style={labelStyle}>{t('modal.mood')}</Text>
      <TextInput value={draft.mood} onChangeText={mood => patch({mood})} accessibilityLabel={a11y('modal.enterMood')} placeholder={t('modal.enterMood')} placeholderTextColor={T.muted} style={inputStyle} />

      <Text style={labelStyle}>{t('modal.location')}</Text>
      <TextInput value={draft.location} onChangeText={location => patch({location})} accessibilityLabel={a11y('modal.typeLocation')} placeholder={t('modal.typeLocation')} placeholderTextColor={T.muted} style={inputStyle} />

      <Text accessibilityRole="header" style={labelStyle}>{t('energy.level')}</Text>
      <EnergyRow value={draft.energy} onChange={energy => patch({energy})} color={color} style={{marginBottom: 14}} />

      <Text style={labelStyle}>{t('modal.note')}</Text>
      <TextInput value={draft.note} onChangeText={note => patch({note})} accessibilityLabel={a11y('modal.whatHappening')} placeholder={t('modal.whatHappening')} placeholderTextColor={T.muted} multiline numberOfLines={3}
        style={[inputStyle, {minHeight: 80, textAlignVertical: 'top'}]} />
      <View style={{height: 1, backgroundColor: T.border, marginBottom: 14}} />
    </View>
  );
};

const onSaveHistory = (h: HistoryEntry[]) => { saveHistory(h).catch(reportSaveError); };
const onSetFront = (f: FrontState | null, since?: number) => { applyFrontState(f, since).catch(reportSaveError); };

export const RetroHistoryScreen = ({onBack, editIndex, editEntry, singlet = false, selfId}: {
  onBack: () => void;
  editIndex?: number;
  editEntry?: HistoryEntry;
  singlet?: boolean;
  selfId?: string;
}) => {
  const T = useTheme();
  const members = useAppStore(s => s.members);
  const history = useAppStore(s => s.history);
  const front = useAppStore(s => s.front);
  const {t} = useTranslation();
  const fs = fontScale(T);
  const isEditing = editIndex !== undefined && editIndex >= 0 && !!editEntry;
  const replaceIndex = isEditing ? editIndex : undefined;
  const statusPool = useMemo(() => singletStatuses(members), [members]);
  const retroPools = useMemo(() => [
    pickerPool('members', members.filter(isRosterMember), t),
    pickerPool('facets', members.filter(m => isFacetMember(m) && !m.archived), t),
    pickerPool('customFronts', members.filter(m => isCustomFrontMember(m) && !m.archived), t),
  ], [t, members]);

  const editingActiveFront = !!(isEditing && editEntry && front && isOpenFrontEntry(editEntry, front.startTime));
  const [drafts, setDrafts] = useState<RetroDrafts>(() => retroDraftsFrom(editEntry, singlet ? selfId : undefined));
  const [startDate, setStartDate] = useState(editEntry ? new Date(editEntry.startTime) : new Date());
  const [endDate, setEndDate] = useState(editEntry?.endTime ? new Date(editEntry.endTime) : new Date());
  const [isCurrent, setIsCurrent] = useState(editEntry?.endTime === null);
  const patchTier = (tier: FrontTierKey) => (p: Partial<RetroTierDraft>) => setDrafts(d => ({...d, [tier]: {...d[tier], ...p}}));
  const primaryIds = singlet && selfId ? [selfId, ...drafts.primary.ids.filter(id => id !== selfId)] : drafts.primary.ids;
  const allSelected: Record<FrontTierKey, string[]> = {primary: drafts.primary.ids, coFront: drafts.coFront.ids, coConscious: drafts.coConscious.ids};
  const namesOf = (ids: string[]) => fmtList(ids.map(id => members.find(m => m.id === id)?.name || '?'));

  const handleSave = () => {
    if (!singlet && !retroHasMembers(drafts)) {
      Alert.alert(t('hub.noMembersSelected'), t('hub.selectAtLeastOne'));
      return;
    }
    if (!isCurrent && endDate.getTime() <= startDate.getTime()) {
      Alert.alert(t('hub.invalidTime'), t('hub.endBeforeStart'));
      return;
    }

    const start = startDate.getTime();
    const entry = retroEntry(drafts, primaryIds, start, isCurrent ? null : endDate.getTime());
    const finish = (next: HistoryEntry[]) => {
      onSaveHistory(next);
      onBack();
    };

    if (editingActiveFront) {
      onSetFront(isCurrent ? retroFront(drafts, primaryIds, start) : null, isCurrent ? start : undefined);
      finish(insertHistoryEntry(history, entry, {replaceIndex}));
      return;
    }

    if (isCurrent && front) {
      Alert.alert(
        t('hub.activeFrontExists'),
        t('hub.activeFrontExistsMsg', {names: namesOf(allFrontMemberIds(front))}),
        [
          {text: t('common.cancel'), style: 'cancel'},
          {text: t('hub.overwrite'), style: 'destructive', onPress: () => {
            const now = Date.now();
            const closed = closeOpenFrontEntry(history, front.startTime, now);
            onSetFront(retroFront(drafts, primaryIds, start), start);
            finish(insertHistoryEntry(closed, entry, {replaceIndex}));
          }},
          {text: t('hub.addTo'), onPress: () => {
            onSetFront(mergeRetroIntoFront(front, drafts, primaryIds), start);
            finish(insertHistoryEntry(history, entry, {replaceIndex}));
          }},
        ],
      );
      return;
    }

    const overlaps = findRetroOverlaps(history, entry.startTime, entry.endTime, replaceIndex);
    if (overlaps.length > 0) {
      const overlapNames = overlaps.slice(0, 3).map(e => `${namesOf(e.memberIds || [])} (${fmtTime(e.startTime)})`).join('\n');
      Alert.alert(
        t('hub.overlapDetected'),
        `${t('hub.overlapMsg')}\n\n${overlapNames}${overlaps.length > 3 ? `\n${t('hub.overlapMore', {count: overlaps.length - 3})}` : ''}`,
        [
          {text: t('common.cancel'), style: 'cancel'},
          {text: t('hub.keepBoth'), onPress: () => finish(insertHistoryEntry(history, entry, {replaceIndex}))},
          {text: t('hub.replace'), style: 'destructive', onPress: () => finish(insertHistoryEntry(history, entry, {replaceIndex, dropKeys: new Set(overlaps.map(historyEntryKey))}))},
        ],
      );
      return;
    }

    finish(insertHistoryEntry(history, entry, {replaceIndex}));
  };

  const pickerTiers: FrontTierKey[] = singlet ? [] : [...FRONT_TIER_KEYS];
  const detailTiers = FRONT_TIER_KEYS.filter(tier => tier === 'primary' || (!singlet && drafts[tier].ids.length > 0));

  return (
    <KeyboardAwareScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={{padding: 16, paddingBottom: 40}} keyboardShouldPersistTaps="handled" bottomOffset={24}>
      <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 16}}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={{top: 9, bottom: 9, left: 9, right: 9}} style={{padding: 4, marginRight: 12}}>
          <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(18), color: T.dim}}>←</Text>
        </TouchableOpacity>
        <Text accessibilityRole="header" style={tileTitle(T)} numberOfLines={1} maxFontSizeMultiplier={1.2}>{isEditing ? t('hub.editEntry') : t('hub.retroHistory')}</Text>
      </View>

      <DateTimeEditor date={startDate} onChange={setStartDate} label={t('hub.startTime')} />

      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6}}>
        <Text style={sectionLabel(T)}>{t('hub.endTime')}</Text>
        <TouchableOpacity onPress={() => setIsCurrent(!isCurrent)} activeOpacity={0.7}
          accessibilityRole="switch" accessibilityState={{checked: isCurrent}} accessibilityLabel={t('hub.current')}
          hitSlop={{top: 14, bottom: 15}} style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
          <Text style={{fontSize: fs(12), color: isCurrent ? T.accent : T.dim}}>{t('hub.current')}</Text>
          <TogglePill on={isCurrent} />
        </TouchableOpacity>
      </View>
      {!isCurrent && <DateTimeEditor date={endDate} onChange={setEndDate} label="" a11yLabel={t('hub.endTime')} />}
      {isCurrent && <View style={{height: 14}} />}

      <View style={{height: 1, backgroundColor: T.border, marginVertical: 10}} />

      {singlet && (
        <RetroTierPicker tierKey="primary" label={t('status.statuses')} color={T.accent} selected={drafts.primary.ids} setSelected={ids => patchTier('primary')({ids})}
          pools={[{label: t('status.statuses'), members: statusPool}]} allSelected={allSelected} searchKind={t('status.statuses')} />
      )}
      {pickerTiers.map(tier => (
        <RetroTierPicker key={tier} tierKey={tier} label={t(TIER_I18N_KEY[tier])} color={tierAccent(T, tier)} selected={drafts[tier].ids}
          setSelected={ids => patchTier(tier)({ids})} pools={retroPools} allSelected={allSelected} />
      ))}

      {detailTiers.map(tier => (
        <RetroTierDetails key={tier} label={singlet ? '' : t(TIER_I18N_KEY[tier])} color={tierAccent(T, tier)} draft={drafts[tier]} patch={patchTier(tier)} />
      ))}

      <View style={{flexDirection: 'row', gap: 10, marginTop: 6}}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
          hitSlop={{top: 6, bottom: 6}} style={{flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 8, borderWidth: 1, backgroundColor: 'transparent', borderColor: T.border}}>
          <Text style={{fontSize: fs(14), fontWeight: '500', color: T.dim}}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.save')}
          hitSlop={{top: 6, bottom: 6}} style={{flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
          <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>{t('common.save')}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAwareScrollView>
  );
};
