import React, {useState, useMemo} from 'react';
import {View, Keyboard, Alert} from 'react-native';
import {Text} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Sheet} from '../components/Sheet';
import {Member, FrontState, FrontTier, FrontTierKey, AppSettings, EMPTY_TIER, FRONT_TIER_KEYS, TIER_I18N_KEY, TIER_SHORT_I18N_KEY, moodChoices, toggleInSet, withCustomMood} from '../utils';
import {tierAccent} from '../theme';
import {useTheme} from '../themeContext';
import {Btn, Field, SectionDivider, sectionLabel} from '../components/controls';
import {EnergyRow, LocationPicker, MoodPicker} from '../components/FrontDetailPickers';
import {useDraft, clearDraft} from '../hooks/useDraft';
import {MemberPicker} from '../components/MemberPicker';
import {PICKER_RESULTS_MAX, pickerPool} from '../picker/memberPicker';
import type {PickerPool} from '../picker/memberPicker';

export const TierMemberPicker = ({tierKey, selected, setSelected, pools, allAssigned, kindLabel}: {
  tierKey: FrontTierKey; selected: Set<string>; setSelected: (s: Set<string>) => void;
  pools: PickerPool[]; allAssigned: ReadonlyMap<string, FrontTierKey>;
  kindLabel?: string;
}) => {
  const {t} = useTranslation();
  const hasKinds = pools.some(p => !!p.kind);
  const searchKind = kindLabel || (hasKinds ? t('terminology.fronters') : '');
  const searchLabel = searchKind ? t('members.searchToAddKind', {kind: searchKind}) : t('members.searchToAdd');
  const hintLabel = searchKind ? t('members.searchToAddKind', {kind: searchKind}) : t('members.searchHint');
  const toggle = (m: Member) => {
    Keyboard.dismiss();
    setSelected(toggleInSet(selected, m.id));
  };
  return (
    <View style={{marginBottom: 10}}>
      <MemberPicker pools={pools} selected={selected} onPick={toggle} multi hideSelected requireSearch selectedChips kindToggles tagFilter
        maxResults={PICKER_RESULTS_MAX} searchLabel={searchLabel} hint={hintLabel}
        annotate={m => {
          const other = allAssigned.get(m.id);
          return other && other !== tierKey ? {label: t(TIER_SHORT_I18N_KEY[other]), dim: true} : null;
        }} />
    </View>
  );
};

interface TierState {
  ids: Set<string>;
  mood: string;
  customMood: string;
  showCustom: boolean;
  location: string;
  note: string;
  energy?: number;
}

type TierStates = Record<FrontTierKey, TierState>;

type FrontDraft = {
  p: string[]; cf: string[]; cc: string[];
  pm: string; pcm: string; psc: boolean; pl: string; pn: string; pe?: number;
  fm: string; fcm: string; fsc: boolean; fl: string; fn: string; fe?: number;
  cm: string; ccm: string; csc: boolean; cl: string; cn: string; ce?: number;
};

const tierState = (tier: FrontTier | undefined, taken: Set<string>, fallbackLocation = ''): TierState => ({
  ids: new Set((tier?.memberIds || []).filter(id => !taken.has(id))),
  mood: tier?.mood || '',
  customMood: '',
  showCustom: false,
  location: tier?.location || fallbackLocation,
  note: tier?.note || '',
  energy: tier?.energyLevel,
});

const seedTiers = (current: FrontState | null, primaryLocation: string): TierStates => {
  const primary = tierState(current?.primary, new Set(), primaryLocation);
  const coFront = tierState(current?.coFront, primary.ids);
  const coConscious = tierState(current?.coConscious, new Set([...primary.ids, ...coFront.ids]));
  return {primary, coFront, coConscious};
};

const toDraft = ({primary: p, coFront: f, coConscious: c}: TierStates): FrontDraft => ({
  p: [...p.ids], cf: [...f.ids], cc: [...c.ids],
  pm: p.mood, pcm: p.customMood, psc: p.showCustom, pl: p.location, pn: p.note, pe: p.energy,
  fm: f.mood, fcm: f.customMood, fsc: f.showCustom, fl: f.location, fn: f.note, fe: f.energy,
  cm: c.mood, ccm: c.customMood, csc: c.showCustom, cl: c.location, cn: c.note, ce: c.energy,
});

const fromDraft = (d: FrontDraft): TierStates => ({
  primary: {ids: new Set(d.p || []), mood: d.pm || '', customMood: d.pcm || '', showCustom: !!d.psc, location: d.pl || '', note: d.pn || '', energy: d.pe},
  coFront: {ids: new Set(d.cf || []), mood: d.fm || '', customMood: d.fcm || '', showCustom: !!d.fsc, location: d.fl || '', note: d.fn || '', energy: d.fe},
  coConscious: {ids: new Set(d.cc || []), mood: d.cm || '', customMood: d.ccm || '', showCustom: !!d.csc, location: d.cl || '', note: d.cn || '', energy: d.ce},
});

