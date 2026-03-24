// src/modals/index.tsx
import React, {useState, useMemo} from 'react';
import {View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView, Image, Linking} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Sheet} from '../components/Sheet';
import {PALETTE} from '../theme';
import {Member, MemberGroup, JournalEntry, FrontState, FrontTier, FrontTierKey, SystemInfo, AppSettings, uid, isValidHex, normalizeHex, DEFAULT_MOODS, EMPTY_TIER, TIER_LABELS} from '../utils';
import {SUPPORTED_LANGUAGES} from '../i18n/i18n';
import type {SupportedLanguage} from '../i18n/i18n';

const getInitials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
const IMAGE_URL_RE = /https?:\/\/\S+\.(?:gif|png|jpe?g|webp)(?:\?\S*)?/gi;

const RichDescription = ({text, T}: {text: string; T: any}) => {
  if (!text) return null;
  const parts: {type: 'text' | 'image'; value: string}[] = [];
  let last = 0;
  const matches = [...text.matchAll(IMAGE_URL_RE)];
  if (matches.length === 0) return <Text style={{fontSize: 13, color: T.dim, lineHeight: 20}}>{text}</Text>;
  for (const match of matches) { const idx = match.index ?? 0; if (idx > last) parts.push({type: 'text', value: text.slice(last, idx).trim()}); parts.push({type: 'image', value: match[0]}); last = idx + match[0].length; }
  if (last < text.length) parts.push({type: 'text', value: text.slice(last).trim()});
  return (<View style={{gap: 8}}>{parts.map((p, i) => p.type === 'image' ? <Image key={i} source={{uri: p.value}} style={{width: '100%', height: 200, borderRadius: 8}} resizeMode="contain" /> : p.value ? <Text key={i} style={{fontSize: 13, color: T.dim, lineHeight: 20}}>{p.value}</Text> : null)}</View>);
};

const Btn = ({children, onPress, variant = 'primary', disabled = false, style = {}, T}: any) => {
  const variants: any = {primary: {bg: T.accentBg, color: T.accent, border: `${T.accent}40`}, ghost: {bg: 'transparent', color: T.dim, border: T.border}, danger: {bg: T.dangerBg, color: T.danger, border: `${T.danger}40`}, solid: {bg: T.accent, color: '#0a0508', border: T.accent}, info: {bg: T.infoBg, color: T.info, border: `${T.info}40`}};
  const v = variants[variant] || variants.primary;
  return (<TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.7} style={[{paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: v.bg, borderColor: v.border, opacity: disabled ? 0.5 : 1}, style]}><Text style={{fontSize: 14, fontWeight: '500', color: v.color}}>{children}</Text></TouchableOpacity>);
};

const Field = ({label, value, onChange, placeholder, multiline = false, numberOfLines = 4, T}: any) => (
  <View style={{marginBottom: 14}}>
    {label && <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 5, fontWeight: '600'}}>{label}</Text>}
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={T.muted} multiline={multiline} numberOfLines={multiline ? numberOfLines : 1}
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

// ── Searchable Chip Picker (used per-tier in SetFrontModal) ───────────────

const TierMemberPicker = ({tierKey, selected, setSelected, members, groups, allAssigned, T, t}: {
  tierKey: FrontTierKey; selected: Set<string>; setSelected: (s: Set<string>) => void;
  members: Member[]; groups: MemberGroup[]; allAssigned: Record<string, FrontTierKey>; T: any; t: any;
}) => {
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const allTags = useMemo(() => [...new Set(members.flatMap(m => m.tags || []))].sort(), [members]);

  const filtered = useMemo(() => {
    return members.filter(m => {
      if (selected.has(m.id)) return false; // already selected, shown as chips
      const nameMatch = !search || m.name.toLowerCase().includes(search.toLowerCase());
      const tagMatch = !filterTag || (m.tags || []).includes(filterTag);
      return nameMatch && tagMatch;
    });
  }, [members, search, filterTag, selected]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    setSelected(next);
  };

  const selectedMembers = members.filter(m => selected.has(m.id));

  return (
    <View style={{marginBottom: 10}}>
      {/* Selected chips */}
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

      {/* Tag filter chips */}
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

      {/* Search input */}
      <TextInput value={search} onChangeText={setSearch} placeholder={t('members.searchToAdd')} placeholderTextColor={T.muted}
        style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, marginBottom: 6}} />

      {/* Filtered member list (compact) */}
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

      {/* Hint when no search */}
      {!search && !filterTag && members.length > 0 && selectedMembers.length === 0 && (
        <Text style={{fontSize: 11, color: T.muted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 6}}>{t('members.searchHint')}</Text>
      )}
    </View>
  );
};

