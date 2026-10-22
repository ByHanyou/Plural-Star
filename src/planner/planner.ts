import {PlannerAppointment, PlannerData, PlannerReminder, PlannerRepeat, PlannerReminderRepeat, plannerOccursOnDay, uid, fmtClock} from '../utils';

export const REMIND_CHOICES: {minutes: number | null; key: string}[] = [
  {minutes: null, key: 'planner.remindNone'},
  {minutes: 0, key: 'planner.remindAtTime'},
  {minutes: 30, key: 'planner.remind30m'},
  {minutes: 60, key: 'planner.remind1h'},
  {minutes: 1440, key: 'planner.remind1d'},
];

export const REPEAT_KEYS: Record<PlannerReminderRepeat, string> = {
  once: 'planner.repeatOnce',
  daily: 'planner.repeatDaily',
  everyOtherDay: 'planner.repeatEveryOtherDay',
  weekly: 'planner.repeatWeekly',
  everyOtherWeek: 'planner.repeatEveryOtherWeek',
  monthly: 'planner.repeatMonthly',
  everyOtherMonth: 'planner.repeatEveryOtherMonth',
  annually: 'planner.repeatAnnually',
};

const REPEATS: PlannerRepeat[] = ['daily', 'everyOtherDay', 'weekly', 'everyOtherWeek', 'monthly', 'everyOtherMonth', 'annually'];

export const APPT_REPEAT_CHOICES: (PlannerRepeat | null)[] = [null, ...REPEATS];
export const REM_REPEAT_CHOICES: PlannerReminderRepeat[] = ['once', ...REPEATS];

export const repeatKey = (repeat: PlannerReminderRepeat | null | undefined): string => REPEAT_KEYS[repeat ?? 'once'];

export const remindKey = (minutes: number | undefined): string | null =>
  minutes == null ? null : (REMIND_CHOICES.find(c => c.minutes === minutes)?.key || 'planner.remindAtTime');

export const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export const monthGrid = (viewMonth: Date, weekStart: number): Date[] => {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() - weekStart + 7) % 7));
  return Array.from({length: 42}, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
};

export const weekdayInitials = (locale: string, weekStart: number): string[] => {
  const sunday = new Date(2026, 7, 2);
  return Array.from({length: 7}, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i + weekStart);
    return d.toLocaleDateString(locale, {weekday: 'narrow'});
  });
};

export const apptClock = (ts: number): string => {
  const d = new Date(ts);
  return fmtClock(d.getHours(), d.getMinutes());
};

const minutesOfDay = (ts: number): number => {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
};

export const appointmentsOn = (planner: PlannerData, day: Date): PlannerAppointment[] =>
  planner.appointments
    .filter(a => plannerOccursOnDay(a.time, a.repeat, day))
    .sort((a, b) => minutesOfDay(a.time) - minutesOfDay(b.time));

export const sortedReminders = (planner: PlannerData): PlannerReminder[] =>
  [...planner.reminders].sort((a, b) => (a.times[0] || '').localeCompare(b.times[0] || ''));

export interface AppointmentDraft {
  title: string;
  time: number;
  location: string;
  notes: string;
  remind: number | null;
  repeat: PlannerRepeat | null;
  color: string | null;
}

export const appointmentDraft = (a: PlannerAppointment | null, defaultTime: number): AppointmentDraft => ({
  title: a?.title || '',
  time: a?.time ?? defaultTime,
  location: a?.location || '',
  notes: a?.notes || '',
  remind: a ? (a.reminderMinutesBefore ?? null) : 30,
  repeat: a?.repeat ?? null,
  color: a?.color || null,
});

export const upsertAppointment = (planner: PlannerData, id: string | null, d: AppointmentDraft): {planner: PlannerData; entry: PlannerAppointment} | null => {
  const title = d.title.trim();
  if (!title || !Number.isFinite(d.time)) return null;
  const prior = id ? planner.appointments.find(x => x.id === id) : undefined;
  const entry: PlannerAppointment = {
    id: id || uid(),
    title,
    time: d.time,
    location: d.location.trim() || undefined,
    notes: d.notes.trim() || undefined,
    reminderMinutesBefore: d.remind ?? undefined,
    repeat: d.repeat ?? undefined,
    color: d.color ?? undefined,
    createdAt: prior?.createdAt ?? Date.now(),
  };
  return {planner: {...planner, appointments: [...planner.appointments.filter(x => x.id !== entry.id), entry]}, entry};
};

export interface ReminderDraft {
  title: string;
  times: string[];
  notes: string;
  repeat: PlannerReminderRepeat;
  start: number;
}

export const reminderDraft = (r: PlannerReminder | null, defaultStart: number): ReminderDraft => ({
  title: r?.title || '',
  times: r ? [...r.times] : [],
  notes: r?.notes || '',
  repeat: r?.repeat || 'daily',
  start: r ? (r.startDate ?? r.createdAt) : defaultStart,
});

export const upsertReminder = (planner: PlannerData, id: string | null, d: ReminderDraft): PlannerData | null => {
  const title = d.title.trim();
  if (!title || d.times.length === 0) return null;
  const prior = id ? planner.reminders.find(x => x.id === id) : undefined;
  const startDay = new Date(Number.isFinite(d.start) ? d.start : Date.now());
  startDay.setHours(0, 0, 0, 0);
  const entry: PlannerReminder = {
    id: id || uid(),
    title,
    times: d.times,
    enabled: prior?.enabled ?? true,
    notes: d.notes.trim() || undefined,
    repeat: d.repeat,
    startDate: startDay.getTime(),
    createdAt: prior?.createdAt ?? Date.now(),
  };
  return {...planner, reminders: [...planner.reminders.filter(x => x.id !== entry.id), entry]};
};

export const toggleReminder = (planner: PlannerData, id: string): PlannerData =>
  ({...planner, reminders: planner.reminders.map(x => (x.id === id ? {...x, enabled: !x.enabled} : x))});

export const removeAppointment = (planner: PlannerData, id: string): PlannerData =>
  ({...planner, appointments: planner.appointments.filter(x => x.id !== id)});

export const removeReminder = (planner: PlannerData, id: string): PlannerData =>
  ({...planner, reminders: planner.reminders.filter(x => x.id !== id)});

export const addReminderTime = (times: string[], time: string | null): string[] | null =>
  time && !times.includes(time) ? [...times, time].sort() : null;
