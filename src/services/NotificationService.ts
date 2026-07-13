import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidStyle,
  TriggerType,
  TimeUnit,
  IntervalTrigger,
  TimestampTrigger,
  RepeatFrequency,
} from '@notifee/react-native';
import {Platform} from 'react-native';
import {FrontState, Member, Medication, MedicalAppointment, fmtDur, fmtTime} from '../utils';
import {logError} from '../utils/log';
import {endFrontLiveActivity, updateFrontLiveActivity} from './LiveActivityService';
import {NetworkManager} from '../network/NetworkManager';
import {MAX_NOTIF_FRIENDS, Friend, FrontShare} from '../network/types';
import i18n from '../i18n/i18n';

export const NOTIF_CHANNEL_ID = 'plural-space-front';
export const NOTIF_ID = 'ps-front-status';
export const FRIEND_NOTIF_PREFIX = 'ps-friend-';
export const FRONT_GROUP_ID = 'ps-front-group';
export const FRONT_SUMMARY_ID = 'ps-front-summary';

export const REMINDER_CHANNEL_ID = 'plural-space-reminders';
export const FRONT_CHECK_NOTIF_ID = 'ps-front-check';
export const NOTEBOARD_NOTIF_ID = 'ps-noteboard-unread';
export const FRIEND_ALERT_CHANNEL_ID = 'plural-space-friend-alerts';
export const FRIEND_ALERT_PREFIX = 'ps-friend-alert-';

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

export const setupFriendAlertChannel = async () => {
  await notifee.createChannel({
    id: FRIEND_ALERT_CHANNEL_ID,
    name: 'Friend Updates',
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
  });
};

let emergencyLine: string | null = null;
export const setEmergencyNotificationInfo = (line: string | null) => {
  emergencyLine = line;
};

const resolveNames = (ids: string[], members: Member[]): string =>
  ids.map(id => members.find(m => m.id === id)?.name).filter(Boolean).join(', ');

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

const buildFrontContent = (front: FrontState, members: Member[]): {title: string; body: string; bigText: string} | null => {
  const primaryIds = getTierIds(front, 'primary');
  const coFrontIds = getTierIds(front, 'coFront');
  const coConsciousIds = getTierIds(front, 'coConscious');

  if (primaryIds.length === 0 && coFrontIds.length === 0 && coConsciousIds.length === 0) return null;

  const primaryNames = resolveNames(primaryIds, members);
  const coFrontNames = resolveNames(coFrontIds, members);
  const coConsciousNames = resolveNames(coConsciousIds, members);

  const duration = fmtDur(front.startTime);
  const titleNames = primaryNames || coFrontNames || coConsciousNames ||
    i18n.t('common.unknown', {defaultValue: 'Unknown'});
  const title = `◈ ${titleNames}  ·  ${duration}`;

  const lines: string[] = [];
  if (primaryNames)
    lines.push(i18n.t('notification.primary', {names: primaryNames, defaultValue: `Primary: ${primaryNames}`}));
  if (coFrontNames)
    lines.push(i18n.t('notification.coFront', {names: coFrontNames, defaultValue: `Co-Front: ${coFrontNames}`}));
  if (coConsciousNames)
    lines.push(i18n.t('notification.coConscious', {names: coConsciousNames, defaultValue: `Co-Conscious: ${coConsciousNames}`}));

  const primaryMood = getTierField(front, 'primary', 'mood');
  const primaryLocation = getTierField(front, 'primary', 'location');
  const primaryNote = getTierField(front, 'primary', 'note');

  if (primaryMood)
    lines.push(i18n.t('notification.mood', {mood: primaryMood, defaultValue: `Mood: ${primaryMood}`}));
  if (primaryLocation)
    lines.push(i18n.t('notification.at', {location: primaryLocation, defaultValue: `At: ${primaryLocation}`}));
  if (primaryNote)
    lines.push(i18n.t('notification.note', {note: primaryNote, defaultValue: `Note: ${primaryNote}`}));
  lines.push(i18n.t('notification.since', {time: fmtTime(front.startTime), defaultValue: `Since ${fmtTime(front.startTime)}`}));

  if (emergencyLine) lines.push(emergencyLine);

  const summaryParts: string[] = [];
  if (emergencyLine) summaryParts.push(emergencyLine);
  if (coFrontNames)
    summaryParts.push(i18n.t('notification.cfShort', {names: coFrontNames, defaultValue: `CF: ${coFrontNames}`}));
  if (coConsciousNames)
    summaryParts.push(i18n.t('notification.ccShort', {names: coConsciousNames, defaultValue: `CC: ${coConsciousNames}`}));
  if (primaryMood)
    summaryParts.push(i18n.t('notification.mood', {mood: primaryMood, defaultValue: `Mood: ${primaryMood}`}));
  summaryParts.push(duration);

  return {title, body: summaryParts.join('  ·  '), bigText: lines.join('\n')};
};

