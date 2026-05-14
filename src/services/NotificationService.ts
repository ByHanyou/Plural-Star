import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidStyle,
  TriggerType,
  TimeUnit,
  IntervalTrigger,
} from '@notifee/react-native';
import {Platform} from 'react-native';
import {FrontState, Member, fmtDur, fmtTime} from '../utils';
import {endFrontLiveActivity, updateFrontLiveActivity} from './LiveActivityService';
import i18n from '../i18n/i18n';

export const NOTIF_CHANNEL_ID = 'plural-space-front';
export const NOTIF_ID = 'ps-front-status';

export const REMINDER_CHANNEL_ID = 'plural-space-reminders';
export const FRONT_CHECK_NOTIF_ID = 'ps-front-check';
export const NOTEBOARD_NOTIF_ID = 'ps-noteboard-unread';

export const setupNotificationChannel = async () => {
  await notifee.createChannel({
    id: NOTIF_CHANNEL_ID,
    name: 'Front Status',
    importance: AndroidImportance.LOW,
    visibility: AndroidVisibility.PUBLIC,
    sound: '',
  });
};

export const setupReminderChannel = async () => {
  await notifee.createChannel({
    id: REMINDER_CHANNEL_ID,
    name: 'Reminders',
    importance: AndroidImportance.DEFAULT,
    visibility: AndroidVisibility.PUBLIC,
  });
};

const resolveNames = (ids: string[], members: Member[]): string =>
  ids.map(id => members.find(m => m.id === id)?.name || '?').join(', ');

const getTierIds = (front: any, tier: string): string[] => {
  if (front?.[tier]?.memberIds && Array.isArray(front[tier].memberIds)) {
    return front[tier].memberIds;
  }
  if (tier === 'primary' && Array.isArray(front?.memberIds)) {
    return front.memberIds;
  }
  return [];
};

const getTierField = (front: any, tier: string, field: string): string | undefined => {
  if (front?.[tier]?.[field] !== undefined) return front[tier][field];
  if (tier === 'primary' && front?.[field] !== undefined) return front[field];
  return undefined;
};

export const showFrontNotification = async (
  front: FrontState | null,
  members: Member[],
  systemName = 'Plural Star',
) => {
  try {
    if (Platform.OS === 'ios') {
      await updateFrontLiveActivity(front, members, systemName);
      return;
    }

    if (!front) {
      await clearFrontNotification();
      return;
    }

    const primaryIds = getTierIds(front, 'primary');
    const coFrontIds = getTierIds(front, 'coFront');
    const coConsciousIds = getTierIds(front, 'coConscious');

    if (primaryIds.length === 0 && coFrontIds.length === 0 && coConsciousIds.length === 0) {
      await clearFrontNotification();
      return;
    }

    await setupNotificationChannel();

    const primaryNames = resolveNames(primaryIds, members);
    const coFrontNames = resolveNames(coFrontIds, members);
    const coConsciousNames = resolveNames(coConsciousIds, members);

    const duration = fmtDur(front.startTime);
    const titleNames = primaryNames || coFrontNames || coConsciousNames || 'Unknown';
    const title = `◈ ${titleNames}  ·  ${duration}`;

    const lines: string[] = [];
    if (primaryIds.length > 0) lines.push(`Primary: ${primaryNames}`);
    if (coFrontIds.length > 0) lines.push(`Co-Front: ${coFrontNames}`);
    if (coConsciousIds.length > 0) lines.push(`Co-Conscious: ${coConsciousNames}`);

    const primaryMood = getTierField(front, 'primary', 'mood');
    const primaryLocation = getTierField(front, 'primary', 'location');
    const primaryNote = getTierField(front, 'primary', 'note');

    if (primaryMood) lines.push(`Mood: ${primaryMood}`);
    if (primaryLocation) lines.push(`At: ${primaryLocation}`);
    if (primaryNote) lines.push(`Note: ${primaryNote}`);
    lines.push(`Since ${fmtTime(front.startTime)}`);

    const summaryParts: string[] = [];
    if (coFrontIds.length > 0) summaryParts.push(`CF: ${coFrontNames}`);
    if (coConsciousIds.length > 0) summaryParts.push(`CC: ${coConsciousNames}`);
    if (primaryMood) summaryParts.push(`Mood: ${primaryMood}`);
    summaryParts.push(duration);
    const summary = summaryParts.join('  ·  ');

    await notifee.displayNotification({
      id: NOTIF_ID,
      title,
      body: summary,
      android: {
        channelId: NOTIF_CHANNEL_ID,
        ongoing: true,
        onlyAlertOnce: true,
        autoCancel: false,
        smallIcon: 'ic_stat_notification',
        importance: AndroidImportance.LOW,
        visibility: AndroidVisibility.PUBLIC,
        pressAction: {id: 'default'},
        color: '#DAA520',
        style: {
          type: AndroidStyle.BIGTEXT,
          text: lines.join('\n'),
        },
      },
    });
  } catch (e) {
    console.error('[PluralSpace] Notification error:', e);
  }
};