const toTier = (s: TierState): FrontTier => ({
  memberIds: [...s.ids],
  mood: withCustomMood(s.mood, s.showCustom, s.customMood),
  note: s.note,
  location: s.location || undefined,
  energyLevel: s.energy,
});

export const SetFrontModal = ({visible, members, current, settings, lastKnownLocation, onSave, onClose}: {
  visible: boolean; members: Member[]; current: FrontState | null; settings: AppSettings; lastKnownLocation?: string;
  onSave: (primary: FrontTier, coFront: FrontTier, coConscious: FrontTier) => void; onClose: () => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const [tiers, setTiers] = useState<TierStates>(() => seedTiers(null, ''));

  React.useEffect(() => {
    if (visible) setTiers(seedTiers(current, (settings?.gpsEnabled ? lastKnownLocation : '') || ''));
  }, [visible, current, settings?.gpsEnabled, lastKnownLocation]);

  const allMoods = moodChoices(settings?.customMoods);
  const allLocations = settings?.locations || [];

  useDraft<FrontDraft>('front', 'current', visible, toDraft(tiers), d => setTiers(fromDraft(d)));

  const regularMembers = useMemo(() => members.filter((m: Member) => !m.isCustomFront && !m.isFacet), [members]);
  const facets = useMemo(() => members.filter((m: Member) => m.isFacet && !m.isCustomFront), [members]);
  const customFronts = useMemo(() => members.filter((m: Member) => m.isCustomFront), [members]);
  const pools = useMemo(
    () => [pickerPool('members', regularMembers, t), pickerPool('facets', facets, t), pickerPool('customFronts', customFronts, t)],
    [regularMembers, facets, customFronts, t],
  );

  const {primary: {ids: primaryIds}, coFront: {ids: coFrontIds}, coConscious: {ids: coConsciousIds}} = tiers;
  const allAssigned = useMemo(() => {
    const map = new Map<string, FrontTierKey>();
    primaryIds.forEach(id => map.set(id, 'primary'));
    coFrontIds.forEach(id => map.set(id, 'coFront'));
    coConsciousIds.forEach(id => map.set(id, 'coConscious'));
    return map;
  }, [primaryIds, coFrontIds, coConsciousIds]);

  const patchTier = (tier: FrontTierKey, patch: Partial<TierState>) =>
    setTiers(s => ({...s, [tier]: {...s[tier], ...patch}}));

  const setTierIds = (tier: FrontTierKey) => (next: Set<string>) => setTiers(s => {
    const out: TierStates = {...s, [tier]: {...s[tier], ids: next}};
    FRONT_TIER_KEYS.forEach(key => {
      if (key === tier) return;
      const kept = [...s[key].ids].filter(id => !next.has(id));
      if (kept.length !== s[key].ids.size) out[key] = {...s[key], ids: new Set(kept)};
    });
    return out;
  });

  const handleSave = () => {
    Keyboard.dismiss();
    onSave(toTier(tiers.primary), toTier(tiers.coFront), toTier(tiers.coConscious));
    clearDraft('front', 'current');
    onClose();
  };

  return (
    <Sheet visible={visible} title={t('modal.updateFront')} onClose={onClose} footer={<><Btn instant variant="ghost" onPress={() => {
      Alert.alert(t('front.clearFrontTitle'), t('front.clearFrontMsg'), [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('common.clear'), style: 'destructive', onPress: () => {onSave(EMPTY_TIER, EMPTY_TIER, EMPTY_TIER); clearDraft('front', 'current'); onClose();}},
      ]);
    }}>{t('common.clear')}</Btn><Btn instant onPress={handleSave}>{t('common.save')}</Btn></>}>
      {FRONT_TIER_KEYS.map(tier => {
        const s = tiers[tier];
        const color = tierAccent(T, tier);
        return (
          <React.Fragment key={tier}>
            <SectionDivider label={t(TIER_I18N_KEY[tier])} color={color} />
            <TierMemberPicker tierKey={tier} selected={s.ids} setSelected={setTierIds(tier)} pools={pools} allAssigned={allAssigned} />
            <MoodPicker mood={s.mood} setMood={mood => patchTier(tier, {mood})} customMood={s.customMood} setCustomMood={customMood => patchTier(tier, {customMood})}
              showCustom={s.showCustom} setShowCustom={showCustom => patchTier(tier, {showCustom})} allMoods={allMoods} />
            <View style={{height: 10}} />
            <LocationPicker location={s.location} setLocation={location => patchTier(tier, {location})} allLocations={allLocations} color={color} />
            <View style={{height: 8}} />
            <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 6})}>{t('energy.level')}</Text>
            <EnergyRow value={s.energy} onChange={energy => patchTier(tier, {energy})} color={color} />
            <Field label={t('modal.noteOptional')} value={s.note} onChange={note => patchTier(tier, {note})} placeholder={t('modal.whatHappening')} multiline numberOfLines={2} />
          </React.Fragment>
        );
      })}
    </Sheet>
  );
};
