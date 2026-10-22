import notifee, {AndroidImportance, AndroidVisibility, AndroidStyle} from 'react-native-notify-kit';
import {AppState, Platform} from 'react-native';
import {AppSettings, FrontState, Member, fmtDur, fmtTime, frontSessionStart, memberNames, translateMood} from '../utils';
import {store, KEYS} from '../storage';
import {setTerminologyOverrides, setTierNameOverrides} from '../i18n/terminology';
import {log, logError} from '../utils/log';
import {endFrontLiveActivity, updateFrontLiveActivity} from './LiveActivityService';
import {NetworkManager} from '../network/NetworkManager';
import {MAX_NOTIF_FRIENDS, Friend, FrontShare} from '../network/types';
import {friendNotifyLevel} from '../network/friendState';
import {frontShareLines} from '../network/frontShare';
import i18n from '../i18n/i18n';
import {ANDROID_BASE, durSuffix, timestampTrigger} from './notify';

const NOTIF_CHANNEL_ID = 'plural-space-front';
export const NOTIF_ID = 'ps-front-status';
const FRIEND_NOTIF_PREFIX = 'ps-friend-';
const FRONT_SUMMARY_ID = 'ps-front-summary';

const ONGOING_ANDROID = {
  ...ANDROID_BASE,
  channelId: NOTIF_CHANNEL_ID,
  ongoing: true,
  onlyAlertOnce: true,
  autoCancel: false,
  importance: AndroidImportance.LOW,
};

const setupNotificationChannel = async () => {
  await notifee.createChannel({
    id: NOTIF_CHANNEL_ID,
    name: i18n.t('notification.channelFront'),
    importance: AndroidImportance.LOW,
    visibility: AndroidVisibility.PUBLIC,
    sound: '',
  });
};

const resolveNamesWithSince = (ids: string[], members: Member[], front: FrontState): string =>
  ids.map(id => {
    const name = members.find(m => m.id === id)?.name;
    if (!name) return null;
    const since = front.memberSince?.[id];
    return since ? `${name} (${fmtDur(since)})` : name;
  }).filter(Boolean).join(', ');

const buildFrontContent = (front: FrontState, members: Member[]): {title: string; body: string; bigText: string; since: number} | null => {
  const primaryIds = front.primary.memberIds;
  const coFrontIds = front.coFront.memberIds;
  const coConsciousIds = front.coConscious.memberIds;

  if (primaryIds.length === 0 && coFrontIds.length === 0 && coConsciousIds.length === 0) return null;

  const primaryNames = memberNames(primaryIds, members);
  const coFrontNames = memberNames(coFrontIds, members);
  const coConsciousNames = memberNames(coConsciousIds, members);

  const titleNames = primaryNames || coFrontNames || coConsciousNames || i18n.t('common.unknown');
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

  const primaryMood = front.primary.mood;
  const primaryLocation = front.primary.location;
  const primaryNote = front.primary.note;

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

  const summaryParts: string[] = [];
  if (coFrontNames)
    summaryParts.push(i18n.t('notification.cfShort', {names: coFrontNames}));
  if (coConsciousNames)
    summaryParts.push(i18n.t('notification.ccShort', {names: coConsciousNames}));
  if (primaryMood)
    summaryParts.push(i18n.t('notification.mood', {mood: translateMood(primaryMood, i18n.t)}));
  if (summaryParts.length === 0) summaryParts.push(sinceLabel);

  return {title, body: summaryParts.join('  ·  '), bigText: lines.join('\n'), since};
};

const frontAndroidConfig = (ownBigText: string, fallback: string, sinceTs?: number) => ({
  ...ONGOING_ANDROID,
  sortKey: '0',
  ...(sinceTs && sinceTs > 0
    ? {timestamp: sinceTs, showTimestamp: true, showChronometer: true}
    : {}),
  style: {type: AndroidStyle.BIGTEXT as const, text: ownBigText || fallback},
});

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
    if (displayed.some(d => (d.notification?.id || d.id) === NOTIF_ID)) return;
  } catch (e) { logError('notif', e); }
  let sig = lastFrontSig;
  if (!sig) {
    try {
      sig = frontStructureSig(await store.get<FrontState>(KEYS.front, null));
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
    front.primary.memberIds,
    front.coFront.memberIds,
    front.coConscious.memberIds,
    front.primary.mood || '',
    front.primary.location || '',
    front.primary.note || '',
    frontSessionStart(front) || 0,
  ]);
};

type FriendStatus = {f: Friend; s: FrontShare};

type FriendNotif = {id: string; title: string; body: string; big: string};

const fullFriendStatuses = (): FriendStatus[] => {
  const st = NetworkManager.getState();
  if (!st.enabled) return [];
  const out: FriendStatus[] = [];
  for (const f of st.friends) {
    if (out.length >= MAX_NOTIF_FRIENDS) break;
    const s = f.lastStatus;
    if (friendNotifyLevel(f) !== 'full' || f.status !== 'accepted' || !s?.fronters) continue;
    out.push({f, s});
  }
  return out;
};

const buildFriendLines = (): string[] =>
  fullFriendStatuses().map(({f, s}) => `${i18n.t('notification.friendLine', {name: f.displayName, fronters: s.fronters})}${durSuffix(s)}`);

const buildFriendNotifs = (): FriendNotif[] =>
  fullFriendStatuses().map(({f, s}) => ({
    id: `${FRIEND_NOTIF_PREFIX}${f.peerId}`,
    title: f.displayName,
    body: `${s.fronters}${durSuffix(s)}`,
    big: frontShareLines(s, i18n.t).join('\n'),
  }));

