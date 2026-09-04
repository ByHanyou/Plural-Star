import {useEffect, useRef} from 'react';
import {AppState} from 'react-native';
import {FrontState, Member, AppSettings} from '../utils';
import {showFrontNotification, clearFrontNotification, showFriendUpdateAlert, scheduleFrontCheckReminder, cancelFrontCheckReminder, scheduleFrontNotificationRefresh, cancelFrontNotificationRefresh, clearFrontDismissGuard} from '../services/NotificationService';
import {NetworkManager} from '../network/NetworkManager';
import {friendNotifyLevel} from '../network/types';
import {logError} from '../utils/log';

export const useFrontNotifications = (front: FrontState | null, members: Member[], systemName: string, appSettings: AppSettings) => {
  const persistent = appSettings.persistentFrontNotif !== false;

  useEffect(() => {
    if (appSettings.notificationsEnabled && persistent) { showFrontNotification(front, members, systemName).catch(e => console.error('[PS] notif error:', e)); }
    else { clearFrontNotification().catch(e => console.error('[PS] clear notif error:', e)); }
  }, [front, members, appSettings.notificationsEnabled, persistent, systemName]);

  useEffect(() => {
    let last: string | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const unsub = NetworkManager.subscribe(s => {
      const sig = `${s.enabled}|${s.friends.filter(f => friendNotifyLevel(f) === 'full' && f.status === 'accepted').map(f => `${f.peerId}:${f.statusUpdatedAt || 0}`).join(',')}`;
      if (last !== null && sig !== last && appSettings.notificationsEnabled && persistent) {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => { showFrontNotification(front, members, systemName).catch(e => logError('notif', e)); }, 2000);
      }
      last = sig;
    });
    return () => { if (debounce) clearTimeout(debounce); unsub(); };
  }, [front, members, appSettings.notificationsEnabled, persistent, systemName]);

  useEffect(() => {
    const lastSeen = new Map<string, string>();
    let primed = false;
    const unsub = NetworkManager.subscribe(s => {
      if (!primed) {
        for (const f of s.friends) {
          if (f.kind !== 'device' && f.status === 'accepted') lastSeen.set(f.peerId, JSON.stringify(f.lastStatus ?? null));
        }
        primed = true;
        return;
      }
      for (const f of s.friends) {
        if (f.kind === 'device' || f.status !== 'accepted') continue;
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
    const interval = setInterval(() => { showFrontNotification(front, members, systemName).catch(e => console.error('[PS] notif refresh error:', e)); }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [front, members, appSettings.notificationsEnabled, persistent, systemName]);

  useEffect(() => {
    clearFrontDismissGuard();
  }, [appSettings.notificationsEnabled, persistent]);

  const frontNotifRef = useRef({front, members, systemName, enabled: appSettings.notificationsEnabled && persistent, refreshMins: appSettings.notificationRefreshMinutes || 30});
  frontNotifRef.current = {front, members, systemName, enabled: appSettings.notificationsEnabled && persistent, refreshMins: appSettings.notificationRefreshMinutes || 30};
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active' || !frontNotifRef.current.enabled) return;
      clearFrontDismissGuard();
      const {front: f, members: m, systemName: n, refreshMins} = frontNotifRef.current;
      showFrontNotification(f, m, n).catch(e => logError('notif', e));
      if (f && refreshMins > 0) scheduleFrontNotificationRefresh(f, m, refreshMins).catch(e => logError('notif', e));
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const interval = appSettings.frontCheckInterval || 0;
    if (!appSettings.notificationsEnabled || interval <= 0) {
      cancelFrontCheckReminder().catch(e => console.error('[PS] front-check cancel error:', e));
    } else {
      scheduleFrontCheckReminder(interval, appSettings.accountMode === 'singlet').catch(e => console.error('[PS] front-check schedule error:', e));
    }
  }, [appSettings.frontCheckInterval, appSettings.notificationsEnabled, appSettings.accountMode]);

  useEffect(() => {
    const mins = appSettings.notificationRefreshMinutes || 30;
    if (!front || !appSettings.notificationsEnabled || !persistent || mins <= 0) {
      cancelFrontNotificationRefresh().catch(e => console.error('[PS] notif refresh cancel error:', e));
    } else {
      scheduleFrontNotificationRefresh(front, frontNotifRef.current.members, mins).catch(e => console.error('[PS] notif refresh schedule error:', e));
    }
  }, [front, appSettings.notificationRefreshMinutes, appSettings.notificationsEnabled, persistent]);
};
