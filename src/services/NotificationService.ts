import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidStyle,
  TriggerType,
  AlarmType,
  TimestampTrigger,
  RepeatFrequency,
} from 'react-native-notify-kit';
import {AppState, Platform} from 'react-native';
import {FrontState, Member, Medication, MedicalAppointment, PlannerData, plannerNextOccurrence, fmtDur, fmtTime, frontSessionStart, truncateRunes, translateMood} from '../utils';
import {logError} from '../utils/log';
import {endFrontLiveActivity, updateFrontLiveActivity} from './LiveActivityService';
import {NetworkManager} from '../network/NetworkManager';
import {MAX_NOTIF_FRIENDS, Friend, FrontShare, friendNotifyLevel} from '../network/types';
import i18n from '../i18n/i18n';

const NOTIF_CHANNEL_ID = 'plural-space-front';
export const NOTIF_ID = 'ps-front-status';
const FRIEND_NOTIF_PREFIX = 'ps-friend-';
const FRONT_SUMMARY_ID = 'ps-front-summary';

const REMINDER_CHANNEL_ID = 'plural-space-reminders';
const FRONT_CHECK_NOTIF_ID = 'ps-front-check';
const NOTEBOARD_NOTIF_ID = 'ps-noteboard-unread';
const FRIEND_ALERT_CHANNEL_ID = 'plural-space-friend-alerts';
const FRIEND_ALERT_PREFIX = 'ps-friend-alert-';

const setupNotificationChannel = async () => {
  await notifee.createChannel({
    id: NOTIF_CHANNEL_ID,
    name: i18n.t('notification.channelFront'),
    importance: AndroidImportance.LOW,
    visibility: AndroidVisibility.PUBLIC,
    sound: '',
  });
};

const setupReminderChannel = async () => {
  await notifee.createChannel({
    id: REMINDER_CHANNEL_ID,
    name: i18n.t('planner.reminders'),
    importance: AndroidImportance.DEFAULT,
    visibility: AndroidVisibility.PUBLIC,
  });
};

