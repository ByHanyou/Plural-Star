import {useEffect, useRef} from 'react';
import {AppState} from 'react-native';
import {FrontState, Member, AppSettings} from '../utils';
import {showFrontNotification, clearFrontNotification, showFriendUpdateAlert, scheduleFrontCheckReminder, cancelFrontCheckReminder, scheduleFrontNotificationRefresh, cancelFrontNotificationRefresh} from '../services/NotificationService';
import {NetworkManager} from '../network/NetworkManager';
import {logError} from '../utils/log';

export const useFrontNotifications = (front: FrontState | null, members: Member[], systemName: string, appSettings: AppSettings) => {
  useEffect(() => {
    if (appSettings.notificationsEnabled) { showFrontNotification(front, members, systemName).catch(e => console.error('[PS] notif error:', e)); }
    else { clearFrontNotification().catch(e => console.error('[PS] clear notif error:', e)); }
  }, [front, members, appSettings.notificationsEnabled, systemName]);

  useEffect(() => {
    let last: string | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const unsub = NetworkManager.subscribe(s => {
      const sig = `${s.enabled}|${s.friends.filter(f => f.showInNotification && f.status === 'accepted').map(f => `${f.peerId}:${f.statusUpdatedAt || 0}`).join(',')}`;
      if (last !== null && sig !== last && appSettings.notificationsEnabled) {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => { showFrontNotification(front, members, systemName).catch(e => logError('notif', e)); }, 2000);
      }
      last = sig;
    });
    return () => { if (debounce) clearTimeout(debounce); unsub(); };
  }, [front, members, appSettings.notificationsEnabled, systemName]);

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
    if (!front || !appSettings.notificationsEnabled) return;
    const interval = setInterval(() => { showFrontNotification(front, members, systemName).catch(e => console.error('[PS] notif refresh error:', e)); }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [front, members, appSettings.notificationsEnabled, systemName]);

  const frontNotifRef = useRef({front, members, systemName, enabled: appSettings.notificationsEnabled});
  frontNotifRef.current = {front, members, systemName, enabled: appSettings.notificationsEnabled};
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active' || !frontNotifRef.current.enabled) return;
      const {front: f, members: m, systemName: n} = frontNotifRef.current;
      showFrontNotification(f, m, n).catch(e => logError('notif', e));
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
    const mins = appSettings.notificationRefreshMinutes || 0;
    if (!front || !appSettings.notificationsEnabled || mins <= 0) {
      cancelFrontNotificationRefresh().catch(e => console.error('[PS] notif refresh cancel error:', e));
    } else {
      scheduleFrontNotificationRefresh(front, members, mins).catch(e => console.error('[PS] notif refresh schedule error:', e));
    }
  }, [front, members, appSettings.notificationRefreshMinutes, appSettings.notificationsEnabled]);
};
