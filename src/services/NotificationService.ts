import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidStyle,
  TriggerType,
  TimeUnit,
  AlarmType,
  IntervalTrigger,
  TimestampTrigger,
  RepeatFrequency,
// react-native-notify-kit is the maintained drop-in fork of notifee (archived
// Apr 2026). Same API, same native classes — verified against the published
// tarball before switching.
} from 'react-native-notify-kit';
import {AppState, Platform} from 'react-native';
import {FrontState, Member, Medication, MedicalAppointment, PlannerData, plannerNextOccurrence, fmtDur, fmtTime} from '../utils';
import {logError} from '../utils/log';
import {endFrontLiveActivity, updateFrontLiveActivity} from './LiveActivityService';
import {NetworkManager} from '../network/NetworkManager';
import {MAX_NOTIF_FRIENDS, Friend, FrontShare, friendNotifyLevel} from '../network/types';
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

const buildFrontContent = (front: FrontState, members: Member[]): {title: string; body: string; bigText: string} | null => {
  const primaryIds = getTierIds(front, 'primary');
  const coFrontIds = getTierIds(front, 'coFront');
  const coConsciousIds = getTierIds(front, 'coConscious');

  if (primaryIds.length === 0 && coFrontIds.length === 0 && coConsciousIds.length === 0) return null;

  const primaryNames = resolveNames(primaryIds, members);
  const coFrontNames = resolveNames(coFrontIds, members);
  const coConsciousNames = resolveNames(coConsciousIds, members);

  const titleNames = primaryNames || coFrontNames || coConsciousNames ||
    i18n.t('common.unknown', {defaultValue: 'Unknown'});
  // Duration back in the TEXT, chronometer gone. The chronometer needed
  // `timestamp: startTime`, and Android sorts the shade by that value — a
  // front running for days pinned the notification BELOW day-old
  // notifications, where no silent re-post could ever surface it ("refresh
  // does nothing", "it went to the bottom"). Text durations go stale between
  // re-posts, which is why every re-post path rebuilds this content fresh:
  // the in-app 5-minute interval, the WorkManager refresh trigger, and the
  // headless reassert.
  const title = front.startTime ? `◈ ${titleNames}  ·  ${fmtDur(front.startTime)}` : `◈ ${titleNames}`;

  const primaryTimed = resolveNamesWithSince(primaryIds, members, front);
  const coFrontTimed = resolveNamesWithSince(coFrontIds, members, front);
  const coConsciousTimed = resolveNamesWithSince(coConsciousIds, members, front);

  const lines: string[] = [];
  if (primaryNames)
    lines.push(i18n.t('notification.primary', {names: primaryTimed, defaultValue: `Primary: ${primaryTimed}`}));
  if (coFrontNames)
    lines.push(i18n.t('notification.coFront', {names: coFrontTimed, defaultValue: `Co-Front: ${coFrontTimed}`}));
  if (coConsciousNames)
    lines.push(i18n.t('notification.coConscious', {names: coConsciousTimed, defaultValue: `Co-Conscious: ${coConsciousTimed}`}));

  const primaryMood = getTierField(front, 'primary', 'mood');
  const primaryLocation = getTierField(front, 'primary', 'location');
  const primaryNote = getTierField(front, 'primary', 'note');

  if (primaryMood)
    lines.push(i18n.t('notification.mood', {mood: primaryMood, defaultValue: `Mood: ${primaryMood}`}));
  if (primaryLocation)
    lines.push(i18n.t('notification.at', {location: primaryLocation, defaultValue: `At: ${primaryLocation}`}));
  if (primaryNote)
    lines.push(i18n.t('notification.note', {note: primaryNote, defaultValue: `Note: ${primaryNote}`}));
  const sinceLabel = i18n.t('notification.since', {time: fmtTime(front.startTime), defaultValue: `Since ${fmtTime(front.startTime)}`});
  lines.push(sinceLabel);

  if (emergencyLine) lines.push(emergencyLine);

  const summaryParts: string[] = [];
  if (emergencyLine) summaryParts.push(emergencyLine);
  if (coFrontNames)
    summaryParts.push(i18n.t('notification.cfShort', {names: coFrontNames, defaultValue: `CF: ${coFrontNames}`}));
  if (coConsciousNames)
    summaryParts.push(i18n.t('notification.ccShort', {names: coConsciousNames, defaultValue: `CC: ${coConsciousNames}`}));
  if (primaryMood)
    summaryParts.push(i18n.t('notification.mood', {mood: primaryMood, defaultValue: `Mood: ${primaryMood}`}));
  // Never return an empty body. A notification with a title and nothing under
  // it is the "it shows legit nothing" report, and with the live duration gone
  // from the text a solo primary fronter with no mood would leave this empty.
  if (summaryParts.length === 0) summaryParts.push(sinceLabel);

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
    // The own front notification IS this group's summary. Posting a separate
    // summary notification with the same text is what made the fronting line
    // render twice whenever a friend was pinned.
    groupSummary: true,
    sortKey: '0',
    // NO timestamp / showChronometer here, deliberately. The chronometer only
    // renders when `timestamp` is the front's start — and Android RANKS the
    // shade by that same value, so a days-old front sat pinned under
    // yesterday's notifications and silent re-posts could never lift it. It
    // also reordered the GROUP: a friend whose front started more recently
    // sorted ABOVE the own summary row ("it replaced the notification of my
    // own with his"). Post time is the sort key now, so each interval re-post
    // surfaces the group again, and sortKey orders the rows within it.
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

export const clearFrontDismissGuard = () => {
  frontDismissGuard = null;
};

export const noteFrontNotifDismissed = async () => {
  if (Platform.OS !== 'android') return;
  frontDismissGuard = lastFrontSig || '';
  try { await notifee.cancelTriggerNotification(NOTIF_ID); } catch (e) { logError('notif', e); }
};

let lastFrontSig = '';

// The dismiss guard compares WHAT the front is, never how it is rendered.
// The rendered text now carries live durations, so a text-based signature
// changed on every re-post and a swiped-away notification resurrected on the
// next 5-minute interval — the exact behavior the guard exists to prevent.
// This stays identical until the front itself changes.
const frontStructureSig = (front: FrontState | null): string => {
  if (!front) return 'none';
  return JSON.stringify([
    getTierIds(front, 'primary'),
    getTierIds(front, 'coFront'),
    getTierIds(front, 'coConscious'),
    getTierField(front, 'primary', 'mood') || '',
    getTierField(front, 'primary', 'location') || '',
    getTierField(front, 'primary', 'note') || '',
    front.startTime || 0,
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
    if (friendNotifyLevel(f) !== 'full' || f.status !== 'accepted') continue;
    const s = f.lastStatus;
    if (!s || !s.fronters) continue;
    const lines = friendStatusLines(s);
    const dur = typeof s.startTime === 'number' && s.startTime > 0 ? fmtDur(s.startTime) : '';
    out.push({
      id: `${FRIEND_NOTIF_PREFIX}${f.peerId}`,
      title: f.displayName,
      // Duration in the text, same trade as the own row: a chronometer
      // timestamp re-sorted these rows by front age and pushed the whole
      // group to the bottom of the shade. The text refreshes whenever the
      // group re-posts (friend updates, the 5-minute interval, foreground).
      body: dur ? `${s.fronters}  ·  ${dur}` : s.fronters,
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
    // iOS path. This used to be Android-only, which meant iOS users could only
    // see friend front updates as lines INSIDE the Live Activity — forcing
    // them to keep the persistent status on just to know their partner
    // switched. A friend update is a transient event; it gets a normal banner,
    // fully independent of the Live Activity. (Cross-platform notification
    // rule: every alert needs an iOS path.)
    await notifee.displayNotification({
      id: `${FRIEND_ALERT_PREFIX}${f.peerId}`,
      title: f.displayName,
      body: lines.length > 1 ? lines.slice(0, 6).join('\n') : `${s.fronters}${dur ? `  ·  ${dur}` : ''}`,
      ios: {sound: 'default'},
    });
    return;
  }
  await setupFriendAlertChannel();
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

    // There is NO separate summary notification any more. The old one carried
    // `title: systemName` + the SAME `body` as the own front notification and
    // sat in the same group, so with any friend pinned the shade showed the
    // fronting line TWICE (reported, fixed, and reported again — the earlier
    // `friendNotifs.length > 0` gate only hid it for people with no friends).
    // The own front notification IS the group summary now, so a duplicate is
    // structurally impossible: collapsed it is the header, expanded it is the
    // header with the friend rows under it.
    try { await notifee.cancelNotification(FRONT_SUMMARY_ID); } catch (e) { logError('notif', e); }

    const sig = frontStructureSig(front);
    if (frontDismissGuard !== null && sig === frontDismissGuard) {
      // The user swiped the front notification away. The friend rows sit in the
      // SAME group and are ongoing, so leaving them behind gives Android a
      // group with children and no summary, and it draws its own empty header:
      // a notification that appears from nowhere and "shows legit nothing".
      // Dismissing the summary dismisses the group.
      await cancelStaleFriendNotifs(new Set());
      return;
    }

    // Android 12+ forbids starting a foreground service from the background.
    // Sync-applied front changes run exactly there, and posting with
    // asForegroundService then crashed in notify-kit's ForegroundService.start
    // (top Play Console crash on 1.15.0, ForegroundServiceStartNotAllowed +
    // DidNotStartInTime family). Bind the FGS only when it is legal: app in
    // the foreground, an FGS already running (re-posts to a live service are
    // allowed), or an API level without the restriction. Otherwise post the
    // same content as a plain ongoing notification — identical to what the
    // background refresh trigger already does — and the FGS re-binds on the
    // next foreground update.
    const canBindFgs =
      fgsBound || AppState.currentState === 'active' || Number(Platform.Version) < 31;
    const cfg = frontAndroidConfig(ownBig, [], onlineLabel);
    let bound = canBindFgs;
    try {
      await notifee.displayNotification({
        id: NOTIF_ID,
        title,
        body,
        android: {...cfg, ...(canBindFgs ? {asForegroundService: true} : {})},
      });
    } catch (e) {
      // fgsBound can go STALE: Android stops the service while the app is
      // backgrounded, the flag still says bound, and the next background
      // re-post tries to START an FGS from the background — which throws and
      // used to leave the shade with nothing at all ("my fronting
      // notification isn't showing whatsoever"). Post the same content plain;
      // the FGS re-binds on the next foreground update.
      if (!canBindFgs) throw e;
      logError('notif', e);
      bound = false;
      await notifee.displayNotification({id: NOTIF_ID, title, body, android: cfg});
    }
    // Children go up only AFTER their summary exists. Posting them first left a
    // window — and, if this post then threw (the foreground-service start
    // restriction is a live hazard here), a permanent state — where the group
    // had rows but no header, which Android papers over with a blank one.
    await syncFriendNotifications();
    fgsBound = bound;
    lastFrontSig = sig;
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
    // No leading cancel. notify-kit enqueues this as unique periodic work with
    // ExistingPeriodicWorkPolicy.UPDATE, so creating it again replaces the old
    // one atomically. Cancelling first ran a separate async chain against the
    // same unique work name, and with two schedule calls in flight a late
    // cancel could land after the new enqueue and delete it. The trigger is the
    // only thing that brings the notification back once Android reclaims the
    // process, so losing it is exactly the "vanished until I opened the app"
    // report. Bail-out paths below still cancel, because there the intent
    // really is to stop refreshing.
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
        // Deliberately NOT asForegroundService here. This trigger fires from
        // the background (WorkManager), and Android 12+ blocks starting a
        // foreground service from the background — the re-post would throw
        // ForegroundServiceStartNotAllowedException and the notification would
        // stay gone, which is exactly the "vanished and never came back"
        // report. A plain ongoing re-post always succeeds; the FGS re-binds
        // the next time the app is opened (showFrontNotification).
        android: frontAndroidConfig(content.bigText, [], content.body),
      },
      trigger,
    );
  } catch (e) {
    console.error('[PluralSpace] Notification refresh schedule error:', e);
  }
};

// Called from index.js's notifee.onBackgroundEvent when the refresh trigger
// delivers while the process is dead (headless JS). Rebuilds the front
// notification from storage with FRESH durations instead of the stale content
// baked into the trigger at schedule time. Plain notification only — headless
// runs in a background context, where Android 12+ forbids starting an FGS.
let lastReassert = 0;

export const reassertFrontNotification = async () => {
  try {
    if (Platform.OS !== 'android') return;
    // Re-entry guard: if DELIVERED also fires for the re-post itself, this
    // would loop — each display raising the event that causes the next
    // display. One re-assert per minute is all resurrection ever needs.
    const now = Date.now();
    if (now - lastReassert < 60000) return;
    if (frontDismissGuard !== null) return;
    lastReassert = now;
    // Lazy require: index.js calls this before React exists; keep the module
    // graph for the headless path as small as possible.
    const {store, KEYS} = require('../storage');
    const settings = await store.get(KEYS.settings, null);
    if (settings && settings.notificationsEnabled === false) return;
    if (settings && settings.persistentFrontNotif === false) return;
    // Headless context: App's effects never ran here, so the i18n overrides
    // (Terminology Picker words, custom tier names) are unset unless hydrated
    // from the settings just loaded. Same lazy-require rule as above.
    const {setTerminologyOverrides, setTierNameOverrides} = require('../i18n/terminology');
    setTerminologyOverrides(settings?.terminology);
    setTierNameOverrides(settings?.tierNames);
    const front = await store.get(KEYS.front, null);
    if (!front) return;
    const members = await store.get(KEYS.members, []);
    const content = buildFrontContent(front, members || []);
    if (!content) return;
    await setupNotificationChannel();
    await notifee.displayNotification({
      id: NOTIF_ID,
      title: content.title,
      body: content.body,
      android: frontAndroidConfig(content.bigText, [], content.body),
    });
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
        // Without an alarm these are ordinary scheduled work, which Doze defers
        // or drops outright — the "front check notifications don't work either"
        // half of the report. allowWhileIdle fires them through Doze.
        // `allowWhileIdle` is DEPRECATED in the installed notifee (9.1.8) — its own
        // typings say "use `type` instead".
        //
        // Deliberately SET_AND_ALLOW_WHILE_IDLE, not SET_EXACT_*: the EXACT variants
        // need an exact-alarm permission, and Play restricts those to apps whose CORE
        // purpose is alarms/timers/calendars. A front-check reminder is a secondary
        // feature, so we would fail that policy. This type still fires through Doze,
        // which is the actual problem — it just isn't second-accurate, and a "have you
        // checked who's fronting?" nudge does not need to be.
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
        // `allowWhileIdle` is DEPRECATED in the installed notifee (9.1.8) — its own
        // typings say "use `type` instead".
        //
        // Deliberately SET_AND_ALLOW_WHILE_IDLE, not SET_EXACT_*: the EXACT variants
        // need an exact-alarm permission, and Play restricts those to apps whose CORE
        // purpose is alarms/timers/calendars. A front-check reminder is a secondary
        // feature, so we would fail that policy. This type still fires through Doze,
        // which is the actual problem — it just isn't second-accurate, and a "have you
        // checked who's fronting?" nudge does not need to be.
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

export const rescheduleMedicationReminders = async (_medications: Medication[]) => {
  await cancelTriggersWithPrefix(MED_ID_PREFIX);
};

export const rescheduleAppointmentReminders = async (_appointments: MedicalAppointment[]) => {
  await cancelTriggersWithPrefix(APPT_ID_PREFIX);
};

// Day Planner notifications. SET_AND_ALLOW_WHILE_IDLE fires through Doze
// without the exact-alarm permission Play restricts; notifee ignores
// alarmManager on iOS, where TimestampTrigger is the timestamp-trigger path
// the standing cross-platform rule requires.
//
// Cadences: daily and weekly map to notifee's native repeatFrequency, so they
// keep firing even if the app never reopens. Every other cadence (every other
// day/week, monthly, every other month, annually, one-time) has no native
// repeat, so its NEXT occurrence is armed as a one-shot and re-armed on every
// app start and every planner save.
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
      const occurrence = plannerNextOccurrence(appt.time, appt.repeat, now + offsetMs);
      if (occurrence == null) continue;
      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: occurrence - offsetMs,
        repeatFrequency: nativeRepeatFor(appt.repeat),
        alarmManager: {type: AlarmType.SET_AND_ALLOW_WHILE_IDLE},
      };
      await notifee.createTriggerNotification(
        {
          id: `${PLAN_APPT_ID_PREFIX}${appt.id}`,
          title: `🗓 ${appt.title}`,
          body: appt.location
            ? i18n.t('planner.notifApptAt', {time: fmtTime(occurrence), location: appt.location, defaultValue: `${fmtTime(occurrence)} · ${appt.location}`})
            : i18n.t('planner.notifAppt', {time: fmtTime(occurrence), defaultValue: fmtTime(occurrence)}),
          android: plannerAndroidConfig(),
        },
        trigger,
      );
    }

    for (const rem of planner.reminders || []) {
      if (!rem.enabled) continue;
      const repeat = rem.repeat || 'daily';
      for (let i = 0; i < (rem.times || []).length; i++) {
        const [hh, mm] = rem.times[i].split(':').map(Number);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
        const anchor = new Date(rem.startDate ?? rem.createdAt);
        anchor.setHours(hh, mm, 0, 0);
        const occurrence = plannerNextOccurrence(anchor.getTime(), repeat, now);
        if (occurrence == null) continue;
        const trigger: TimestampTrigger = {
          type: TriggerType.TIMESTAMP,
          timestamp: occurrence,
          repeatFrequency: nativeRepeatFor(repeat),
          alarmManager: {type: AlarmType.SET_AND_ALLOW_WHILE_IDLE},
        };
        await notifee.createTriggerNotification(
          {
            id: `${PLAN_REM_ID_PREFIX}${rem.id}-${i}`,
            title: `⏰ ${rem.title}`,
            body: rem.notes || i18n.t('planner.notifReminder', {defaultValue: 'Planner reminder'}),
            android: plannerAndroidConfig(),
          },
          trigger,
        );
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
