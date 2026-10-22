import React, {useState} from 'react';
import {View} from 'react-native';
import {Text} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Sheet} from '../components/Sheet';
import {FrontTier, FrontState, FrontTierKey, AppSettings, EMPTY_TIER, TIER_I18N_KEY, moodChoices, withCustomMood} from '../utils';
import {tierAccent} from '../theme';
import {useTheme} from '../themeContext';
import {Btn, Field, sectionLabel} from '../components/controls';
import {EnergyRow, LocationPicker, MoodPicker} from '../components/FrontDetailPickers';
import {useDraft, clearDraft} from '../hooks/useDraft';

export const EditFrontDetailModal = ({visible, front, tier, settings, lastKnownLocation, onSave, onClose, statusMode = false}: {
  visible: boolean; front: FrontState | null; tier: FrontTierKey; settings: AppSettings; lastKnownLocation?: string;
  onSave: (mood: string | undefined, location: string | undefined, note: string, energyLevel?: number) => void; onClose: () => void; statusMode?: boolean;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const tierData: FrontTier = front?.[tier] || EMPTY_TIER;
  const isPrimary = tier === 'primary';
  const tierLabel = statusMode ? t('tabs.status') : t(TIER_I18N_KEY[tier]);
  const [mood, setMood] = useState(tierData.mood || ''); const [customMood, setCustomMood] = useState(''); const [showCustomMood, setShowCustomMood] = useState(false);
  const [location, setLocation] = useState(tierData.location || (settings?.gpsEnabled ? lastKnownLocation : '') || ''); const [note, setNote] = useState(tierData.note || '');
  const [energy, setEnergy] = useState<number | undefined>(tierData.energyLevel);
  const allMoods = moodChoices(settings?.customMoods); const allLocations = settings?.locations || [];
  const tierColor = tierAccent(T, tier);
  React.useEffect(() => { if (visible) { const td = front?.[tier] || EMPTY_TIER; setMood(td.mood || ''); setLocation(td.location || (isPrimary && settings?.gpsEnabled ? lastKnownLocation : '') || ''); setNote(td.note || ''); setEnergy(td.energyLevel); setShowCustomMood(false); setCustomMood(''); } }, [visible, front, tier, isPrimary, settings?.gpsEnabled, lastKnownLocation]);

  useDraft<{mood: string; customMood: string; showCustomMood: boolean; location: string; note: string; energy?: number}>(
    'frontDetail', tier, visible,
    {mood, customMood, showCustomMood, location, note, energy},
    d => {
      setMood(d.mood || ''); setCustomMood(d.customMood || ''); setShowCustomMood(!!d.showCustomMood);
      setLocation(d.location || ''); setNote(d.note || ''); setEnergy(d.energy);
    },
  );

  return (
    <Sheet visible={visible} title={t('tier.editTier', {tier: tierLabel})} onClose={onClose}
      footer={<Btn instant onPress={() => {
        onSave(withCustomMood(mood, showCustomMood, customMood), location || undefined, note, energy);
        clearDraft('frontDetail', tier);
        onClose();
      }}>{t('common.save')}</Btn>}>
      <MoodPicker size="regular" mood={mood} setMood={setMood} customMood={customMood} setCustomMood={setCustomMood} showCustom={showCustomMood} setShowCustom={setShowCustomMood} allMoods={allMoods} />
      <View style={{height: 12}} />
      <LocationPicker location={location} setLocation={setLocation} allLocations={allLocations} color={tierColor} />
      <View style={{height: 12}} />
      <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{t('energy.level')}</Text>
      <EnergyRow value={energy} onChange={setEnergy} color={tierColor} />
      <View style={{height: 12}} />
      <Field label={t('modal.note')} value={note} onChange={setNote} placeholder={t('modal.whatHappening')} multiline numberOfLines={3} />
    </Sheet>
  );
};