const setupFriendAlertChannel = async () => {
  await notifee.createChannel({
    id: FRIEND_ALERT_CHANNEL_ID,
    name: i18n.t('notification.channelFriends'),
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

const resolveNamesWithSince = (ids: string[], members: Member[], front: FrontState): string =>
  ids.map(id => {
    const name = members.find(m => m.id === id)?.name;
    if (!name) return null;
    const since = front.memberSince?.[id];
    return since ? `${name} (${fmtDur(since)})` : name;
  }).filter(Boolean).join(', ');

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

const buildFrontContent = (front: FrontState, members: Member[]): {title: string; body: string; bigText: string; since: number} | null => {
  const primaryIds = getTierIds(front, 'primary');
  const coFrontIds = getTierIds(front, 'coFront');
  const coConsciousIds = getTierIds(front, 'coConscious');

  if (primaryIds.length === 0 && coFrontIds.length === 0 && coConsciousIds.length === 0) return null;

  const primaryNames = resolveNames(primaryIds, members);
  const coFrontNames = resolveNames(coFrontIds, members);
  const coConsciousNames = resolveNames(coConsciousIds, members);

  const titleNames = primaryNames || coFrontNames || coConsciousNames ||
    i18n.t('common.unknown');
  const title = `◈ ${titleNames}`;

  const primaryTimed = resolveNamesWithSince(primaryIds, members, front);
  const coFrontTimed = resolveNamesWithSince(coFrontIds, members, front);
  const coConsciousTimed = resolveNamesWithSince(coConsciousIds, members, front);

  const lines: string[] = [];
  if (primaryNames)
    lines.push(i18n.t('notification.primary', {names: primaryTimed}));
  if (coFrontNames)
    lines.push(i18n.t('notification.coFront', {names: coFrontTimed}));
  if (coConsciousNames)
    lines.push(i18n.t('notification.coConscious', {names: coConsciousTimed}));

  const primaryMood = getTierField(front, 'primary', 'mood');
  const primaryLocation = getTierField(front, 'primary', 'location');
  const primaryNote = getTierField(front, 'primary', 'note');

  if (primaryMood)
    lines.push(i18n.t('notification.mood', {mood: translateMood(primaryMood, i18n.t)}));
  if (primaryLocation)
    lines.push(i18n.t('notification.at', {location: primaryLocation}));
  if (primaryNote)
    lines.push(i18n.t('notification.note', {note: primaryNote}));
  const since = frontSessionStart(front, id => !!members.find(m => m.id === id)?.name);
  const sinceTime = fmtTime(since);
  const sinceLabel = i18n.t('notification.since', {time: sinceTime});
  lines.push(sinceLabel);

  if (emergencyLine) lines.push(emergencyLine);

  const summaryParts: string[] = [];
  if (emergencyLine) summaryParts.push(emergencyLine);
  if (coFrontNames)
    summaryParts.push(i18n.t('notification.cfShort', {names: coFrontNames}));
  if (coConsciousNames)
    summaryParts.push(i18n.t('notification.ccShort', {names: coConsciousNames}));
  if (primaryMood)
    summaryParts.push(i18n.t('notification.mood', {mood: translateMood(primaryMood, i18n.t)}));
  if (summaryParts.length === 0) summaryParts.push(sinceLabel);

  return {title, body: summaryParts.join('  ·  '), bigText: lines.join('\n'), since};
};

const frontAndroidConfig = (
  ownBigText: string,
  friendLines: string[],
  fallback: string,
  sinceTs?: number,
) => {
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
    sortKey: '0',
    ...(sinceTs && sinceTs > 0
      ? {timestamp: sinceTs, showTimestamp: true, showChronometer: true}
      : {}),
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
let frontDismissGuard: string | null = null;
let lastFrontSig = '';
let lastFrontPostedAt = 0;

export const clearFrontDismissGuard = () => {
  frontDismissGuard = null;
};

export const noteFrontNotifDismissed = async (notification?: {data?: Record<string, unknown>} | null) => {
  if (Platform.OS !== 'android') return;
  const postedAt = Number(notification?.data?.postedAt) || 0;
  if (postedAt && lastFrontPostedAt && postedAt < lastFrontPostedAt) return;
  try {
    const displayed = await notifee.getDisplayedNotifications();
    if (displayed.some((d: any) => (d?.notification?.id || d?.id) === NOTIF_ID)) return;
  } catch (e) { logError('notif', e); }
  let sig = lastFrontSig;
  if (!sig) {
    try {
      const {store, KEYS} = require('../storage');
      sig = frontStructureSig(await store.get(KEYS.front, null));
    } catch (e) {
      logError('notif', e);
      sig = '';
    }
  }
  frontDismissGuard = sig;
  try { await notifee.cancelTriggerNotification(NOTIF_ID); } catch (e) { logError('notif', e); }
};

const frontStructureSig = (front: FrontState | null): string => {
  if (!front) return 'none';
  return JSON.stringify([
    getTierIds(front, 'primary'),
    getTierIds(front, 'coFront'),
    getTierIds(front, 'coConscious'),
    getTierField(front, 'primary', 'mood') || '',
    getTierField(front, 'primary', 'location') || '',
    getTierField(front, 'primary', 'note') || '',
    frontSessionStart(front) || 0,
    emergencyLine || '',
  ]);
};

const buildFriendLines = (): string[] => {
  const st = NetworkManager.getState();
  if (!st.enabled) return [];
  const lines: string[] = [];
  for (const f of st.friends) {
    if (lines.length >= MAX_NOTIF_FRIENDS) break;
    if (friendNotifyLevel(f) !== 'full' || f.status !== 'accepted') continue;
    const s = f.lastStatus;
    if (!s || !s.fronters) continue;
    const dur = s.startTime ? fmtDur(s.startTime) : '';
    lines.push(`${i18n.t('notification.friendLine', {name: f.displayName, fronters: s.fronters})}${dur ? `  ·  ${dur}` : ''}`);
  }
  return lines;
};

const friendStatusLines = (s: FrontShare): string[] => {
  const lines: string[] = [];
  if (s.primary || s.coFront || s.coConscious) {
    if (s.primary) lines.push(i18n.t('notification.primary', {names: s.primary}));
    if (s.coFront) lines.push(i18n.t('notification.coFront', {names: s.coFront}));
    if (s.coConscious) lines.push(i18n.t('notification.coConscious', {names: s.coConscious}));
  } else {
    lines.push(s.fronters);
  }
  if (s.mood) lines.push(i18n.t('notification.mood', {mood: translateMood(s.mood, i18n.t)}));
  if (s.location) lines.push(i18n.t('notification.at', {location: s.location}));
  if (s.note) lines.push(i18n.t('notification.note', {note: s.note}));
  if (s.startTime) lines.push(`${i18n.t('notification.since', {time: fmtTime(s.startTime)})}  ·  ${fmtDur(s.startTime)}`);
  return lines;
};

const buildFriendNotifs = (): {id: string; title: string; body: string; big: string}[] => {
  const st = NetworkManager.getState();
  if (!st.enabled) return [];
  const out: {id: string; title: string; body: string; big: string}[] = [];
  for (const f of st.friends) {
    if (out.length >= MAX_NOTIF_FRIENDS) break;
    if (friendNotifyLevel(f) !== 'full' || f.status !== 'accepted') continue;
    const s = f.lastStatus;
    if (!s || !s.fronters) continue;
    const lines = friendStatusLines(s);
    const dur = typeof s.startTime === 'number' && s.startTime > 0 ? fmtDur(s.startTime) : '';
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
  if (!NetworkManager.getState().enabled) return;
  if (friendNotifyLevel(f) === 'off') return;
  const s = f.lastStatus;
  if (!s || !s.fronters) return;
  const dur = s.startTime ? fmtDur(s.startTime) : '';
  const lines = friendStatusLines(s);
  if (Platform.OS === 'ios') {
    await notifee.displayNotification({
      id: `${FRIEND_ALERT_PREFIX}${f.peerId}`,
      title: f.displayName,
      body: lines.length > 1 ? lines.slice(0, 6).join('\n') : `${s.fronters}${dur ? `  ·  ${dur}` : ''}`,
      ios: {sound: 'default'},
    });
    return;
  }
  await setupFriendAlertChannel();
  try { await notifee.cancelNotification(`${FRIEND_ALERT_PREFIX}${f.peerId}`); } catch (e) { logError('notif', e); }
  await notifee.displayNotification({
    id: `${FRIEND_ALERT_PREFIX}${f.peerId}`,
    title: f.displayName,
    body: `${s.fronters}${dur ? `  ·  ${dur}` : ''}`,
    android: {
      channelId: FRIEND_ALERT_CHANNEL_ID,
      timestamp: Date.now(),
      showTimestamp: true,
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

const syncFriendNotifications = async (desired = buildFriendNotifs(), ownWhen = Date.now()) => {
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
        sortKey: `1${String(i).padStart(4, '0')}`,
        timestamp: ownWhen - 60000 * (i + 1),
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

    const canBindFgs =
      fgsBound || AppState.currentState === 'active' || Number(Platform.Version) < 31;
    if (fgsBound && !canBindFgs) {
      await notifee.stopForegroundService();
      fgsBound = false;
    }

    const sig = frontStructureSig(front);
    if (frontDismissGuard !== null && sig === frontDismissGuard) {
      await cancelStaleFriendNotifs(new Set());
      return;
    }

    await setupNotificationChannel();

    const onlineLabel = i18n.t('network.status.online');
    const title = content ? content.title : systemName;
    const body = content ? content.body : (emergencyLine || onlineLabel);
    const ownBig = content ? content.bigText : (emergencyLine || '');

    try { await notifee.cancelNotification(FRONT_SUMMARY_ID); } catch (e) { logError('notif', e); }

    const postedAt = Date.now();
    const cfg = frontAndroidConfig(ownBig, [], onlineLabel, content?.since);
    let bound = canBindFgs;
    try {
      await notifee.displayNotification({
        id: NOTIF_ID,
        title,
        body,
        data: {postedAt: String(postedAt)},
        android: {...cfg, ...(canBindFgs ? {asForegroundService: true} : {})},
      });
    } catch (e) {
      if (!canBindFgs) throw e;
      logError('notif', e);
      bound = false;
      await notifee.displayNotification({id: NOTIF_ID, title, body, data: {postedAt: String(postedAt)}, android: cfg});
    }
    await syncFriendNotifications(buildFriendNotifs(), content?.since && content.since > 0 ? content.since : postedAt);
    fgsBound = bound;
    lastFrontSig = sig;
    lastFrontPostedAt = Math.max(lastFrontPostedAt, postedAt);
    frontDismissGuard = null;
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
    if (Platform.OS !== 'android') return;
    if (!front || !intervalMinutes || intervalMinutes < 15) {
      await cancelFrontNotificationRefresh();
      return;
    }
    const content = buildFrontContent(front, members);
    if (!content) {
      await cancelFrontNotificationRefresh();
      return;
    }
    await setupNotificationChannel();
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: Date.now() + intervalMinutes * 60 * 1000,
      alarmManager: {type: AlarmType.SET_AND_ALLOW_WHILE_IDLE},
    };
    await notifee.createTriggerNotification(
      {
        id: NOTIF_ID,
        title: content.title,
        body: content.body,
        data: {postedAt: String(trigger.timestamp)},
        android: frontAndroidConfig(content.bigText, [], content.body, content.since),
      },
      trigger,
    );
  } catch (e) {
    console.error('[PluralSpace] Notification refresh schedule error:', e);
  }
};

export const rearmFrontNotificationRefresh = async () => {
  try {
    if (Platform.OS !== 'android') return;
    const {store, KEYS} = require('../storage');
    const settings = await store.get(KEYS.settings, null);
    if (settings && settings.notificationsEnabled === false) { await cancelFrontNotificationRefresh(); return; }
    if (settings && settings.persistentFrontNotif === false) { await cancelFrontNotificationRefresh(); return; }
    const mins = Number(settings?.notificationRefreshMinutes) || 30;
    const front = await store.get(KEYS.front, null);
    if (!front) { await cancelFrontNotificationRefresh(); return; }
    const members = await store.get(KEYS.members, []);
    const {setTerminologyOverrides, setTierNameOverrides} = require('../i18n/terminology');
    setTerminologyOverrides(settings?.terminology);
    setTierNameOverrides(settings?.tierNames);
    await scheduleFrontNotificationRefresh(front, members || [], mins);
  } catch (e) {
    logError('notif', e);
  }
};

let lastReassert = 0;

export const reassertFrontNotification = async () => {
  try {
    if (Platform.OS !== 'android') return;
    const now = Date.now();
    if (now - lastReassert < 60000) return;
    lastReassert = now;
    const {store, KEYS} = require('../storage');
    const settings = await store.get(KEYS.settings, null);
    if (settings && settings.notificationsEnabled === false) return;
    if (settings && settings.persistentFrontNotif === false) return;
    const {setTerminologyOverrides, setTierNameOverrides} = require('../i18n/terminology');
    setTerminologyOverrides(settings?.terminology);
    setTierNameOverrides(settings?.tierNames);
    const front = await store.get(KEYS.front, null);
    if (!front) return;
    const sig = frontStructureSig(front);
    if (frontDismissGuard !== null && frontDismissGuard === sig) return;
    const members = await store.get(KEYS.members, []);
    const content = buildFrontContent(front, members || []);
    if (!content) return;
    await setupNotificationChannel();
    const postedAt = Date.now();
    const cfg = frontAndroidConfig(content.bigText, [], content.body, content.since);
    const canBindFgs =
      fgsBound || AppState.currentState === 'active' || Number(Platform.Version) < 31;
    if (fgsBound && !canBindFgs) {
      try { await notifee.stopForegroundService(); } catch (e) { logError('notif', e); }
      fgsBound = false;
    }
    let bound = canBindFgs;
    try {
      await notifee.displayNotification({
        id: NOTIF_ID,
        title: content.title,
        body: content.body,
        data: {postedAt: String(postedAt)},
        android: {...cfg, ...(canBindFgs ? {asForegroundService: true} : {})},
      });
    } catch (e) {
      if (!canBindFgs) throw e;
      logError('notif', e);
      bound = false;
      await notifee.displayNotification({id: NOTIF_ID, title: content.title, body: content.body, data: {postedAt: String(postedAt)}, android: cfg});
    }
    if (NetworkManager.getState().enabled) await syncFriendNotifications(buildFriendNotifs(), content.since && content.since > 0 ? content.since : postedAt);
    fgsBound = bound;
    lastFrontSig = sig;
    lastFrontPostedAt = Math.max(lastFrontPostedAt, postedAt);
    frontDismissGuard = null;
  } catch (e) {
    logError('notif', e);
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
    if (fgsBound) { try { await notifee.stopForegroundService(); } catch (e) { logError('notif', e); } }
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
      ? `◈ ${i18n.t('notification.statusCheck')}`
      : `◈ ${i18n.t('notification.frontCheck')}`;
    const body = singlet
      ? i18n.t('notification.whatsYourStatus')
      : i18n.t('notification.whosFronting');
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
      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: Date.now() + intervalHours * 60 * 60 * 1000,
        repeatFrequency: RepeatFrequency.HOURLY,
        repeatInterval: Math.max(1, Math.round(intervalHours)),
        alarmManager: {type: AlarmType.SET_AND_ALLOW_WHILE_IDLE},
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
        alarmManager: {type: AlarmType.SET_AND_ALLOW_WHILE_IDLE},
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
        alarmManager: {type: AlarmType.SET_AND_ALLOW_WHILE_IDLE},
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
    if (!entries || entries.length === 0) return;
    if (Platform.OS === 'android') await setupReminderChannel();
    const totalNotes = entries.reduce((sum, e) => sum + e.unreadCount, 0);
    const title = i18n.t('notification.noteboardUnreadTitle', {
      count: totalNotes,
    });
    const summary = entries.map(e => `${e.memberName} (${e.unreadCount})`).join(', ');
    const bigLines = entries.map(e => {
      const label = i18n.t('notification.noteboardUnreadLine', {
        name: e.memberName,
        count: e.unreadCount,
      });
      return label;
    }).join('\n');
    await notifee.displayNotification({
      id: NOTEBOARD_NOTIF_ID,
      title,
      body: Platform.OS === 'ios' ? bigLines : summary,
      ios: {sound: 'default'},
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
const PLAN_APPT_ID_PREFIX = 'ps-plan-appt-';
const PLAN_REM_ID_PREFIX = 'ps-plan-rem-';

const cancelTriggersWithPrefix = async (prefix: string) => {
  try {
    const ids = await notifee.getTriggerNotificationIds();
    await Promise.all(ids.filter(id => id.startsWith(prefix)).map(id => notifee.cancelTriggerNotification(id)));
  } catch (e) {
    console.error('[PluralSpace] Trigger cancel error:', e);
  }
};

const plannerAndroidConfig = () => ({
  channelId: REMINDER_CHANNEL_ID,
  smallIcon: 'ic_stat_notification',
  importance: AndroidImportance.DEFAULT,
  visibility: AndroidVisibility.PUBLIC,
  pressAction: {id: 'default'},
  color: '#DAA520',
});

const nativeRepeatFor = (repeat: string | undefined): RepeatFrequency | undefined => {
  if (repeat === 'daily') return RepeatFrequency.DAILY;
  if (repeat === 'weekly') return RepeatFrequency.WEEKLY;
  return undefined;
};

const ARMED_OCCURRENCES = 6;

export const rescheduleMedicationReminders = async (medications: Medication[]) => {
  await cancelTriggersWithPrefix(MED_ID_PREFIX);
  const active = (medications || []).filter(m => m && m.enabled && Array.isArray(m.times) && m.times.length > 0);
  if (active.length === 0) return;
  try {
    await setupReminderChannel();
    const now = Date.now();
    for (const med of active) {
      for (let i = 0; i < med.times.length; i++) {
        const [hh, mm] = String(med.times[i]).split(':').map(Number);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
        const next = new Date();
        next.setHours(hh, mm, 0, 0);
        if (next.getTime() <= now) next.setDate(next.getDate() + 1);
        const trigger: TimestampTrigger = {
          type: TriggerType.TIMESTAMP,
          timestamp: next.getTime(),
          repeatFrequency: RepeatFrequency.DAILY,
          alarmManager: {type: AlarmType.SET_AND_ALLOW_WHILE_IDLE},
        };
        await notifee.createTriggerNotification(
          {
            id: `${MED_ID_PREFIX}${med.id}-${i}`,
            title: i18n.t('medical.medReminderTitle'),
            body: med.dosage ? `${med.name} · ${med.dosage}` : med.name,
            android: plannerAndroidConfig(),
          },
          trigger,
        );
      }
    }
  } catch (e) {
    console.error('[PluralSpace] Medication reschedule error:', e);
  }
};

export const rescheduleAppointmentReminders = async (appointments: MedicalAppointment[]) => {
  await cancelTriggersWithPrefix(APPT_ID_PREFIX);
  const now = Date.now();
  const upcoming = (appointments || []).filter(a => a && Number.isFinite(a.time) && a.time - (a.reminderMinutesBefore || 0) * 60000 > now);
  if (upcoming.length === 0) return;
  try {
    await setupReminderChannel();
    for (const appt of upcoming) {
      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: appt.time - (appt.reminderMinutesBefore || 0) * 60000,
        alarmManager: {type: AlarmType.SET_AND_ALLOW_WHILE_IDLE},
      };
      await notifee.createTriggerNotification(
        {
          id: `${APPT_ID_PREFIX}${appt.id}`,
          title: i18n.t('medical.apptReminderTitle'),
          body: appt.location ? `${appt.title} · ${appt.location}` : appt.title,
          android: plannerAndroidConfig(),
        },
        trigger,
      );
    }
  } catch (e) {
    console.error('[PluralSpace] Appointment reschedule error:', e);
  }
};

export const reschedulePlannerNotifications = async (planner: PlannerData | null) => {
  await cancelTriggersWithPrefix(PLAN_APPT_ID_PREFIX);
  await cancelTriggersWithPrefix(PLAN_REM_ID_PREFIX);
  if (!planner) return;
  try {
    await setupReminderChannel();
    const now = Date.now();

    for (const appt of planner.appointments || []) {
      if (appt.reminderMinutesBefore == null) continue;
      const offsetMs = appt.reminderMinutesBefore * 60 * 1000;
      const native = nativeRepeatFor(appt.repeat);
      const armed = appt.repeat && !native ? ARMED_OCCURRENCES : 1;
      let after = now + offsetMs;
      for (let k = 0; k < armed; k++) {
      const occurrence = plannerNextOccurrence(appt.time, appt.repeat, after);
      if (occurrence == null) break;
      after = occurrence;
      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: occurrence - offsetMs,
        repeatFrequency: native,
        alarmManager: {type: AlarmType.SET_AND_ALLOW_WHILE_IDLE},
      };
      await notifee.createTriggerNotification(
        {
          id: `${PLAN_APPT_ID_PREFIX}${appt.id}${k > 0 ? `-${k}` : ''}`,
          title: `🗓 ${appt.title}`,
          body: appt.location
            ? i18n.t('planner.notifApptAt', {time: fmtTime(occurrence), location: appt.location})
            : i18n.t('planner.notifAppt', {time: fmtTime(occurrence)}),
          android: plannerAndroidConfig(),
        },
        trigger,
      );
      }
    }

    for (const rem of planner.reminders || []) {
      if (!rem.enabled) continue;
      const repeat = rem.repeat || 'daily';
      for (let i = 0; i < (rem.times || []).length; i++) {
        const [hh, mm] = rem.times[i].split(':').map(Number);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
        const anchor = new Date(rem.startDate ?? rem.createdAt);
        anchor.setHours(hh, mm, 0, 0);
        const native = nativeRepeatFor(repeat);
        const armed = native || repeat === 'once' ? 1 : ARMED_OCCURRENCES;
        let after = now;
        for (let k = 0; k < armed; k++) {
          const occurrence = plannerNextOccurrence(anchor.getTime(), repeat, after);
          if (occurrence == null) break;
          after = occurrence;
          const trigger: TimestampTrigger = {
            type: TriggerType.TIMESTAMP,
            timestamp: occurrence,
            repeatFrequency: native,
            alarmManager: {type: AlarmType.SET_AND_ALLOW_WHILE_IDLE},
          };
          await notifee.createTriggerNotification(
            {
              id: `${PLAN_REM_ID_PREFIX}${rem.id}-${i}${k > 0 ? `-${k}` : ''}`,
              title: `⏰ ${rem.title}`,
              body: rem.notes || i18n.t('planner.notifReminder'),
              android: plannerAndroidConfig(),
            },
            trigger,
          );
        }
      }
    }
  } catch (e) {
    console.error('[PluralSpace] Planner reschedule error:', e);
  }
};

export const showChatPingNotification = async (
  channelName: string,
  speakerName: string,
  preview: string,
) => {
  try {
    if (Platform.OS === 'android') await setupReminderChannel();
    const safePreview = truncateRunes((preview || '').replace(/\s+/g, ' ').trim(), 140);
    const title = i18n.t('notification.chatPingTitle', {
      speaker: speakerName,
      channel: channelName,
    });
    const body = safePreview
      ? i18n.t('notification.chatPingBody', {preview: safePreview})
      : i18n.t('notification.chatPingBodyEmpty');
    await notifee.displayNotification({
      id: `ps-chat-ping-${Date.now()}`,
      title,
      body,
      ios: {sound: 'default'},
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
