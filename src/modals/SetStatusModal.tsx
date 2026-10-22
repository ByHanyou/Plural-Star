import React, {useState} from 'react';
import {View, TouchableOpacity, Keyboard, Alert} from 'react-native';
import {Text} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Sheet} from '../components/Sheet';
import {Member, FrontState, FrontTier, AppSettings, EMPTY_TIER, moodChoices, statusIdsOf, withCustomMood} from '../utils';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {Btn, Field, SectionDivider, sectionLabel} from '../components/controls';
import {EnergyRow, LocationPicker, MoodPicker} from '../components/FrontDetailPickers';
import {useDraft, clearDraft} from '../hooks/useDraft';

export const SetStatusModal = ({visible, statuses, selfId, current, settings, lastKnownLocation, onSave, onClose}: {
  visible: boolean; statuses: Member[]; selfId: string | undefined; current: FrontState | null; settings: AppSettings; lastKnownLocation?: string;
  onSave: (primary: FrontTier, coFront: FrontTier, coConscious: FrontTier) => void; onClose: () => void;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  const [statusIds, setStatusIds] = useState<Set<string>>(new Set());
  const [mood, setMood] = useState(''); const [customMood, setCustomMood] = useState(''); const [showCustom, setShowCustom] = useState(false);
  const [location, setLocation] = useState(''); const [note, setNote] = useState('');
  const [energy, setEnergy] = useState<number | undefined>(undefined);

  React.useEffect(() => {
    if (visible) {
      const c: FrontState | null = current;
      setStatusIds(new Set(statusIdsOf(c, selfId)));
      setMood(c?.primary?.mood || ''); setCustomMood(''); setShowCustom(false);
      setLocation(c?.primary?.location || (settings?.gpsEnabled ? lastKnownLocation : '') || ''); setNote(c?.primary?.note || '');
      setEnergy(c?.primary?.energyLevel);
    }
  }, [visible, current, selfId, settings?.gpsEnabled, lastKnownLocation]);

  const allMoods = moodChoices(settings?.customMoods);
  const allLocations = settings?.locations || [];

  useDraft<{ids: string[]; mood: string; customMood: string; showCustom: boolean; location: string; note: string; energy?: number}>(
    'status', 'self', visible,
    {ids: [...statusIds], mood, customMood, showCustom, location, note, energy},
    d => {
      setStatusIds(new Set(d.ids || []));
      setMood(d.mood || ''); setCustomMood(d.customMood || ''); setShowCustom(!!d.showCustom);
      setLocation(d.location || ''); setNote(d.note || ''); setEnergy(d.energy);
    },
  );

  const handleSave = () => {
    Keyboard.dismiss();
    const memberIds = [selfId, ...statusIds].filter((id): id is string => !!id);
    onSave(
      {memberIds, mood: withCustomMood(mood, showCustom, customMood), note, location: location || undefined, energyLevel: energy},
      EMPTY_TIER, EMPTY_TIER,
    );
    clearDraft('status', 'self');
    onClose();
  };

  return (
    <Sheet visible={visible} title={t('status.update')} onClose={onClose} footer={<><Btn instant variant="ghost" onPress={() => {
      Alert.alert(t('status.clearTitle'), t('status.clearMsg'), [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('common.clear'), style: 'destructive', onPress: () => {onSave(EMPTY_TIER, EMPTY_TIER, EMPTY_TIER); clearDraft('status', 'self'); onClose();}},
      ]);
    }}>{t('common.clear')}</Btn><Btn instant onPress={handleSave}>{t('common.save')}</Btn></>}>
      <SectionDivider label={t('status.statuses')} color={T.accent} />
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12}}>
        {statuses.map((m: Member) => {
          const on = statusIds.has(m.id);
          return (
            <TouchableOpacity key={m.id} onPress={() => {const next = new Set(statusIds); if (on) {next.delete(m.id);} else {next.add(m.id);} setStatusIds(next);}} activeOpacity={0.7}
              accessibilityRole="button" accessibilityState={{selected: on}} accessibilityLabel={m.name}
              hitSlop={{top: 6, bottom: 10}} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, backgroundColor: on ? `${m.color}20` : T.surface, borderColor: on ? `${m.color}60` : T.border}}>
              <View style={{width: 7, height: 7, borderRadius: 3.5, backgroundColor: m.color}} />
              <Text style={{fontSize: fs(12), color: on ? m.color : T.dim, fontWeight: on ? '600' : '400'}}>{m.name}</Text>
            </TouchableOpacity>
          );
        })}
        {statuses.length === 0 && <Text style={{fontSize: fs(11), color: T.muted, fontStyle: 'italic'}}>{t('profile.noStatuses')}</Text>}
      </View>
      <MoodPicker mood={mood} setMood={setMood} customMood={customMood} setCustomMood={setCustomMood} showCustom={showCustom} setShowCustom={setShowCustom} allMoods={allMoods} />
      <View style={{height: 10}} />
      <LocationPicker location={location} setLocation={setLocation} allLocations={allLocations} />
      <View style={{height: 8}} />
      <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 6})}>{t('energy.level')}</Text>
      <EnergyRow value={energy} onChange={setEnergy} color={T.accent} />
      <Field label={t('modal.noteOptional')} value={note} onChange={setNote} placeholder={t('modal.whatHappening')} multiline numberOfLines={2} />
    </Sheet>
  );
};
