import notifee, {TimestampTrigger, RepeatFrequency} from 'react-native-notify-kit';
import {Platform} from 'react-native';
import {isResting} from '../model/restMode';
import type {RestMode} from '../model/restMode';
import type {PlannerReminderRepeat} from '../model/types';
import {notificationSettings} from './restMode';
import {PlannerData, plannerNextOccurrence, parseClock, fmtTime} from '../utils';
import {log} from '../utils/log';
import i18n from '../i18n/i18n';
import {REMINDER_ANDROID, cancelTriggersWithPrefix, setupReminderChannel, timestampTrigger} from './notify';

const FRONT_CHECK_NOTIF_ID = 'ps-front-check';

export const scheduleFrontCheckReminder = async (intervalHours: number, singlet = false) => {
  try {
    await cancelFrontCheckReminder();
    if (!Number.isFinite(intervalHours) || intervalHours < 1) return;
    const settings = await notificationSettings();
    if (settings?.notificationsEnabled === false) return;
    const title = singlet
      ? `◈ ${i18n.t('notification.statusCheck')}`
      : `◈ ${i18n.t('notification.frontCheck')}`;
    const body = singlet
      ? i18n.t('notification.whatsYourStatus')
      : i18n.t('notification.whosFronting');

    if (Platform.OS === 'android') {
      await setupReminderChannel();
      const trigger: TimestampTrigger = {
        ...timestampTrigger(Date.now() + intervalHours * 60 * 60 * 1000, RepeatFrequency.HOURLY),
        repeatInterval: Math.max(1, Math.round(intervalHours)),
      };
      await notifee.createTriggerNotification(
        {id: FRONT_CHECK_NOTIF_ID, title, body, android: REMINDER_ANDROID},
        trigger,
      );
      return;
    }

    if (intervalHours === 1 && !settings?.restMode?.enabled) {
      const trigger = timestampTrigger(Date.now() + 60 * 60 * 1000, RepeatFrequency.HOURLY);
      await notifee.createTriggerNotification(
        {id: FRONT_CHECK_NOTIF_ID, title, body},
        trigger,
      );
      return;
    }

    const slots = 24 % intervalHours === 0 ? 24 / intervalHours : 1;
    const effectiveInterval = 24 % intervalHours === 0 ? intervalHours : 24;
    for (let i = 0; i < slots; i++) {
      const timestamp = Date.now() + effectiveInterval * (i + 1) * 60 * 60 * 1000;
      if (isResting(settings?.restMode, timestamp)) continue;
      const trigger = timestampTrigger(timestamp, RepeatFrequency.DAILY);
      await notifee.createTriggerNotification(
        {id: `${FRONT_CHECK_NOTIF_ID}-${i}`, title, body},
        trigger,
      );
    }
  } catch (e) {
    log.error('notifications', 'Front-check schedule error:', e);
  }
};

export const cancelFrontCheckReminder = async () => {
  try {
    await notifee.cancelTriggerNotification(FRONT_CHECK_NOTIF_ID);
  } catch (e) {
    log.error('notifications', 'Front-check cancel error:', e);
  }
  await cancelTriggersWithPrefix(`${FRONT_CHECK_NOTIF_ID}-`);
};

const MED_ID_PREFIX = 'ps-med-';
const APPT_ID_PREFIX = 'ps-appt-';
const PLAN_APPT_ID_PREFIX = 'ps-plan-appt-';
const PLAN_REM_ID_PREFIX = 'ps-plan-rem-';

const nativeRepeatFor = (repeat: string | undefined): RepeatFrequency | undefined => {
  if (repeat === 'daily') return RepeatFrequency.DAILY;
  if (repeat === 'weekly') return RepeatFrequency.WEEKLY;
  return undefined;
};

const ARMED_OCCURRENCES = 6;
const NATIVE_SEARCH_MS = 370 * 86400000;

