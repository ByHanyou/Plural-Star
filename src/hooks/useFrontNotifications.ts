import notifee from 'react-native-notify-kit';
import {useEffect, useMemo, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {FrontState, Member, AppSettings} from '../utils';
import {showFrontNotification, clearFrontNotification, scheduleFrontNotificationRefresh, cancelFrontNotificationRefresh, clearFrontDismissGuard} from '../services/frontNotification';
import {showFriendUpdateAlert} from '../services/friendAlerts';
import {scheduleFrontCheckReminder, cancelFrontCheckReminder} from '../services/reminders';
import {NetworkManager} from '../network/NetworkManager';
import {endFriendsActivity} from '../services/LiveActivityService';
import {friendNotifyLevel, isAcceptedFriend} from '../network/friendState';
import {isResting, nextRestBoundary} from '../model/restMode';
import {log, logError} from '../utils/log';

export const useFrontNotifications = (front: FrontState | null, members: Member[], systemName: string, appSettings: AppSettings, loaded: boolean) => {
  const [resting, setResting] = useState(() => isResting(appSettings.restMode));
  const rest = appSettings.restMode;
  const restSignature = `${rest?.enabled}|${rest?.start}|${rest?.end}`;
  useEffect(() => {
    if (!loaded) return;
    let timer: ReturnType<typeof setTimeout>;
    let previous: boolean | undefined;
    const update = () => {
      clearTimeout(timer);
      const now = Date.now();
      const quiet = isResting(rest, now);
      setResting(quiet);
      if (quiet && previous !== true) {
        clearFrontNotification(false).then(() => notifee.cancelDisplayedNotifications()).catch(e => logError('notif', e));
        endFriendsActivity().catch(e => logError('notif', e));
      }
      previous = quiet;
      const boundary = nextRestBoundary(rest, now);
      // Also recheck clock/timezone changes while foregrounded.
      if (boundary !== null) timer = setTimeout(update, Math.min(60000, Math.max(1, boundary - now)));
    };
    update();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') update(); });
    return () => { clearTimeout(timer); sub.remove(); };
  }, [loaded, restSignature]);

  const persistent = appSettings.persistentFrontNotif !== false;
  const refreshMins = appSettings.notificationRefreshMinutes || 30;
  const membersRef = useRef(members);
  membersRef.current = members;
  const namesSig = useMemo(() => members.map(m => `${m.id}|${m.name}`).join('\n'), [members]);

  useEffect(() => {
    if (!loaded) return;
    clearFrontDismissGuard();
    if (!appSettings.notificationsEnabled || !persistent || rest?.enabled) endFriendsActivity().catch(e => logError('notif', e));
    NetworkManager.refreshGatewayRegistration();
  }, [loaded, appSettings.notificationsEnabled, persistent, restSignature]);

  useEffect(() => {
    if (!loaded) return;
    if (appSettings.notificationsEnabled && persistent) { showFrontNotification(front, membersRef.current, systemName).catch(e => log.error('notifications', 'notif error:', e)); }
    else { clearFrontNotification().catch(e => log.error('notifications', 'clear notif error:', e)); }
  }, [loaded, front, namesSig, appSettings.notificationsEnabled, persistent, systemName, resting, restSignature]);

  useEffect(() => {
    let last: string | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const unsub = NetworkManager.subscribe(s => {
      const sig = `${s.enabled}|${s.friends.filter(f => friendNotifyLevel(f) === 'full' && isAcceptedFriend(f)).map(f => `${f.peerId}:${f.statusUpdatedAt || 0}`).join(',')}`;
      if (last !== null && sig !== last && appSettings.notificationsEnabled && persistent) {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => { showFrontNotification(front, membersRef.current, systemName).catch(e => logError('notif', e)); }, 2000);
      }
      last = sig;
    });
    return () => { if (debounce) clearTimeout(debounce); unsub(); };
  }, [front, namesSig, appSettings.notificationsEnabled, persistent, systemName, resting, restSignature]);

  useEffect(() => {
    const lastSeen = new Map<string, string>();
    let primed = false;
    const unsub = NetworkManager.subscribe(s => {
      if (!primed) {
        for (const f of s.friends) {
          if (isAcceptedFriend(f)) lastSeen.set(f.peerId, JSON.stringify(f.lastStatus ?? null));
        }
        primed = true;
        return;
      }
      for (const f of s.friends) {
        if (!isAcceptedFriend(f)) continue;
        const prev = lastSeen.get(f.peerId);
        const cur = JSON.stringify(f.lastStatus ?? null);
        if (cur !== prev) {
          lastSeen.set(f.peerId, cur);
          if (appSettings.notificationsEnabled) showFriendUpdateAlert(f).catch(e => logError('notif', e));
        }
      }
    });
    return () => unsub();
  }, [appSettings.notificationsEnabled]);

  useEffect(() => {
    if (!front || !appSettings.notificationsEnabled || !persistent) return;
    const interval = setInterval(() => { showFrontNotification(front, membersRef.current, systemName).catch(e => log.error('notifications', 'notif refresh error:', e)); }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [front, namesSig, appSettings.notificationsEnabled, persistent, systemName, resting, restSignature]);

  const frontNotifRef = useRef({front, members, systemName, enabled: appSettings.notificationsEnabled && persistent, refreshMins});
  frontNotifRef.current = {front, members, systemName, enabled: appSettings.notificationsEnabled && persistent, refreshMins};
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active' || !frontNotifRef.current.enabled) return;
      clearFrontDismissGuard();
      const {front: f, members: m, systemName: n, refreshMins: mins} = frontNotifRef.current;
      showFrontNotification(f, m, n).catch(e => logError('notif', e));
      if (f && mins > 0) scheduleFrontNotificationRefresh(f, m, mins).catch(e => logError('notif', e));
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const interval = appSettings.frontCheckInterval || 0;
    if (!appSettings.notificationsEnabled || interval <= 0) {
      cancelFrontCheckReminder().catch(e => log.error('notifications', 'front-check cancel error:', e));
    } else {
      scheduleFrontCheckReminder(interval, appSettings.accountMode === 'singlet').catch(e => log.error('notifications', 'front-check schedule error:', e));
    }
  }, [loaded, appSettings.frontCheckInterval, appSettings.notificationsEnabled, appSettings.accountMode, restSignature]);

  useEffect(() => {
    if (!loaded) return;
    if (!front || !appSettings.notificationsEnabled || !persistent || refreshMins <= 0) {
      cancelFrontNotificationRefresh().catch(e => log.error('notifications', 'notif refresh cancel error:', e));
    } else {
      scheduleFrontNotificationRefresh(front, frontNotifRef.current.members, refreshMins).catch(e => log.error('notifications', 'notif refresh schedule error:', e));
    }
  }, [loaded, front, refreshMins, appSettings.notificationsEnabled, persistent, resting, restSignature]);
};