// ── Set Front Modal (three-tier, searchable chip picker) ──────────────────

export const SetFrontModal = ({visible, theme: T, members, groups, current, settings, lastKnownLocation, onSave, onClose}: any) => {
  const {t} = useTranslation();
  const [primaryIds, setPrimaryIds] = useState<Set<string>>(new Set());
  const [coFrontIds, setCoFrontIds] = useState<Set<string>>(new Set());
  const [coConsciousIds, setCoConsciousIds] = useState<Set<string>>(new Set());
  const [primaryMood, setPrimaryMood] = useState(''); const [primaryCustomMood, setPrimaryCustomMood] = useState(''); const [primaryShowCustom, setPrimaryShowCustom] = useState(false);
  const [primaryLocation, setPrimaryLocation] = useState(''); const [primaryNote, setPrimaryNote] = useState('');
  const [coFrontMood, setCoFrontMood] = useState(''); const [coFrontCustomMood, setCoFrontCustomMood] = useState(''); const [coFrontShowCustom, setCoFrontShowCustom] = useState(false); const [coFrontNote, setCoFrontNote] = useState('');
  const [coConsciousMood, setCoConsciousMood] = useState(''); const [coConsciousCustomMood, setCoConsciousCustomMood] = useState(''); const [coConsciousShowCustom, setCoConsciousShowCustom] = useState(false); const [coConsciousNote, setCoConsciousNote] = useState('');

  React.useEffect(() => {
    if (visible) {
      const c: FrontState | null = current;
      setPrimaryIds(new Set(c?.primary?.memberIds || [])); setCoFrontIds(new Set(c?.coFront?.memberIds || [])); setCoConsciousIds(new Set(c?.coConscious?.memberIds || []));
      setPrimaryMood(c?.primary?.mood || ''); setPrimaryCustomMood(''); setPrimaryShowCustom(false); setPrimaryLocation(c?.primary?.location || lastKnownLocation || ''); setPrimaryNote(c?.primary?.note || '');
      setCoFrontMood(c?.coFront?.mood || ''); setCoFrontCustomMood(''); setCoFrontShowCustom(false); setCoFrontNote(c?.coFront?.note || '');
      setCoConsciousMood(c?.coConscious?.mood || ''); setCoConsciousCustomMood(''); setCoConsciousShowCustom(false); setCoConsciousNote(c?.coConscious?.note || '');
    }
  }, [visible, current, lastKnownLocation]);

  const allMoods = [...DEFAULT_MOODS, ...(settings?.customMoods || [])];
  const allLocations = settings?.locations || [];

  // Build assignment map for exclusivity display
  const allAssigned = useMemo(() => {
    const map: Record<string, FrontTierKey> = {};
    primaryIds.forEach(id => { map[id] = 'primary'; });
    coFrontIds.forEach(id => { map[id] = 'coFront'; });
    coConsciousIds.forEach(id => { map[id] = 'coConscious'; });
    return map;
  }, [primaryIds, coFrontIds, coConsciousIds]);

  // Exclusive setter: remove from other tiers when adding to one
  const makeExclusiveSetter = (tier: FrontTierKey, setter: (s: Set<string>) => void) => (newSet: Set<string>) => {
    const setters: Record<FrontTierKey, (s: Set<string>) => void> = {primary: setPrimaryIds, coFront: setCoFrontIds, coConscious: setCoConsciousIds};
    const sets: Record<FrontTierKey, Set<string>> = {primary: primaryIds, coFront: coFrontIds, coConscious: coConsciousIds};
    // Find newly added ids
    const added = [...newSet].filter(id => !sets[tier].has(id));
    // Remove added ids from other tiers
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

  const resolveMood = (mood: string, customMood: string, showCustom: boolean) => showCustom ? customMood || undefined : mood || undefined;

  const handleSave = () => {
    onSave({memberIds: [...primaryIds], mood: resolveMood(primaryMood, primaryCustomMood, primaryShowCustom), note: primaryNote, location: primaryLocation || undefined},
      {memberIds: [...coFrontIds], mood: resolveMood(coFrontMood, coFrontCustomMood, coFrontShowCustom), note: coFrontNote},
      {memberIds: [...coConsciousIds], mood: resolveMood(coConsciousMood, coConsciousCustomMood, coConsciousShowCustom), note: coConsciousNote});
    onClose();
  };

  const MoodPicker = ({mood, setMood, customMood, setCustomMood, showCustom, setShowCustom}: any) => (
    <>
      <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('modal.mood')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 4}}>
        <View style={{flexDirection: 'row', gap: 5}}>
          {allMoods.map((m: string) => (
            <TouchableOpacity key={m} onPress={() => {setMood(m); setShowCustom(false);}} activeOpacity={0.7}
              style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, backgroundColor: mood === m && !showCustom ? `${T.accent}20` : T.surface, borderColor: mood === m && !showCustom ? `${T.accent}60` : T.border}}>
              <Text style={{fontSize: 11, color: mood === m && !showCustom ? T.accent : T.dim, fontWeight: mood === m && !showCustom ? '600' : '400'}}>{m}</Text>
            </TouchableOpacity>))}
          <TouchableOpacity onPress={() => {setShowCustom(true); setMood('');}} activeOpacity={0.7}
            style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, backgroundColor: showCustom ? `${T.accent}20` : T.surface, borderColor: showCustom ? `${T.accent}60` : T.border}}>
            <Text style={{fontSize: 11, color: showCustom ? T.accent : T.dim}}>{t('modal.custom')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      {showCustom && <TextInput value={customMood} onChangeText={setCustomMood} placeholder={t('modal.enterMood')} placeholderTextColor={T.muted}
        style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, marginTop: 4}} />}
    </>
  );

  return (
    <Sheet visible={visible} title={t('modal.updateFront')} theme={T} onClose={onClose} footer={<><Btn variant="ghost" T={T} onPress={() => {onSave(EMPTY_TIER, EMPTY_TIER, EMPTY_TIER); onClose();}}>{t('common.clear')}</Btn><Btn T={T} onPress={handleSave}>{t('common.save')}</Btn></>}>
      {/* Primary */}
      <SectionDivider label={t('tier.primaryFront')} color={T.accent} T={T} />
      <TierMemberPicker tierKey="primary" selected={primaryIds} setSelected={makeExclusiveSetter('primary', setPrimaryIds)} members={members} groups={groups} allAssigned={allAssigned} T={T} t={t} />
      <MoodPicker mood={primaryMood} setMood={setPrimaryMood} customMood={primaryCustomMood} setCustomMood={setPrimaryCustomMood} showCustom={primaryShowCustom} setShowCustom={setPrimaryShowCustom} />
      <View style={{height: 10}} />
      <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('modal.location')}</Text>
      {allLocations.length > 0 && (<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 4}}><View style={{flexDirection: 'row', gap: 5}}>
        {allLocations.map((l: string) => (<TouchableOpacity key={l} onPress={() => setPrimaryLocation(primaryLocation === l ? '' : l)} activeOpacity={0.7} style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, backgroundColor: primaryLocation === l ? `${T.accent}20` : T.surface, borderColor: primaryLocation === l ? `${T.accent}60` : T.border}}><Text style={{fontSize: 11, color: primaryLocation === l ? T.accent : T.dim, fontWeight: primaryLocation === l ? '600' : '400'}}>{l}</Text></TouchableOpacity>))}
      </View></ScrollView>)}
      <TextInput value={primaryLocation} onChangeText={setPrimaryLocation} placeholder={t('modal.typeLocation')} placeholderTextColor={T.muted} style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, marginTop: 4}} />
      <View style={{height: 8}} />
      <Field label={t('modal.noteOptional')} value={primaryNote} onChange={setPrimaryNote} placeholder={t('modal.whatHappening')} multiline numberOfLines={2} T={T} />

      {/* Co-Front */}
      <SectionDivider label={t('tier.coFront')} color={T.info} T={T} />
      <TierMemberPicker tierKey="coFront" selected={coFrontIds} setSelected={makeExclusiveSetter('coFront', setCoFrontIds)} members={members} groups={groups} allAssigned={allAssigned} T={T} t={t} />
      <MoodPicker mood={coFrontMood} setMood={setCoFrontMood} customMood={coFrontCustomMood} setCustomMood={setCoFrontCustomMood} showCustom={coFrontShowCustom} setShowCustom={setCoFrontShowCustom} />
      <View style={{height: 8}} />
      <Field label={t('modal.noteOptional')} value={coFrontNote} onChange={setCoFrontNote} placeholder={t('modal.whatHappening')} multiline numberOfLines={2} T={T} />

      {/* Co-Conscious */}
      <SectionDivider label={t('tier.coConscious')} color={T.success} T={T} />
      <TierMemberPicker tierKey="coConscious" selected={coConsciousIds} setSelected={makeExclusiveSetter('coConscious', setCoConsciousIds)} members={members} groups={groups} allAssigned={allAssigned} T={T} t={t} />
      <MoodPicker mood={coConsciousMood} setMood={setCoConsciousMood} customMood={coConsciousCustomMood} setCustomMood={setCoConsciousCustomMood} showCustom={coConsciousShowCustom} setShowCustom={setCoConsciousShowCustom} />
      <View style={{height: 8}} />
      <Field label={t('modal.noteOptional')} value={coConsciousNote} onChange={setCoConsciousNote} placeholder={t('modal.whatHappening')} multiline numberOfLines={2} T={T} />
    </Sheet>
  );
};

