import React, {useState, useMemo, useEffect} from 'react';
import {View, TouchableOpacity, StyleSheet, ScrollView, Image, Keyboard, Alert, Modal} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {pickImageFromGallery} from '../utils/imagePicker';
import {Sheet} from '../components/Sheet';
import {PALETTE, BUILTIN_PALETTES, deriveTheme} from '../theme';
import type {CustomPalette} from '../theme';
import {Member, MemberGroup, JournalEntry, JournalTemplate, FrontState, FrontTier, FrontTierKey, SystemInfo, AppSettings, TextScale, TEXT_SCALE_OPTIONS, CustomFieldDef, CustomFieldValue, NoteboardEntry, uid, isValidHex, normalizeHex, DEFAULT_MOODS, EMPTY_TIER, TIER_LABELS, fmtTime, getInitials, translateMood, parseMoodList, toggleMoodInList, serializeMoodList} from '../utils';
import {store, KEYS} from '../storage';
import {SUPPORTED_LANGUAGES} from '../i18n/i18n';
import type {SupportedLanguage} from '../i18n/i18n';

import {RichText as RichDescription} from '../components/MarkdownRenderer';
import {RichTextEditor} from '../components/RichTextEditor';
import {DateTimeEditor} from '../components/DateTimeEditor';
import {deleteAvatar, saveBannerImage, saveAvatarFromUri, saveBioImageFromUri} from '../utils/mediaUtils';

const HexField = ({label, value, onChange, T}: {label: string; value: string; onChange: (v: string) => void; T: any}) => (
  <View style={{flex: 1}}>
    <Text style={{fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 4, fontWeight: '600'}}>{label}</Text>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
      <View style={{width: 20, height: 20, borderRadius: 4, backgroundColor: isValidHex(normalizeHex(value)) ? normalizeHex(value) : '#333', borderWidth: 1, borderColor: T.border}} />
      <TextInput value={value} onChangeText={onChange} placeholder="#000000" placeholderTextColor={T.muted} maxLength={7} autoCapitalize="characters"
        style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: isValidHex(normalizeHex(value)) || value.length < 2 ? T.border : T.danger, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, fontSize: 12, fontFamily: 'monospace'}} />
    </View>
  </View>
);

const Btn = ({children, onPress, variant = 'primary', disabled = false, style = {}, T}: any) => {
  const variants: any = {primary: {bg: T.accentBg, color: T.accent, border: `${T.accent}40`}, ghost: {bg: 'transparent', color: T.dim, border: T.border}, danger: {bg: T.dangerBg, color: T.danger, border: `${T.danger}40`}, solid: {bg: T.accent, color: '#0a0508', border: T.accent}, info: {bg: T.infoBg, color: T.info, border: `${T.info}40`}};
  const v = variants[variant] || variants.primary;
  return (<TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.7} style={[{paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: v.bg, borderColor: v.border, opacity: disabled ? 0.5 : 1}, style]}><Text style={{fontSize: 14, fontWeight: '500', color: v.color}}>{children}</Text></TouchableOpacity>);
};

const Field = ({label, value, onChange, placeholder, multiline = false, numberOfLines = 4, readOnly = false, T}: any) => (
  <View style={{marginBottom: 14}}>
    {label && <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 5, fontWeight: '600'}}>{label}</Text>}
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={T.muted} multiline={multiline} numberOfLines={multiline ? numberOfLines : 1}
      editable={!readOnly}
      style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: multiline ? 100 : undefined, textAlignVertical: multiline ? 'top' : 'center'}} />
  </View>
);

const SectionDivider = ({label, color, T}: {label: string; color: string; T: any}) => (
  <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 12}}>
    <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: color}} />
    <Text style={{fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color, fontWeight: '700'}}>{label}</Text>
    <View style={{flex: 1, height: 1, backgroundColor: T.border}} />
  </View>
);


const TierMemberPicker = ({tierKey, selected, setSelected, members, groups, allAssigned, T, t}: {
  tierKey: FrontTierKey; selected: Set<string>; setSelected: (s: Set<string>) => void;
  members: Member[]; groups: MemberGroup[]; allAssigned: Record<string, FrontTierKey>; T: any; t: any;
}) => {
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const allTags = useMemo(() => [...new Set(members.flatMap(m => m.tags || []))].sort(), [members]);

  const filtered = useMemo(() => {
    return members.filter(m => {
      if (selected.has(m.id)) return false;
      const nameMatch = !search || m.name.toLowerCase().includes(search.toLowerCase());
      const tagMatch = !filterTag || (m.tags || []).includes(filterTag);
      return nameMatch && tagMatch;
    });
  }, [members, search, filterTag, selected]);

  const toggle = (id: string) => {
    Keyboard.dismiss();
    const next = new Set(selected);
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    setSelected(next);
  };

  const selectedMembers = members.filter(m => selected.has(m.id));

  return (
    <View style={{marginBottom: 10}}>
      {selectedMembers.length > 0 && (
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8}}>
          {selectedMembers.map(m => (
            <TouchableOpacity key={m.id} onPress={() => toggle(m.id)} activeOpacity={0.7}
              style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: `${m.color}20`, borderWidth: 1, borderColor: `${m.color}50`}}>
              <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: m.color}} />
              <Text style={{fontSize: 12, fontWeight: '500', color: m.color}}>{m.name}</Text>
              <Text style={{fontSize: 10, color: m.color, marginLeft: 2}}>✕</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {allTags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 6}}>
          <View style={{flexDirection: 'row', gap: 5}}>
            {allTags.map(tag => (
              <TouchableOpacity key={tag} onPress={() => setFilterTag(filterTag === tag ? null : tag)} activeOpacity={0.7}
                style={{paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
                  backgroundColor: filterTag === tag ? `${T.info}18` : T.surface, borderColor: filterTag === tag ? `${T.info}50` : T.border}}>
                <Text style={{fontSize: 10, color: filterTag === tag ? T.info : T.dim}}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      <TextInput value={search} onChangeText={setSearch} placeholder={t('members.searchToAdd')} placeholderTextColor={T.muted}
        autoCorrect={false} autoComplete="off" spellCheck={false} textContentType="none"
        style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, marginBottom: 6}} />

      {(search || filterTag) && filtered.length > 0 && (
        <View style={{maxHeight: 180, borderRadius: 8, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, overflow: 'hidden'}}>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {filtered.slice(0, 20).map(m => {
              const assignedTo = allAssigned[m.id];
              const otherTier = assignedTo && assignedTo !== tierKey;
              const otherLabel = otherTier ? (assignedTo === 'primary' ? t('tier.primaryShort') : assignedTo === 'coFront' ? t('tier.coFrontShort') : t('tier.coConShort')) : '';
              return (
                <TouchableOpacity key={m.id} onPress={() => toggle(m.id)} activeOpacity={0.7}
                  style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border, opacity: otherTier ? 0.45 : 1}}>
                  <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: m.color}} />
                  <Text style={{flex: 1, fontSize: 13, color: T.text}} numberOfLines={1}>{m.name}</Text>
                  {m.pronouns ? <Text style={{fontSize: 11, color: T.muted}}>{m.pronouns}</Text> : null}
                  {otherTier && otherLabel ? <Text style={{fontSize: 10, color: T.muted, fontStyle: 'italic'}}>{otherLabel}</Text> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {!search && !filterTag && members.length > 0 && selectedMembers.length === 0 && (
        <Text style={{fontSize: 11, color: T.muted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 6}}>{t('members.searchHint')}</Text>
      )}
    </View>
  );
};


const MoodPicker = ({mood, setMood, customMood, setCustomMood, showCustom, setShowCustom, allMoods, T, t}: any) => {
  const selected = parseMoodList(mood);
  const isSel = (m: string) => selected.includes(m);
  return (
    <>
      <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('modal.mood')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 4}}>
        <View style={{flexDirection: 'row', gap: 5}}>
          {allMoods.map((m: string) => (
            <TouchableOpacity key={m} onPress={() => setMood(toggleMoodInList(mood, m))} activeOpacity={0.7}
              style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, flexShrink: 0, backgroundColor: isSel(m) ? `${T.accent}20` : T.surface, borderColor: isSel(m) ? `${T.accent}60` : T.border}}>
              <Text style={{fontSize: 11, color: isSel(m) ? T.accent : T.dim, fontWeight: isSel(m) ? '600' : '400'}}>{translateMood(m, t)}</Text>
            </TouchableOpacity>))}
          <TouchableOpacity onPress={() => setShowCustom(!showCustom)} activeOpacity={0.7}
            style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, flexShrink: 0, backgroundColor: showCustom ? `${T.accent}20` : T.surface, borderColor: showCustom ? `${T.accent}60` : T.border}}>
            <Text style={{fontSize: 11, color: showCustom ? T.accent : T.dim, fontWeight: showCustom ? '600' : '400'}}>{showCustom ? `− ${t('modal.custom')}` : `+ ${t('modal.custom')}`}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      {showCustom && <TextInput value={customMood} onChangeText={setCustomMood} placeholder={t('modal.enterMood')} placeholderTextColor={T.muted}
        style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, marginTop: 4}} />}
    </>
  );
};


