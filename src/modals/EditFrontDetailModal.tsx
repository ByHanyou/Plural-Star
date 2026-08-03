import React, {useState} from 'react';
import {View, TouchableOpacity, ScrollView} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Sheet} from '../components/Sheet';
import {FrontTier, EMPTY_TIER, DEFAULT_MOODS, parseMoodList, serializeMoodList, toggleMoodInList, translateMood} from '../utils';
import {fontScale} from '../theme';
import {Btn, Field, EnergyRow, LocationPicker} from './shared';
import {useDraft, clearDraft} from '../hooks/useDraft';

export const EditFrontDetailModal = ({visible, theme: T, front, tier, settings, lastKnownLocation, onSave, onClose, statusMode = false}: any) => {
  const fs = fontScale(T);
  const {t} = useTranslation();
  const tierData: FrontTier = front?.[tier] || EMPTY_TIER;
  const isPrimary = tier === 'primary';
  const tierLabel = statusMode ? t('tabs.status') : t(`tier.${tier === 'primary' ? 'primaryFront' : tier === 'coFront' ? 'coFront' : 'coConscious'}`);
  const [mood, setMood] = useState(tierData.mood || ''); const [customMood, setCustomMood] = useState(''); const [showCustomMood, setShowCustomMood] = useState(false);
  const [location, setLocation] = useState(tierData.location || (settings?.gpsEnabled ? lastKnownLocation : '') || ''); const [note, setNote] = useState(tierData.note || '');
  const [energy, setEnergy] = useState<number | undefined>(tierData.energyLevel);
  const allMoods = [...DEFAULT_MOODS, ...(settings?.customMoods || [])]; const allLocations = settings?.locations || [];
  const tierColor = tier === 'primary' ? T.accent : tier === 'coFront' ? T.info : T.success;
  React.useEffect(() => { if (visible) { const td = front?.[tier] || EMPTY_TIER; setMood(td.mood || ''); setLocation(td.location || (isPrimary && settings?.gpsEnabled ? lastKnownLocation : '') || ''); setNote(td.note || ''); setEnergy(td.energyLevel); setShowCustomMood(false); setCustomMood(''); } }, [visible, front, tier, lastKnownLocation]);

  useDraft<{mood: string; customMood: string; showCustomMood: boolean; location: string; note: string; energy?: number}>(
    'frontDetail', tier, visible,
    {mood, customMood, showCustomMood, location, note, energy},
    d => {
      setMood(d.mood || ''); setCustomMood(d.customMood || ''); setShowCustomMood(!!d.showCustomMood);
      setLocation(d.location || ''); setNote(d.note || ''); setEnergy(d.energy);
    },
  );

  return (
    <Sheet visible={visible} title={t('tier.editTier', {tier: tierLabel})} theme={T} onClose={onClose}
      footer={<Btn instant T={T} onPress={() => {
        const moods = parseMoodList(mood);
        if (showCustomMood && customMood.trim()) moods.push(customMood.trim());
        const resolved = serializeMoodList(moods) || undefined;
        onSave(resolved, location || undefined, note, energy);
        clearDraft('frontDetail', tier);
        onClose();
      }}>{t('common.save')}</Btn>}>
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.mood')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 6}}><View style={{flexDirection: 'row', gap: 6}}>
        {(() => { const sel = parseMoodList(mood); const chips = [...allMoods, ...sel.filter((m: string) => !allMoods.includes(m))]; return chips.map((m: string) => {
          const on = sel.includes(m);
          return (<TouchableOpacity key={m} onPress={() => setMood(toggleMoodInList(mood, m))} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{selected: on}} accessibilityLabel={translateMood(m, t)} style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, flexShrink: 0, backgroundColor: on ? `${T.accent}20` : T.surface, borderColor: on ? `${T.accent}60` : T.border}}><Text style={{fontSize: fs(12), color: on ? T.accent : T.dim, fontWeight: on ? '600' : '400'}}>{translateMood(m, t)}</Text></TouchableOpacity>);
        }); })()}
        <TouchableOpacity onPress={() => setShowCustomMood(!showCustomMood)} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{expanded: showCustomMood}} accessibilityLabel={t('modal.custom')} style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, flexShrink: 0, backgroundColor: showCustomMood ? `${T.accent}20` : T.surface, borderColor: showCustomMood ? `${T.accent}60` : T.border}}><Text style={{fontSize: fs(12), color: showCustomMood ? T.accent : T.dim, fontWeight: showCustomMood ? '600' : '400'}}>{showCustomMood ? `− ${t('modal.custom')}` : `+ ${t('modal.custom')}`}</Text></TouchableOpacity>
      </View></ScrollView>
      {showCustomMood && <TextInput value={customMood} onChangeText={setCustomMood} accessibilityLabel={t('modal.enterMood')} placeholder={t('modal.enterMood')} placeholderTextColor={T.muted} style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(14), marginTop: 6}} />}
      <View style={{height: 12}} />
      <LocationPicker location={location} setLocation={setLocation} allLocations={allLocations} color={tierColor} T={T} t={t} />
      <View style={{height: 12}} />
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('energy.level')}</Text>
      <EnergyRow value={energy} onChange={setEnergy} color={tierColor} T={T} t={t} />
      <View style={{height: 12}} />
      <Field label={t('modal.note')} value={note} onChange={setNote} placeholder={t('modal.whatHappening')} multiline numberOfLines={3} T={T} />
    </Sheet>
  );
};
