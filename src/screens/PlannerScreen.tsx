import React, {useEffect, useState} from 'react';
import {View, TouchableOpacity, ScrollView, Alert, BackHandler} from 'react-native';
import {Text} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {PlannerAppointment, PlannerData, PlannerReminder, getLocale, fmtClockHHMM} from '../utils';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {useAppStore} from '../store/appStore';
import {savePlanner} from '../store/actions';
import {ToggleSwitch} from '../components/ToggleSwitch';
import {apptClock, appointmentsOn, remindKey, removeAppointment, removeReminder, repeatKey, sortedReminders, toggleReminder} from '../planner/planner';
import {AppointmentForm} from './planner/AppointmentForm';
import {ReminderForm} from './planner/ReminderForm';
import {MonthCalendar} from './planner/MonthCalendar';
import {DeleteButton} from './planner/PlannerParts';
import {BackHeader} from '../components/BackHeader';
import {reportSaveError} from '../utils/saveError';

interface Props {
  onBack: () => void;
}

type Editing =
  | {kind: 'appointment'; appointment: PlannerAppointment | null}
  | {kind: 'reminder'; reminder: PlannerReminder | null};

export const PlannerScreen = ({onBack}: Props) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const planner = useAppStore(s => s.planner);
  const locale = getLocale();
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState<Date>(() => new Date());
  const [editing, setEditing] = useState<Editing | null>(null);
  const markColor = planner.markColor || T.accent;

  useEffect(() => {
    if (!editing) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setEditing(null);
      return true;
    });
    return () => sub.remove();
  }, [editing]);

  const update = (next: PlannerData) => { savePlanner(next).catch(reportSaveError); };

  const confirmDelete = (title: string, message: string, onConfirm: () => void) =>
    Alert.alert(title, message, [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: onConfirm},
    ]);

  if (editing?.kind === 'appointment') {
    const noon = new Date(selected);
    noon.setHours(12, 0, 0, 0);
    return (
      <AppointmentForm appointment={editing.appointment} defaultTime={noon.getTime()} markColor={markColor} onClose={() => setEditing(null)}
        onSaved={entry => {
          const when = new Date(entry.time);
          setEditing(null);
          setSelected(when);
          setViewMonth(new Date(when.getFullYear(), when.getMonth(), 1));
        }} />
    );
  }

  if (editing?.kind === 'reminder') {
    return <ReminderForm reminder={editing.reminder} defaultStart={Date.now()} onClose={() => setEditing(null)} />;
  }

  const dayAppts = appointmentsOn(planner, selected);
  const selectedLabel = selected.toLocaleDateString(locale, {weekday: 'long', month: 'long', day: 'numeric'});
  const addButton = (label: string, a11y: string, onPress: () => void) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={a11y}
      hitSlop={{top: 6, bottom: 6}} style={{flex: 1, alignItems: 'center', backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10}}>
      <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}} numberOfLines={1}>+ {label}</Text>
    </TouchableOpacity>
  );
  const listHeading = (label: string) => (
    <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8}}>
      <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(15), fontWeight: '600', color: T.text}} numberOfLines={1}>{label}</Text>
    </View>
  );

  return (
    <View style={{flex: 1, backgroundColor: T.bg}}>
      <BackHeader title={t('planner.title')} onBack={onBack} />

      <ScrollView style={{flex: 1}} contentContainerStyle={{padding: 16, paddingTop: 4, paddingBottom: 32}}>
        <View style={{flexDirection: 'row', gap: 10, marginBottom: 12}}>
          {addButton(t('planner.appt'), t('planner.addAppt'), () => setEditing({kind: 'appointment', appointment: null}))}
          {addButton(t('planner.reminder'), t('planner.addReminder'), () => setEditing({kind: 'reminder', reminder: null}))}
        </View>

        <MonthCalendar planner={planner} viewMonth={viewMonth} onViewMonth={setViewMonth} selected={selected} onSelect={setSelected} markColor={markColor} />

        {listHeading(selectedLabel)}
        {dayAppts.length === 0 ? (
          <Text style={{fontSize: fs(12), color: T.muted, marginBottom: 8}}>{t('planner.emptyDay')}</Text>
        ) : dayAppts.map(a => {
          const repeat = a.repeat ? t(repeatKey(a.repeat)) : null;
          const remindLabelKey = remindKey(a.reminderMinutesBefore);
          const remind = remindLabelKey ? t(remindLabelKey) : null;
          const clock = apptClock(a.time);
          return (
            <View key={a.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, borderLeftWidth: 4, borderLeftColor: a.color || markColor, padding: 12, marginBottom: 8}}>
              <TouchableOpacity onPress={() => setEditing({kind: 'appointment', appointment: a})} activeOpacity={0.7} accessibilityRole="button"
                accessibilityLabel={[clock, a.title, a.location, repeat, remind].filter(Boolean).join(', ')}
                hitSlop={{top: 13, bottom: 13}} style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10}}>
                <Text style={{fontSize: fs(13), fontWeight: '700', color: T.accent, minWidth: 58}}>{clock}</Text>
                <View style={{flex: 1}}>
                  <Text style={{fontSize: fs(14), fontWeight: '600', color: T.text}} numberOfLines={1}>{a.title}</Text>
                  {(a.location || a.notes) ? <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}} numberOfLines={2}>{[a.location, a.notes].filter(Boolean).join(' · ')}</Text> : null}
                  {(repeat || remind) ? (
                    <Text style={{fontSize: fs(10), color: T.muted, marginTop: 2}}>
                      {[repeat ? `↻ ${repeat}` : null, remind ? `🔔 ${remind}` : null].filter(Boolean).join('  ·  ')}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
              <DeleteButton label={t('common.deleteItem', {name: a.title})}
                onPress={() => confirmDelete(t('planner.deleteAppt'), a.title, () => update(removeAppointment(useAppStore.getState().planner, a.id)))} />
            </View>
          );
        })}

        {listHeading(t('planner.reminders'))}
        {planner.reminders.length === 0 ? (
          <Text style={{fontSize: fs(12), color: T.muted}}>{t('planner.emptyReminders')}</Text>
        ) : sortedReminders(planner).map(r => {
          const repeat = t(repeatKey(r.repeat || 'daily'));
          const times = r.times.map(fmtClockHHMM);
          return (
            <View key={r.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12, marginBottom: 8, opacity: r.enabled ? 1 : 0.55}}>
              <TouchableOpacity onPress={() => setEditing({kind: 'reminder', reminder: r})} activeOpacity={0.7} accessibilityRole="button"
                accessibilityLabel={[r.title, repeat, ...times].join(', ')} hitSlop={{top: 13, bottom: 13}} style={{flex: 1}}>
                <Text style={{fontSize: fs(14), fontWeight: '600', color: T.text}} numberOfLines={1}>{r.title}</Text>
                <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}}>{`↻ ${repeat}  ·  ${times.join('  ·  ')}`}</Text>
                {r.notes ? <Text style={{fontSize: fs(11), color: T.muted, marginTop: 2}} numberOfLines={1}>{r.notes}</Text> : null}
              </TouchableOpacity>
              <ToggleSwitch value={r.enabled} onToggle={() => update(toggleReminder(useAppStore.getState().planner, r.id))} label={r.title} />
              <DeleteButton label={t('common.deleteItem', {name: r.title})}
                onPress={() => confirmDelete(t('planner.deleteReminder'), r.title, () => update(removeReminder(useAppStore.getState().planner, r.id)))} />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};
