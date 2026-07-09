import React, {useState, useEffect} from 'react';
import {View, ScrollView, TouchableOpacity, Alert, Linking} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Fonts} from '../theme';
import {Member, HistoryEntry, FrontState, FrontTierKey, fmtTime, fmtDur, allFrontMemberIds, sortMembersBySearch, singletStatuses} from '../utils';
import {DateTimeEditor} from '../components/DateTimeEditor';
import {Avatar} from '../components/Avatar';

type HubTile = 'share' | 'retroHistory' | 'statistics' | 'chat' | 'customFields' | 'systemManager' | 'archive' | 'polls' | 'systemMap' | 'medical' | 'mailbox' | 'network' | 'whiteboard' | 'discord' | 'credits' | 'supportPS';

interface Props {
  theme: any;
  singlet?: boolean;
  selfId?: string;
  members: Member[];
  history: HistoryEntry[];
  front: FrontState | null;
  onSaveHistory: (h: HistoryEntry[]) => void;
  onSetFront: (f: FrontState | null) => void;
  renderShareScreen: () => React.ReactNode;
  renderStatsScreen: () => React.ReactNode;
  renderChatScreen: () => React.ReactNode;
  renderCustomFieldsScreen: () => React.ReactNode;
  renderSystemManagerScreen: () => React.ReactNode;
  renderArchiveScreen: () => React.ReactNode;
  renderPollsScreen: () => React.ReactNode;
  renderSystemMapScreen: () => React.ReactNode;
  systemMapRelCount?: number;
  mapFocus?: {id: string; n: number} | null;
  renderMedicalScreen: () => React.ReactNode;
  renderMailboxScreen: (onBack: () => void) => React.ReactNode;
  renderWhiteboardScreen: (onBack: () => void) => React.ReactNode;
  renderNetworkScreen: () => React.ReactNode;
  resetKey?: number;
  editHistoryIndex?: number | null;
  onClearEditHistory?: () => void;
}

