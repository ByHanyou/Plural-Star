import type {PlannerReminderRepeat} from '../model/types';
import {DAY_MS, daysInMonth} from './time';

const plannerDayNumber = (d: Date): number => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;

export const plannerOccursOnDay = (anchorTs: number, repeat: PlannerReminderRepeat | undefined, day: Date): boolean => {
  const a = new Date(anchorTs);
  const diff = plannerDayNumber(day) - plannerDayNumber(a);
  if (repeat == null || repeat === 'once') return diff === 0;
  if (diff < 0) return false;
  switch (repeat) {
    case 'daily': return true;
    case 'everyOtherDay': return diff % 2 === 0;
    case 'weekly': return diff % 7 === 0;
    case 'everyOtherWeek': return diff % 14 === 0;
    case 'monthly':
    case 'everyOtherMonth': {
      const months = (day.getFullYear() - a.getFullYear()) * 12 + (day.getMonth() - a.getMonth());
      if (months < 0) return false;
      if (repeat === 'everyOtherMonth' && months % 2 !== 0) return false;
      const dom = Math.min(a.getDate(), daysInMonth(day.getFullYear(), day.getMonth()));
      return day.getDate() === dom;
    }
    case 'annually': {
      if (day.getFullYear() < a.getFullYear()) return false;
      if (day.getMonth() !== a.getMonth()) return false;
      const dom = Math.min(a.getDate(), daysInMonth(day.getFullYear(), day.getMonth()));
      return day.getDate() === dom;
    }
  }
};

export const plannerNextOccurrence = (anchorTs: number, repeat: PlannerReminderRepeat | undefined, after: number): number | null => {
  if (repeat == null || repeat === 'once') return anchorTs > after ? anchorTs : null;
  const a = new Date(anchorTs);
  const probe = new Date(after);
  probe.setHours(0, 0, 0, 0);
  for (let i = 0; i < 800; i++) {
    if (plannerOccursOnDay(anchorTs, repeat, probe)) {
      const cand = new Date(probe);
      cand.setHours(a.getHours(), a.getMinutes(), a.getSeconds(), 0);
      if (cand.getTime() > after) return cand.getTime();
    }
    probe.setDate(probe.getDate() + 1);
  }
  return null;
};
