import React, {useMemo, useState} from 'react';
import {View, TouchableOpacity, ScrollView, Alert, Modal} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {PlannerAppointment, PlannerReminder, PlannerRepeat, PlannerReminderRepeat, plannerOccursOnDay, uid, fmtTime, isValidTimeHHMM, getLocale} from '../utils';
import {fontScale, ThemeColors} from '../theme';
import {useAppStore} from '../store/appStore';
import {savePlanner} from '../store/actions';
import {DateTimeEditor} from '../components/DateTimeEditor';
import {ToggleSwitch} from '../components/ToggleSwitch';
import {ColorCarousel} from '../components/ColorCarousel';

interface Props {
  theme: ThemeColors;
  onBack: () => void;
}

const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const REMIND_CHOICES: {minutes: number | null; key: string}[] = [
  {minutes: null, key: 'planner.remindNone'},
  {minutes: 0, key: 'planner.remindAtTime'},
  {minutes: 30, key: 'planner.remind30m'},
  {minutes: 60, key: 'planner.remind1h'},
  {minutes: 1440, key: 'planner.remind1d'},
];

const REPEAT_KEYS: Record<string, string> = {
  once: 'planner.repeatOnce',
  daily: 'planner.repeatDaily',
  everyOtherDay: 'planner.repeatEveryOtherDay',
  weekly: 'planner.repeatWeekly',
  everyOtherWeek: 'planner.repeatEveryOtherWeek',
  monthly: 'planner.repeatMonthly',
  everyOtherMonth: 'planner.repeatEveryOtherMonth',
  annually: 'planner.repeatAnnually',
};

const APPT_REPEAT_CHOICES: (PlannerRepeat | null)[] = [null, 'daily', 'everyOtherDay', 'weekly', 'everyOtherWeek', 'monthly', 'everyOtherMonth', 'annually'];
const REM_REPEAT_CHOICES: PlannerReminderRepeat[] = ['once', 'daily', 'everyOtherDay', 'weekly', 'everyOtherWeek', 'monthly', 'everyOtherMonth', 'annually'];

