import React, {useState} from 'react';
import {View, TouchableOpacity, ScrollView, Keyboard, Alert} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Sheet} from '../components/Sheet';
import {Member, FrontState, DEFAULT_MOODS, EMPTY_TIER, parseMoodList, serializeMoodList} from '../utils';
import {fontScale} from '../theme';
import {Btn, Field, SectionDivider, MoodPicker, EnergyRow} from './shared';

export const SetStatusModal = ({visible, theme: T, statuses, selfId, current, settings, lastKnownLocation, onSave, onClose}: any) => {
  const fs = fontScale(T);
  const {t} = useTranslation();
  const [statusIds, setStatusIds] = useState<Set<string>>(new Set());
  const [mood, setMood] = useState(''); const [customMood, setCustomMood] = useState(''); const [showCustom, setShowCustom] = useState(false);
  const [location, setLocation] = useState(''); const [note, setNote] = useState('');
  const [energy, setEnergy] = useState<number | undefined>(undefined);

  React.useEffect(() => {
    if (visible) {
      const c: FrontState | null = current;
      setStatusIds(new Set((c?.primary?.memberIds || []).filter((id: string) => id !== selfId)));
      setMood(c?.primary?.mood || ''); setCustomMood(''); setShowCustom(false);
      setLocation(c?.primary?.location || (settings?.gpsEnabled ? lastKnownLocation : '') || ''); setNote(c?.primary?.note || '');
      setEnergy(c?.primary?.energyLevel);
    }
  }, [visible, current, selfId, lastKnownLocation]);

  const allMoods = [...DEFAULT_MOODS, ...(settings?.customMoods || [])];
  const allLocations = settings?.locations || [];

  const handleSave = () => {
    Keyboard.dismiss();
    const moods = parseMoodList(mood);
    if (showCustom && customMood.trim()) moods.push(customMood.trim());
    const memberIds = [selfId, ...statusIds].filter(Boolean) as string[];
    onSave(
      {memberIds, mood: serializeMoodList(moods) || undefined, note, location: location || undefined, energyLevel: energy},
      EMPTY_TIER, EMPTY_TIER,
    );
    onClose();
  };

  return (
    <Sheet visible={visible} title={t('status.update')} theme={T} onClose={onClose} footer={<><Btn instant variant="ghost" T={T} onPress={() => {
      Alert.alert(t('status.clearTitle'), t('status.clearMsg'), [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('common.clear'), style: 'destructive', onPress: () => {onSave(EMPTY_TIER, EMPTY_TIER, EMPTY_TIER); onClose();}},
      ]);
    }}>{t('common.clear')}</Btn><Btn instant T={T} onPress={handleSave}>{t('common.save')}</Btn></>}>
      <SectionDivider label={t('status.statuses')} color={T.accent} T={T} />
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12}}>
        {statuses.map((m: Member) => {
          const on = statusIds.has(m.id);
          return (
            <TouchableOpacity key={m.id} onPress={() => {const next = new Set(statusIds); if (on) {next.delete(m.id);} else {next.add(m.id);} setStatusIds(next);}} activeOpacity={0.7}
              accessibilityRole="button" accessibilityState={{selected: on}} accessibilityLabel={m.name}
              style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, backgroundColor: on ? `${m.color}20` : T.surface, borderColor: on ? `${m.color}60` : T.border}}>
              <View style={{width: 7, height: 7, borderRadius: 3.5, backgroundColor: m.color}} />
              <Text style={{fontSize: fs(12), color: on ? m.color : T.dim, fontWeight: on ? '600' : '400'}}>{m.name}</Text>
            </TouchableOpacity>
          );
        })}
        {statuses.length === 0 && <Text style={{fontSize: fs(11), color: T.muted, fontStyle: 'italic'}}>{t('profile.noStatuses')}</Text>}
      </View>
      <MoodPicker mood={mood} setMood={setMood} customMood={customMood} setCustomMood={setCustomMood} showCustom={showCustom} setShowCustom={setShowCustom} allMoods={allMoods} T={T} t={t} />
      <View style={{height: 10}} />
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('modal.location')}</Text>
      {allLocations.length > 0 && (<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 4}}><View style={{flexDirection: 'row', gap: 5}}>
        {allLocations.map((l: string) => (<TouchableOpacity key={l} onPress={() => setLocation(location === l ? '' : l)} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{selected: location === l}} accessibilityLabel={l} style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, backgroundColor: location === l ? `${T.accent}20` : T.surface, borderColor: location === l ? `${T.accent}60` : T.border}}><Text style={{fontSize: fs(11), color: location === l ? T.accent : T.dim, fontWeight: location === l ? '600' : '400'}}>{l}</Text></TouchableOpacity>))}
      </View></ScrollView>)}
      <TextInput value={location} onChangeText={setLocation} placeholder={t('modal.typeLocation')} placeholderTextColor={T.muted} style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), marginTop: 4}} />
      <View style={{height: 8}} />
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('energy.level')}</Text>
      <EnergyRow value={energy} onChange={setEnergy} color={T.accent} T={T} t={t} />
      <Field label={t('modal.noteOptional')} value={note} onChange={setNote} placeholder={t('modal.whatHappening')} multiline numberOfLines={2} T={T} />
    </Sheet>
  );
};