// ── Edit Front Detail Modal (tier-aware, unchanged) ───────────────────────

export const EditFrontDetailModal = ({visible, theme: T, front, tier, settings, lastKnownLocation, onSave, onClose}: any) => {
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
      footer={<Btn T={T} onPress={() => {onSave(showCustomMood ? customMood || undefined : mood || undefined, isPrimary ? location || undefined : undefined, note || undefined); onClose();}}>{t('common.save')}</Btn>}>
      <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.mood')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 6}}><View style={{flexDirection: 'row', gap: 6}}>
        {allMoods.map((m: string) => (<TouchableOpacity key={m} onPress={() => {setMood(m); setShowCustomMood(false);}} activeOpacity={0.7} style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, backgroundColor: mood === m && !showCustomMood ? `${T.accent}20` : T.surface, borderColor: mood === m && !showCustomMood ? `${T.accent}60` : T.border}}><Text style={{fontSize: 12, color: mood === m && !showCustomMood ? T.accent : T.dim}}>{m}</Text></TouchableOpacity>))}
        <TouchableOpacity onPress={() => {setShowCustomMood(true); setMood('');}} activeOpacity={0.7} style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, backgroundColor: showCustomMood ? `${T.accent}20` : T.surface, borderColor: showCustomMood ? `${T.accent}60` : T.border}}><Text style={{fontSize: 12, color: showCustomMood ? T.accent : T.dim}}>{t('modal.custom')}</Text></TouchableOpacity>
      </View></ScrollView>
      {showCustomMood && <TextInput value={customMood} onChangeText={setCustomMood} placeholder={t('modal.enterMood')} placeholderTextColor={T.muted} style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, marginTop: 6}} />}
      {isPrimary && (<><View style={{height: 12}} /><Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.location')}</Text>
        {allLocations.length > 0 && (<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 6}}><View style={{flexDirection: 'row', gap: 6}}>{allLocations.map((l: string) => (<TouchableOpacity key={l} onPress={() => setLocation(location === l ? '' : l)} activeOpacity={0.7} style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, backgroundColor: location === l ? `${T.accent}20` : T.surface, borderColor: location === l ? `${T.accent}60` : T.border}}><Text style={{fontSize: 12, color: location === l ? T.accent : T.dim}}>{l}</Text></TouchableOpacity>))}</View></ScrollView>)}
        <TextInput value={location} onChangeText={setLocation} placeholder={t('modal.typeLocation')} placeholderTextColor={T.muted} style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, marginTop: 6}} /></>)}
      <View style={{height: 12}} />
      <Field label={t('modal.note')} value={note} onChange={setNote} placeholder={t('modal.whatHappening')} multiline numberOfLines={3} T={T} />
    </Sheet>
  );
};