const clockMillis = (timestamp: number): number => {
  const date = new Date(timestamp);
  return ((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000;
};

const nextNotificationOccurrence = (
  anchor: number,
  repeat: PlannerReminderRepeat | undefined,
  after: number,
  restMode?: RestMode,
  offsetMs = 0,
  clock?: readonly [number, number],
  limit = after + NATIVE_SEARCH_MS,
): number | null => {
  // Cover a full DST cycle, without looping forever for permanently quiet series.
  for (;;) {
    const occurrence = plannerNextOccurrence(anchor, repeat, after, clock);
    if (occurrence === null || !Number.isFinite(occurrence) || occurrence <= after) return null;
    if (!nativeRepeatFor(repeat)) return occurrence;
    if (occurrence > limit) return null;
    if (!isResting(restMode, occurrence - offsetMs)) return occurrence;
    after = occurrence;
  }
};

export const cancelMedicalReminders = async () => {
  await cancelTriggersWithPrefix(MED_ID_PREFIX);
  await cancelTriggersWithPrefix(APPT_ID_PREFIX);
};

export const reschedulePlannerNotifications = async (planner: PlannerData | null) => {
  await cancelTriggersWithPrefix(PLAN_APPT_ID_PREFIX);
  await cancelTriggersWithPrefix(PLAN_REM_ID_PREFIX);
  if (!planner) return;
  try {
    const settings = await notificationSettings();
    if (settings?.notificationsEnabled === false) return;
    await setupReminderChannel();
    const now = Date.now();

    for (const appt of planner.appointments || []) {
      if (appt.reminderMinutesBefore == null || !Number.isFinite(appt.reminderMinutesBefore) || appt.reminderMinutesBefore < 0) continue;
      const offsetMs = appt.reminderMinutesBefore * 60 * 1000;
      const native = nativeRepeatFor(appt.repeat);
      const armed = appt.repeat ? ARMED_OCCURRENCES : 1;
      const alertClock = ((clockMillis(appt.time) - offsetMs) % 86400000 + 86400000) % 86400000;
      const searchLimit = Math.max(now + offsetMs, appt.time) + NATIVE_SEARCH_MS;
      let after = now + offsetMs;
      for (let k = 0; k < armed; k++) {
        const occurrence = nextNotificationOccurrence(appt.time, appt.repeat, after, settings?.restMode, offsetMs, undefined, searchLimit);
        if (occurrence == null) break;
        after = occurrence;
        if (isResting(settings?.restMode, occurrence - offsetMs)) continue;
        // A DST-shifted alert is a one-off; seed the native series at its normal clock.
        const repeating = native && clockMillis(occurrence - offsetMs) === alertClock ? native : undefined;
        const trigger = timestampTrigger(occurrence - offsetMs, repeating);
        await notifee.createTriggerNotification(
          {
            id: `${PLAN_APPT_ID_PREFIX}${appt.id}${k > 0 ? `-${k}` : ''}`,
            title: `🗓 ${appt.title}`,
            body: appt.location
              ? i18n.t('planner.notifApptAt', {time: fmtTime(occurrence), location: appt.location})
              : i18n.t('planner.notifAppt', {time: fmtTime(occurrence)}),
            android: REMINDER_ANDROID,
          },
          trigger,
        );
        if (repeating) break;
      }
    }

    for (const rem of planner.reminders || []) {
      if (!rem.enabled) continue;
      const repeat = rem.repeat || 'daily';
      for (let i = 0; i < (rem.times || []).length; i++) {
        const clock = parseClock(rem.times[i]);
        if (!clock) continue;
        const [hh, mm] = clock;
        if (hh > 23 || mm > 59) continue;
        const anchor = rem.startDate ?? rem.createdAt;
        const searchLimit = Math.max(now, anchor) + NATIVE_SEARCH_MS;
        const native = nativeRepeatFor(repeat);
        const armed = repeat === 'once' ? 1 : ARMED_OCCURRENCES;
        let after = now;
        for (let k = 0; k < armed; k++) {
          const occurrence = nextNotificationOccurrence(anchor, repeat, after, settings?.restMode, 0, clock, searchLimit);
          if (occurrence == null) break;
          after = occurrence;
          if (isResting(settings?.restMode, occurrence)) continue;
          const repeating = native && clockMillis(occurrence) === (hh * 60 + mm) * 60000 ? native : undefined;
          const trigger = timestampTrigger(occurrence, repeating);
          await notifee.createTriggerNotification(
            {
              id: `${PLAN_REM_ID_PREFIX}${rem.id}-${i}${k > 0 ? `-${k}` : ''}`,
              title: `⏰ ${rem.title}`,
              body: rem.notes || i18n.t('planner.notifReminder'),
              android: REMINDER_ANDROID,
            },
            trigger,
          );
          if (repeating) break;
        }
      }
    }
  } catch (e) {
    log.error('notifications', 'Planner reschedule error:', e);
  }
};