export const PlannerScreen = ({theme: T, onBack}: Props) => {
  const {t} = useTranslation();
  const fs = fontScale(T);
  const planner = useAppStore(s => s.planner);

  const today = new Date();
  const [viewMonth, setViewMonth] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date>(today);

  const [apptOpen, setApptOpen] = useState(false);
  const [apptId, setApptId] = useState<string | null>(null);
  const [apptTitle, setApptTitle] = useState('');
  const [apptWhen, setApptWhen] = useState<Date>(today);
  const [apptLocation, setApptLocation] = useState('');
  const [apptNotes, setApptNotes] = useState('');
  const [apptRemind, setApptRemind] = useState<number | null>(30);
  const [apptRepeat, setApptRepeat] = useState<PlannerRepeat | null>(null);
  const [apptColor, setApptColor] = useState<string | null>(null);

  const [remOpen, setRemOpen] = useState(false);
  const [remId, setRemId] = useState<string | null>(null);
  const [remTitle, setRemTitle] = useState('');
  const [remTimes, setRemTimes] = useState<string[]>([]);
  const [remNewTime, setRemNewTime] = useState('');
  const [remNotes, setRemNotes] = useState('');
  const [remRepeat, setRemRepeat] = useState<PlannerReminderRepeat>('daily');
  const [remStart, setRemStart] = useState<Date>(today);

  const locale = getLocale();
  const markColor = planner.markColor || T.accent;
  const [markPickerOpen, setMarkPickerOpen] = useState(false);

  const weekdayInitials = useMemo(() => {
    const base = new Date(2026, 7, 2);
    return Array.from({length: 7}, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toLocaleDateString(locale, {weekday: 'narrow'});
    });
  }, [locale]);

  const minutesOfDay = (ts: number) => { const d = new Date(ts); return d.getHours() * 60 + d.getMinutes(); };
  const apptsOn = (day: Date): PlannerAppointment[] =>
    planner.appointments
      .filter(a => plannerOccursOnDay(a.time, a.repeat, day))
      .sort((a, b) => minutesOfDay(a.time) - minutesOfDay(b.time));

  const monthLabel = viewMonth.toLocaleDateString(locale, {month: 'long', year: 'numeric'});

  const grid = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({length: 42}, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [viewMonth]);

  const shiftMonth = (delta: number) =>
    setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  const openNewAppt = () => {
    const when = new Date(selected);
    when.setHours(12, 0, 0, 0);
    setApptId(null); setApptTitle(''); setApptWhen(when); setApptLocation(''); setApptNotes(''); setApptRemind(30); setApptRepeat(null); setApptColor(null);
    setApptOpen(true);
  };

  const openEditAppt = (a: PlannerAppointment) => {
    setApptId(a.id); setApptTitle(a.title); setApptWhen(new Date(a.time)); setApptLocation(a.location || '');
    setApptNotes(a.notes || ''); setApptRemind(a.reminderMinutesBefore ?? null); setApptRepeat(a.repeat ?? null); setApptColor(a.color || null);
    setApptOpen(true);
  };

  const saveAppt = async () => {
    const title = apptTitle.trim();
    if (!title) return;
    const entry: PlannerAppointment = {
      id: apptId || uid(),
      title,
      time: apptWhen.getTime(),
      location: apptLocation.trim() || undefined,
      notes: apptNotes.trim() || undefined,
      reminderMinutesBefore: apptRemind ?? undefined,
      repeat: apptRepeat ?? undefined,
      color: apptColor ?? undefined,
      createdAt: apptId ? (planner.appointments.find(x => x.id === apptId)?.createdAt ?? Date.now()) : Date.now(),
    };
    const rest = planner.appointments.filter(x => x.id !== entry.id);
    await savePlanner({...planner, appointments: [...rest, entry]});
    setApptOpen(false);
    setSelected(new Date(entry.time));
    setViewMonth(new Date(apptWhen.getFullYear(), apptWhen.getMonth(), 1));
  };

  const deleteAppt = (a: PlannerAppointment) =>
    Alert.alert(t('planner.deleteAppt'), a.title, [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => {
        savePlanner({...planner, appointments: planner.appointments.filter(x => x.id !== a.id)});
      }},
    ]);

  const openNewRem = () => {
    setRemId(null); setRemTitle(''); setRemTimes([]); setRemNewTime(''); setRemNotes('');
    setRemRepeat('daily'); setRemStart(new Date(selected));
    setRemOpen(true);
  };

  const openEditRem = (r: PlannerReminder) => {
    setRemId(r.id); setRemTitle(r.title); setRemTimes([...r.times]); setRemNewTime(''); setRemNotes(r.notes || '');
    setRemRepeat(r.repeat || 'daily'); setRemStart(new Date(r.startDate ?? r.createdAt));
    setRemOpen(true);
  };

  const addRemTime = () => {
    const v = remNewTime.trim();
    if (!isValidTimeHHMM(v) || remTimes.includes(v)) return;
    setRemTimes([...remTimes, v].sort());
    setRemNewTime('');
  };

  const saveRem = async () => {
    const title = remTitle.trim();
    if (!title || remTimes.length === 0) return;
    const startDay = new Date(remStart);
    startDay.setHours(0, 0, 0, 0);
    const entry: PlannerReminder = {
      id: remId || uid(),
      title,
      times: remTimes,
      enabled: remId ? (planner.reminders.find(x => x.id === remId)?.enabled ?? true) : true,
      notes: remNotes.trim() || undefined,
      repeat: remRepeat,
      startDate: startDay.getTime(),
      createdAt: remId ? (planner.reminders.find(x => x.id === remId)?.createdAt ?? Date.now()) : Date.now(),
    };
    const rest = planner.reminders.filter(x => x.id !== entry.id);
    await savePlanner({...planner, reminders: [...rest, entry]});
    setRemOpen(false);
  };

  const toggleRem = (r: PlannerReminder) =>
    savePlanner({...planner, reminders: planner.reminders.map(x => x.id === r.id ? {...x, enabled: !x.enabled} : x)});

  const deleteRem = (r: PlannerReminder) =>
    Alert.alert(t('planner.deleteReminder'), r.title, [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => {
        savePlanner({...planner, reminders: planner.reminders.filter(x => x.id !== r.id)});
      }},
    ]);

  const dayAppts = apptsOn(selected);
  const selectedLabel = selected.toLocaleDateString(locale, {weekday: 'long', month: 'long', day: 'numeric'});
  const sortedRems = [...planner.reminders].sort((a, b) => (a.times[0] || '').localeCompare(b.times[0] || ''));

  return (
    <View style={{flex: 1, backgroundColor: T.bg}}>
      <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8}}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{padding: 4, marginRight: 12}}>
          <Text style={{fontSize: fs(18), color: T.dim}}>←</Text>
        </TouchableOpacity>
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.2} style={{fontSize: fs(20), fontWeight: '600', color: T.text, flex: 1}} numberOfLines={1}>{t('planner.title')}</Text>
      </View>

      <ScrollView style={{flex: 1}} contentContainerStyle={{padding: 16, paddingTop: 4, paddingBottom: 32}}>
        <View style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 10}}>
          <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 8}}>
            <TouchableOpacity onPress={() => shiftMonth(-1)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('planner.prevMonth')} style={{padding: 8}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Text style={{fontSize: fs(16), color: T.accent}}>‹</Text>
            </TouchableOpacity>
            <Text accessibilityRole="header" style={{flex: 1, textAlign: 'center', fontSize: fs(15), fontWeight: '600', color: T.text}}>{monthLabel}</Text>
            <TouchableOpacity onPress={() => shiftMonth(1)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('planner.nextMonth')} style={{padding: 8}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Text style={{fontSize: fs(16), color: T.accent}}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={{flexDirection: 'row'}}>
            {weekdayInitials.map((w, i) => (
              <Text key={i} maxFontSizeMultiplier={1.4} style={{flex: 1, textAlign: 'center', fontSize: fs(10), color: T.muted}}
                accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{w}</Text>
            ))}
          </View>
          {Array.from({length: 6}, (_, row) => (
            <View key={row} style={{flexDirection: 'row'}}>
              {grid.slice(row * 7, row * 7 + 7).map((d, col) => {
                const inMonth = d.getMonth() === viewMonth.getMonth();
                const isSel = dayKey(d) === dayKey(selected);
                const isToday = dayKey(d) === dayKey(today);
                const dayList = apptsOn(d);
                const count = dayList.length;
                const dots = Array.from(new Set(dayList.map(a => a.color || markColor))).slice(0, 3);
                const label = `${d.toLocaleDateString(locale, {weekday: 'long', month: 'long', day: 'numeric'})}${count > 0 ? `, ${t('planner.apptCount', {count})}` : ''}`;
                return (
                  <TouchableOpacity key={col} onPress={() => { setSelected(new Date(d)); if (!inMonth) setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}
                    activeOpacity={0.7} accessibilityRole="button" accessibilityState={{selected: isSel}} accessibilityLabel={label}
                    style={{flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', margin: 1, borderRadius: 8,
                      backgroundColor: isSel ? `${T.accent}25` : 'transparent',
                      borderWidth: isToday ? 1 : 0, borderColor: T.accent}}>
                    <Text maxFontSizeMultiplier={1.6} style={{fontSize: fs(12), color: inMonth ? (isSel ? T.accent : T.text) : T.muted, fontWeight: isSel ? '700' : '400'}}>{d.getDate()}</Text>
                    {count > 0 && (
                      <View style={{flexDirection: 'row', gap: 2, marginTop: 2}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                        {dots.map(c => <View key={c} style={{width: 6, height: 6, borderRadius: 3, backgroundColor: c}} />)}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          <TouchableOpacity onPress={() => setMarkPickerOpen(v => !v)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityState={{expanded: markPickerOpen}} accessibilityLabel={t('planner.markColor')}
            style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: T.border}}>
            <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: markColor}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
            <Text style={{flex: 1, fontSize: fs(11), color: T.dim}}>{t('planner.markColor')}</Text>
            <Text style={{fontSize: fs(11), color: T.dim}}>{markPickerOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {markPickerOpen && (
            <View style={{marginTop: 8}}>
              <ColorCarousel value={markColor} onChange={hex => savePlanner({...planner, markColor: hex})} T={T} size={26} />
            </View>
          )}
        </View>

        <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8}}>
          <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(15), fontWeight: '600', color: T.text}} numberOfLines={1}>{selectedLabel}</Text>
          <TouchableOpacity onPress={openNewAppt} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('planner.addAppt')}
            style={{backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7}}>
            <Text style={{fontSize: fs(12), fontWeight: '600', color: T.accent}}>+ {t('planner.appt')}</Text>
          </TouchableOpacity>
        </View>
        {dayAppts.length === 0 ? (
          <Text style={{fontSize: fs(12), color: T.muted, marginBottom: 8}}>{t('planner.emptyDay')}</Text>
        ) : dayAppts.map(a => {
          const meta = [
            a.repeat ? t(REPEAT_KEYS[a.repeat]) : null,
            a.reminderMinutesBefore != null ? t(REMIND_CHOICES.find(c => c.minutes === a.reminderMinutesBefore)?.key || 'planner.remindAtTime') : null,
          ].filter(Boolean) as string[];
          return (
          <View key={a.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, borderLeftWidth: 4, borderLeftColor: a.color || markColor, padding: 12, marginBottom: 8}}>
            <TouchableOpacity onPress={() => openEditAppt(a)} activeOpacity={0.7} accessibilityRole="button"
              accessibilityLabel={[fmtTime(a.time), a.title, a.location, ...meta].filter(Boolean).join(', ')}
              style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10}}>
              <Text style={{fontSize: fs(13), fontWeight: '700', color: T.accent, width: 58}}>{fmtTime(a.time)}</Text>
              <View style={{flex: 1}}>
                <Text style={{fontSize: fs(14), fontWeight: '600', color: T.text}} numberOfLines={1}>{a.title}</Text>
                {(a.location || a.notes) ? <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}} numberOfLines={2}>{[a.location, a.notes].filter(Boolean).join(' · ')}</Text> : null}
                {meta.length > 0 && (
                  <Text style={{fontSize: fs(10), color: T.muted, marginTop: 2}}>
                    {[
                      a.repeat ? `↻ ${t(REPEAT_KEYS[a.repeat])}` : null,
                      a.reminderMinutesBefore != null ? `🔔 ${t(REMIND_CHOICES.find(c => c.minutes === a.reminderMinutesBefore)?.key || 'planner.remindAtTime')}` : null,
                    ].filter(Boolean).join('  ·  ')}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => deleteAppt(a)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t('common.delete')}, ${a.title}`} style={{padding: 8}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Text style={{fontSize: fs(15), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no">✕</Text>
            </TouchableOpacity>
          </View>
          );
        })}

        <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8}}>
          <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(15), fontWeight: '600', color: T.text}}>{t('planner.reminders')}</Text>
          <TouchableOpacity onPress={openNewRem} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('planner.addReminder')}
            style={{backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7}}>
            <Text style={{fontSize: fs(12), fontWeight: '600', color: T.accent}}>+ {t('planner.reminder')}</Text>
          </TouchableOpacity>
        </View>
        {sortedRems.length === 0 ? (
          <Text style={{fontSize: fs(12), color: T.muted}}>{t('planner.emptyReminders')}</Text>
        ) : sortedRems.map(r => (
          <View key={r.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12, marginBottom: 8, opacity: r.enabled ? 1 : 0.55}}>
            <TouchableOpacity onPress={() => openEditRem(r)} activeOpacity={0.7} accessibilityRole="button"
              accessibilityLabel={`${r.title}, ${t(REPEAT_KEYS[r.repeat || 'daily'])}, ${r.times.join(', ')}`} style={{flex: 1}}>
              <Text style={{fontSize: fs(14), fontWeight: '600', color: T.text}} numberOfLines={1}>{r.title}</Text>
              <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}}>{`↻ ${t(REPEAT_KEYS[r.repeat || 'daily'])}  ·  ${r.times.join('  ·  ')}`}</Text>
              {r.notes ? <Text style={{fontSize: fs(11), color: T.muted, marginTop: 2}} numberOfLines={1}>{r.notes}</Text> : null}
            </TouchableOpacity>
            <ToggleSwitch value={r.enabled} onToggle={() => toggleRem(r)} T={T} label={`${r.enabled ? t('planner.disableReminder') : t('planner.enableReminder')}, ${r.title}`} />
            <TouchableOpacity onPress={() => deleteRem(r)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t('common.delete')}, ${r.title}`} style={{padding: 8}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Text style={{fontSize: fs(15), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no">✕</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      <Modal visible={apptOpen} transparent animationType="fade" onRequestClose={() => setApptOpen(false)}>
        <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20}}>
          <View accessibilityViewIsModal style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 16, maxHeight: '90%'}}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, marginBottom: 10}}>{apptId ? t('planner.editAppt') : t('planner.addAppt')}</Text>
              <TextInput value={apptTitle} onChangeText={setApptTitle} placeholder={t('planner.apptTitlePlaceholder')} placeholderTextColor={T.muted} accessibilityLabel={t('planner.apptTitlePlaceholder')}
                style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13), marginBottom: 10}} />
              <DateTimeEditor date={apptWhen} onChange={setApptWhen} label={t('planner.when')} T={T} mode="datetime" collapsible={false} />
              <TextInput value={apptLocation} onChangeText={setApptLocation} placeholder={t('planner.locationPlaceholder')} placeholderTextColor={T.muted} accessibilityLabel={t('planner.locationPlaceholder')}
                style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13), marginTop: 10, marginBottom: 10}} />
              <TextInput value={apptNotes} onChangeText={setApptNotes} placeholder={t('planner.notesPlaceholder')} placeholderTextColor={T.muted} accessibilityLabel={t('planner.notesPlaceholder')} multiline
                style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13), minHeight: 56, textAlignVertical: 'top', marginBottom: 10}} />
              <Text style={{fontSize: fs(11), color: T.dim, marginBottom: 6}}>{t('planner.repeatLabel')}</Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12}}>
                {APPT_REPEAT_CHOICES.map(rep => {
                  const label = rep == null ? t('planner.repeatOnce') : t(REPEAT_KEYS[rep]);
                  const sel = apptRepeat === rep;
                  return (
                    <TouchableOpacity key={String(rep)} onPress={() => setApptRepeat(rep)} activeOpacity={0.7}
                      accessibilityRole="button" accessibilityState={{selected: sel}} accessibilityLabel={label}
                      style={{paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
                        backgroundColor: sel ? `${T.accent}20` : T.bg,
                        borderColor: sel ? `${T.accent}50` : T.border}}>
                      <Text style={{fontSize: fs(11), color: sel ? T.accent : T.dim}}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={{fontSize: fs(11), color: T.dim, marginBottom: 6}}>{t('planner.remindLabel')}</Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12}}>
                {REMIND_CHOICES.map(c => (
                  <TouchableOpacity key={String(c.minutes)} onPress={() => setApptRemind(c.minutes)} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityState={{selected: apptRemind === c.minutes}} accessibilityLabel={t(c.key)}
                    style={{paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
                      backgroundColor: apptRemind === c.minutes ? `${T.accent}20` : T.bg,
                      borderColor: apptRemind === c.minutes ? `${T.accent}50` : T.border}}>
                    <Text style={{fontSize: fs(11), color: apptRemind === c.minutes ? T.accent : T.dim}}>{t(c.key)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6}}>
                <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: apptColor || markColor}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
                <Text style={{flex: 1, fontSize: fs(11), color: T.dim}}>{t('planner.apptColor')}</Text>
                {apptColor ? (
                  <TouchableOpacity onPress={() => setApptColor(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('planner.apptColorDefault')}
                    style={{paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: T.border}}>
                    <Text style={{fontSize: fs(11), color: T.dim}}>{t('planner.apptColorDefault')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={{marginBottom: 12}}>
                <ColorCarousel value={apptColor || markColor} onChange={setApptColor} T={T} size={26} />
              </View>
              <View style={{flexDirection: 'row', gap: 10}}>
                <TouchableOpacity onPress={() => setApptOpen(false)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
                  style={{flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
                  <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveAppt} activeOpacity={0.7} disabled={!apptTitle.trim()} accessibilityRole="button" accessibilityLabel={t('common.save')}
                  accessibilityState={{disabled: !apptTitle.trim()}}
                  style={{flex: 2, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, opacity: apptTitle.trim() ? 1 : 0.4}}>
                  <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={remOpen} transparent animationType="fade" onRequestClose={() => setRemOpen(false)}>
        <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20}}>
          <View accessibilityViewIsModal style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 16, maxHeight: '90%'}}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, marginBottom: 10}}>{remId ? t('planner.editReminder') : t('planner.addReminder')}</Text>
              <TextInput value={remTitle} onChangeText={setRemTitle} placeholder={t('planner.reminderTitlePlaceholder')} placeholderTextColor={T.muted} accessibilityLabel={t('planner.reminderTitlePlaceholder')}
                style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13), marginBottom: 10}} />
              <Text style={{fontSize: fs(11), color: T.dim, marginBottom: 6}}>{t('planner.timesLabel')}</Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8}}>
                {remTimes.map(tm => (
                  <TouchableOpacity key={tm} onPress={() => setRemTimes(remTimes.filter(x => x !== tm))} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityLabel={t('planner.removeTime', {time: tm})}
                    style={{flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, backgroundColor: `${T.accent}15`, borderColor: `${T.accent}40`}}>
                    <Text style={{fontSize: fs(12), color: T.accent}}>{tm}</Text>
                    <Text style={{fontSize: fs(11), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✕</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10}}>
                <TextInput value={remNewTime} onChangeText={setRemNewTime} placeholder="08:00" placeholderTextColor={T.muted} accessibilityLabel={t('planner.addTime')} autoCapitalize="none" keyboardType="numbers-and-punctuation"
                  style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13)}} onSubmitEditing={addRemTime} returnKeyType="done" />
                <TouchableOpacity onPress={addRemTime} activeOpacity={0.7} disabled={!isValidTimeHHMM(remNewTime.trim())} accessibilityRole="button" accessibilityLabel={t('planner.addTime')}
                  accessibilityState={{disabled: !isValidTimeHHMM(remNewTime.trim())}}
                  style={{backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, opacity: isValidTimeHHMM(remNewTime.trim()) ? 1 : 0.4}}>
                  <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>+</Text>
                </TouchableOpacity>
              </View>
              <Text style={{fontSize: fs(11), color: T.dim, marginBottom: 6}}>{t('planner.repeatLabel')}</Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10}}>
                {REM_REPEAT_CHOICES.map(rep => {
                  const sel = remRepeat === rep;
                  return (
                    <TouchableOpacity key={rep} onPress={() => setRemRepeat(rep)} activeOpacity={0.7}
                      accessibilityRole="button" accessibilityState={{selected: sel}} accessibilityLabel={t(REPEAT_KEYS[rep])}
                      style={{paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
                        backgroundColor: sel ? `${T.accent}20` : T.bg,
                        borderColor: sel ? `${T.accent}50` : T.border}}>
                      <Text style={{fontSize: fs(11), color: sel ? T.accent : T.dim}}>{t(REPEAT_KEYS[rep])}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {remRepeat !== 'daily' && (
                <DateTimeEditor date={remStart} onChange={setRemStart}
                  label={remRepeat === 'once' ? t('planner.onDateLabel') : t('planner.startingLabel')} T={T} mode="date" collapsible={false} />
              )}
              <View style={{height: 10}} />
              <TextInput value={remNotes} onChangeText={setRemNotes} placeholder={t('planner.notesPlaceholder')} placeholderTextColor={T.muted} accessibilityLabel={t('planner.notesPlaceholder')} multiline
                style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13), minHeight: 56, textAlignVertical: 'top', marginBottom: 12}} />
              <View style={{flexDirection: 'row', gap: 10}}>
                <TouchableOpacity onPress={() => setRemOpen(false)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
                  style={{flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
                  <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveRem} activeOpacity={0.7} disabled={!remTitle.trim() || remTimes.length === 0} accessibilityRole="button" accessibilityLabel={t('common.save')}
                  accessibilityState={{disabled: !remTitle.trim() || remTimes.length === 0}}
                  style={{flex: 2, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, opacity: (remTitle.trim() && remTimes.length > 0) ? 1 : 0.4}}>
                  <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};
