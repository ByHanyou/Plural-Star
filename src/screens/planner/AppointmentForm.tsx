import React, {useState} from 'react';
import {View, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text, TextInput} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import type {PlannerAppointment} from '../../utils';
import {useAppStore} from '../../store/appStore';
import {savePlanner} from '../../store/actions';
import {DateTimeEditor} from '../../components/DateTimeEditor';
import {ColorCarousel} from '../../components/ColorCarousel';
import {AppointmentDraft, APPT_REPEAT_CHOICES, REMIND_CHOICES, appointmentDraft, repeatKey, upsertAppointment} from '../../planner/planner';
import {ChoiceChips, PlannerForm, SectionHeading, inputStyle} from './PlannerParts';
import {reportSaveError} from '../../utils/saveError';

export const AppointmentForm = ({appointment, defaultTime, markColor, onClose, onSaved}: {
  appointment: PlannerAppointment | null; defaultTime: number; markColor: string;
  onClose: () => void; onSaved: (entry: PlannerAppointment) => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [draft, setDraft] = useState<AppointmentDraft>(() => appointmentDraft(appointment, defaultTime));
  const patch = (p: Partial<AppointmentDraft>) => setDraft(d => ({...d, ...p}));

  const save = () => {
    const result = upsertAppointment(useAppStore.getState().planner, appointment?.id ?? null, draft);
    if (!result) return;
    savePlanner(result.planner).then(() => onSaved(result.entry)).catch(reportSaveError);
  };

  return (
    <PlannerForm title={appointment ? t('planner.editAppt') : t('planner.addAppt')} onClose={onClose} onSave={save} canSave={!!draft.title.trim()}>
      <TextInput value={draft.title} onChangeText={title => patch({title})} placeholder={t('planner.apptTitlePlaceholder')} placeholderTextColor={T.muted} accessibilityLabel={t('planner.apptTitlePlaceholder')}
        style={inputStyle(T, {marginBottom: 10})} />
      <DateTimeEditor date={new Date(draft.time)} onChange={d => patch({time: d.getTime()})} label={t('planner.when')} mode="datetime" collapsible={false} />
      <TextInput value={draft.location} onChangeText={location => patch({location})} placeholder={t('planner.locationPlaceholder')} placeholderTextColor={T.muted} accessibilityLabel={t('planner.locationPlaceholder')}
        style={inputStyle(T, {marginTop: 10, marginBottom: 10})} />
      <TextInput value={draft.notes} onChangeText={notes => patch({notes})} placeholder={t('planner.notesPlaceholder')} placeholderTextColor={T.muted} accessibilityLabel={t('planner.notesPlaceholder')} multiline
        style={inputStyle(T, {minHeight: 56, textAlignVertical: 'top', marginBottom: 10})} />
      <SectionHeading label={t('planner.repeatLabel')} />
      <ChoiceChips choices={APPT_REPEAT_CHOICES} value={draft.repeat} label={rep => t(repeatKey(rep))} onPick={repeat => patch({repeat})} />
      <SectionHeading label={t('planner.remindLabel')} />
      <ChoiceChips choices={REMIND_CHOICES.map(c => c.minutes)} value={draft.remind} label={m => t(REMIND_CHOICES.find(c => c.minutes === m)?.key || 'planner.remindNone')} onPick={remind => patch({remind})} />
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6}}>
        <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: draft.color || markColor}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        <Text style={{flex: 1, fontSize: fs(11), color: T.dim}}>{t('planner.apptColor')}</Text>
        {draft.color ? (
          <TouchableOpacity onPress={() => patch({color: null})} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('planner.apptColorDefault')}
            hitSlop={{top: 11, bottom: 11}} style={{paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: T.border}}>
            <Text style={{fontSize: fs(11), color: T.dim}}>{t('planner.apptColorDefault')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={{marginBottom: 12}}>
        <ColorCarousel value={draft.color || markColor} onChange={color => patch({color})} size={26} />
      </View>
    </PlannerForm>
  );
};
