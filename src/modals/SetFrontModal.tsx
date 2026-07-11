import React, {useState, useMemo} from 'react';
import {View, TouchableOpacity, ScrollView, Keyboard, Alert} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Sheet} from '../components/Sheet';
import {Member, MemberGroup, FrontState, FrontTierKey, DEFAULT_MOODS, EMPTY_TIER, parseMoodList, serializeMoodList, sortMembersBySearch} from '../utils';
import {fontScale} from '../theme';
import type {ThemeColors} from '../theme';
import type {TFunction} from 'i18next';
import {Btn, Field, SectionDivider, MoodPicker, EnergyRow} from './shared';

const TierMemberPicker = ({tierKey, selected, setSelected, members, groups, allAssigned, T, t}: {
  tierKey: FrontTierKey; selected: Set<string>; setSelected: (s: Set<string>) => void;
  members: Member[]; groups: MemberGroup[]; allAssigned: Record<string, FrontTierKey>; T: ThemeColors; t: TFunction;
}) => {
  const fs = fontScale(T);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const allTags = useMemo(() => [...new Set(members.flatMap(m => m.tags || []))].sort(), [members]);

  const filtered = useMemo(() => {
    const matches = members.filter(m => {
      if (selected.has(m.id)) return false;
      const nameMatch = !search || m.name.toLowerCase().includes(search.toLowerCase());
      const tagMatch = !filterTag || (m.tags || []).includes(filterTag);
      return nameMatch && tagMatch;
    });
    return sortMembersBySearch(matches, search);
  }, [members, search, filterTag, selected]);

  const toggle = (id: string) => {
    Keyboard.dismiss();
    const next = new Set(selected);
    if (next.has(id)) { next.delete(id); } else { next.add(id); setSearch(''); }
    setSelected(next);
  };

  const selectedMembers = members.filter(m => selected.has(m.id));

  return (
    <View style={{marginBottom: 10}}>
      {selectedMembers.length > 0 && (
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8}}>
          {selectedMembers.map(m => (
            <TouchableOpacity key={m.id} onPress={() => toggle(m.id)} activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel={`${m.name}, ${t('common.remove')}`}
              style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: `${m.color}20`, borderWidth: 1, borderColor: `${m.color}50`}}>
              <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: m.color}} />
              <Text style={{fontSize: fs(12), fontWeight: '500', color: m.color}}>{m.name}</Text>
              <Text style={{fontSize: fs(10), color: m.color, marginLeft: 2}}>✕</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {allTags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 6}}>
          <View style={{flexDirection: 'row', gap: 5}}>
            {allTags.map(tag => (
              <TouchableOpacity key={tag} onPress={() => setFilterTag(filterTag === tag ? null : tag)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityState={{selected: filterTag === tag}} accessibilityLabel={tag}
                style={{paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
                  backgroundColor: filterTag === tag ? `${T.info}18` : T.surface, borderColor: filterTag === tag ? `${T.info}50` : T.border}}>
                <Text style={{fontSize: fs(10), color: filterTag === tag ? T.info : T.dim}}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      <TextInput value={search} onChangeText={setSearch} placeholder={t('members.searchToAdd')} placeholderTextColor={T.muted}
        autoCorrect={false} autoComplete="off" spellCheck={false} textContentType="none"
        style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), marginBottom: 6}} />

      {(search || filterTag) && filtered.length > 0 && (
        <View style={{maxHeight: 180, borderRadius: 8, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, overflow: 'hidden'}}>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {filtered.slice(0, 20).map(m => {
              const assignedTo = allAssigned[m.id];
              const otherTier = assignedTo && assignedTo !== tierKey;
              const otherLabel = otherTier ? (assignedTo === 'primary' ? t('tier.primaryShort') : assignedTo === 'coFront' ? t('tier.coFrontShort') : t('tier.coConShort')) : '';
              return (
                <TouchableOpacity key={m.id} onPress={() => toggle(m.id)} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityLabel={m.name}
                  style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border, opacity: otherTier ? 0.45 : 1}}>
                  <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: m.color}} />
                  <Text style={{flex: 1, minWidth: 0, fontSize: fs(13), color: T.text}} numberOfLines={1}>{m.name}</Text>
                  {m.pronouns ? <Text style={{flexShrink: 1, maxWidth: '45%', fontSize: fs(11), color: T.muted}} numberOfLines={1}>{m.pronouns}</Text> : null}
                  {otherTier && otherLabel ? <Text style={{flexShrink: 0, fontSize: fs(10), color: T.muted, fontStyle: 'italic'}}>{otherLabel}</Text> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {!search && !filterTag && members.length > 0 && selectedMembers.length === 0 && (
        <Text style={{fontSize: fs(11), color: T.muted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 6}}>{t('members.searchHint')}</Text>
      )}
    </View>
  );
};

export const SetFrontModal = ({visible, theme: T, members, groups, current, settings, lastKnownLocation, onSave, onClose}: any) => {
  const fs = fontScale(T);
  const {t} = useTranslation();
  const [primaryIds, setPrimaryIds] = useState<Set<string>>(new Set());
  const [coFrontIds, setCoFrontIds] = useState<Set<string>>(new Set());
  const [coConsciousIds, setCoConsciousIds] = useState<Set<string>>(new Set());
  const [primaryMood, setPrimaryMood] = useState(''); const [primaryCustomMood, setPrimaryCustomMood] = useState(''); const [primaryShowCustom, setPrimaryShowCustom] = useState(false);
  const [primaryLocation, setPrimaryLocation] = useState(''); const [primaryNote, setPrimaryNote] = useState('');
  const [coFrontMood, setCoFrontMood] = useState(''); const [coFrontCustomMood, setCoFrontCustomMood] = useState(''); const [coFrontShowCustom, setCoFrontShowCustom] = useState(false); const [coFrontNote, setCoFrontNote] = useState('');
  const [coConsciousMood, setCoConsciousMood] = useState(''); const [coConsciousCustomMood, setCoConsciousCustomMood] = useState(''); const [coConsciousShowCustom, setCoConsciousShowCustom] = useState(false); const [coConsciousNote, setCoConsciousNote] = useState('');
  const [primaryEnergy, setPrimaryEnergy] = useState<number | undefined>(undefined);
  const [coFrontEnergy, setCoFrontEnergy] = useState<number | undefined>(undefined);
  const [coConsciousEnergy, setCoConsciousEnergy] = useState<number | undefined>(undefined);

  React.useEffect(() => {
    if (visible) {
      const c: FrontState | null = current;
      setPrimaryIds(new Set(c?.primary?.memberIds || [])); setCoFrontIds(new Set(c?.coFront?.memberIds || [])); setCoConsciousIds(new Set(c?.coConscious?.memberIds || []));
      setPrimaryMood(c?.primary?.mood || ''); setPrimaryCustomMood(''); setPrimaryShowCustom(false); setPrimaryLocation(c?.primary?.location || (settings?.gpsEnabled ? lastKnownLocation : '') || ''); setPrimaryNote(c?.primary?.note || '');
      setCoFrontMood(c?.coFront?.mood || ''); setCoFrontCustomMood(''); setCoFrontShowCustom(false); setCoFrontNote(c?.coFront?.note || '');
      setCoConsciousMood(c?.coConscious?.mood || ''); setCoConsciousCustomMood(''); setCoConsciousShowCustom(false); setCoConsciousNote(c?.coConscious?.note || '');
      setPrimaryEnergy(c?.primary?.energyLevel); setCoFrontEnergy(c?.coFront?.energyLevel); setCoConsciousEnergy(c?.coConscious?.energyLevel);
    }
  }, [visible, current, lastKnownLocation]);

  const allMoods = [...DEFAULT_MOODS, ...(settings?.customMoods || [])];
  const allLocations = settings?.locations || [];
  const regularMembers = useMemo(() => members.filter((m: Member) => !m.isCustomFront), [members]);
  const customFronts = useMemo(() => members.filter((m: Member) => m.isCustomFront), [members]);

  const allAssigned = useMemo(() => {
    const map: Record<string, FrontTierKey> = {};
    primaryIds.forEach(id => { map[id] = 'primary'; });
    coFrontIds.forEach(id => { map[id] = 'coFront'; });
    coConsciousIds.forEach(id => { map[id] = 'coConscious'; });
    return map;
  }, [primaryIds, coFrontIds, coConsciousIds]);

  const makeExclusiveSetter = (tier: FrontTierKey, setter: (s: Set<string>) => void) => (newSet: Set<string>) => {
    const setters: Record<FrontTierKey, (s: Set<string>) => void> = {primary: setPrimaryIds, coFront: setCoFrontIds, coConscious: setCoConsciousIds};
    const sets: Record<FrontTierKey, Set<string>> = {primary: primaryIds, coFront: coFrontIds, coConscious: coConsciousIds};
    const added = [...newSet].filter(id => !sets[tier].has(id));
    for (const [key, otherSetter] of Object.entries(setters)) {
      if (key !== tier) {
        const otherSet = sets[key as FrontTierKey];
        const cleaned = new Set(otherSet);
        let changed = false;
        added.forEach(id => { if (cleaned.has(id)) { cleaned.delete(id); changed = true; } });
        if (changed) otherSetter(cleaned);
      }
    }
    setter(newSet);
  };

  const resolveMood = (mood: string, customMood: string, showCustom: boolean) => {
    const moods = parseMoodList(mood);
    if (showCustom && customMood.trim()) moods.push(customMood.trim());
    const joined = serializeMoodList(moods);
    return joined || undefined;
  };

  const handleSave = () => {
    Keyboard.dismiss();
    onSave({memberIds: [...primaryIds], mood: resolveMood(primaryMood, primaryCustomMood, primaryShowCustom), note: primaryNote, location: primaryLocation || undefined, energyLevel: primaryEnergy},
      {memberIds: [...coFrontIds], mood: resolveMood(coFrontMood, coFrontCustomMood, coFrontShowCustom), note: coFrontNote, energyLevel: coFrontEnergy},
      {memberIds: [...coConsciousIds], mood: resolveMood(coConsciousMood, coConsciousCustomMood, coConsciousShowCustom), note: coConsciousNote, energyLevel: coConsciousEnergy});
    onClose();
  };

  return (
    <Sheet visible={visible} title={t('modal.updateFront')} theme={T} onClose={onClose} footer={<><Btn instant variant="ghost" T={T} onPress={() => {
      Alert.alert(t('front.clearFrontTitle'), t('front.clearFrontMsg'), [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('common.clear'), style: 'destructive', onPress: () => {onSave(EMPTY_TIER, EMPTY_TIER, EMPTY_TIER); onClose();}},
      ]);
    }}>{t('common.clear')}</Btn><Btn instant T={T} onPress={handleSave}>{t('common.save')}</Btn></>}>
      <SectionDivider label={t('tier.primaryFront')} color={T.accent} T={T} />
      <TierMemberPicker tierKey="primary" selected={primaryIds} setSelected={makeExclusiveSetter('primary', setPrimaryIds)} members={regularMembers} groups={groups} allAssigned={allAssigned} T={T} t={t} />
      {customFronts.length > 0 && (<>
        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('members.customFronts')}</Text>
        <TierMemberPicker tierKey="primary" selected={primaryIds} setSelected={makeExclusiveSetter('primary', setPrimaryIds)} members={customFronts} groups={groups} allAssigned={allAssigned} T={T} t={t} />
      </>)}
      <MoodPicker mood={primaryMood} setMood={setPrimaryMood} customMood={primaryCustomMood} setCustomMood={setPrimaryCustomMood} showCustom={primaryShowCustom} setShowCustom={setPrimaryShowCustom} allMoods={allMoods} T={T} t={t} />
      <View style={{height: 10}} />
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('modal.location')}</Text>
      {allLocations.length > 0 && (<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 4}}><View style={{flexDirection: 'row', gap: 5}}>
        {allLocations.map((l: string) => (<TouchableOpacity key={l} onPress={() => setPrimaryLocation(primaryLocation === l ? '' : l)} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{selected: primaryLocation === l}} accessibilityLabel={l} style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, backgroundColor: primaryLocation === l ? `${T.accent}20` : T.surface, borderColor: primaryLocation === l ? `${T.accent}60` : T.border}}><Text style={{fontSize: fs(11), color: primaryLocation === l ? T.accent : T.dim, fontWeight: primaryLocation === l ? '600' : '400'}}>{l}</Text></TouchableOpacity>))}
      </View></ScrollView>)}
      <TextInput value={primaryLocation} onChangeText={setPrimaryLocation} placeholder={t('modal.typeLocation')} placeholderTextColor={T.muted} style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), marginTop: 4}} />
      <View style={{height: 8}} />
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('energy.level')}</Text>
      <EnergyRow value={primaryEnergy} onChange={setPrimaryEnergy} color={T.accent} T={T} t={t} />
      <Field label={t('modal.noteOptional')} value={primaryNote} onChange={setPrimaryNote} placeholder={t('modal.whatHappening')} multiline numberOfLines={2} T={T} />

      <SectionDivider label={t('tier.coFront')} color={T.info} T={T} />
      <TierMemberPicker tierKey="coFront" selected={coFrontIds} setSelected={makeExclusiveSetter('coFront', setCoFrontIds)} members={regularMembers} groups={groups} allAssigned={allAssigned} T={T} t={t} />
      {customFronts.length > 0 && (<>
        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('members.customFronts')}</Text>
        <TierMemberPicker tierKey="coFront" selected={coFrontIds} setSelected={makeExclusiveSetter('coFront', setCoFrontIds)} members={customFronts} groups={groups} allAssigned={allAssigned} T={T} t={t} />
      </>)}
      <MoodPicker mood={coFrontMood} setMood={setCoFrontMood} customMood={coFrontCustomMood} setCustomMood={setCoFrontCustomMood} showCustom={coFrontShowCustom} setShowCustom={setCoFrontShowCustom} allMoods={allMoods} T={T} t={t} />
      <View style={{height: 8}} />
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('energy.level')}</Text>
      <EnergyRow value={coFrontEnergy} onChange={setCoFrontEnergy} color={T.info} T={T} t={t} />
      <Field label={t('modal.noteOptional')} value={coFrontNote} onChange={setCoFrontNote} placeholder={t('modal.whatHappening')} multiline numberOfLines={2} T={T} />

      <SectionDivider label={t('tier.coConscious')} color={T.success} T={T} />
      <TierMemberPicker tierKey="coConscious" selected={coConsciousIds} setSelected={makeExclusiveSetter('coConscious', setCoConsciousIds)} members={regularMembers} groups={groups} allAssigned={allAssigned} T={T} t={t} />
      {customFronts.length > 0 && (<>
        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('members.customFronts')}</Text>
        <TierMemberPicker tierKey="coConscious" selected={coConsciousIds} setSelected={makeExclusiveSetter('coConscious', setCoConsciousIds)} members={customFronts} groups={groups} allAssigned={allAssigned} T={T} t={t} />
      </>)}
      <MoodPicker mood={coConsciousMood} setMood={setCoConsciousMood} customMood={coConsciousCustomMood} setCustomMood={setCoConsciousCustomMood} showCustom={coConsciousShowCustom} setShowCustom={setCoConsciousShowCustom} allMoods={allMoods} T={T} t={t} />
      <View style={{height: 8}} />
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('energy.level')}</Text>
      <EnergyRow value={coConsciousEnergy} onChange={setCoConsciousEnergy} color={T.success} T={T} t={t} />
      <Field label={t('modal.noteOptional')} value={coConsciousNote} onChange={setCoConsciousNote} placeholder={t('modal.whatHappening')} multiline numberOfLines={2} T={T} />
    </Sheet>
  );
};