// ── Member Modal (with tags + group selection) ────────────────────────────

export const MemberModal = ({visible, theme: T, member, groups, onSave, onDelete, onClose}: any) => {
  const {t} = useTranslation();
  const isNew = !member;
  const [f, setF] = useState<Member>(member || {id: uid(), name: '', pronouns: '', role: '', color: PALETTE[0], description: '', tags: [], groupIds: []});
  const [hexInput, setHexInput] = useState(member?.color || PALETTE[0]); const [hexError, setHexError] = useState(false); const [confirmDel, setConfirmDel] = useState(false);
  const [tagInput, setTagInput] = useState('');

  React.useEffect(() => { if (visible) { const fresh = member || {id: uid(), name: '', pronouns: '', role: '', color: PALETTE[0], description: '', tags: [], groupIds: []}; setF({...fresh, tags: fresh.tags || [], groupIds: fresh.groupIds || []}); setHexInput(fresh.color); setHexError(false); setConfirmDel(false); setTagInput(''); } }, [visible, member]);
  const set = (k: keyof Member, v: any) => setF(x => ({...x, [k]: v}));
  const handleHexChange = (val: string) => { setHexInput(val); const n = normalizeHex(val); if (isValidHex(n)) {set('color', n); setHexError(false);} else setHexError(val.length > 1); };

  const addTag = () => { const raw = tagInput.trim().replace(/^#/, '').toLowerCase(); if (!raw) return; const cur = f.tags || []; if (!cur.includes(`#${raw}`)) set('tags', [...cur, `#${raw}`]); setTagInput(''); };
  const togGroup = (gid: string) => { const cur = f.groupIds || []; set('groupIds', cur.includes(gid) ? cur.filter(id => id !== gid) : [...cur, gid]); };

  return (
    <Sheet visible={visible} title={isNew ? t('modal.addMember') : t('modal.editMember')} theme={T} onClose={onClose} footer={<>
      {!isNew && !confirmDel && <Btn variant="danger" T={T} onPress={() => setConfirmDel(true)}>{t('common.delete')}</Btn>}
      {confirmDel && (<><Btn variant="danger" T={T} onPress={() => {onDelete(member.id); onClose();}}>{t('modal.confirmDelete')}</Btn><Btn variant="ghost" T={T} onPress={() => setConfirmDel(false)}>{t('common.cancel')}</Btn></>)}
      {!confirmDel && <Btn T={T} onPress={() => {if (f.name.trim()) {onSave(f); onClose();}}}>{t('common.save')}</Btn>}</>}>
      <Field label={t('modal.name')} value={f.name} onChange={(v: string) => set('name', v)} placeholder={t('modal.headmateName')} T={T} />
      <Field label={t('modal.pronouns')} value={f.pronouns} onChange={(v: string) => set('pronouns', v)} placeholder={t('modal.pronounsPlaceholder')} T={T} />
      <Field label={t('modal.role')} value={f.role} onChange={(v: string) => set('role', v)} placeholder={t('modal.rolePlaceholder')} T={T} />

      {/* Color */}
      <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.color')}</Text>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10}}>
        <View style={{width: 36, height: 36, borderRadius: 18, backgroundColor: f.color, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)'}} />
        <TextInput value={hexInput} onChangeText={handleHexChange} placeholder="#C9A96E" placeholderTextColor={T.muted} maxLength={7} autoCapitalize="characters"
          style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: hexError ? T.danger : T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, fontFamily: 'monospace'}} />
      </View>
      {hexError && <Text style={{fontSize: 11, color: T.danger, marginBottom: 8}}>{t('modal.invalidHex')}</Text>}
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14}}>{PALETTE.map((c: string) => (<TouchableOpacity key={c} onPress={() => {set('color', c); setHexInput(c); setHexError(false);}} activeOpacity={0.8} style={{width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: 2, borderColor: f.color === c ? '#fff' : 'transparent'}} />))}</View>

      {/* Groups */}
      {(groups || []).length > 0 && (
        <>
          <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('memberGroups.title')}</Text>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14}}>
            {(groups || []).map((g: MemberGroup) => {
              const active = (f.groupIds || []).includes(g.id);
              return (
                <TouchableOpacity key={g.id} onPress={() => togGroup(g.id)} activeOpacity={0.7}
                  style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
                    backgroundColor: active ? `${g.color || T.accent}20` : T.surface, borderColor: active ? `${g.color || T.accent}50` : T.border}}>
                  <View style={{width: 7, height: 7, borderRadius: 3.5, backgroundColor: g.color || T.accent}} />
                  <Text style={{fontSize: 12, color: active ? (g.color || T.accent) : T.dim}}>{g.name}</Text>
                  {active && <Text style={{fontSize: 11, fontWeight: '700', color: g.color || T.accent}}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* Tags */}
      <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.memberTags')}</Text>
      {(f.tags || []).length > 0 && (
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8}}>
          {(f.tags || []).map((tag: string) => (
            <TouchableOpacity key={tag} onPress={() => set('tags', (f.tags || []).filter(x => x !== tag))} activeOpacity={0.7}
              style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: `${T.info}18`, borderWidth: 1, borderColor: `${T.info}40`}}>
              <Text style={{fontSize: 12, color: T.info}}>{tag}</Text><Text style={{fontSize: 10, color: T.danger}}>✕</Text>
            </TouchableOpacity>))}
        </View>
      )}
      <View style={{flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 14}}>
        <TextInput value={tagInput} onChangeText={setTagInput} placeholder={t('modal.memberTagPlaceholder')} placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false}
          style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13}} onSubmitEditing={addTag} returnKeyType="done" />
        <Btn T={T} onPress={addTag} style={{paddingHorizontal: 12, paddingVertical: 9}}>{t('common.add')}</Btn>
      </View>

      <Field label={t('modal.descriptionBio')} value={f.description} onChange={(v: string) => set('description', v)} placeholder={t('modal.descriptionPlaceholder')} multiline numberOfLines={4} T={T} />
      {f.description ? (<View style={{marginBottom: 14}}><Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.preview')}</Text><View style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12}}><RichDescription text={f.description} T={T} /></View></View>) : null}
    </Sheet>
  );
};