export const clearFrontNotification = async () => {
  try {
    if (Platform.OS === 'ios') {
      await endFrontLiveActivity();
      return;
    }
    await notifee.cancelNotification(NOTIF_ID);
    try { await notifee.stopForegroundService(); } catch {}
  } catch (e) {
    console.error('[PluralSpace] Clear notification error:', e);
  }
};

export const scheduleFrontCheckReminder = async (intervalHours: number) => {
  try {
    await cancelFrontCheckReminder();
    if (!intervalHours || intervalHours <= 0) return;
    if (Platform.OS !== 'android') return;
    await setupReminderChannel();
    const trigger: IntervalTrigger = {
      type: TriggerType.INTERVAL,
      interval: intervalHours,
      timeUnit: TimeUnit.HOURS,
    };
    await notifee.createTriggerNotification(
      {
        id: FRONT_CHECK_NOTIF_ID,
        title: `◈ ${i18n.t('notification.frontCheck', {defaultValue: 'Front Check'})}`,
        body: i18n.t('notification.whosFronting', {defaultValue: "Who's fronting right now?"}),
        android: {
          channelId: REMINDER_CHANNEL_ID,
          smallIcon: 'ic_stat_notification',
          importance: AndroidImportance.DEFAULT,
          visibility: AndroidVisibility.PUBLIC,
          pressAction: {id: 'default'},
          color: '#DAA520',
        },
      },
      trigger,
    );
  } catch (e) {
    console.error('[PluralSpace] Front-check schedule error:', e);
  }
};

export const cancelFrontCheckReminder = async () => {
  try {
    await notifee.cancelTriggerNotification(FRONT_CHECK_NOTIF_ID);
  } catch (e) {
    console.error('[PluralSpace] Front-check cancel error:', e);
  }
};

export const showNoteboardNotification = async (
  entries: {memberName: string; unreadCount: number}[],
) => {
  try {
    if (Platform.OS !== 'android') return;
    if (!entries || entries.length === 0) return;
    await setupReminderChannel();
    const totalNotes = entries.reduce((sum, e) => sum + e.unreadCount, 0);
    const title = i18n.t('notification.noteboardUnreadTitle', {
      count: totalNotes,
      defaultValue: totalNotes === 1 ? '◇ 1 unread note' : `◇ ${totalNotes} unread notes`,
    });
    const summary = entries.map(e => `${e.memberName} (${e.unreadCount})`).join(', ');
    const bigLines = entries.map(e => {
      const label = i18n.t('notification.noteboardUnreadLine', {
        name: e.memberName,
        count: e.unreadCount,
        defaultValue: e.unreadCount === 1
          ? `${e.memberName}: 1 new note`
          : `${e.memberName}: ${e.unreadCount} new notes`,
      });
      return label;
    }).join('\n');
    await notifee.displayNotification({
      id: NOTEBOARD_NOTIF_ID,
      title,
      body: summary,
      android: {
        channelId: REMINDER_CHANNEL_ID,
        smallIcon: 'ic_stat_notification',
        importance: AndroidImportance.DEFAULT,
        visibility: AndroidVisibility.PUBLIC,
        pressAction: {id: 'default'},
        color: '#DAA520',
        style: {type: AndroidStyle.BIGTEXT, text: bigLines},
      },
    });
  } catch (e) {
    console.error('[PluralSpace] Noteboard notification error:', e);
  }
};

export const clearNoteboardNotification = async () => {
  try {
    await notifee.cancelNotification(NOTEBOARD_NOTIF_ID);
  } catch (e) {
    console.error('[PluralSpace] Noteboard notification clear error:', e);
  }
};