const TierMemberPicker = ({tierKey, label, color, selected, setSelected, members, allSelected, T}: {
  tierKey: FrontTierKey; label: string; color: string; selected: string[]; setSelected: (ids: string[]) => void;
  members: Member[]; allSelected: Record<FrontTierKey, string[]>; T: any;
}) => {
  const {t} = useTranslation();
  const fs = (s: number) => Math.round(s * (T.textScale || 1));
  const [search, setSearch] = useState('');
  const otherTiers: Record<FrontTierKey, string> = {primary: t('tier.primaryShort'), coFront: t('tier.coFrontShort'), coConscious: t('tier.coConShort')};
  const filtered = sortMembersBySearch(members.filter(m => !search || m.name.toLowerCase().includes(search.toLowerCase())), search);
  const toggle = (id: string) => {
    setSelected(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };

  return (
    <View style={{marginBottom: 16}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8}}>
        <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: color}} />
        <Text accessibilityRole="header" style={{fontSize: fs(11), letterSpacing: 1, textTransform: 'uppercase', color, fontWeight: '700'}}>{label}</Text>
        <View style={{flex: 1, height: 1, backgroundColor: T.border}} />
      </View>
      {selected.length > 0 && (
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8}}>
          {selected.map(id => {
            const m = members.find(x => x.id === id);
            if (!m) return null;
            return (
              <TouchableOpacity key={id} onPress={() => toggle(id)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={`${t('common.remove')} ${m.name}`}
                style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: `${m.color}20`, borderWidth: 1, borderColor: `${m.color}50`}}>
                <View style={{width: 7, height: 7, borderRadius: 3.5, backgroundColor: m.color}} />
                <Text style={{fontSize: fs(12), color: m.color}}>{m.name}</Text>
                <Text style={{fontSize: fs(10), color: T.danger}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✕</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      <TextInput value={search} onChangeText={setSearch} placeholder={t('members.searchToAdd')} placeholderTextColor={T.muted}
        style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), marginBottom: 4}} />
      {search.length > 0 && (
        <View style={{backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.border, overflow: 'hidden'}}>
          {filtered.slice(0, 6).map(m => {
              const inThis = selected.includes(m.id);
              const otherTier = Object.entries(allSelected).find(([tk, ids]) => tk !== tierKey && (ids as string[]).includes(m.id));
              const otherLabel = otherTier ? otherTiers[otherTier[0] as FrontTierKey] : null;
              return (
                <TouchableOpacity key={m.id} onPress={() => {toggle(m.id); setSearch('');}} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityState={{selected: inThis}} accessibilityLabel={[m.name, m.pronouns, otherLabel && !inThis ? otherLabel : null].filter(Boolean).join(', ')}
                  style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: 1, borderBottomColor: T.border, opacity: otherLabel && !inThis ? 0.45 : 1}}>
                  <Avatar member={m} size={24} T={T} />
                  <Text style={{fontSize: fs(13), color: inThis ? m.color : T.text, fontWeight: inThis ? '600' : '400'}}>{m.name}</Text>
                  {m.pronouns ? <Text style={{fontSize: fs(11), color: T.muted}}>{m.pronouns}</Text> : null}
                  {otherLabel && !inThis ? <Text style={{fontSize: fs(10), color: T.muted, fontStyle: 'italic'}}>{otherLabel}</Text> : null}
                  {inThis && <Text style={{color: m.color, marginLeft: 'auto'}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</Text>}
                </TouchableOpacity>
              );
            })}
          {filtered.length > 6 && (
            <View style={{padding: 8, alignItems: 'center'}}>
              <Text style={{fontSize: fs(11), color: T.muted, fontStyle: 'italic'}}>{t('members.refineSearch', {count: filtered.length - 6})}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const RetroHistoryScreen = ({T, members, history, front, onSaveHistory, onSetFront, onBack, editIndex, editEntry, singlet = false, selfId}: {
  T: any; members: Member[]; history: HistoryEntry[]; front: FrontState | null;
  onSaveHistory: (h: HistoryEntry[]) => void; onSetFront: (f: FrontState | null) => void; onBack: () => void;
  editIndex?: number;
  editEntry?: HistoryEntry;
  singlet?: boolean;
  selfId?: string;
}) => {
  const {t} = useTranslation();
  const fs = (s: number) => Math.round(s * (T.textScale || 1));
  const isEditing = editIndex !== undefined && editIndex >= 0 && !!editEntry;
  const regularMembers = members.filter(m => !m.isCustomFront);
  const customFronts = members.filter(m => m.isCustomFront && !m.archived);
  const statusPool = singletStatuses(members);

  const editingActiveFront = !!(
    isEditing && editEntry && front
    && editEntry.endTime === null
    && editEntry.startTime === front.startTime
    && (!editEntry.changeType || editEntry.changeType === 'front')
  );

  const [primaryIds, setPrimaryIds] = useState<string[]>(
    singlet && selfId ? (editEntry?.memberIds || []).filter(id => id !== selfId) : (editEntry?.memberIds || [])
  );
  const [coFrontIds, setCoFrontIds] = useState<string[]>(editEntry?.coFrontIds || []);
  const [coConIds, setCoConIds] = useState<string[]>(editEntry?.coConsciousIds || []);
  const [mood, setMood] = useState(editEntry?.mood || '');
  const [note, setNote] = useState(editEntry?.note || '');
  const [location, setLocation] = useState(editEntry?.location || '');
  const [energy, setEnergy] = useState<number | undefined>(editEntry?.energyLevel);
  const effectivePrimary = (): string[] =>
    singlet && selfId ? [selfId, ...primaryIds.filter(id => id !== selfId)] : primaryIds;
  const [startDate, setStartDate] = useState(editEntry ? new Date(editEntry.startTime) : new Date());
  const [endDate, setEndDate] = useState(editEntry?.endTime ? new Date(editEntry.endTime) : new Date());
  const [isCurrent, setIsCurrent] = useState(editEntry?.endTime === null);

  const allSelected: Record<FrontTierKey, string[]> = {primary: primaryIds, coFront: coFrontIds, coConscious: coConIds};

  const findOverlaps = (start: number, end: number | null): HistoryEntry[] => {
    const effectiveEnd = end ?? Date.now();
    return history.filter((e, i) => {
      if (!e.startTime) return false;
      if (isEditing && i === editIndex) return false;
      const eEnd = e.endTime ?? Date.now();
      return e.startTime < effectiveEnd && start < eEnd;
    });
  };

  const buildEntry = (): HistoryEntry => ({
    memberIds: effectivePrimary(),
    startTime: startDate.getTime(),
    endTime: isCurrent ? null : endDate.getTime(),
    note: note,
    mood: mood || undefined,
    location: location || undefined,
    energyLevel: energy,
    coFrontIds: coFrontIds.length > 0 ? coFrontIds : undefined,
    coFrontMood: undefined,
    coFrontNote: undefined,
    coConsciousIds: coConIds.length > 0 ? coConIds : undefined,
    coConsciousMood: undefined,
    coConsciousNote: undefined,
    changeType: 'front',
  });

  const replaceEntries = (deleteOverlapKeys?: Set<string>): HistoryEntry[] => {
    const newEntry = buildEntry();
    let base = history;
    if (deleteOverlapKeys) {
      base = base.filter(e => !deleteOverlapKeys.has(`${e.startTime}-${(e.memberIds || []).join(',')}`));
    }
    if (isEditing) {
      const updated = base.filter((_, i) => !(history === base && i === editIndex)).concat();
      if (deleteOverlapKeys) {
        const editKey = `${editEntry!.startTime}-${(editEntry!.memberIds || []).join(',')}`;
        const stripped = base.filter(e => `${e.startTime}-${(e.memberIds || []).join(',')}` !== editKey);
        return [newEntry, ...stripped].sort((a, b) => b.startTime - a.startTime);
      }
      return [newEntry, ...updated].sort((a, b) => b.startTime - a.startTime);
    }
    return [newEntry, ...base].sort((a, b) => b.startTime - a.startTime);
  };

  const handleSave = () => {
    if (!singlet && primaryIds.length === 0 && coFrontIds.length === 0 && coConIds.length === 0) {
      Alert.alert(t('hub.noMembersSelected'), t('hub.selectAtLeastOne'));
      return;
    }
    if (!isCurrent && endDate.getTime() <= startDate.getTime()) {
      Alert.alert(t('hub.invalidTime'), t('hub.endBeforeStart'));
      return;
    }

    const newEntry = buildEntry();
    const overlaps = findOverlaps(newEntry.startTime, newEntry.endTime);

    if (editingActiveFront) {
      if (isCurrent) {
        const newFront: FrontState = {
          primary: {memberIds: effectivePrimary(), mood: mood || undefined, note, location: location || undefined, energyLevel: energy},
          coFront: {memberIds: coFrontIds, note: front?.coFront.note || ''},
          coConscious: {memberIds: coConIds, note: front?.coConscious.note || ''},
          startTime: startDate.getTime(),
        };
        onSetFront(newFront);
      } else {
        onSetFront(null);
      }
      onSaveHistory(replaceEntries());
      onBack();
      return;
    }

    if (isCurrent && front && !editingActiveFront) {
      Alert.alert(
        t('hub.activeFrontExists'),
        t('hub.activeFrontExistsMsg', {names: allFrontMemberIds(front).map(id => members.find(m => m.id === id)?.name || '?').join(', ')}),
        [
          {text: t('common.cancel'), style: 'cancel'},
          {text: t('hub.overwrite'), style: 'destructive', onPress: () => {
            const now = Date.now();
            const closed = history.map(e =>
              e.endTime === null && e.startTime === front.startTime && (!e.changeType || e.changeType === 'front')
                ? {...e, endTime: now} : e
            );
            const newFront: FrontState = {
              primary: {memberIds: effectivePrimary(), mood: mood || undefined, note, location: location || undefined, energyLevel: energy},
              coFront: {memberIds: coFrontIds, note: ''},
              coConscious: {memberIds: coConIds, note: ''},
              startTime: startDate.getTime(),
            };
            onSetFront(newFront);
            if (isEditing) {
              const updated = closed.map((e, i) => i === editIndex ? newEntry : e);
              onSaveHistory(updated.sort((a, b) => b.startTime - a.startTime));
            } else {
              onSaveHistory([newEntry, ...closed]);
            }
            onBack();
          }},
          {text: t('hub.addTo'), onPress: () => {
            const newFront: FrontState = {
              primary: {memberIds: [...(front?.primary.memberIds || []), ...effectivePrimary().filter(id => !front?.primary.memberIds.includes(id))], mood: mood || front?.primary.mood, note: note || front?.primary.note || '', location: location || front?.primary.location},
              coFront: {memberIds: [...(front?.coFront.memberIds || []), ...coFrontIds.filter(id => !front?.coFront.memberIds.includes(id))], note: front?.coFront.note || ''},
              coConscious: {memberIds: [...(front?.coConscious.memberIds || []), ...coConIds.filter(id => !front?.coConscious.memberIds.includes(id))], note: front?.coConscious.note || ''},
              startTime: front?.startTime || startDate.getTime(),
            };
            onSetFront(newFront);
            onSaveHistory(replaceEntries());
            onBack();
          }},
        ]
      );
      return;
    }

    if (overlaps.length > 0) {
      const overlapNames = overlaps.slice(0, 3).map(e => {
        const names = (e.memberIds || []).map(id => members.find(m => m.id === id)?.name || '?').join(', ');
        return `${names} (${fmtTime(e.startTime)})`;
      }).join('\n');
      Alert.alert(
        t('hub.overlapDetected'),
        `${t('hub.overlapMsg')}\n\n${overlapNames}${overlaps.length > 3 ? `\n${t('hub.overlapMore', {count: overlaps.length - 3})}` : ''}`,
        [
          {text: t('common.cancel'), style: 'cancel'},
          {text: t('hub.keepBoth'), onPress: () => {
            onSaveHistory(replaceEntries());
            onBack();
          }},
          {text: t('hub.replace'), style: 'destructive', onPress: () => {
            const overlapSet = new Set(overlaps.map(e => `${e.startTime}-${e.memberIds.join(',')}`));
            onSaveHistory(replaceEntries(overlapSet));
            onBack();
          }},
        ]
      );
      return;
    }

    onSaveHistory(replaceEntries());
    onBack();
  };

  return (
    <ScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={{padding: 16, paddingBottom: 40}} keyboardShouldPersistTaps="handled">
      <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 16}}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{padding: 4, marginRight: 12}}>
          <Text style={{fontSize: fs(18), color: T.dim}}>←</Text>
        </TouchableOpacity>
        <Text accessibilityRole="header" style={{fontFamily: Fonts.display, fontSize: fs(22), fontWeight: '600', fontStyle: 'italic', color: T.text, flex: 1, marginRight: 8}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{isEditing ? t('hub.editEntry') : t('hub.retroHistory')}</Text>
      </View>

      <DateTimeEditor date={startDate} onChange={setStartDate} label={t('hub.startTime')} T={T} />

      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6}}>
        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600'}}>{t('hub.endTime')}</Text>
        <TouchableOpacity onPress={() => setIsCurrent(!isCurrent)} activeOpacity={0.7}
          accessibilityRole="switch" accessibilityState={{checked: isCurrent}} accessibilityLabel={t('hub.current')}
          style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
          <Text style={{fontSize: fs(12), color: isCurrent ? T.accent : T.dim}}>{t('hub.current')}</Text>
          <View style={{width: 40, height: 22, borderRadius: 11, backgroundColor: isCurrent ? T.accent : T.toggleOff, justifyContent: 'center'}}>
            <View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', position: 'absolute', left: isCurrent ? 20 : 3}} />
          </View>
        </TouchableOpacity>
      </View>
      {!isCurrent && <DateTimeEditor date={endDate} onChange={setEndDate} label="" T={T} />}
      {isCurrent && <View style={{height: 14}} />}

      <View style={{height: 1, backgroundColor: T.border, marginVertical: 10}} />

      {singlet ? (
        <TierMemberPicker tierKey="primary" label={t('status.statuses')} color={T.accent} selected={primaryIds} setSelected={setPrimaryIds} members={statusPool} allSelected={allSelected} T={T} />
      ) : (
        <>
          <TierMemberPicker tierKey="primary" label={t('tier.primaryFront')} color={T.accent} selected={primaryIds} setSelected={setPrimaryIds} members={regularMembers} allSelected={allSelected} T={T} />
          {customFronts.length > 0 && (
            <TierMemberPicker tierKey="primary" label={t('members.customFronts')} color={T.accent} selected={primaryIds} setSelected={setPrimaryIds} members={customFronts} allSelected={allSelected} T={T} />
          )}
          <TierMemberPicker tierKey="coFront" label={t('tier.coFront')} color={T.info} selected={coFrontIds} setSelected={setCoFrontIds} members={regularMembers} allSelected={allSelected} T={T} />
          {customFronts.length > 0 && (
            <TierMemberPicker tierKey="coFront" label={t('members.customFronts')} color={T.info} selected={coFrontIds} setSelected={setCoFrontIds} members={customFronts} allSelected={allSelected} T={T} />
          )}
          <TierMemberPicker tierKey="coConscious" label={t('tier.coConscious')} color={T.success} selected={coConIds} setSelected={setCoConIds} members={regularMembers} allSelected={allSelected} T={T} />
        </>
      )}

      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('modal.mood')}</Text>
      <TextInput value={mood} onChangeText={setMood} placeholder={t('modal.enterMood')} placeholderTextColor={T.muted}
        style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(14), marginBottom: 14}} />

      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('modal.location')}</Text>
      <TextInput value={location} onChangeText={setLocation} placeholder={t('modal.typeLocation')} placeholderTextColor={T.muted}
        style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(14), marginBottom: 14}} />

      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('energy.level')}</Text>
      <View style={{flexDirection: 'row', gap: 3, marginBottom: 14, alignItems: 'center'}}>
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <TouchableOpacity key={n} onPress={() => setEnergy(energy === n ? undefined : n)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityState={{selected: energy === n}} accessibilityLabel={`${t('energy.level')} ${n}`}
            style={{flex: 1, paddingVertical: 6, borderRadius: 6, borderWidth: 1, alignItems: 'center',
              backgroundColor: energy === n ? `${T.accent}30` : T.surface,
              borderColor: energy !== undefined && n <= energy ? T.accent : T.border}}>
            <Text style={{fontSize: fs(10), color: energy !== undefined && n <= energy ? T.accent : T.dim, fontWeight: '600'}}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('modal.note')}</Text>
      <TextInput value={note} onChangeText={setNote} placeholder={t('modal.whatHappening')} placeholderTextColor={T.muted} multiline numberOfLines={3}
        style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(14), minHeight: 80, textAlignVertical: 'top', marginBottom: 20}} />

      <View style={{flexDirection: 'row', gap: 10}}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
          style={{flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 8, borderWidth: 1, backgroundColor: 'transparent', borderColor: T.border}}>
          <Text style={{fontSize: fs(14), fontWeight: '500', color: T.dim}}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.save')}
          style={{flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
          <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>{t('common.save')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const DISCORD_URL = 'https://discord.gg/FFQw33cu8m';
const BMC_URL = 'https://www.buymeacoffee.com/PluralStar';

export const HubScreen = ({theme: T, singlet = false, selfId, members, history, front, onSaveHistory, onSetFront, renderShareScreen, renderStatsScreen, renderChatScreen, renderCustomFieldsScreen, renderSystemManagerScreen, renderArchiveScreen, renderPollsScreen, renderSystemMapScreen, systemMapRelCount = 0, mapFocus, renderMedicalScreen, renderMailboxScreen, renderWhiteboardScreen, renderNetworkScreen, resetKey, editHistoryIndex, onClearEditHistory}: Props) => {
  const {t} = useTranslation();
  const fs = (s: number) => Math.round(s * (T.textScale || 1));
  const [activeTile, setActiveTile] = useState<HubTile | null>(null);

  useEffect(() => { setActiveTile(null); }, [resetKey]);

  useEffect(() => {
    if (editHistoryIndex !== null && editHistoryIndex !== undefined) {
      setActiveTile('retroHistory');
    }
  }, [editHistoryIndex]);

  useEffect(() => {
    if (mapFocus) setActiveTile('systemMap');
  }, [mapFocus]);

  const handleRetroBack = () => {
    setActiveTile(null);
    if (editHistoryIndex !== null && editHistoryIndex !== undefined) {
      onClearEditHistory?.();
    }
  };

  const editingEntry = (editHistoryIndex !== null && editHistoryIndex !== undefined)
    ? history[editHistoryIndex]
    : undefined;

  if (activeTile === 'share') {
    return (
      <View style={{flex: 1, backgroundColor: T.bg}}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8}}>
          <TouchableOpacity onPress={() => setActiveTile(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{padding: 4, marginRight: 12}}>
            <Text style={{fontSize: fs(18), color: T.dim}}>←</Text>
          </TouchableOpacity>
          <Text accessibilityRole="header" style={{fontFamily: Fonts.display, fontSize: fs(22), fontWeight: '600', fontStyle: 'italic', color: T.text, flex: 1, marginRight: 8}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('hub.importExport')}</Text>
        </View>
        {renderShareScreen()}
      </View>
    );
  }

  if (activeTile === 'retroHistory') {
    return <RetroHistoryScreen
      T={T} members={members} history={history} front={front}
      singlet={singlet} selfId={selfId}
      onSaveHistory={onSaveHistory} onSetFront={onSetFront}
      onBack={handleRetroBack}
      editIndex={editingEntry ? editHistoryIndex! : undefined}
      editEntry={editingEntry}
    />;
  }

  if (activeTile === 'statistics') {
    return (
      <View style={{flex: 1, backgroundColor: T.bg}}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8}}>
          <TouchableOpacity onPress={() => setActiveTile(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{padding: 4, marginRight: 12}}>
            <Text style={{fontSize: fs(18), color: T.dim}}>←</Text>
          </TouchableOpacity>
          <Text accessibilityRole="header" style={{fontFamily: Fonts.display, fontSize: fs(22), fontWeight: '600', fontStyle: 'italic', color: T.text, flex: 1, marginRight: 8}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('hub.statistics')}</Text>
        </View>
        {renderStatsScreen()}
      </View>
    );
  }

  if (activeTile === 'chat') {
    return (
      <View style={{flex: 1, backgroundColor: T.bg}}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8}}>
          <TouchableOpacity onPress={() => setActiveTile(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{padding: 4, marginRight: 12}}>
            <Text style={{fontSize: fs(18), color: T.dim}}>←</Text>
          </TouchableOpacity>
          <Text accessibilityRole="header" style={{fontFamily: Fonts.display, fontSize: fs(22), fontWeight: '600', fontStyle: 'italic', color: T.text, flex: 1, marginRight: 8}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('hub.systemChat')}</Text>
        </View>
        {renderChatScreen()}
      </View>
    );
  }

  if (activeTile === 'customFields') {
    return (
      <View style={{flex: 1, backgroundColor: T.bg}}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8}}>
          <TouchableOpacity onPress={() => setActiveTile(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{padding: 4, marginRight: 12}}>
            <Text style={{fontSize: fs(18), color: T.dim}}>←</Text>
          </TouchableOpacity>
          <Text accessibilityRole="header" style={{fontFamily: Fonts.display, fontSize: fs(22), fontWeight: '600', fontStyle: 'italic', color: T.text, flex: 1, marginRight: 8}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('customFields.title')}</Text>
        </View>
        {renderCustomFieldsScreen()}
      </View>
    );
  }

  if (activeTile === 'systemManager') {
    return (
      <View style={{flex: 1, backgroundColor: T.bg}}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8}}>
          <TouchableOpacity onPress={() => setActiveTile(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{padding: 4, marginRight: 12}}>
            <Text style={{fontSize: fs(18), color: T.dim}}>←</Text>
          </TouchableOpacity>
          <Text accessibilityRole="header" style={{fontFamily: Fonts.display, fontSize: fs(22), fontWeight: '600', fontStyle: 'italic', color: T.text, flex: 1, marginRight: 8}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('systemManager.title')}</Text>
        </View>
        {renderSystemManagerScreen()}
      </View>
    );
  }

  if (activeTile === 'archive') {
    return (
      <View style={{flex: 1, backgroundColor: T.bg}}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8}}>
          <TouchableOpacity onPress={() => setActiveTile(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{padding: 4, marginRight: 12}}>
            <Text style={{fontSize: fs(18), color: T.dim}}>←</Text>
          </TouchableOpacity>
          <Text accessibilityRole="header" style={{fontFamily: Fonts.display, fontSize: fs(22), fontWeight: '600', fontStyle: 'italic', color: T.text, flex: 1, marginRight: 8}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('hub.archive')}</Text>
        </View>
        {renderArchiveScreen()}
      </View>
    );
  }

  if (activeTile === 'polls') {
    return (
      <View style={{flex: 1, backgroundColor: T.bg}}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8}}>
          <TouchableOpacity onPress={() => setActiveTile(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{padding: 4, marginRight: 12}}>
            <Text style={{fontSize: fs(18), color: T.dim}}>←</Text>
          </TouchableOpacity>
          <Text accessibilityRole="header" style={{fontFamily: Fonts.display, fontSize: fs(22), fontWeight: '600', fontStyle: 'italic', color: T.text, flex: 1, marginRight: 8}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('polls.title')}</Text>
        </View>
        {renderPollsScreen()}
      </View>
    );
  }

  if (activeTile === 'systemMap') {
    return (
      <View style={{flex: 1, backgroundColor: T.bg}}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8}}>
          <TouchableOpacity onPress={() => setActiveTile(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{padding: 4, marginRight: 12}}>
            <Text style={{fontSize: fs(18), color: T.dim}}>←</Text>
          </TouchableOpacity>
          <Text accessibilityRole="header" style={{fontFamily: Fonts.display, fontSize: fs(22), fontWeight: '600', fontStyle: 'italic', color: T.text, flex: 1, marginRight: 8}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('systemMap.title')}</Text>
          <Text style={{fontSize: fs(11), color: T.dim}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{systemMapRelCount === 1 ? t('systemMap.relationshipOne') : t('systemMap.relationships', {count: systemMapRelCount})}</Text>
        </View>
        {renderSystemMapScreen()}
      </View>
    );
  }

  if (activeTile === 'medical') {
    return (
      <View style={{flex: 1, backgroundColor: T.bg}}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8}}>
          <TouchableOpacity onPress={() => setActiveTile(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{padding: 4, marginRight: 12}}>
            <Text style={{fontSize: fs(18), color: T.dim}}>←</Text>
          </TouchableOpacity>
          <Text accessibilityRole="header" style={{fontFamily: Fonts.display, fontSize: fs(22), fontWeight: '600', fontStyle: 'italic', color: T.text, flex: 1, marginRight: 8}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('medical.title')}</Text>
        </View>
        {renderMedicalScreen()}
      </View>
    );
  }

  if (activeTile === 'mailbox') {
    return (
      <View style={{flex: 1, backgroundColor: T.bg}}>
        {renderMailboxScreen(() => setActiveTile(null))}
      </View>
    );
  }

  if (activeTile === 'whiteboard') {
    return (
      <View style={{flex: 1, backgroundColor: T.bg}}>
        {renderWhiteboardScreen(() => setActiveTile(null))}
      </View>
    );
  }

  if (activeTile === 'network') {
    return (
      <View style={{flex: 1, backgroundColor: T.bg}}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8}}>
          <TouchableOpacity onPress={() => setActiveTile(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{padding: 4, marginRight: 12}}>
            <Text style={{fontSize: fs(18), color: T.dim}}>←</Text>
          </TouchableOpacity>
          <Text accessibilityRole="header" style={{fontFamily: Fonts.display, fontSize: fs(22), fontWeight: '600', fontStyle: 'italic', color: T.text, flex: 1, marginRight: 8}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('network.title')}</Text>
        </View>
        {renderNetworkScreen()}
      </View>
    );
  }

  if (activeTile === 'credits') {
    const credits: {name: string; role: string; url: string}[] = [
      {name: 'The Loud House System', role: t('hub.creditLogo'), url: 'https://x.com/theloudhousesys?s=21'},
      {name: 'sparklecatdev', role: t('hub.creditIos'), url: 'https://github.com/sparklecatdev'},
    ];
    return (
      <View style={{flex: 1, backgroundColor: T.bg}}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8}}>
          <TouchableOpacity onPress={() => setActiveTile(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{padding: 4, marginRight: 12}}>
            <Text style={{fontSize: fs(18), color: T.dim}}>←</Text>
          </TouchableOpacity>
          <Text accessibilityRole="header" style={{fontFamily: Fonts.display, fontSize: fs(22), fontWeight: '600', fontStyle: 'italic', color: T.text, flex: 1, marginRight: 8}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('hub.credits')}</Text>
        </View>
        <ScrollView style={{flex: 1}} contentContainerStyle={{padding: 16, paddingBottom: 32}}>
          {credits.map((c, i) => (
            <TouchableOpacity key={i} onPress={() => Linking.openURL(c.url)} activeOpacity={0.7} accessibilityRole="link"
              style={{flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, backgroundColor: T.card, borderColor: T.border, padding: 14, marginBottom: 10}}>
              <Text style={{fontSize: fs(22), color: T.accent, marginRight: 14}}>✦</Text>
              <View style={{flex: 1}}>
                <Text style={{fontSize: fs(13), fontWeight: '600', color: T.text}} numberOfLines={1}>{c.name}</Text>
                <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}} numberOfLines={1}>{c.role}</Text>
              </View>
              <Text style={{fontSize: fs(14), color: T.dim, marginLeft: 8}}>↗</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  const tiles: {id: HubTile; icon: string; label: string; external?: boolean}[] = [
    {id: 'retroHistory', icon: '◷', label: t('hub.retroHistory')},
    {id: 'medical', icon: '⚕', label: t('medical.title')},
    {id: 'statistics', icon: '⊞', label: t('hub.statistics')},
    {id: 'chat', icon: '⌨', label: t('hub.systemChat')},
    {id: 'mailbox', icon: '✉', label: t('mailbox.title')},
    {id: 'whiteboard', icon: '🖌', label: t('whiteboard.title')},
    {id: 'network', icon: '🛰', label: t('network.title')},
    {id: 'polls', icon: '📊', label: t('polls.title')},
    {id: 'systemMap', icon: '🕸', label: t('systemMap.title')},
    {id: 'customFields', icon: '☰', label: t('customFields.title')},
    {id: 'systemManager', icon: '🗂', label: t('systemManager.title')},
    {id: 'archive', icon: '🗃', label: t('hub.archive')},
    {id: 'share', icon: '⇅', label: t('hub.importExport')},
    {id: 'credits', icon: '✦', label: t('hub.credits')},
    {id: 'discord', icon: '💬', label: t('hub.discord'), external: true},
    {id: 'supportPS', icon: '☕', label: t('hub.supportPS'), external: true},
  ].filter(tile => !singlet || (tile.id !== 'chat' && tile.id !== 'systemManager' && tile.id !== 'customFields' && tile.id !== 'polls' && tile.id !== 'archive' && tile.id !== 'systemMap' && tile.id !== 'mailbox')) as {id: HubTile; icon: string; label: string; external?: boolean}[];

  const handleTilePress = (tile: typeof tiles[0]) => {
    if (tile.external && tile.id === 'discord') {
      Linking.openURL(DISCORD_URL);
    } else if (tile.external && tile.id === 'supportPS') {
      Linking.openURL(BMC_URL);
    } else {
      setActiveTile(tile.id);
    }
  };

  return (
    <ScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={{padding: 16, paddingBottom: 32}}>
      <Text
        accessibilityRole="header"
        style={{fontFamily: Fonts.display, fontSize: fs(22), fontWeight: '600', fontStyle: 'italic', color: T.text, marginBottom: 20}}
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}>
        {t('hub.title')}
      </Text>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'flex-start'}}>
        {tiles.map(tile => (
          <TouchableOpacity key={tile.id} onPress={() => handleTilePress(tile)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={tile.label}
            style={{width: '31%', minHeight: 104, borderRadius: 14, borderWidth: 1, backgroundColor: T.card, borderColor: T.border, alignItems: 'center', justifyContent: 'center', padding: 10, gap: 6}}>
            <Text style={{fontSize: fs(26), lineHeight: fs(32), color: T.accent, textAlign: 'center', includeFontPadding: false}}>{tile.icon}</Text>
            <Text style={{fontSize: fs(11), lineHeight: fs(15), fontWeight: '600', color: T.text, textAlign: 'center', includeFontPadding: false}} numberOfLines={2}>{tile.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
};
