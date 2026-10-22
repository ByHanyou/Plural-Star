import React, {useState} from 'react';
import {View, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text, TextInput} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {PlannerReminder, fmtClockHHMM, parseTime24} from '../../utils';
import {useAppStore} from '../../store/appStore';
import {savePlanner} from '../../store/actions';
import {DateTimeEditor} from '../../components/DateTimeEditor';
import {REM_REPEAT_CHOICES, ReminderDraft, addReminderTime, reminderDraft, repeatKey, upsertReminder} from '../../planner/planner';
import {ChoiceChips, PlannerForm, SectionHeading, inputStyle} from './PlannerParts';
import {reportSaveError} from '../../utils/saveError';

export const ReminderForm = ({reminder, defaultStart, onClose}: {
  reminder: PlannerReminder | null; defaultStart: number; onClose: () => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [draft, setDraft] = useState<ReminderDraft>(() => reminderDraft(reminder, defaultStart));
  const [newTime, setNewTime] = useState('');
  const patch = (p: Partial<ReminderDraft>) => setDraft(d => ({...d, ...p}));
  const parsedTime = parseTime24(newTime);

  const addTime = () => {
    const times = addReminderTime(draft.times, parsedTime);
    if (!times) return;
    patch({times});
    setNewTime('');
  };

  const save = () => {
    const next = upsertReminder(useAppStore.getState().planner, reminder?.id ?? null, draft);
    if (next) savePlanner(next).then(onClose).catch(reportSaveError);
  };

  return (
    <PlannerForm title={reminder ? t('planner.editReminder') : t('planner.addReminder')} onClose={onClose} onSave={save} canSave={!!draft.title.trim() && draft.times.length > 0}>
      <TextInput value={draft.title} onChangeText={title => patch({title})} placeholder={t('planner.reminderTitlePlaceholder')} placeholderTextColor={T.muted} accessibilityLabel={t('planner.reminderTitlePlaceholder')}
        style={inputStyle(T, {marginBottom: 10})} />
      <SectionHeading label={t('planner.timesLabel')} />
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8}}>
        {draft.times.map(tm => (
          <TouchableOpacity key={tm} onPress={() => patch({times: draft.times.filter(x => x !== tm)})} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel={t('planner.removeTime', {time: fmtClockHHMM(tm)})}
            hitSlop={{top: 6, bottom: 9}} style={{flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, backgroundColor: `${T.accent}15`, borderColor: `${T.accent}40`}}>
            <Text style={{fontSize: fs(12), color: T.accent}}>{fmtClockHHMM(tm)}</Text>
            <Text style={{fontSize: fs(11), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✕</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10}}>
        <TextInput value={newTime} onChangeText={setNewTime} placeholder="08:00" placeholderTextColor={T.muted} accessibilityLabel={t('planner.addTime')} autoCapitalize="none" keyboardType="numbers-and-punctuation"
          style={inputStyle(T, {flex: 1})} onSubmitEditing={addTime} returnKeyType="done" />
        <TouchableOpacity onPress={addTime} activeOpacity={0.7} disabled={!parsedTime} accessibilityRole="button" accessibilityLabel={t('planner.addTime')}
          accessibilityState={{disabled: !parsedTime}}
          hitSlop={{top: 6, bottom: 6}} style={{backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, opacity: parsedTime ? 1 : 0.4}}>
          <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>+</Text>
        </TouchableOpacity>
      </View>
      <SectionHeading label={t('planner.repeatLabel')} />
      <ChoiceChips choices={REM_REPEAT_CHOICES} value={draft.repeat} label={rep => t(repeatKey(rep))} onPick={repeat => patch({repeat})} style={{marginBottom: 10}} />
      {draft.repeat !== 'daily' && (
        <DateTimeEditor date={new Date(draft.start)} onChange={d => patch({start: d.getTime()})}
          label={draft.repeat === 'once' ? t('planner.onDateLabel') : t('planner.startingLabel')} mode="date" collapsible={false} />
      )}
      <View style={{height: 10}} />
      <TextInput value={draft.notes} onChangeText={notes => patch({notes})} placeholder={t('planner.notesPlaceholder')} placeholderTextColor={T.muted} accessibilityLabel={t('planner.notesPlaceholder')} multiline
        style={inputStyle(T, {minHeight: 56, textAlignVertical: 'top', marginBottom: 12})} />
    </PlannerForm>
  );
};
