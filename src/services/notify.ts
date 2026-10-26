import notifee, {
  AndroidImportance,
  AndroidVisibility,
  TriggerType,
  AlarmType,
  TimestampTrigger,
  RepeatFrequency,
} from 'react-native-notify-kit';
import {fmtDur} from '../utils';
import {log} from '../utils/log';
import {FrontShare} from '../network/types';
import i18n from '../i18n/i18n';

const REMINDER_CHANNEL_ID = 'plural-space-reminders';

const NOTIF_COLOR = '#DAA520';

export const ANDROID_BASE = {
  smallIcon: 'ic_stat_notification',
  visibility: AndroidVisibility.PUBLIC,
  pressAction: {id: 'default'},
  color: NOTIF_COLOR,
};

export const REMINDER_ANDROID = {
  ...ANDROID_BASE,
  channelId: REMINDER_CHANNEL_ID,
  importance: AndroidImportance.DEFAULT,
};

export const timestampTrigger = (timestamp: number, repeatFrequency?: RepeatFrequency): TimestampTrigger => ({
  type: TriggerType.TIMESTAMP,
  timestamp,
  repeatFrequency,
  alarmManager: {type: AlarmType.SET_AND_ALLOW_WHILE_IDLE},
});

export const cancelTriggersWithPrefix = async (prefix: string) => {
  try {
    const ids = await notifee.getTriggerNotificationIds();
    await Promise.all(ids.filter(id => id.startsWith(prefix)).map(id => notifee.cancelTriggerNotification(id)));
  } catch (e) {
    log.error('notifications', 'Trigger cancel error:', e);
  }
};

export const setupReminderChannel = async () => {
  await notifee.createChannel({
    id: REMINDER_CHANNEL_ID,
    name: i18n.t('planner.reminders'),
    importance: AndroidImportance.DEFAULT,
    visibility: AndroidVisibility.PUBLIC,
  });
};

export const durSuffix = (s: FrontShare): string => (s.startTime && s.startTime > 0 ? `  ·  ${fmtDur(s.startTime)}` : '');