export const SetFrontModal = ({visible, theme: T, members, groups, current, settings, lastKnownLocation, onSave, onClose}: any) => {
  const fs = (s: number) => Math.round(s * (T.textScale || 1));
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
      setPrimaryMood(c?.primary?.mood || ''); setPrimaryCustomMood(''); setPrimaryShowCustom(false); setPrimaryLocation(c?.primary?.location || lastKnownLocation || ''); setPrimaryNote(c?.primary?.note || '');
      setCoFrontMood(c?.coFront?.mood || ''); setCoFrontCustomMood(''); setCoFrontShowCustom(false); setCoFrontNote(c?.coFront?.note || '');
      setCoConsciousMood(c?.coConscious?.mood || ''); setCoConsciousCustomMood(''); setCoConsciousShowCustom(false); setCoConsciousNote(c?.coConscious?.note || '');
      setPrimaryEnergy(c?.primary?.energyLevel); setCoFrontEnergy(c?.coFront?.energyLevel); setCoConsciousEnergy(c?.coConscious?.energyLevel);
    }
  }, [visible, current, lastKnownLocation]);

  const allMoods = [...DEFAULT_MOODS, ...(settings?.customMoods || [])];
  const allLocations = settings?.locations || [];

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
    <Sheet visible={visible} title={t('modal.updateFront')} theme={T} onClose={onClose} footer={<><Btn variant="ghost" T={T} onPress={() => {onSave(EMPTY_TIER, EMPTY_TIER, EMPTY_TIER); onClose();}}>{t('common.clear')}</Btn><Btn T={T} onPress={handleSave}>{t('common.save')}</Btn></>}>
      <SectionDivider label={t('tier.primaryFront')} color={T.accent} T={T} />
      <TierMemberPicker tierKey="primary" selected={primaryIds} setSelected={makeExclusiveSetter('primary', setPrimaryIds)} members={members} groups={groups} allAssigned={allAssigned} T={T} t={t} />
      <MoodPicker mood={primaryMood} setMood={setPrimaryMood} customMood={primaryCustomMood} setCustomMood={setPrimaryCustomMood} showCustom={primaryShowCustom} setShowCustom={setPrimaryShowCustom} allMoods={allMoods} T={T} t={t} />
      <View style={{height: 10}} />
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('modal.location')}</Text>
      {allLocations.length > 0 && (<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 4}}><View style={{flexDirection: 'row', gap: 5}}>
        {allLocations.map((l: string) => (<TouchableOpacity key={l} onPress={() => setPrimaryLocation(primaryLocation === l ? '' : l)} activeOpacity={0.7} style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, backgroundColor: primaryLocation === l ? `${T.accent}20` : T.surface, borderColor: primaryLocation === l ? `${T.accent}60` : T.border}}><Text style={{fontSize: fs(11), color: primaryLocation === l ? T.accent : T.dim, fontWeight: primaryLocation === l ? '600' : '400'}}>{l}</Text></TouchableOpacity>))}
      </View></ScrollView>)}
      <TextInput value={primaryLocation} onChangeText={setPrimaryLocation} placeholder={t('modal.typeLocation')} placeholderTextColor={T.muted} style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), marginTop: 4}} />
      <View style={{height: 8}} />
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('energy.level')}</Text>
      <View style={{flexDirection: 'row', gap: 3, marginBottom: 8, alignItems: 'center'}}>
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <TouchableOpacity key={n} onPress={() => setPrimaryEnergy(primaryEnergy === n ? undefined : n)} activeOpacity={0.7}
            style={{flex: 1, paddingVertical: 6, borderRadius: 6, borderWidth: 1, alignItems: 'center',
              backgroundColor: primaryEnergy === n ? `${T.accent}30` : T.surface,
              borderColor: primaryEnergy !== undefined && n <= primaryEnergy ? T.accent : T.border}}>
            <Text style={{fontSize: fs(10), color: primaryEnergy !== undefined && n <= primaryEnergy ? T.accent : T.dim, fontWeight: '600'}}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Field label={t('modal.noteOptional')} value={primaryNote} onChange={setPrimaryNote} placeholder={t('modal.whatHappening')} multiline numberOfLines={2} T={T} />

      <SectionDivider label={t('tier.coFront')} color={T.info} T={T} />
      <TierMemberPicker tierKey="coFront" selected={coFrontIds} setSelected={makeExclusiveSetter('coFront', setCoFrontIds)} members={members} groups={groups} allAssigned={allAssigned} T={T} t={t} />
      <MoodPicker mood={coFrontMood} setMood={setCoFrontMood} customMood={coFrontCustomMood} setCustomMood={setCoFrontCustomMood} showCustom={coFrontShowCustom} setShowCustom={setCoFrontShowCustom} allMoods={allMoods} T={T} t={t} />
      <View style={{height: 8}} />
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('energy.level')}</Text>
      <View style={{flexDirection: 'row', gap: 3, marginBottom: 8, alignItems: 'center'}}>
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <TouchableOpacity key={n} onPress={() => setCoFrontEnergy(coFrontEnergy === n ? undefined : n)} activeOpacity={0.7}
            style={{flex: 1, paddingVertical: 6, borderRadius: 6, borderWidth: 1, alignItems: 'center',
              backgroundColor: coFrontEnergy === n ? `${T.info}30` : T.surface,
              borderColor: coFrontEnergy !== undefined && n <= coFrontEnergy ? T.info : T.border}}>
            <Text style={{fontSize: fs(10), color: coFrontEnergy !== undefined && n <= coFrontEnergy ? T.info : T.dim, fontWeight: '600'}}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Field label={t('modal.noteOptional')} value={coFrontNote} onChange={setCoFrontNote} placeholder={t('modal.whatHappening')} multiline numberOfLines={2} T={T} />

      <SectionDivider label={t('tier.coConscious')} color={T.success} T={T} />
      <TierMemberPicker tierKey="coConscious" selected={coConsciousIds} setSelected={makeExclusiveSetter('coConscious', setCoConsciousIds)} members={members} groups={groups} allAssigned={allAssigned} T={T} t={t} />
      <MoodPicker mood={coConsciousMood} setMood={setCoConsciousMood} customMood={coConsciousCustomMood} setCustomMood={setCoConsciousCustomMood} showCustom={coConsciousShowCustom} setShowCustom={setCoConsciousShowCustom} allMoods={allMoods} T={T} t={t} />
      <View style={{height: 8}} />
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('energy.level')}</Text>
      <View style={{flexDirection: 'row', gap: 3, marginBottom: 8, alignItems: 'center'}}>
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <TouchableOpacity key={n} onPress={() => setCoConsciousEnergy(coConsciousEnergy === n ? undefined : n)} activeOpacity={0.7}
            style={{flex: 1, paddingVertical: 6, borderRadius: 6, borderWidth: 1, alignItems: 'center',
              backgroundColor: coConsciousEnergy === n ? `${T.success}30` : T.surface,
              borderColor: coConsciousEnergy !== undefined && n <= coConsciousEnergy ? T.success : T.border}}>
            <Text style={{fontSize: fs(10), color: coConsciousEnergy !== undefined && n <= coConsciousEnergy ? T.success : T.dim, fontWeight: '600'}}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Field label={t('modal.noteOptional')} value={coConsciousNote} onChange={setCoConsciousNote} placeholder={t('modal.whatHappening')} multiline numberOfLines={2} T={T} />
    </Sheet>
  );
};


export const EditFrontDetailModal = ({visible, theme: T, front, tier, settings, lastKnownLocation, onSave, onClose}: any) => {
  const fs = (s: number) => Math.round(s * (T.textScale || 1));
  const {t} = useTranslation();
  const tierData: FrontTier = front?.[tier] || EMPTY_TIER;
  const isPrimary = tier === 'primary';
  const tierLabel = t(`tier.${tier === 'primary' ? 'primaryFront' : tier === 'coFront' ? 'coFront' : 'coConscious'}`);
  const [mood, setMood] = useState(tierData.mood || ''); const [customMood, setCustomMood] = useState(''); const [showCustomMood, setShowCustomMood] = useState(false);
  const [location, setLocation] = useState(tierData.location || lastKnownLocation || ''); const [note, setNote] = useState(tierData.note || '');
  const allMoods = [...DEFAULT_MOODS, ...(settings?.customMoods || [])]; const allLocations = settings?.locations || [];
  React.useEffect(() => { if (visible) { const td = front?.[tier] || EMPTY_TIER; setMood(td.mood || ''); setLocation(td.location || lastKnownLocation || ''); setNote(td.note || ''); setShowCustomMood(false); setCustomMood(''); } }, [visible, front, tier, lastKnownLocation]);

  return (
    <Sheet visible={visible} title={t('tier.editTier', {tier: tierLabel})} theme={T} onClose={onClose}
      footer={<Btn T={T} onPress={() => {
        const moods = parseMoodList(mood);
        if (showCustomMood && customMood.trim()) moods.push(customMood.trim());
        const resolved = serializeMoodList(moods) || undefined;
        onSave(resolved, isPrimary ? location || undefined : undefined, note);
        onClose();
      }}>{t('common.save')}</Btn>}>
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.mood')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 6}}><View style={{flexDirection: 'row', gap: 6}}>
        {(() => { const sel = parseMoodList(mood); return allMoods.map((m: string) => {
          const on = sel.includes(m);
          return (<TouchableOpacity key={m} onPress={() => setMood(toggleMoodInList(mood, m))} activeOpacity={0.7} style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, flexShrink: 0, backgroundColor: on ? `${T.accent}20` : T.surface, borderColor: on ? `${T.accent}60` : T.border}}><Text style={{fontSize: fs(12), color: on ? T.accent : T.dim, fontWeight: on ? '600' : '400'}}>{translateMood(m, t)}</Text></TouchableOpacity>);
        }); })()}
        <TouchableOpacity onPress={() => setShowCustomMood(!showCustomMood)} activeOpacity={0.7} style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, flexShrink: 0, backgroundColor: showCustomMood ? `${T.accent}20` : T.surface, borderColor: showCustomMood ? `${T.accent}60` : T.border}}><Text style={{fontSize: fs(12), color: showCustomMood ? T.accent : T.dim, fontWeight: showCustomMood ? '600' : '400'}}>{showCustomMood ? `− ${t('modal.custom')}` : `+ ${t('modal.custom')}`}</Text></TouchableOpacity>
      </View></ScrollView>
      {showCustomMood && <TextInput value={customMood} onChangeText={setCustomMood} placeholder={t('modal.enterMood')} placeholderTextColor={T.muted} style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(14), marginTop: 6}} />}
      {isPrimary && (<><View style={{height: 12}} /><Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.location')}</Text>
        {allLocations.length > 0 && (<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 6}}><View style={{flexDirection: 'row', gap: 6}}>{allLocations.map((l: string) => (<TouchableOpacity key={l} onPress={() => setLocation(location === l ? '' : l)} activeOpacity={0.7} style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, backgroundColor: location === l ? `${T.accent}20` : T.surface, borderColor: location === l ? `${T.accent}60` : T.border}}><Text style={{fontSize: fs(12), color: location === l ? T.accent : T.dim}}>{l}</Text></TouchableOpacity>))}</View></ScrollView>)}
        <TextInput value={location} onChangeText={setLocation} placeholder={t('modal.typeLocation')} placeholderTextColor={T.muted} style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(14), marginTop: 6}} /></>)}
      <View style={{height: 12}} />
      <Field label={t('modal.note')} value={note} onChange={setNote} placeholder={t('modal.whatHappening')} multiline numberOfLines={3} T={T} />
    </Sheet>
  );
};


