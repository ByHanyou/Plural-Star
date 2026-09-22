import React, {useState, useMemo} from 'react';
import {View, TouchableOpacity, ScrollView, Keyboard, Alert, Text as RNText} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Sheet} from '../components/Sheet';
import {Member, MemberGroup, FrontState, FrontTierKey, DEFAULT_MOODS, EMPTY_TIER, parseMoodList, serializeMoodList, sortMembersBySearch, memberMatchesSearch, tagKey} from '../utils';
import {fontScale} from '../theme';
import type {ThemeColors} from '../theme';
import type {TFunction} from 'i18next';
import {Btn, Field, SectionDivider, MoodPicker, EnergyRow, LocationPicker} from './shared';
import {useDraft, clearDraft} from '../hooks/useDraft';

export type PickerKind = 'members' | 'facets' | 'customFronts';
export type PickerPool = {kind?: PickerKind; label: string; members: Member[]};
export type PickerKinds = Record<PickerKind, boolean>;
export const PICKER_KIND_ORDER: PickerKind[] = ['members', 'facets', 'customFronts'];
export const ALL_PICKER_KINDS: PickerKinds = {members: true, facets: true, customFronts: true};
const PICKER_RESULTS_MAX = 20;

export const pickerKindLabel = (kind: PickerKind, t: TFunction): string =>
  kind === 'members' ? t('members.title') : kind === 'facets' ? t('members.facets') : t('members.customFronts');