const frontAndroidConfig = (ownBigText: string, friendLines: string[], fallback: string) => {
  const base = {
    channelId: NOTIF_CHANNEL_ID,
    ongoing: true,
    onlyAlertOnce: true,
    autoCancel: false,
    smallIcon: 'ic_stat_notification',
    importance: AndroidImportance.LOW,
    visibility: AndroidVisibility.PUBLIC,
    pressAction: {id: 'default'},
    color: '#DAA520',
    groupId: FRONT_GROUP_ID,
    sortKey: '0',
  };
  if (friendLines.length === 0) {
    const ownLines = (ownBigText ? ownBigText.split('\n') : []).slice(0, 6);
    return {
      ...base,
      style: {type: AndroidStyle.INBOX as const, lines: ownLines.length ? ownLines : [fallback]},
    };
  }
  let ownLines = ownBigText ? ownBigText.split('\n') : [];
  if (ownLines.length + friendLines.length > 6) {
    ownLines = ownLines.slice(0, Math.max(1, 6 - friendLines.length));
  }
  const lines = [...ownLines, ...friendLines].slice(0, 6);
  return {
    ...base,
    style: {type: AndroidStyle.INBOX as const, lines},
  };
};

let fgsBound = false;

const buildFriendLines = (): string[] => {
  const st = NetworkManager.getState();
  if (!st.enabled) return [];
  const lines: string[] = [];
  for (const f of st.friends) {
    if (lines.length >= MAX_NOTIF_FRIENDS) break;
    if (!f.showInNotification || f.status !== 'accepted') continue;
    const s = f.lastStatus;
    if (!s || !s.fronters) continue;
    const dur = s.startTime ? fmtDur(s.startTime) : '';
    lines.push(`◈ ${f.displayName}: ${s.fronters}${dur ? `  ·  ${dur}` : ''}`);
  }
  return lines;
};

const friendStatusLines = (s: FrontShare): string[] => {
  const lines: string[] = [];
  if (s.primary || s.coFront || s.coConscious) {
    if (s.primary) lines.push(i18n.t('notification.primary', {names: s.primary, defaultValue: `Primary: ${s.primary}`}));
    if (s.coFront) lines.push(i18n.t('notification.coFront', {names: s.coFront, defaultValue: `Co-Front: ${s.coFront}`}));
    if (s.coConscious) lines.push(i18n.t('notification.coConscious', {names: s.coConscious, defaultValue: `Co-Conscious: ${s.coConscious}`}));
  } else {
    lines.push(s.fronters);
  }
  if (s.mood) lines.push(i18n.t('notification.mood', {mood: s.mood, defaultValue: `Mood: ${s.mood}`}));
  if (s.location) lines.push(i18n.t('notification.at', {location: s.location, defaultValue: `At: ${s.location}`}));
  if (s.note) lines.push(i18n.t('notification.note', {note: s.note, defaultValue: `Note: ${s.note}`}));
  if (s.startTime) lines.push(i18n.t('notification.since', {time: fmtTime(s.startTime), defaultValue: `Since ${fmtTime(s.startTime)}`}));
  return lines;
};

const buildFriendNotifs = (): {id: string; title: string; body: string; big: string}[] => {
  const st = NetworkManager.getState();
  if (!st.enabled) return [];
  const out: {id: string; title: string; body: string; big: string}[] = [];
  for (const f of st.friends) {
    if (out.length >= MAX_NOTIF_FRIENDS) break;
    if (!f.showInNotification || f.status !== 'accepted') continue;
    const s = f.lastStatus;
    if (!s || !s.fronters) continue;
    const dur = s.startTime ? fmtDur(s.startTime) : '';
    const lines = friendStatusLines(s);
    out.push({
      id: `${FRIEND_NOTIF_PREFIX}${f.peerId}`,
      title: f.displayName,
      body: `${s.fronters}${dur ? `  ·  ${dur}` : ''}`,
      big: lines.join('\n'),
    });
  }
  return out;
};