// ── Journal Modal (unchanged from v1.1) ───────────────────────────────────

export const JournalModal = ({visible, theme: T, entry, members, onSave, onClose}: any) => {
  const {t} = useTranslation();
  const isNew = !entry;
  const [f, setF] = useState<JournalEntry>(entry || {id: uid(), title: '', body: '', authorIds: [], hashtags: [], timestamp: Date.now()});
  const [showPwField, setShowPwField] = useState(false); const [tagInput, setTagInput] = useState('');
  React.useEffect(() => { if (visible) { const fresh = entry || {id: uid(), title: '', body: '', authorIds: [], hashtags: [], timestamp: Date.now()}; setF(fresh); setShowPwField(!!fresh.password); setTagInput(''); } }, [visible, entry]);
  const set = (k: keyof JournalEntry, v: any) => setF(x => ({...x, [k]: v}));
  const togAuthor = (id: string) => set('authorIds', (f.authorIds || []).includes(id) ? (f.authorIds || []).filter((i: string) => i !== id) : [...(f.authorIds || []), id]);
  const addTag = () => { const raw = tagInput.trim().replace(/^#/, '').toLowerCase(); if (!raw) return; const cur = f.hashtags || []; if (!cur.includes(`#${raw}`)) set('hashtags', [...cur, `#${raw}`]); setTagInput(''); };

  return (
    <Sheet visible={visible} title={isNew ? t('modal.newEntry') : t('modal.editEntry')} theme={T} onClose={onClose} footer={<Btn T={T} onPress={() => {onSave({...f, timestamp: isNew ? Date.now() : f.timestamp, password: showPwField && f.password ? f.password : undefined}); onClose();}}>{t('common.save')}</Btn>}>
      <Field label={t('modal.entryTitle')} value={f.title} onChange={(v: string) => set('title', v)} placeholder={t('modal.entryTitlePlaceholder')} T={T} />
      <Field label={t('modal.body')} value={f.body} onChange={(v: string) => set('body', v)} placeholder={t('modal.writeHere')} multiline numberOfLines={6} T={T} />
      <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.tags')}</Text>
      {(f.hashtags || []).length > 0 && (<View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8}}>{(f.hashtags || []).map((tag: string) => (<TouchableOpacity key={tag} onPress={() => set('hashtags', (f.hashtags || []).filter((x: string) => x !== tag))} activeOpacity={0.7} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: `${T.info}18`, borderWidth: 1, borderColor: `${T.info}40`}}><Text style={{fontSize: 12, color: T.info}}>{tag}</Text><Text style={{fontSize: 10, color: T.danger}}>✕</Text></TouchableOpacity>))}</View>)}
      <View style={{flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 14}}>
        <TextInput value={tagInput} onChangeText={setTagInput} placeholder={t('modal.topic')} placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false} style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13}} onSubmitEditing={addTag} returnKeyType="done" />
        <Btn T={T} onPress={addTag} style={{paddingHorizontal: 12, paddingVertical: 9}}>{t('common.add')}</Btn>
      </View>
      {members.length > 0 && (<><Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.authors')}</Text>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14}}>{members.map((m: Member) => { const active = (f.authorIds || []).includes(m.id); return (<TouchableOpacity key={m.id} onPress={() => togAuthor(m.id)} activeOpacity={0.7} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, backgroundColor: active ? `${m.color}20` : T.surface, borderColor: active ? `${m.color}50` : T.border}}><View style={{width: 7, height: 7, borderRadius: 3.5, backgroundColor: m.color}} /><Text style={{fontSize: 12, color: active ? m.color : T.dim}}>{m.name}</Text>{active && <Text style={{fontSize: 11, fontWeight: '700', color: m.color}}>✓</Text>}</TouchableOpacity>); })}</View></>)}
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14}}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}><Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600'}}>{t('modal.entryPassword')}</Text><TouchableOpacity onPress={() => {setShowPwField(!showPwField); if (showPwField) set('password', undefined);}}><Text style={{fontSize: 12, color: T.accent, fontWeight: '600'}}>{showPwField ? t('common.remove') : t('common.add')}</Text></TouchableOpacity></View>
        {showPwField && <TextInput value={f.password || ''} onChangeText={(v: string) => set('password', v || undefined)} placeholder={t('modal.entryPasswordPlaceholder')} placeholderTextColor={T.muted} secureTextEntry style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14}} />}
      </View>
    </Sheet>
  );
};