const cancelStaleFriendNotifs = async (keepIds: Set<string>) => {
  try {
    const displayed = await notifee.getDisplayedNotifications();
    for (const d of displayed) {
      const nid = d.notification?.id || d.id;
      if (nid && typeof nid === 'string' && nid.startsWith(FRIEND_NOTIF_PREFIX) && !keepIds.has(nid)) {
        try { await notifee.cancelNotification(nid); } catch (e) { logError('notif', e); }
      }
    }
  } catch (e) { logError('notif', e); }
};

const syncFriendNotifications = async (desired: FriendNotif[], ownWhen: number) => {
  await cancelStaleFriendNotifs(new Set(desired.map(d => d.id)));
  for (let i = 0; i < desired.length; i++) {
    const d = desired[i];
    await notifee.displayNotification({
      id: d.id,
      title: d.title,
      body: d.body,
      android: {
        ...ONGOING_ANDROID,
        sortKey: `1${String(i).padStart(4, '0')}`,
        timestamp: ownWhen - 60000 * (i + 1),
        style: {type: AndroidStyle.BIGTEXT as const, text: d.big || d.body},
      },
    });
  }
};

const releaseFgsIfUnbindable = async (): Promise<boolean> => {
  const canBindFgs = fgsBound || AppState.currentState === 'active' || Number(Platform.Version) < 31;
  if (fgsBound && !canBindFgs) {
    try { await notifee.stopForegroundService(); } catch (e) { logError('notif', e); }
    fgsBound = false;
  }
  return canBindFgs;
};

const postFrontNotification = async (title: string, body: string, cfg: ReturnType<typeof frontAndroidConfig>, sig: string, since: number | undefined, canBindFgs: boolean, syncFriends: boolean) => {
  const postedAt = Date.now();
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
  if (syncFriends) await syncFriendNotifications(buildFriendNotifs(), since && since > 0 ? since : postedAt);
  fgsBound = bound;
  lastFrontSig = sig;
  lastFrontPostedAt = Math.max(lastFrontPostedAt, postedAt);
  frontDismissGuard = null;
};

const loadPersistentFrontState = async (): Promise<{settings: AppSettings | null; front: FrontState | null; members: Member[]} | null> => {
  const settings = await store.get<AppSettings>(KEYS.settings, null);
  if (settings && (settings.notificationsEnabled === false || settings.persistentFrontNotif === false)) return null;
  setTerminologyOverrides(settings?.terminology);
  setTierNameOverrides(settings?.tierNames);
  const front = await store.get<FrontState>(KEYS.front, null);
  const members = await store.get<Member[]>(KEYS.members, []);
  return {settings, front, members: members || []};
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

    if (!content && !netOn) {
      await clearFrontNotification();
      return;
    }

    const canBindFgs = await releaseFgsIfUnbindable();

    const sig = frontStructureSig(front);
    if (frontDismissGuard !== null && sig === frontDismissGuard) {
      await cancelStaleFriendNotifs(new Set());
      return;
    }

    await setupNotificationChannel();

    const onlineLabel = i18n.t('network.status.online');
    const title = content ? content.title : systemName;
    const body = content ? content.body : onlineLabel;
    const ownBig = content ? content.bigText : '';

    try { await notifee.cancelNotification(FRONT_SUMMARY_ID); } catch (e) { logError('notif', e); }

    await postFrontNotification(title, body, frontAndroidConfig(ownBig, onlineLabel, content?.since), sig, content?.since, canBindFgs, true);
  } catch (e) {
    log.error('notifications', 'Notification error:', e);
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
    const trigger = timestampTrigger(Date.now() + intervalMinutes * 60 * 1000);
    await notifee.createTriggerNotification(
      {
        id: NOTIF_ID,
        title: content.title,
        body: content.body,
        data: {postedAt: String(trigger.timestamp)},
        android: frontAndroidConfig(content.bigText, content.body, content.since),
      },
      trigger,
    );
  } catch (e) {
    log.error('notifications', 'Notification refresh schedule error:', e);
  }
};

export const rearmFrontNotificationRefresh = async () => {
  try {
    if (Platform.OS !== 'android') return;
    const state = await loadPersistentFrontState();
    if (!state || !state.front) { await cancelFrontNotificationRefresh(); return; }
    const mins = Number(state.settings?.notificationRefreshMinutes) || 30;
    await scheduleFrontNotificationRefresh(state.front, state.members, mins);
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
    const state = await loadPersistentFrontState();
    if (!state || !state.front) return;
    const sig = frontStructureSig(state.front);
    if (frontDismissGuard !== null && frontDismissGuard === sig) return;
    const content = buildFrontContent(state.front, state.members);
    if (!content) return;
    await setupNotificationChannel();
    const canBindFgs = await releaseFgsIfUnbindable();
    await postFrontNotification(content.title, content.body, frontAndroidConfig(content.bigText, content.body, content.since), sig, content.since, canBindFgs, NetworkManager.getState().enabled);
  } catch (e) {
    logError('notif', e);
  }
};

export const cancelFrontNotificationRefresh = async () => {
  try {
    await notifee.cancelTriggerNotification(NOTIF_ID);
  } catch (e) {
    log.error('notifications', 'Notification refresh cancel error:', e);
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
    log.error('notifications', 'Clear notification error:', e);
  }
};