export const showFriendUpdateAlert = async (f: Friend) => {
  if (Platform.OS !== 'android') return;
  if (!NetworkManager.getState().enabled) return;
  const s = f.lastStatus;
  if (!s || !s.fronters) return;
  await setupFriendAlertChannel();
  const dur = s.startTime ? fmtDur(s.startTime) : '';
  const lines = friendStatusLines(s);
  await notifee.displayNotification({
    id: `${FRIEND_ALERT_PREFIX}${f.peerId}`,
    title: f.displayName,
    body: `${s.fronters}${dur ? `  ·  ${dur}` : ''}`,
    android: {
      channelId: FRIEND_ALERT_CHANNEL_ID,
      ongoing: false,
      autoCancel: true,
      onlyAlertOnce: false,
      smallIcon: 'ic_stat_notification',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      pressAction: {id: 'default'},
      color: '#DAA520',
      style: {type: AndroidStyle.INBOX as const, lines: lines.slice(0, 6)},
    },
  });
};

const cancelStaleFriendNotifs = async (keepIds: Set<string>) => {
  try {
    const displayed = await notifee.getDisplayedNotifications();
    for (const d of displayed) {
      const nid = (d as any).notification?.id || (d as any).id;
      if (nid && typeof nid === 'string' && nid.startsWith(FRIEND_NOTIF_PREFIX) && !keepIds.has(nid)) {
        try { await notifee.cancelNotification(nid); } catch (e) { logError('notif', e); }
      }
    }
  } catch (e) { logError('notif', e); }
};

const syncFriendNotifications = async (desired = buildFriendNotifs()) => {
  await cancelStaleFriendNotifs(new Set(desired.map(d => d.id)));
  for (let i = 0; i < desired.length; i++) {
    const d = desired[i];
    await notifee.displayNotification({
      id: d.id,
      title: d.title,
      body: d.body,
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
        groupId: FRONT_GROUP_ID,
        sortKey: `1${String(i).padStart(4, '0')}`,
        style: {type: AndroidStyle.INBOX as const, lines: (d.big || d.body).split('\n').slice(0, 6)},
      },
    });
  }
};

export const showFrontNotification = async (
  front: FrontState | null,
  members: Member[],
  systemName = 'Plural Star',
) => {
  try {
    if (Platform.OS === 'ios') {
      const friendLines = buildFriendLines();
      await updateFrontLiveActivity(front, members, systemName, friendLines.join('\n') || undefined);
      return;
    }

    const netOn = NetworkManager.getState().enabled;
    const content = front ? buildFrontContent(front, members) : null;

    if (!content && !netOn && !emergencyLine) {
      await clearFrontNotification();
      return;
    }

    await setupNotificationChannel();

    if (!netOn && fgsBound) {
      await notifee.stopForegroundService();
      fgsBound = false;
    }

    const onlineLabel = i18n.t('network.status.online', {defaultValue: 'Online'});
    const title = content ? content.title : systemName;
    const body = content ? content.body : (emergencyLine || onlineLabel);
    const ownBig = content ? content.bigText : (emergencyLine || '');

    const friendNotifs = buildFriendNotifs();
    await syncFriendNotifications(friendNotifs);
    if (friendNotifs.length > 0) {
      await notifee.displayNotification({
        id: FRONT_SUMMARY_ID,
        title: systemName,
        body,
        android: {
          channelId: NOTIF_CHANNEL_ID,
          groupId: FRONT_GROUP_ID,
          groupSummary: true,
          ongoing: true,
          onlyAlertOnce: true,
          autoCancel: false,
          smallIcon: 'ic_stat_notification',
          importance: AndroidImportance.LOW,
          visibility: AndroidVisibility.PUBLIC,
          pressAction: {id: 'default'},
          color: '#DAA520',
        },
      });
    } else {
      try { await notifee.cancelNotification(FRONT_SUMMARY_ID); } catch (e) { logError('notif', e); }
    }

    await notifee.displayNotification({
      id: NOTIF_ID,
      title,
      body,
      android: {...frontAndroidConfig(ownBig, [], onlineLabel), asForegroundService: netOn},
    });
    if (netOn) fgsBound = true;
  } catch (e) {
    console.error('[PluralSpace] Notification error:', e);
  }
};