// ── System Modal (with language picker + notifications toggle) ─────────────

export const SystemModal = ({visible, theme: T, system, settings, onSave, onSaveSettings, onClose}: any) => {
  const {t} = useTranslation();
  const [f, setF] = useState({...system}); const [showJournalPw, setShowJournalPw] = useState(!!system.journalPassword);
  const [newLocation, setNewLocation] = useState(''); const [newMood, setNewMood] = useState('');
  const [locs, setLocs] = useState<string[]>(settings?.locations || []); const [moods, setMoods] = useState<string[]>(settings?.customMoods || []);
  const [selectedLang, setSelectedLang] = useState<SupportedLanguage>(settings?.language || 'en');
  const [notifEnabled, setNotifEnabled] = useState<boolean>(settings?.notificationsEnabled ?? true);

  React.useEffect(() => { if (visible) { setF({...system}); setShowJournalPw(!!system.journalPassword); setLocs(settings?.locations || []); setMoods(settings?.customMoods || []); setNewLocation(''); setNewMood(''); setSelectedLang(settings?.language || 'en'); setNotifEnabled(settings?.notificationsEnabled ?? true); } }, [visible, system, settings]);

  const addLoc = () => {if (newLocation.trim() && !locs.includes(newLocation.trim())) {setLocs([...locs, newLocation.trim()]); setNewLocation('');}};
  const addMood = () => {if (newMood.trim() && !moods.includes(newMood.trim())) {setMoods([...moods, newMood.trim()]); setNewMood('');}};

  return (
    <Sheet visible={visible} title={t('modal.systemSettings')} theme={T} onClose={onClose} footer={<Btn T={T} onPress={() => {
      onSave({...f, journalPassword: showJournalPw && f.journalPassword ? f.journalPassword : undefined});
      onSaveSettings({...settings, locations: locs, customMoods: moods, language: selectedLang, notificationsEnabled: notifEnabled});
      onClose();
    }}>{t('common.save')}</Btn>}>
      <Field label={t('modal.systemName')} value={f.name} onChange={(v: string) => setF((x: any) => ({...x, name: v}))} placeholder={t('modal.systemNamePlaceholder')} T={T} />
      <Field label={t('modal.descriptionLabel')} value={f.description} onChange={(v: string) => setF((x: any) => ({...x, description: v}))} placeholder={t('modal.descriptionFieldPlaceholder')} multiline numberOfLines={3} T={T} />
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 4}}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}><Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600'}}>{t('modal.globalJournalPassword')}</Text><TouchableOpacity onPress={() => {setShowJournalPw(!showJournalPw); if (showJournalPw) setF((x: any) => ({...x, journalPassword: undefined}));}}><Text style={{fontSize: 12, color: T.accent, fontWeight: '600'}}>{showJournalPw ? t('common.remove') : t('common.add')}</Text></TouchableOpacity></View>
        {showJournalPw && <TextInput value={f.journalPassword || ''} onChangeText={(v: string) => setF((x: any) => ({...x, journalPassword: v || undefined}))} placeholder={t('modal.lockJournal')} placeholderTextColor={T.muted} secureTextEntry style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14}} />}
      </View>
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}><View style={{flex: 1}}><Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('modal.gpsLocation')}</Text><Text style={{fontSize: 11, color: T.muted, lineHeight: 15}}>{t('modal.gpsDesc')}</Text></View>
          <TouchableOpacity onPress={() => {const next = !settings?.gpsEnabled; onSaveSettings({...settings, locations: locs, customMoods: moods, gpsEnabled: next, language: selectedLang, notificationsEnabled: notifEnabled});}} activeOpacity={0.8} style={{width: 40, height: 22, borderRadius: 11, backgroundColor: settings?.gpsEnabled ? T.accent : T.muted, justifyContent: 'center', marginLeft: 12}}><View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', position: 'absolute', left: settings?.gpsEnabled ? 20 : 3}} /></TouchableOpacity></View>
      </View>
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}><View style={{flex: 1}}><Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('modal.notifications')}</Text><Text style={{fontSize: 11, color: T.muted, lineHeight: 15}}>{t('modal.notificationsDesc')}</Text></View>
          <TouchableOpacity onPress={() => setNotifEnabled(!notifEnabled)} activeOpacity={0.8} style={{width: 40, height: 22, borderRadius: 11, backgroundColor: notifEnabled ? T.accent : T.muted, justifyContent: 'center', marginLeft: 12}}><View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', position: 'absolute', left: notifEnabled ? 20 : 3}} /></TouchableOpacity></View>
      </View>
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
        <View style={{marginBottom: 8}}><Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('modal.language')}</Text><Text style={{fontSize: 11, color: T.muted, lineHeight: 15}}>{t('modal.languageDesc')}</Text></View>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 7}}>{SUPPORTED_LANGUAGES.map((lang) => (<TouchableOpacity key={lang} onPress={() => setSelectedLang(lang)} activeOpacity={0.7} style={{paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: selectedLang === lang ? `${T.accent}20` : T.surface, borderColor: selectedLang === lang ? `${T.accent}60` : T.border}}><Text style={{fontSize: 13, color: selectedLang === lang ? T.accent : T.dim, fontWeight: selectedLang === lang ? '600' : '400'}}>{t(`language.${lang}`)}</Text></TouchableOpacity>))}</View>
      </View>
      {[[t('modal.locations'), locs, setLocs, newLocation, setNewLocation, addLoc, t('modal.addLocationPlaceholder')], [t('modal.customMoods'), moods, setMoods, newMood, setNewMood, addMood, t('modal.addMoodPlaceholder')]].map(([label, items, setItems, val, setVal, add, placeholder]: any) => (
        <View key={label} style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
          <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{label}</Text>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 8}}>{items.map((l: string) => (<TouchableOpacity key={l} onPress={() => setItems(items.filter((x: string) => x !== l))} activeOpacity={0.7} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface}}><Text style={{fontSize: 12, color: T.dim}}>{l}</Text><Text style={{fontSize: 10, color: T.danger}}>✕</Text></TouchableOpacity>))}</View>
          <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}><TextInput value={val} onChangeText={setVal} placeholder={placeholder} placeholderTextColor={T.muted} style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13}} onSubmitEditing={add} returnKeyType="done" /><Btn T={T} onPress={add} style={{paddingHorizontal: 12, paddingVertical: 9}}>{t('common.add')}</Btn></View>
        </View>))}
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14, alignItems: 'center'}}>
        <TouchableOpacity onPress={() => Linking.openURL('https://www.buymeacoffee.com/PluralSpace')} activeOpacity={0.8} style={{paddingVertical: 11, paddingHorizontal: 28, borderRadius: 8, borderWidth: 1, borderColor: T.accent, backgroundColor: T.accentBg}}>
          <Text style={{fontSize: 15, fontWeight: '600', color: T.accent}}>{t('modal.supportPS')}</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  );
};