export const KindToggles = ({kinds, setKinds, T, t}: {kinds: PickerKinds; setKinds: (k: PickerKinds) => void; T: ThemeColors; t: TFunction}) => {
  const fs = fontScale(T);
  return (
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8}}>
      {PICKER_KIND_ORDER.map(kind => {
        const on = kinds[kind];
        const label = pickerKindLabel(kind, t);
        return (
          <TouchableOpacity key={kind} onPress={() => setKinds({...kinds, [kind]: !on})} activeOpacity={0.7}
            accessibilityRole="checkbox" accessibilityState={{checked: on}} accessibilityLabel={label}
            hitSlop={{top: 6, bottom: 6, left: 4, right: 4}}
            style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
            <View style={{width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: on ? T.accent : T.border, backgroundColor: on ? T.accent : T.surface, overflow: 'hidden'}}>
              {on && <RNText style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, fontSize: 12, lineHeight: 15, color: T.bg, textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false, padding: 0, margin: 0}} allowFontScaling={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</RNText>}
            </View>
            <Text style={{fontSize: fs(12), color: on ? T.text : T.dim}}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export const TierMemberPicker = ({tierKey, selected, setSelected, pools, groups, allAssigned, T, t, kindLabel}: {
  tierKey: FrontTierKey; selected: Set<string>; setSelected: (s: Set<string>) => void;
  pools: PickerPool[]; groups: MemberGroup[]; allAssigned: Record<string, FrontTierKey>; T: ThemeColors; t: TFunction;
  kindLabel?: string;
}) => {
  const fs = fontScale(T);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [kinds, setKinds] = useState<PickerKinds>(ALL_PICKER_KINDS);
  const hasKinds = pools.some(p => !!p.kind);
  const members = useMemo(() => pools.flatMap(p => p.members), [pools]);
  const activePools = useMemo(() => pools.filter(p => !p.kind || kinds[p.kind]), [pools, kinds]);

  const allTags = useMemo(() => {
    const seen = new Map<string, string>();
    for (const tag of members.flatMap(m => m.tags || [])) {
      const k = tagKey(tag);
      if (!seen.has(k)) seen.set(k, tag);
    }
    return [...seen.values()].sort((a, b) => {
      const ka = tagKey(a), kb = tagKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  }, [members]);

  const grouped = useMemo(() => {
    const wanted = filterTag ? tagKey(filterTag) : null;
    const out: {label: string; rows: Member[]}[] = [];
    let budget = PICKER_RESULTS_MAX;
    for (const pool of activePools) {
      if (budget <= 0) break;
      const matches = pool.members.filter(m => {
        if (selected.has(m.id)) return false;
        const nameMatch = memberMatchesSearch(m, search);
        const tagMatch = !wanted || (m.tags || []).some(tag => tagKey(tag) === wanted);
        return nameMatch && tagMatch;
      });
      const rows = sortMembersBySearch(matches, search).slice(0, budget);
      if (rows.length === 0) continue;
      budget -= rows.length;
      out.push({label: pool.label, rows});
    }
    return out;
  }, [activePools, search, filterTag, selected]);
  const filtered = useMemo(() => grouped.flatMap(g => g.rows), [grouped]);

  const toggle = (id: string) => {
    Keyboard.dismiss();
    const next = new Set(selected);
    if (next.has(id)) { next.delete(id); } else { next.add(id); setSearch(''); }
    setSelected(next);
  };

  const selectedMembers = members.filter(m => selected.has(m.id));
  const searchKind = kindLabel || (hasKinds ? t('terminology.fronters') : '');
  const searchLabel = searchKind
    ? t('members.searchToAddKind', {kind: searchKind, defaultValue: `Type to search ${searchKind}…`})
    : t('members.searchToAdd');
  const hintLabel = searchKind
    ? t('members.searchToAddKind', {kind: searchKind, defaultValue: `Type to search ${searchKind}…`})
    : t('members.searchHint');

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

      <TextInput value={search} onChangeText={setSearch} accessibilityLabel={searchLabel} placeholder={searchLabel} placeholderTextColor={T.muted}
        autoCorrect={false} autoComplete="off" spellCheck={false} textContentType="none"
        style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), marginBottom: 6}} />

      {hasKinds && <KindToggles kinds={kinds} setKinds={setKinds} T={T} t={t} />}

      {(search || filterTag) && filtered.length > 0 && (
        <View style={{borderRadius: 8, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, overflow: 'hidden'}}>
          {grouped.map((group, gi) => (
            <View key={`${gi}-${group.label}`}>
              {grouped.length > 1 && (
                <Text accessibilityRole="header" style={{fontSize: fs(9), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, backgroundColor: T.card}}>{group.label}</Text>
              )}
              {group.rows.map(m => {
                const assignedTo = allAssigned[m.id];
                const otherTier = assignedTo && assignedTo !== tierKey;
                const otherLabel = otherTier ? (assignedTo === 'primary' ? t('tier.primaryShort') : assignedTo === 'coFront' ? t('tier.coFrontShort') : t('tier.coConShort')) : '';
                return (
                  <TouchableOpacity key={m.id} onPress={() => toggle(m.id)} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityLabel={m.name}
                    style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border, opacity: otherTier ? 0.45 : 1}}>
                    <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: m.color}} />
                    <Text style={{flex: 1, minWidth: 0, fontSize: fs(13), color: T.text}} numberOfLines={1}>{m.name}</Text>
                    {m.pronouns ? <Text style={{flexShrink: 1, fontSize: fs(11), color: T.muted}} numberOfLines={1}>{m.pronouns}</Text> : null}
                    {otherTier && otherLabel ? <Text style={{flexShrink: 0, fontSize: fs(10), color: T.muted, fontStyle: 'italic'}}>{otherLabel}</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      )}

      {!search && !filterTag && members.length > 0 && selectedMembers.length === 0 && (
        <Text style={{fontSize: fs(11), color: T.muted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 6}}>{hintLabel}</Text>
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
  const [coFrontMood, setCoFrontMood] = useState(''); const [coFrontCustomMood, setCoFrontCustomMood] = useState(''); const [coFrontShowCustom, setCoFrontShowCustom] = useState(false); const [coFrontNote, setCoFrontNote] = useState(''); const [coFrontLocation, setCoFrontLocation] = useState('');
  const [coConsciousMood, setCoConsciousMood] = useState(''); const [coConsciousCustomMood, setCoConsciousCustomMood] = useState(''); const [coConsciousShowCustom, setCoConsciousShowCustom] = useState(false); const [coConsciousNote, setCoConsciousNote] = useState(''); const [coConsciousLocation, setCoConsciousLocation] = useState('');
  const [primaryEnergy, setPrimaryEnergy] = useState<number | undefined>(undefined);
  const [coFrontEnergy, setCoFrontEnergy] = useState<number | undefined>(undefined);
  const [coConsciousEnergy, setCoConsciousEnergy] = useState<number | undefined>(undefined);

  React.useEffect(() => {
    if (visible) {
      const c: FrontState | null = current;
      const seedP = new Set<string>(c?.primary?.memberIds || []);
      const seedCf = new Set<string>((c?.coFront?.memberIds || []).filter((id: string) => !seedP.has(id)));
      const seedCc = new Set<string>((c?.coConscious?.memberIds || []).filter((id: string) => !seedP.has(id) && !seedCf.has(id)));
      setPrimaryIds(seedP); setCoFrontIds(seedCf); setCoConsciousIds(seedCc);
      setPrimaryMood(c?.primary?.mood || ''); setPrimaryCustomMood(''); setPrimaryShowCustom(false); setPrimaryLocation(c?.primary?.location || (settings?.gpsEnabled ? lastKnownLocation : '') || ''); setPrimaryNote(c?.primary?.note || '');
      setCoFrontMood(c?.coFront?.mood || ''); setCoFrontCustomMood(''); setCoFrontShowCustom(false); setCoFrontNote(c?.coFront?.note || ''); setCoFrontLocation(c?.coFront?.location || '');
      setCoConsciousMood(c?.coConscious?.mood || ''); setCoConsciousCustomMood(''); setCoConsciousShowCustom(false); setCoConsciousNote(c?.coConscious?.note || ''); setCoConsciousLocation(c?.coConscious?.location || '');
      setPrimaryEnergy(c?.primary?.energyLevel); setCoFrontEnergy(c?.coFront?.energyLevel); setCoConsciousEnergy(c?.coConscious?.energyLevel);
    }
  }, [visible, current, lastKnownLocation]);

  const allMoods = [...DEFAULT_MOODS, ...(settings?.customMoods || [])];
  const allLocations = settings?.locations || [];

  useDraft<any>(
    'front', 'current', visible,
    {
      p: [...primaryIds], cf: [...coFrontIds], cc: [...coConsciousIds],
      pm: primaryMood, pcm: primaryCustomMood, psc: primaryShowCustom, pl: primaryLocation, pn: primaryNote, pe: primaryEnergy,
      fm: coFrontMood, fcm: coFrontCustomMood, fsc: coFrontShowCustom, fl: coFrontLocation, fn: coFrontNote, fe: coFrontEnergy,
      cm: coConsciousMood, ccm: coConsciousCustomMood, csc: coConsciousShowCustom, cl: coConsciousLocation, cn: coConsciousNote, ce: coConsciousEnergy,
    },
    d => {
      setPrimaryIds(new Set(d.p || [])); setCoFrontIds(new Set(d.cf || [])); setCoConsciousIds(new Set(d.cc || []));
      setPrimaryMood(d.pm || ''); setPrimaryCustomMood(d.pcm || ''); setPrimaryShowCustom(!!d.psc); setPrimaryLocation(d.pl || ''); setPrimaryNote(d.pn || ''); setPrimaryEnergy(d.pe);
      setCoFrontMood(d.fm || ''); setCoFrontCustomMood(d.fcm || ''); setCoFrontShowCustom(!!d.fsc); setCoFrontLocation(d.fl || ''); setCoFrontNote(d.fn || ''); setCoFrontEnergy(d.fe);
      setCoConsciousMood(d.cm || ''); setCoConsciousCustomMood(d.ccm || ''); setCoConsciousShowCustom(!!d.csc); setCoConsciousLocation(d.cl || ''); setCoConsciousNote(d.cn || ''); setCoConsciousEnergy(d.ce);
    },
  );
  const regularMembers = useMemo(() => members.filter((m: Member) => !m.isCustomFront && !m.isFacet), [members]);
  const facets = useMemo(() => members.filter((m: Member) => m.isFacet && !m.isCustomFront), [members]);
  const customFronts = useMemo(() => members.filter((m: Member) => m.isCustomFront), [members]);
  const pools: PickerPool[] = useMemo(() => [
    {kind: 'members' as PickerKind, label: t('members.title'), members: regularMembers},
    {kind: 'facets' as PickerKind, label: t('members.facets'), members: facets},
    {kind: 'customFronts' as PickerKind, label: t('members.customFronts'), members: customFronts},
  ], [regularMembers, facets, customFronts, t]);

  const allAssigned = useMemo(() => {
    const map: Record<string, FrontTierKey> = {};
    primaryIds.forEach(id => { map[id] = 'primary'; });
    coFrontIds.forEach(id => { map[id] = 'coFront'; });
    coConsciousIds.forEach(id => { map[id] = 'coConscious'; });
    return map;
  }, [primaryIds, coFrontIds, coConsciousIds]);

  const makeExclusiveSetter = (tier: FrontTierKey, setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (newSet: Set<string>) => {
    const setters: Record<FrontTierKey, React.Dispatch<React.SetStateAction<Set<string>>>> =
      {primary: setPrimaryIds, coFront: setCoFrontIds, coConscious: setCoConsciousIds};
    (Object.keys(setters) as FrontTierKey[]).forEach(key => {
      if (key === tier) return;
      setters[key](prev => {
        let changed = false;
        const cleaned = new Set(prev);
        newSet.forEach(id => { if (cleaned.delete(id)) changed = true; });
        return changed ? cleaned : prev;
      });
    });
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
      {memberIds: [...coFrontIds], mood: resolveMood(coFrontMood, coFrontCustomMood, coFrontShowCustom), note: coFrontNote, location: coFrontLocation || undefined, energyLevel: coFrontEnergy},
      {memberIds: [...coConsciousIds], mood: resolveMood(coConsciousMood, coConsciousCustomMood, coConsciousShowCustom), note: coConsciousNote, location: coConsciousLocation || undefined, energyLevel: coConsciousEnergy});
    clearDraft('front', 'current');
    onClose();
  };

  return (
    <Sheet visible={visible} title={t('modal.updateFront')} theme={T} onClose={onClose} footer={<><Btn instant variant="ghost" T={T} onPress={() => {
      Alert.alert(t('front.clearFrontTitle'), t('front.clearFrontMsg'), [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('common.clear'), style: 'destructive', onPress: () => {onSave(EMPTY_TIER, EMPTY_TIER, EMPTY_TIER); clearDraft('front', 'current'); onClose();}},
      ]);
    }}>{t('common.clear')}</Btn><Btn instant T={T} onPress={handleSave}>{t('common.save')}</Btn></>}>
      <SectionDivider label={t('tier.primaryFront')} color={T.accent} T={T} />
      <TierMemberPicker tierKey="primary" selected={primaryIds} setSelected={makeExclusiveSetter('primary', setPrimaryIds)} pools={pools} groups={groups} allAssigned={allAssigned} T={T} t={t} />
      <MoodPicker mood={primaryMood} setMood={setPrimaryMood} customMood={primaryCustomMood} setCustomMood={setPrimaryCustomMood} showCustom={primaryShowCustom} setShowCustom={setPrimaryShowCustom} allMoods={allMoods} T={T} t={t} />
      <View style={{height: 10}} />
      <LocationPicker location={primaryLocation} setLocation={setPrimaryLocation} allLocations={allLocations} color={T.accent} T={T} t={t} />
      <View style={{height: 8}} />
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('energy.level')}</Text>
      <EnergyRow value={primaryEnergy} onChange={setPrimaryEnergy} color={T.accent} T={T} t={t} />
      <Field label={t('modal.noteOptional')} value={primaryNote} onChange={setPrimaryNote} placeholder={t('modal.whatHappening')} multiline numberOfLines={2} T={T} />

      <SectionDivider label={t('tier.coFront')} color={T.info} T={T} />
      <TierMemberPicker tierKey="coFront" selected={coFrontIds} setSelected={makeExclusiveSetter('coFront', setCoFrontIds)} pools={pools} groups={groups} allAssigned={allAssigned} T={T} t={t} />
      <MoodPicker mood={coFrontMood} setMood={setCoFrontMood} customMood={coFrontCustomMood} setCustomMood={setCoFrontCustomMood} showCustom={coFrontShowCustom} setShowCustom={setCoFrontShowCustom} allMoods={allMoods} T={T} t={t} />
      <View style={{height: 10}} />
      <LocationPicker location={coFrontLocation} setLocation={setCoFrontLocation} allLocations={allLocations} color={T.info} T={T} t={t} />
      <View style={{height: 8}} />
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('energy.level')}</Text>
      <EnergyRow value={coFrontEnergy} onChange={setCoFrontEnergy} color={T.info} T={T} t={t} />
      <Field label={t('modal.noteOptional')} value={coFrontNote} onChange={setCoFrontNote} placeholder={t('modal.whatHappening')} multiline numberOfLines={2} T={T} />

      <SectionDivider label={t('tier.coConscious')} color={T.success} T={T} />
      <TierMemberPicker tierKey="coConscious" selected={coConsciousIds} setSelected={makeExclusiveSetter('coConscious', setCoConsciousIds)} pools={pools} groups={groups} allAssigned={allAssigned} T={T} t={t} />
      <MoodPicker mood={coConsciousMood} setMood={setCoConsciousMood} customMood={coConsciousCustomMood} setCustomMood={setCoConsciousCustomMood} showCustom={coConsciousShowCustom} setShowCustom={setCoConsciousShowCustom} allMoods={allMoods} T={T} t={t} />
      <View style={{height: 10}} />
      <LocationPicker location={coConsciousLocation} setLocation={setCoConsciousLocation} allLocations={allLocations} color={T.success} T={T} t={t} />
      <View style={{height: 8}} />
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('energy.level')}</Text>
      <EnergyRow value={coConsciousEnergy} onChange={setCoConsciousEnergy} color={T.success} T={T} t={t} />
      <Field label={t('modal.noteOptional')} value={coConsciousNote} onChange={setCoConsciousNote} placeholder={t('modal.whatHappening')} multiline numberOfLines={2} T={T} />
    </Sheet>
  );
};