export const scheduleFrontNotificationRefresh = async (
  front: FrontState | null,
  members: Member[],
  intervalMinutes: number,
) => {
  try {
    await cancelFrontNotificationRefresh();
    if (Platform.OS !== 'android') return;
    if (!front || !intervalMinutes || intervalMinutes < 15) return;
    const content = buildFrontContent(front, members);
    if (!content) return;
    await setupNotificationChannel();
    const trigger: IntervalTrigger = {
      type: TriggerType.INTERVAL,
      interval: intervalMinutes,
      timeUnit: TimeUnit.MINUTES,
    };
    await notifee.createTriggerNotification(
      {
        id: NOTIF_ID,
        title: content.title,
        body: content.body,
        android: {...frontAndroidConfig(content.bigText, [], content.body), asForegroundService: NetworkManager.getState().enabled},
      },
      trigger,
    );
  } catch (e) {
    console.error('[PluralSpace] Notification refresh schedule error:', e);
  }
};

export const cancelFrontNotificationRefresh = async () => {
  try {
    await notifee.cancelTriggerNotification(NOTIF_ID);
  } catch (e) {
    console.error('[PluralSpace] Notification refresh cancel error:', e);
  }
};

export const clearFrontNotification = async () => {
  try {
    if (Platform.OS === 'ios') {
      await endFrontLiveActivity();
      return;
    }
    try { await notifee.cancelTriggerNotification(NOTIF_ID); } catch (e) { logError('notif', e); }
    await notifee.cancelNotification(NOTIF_ID);
    await notifee.cancelNotification(FRONT_SUMMARY_ID);
    await cancelStaleFriendNotifs(new Set());
    try { await notifee.stopForegroundService(); } catch (e) { logError('notif', e); }
    fgsBound = false;
  } catch (e) {
    console.error('[PluralSpace] Clear notification error:', e);
  }
};

export const scheduleFrontCheckReminder = async (intervalHours: number, singlet = false) => {
  try {
    await cancelFrontCheckReminder();
    if (!intervalHours || intervalHours <= 0) return;
    const title = singlet
      ? `◈ ${i18n.t('notification.statusCheck', {defaultValue: 'Status Check'})}`
      : `◈ ${i18n.t('notification.frontCheck', {defaultValue: 'Front Check'})}`;
    const body = singlet
      ? i18n.t('notification.whatsYourStatus', {defaultValue: "What's your status right now?"})
      : i18n.t('notification.whosFronting', {defaultValue: "Who's fronting right now?"});
    const androidConfig = {
      channelId: REMINDER_CHANNEL_ID,
      smallIcon: 'ic_stat_notification',
      importance: AndroidImportance.DEFAULT,
      visibility: AndroidVisibility.PUBLIC,
      pressAction: {id: 'default'},
      color: '#DAA520',
    };

    if (Platform.OS === 'android') {
      await setupReminderChannel();
      const trigger: IntervalTrigger = {
        type: TriggerType.INTERVAL,
        interval: intervalHours,
        timeUnit: TimeUnit.HOURS,
      };
      await notifee.createTriggerNotification(
        {id: FRONT_CHECK_NOTIF_ID, title, body, android: androidConfig},
        trigger,
      );
      return;
    }

    if (intervalHours === 1) {
      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: Date.now() + 60 * 60 * 1000,
        repeatFrequency: RepeatFrequency.HOURLY,
      };
      await notifee.createTriggerNotification(
        {id: FRONT_CHECK_NOTIF_ID, title, body},
        trigger,
      );
      return;
    }

    const slots = 24 % intervalHours === 0 ? 24 / intervalHours : 1;
    const effectiveInterval = 24 % intervalHours === 0 ? intervalHours : 24;
    for (let i = 0; i < slots; i++) {
      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: Date.now() + effectiveInterval * (i + 1) * 60 * 60 * 1000,
        repeatFrequency: RepeatFrequency.DAILY,
      };
      await notifee.createTriggerNotification(
        {id: `${FRONT_CHECK_NOTIF_ID}-${i}`, title, body},
        trigger,
      );
    }
  } catch (e) {
    console.error('[PluralSpace] Front-check schedule error:', e);
  }
};