export const MemberModal = ({visible, theme: T, member, members, groups, settings, onSave, onDelete, onClose, readOnly = false, onMentionPress}: any) => {
  const {t} = useTranslation();
  const fs = (s: number) => Math.round(s * (T.textScale || 1));
  const isNew = !member;
  const [f, setF] = useState<Member>(member || {id: uid(), name: '', pronouns: '', role: '', color: PALETTE[0], description: '', tags: [], groupIds: []});
  const [hexInput, setHexInput] = useState(member?.color || PALETTE[0]); const [hexError, setHexError] = useState(false); const [confirmDel, setConfirmDel] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [showDescEditor, setShowDescEditor] = useState(false);

  type MemberTab = 'main' | 'fields' | 'noteboard';
  const [memberTab, setMemberTab] = useState<MemberTab>('main');

  const [fieldDefs, setFieldDefs] = useState<CustomFieldDef[]>([]);
  const [allNotes, setAllNotes] = useState<NoteboardEntry[]>([]);
  const [noteText, setNoteText] = useState('');
  const [noteAuthorId, setNoteAuthorId] = useState<string>('');
  const [markdownEditFieldId, setMarkdownEditFieldId] = useState<string | null>(null);

  useEffect(() => {
    store.get<CustomFieldDef[]>(KEYS.customFieldDefs, []).then(d => setFieldDefs(d || []));
    store.get<NoteboardEntry[]>(KEYS.noteboards, []).then(n => setAllNotes(n || []));
  }, []);

  React.useEffect(() => { if (visible) { const fresh = member || {id: uid(), name: '', pronouns: '', role: '', color: PALETTE[0], description: '', tags: [], groupIds: []}; setF({...fresh, tags: fresh.tags || [], groupIds: fresh.groupIds || []}); setHexInput(fresh.color); setHexError(false); setConfirmDel(false); setTagInput(''); setShowDescEditor(false); setMemberTab('main'); setNoteText(''); setNoteAuthorId((members || []).find((m: Member) => !m.archived)?.id || ''); store.get<NoteboardEntry[]>(KEYS.noteboards, []).then(n => setAllNotes(n || [])); } }, [visible, member?.id]);
  const set = (k: keyof Member, v: any) => setF(x => ({...x, [k]: v}));
  const handleHexChange = (val: string) => { setHexInput(val); const n = normalizeHex(val); if (isValidHex(n)) {set('color', n); setHexError(false);} else setHexError(val.length > 1); };

  const addTag = () => { const raw = tagInput.trim().replace(/^#/, '').toLowerCase(); if (!raw) return; const cur = f.tags || []; if (!cur.includes(`#${raw}`)) set('tags', [...cur, `#${raw}`]); setTagInput(''); };
  const togGroup = (gid: string) => { const cur = f.groupIds || []; set('groupIds', cur.includes(gid) ? cur.filter(id => id !== gid) : [...cur, gid]); };

  const pickAvatar = async () => {
    try {
      const img = await pickImageFromGallery();
      if (!img) return;
      const sourceFileUri = img.uri.startsWith('file://') || img.uri.startsWith('content://')
        ? img.uri
        : `file://${img.uri}`;
      const uri = await saveAvatarFromUri(f.id, sourceFileUri);
      set('avatar', uri);
    } catch (e: any) {
      Alert.alert(t('modal.pfpFailed'), e.message || '');
    }
  };

  const removeAvatar = async () => {
    await deleteAvatar(f.id);
    set('avatar', undefined);
  };

  const memberNotes = allNotes.filter(n => n.memberId === f.id).sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.timestamp - a.timestamp;
  });

  const saveNotes = async (updated: NoteboardEntry[]) => {
    setAllNotes(updated);
    await store.set(KEYS.noteboards, updated);
  };

  const addNote = () => {
    if (!noteText.trim() || !noteAuthorId) return;
    const entry: NoteboardEntry = {id: uid(), memberId: f.id, authorId: noteAuthorId, content: noteText.trim(), timestamp: Date.now()};
    saveNotes([...allNotes, entry]);
    setNoteText('');
  };

  const deleteNote = (id: string) => Alert.alert(t('noteboard.deleteNote'), t('noteboard.deleteNoteMsg'), [
    {text: t('common.cancel'), style: 'cancel'},
    {text: t('common.delete'), style: 'destructive', onPress: () => saveNotes(allNotes.filter(n => n.id !== id))},
  ]);

  const markNoteboardRead = async () => {
    if (!f.id || isNew) return;
    try {
      const lastSeen = (await store.get<Record<string, number>>(KEYS.lastNoteboardSeen, {})) || {};
      lastSeen[f.id] = Date.now();
      await store.set(KEYS.lastNoteboardSeen, lastSeen);
    } catch (e) {}
  };

  const togglePin = (id: string) => saveNotes(allNotes.map(n => n.id === id ? {...n, pinned: !n.pinned} : n));

  const setFieldVal = (fieldId: string, newVal: string | number | boolean | null) => {
    const existing = f.customFields || [];
    const updated = existing.some(v => v.fieldId === fieldId)
      ? existing.map(v => v.fieldId === fieldId ? {...v, value: newVal} : v)
      : [...existing, {fieldId, value: newVal}];
    set('customFields' as any, updated);
  };

  const activeMembers = (members || []).filter((m: Member) => !m.archived);

  return (
    <Sheet visible={visible} title={readOnly ? (f.name || t('modal.member', {defaultValue: 'Member'})) : (isNew ? t('modal.addMember') : t('modal.editMember'))} theme={T} onClose={onClose} footer={readOnly ? (
      <Btn variant="ghost" T={T} onPress={onClose}>{t('common.close', {defaultValue: 'Close'})}</Btn>
    ) : (<>
      {!isNew && !confirmDel && <Btn variant="danger" T={T} onPress={() => setConfirmDel(true)}>{t('common.delete')}</Btn>}
      {confirmDel && (<><Btn variant="danger" T={T} onPress={() => {onDelete(member.id); onClose();}}>{t('modal.confirmDelete')}</Btn><Btn variant="ghost" T={T} onPress={() => setConfirmDel(false)}>{t('common.cancel')}</Btn></>)}
      {!confirmDel && <Btn variant="ghost" T={T} onPress={onClose}>{t('common.cancel')}</Btn>}
      {!confirmDel && <Btn T={T} onPress={() => {if (f.name.trim()) {onSave(f); onClose();}}}>{t('common.save')}</Btn>}</>)}>

      {!isNew && (
        <View style={{flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border, marginBottom: 14}}>
          {(['main', 'fields', 'noteboard'] as MemberTab[]).map(tab => (
            <TouchableOpacity key={tab} onPress={() => setMemberTab(tab)} activeOpacity={0.7}
              style={{paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: memberTab === tab ? T.accent : 'transparent'}}>
              <Text style={{fontSize: fs(12), color: memberTab === tab ? T.accent : T.dim, fontWeight: memberTab === tab ? '600' : '400'}}>
                {tab === 'main' ? t('modal.editMember') : tab === 'fields' ? t('customFields.title') : t('noteboard.title')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {(memberTab === 'main' || isNew) && (<>
        <View style={{alignItems: 'center', marginBottom: 16}}>
          <TouchableOpacity onPress={readOnly ? undefined : pickAvatar} activeOpacity={readOnly ? 1 : 0.7}>
            {f.avatar ? (
              <Image source={{uri: f.avatar}} style={{width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: f.color}} />
            ) : (
              <View style={{width: 80, height: 80, borderRadius: 40, backgroundColor: f.color, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)'}}>
                <Text style={{fontSize: fs(28), fontWeight: '700', color: 'rgba(0,0,0,0.75)'}}>{getInitials(f.name || '?')}</Text>
              </View>
            )}
            {!readOnly && (
              <View style={{position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center'}}>
                <Text style={{fontSize: fs(12), color: T.bg}}>📷</Text>
              </View>
            )}
          </TouchableOpacity>
          {f.avatar && !readOnly && (
            <TouchableOpacity onPress={removeAvatar} activeOpacity={0.7} style={{marginTop: 6}}>
              <Text style={{fontSize: fs(11), color: T.danger}}>{t('modal.removePfp')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {(!readOnly || f.banner) && (
          <TouchableOpacity onPress={readOnly ? undefined : async () => {
            try {
              const img = await pickImageFromGallery();
              if (!img) return;
              const sourceFileUri = img.uri.startsWith('file://') || img.uri.startsWith('content://')
                ? img.uri
                : `file://${img.uri}`;
              const uri = await saveBannerImage(`banner-${f.id}`, sourceFileUri);
              set('banner', uri);
            } catch (e: any) { Alert.alert(t('modal.pfpFailed')); }
          }} activeOpacity={readOnly ? 1 : 0.7} style={{marginBottom: 10}}>
            <View style={{width: '100%', aspectRatio: 3, borderRadius: 8, borderWidth: readOnly ? 0 : 1, borderStyle: 'dashed', borderColor: T.border, overflow: 'hidden', backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center'}}>
              {f.banner ? <Image source={{uri: f.banner}} style={{width: '100%', height: '100%', borderRadius: 8}} resizeMode="cover" /> : <Text style={{fontSize: fs(11), color: T.dim}}>{t('memberProfile.changeBanner')}</Text>}
            </View>
          </TouchableOpacity>
        )}
        {f.banner && !readOnly && <TouchableOpacity onPress={() => set('banner', undefined)} activeOpacity={0.7} style={{marginBottom: 8}}><Text style={{fontSize: fs(10), color: T.danger}}>{t('memberProfile.removeBanner')}</Text></TouchableOpacity>}

        <Field label={t('modal.name')} value={f.name} onChange={(v: string) => set('name', v)} placeholder={t('modal.headmateName')} readOnly={readOnly} T={T} />
        <Field label={t('modal.pronouns')} value={f.pronouns} onChange={(v: string) => set('pronouns', v)} placeholder={t('modal.pronounsPlaceholder')} readOnly={readOnly} T={T} />
        <Field label={t('modal.role')} value={f.role} onChange={(v: string) => set('role', v)} placeholder={t('modal.rolePlaceholder')} readOnly={readOnly} T={T} />

        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.color')}</Text>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10}}>
          <View style={{width: 36, height: 36, borderRadius: 18, backgroundColor: f.color, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)'}} />
          <TextInput value={hexInput} onChangeText={handleHexChange} placeholder="#C9A96E" placeholderTextColor={T.muted} maxLength={7} autoCapitalize="characters"
            editable={!readOnly}
            style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: hexError ? T.danger : T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(14), fontFamily: 'monospace'}} />
        </View>
        {hexError && !readOnly && <Text style={{fontSize: fs(11), color: T.danger, marginBottom: 8}}>{t('modal.invalidHex')}</Text>}
        {!readOnly && <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14}}>{PALETTE.map((c: string) => (<TouchableOpacity key={c} onPress={() => {set('color', c); setHexInput(c); setHexError(false);}} activeOpacity={0.8} style={{width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: 2, borderColor: f.color === c ? '#fff' : 'transparent'}} />))}</View>}
        {readOnly && <View style={{marginBottom: 14}} />}

        {(groups || []).length > 0 && (() => {
          const visibleGroups = readOnly
            ? (groups || []).filter((g: MemberGroup) => (f.groupIds || []).includes(g.id))
            : (groups || []);
          if (readOnly && visibleGroups.length === 0) return null;
          return (
            <>
              <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('memberGroups.title')}</Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14}}>
                {visibleGroups.map((g: MemberGroup) => {
                  const active = (f.groupIds || []).includes(g.id);
                  return (
                    <TouchableOpacity key={g.id} onPress={readOnly ? undefined : () => togGroup(g.id)} activeOpacity={readOnly ? 1 : 0.7}
                      style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
                        backgroundColor: active ? `${g.color || T.accent}20` : T.surface, borderColor: active ? `${g.color || T.accent}50` : T.border}}>
                      <View style={{width: 7, height: 7, borderRadius: 3.5, backgroundColor: g.color || T.accent}} />
                      <Text style={{fontSize: fs(12), color: active ? (g.color || T.accent) : T.dim}}>{g.name}</Text>
                      {active && !readOnly && <Text style={{fontSize: fs(11), fontWeight: '700', color: g.color || T.accent}}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          );
        })()}

        {(!readOnly || (f.tags || []).length > 0) && (
          <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.memberTags')}</Text>
        )}
        {(f.tags || []).length > 0 && (
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: readOnly ? 14 : 8}}>
            {(f.tags || []).map((tag: string) => (
              <TouchableOpacity key={tag} onPress={readOnly ? undefined : () => set('tags', (f.tags || []).filter(x => x !== tag))} activeOpacity={readOnly ? 1 : 0.7}
                style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: `${T.info}18`, borderWidth: 1, borderColor: `${T.info}40`}}>
                <Text style={{fontSize: fs(12), color: T.info}}>{tag}</Text>
                {!readOnly && <Text style={{fontSize: fs(10), color: T.danger}}>✕</Text>}
              </TouchableOpacity>))}
          </View>
        )}
        {!readOnly && (
          <View style={{flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 14}}>
            <TextInput value={tagInput} onChangeText={setTagInput} placeholder={t('modal.memberTagPlaceholder')} placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false}
              style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13)}} onSubmitEditing={addTag} returnKeyType="done" />
            <Btn T={T} onPress={addTag} style={{paddingHorizontal: 12, paddingVertical: 9}}>{t('common.add')}</Btn>
          </View>
        )}

        {(!readOnly || f.description) && (
          <View style={{marginBottom: 14}}>
            <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 5, fontWeight: '600'}}>{t('modal.descriptionBio')}</Text>
            <TouchableOpacity onPress={readOnly ? undefined : () => setShowDescEditor(true)} activeOpacity={readOnly ? 1 : 0.7}
              style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12, minHeight: 80}}>
              {f.description ? <RichDescription text={f.description} T={T} members={members} onMentionPress={onMentionPress} /> : <Text style={{fontSize: fs(13), color: T.muted}}>{t('modal.descriptionPlaceholder')}</Text>}
            </TouchableOpacity>
          </View>
        )}
        {!readOnly && <RichTextEditor visible={showDescEditor} title={t('modal.descriptionBio')} initialContent={f.description || ''} theme={T}
          members={members}
          onSave={(html: string) => {set('description', html); setShowDescEditor(false);}} onClose={() => setShowDescEditor(false)} />}

        {!isNew && !readOnly && (
          <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 4}}>
            <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
              <View style={{flex: 1}}>
                <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('modal.archiveMember')}</Text>
                <Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15}}>{t('modal.archiveDesc')}</Text>
              </View>
              <TouchableOpacity onPress={() => set('archived', !f.archived)} activeOpacity={0.8}
                style={{width: 40, height: 22, borderRadius: 11, backgroundColor: f.archived ? T.accent : T.toggleOff, justifyContent: 'center', marginLeft: 12}}>
                <View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', position: 'absolute', left: f.archived ? 20 : 3}} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </>)}

      {memberTab === 'fields' && !isNew && (
        <View>
          {fieldDefs.length > 0 ? fieldDefs.map(fd => {
            const cfv = (f.customFields || []).find(v => v.fieldId === fd.id);
            const val = cfv?.value ?? '';

            const dateTypes: Record<string, true> = {
              date: true, timestamp: true, monthYear: true,
              month: true, year: true, monthDay: true,
            };
            if (dateTypes[fd.type]) {
              const modeMap: Record<string, 'date' | 'datetime' | 'monthYear' | 'month' | 'year' | 'monthDay'> = {
                date: 'date', timestamp: 'datetime', monthYear: 'monthYear',
                month: 'month', year: 'year', monthDay: 'monthDay',
              };
              let dateVal: Date;
              if (typeof val === 'number' && Number.isFinite(val)) {
                dateVal = new Date(val);
              } else if (typeof val === 'string' && val) {
                const asNum = Number(val);
                if (Number.isFinite(asNum) && asNum > 0) {
                  dateVal = new Date(asNum);
                } else {
                  const parsed = Date.parse(val);
                  dateVal = Number.isFinite(parsed) ? new Date(parsed) : new Date();
                }
              } else {
                dateVal = new Date();
              }
              return (
                <View key={fd.id} style={{marginBottom: 14}}>
                  <DateTimeEditor
                    date={dateVal}
                    onChange={readOnly ? () => {} : d => setFieldVal(fd.id, d.getTime())}
                    label={fd.name}
                    mode={modeMap[fd.type]}
                    T={T}
                  />
                  {val !== '' && !readOnly && (
                    <TouchableOpacity onPress={() => setFieldVal(fd.id, null)} activeOpacity={0.7}
                      style={{alignSelf: 'flex-end', marginTop: -8, paddingVertical: 4, paddingHorizontal: 6}}>
                      <Text style={{fontSize: fs(11), color: T.muted}}>{t('common.clear', {defaultValue: 'Clear'})}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }

            if (fd.type === 'dateRange') {
              let range: {start: number; end: number} = {start: Date.now(), end: Date.now()};
              if (typeof val === 'string' && val) {
                try { const parsed = JSON.parse(val); if (parsed && typeof parsed.start === 'number' && typeof parsed.end === 'number') range = parsed; } catch {}
              }
              const startD = new Date(range.start);
              const endD = new Date(range.end);
              const writeRange = (next: Partial<typeof range>) => {
                const merged = {...range, ...next};
                setFieldVal(fd.id, JSON.stringify(merged));
              };
              return (
                <View key={fd.id} style={{marginBottom: 14}}>
                  <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{fd.name}</Text>
                  <DateTimeEditor
                    date={startD}
                    onChange={readOnly ? () => {} : d => writeRange({start: d.getTime()})}
                    label={t('customFields.startDate', {defaultValue: 'Start'})}
                    mode="date"
                    T={T}
                  />
                  <DateTimeEditor
                    date={endD}
                    onChange={readOnly ? () => {} : d => writeRange({end: d.getTime()})}
                    label={t('customFields.endDate', {defaultValue: 'End'})}
                    mode="date"
                    T={T}
                  />
                </View>
              );
            }

            return (
              <View key={fd.id} style={{marginBottom: 14}}>
                {fd.type === 'toggle' ? (
                  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                    <Text style={{fontSize: fs(13), color: T.text, fontWeight: '500'}}>{fd.name}</Text>
                    <TouchableOpacity onPress={readOnly ? undefined : () => setFieldVal(fd.id, !val)} activeOpacity={readOnly ? 1 : 0.8}
                      style={{width: 40, height: 22, borderRadius: 11, backgroundColor: val ? T.accent : T.toggleOff, justifyContent: 'center'}}>
                      <View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', position: 'absolute', left: val ? 20 : 3}} />
                    </TouchableOpacity>
                  </View>
                ) : fd.type === 'color' ? (
                  <View>
                    <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{fd.name}</Text>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                      <View style={{width: 32, height: 32, borderRadius: 8, backgroundColor: String(val || '#333'), borderWidth: 1, borderColor: T.border}} />
                      <TextInput value={String(val || '')} onChangeText={v => setFieldVal(fd.id, v)} placeholder="#000000" placeholderTextColor={T.muted}
                        editable={!readOnly}
                        style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), fontFamily: 'monospace'}} />
                    </View>
                  </View>
                ) : (fd.type === 'markdown' || (fd.type === 'text' && fd.markdown)) ? (
                  <View style={{marginBottom: 0}}>
                    <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 5, fontWeight: '600'}}>{fd.name}</Text>
                    <TouchableOpacity onPress={readOnly ? undefined : () => setMarkdownEditFieldId(fd.id)} activeOpacity={readOnly ? 1 : 0.7}
                      style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12, minHeight: 72}}>
                      {val
                        ? <RichDescription text={String(val)} T={T} members={members} onMentionPress={onMentionPress} />
                        : <Text style={{fontSize: fs(13), color: T.muted}}>{fd.name}…</Text>}
                    </TouchableOpacity>
                    {!readOnly && <RichTextEditor
                      visible={markdownEditFieldId === fd.id}
                      title={fd.name}
                      initialContent={String(val || '')}
                      theme={T}
                      members={members}
                      onSave={(html: string) => { setFieldVal(fd.id, html); setMarkdownEditFieldId(null); }}
                      onClose={() => setMarkdownEditFieldId(null)}
                    />}
                  </View>
                ) : fd.type === 'text' ? (
                  <View style={{marginBottom: 0}}>
                    <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 5, fontWeight: '600'}}>{fd.name}</Text>
                    <TextInput
                      value={String(val || '')}
                      onChangeText={(v: string) => setFieldVal(fd.id, v)}
                      placeholder={fd.name}
                      placeholderTextColor={T.muted}
                      editable={!readOnly}
                      multiline
                      textAlignVertical="top"
                      style={{
                        backgroundColor: T.surface, color: T.text,
                        borderWidth: 1, borderColor: T.border, borderRadius: 8,
                        paddingHorizontal: 12, paddingVertical: 10,
                        fontSize: fs(14), lineHeight: 20, minHeight: 72,
                      }}
                    />
                  </View>
                ) : fd.type === 'number' ? (
                  <View>
                    <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 5, fontWeight: '600'}}>{fd.name}</Text>
                    <TextInput
                      value={val === null || val === '' ? '' : String(val)}
                      onChangeText={(raw: string) => {
                        const cleaned = raw.replace(/[^0-9.\-]/g, '');
                        if (cleaned === '' || cleaned === '-' || cleaned === '.') { setFieldVal(fd.id, null); return; }
                        const n = Number(cleaned);
                        if (Number.isFinite(n)) setFieldVal(fd.id, n);
                      }}
                      placeholder={fd.name}
                      placeholderTextColor={T.muted}
                      editable={!readOnly}
                      keyboardType="numbers-and-punctuation"
                      style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(14)}}
                    />
                  </View>
                ) : (
                  <Field label={fd.name} value={String(val || '')} onChange={(v: string) => setFieldVal(fd.id, v)}
                    placeholder={fd.name} readOnly={readOnly} T={T} />
                )}
              </View>
            );
          }) : (
            <View style={{alignItems: 'center', paddingVertical: 40}}>
              <Text style={{fontSize: fs(13), color: T.muted}}>{t('customFields.noFieldsInfo')}</Text>
            </View>
          )}
        </View>
      )}

      {memberTab === 'noteboard' && !isNew && (
        <View>
          {memberNotes.length > 0 ? memberNotes.map(note => {
            const author = (members || []).find((m: Member) => m.id === note.authorId);
            return (
              <TouchableOpacity key={note.id} onPress={markNoteboardRead} activeOpacity={0.85}
                style={{backgroundColor: note.pinned ? `${T.accent}10` : T.card, borderRadius: 10, borderWidth: 1, borderColor: note.pinned ? T.accent : T.border, padding: 12, marginBottom: 8}}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6}}>
                  <View style={{width: 22, height: 22, borderRadius: 11, backgroundColor: author?.color || T.muted, alignItems: 'center', justifyContent: 'center'}}>
                    <Text style={{fontSize: fs(9), fontWeight: '700', color: 'rgba(0,0,0,0.75)'}}>{getInitials(author?.name || '?')}</Text>
                  </View>
                  <Text style={{fontSize: fs(12), color: author?.color || T.dim, fontWeight: '500'}}>{author?.name || '?'}</Text>
                  <Text style={{fontSize: fs(10), color: T.muted, marginLeft: 'auto'}}>{fmtTime(note.timestamp)}</Text>
                </View>
                <Text style={{fontSize: fs(13), color: T.text, lineHeight: 20}}>{note.content}</Text>
                <View style={{flexDirection: 'row', gap: 12, marginTop: 8}}>
                  <TouchableOpacity onPress={() => {togglePin(note.id); markNoteboardRead();}} activeOpacity={0.7}>
                    <Text style={{fontSize: fs(11), color: note.pinned ? T.accent : T.dim}}>{note.pinned ? `📌 ${t('noteboard.unpin')}` : t('noteboard.pin')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteNote(note.id)} activeOpacity={0.7}>
                    <Text style={{fontSize: fs(11), color: T.danger}}>{t('noteboard.deleteNote')}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }) : (
            <View style={{alignItems: 'center', paddingVertical: 40}}>
              <Text style={{fontSize: fs(13), color: T.muted}}>{t('noteboard.noNotes')}</Text>
            </View>
          )}

          <View style={{backgroundColor: T.surface, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12, marginTop: 8}}>
              <View style={{marginBottom: 8}}>
                <Text style={{fontSize: fs(11), color: T.dim, marginBottom: 6}}>{t('noteboard.writingAs')}</Text>
                <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 4}}>
                    {activeMembers.map((m: Member) => (
                      <TouchableOpacity key={m.id} onPress={() => setNoteAuthorId(m.id)} activeOpacity={0.7}
                        style={{paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
                          backgroundColor: noteAuthorId === m.id ? `${m.color}20` : T.bg,
                          borderColor: noteAuthorId === m.id ? `${m.color}50` : T.border}}>
                        <Text style={{fontSize: fs(11), color: noteAuthorId === m.id ? m.color : T.dim}}>{m.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
              </View>
              <View style={{flexDirection: 'row', gap: 8, alignItems: 'flex-end'}}>
                <TextInput value={noteText} onChangeText={setNoteText} placeholder={t('noteboard.placeholder')} placeholderTextColor={T.muted} multiline
                  style={{flex: 1, backgroundColor: T.bg, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), minHeight: 48, textAlignVertical: 'top'}} />
                <TouchableOpacity onPress={addNote} activeOpacity={0.7}
                  style={{backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10}}>
                  <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
        </View>
      )}
    </Sheet>
  );
};


