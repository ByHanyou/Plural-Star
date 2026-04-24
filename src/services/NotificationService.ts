// src/services/NotificationService.ts
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

// Separate channel and ID for reminder-style notifications. Default importance so they
// actually ping (front status is LOW importance for the persistent card).
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

// Safety: extract memberIds from a tier, handling both new and old format
const getTierIds = (front: any, tier: string): string[] => {
  // New tiered format: front.primary.memberIds, front.coFront.memberIds, etc.
  if (front?.[tier]?.memberIds && Array.isArray(front[tier].memberIds)) {
    return front[tier].memberIds;
  }
  // Old flat format fallback: front.memberIds (only applies to primary)
  if (tier === 'primary' && Array.isArray(front?.memberIds)) {
    return front.memberIds;
  }
  return [];
};

const getTierField = (front: any, tier: string, field: string): string | undefined => {
  // New format
  if (front?.[tier]?.[field] !== undefined) return front[tier][field];
  // Old format fallback (primary only)
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

    // Check emptiness safely (handles both old and new format)
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

    // Body lines for bigText expansion
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

    // Collapsed summary
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
        smallIcon: 'ic_notif',
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
  } catch (e) {
    console.error('[PluralSpace] Clear notification error:', e);
  }
};

// ── Front-check reminder ──────────────────────────────────────────────────
// Schedules a recurring local notification at a user-chosen hour interval.
// Valid intervals: 1, 2, 4, 8, 12, 24 hours. Any value <= 0 cancels the reminder.
// Uses IntervalTrigger because repeatFrequency on TimestampTrigger is limited to
// HOURLY/DAILY/WEEKLY constants and can't express 2/4/8/12 hour spacings.
export const scheduleFrontCheckReminder = async (intervalHours: number) => {
  try {
    await cancelFrontCheckReminder();
    if (!intervalHours || intervalHours <= 0) return;
    if (Platform.OS !== 'android') return; // iOS handled via Live Activity / foreground notifs elsewhere
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
          smallIcon: 'ic_notif',
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

// ── Noteboard unread-notes notification ───────────────────────────────────
// Fires when fronting members have unread noteboard entries waiting for them.
// The "read" marker is per-member and is only updated when that member scrolls
// or taps a note in their own noteboard (see modals/index.tsx).
//
// `entries` shape: array of {memberName, unreadCount} — one row per fronting
// member who has unread notes. A single combined notification is displayed
// regardless of how many members qualify.
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
    // Summary line (collapsed view): "Alex (3), Jordan (1)"
    const summary = entries.map(e => `${e.memberName} (${e.unreadCount})`).join(', ');
    // BIGTEXT expanded view: one line per member
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
        smallIcon: 'ic_notif',
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