export const cancelFrontCheckReminder = async () => {
  try {
    await notifee.cancelTriggerNotification(FRONT_CHECK_NOTIF_ID);
    const ids = await notifee.getTriggerNotificationIds();
    await Promise.all(ids.filter(id => id.startsWith(`${FRONT_CHECK_NOTIF_ID}-`)).map(id => notifee.cancelTriggerNotification(id)));
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

const MED_ID_PREFIX = 'ps-med-';
const APPT_ID_PREFIX = 'ps-appt-';

const nextDailyOccurrence = (hhmm: string): number => {
  const [hh, mm] = hhmm.split(':').map(Number);
  const next = new Date();
  next.setHours(hh, mm, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  return next.getTime();
};

const cancelTriggersWithPrefix = async (prefix: string) => {
  try {
    const ids = await notifee.getTriggerNotificationIds();
    await Promise.all(ids.filter(id => id.startsWith(prefix)).map(id => notifee.cancelTriggerNotification(id)));
  } catch (e) {
    console.error('[PluralSpace] Trigger cancel error:', e);
  }
};

export const rescheduleMedicationReminders = async (medications: Medication[]) => {
  try {
    await cancelTriggersWithPrefix(MED_ID_PREFIX);
    await setupReminderChannel();
    for (const med of medications) {
      if (!med.enabled) continue;
      for (let i = 0; i < med.times.length; i++) {
        const trigger: TimestampTrigger = {
          type: TriggerType.TIMESTAMP,
          timestamp: nextDailyOccurrence(med.times[i]),
          repeatFrequency: RepeatFrequency.DAILY,
        };
        await notifee.createTriggerNotification(
          {
            id: `${MED_ID_PREFIX}${med.id}-${i}`,
            title: `💊 ${i18n.t('medical.medReminderTitle', {defaultValue: 'Medication Reminder'})}`,
            body: [med.name, med.dosage].filter(Boolean).join(' · '),
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
      }
    }
  } catch (e) {
    console.error('[PluralSpace] Medication reminder schedule error:', e);
  }
};

export const rescheduleAppointmentReminders = async (appointments: MedicalAppointment[]) => {
  try {
    await cancelTriggersWithPrefix(APPT_ID_PREFIX);
    await setupReminderChannel();
    for (const appt of appointments) {
      const fireAt = appt.time - (appt.reminderMinutesBefore || 0) * 60 * 1000;
      if (fireAt <= Date.now()) continue;
      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: fireAt,
      };
      await notifee.createTriggerNotification(
        {
          id: `${APPT_ID_PREFIX}${appt.id}`,
          title: `📅 ${i18n.t('medical.apptReminderTitle', {defaultValue: 'Appointment Reminder'})}`,
          body: [appt.title, fmtTime(appt.time), appt.location].filter(Boolean).join(' · '),
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
    }
  } catch (e) {
    console.error('[PluralSpace] Appointment reminder schedule error:', e);
  }
};

export const showChatPingNotification = async (
  channelName: string,
  speakerName: string,
  preview: string,
) => {
  try {
    if (Platform.OS !== 'android') return;
    await setupReminderChannel();
    const safePreview = (preview || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    const title = i18n.t('notification.chatPingTitle', {
      speaker: speakerName,
      channel: channelName,
      defaultValue: `◆ ${speakerName} pinged you in #${channelName}`,
    });
    const body = safePreview
      ? i18n.t('notification.chatPingBody', {preview: safePreview, defaultValue: safePreview})
      : i18n.t('notification.chatPingBodyEmpty', {defaultValue: 'Tap to view the message.'});
    await notifee.displayNotification({
      id: `ps-chat-ping-${Date.now()}`,
      title,
      body,
      android: {
        channelId: REMINDER_CHANNEL_ID,
        smallIcon: 'ic_stat_notification',
        importance: AndroidImportance.DEFAULT,
        visibility: AndroidVisibility.PUBLIC,
        pressAction: {id: 'default'},
        color: '#DAA520',
        style: safePreview ? {type: AndroidStyle.BIGTEXT, text: safePreview} : undefined,
      },
    });
  } catch (e) {
    console.error('[PluralSpace] Chat ping notification error:', e);
  }
};