export const JournalModal = ({visible, theme: T, entry, members, templates, onSave, onClose, onMentionPress}: any) => {
  const fs = (s: number) => Math.round(s * (T.textScale || 1));
  const {t} = useTranslation();
  const isNew = !entry;
  const [f, setF] = useState<JournalEntry>(entry || {id: uid(), title: '', body: '', authorIds: [], hashtags: [], timestamp: Date.now()});
  const [showPwField, setShowPwField] = useState(false); const [tagInput, setTagInput] = useState('');
  const [authorSearch, setAuthorSearch] = useState('');
  const [showBodyEditor, setShowBodyEditor] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  React.useEffect(() => { if (visible) { const fresh = entry || {id: uid(), title: '', body: '', authorIds: [], hashtags: [], timestamp: Date.now()}; setF(fresh); setShowPwField(!!fresh.password); setTagInput(''); setAuthorSearch(''); setShowBodyEditor(false); setShowTemplatePicker(false); } }, [visible, entry]);
  const set = (k: keyof JournalEntry, v: any) => setF(x => ({...x, [k]: v}));
  const togAuthor = (id: string) => set('authorIds', (f.authorIds || []).includes(id) ? (f.authorIds || []).filter((i: string) => i !== id) : [...(f.authorIds || []), id]);
  const addTag = () => { const raw = tagInput.trim().replace(/^#/, '').toLowerCase(); if (!raw) return; const cur = f.hashtags || []; if (!cur.includes(`#${raw}`)) set('hashtags', [...cur, `#${raw}`]); setTagInput(''); };
  const applyTemplate = (tpl: JournalTemplate) => {
    setF(x => ({...x, title: tpl.title || x.title, body: tpl.body || x.body, hashtags: [...(tpl.hashtags || [])]}));
    setShowTemplatePicker(false);
  };
  const templateList: JournalTemplate[] = Array.isArray(templates) ? templates : [];
  const canUseTemplates = isNew && templateList.length > 0;

  return (
    <Sheet visible={visible} title={isNew ? t('modal.newEntry') : t('modal.editEntry')} theme={T} onClose={onClose} footer={<Btn T={T} onPress={() => {onSave({...f, timestamp: isNew ? Date.now() : f.timestamp, password: showPwField && f.password ? f.password : undefined}); onClose();}}>{t('common.save')}</Btn>}>
      {canUseTemplates && (
        <View style={{marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8}}>
          <Text style={{flex: 1, fontSize: fs(11), color: T.muted}}>
            {t('journal.templateHint', {defaultValue: 'Pre-fill from a saved template?'})}
          </Text>
          <TouchableOpacity onPress={() => setShowTemplatePicker(true)} activeOpacity={0.7}
            style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
            <Text style={{fontSize: fs(12), fontWeight: '500', color: T.accent}}>
              {t('journal.fromTemplate', {defaultValue: 'From template…'})}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <Field label={t('modal.entryTitle')} value={f.title} onChange={(v: string) => set('title', v)} placeholder={t('modal.entryTitlePlaceholder')} T={T} />

      <View style={{marginBottom: 14}}>
        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 5, fontWeight: '600'}}>{t('modal.body')}</Text>
        <TouchableOpacity onPress={() => setShowBodyEditor(true)} activeOpacity={0.7}
          style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12, minHeight: 100}}>
          {f.body ? <RichDescription text={f.body} T={T} members={members} onMentionPress={onMentionPress} /> : <Text style={{fontSize: fs(13), color: T.muted}}>{t('modal.writeHere')}</Text>}
        </TouchableOpacity>
      </View>
      <RichTextEditor visible={showBodyEditor} title={t('modal.body')} initialContent={f.body || ''} theme={T}
        members={members}
        onSave={(html: string) => {set('body', html); setShowBodyEditor(false);}} onClose={() => setShowBodyEditor(false)} />

      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.tags')}</Text>
      {(f.hashtags || []).length > 0 && (<View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8}}>{(f.hashtags || []).map((tag: string) => (<TouchableOpacity key={tag} onPress={() => set('hashtags', (f.hashtags || []).filter((x: string) => x !== tag))} activeOpacity={0.7} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: `${T.info}18`, borderWidth: 1, borderColor: `${T.info}40`}}><Text style={{fontSize: fs(12), color: T.info}}>{tag}</Text><Text style={{fontSize: fs(10), color: T.danger}}>✕</Text></TouchableOpacity>))}</View>)}
      <View style={{flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 14}}>
        <TextInput value={tagInput} onChangeText={setTagInput} placeholder={t('modal.topic')} placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false} style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13)}} onSubmitEditing={addTag} returnKeyType="done" />
        <Btn T={T} onPress={addTag} style={{paddingHorizontal: 12, paddingVertical: 9}}>{t('common.add')}</Btn>
      </View>
      {members.length > 0 && (<>
        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.authors')}</Text>
        {(f.authorIds || []).length > 0 && (
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8}}>
            {(f.authorIds || []).map((id: string) => { const m = members.find((x: Member) => x.id === id); if (!m) return null; return (
              <TouchableOpacity key={id} onPress={() => togAuthor(id)} activeOpacity={0.7}
                style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: `${m.color}20`, borderWidth: 1, borderColor: `${m.color}50`}}>
                <View style={{width: 7, height: 7, borderRadius: 3.5, backgroundColor: m.color}} />
                <Text style={{fontSize: fs(12), color: m.color}}>{m.name}</Text>
                <Text style={{fontSize: fs(10), color: T.danger}}>✕</Text>
              </TouchableOpacity>
            ); })}
          </View>
        )}
        <TextInput value={authorSearch} onChangeText={setAuthorSearch} placeholder={t('modal.searchAuthors')} placeholderTextColor={T.muted}
          autoCorrect={false} autoComplete="off" spellCheck={false} textContentType="none"
          style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), marginBottom: 4}} />
        {authorSearch.length > 0 && (
          <View style={{backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.border, maxHeight: 160, overflow: 'hidden', marginBottom: 8}}>
            <ScrollView nestedScrollEnabled>
              {members.filter((m: Member) => !m.archived && m.name.toLowerCase().includes(authorSearch.toLowerCase())).map((m: Member) => {
                const active = (f.authorIds || []).includes(m.id);
                return (
                  <TouchableOpacity key={m.id} onPress={() => {togAuthor(m.id); setAuthorSearch('');}} activeOpacity={0.7}
                    style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: 1, borderBottomColor: T.border}}>
                    <View style={{width: 7, height: 7, borderRadius: 3.5, backgroundColor: m.color}} />
                    <Text style={{fontSize: fs(13), color: active ? m.color : T.text, fontWeight: active ? '600' : '400'}}>{m.name}</Text>
                    {active && <Text style={{color: m.color, marginLeft: 'auto'}}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </>)}
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14}}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}><Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600'}}>{t('modal.entryPassword')}</Text><TouchableOpacity onPress={() => {setShowPwField(!showPwField); if (showPwField) set('password', undefined);}}><Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>{showPwField ? t('common.remove') : t('common.add')}</Text></TouchableOpacity></View>
        {showPwField && <TextInput value={f.password || ''} onChangeText={(v: string) => set('password', v || undefined)} placeholder={t('modal.entryPasswordPlaceholder')} placeholderTextColor={T.muted} secureTextEntry style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(14)}} />}
      </View>
      {showTemplatePicker && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowTemplatePicker(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => setShowTemplatePicker(false)}
            style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 24}}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}
              style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, maxHeight: '70%', overflow: 'hidden'}}>
              <View style={{padding: 14, borderBottomWidth: 1, borderBottomColor: T.border}}>
                <Text style={{fontSize: fs(11), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600'}}>
                  {t('journal.pickTemplate', {defaultValue: 'Pick a template'})}
                </Text>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight: 360}}>
                {templateList.map((tpl: JournalTemplate) => (
                  <TouchableOpacity key={tpl.id} onPress={() => applyTemplate(tpl)} activeOpacity={0.7}
                    style={{paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border}}>
                    <Text style={{fontSize: fs(14), fontWeight: '600', color: T.text}}>{tpl.name}</Text>
                    {tpl.title ? <Text style={{fontSize: fs(12), color: T.dim, marginTop: 2}} numberOfLines={1}>{tpl.title}</Text> : null}
                    {(tpl.hashtags || []).length > 0 && (
                      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4}}>
                        {(tpl.hashtags || []).slice(0, 6).map((tag: string) => (
                          <Text key={tag} style={{fontSize: fs(10), color: T.info, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: `${T.info}15`}}>{tag}</Text>
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </Sheet>
  );
};

export const JournalTemplateModal = ({visible, theme: T, template, onSave, onDelete, onClose}: any) => {
  const fs = (s: number) => Math.round(s * (T.textScale || 1));
  const {t} = useTranslation();
  const isNew = !template;
  const blank = (): JournalTemplate => ({id: uid(), name: '', title: '', body: '', hashtags: [], createdAt: Date.now()});
  const [f, setF] = useState<JournalTemplate>(template || blank());
  const [tagInput, setTagInput] = useState('');
  const [showBodyEditor, setShowBodyEditor] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  React.useEffect(() => {
    if (visible) {
      setF(template || blank());
      setTagInput('');
      setShowBodyEditor(false);
      setConfirmDel(false);
    }
  }, [visible, template]);
  const set = (k: keyof JournalTemplate, v: any) => setF(x => ({...x, [k]: v}));
  const addTag = () => {
    const raw = tagInput.trim().replace(/^#/, '').toLowerCase();
    if (!raw) return;
    const cur = f.hashtags || [];
    if (!cur.includes(`#${raw}`)) set('hashtags', [...cur, `#${raw}`]);
    setTagInput('');
  };

  return (
    <Sheet
      visible={visible}
      title={isNew
        ? t('journal.newTemplate', {defaultValue: 'New Template'})
        : t('journal.editTemplate', {defaultValue: 'Edit Template'})}
      theme={T}
      onClose={onClose}
      footer={
        <>
          {!isNew && (
            confirmDel
              ? <Btn variant="danger" T={T} onPress={() => {onDelete?.(f.id); onClose();}}>{t('common.confirm')}</Btn>
              : <Btn variant="ghost" T={T} onPress={() => setConfirmDel(true)}>{t('common.delete')}</Btn>
          )}
          <Btn T={T} onPress={() => {
            if (!f.name.trim()) return;
            onSave({...f, name: f.name.trim(), title: f.title.trim()});
            onClose();
          }}>{t('common.save')}</Btn>
        </>
      }>
      <Field
        label={t('journal.templateName', {defaultValue: 'Template Name *'})}
        value={f.name}
        onChange={(v: string) => set('name', v)}
        placeholder={t('journal.templateNamePlaceholder', {defaultValue: 'e.g. Morning Pages'})}
        T={T} />
      <Field
        label={t('journal.templateTitle', {defaultValue: 'Entry Title (preset)'})}
        value={f.title}
        onChange={(v: string) => set('title', v)}
        placeholder={t('modal.entryTitlePlaceholder')}
        T={T} />
      <View style={{marginBottom: 14}}>
        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 5, fontWeight: '600'}}>
          {t('journal.templateBody', {defaultValue: 'Entry Body (preset)'})}
        </Text>
        <TouchableOpacity onPress={() => setShowBodyEditor(true)} activeOpacity={0.7}
          style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12, minHeight: 100}}>
          {f.body
            ? <RichDescription text={f.body} T={T} />
            : <Text style={{fontSize: fs(13), color: T.muted}}>{t('modal.writeHere')}</Text>}
        </TouchableOpacity>
      </View>
      <RichTextEditor
        visible={showBodyEditor}
        title={t('journal.templateBody', {defaultValue: 'Entry Body (preset)'})}
        initialContent={f.body || ''}
        theme={T}
        onSave={(html: string) => {set('body', html); setShowBodyEditor(false);}}
        onClose={() => setShowBodyEditor(false)} />
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.tags')}</Text>
      {(f.hashtags || []).length > 0 && (
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8}}>
          {(f.hashtags || []).map((tag: string) => (
            <TouchableOpacity key={tag}
              onPress={() => set('hashtags', (f.hashtags || []).filter((x: string) => x !== tag))}
              activeOpacity={0.7}
              style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: `${T.info}18`, borderWidth: 1, borderColor: `${T.info}40`}}>
              <Text style={{fontSize: fs(12), color: T.info}}>{tag}</Text>
              <Text style={{fontSize: fs(10), color: T.danger}}>✕</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>
        <TextInput value={tagInput} onChangeText={setTagInput} placeholder={t('modal.topic')} placeholderTextColor={T.muted}
          autoCapitalize="none" autoCorrect={false}
          style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13)}}
          onSubmitEditing={addTag} returnKeyType="done" />
        <Btn T={T} onPress={addTag} style={{paddingHorizontal: 12, paddingVertical: 9}}>{t('common.add')}</Btn>
      </View>
    </Sheet>
  );
};


export const SystemModal = ({visible, theme: T, system, settings, palettes, activePaletteId, onSave, onSaveSettings, onSavePalettes, onSelectPalette, onClose}: any) => {
  const fs = (s: number) => Math.round(s * (T.textScale || 1));
  const {t} = useTranslation();
  const [f, setF] = useState({...system}); const [showJournalPw, setShowJournalPw] = useState(!!system.journalPassword);
  const [newLocation, setNewLocation] = useState(''); const [newMood, setNewMood] = useState('');
  const [locs, setLocs] = useState<string[]>(settings?.locations || []); const [moods, setMoods] = useState<string[]>(settings?.customMoods || []);
  const [selectedLang, setSelectedLang] = useState<SupportedLanguage>(settings?.language || 'en');
  const [notifEnabled, setNotifEnabled] = useState<boolean>(settings?.notificationsEnabled ?? true);
  const [frontCheckInterval, setFrontCheckInterval] = useState<number>(settings?.frontCheckInterval || 0);
  const [noteboardNotifs, setNoteboardNotifs] = useState<boolean>(settings?.noteboardNotifications ?? false);
  const [appLockPw, setAppLockPw] = useState<string>(settings?.appLockPassword || '');
  const [showAppLockPw, setShowAppLockPw] = useState<boolean>(!!settings?.appLockPassword);
  const [filesEnabled, setFilesEnabled] = useState<boolean>(settings?.filesEnabled ?? true);
  const [textScale, setTextScale] = useState<TextScale>(settings?.textScale ?? 1.0);
  const [useDyslexicFont, setUseDyslexicFont] = useState<boolean>(!!settings?.useDyslexicFont);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showFrontCheckPicker, setShowFrontCheckPicker] = useState(false);
  const [editPalette, setEditPalette] = useState<CustomPalette | null>(null);
  const [paletteName, setPaletteName] = useState('');
  const [palBg, setPalBg] = useState(''); const [palAccent, setPalAccent] = useState('');
  const [palText, setPalText] = useState(''); const [palMid, setPalMid] = useState('');

  React.useEffect(() => { if (visible) { setF({...system}); setShowJournalPw(!!system.journalPassword); setLocs(settings?.locations || []); setMoods(settings?.customMoods || []); setNewLocation(''); setNewMood(''); setSelectedLang(settings?.language || 'en'); setNotifEnabled(settings?.notificationsEnabled ?? true); setFilesEnabled(settings?.filesEnabled ?? true); setTextScale(settings?.textScale ?? 1.0); setUseDyslexicFont(!!settings?.useDyslexicFont); setShowLangPicker(false); setShowFrontCheckPicker(false); setEditPalette(null); setFrontCheckInterval(settings?.frontCheckInterval || 0); setNoteboardNotifs(settings?.noteboardNotifications ?? false); setAppLockPw(settings?.appLockPassword || ''); setShowAppLockPw(!!settings?.appLockPassword); } }, [visible, system, settings]);

  const addLoc = () => {if (newLocation.trim() && !locs.includes(newLocation.trim())) {setLocs([...locs, newLocation.trim()]); setNewLocation('');}};
  const addMood = () => {if (newMood.trim() && !moods.includes(newMood.trim())) {setMoods([...moods, newMood.trim()]); setNewMood('');}};

  const allPalettes: CustomPalette[] = [...BUILTIN_PALETTES, ...(palettes || [])];
  const userPalettes: CustomPalette[] = palettes || [];
  const canAdd = userPalettes.length < 10;

  const startNewPalette = () => {
    const p: CustomPalette = {id: uid(), name: '', bg: '#0A1F2E', accent: '#DAA520', text: '#C0C0C0', mid: '#7A8A99'};
    setEditPalette(p); setPaletteName(''); setPalBg(p.bg); setPalAccent(p.accent); setPalText(p.text); setPalMid(p.mid);
  };

  const startEditPalette = (p: CustomPalette) => {
    setEditPalette(p); setPaletteName(p.name); setPalBg(p.bg); setPalAccent(p.accent); setPalText(p.text); setPalMid(p.mid);
  };

  const savePalette = () => {
    if (!editPalette || !paletteName.trim()) return;
    const updated: CustomPalette = {id: editPalette.id, name: paletteName.trim(), bg: isValidHex(normalizeHex(palBg)) ? normalizeHex(palBg) : editPalette.bg, accent: isValidHex(normalizeHex(palAccent)) ? normalizeHex(palAccent) : editPalette.accent, text: isValidHex(normalizeHex(palText)) ? normalizeHex(palText) : editPalette.text, mid: isValidHex(normalizeHex(palMid)) ? normalizeHex(palMid) : editPalette.mid};
    const existing = userPalettes.find(p => p.id === updated.id);
    const newList = existing ? userPalettes.map(p => p.id === updated.id ? updated : p) : [...userPalettes, updated];
    onSavePalettes(newList);
    setEditPalette(null);
  };

  const deletePalette = (id: string) => {
    onSavePalettes(userPalettes.filter(p => p.id !== id));
    if (activePaletteId === id) onSelectPalette('__dark__');
  };


  return (
    <Sheet visible={visible} title={t('modal.systemSettings')} theme={T} onClose={onClose} footer={<Btn T={T} onPress={() => {
      onSave({...f, journalPassword: showJournalPw && f.journalPassword ? f.journalPassword : undefined});
      onSaveSettings({...settings, locations: locs, customMoods: moods, language: selectedLang, notificationsEnabled: notifEnabled, filesEnabled, textScale, useDyslexicFont, frontCheckInterval, noteboardNotifications: noteboardNotifs, appLockPassword: showAppLockPw && appLockPw ? appLockPw : undefined});
      onClose();
    }}>{t('common.save')}</Btn>}>
      <Field label={t('modal.systemName')} value={f.name} onChange={(v: string) => setF((x: any) => ({...x, name: v}))} placeholder={t('modal.systemNamePlaceholder')} T={T} />
      <Field label={t('modal.descriptionLabel')} value={f.description} onChange={(v: string) => setF((x: any) => ({...x, description: v}))} placeholder={t('modal.descriptionFieldPlaceholder')} multiline numberOfLines={3} T={T} />

      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, marginTop: 14, fontWeight: '600'}}>{t('systemProfile.title')}</Text>
      <View style={{flexDirection: 'row', gap: 12, marginBottom: 14, alignItems: 'flex-start'}}>
        <TouchableOpacity onPress={async () => {
          try {
            const img = await pickImageFromGallery();
            if (!img) return;
            const sourceFileUri = img.uri.startsWith('file://') || img.uri.startsWith('content://')
              ? img.uri
              : `file://${img.uri}`;
            const uri = await saveBioImageFromUri('system-avatar', sourceFileUri);
            setF((x: any) => ({...x, avatar: uri}));
          } catch (e: any) { Alert.alert(t('modal.pfpFailed')); }
        }} activeOpacity={0.7}>
          <View style={{width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: T.accent, overflow: 'hidden', backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center'}}>
            {f.avatar ? <Image source={{uri: f.avatar}} style={{width: 64, height: 64, borderRadius: 32}} /> : <Text style={{fontSize: fs(22), color: T.dim}}>📷</Text>}
          </View>
        </TouchableOpacity>
        <View style={{flex: 1}}>
          <TouchableOpacity onPress={async () => {
            try {
              const img = await pickImageFromGallery();
              if (!img) return;
              const sourceFileUri = img.uri.startsWith('file://') || img.uri.startsWith('content://')
                ? img.uri
                : `file://${img.uri}`;
              const uri = await saveBannerImage('system-banner', sourceFileUri);
              setF((x: any) => ({...x, banner: uri}));
            } catch (e: any) { Alert.alert(t('modal.pfpFailed')); }
          }} activeOpacity={0.7}>
            <View style={{width: '100%', aspectRatio: 3, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: T.border, overflow: 'hidden', backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center'}}>
              {f.banner ? <Image source={{uri: f.banner}} style={{width: '100%', height: '100%', borderRadius: 8}} resizeMode="cover" /> : <Text style={{fontSize: fs(11), color: T.dim}}>{t('systemProfile.changeBanner')}</Text>}
            </View>
          </TouchableOpacity>
          {f.banner && <TouchableOpacity onPress={() => setF((x: any) => ({...x, banner: undefined}))} activeOpacity={0.7}><Text style={{fontSize: fs(10), color: T.danger, marginTop: 4}}>{t('systemProfile.removeBanner')}</Text></TouchableOpacity>}
        </View>
      </View>
      {f.avatar && <TouchableOpacity onPress={() => setF((x: any) => ({...x, avatar: undefined}))} activeOpacity={0.7} style={{marginBottom: 8}}><Text style={{fontSize: fs(10), color: T.danger}}>{t('systemProfile.removeAvatar')}</Text></TouchableOpacity>}

      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 4}}>
        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.palette')}</Text>
        <Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15, marginBottom: 10}}>{t('modal.paletteDesc')}</Text>
        <View style={{gap: 6, marginBottom: 10}}>
          {allPalettes.map(p => {
            const isActive = activePaletteId === p.id;
            const isBuiltIn = p.id.startsWith('__');
            return (
              <TouchableOpacity key={p.id} onPress={() => onSelectPalette(p.id)} activeOpacity={0.7}
                style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1,
                  backgroundColor: isActive ? `${p.accent}15` : T.surface, borderColor: isActive ? `${p.accent}50` : T.border}}>
                <View style={{flexDirection: 'row', gap: 3}}>
                  {[p.bg, p.accent, p.text, p.mid].map((c, i) => (<View key={i} style={{width: 16, height: 16, borderRadius: 4, backgroundColor: c, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)'}} />))}
                </View>
                <Text style={{flex: 1, fontSize: fs(13), color: isActive ? p.accent : T.text, fontWeight: isActive ? '600' : '400'}}>{p.name}</Text>
                {isActive && <Text style={{fontSize: fs(12), color: p.accent}}>✓</Text>}
                {!isBuiltIn && (
                  <View style={{flexDirection: 'row', gap: 8}}>
                    <TouchableOpacity onPress={() => startEditPalette(p)} activeOpacity={0.7}><Text style={{fontSize: fs(12), color: T.dim}}>✎</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => deletePalette(p.id)} activeOpacity={0.7}><Text style={{fontSize: fs(12), color: T.danger}}>✕</Text></TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        {canAdd && !editPalette && (
          <TouchableOpacity onPress={startNewPalette} activeOpacity={0.7} style={{alignItems: 'center', paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: T.border}}>
            <Text style={{fontSize: fs(12), color: T.dim}}>+ {t('modal.newPalette')}</Text>
          </TouchableOpacity>
        )}
        {editPalette && (
          <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12, marginTop: 6}}>
            <TextInput value={paletteName} onChangeText={setPaletteName} placeholder={t('modal.paletteName')} placeholderTextColor={T.muted}
              style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), marginBottom: 10}} />
            <View style={{flexDirection: 'row', gap: 8, marginBottom: 10}}>
              <HexField label={t('modal.palBg')} value={palBg} onChange={setPalBg} T={T} />
              <HexField label={t('modal.palAccent')} value={palAccent} onChange={setPalAccent} T={T} />
            </View>
            <View style={{flexDirection: 'row', gap: 8, marginBottom: 10}}>
              <HexField label={t('modal.palText')} value={palText} onChange={setPalText} T={T} />
              <HexField label={t('modal.palMid')} value={palMid} onChange={setPalMid} T={T} />
            </View>
            {isValidHex(normalizeHex(palBg)) && isValidHex(normalizeHex(palAccent)) && isValidHex(normalizeHex(palText)) && isValidHex(normalizeHex(palMid)) && (
              <View style={{flexDirection: 'row', gap: 3, marginBottom: 10, padding: 8, borderRadius: 8, backgroundColor: normalizeHex(palBg)}}>
                <View style={{flex: 1, height: 24, borderRadius: 4, backgroundColor: normalizeHex(palAccent), alignItems: 'center', justifyContent: 'center'}}>
                  <Text style={{fontSize: fs(10), fontWeight: '600', color: normalizeHex(palBg)}}>{t('modal.palPreviewAccent')}</Text>
                </View>
                <View style={{flex: 1, height: 24, borderRadius: 4, alignItems: 'center', justifyContent: 'center'}}>
                  <Text style={{fontSize: fs(10), fontWeight: '600', color: normalizeHex(palText)}}>{t('modal.palPreviewText')}</Text>
                </View>
                <View style={{flex: 1, height: 24, borderRadius: 4, backgroundColor: normalizeHex(palMid), alignItems: 'center', justifyContent: 'center'}}>
                  <Text style={{fontSize: fs(10), fontWeight: '600', color: normalizeHex(palBg)}}>{t('modal.palPreviewMid')}</Text>
                </View>
              </View>
            )}
            <View style={{flexDirection: 'row', gap: 8}}>
              <TouchableOpacity onPress={() => setEditPalette(null)} activeOpacity={0.7} style={{flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
                <Text style={{fontSize: fs(12), color: T.dim}}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={savePalette} activeOpacity={0.7} style={{flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
                <Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <Text style={{fontSize: fs(10), color: T.muted, marginTop: 6}}>{t('modal.paletteSlots', {used: userPalettes.length, max: 10})}</Text>
      </View>

      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}><Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600'}}>{t('modal.globalJournalPassword')}</Text><TouchableOpacity onPress={() => {setShowJournalPw(!showJournalPw); if (showJournalPw) setF((x: any) => ({...x, journalPassword: undefined}));}}><Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>{showJournalPw ? t('common.remove') : t('common.add')}</Text></TouchableOpacity></View>
        {showJournalPw && <TextInput value={f.journalPassword || ''} onChangeText={(v: string) => setF((x: any) => ({...x, journalPassword: v || undefined}))} placeholder={t('modal.lockJournal')} placeholderTextColor={T.muted} secureTextEntry style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(14)}} />}
      </View>
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
          <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600'}}>{t('modal.appLockPassword', {defaultValue: 'App Lock Password'})}</Text>
          <TouchableOpacity onPress={() => { setShowAppLockPw(!showAppLockPw); if (showAppLockPw) setAppLockPw(''); }}>
            <Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>{showAppLockPw ? t('common.remove') : t('common.add')}</Text>
          </TouchableOpacity>
        </View>
        {showAppLockPw && (
          <TextInput value={appLockPw} onChangeText={setAppLockPw} placeholder={t('modal.appLockPasswordPlaceholder', {defaultValue: 'Password to unlock the app'})} placeholderTextColor={T.muted} secureTextEntry
            style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(14)}} />
        )}
        <Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15, marginTop: 6}}>{t('modal.appLockPasswordDesc', {defaultValue: 'Tap the lock icon at the top of the app to lock. You\'ll be prompted for this password to unlock.'})}</Text>
      </View>
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}><View style={{flex: 1}}><Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('modal.gpsLocation')}</Text><Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15}}>{t('modal.gpsDesc')}</Text></View>
          <TouchableOpacity onPress={() => {const next = !settings?.gpsEnabled; onSaveSettings({...settings, locations: locs, customMoods: moods, gpsEnabled: next, language: selectedLang, notificationsEnabled: notifEnabled, filesEnabled, textScale, useDyslexicFont, frontCheckInterval, noteboardNotifications: noteboardNotifs});}} activeOpacity={0.8} style={{width: 40, height: 22, borderRadius: 11, backgroundColor: settings?.gpsEnabled ? T.accent : T.toggleOff, justifyContent: 'center', marginLeft: 12}}><View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', position: 'absolute', left: settings?.gpsEnabled ? 20 : 3}} /></TouchableOpacity></View>
      </View>
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}><View style={{flex: 1}}><Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('modal.fileAccess')}</Text><Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15}}>{t('modal.fileAccessDesc')}</Text></View>
          <TouchableOpacity onPress={() => setFilesEnabled(!filesEnabled)} activeOpacity={0.8} style={{width: 40, height: 22, borderRadius: 11, backgroundColor: filesEnabled ? T.accent : T.toggleOff, justifyContent: 'center', marginLeft: 12}}><View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', position: 'absolute', left: filesEnabled ? 20 : 3}} /></TouchableOpacity></View>
      </View>
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}><View style={{flex: 1}}><Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('modal.notifications')}</Text><Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15}}>{t('modal.notificationsDesc')}</Text></View>
          <TouchableOpacity onPress={() => setNotifEnabled(!notifEnabled)} activeOpacity={0.8} style={{width: 40, height: 22, borderRadius: 11, backgroundColor: notifEnabled ? T.accent : T.toggleOff, justifyContent: 'center', marginLeft: 12}}><View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', position: 'absolute', left: notifEnabled ? 20 : 3}} /></TouchableOpacity></View>

        <View style={{marginTop: 12}}>
          <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('notification.frontCheck')}</Text>
          <Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15, marginBottom: 8}}>{t('notification.frontCheckDesc')}</Text>
          <TouchableOpacity onPress={() => setShowFrontCheckPicker(!showFrontCheckPicker)} activeOpacity={0.7}
            style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: showFrontCheckPicker ? `${T.accent}60` : T.border}}>
            <Text style={{fontSize: fs(14), color: T.text}}>{frontCheckInterval === 0 ? t('common.close') : t('notification.everyNHours', {count: frontCheckInterval})}</Text>
            <Text style={{fontSize: fs(12), color: T.dim}}>{showFrontCheckPicker ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {showFrontCheckPicker && (
            <View style={{backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.border, marginTop: 4, overflow: 'hidden'}}>
              {[0, 1, 2, 3, 4, 6, 8, 12].map(hours => (
                <TouchableOpacity key={hours} onPress={() => {setFrontCheckInterval(hours); setShowFrontCheckPicker(false);}} activeOpacity={0.7}
                  style={{paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border,
                    backgroundColor: frontCheckInterval === hours ? `${T.accent}15` : 'transparent'}}>
                  <Text style={{fontSize: fs(14), color: frontCheckInterval === hours ? T.accent : T.text, fontWeight: frontCheckInterval === hours ? '600' : '400'}}>
                    {hours === 0 ? t('common.close') : t('notification.everyNHours', {count: hours})}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14}}>
          <View style={{flex: 1}}>
            <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('notification.noteboard', {defaultValue: 'Noteboard Notifications'})}</Text>
            <Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15}}>{t('notification.noteboardDesc', {defaultValue: 'Notify me when a new note is added to a member noteboard.'})}</Text>
          </View>
          <TouchableOpacity onPress={() => setNoteboardNotifs(!noteboardNotifs)} activeOpacity={0.8} style={{width: 40, height: 22, borderRadius: 11, backgroundColor: noteboardNotifs ? T.accent : T.toggleOff, justifyContent: 'center', marginLeft: 12}}><View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', position: 'absolute', left: noteboardNotifs ? 20 : 3}} /></TouchableOpacity>
        </View>
      </View>
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
        <View style={{marginBottom: 8}}><Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('modal.language')}</Text><Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15}}>{t('modal.languageDesc')}</Text></View>
        <TouchableOpacity onPress={() => setShowLangPicker(!showLangPicker)} activeOpacity={0.7}
          style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: showLangPicker ? `${T.accent}60` : T.border}}>
          <Text style={{fontSize: fs(14), color: T.text}}>{t(`language.${selectedLang}`)}</Text>
          <Text style={{fontSize: fs(12), color: T.dim}}>{showLangPicker ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {showLangPicker && (
          <View style={{backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.border, marginTop: 4, overflow: 'hidden'}}>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <TouchableOpacity key={lang} onPress={() => {setSelectedLang(lang); setShowLangPicker(false);}} activeOpacity={0.7}
                style={{paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border,
                  backgroundColor: selectedLang === lang ? `${T.accent}15` : 'transparent'}}>
                <Text style={{fontSize: fs(14), color: selectedLang === lang ? T.accent : T.text, fontWeight: selectedLang === lang ? '600' : '400'}}>{t(`language.${lang}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
        <View style={{marginBottom: 8}}><Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('modal.textSize')}</Text><Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15}}>{t('modal.textSizeDesc')}</Text></View>
        <View style={{flexDirection: 'row', gap: 7}}>{TEXT_SCALE_OPTIONS.map((opt) => (
          <TouchableOpacity key={opt.value} onPress={() => setTextScale(opt.value)} activeOpacity={0.7}
            style={{flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center',
              backgroundColor: textScale === opt.value ? `${T.accent}20` : T.surface, borderColor: textScale === opt.value ? `${T.accent}60` : T.border}}>
            <Text style={{fontSize: fs(13), color: textScale === opt.value ? T.accent : T.dim, fontWeight: textScale === opt.value ? '600' : '400'}}>{t(`modal.textScale${opt.label.replace(/\s/g, '')}`)}</Text>
          </TouchableOpacity>
        ))}</View>
      </View>
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12}}>
        <View style={{flex: 1}}>
          <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>
            {t('modal.dyslexicFont', {defaultValue: 'Dyslexia-Friendly Font'})}
          </Text>
          <Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15}}>
            {t('modal.dyslexicFontDesc', {defaultValue: 'Renders all text in OpenDyslexic. On by default.'})}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setUseDyslexicFont(v => !v)} activeOpacity={0.7}
          style={{width: 44, height: 26, borderRadius: 13, padding: 2, justifyContent: 'center', backgroundColor: useDyslexicFont ? T.accent : T.surface, borderWidth: 1, borderColor: useDyslexicFont ? T.accent : T.border}}>
          <View style={{width: 20, height: 20, borderRadius: 10, backgroundColor: useDyslexicFont ? T.bg : T.dim, marginLeft: useDyslexicFont ? 18 : 0}} />
        </TouchableOpacity>
      </View>
      {[[t('modal.locations'), locs, setLocs, newLocation, setNewLocation, addLoc, t('modal.addLocationPlaceholder')], [t('modal.customMoods'), moods, setMoods, newMood, setNewMood, addMood, t('modal.addMoodPlaceholder')]].map(([label, items, setItems, val, setVal, add, placeholder]: any) => (
        <View key={label} style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
          <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{label}</Text>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 8}}>{items.map((l: string) => (<TouchableOpacity key={l} onPress={() => setItems(items.filter((x: string) => x !== l))} activeOpacity={0.7} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface}}><Text style={{fontSize: fs(12), color: T.dim}}>{l}</Text><Text style={{fontSize: fs(10), color: T.danger}}>✕</Text></TouchableOpacity>))}</View>
          <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}><TextInput value={val} onChangeText={setVal} placeholder={placeholder} placeholderTextColor={T.muted} style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13)}} onSubmitEditing={add} returnKeyType="done" /><Btn T={T} onPress={add} style={{paddingHorizontal: 12, paddingVertical: 9}}>{t('common.add')}</Btn></View>
        </View>))}
    </Sheet>
  );
};
