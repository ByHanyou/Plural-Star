import {useEffect, useRef} from 'react';
import {FrontState, Member, AppSettings, NoteboardEntry, allFrontMemberIds} from '../utils';
import {store, KEYS} from '../storage';
import {showNoteboardNotification, clearNoteboardNotification} from '../services/messageNotifications';
import {log, logError} from '../utils/log';

export const useNoteboardNotifications = (front: FrontState | null, members: Member[], appSettings: AppSettings) => {
  const prevFrontIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!appSettings.notificationsEnabled || !appSettings.noteboardNotifications || appSettings.accountMode === 'singlet') {
      prevFrontIdsRef.current = new Set();
      clearNoteboardNotification().catch(e => logError('notif', e));
      return;
    }
    const currentIds = new Set(allFrontMemberIds(front));
    const newlyFronting: string[] = [];
    currentIds.forEach(id => { if (!prevFrontIdsRef.current.has(id)) newlyFronting.push(id); });
    prevFrontIdsRef.current = currentIds;
    if (currentIds.size === 0) {
      clearNoteboardNotification().catch(e => logError('notif', e));
      return;
    }
    if (newlyFronting.length === 0) return;
    (async () => {
      try {
        const allNotes = await store.get<NoteboardEntry[]>(KEYS.noteboards, []) || [];
        const lastSeen = await store.get<Record<string, number>>(KEYS.lastNoteboardSeen, {}) || {};
        const entries: {memberName: string; unreadCount: number}[] = [];
        const notified: Record<string, number> = {};
        for (const memberId of newlyFronting) {
          const member = members.find(m => m.id === memberId);
          if (!member) continue;
          const lastSeenTs = lastSeen[memberId] || 0;
          const unread = allNotes.filter(n => n.memberId === memberId && !n.read && n.timestamp > lastSeenTs);
          if (unread.length > 0) {
            entries.push({memberName: member.name, unreadCount: unread.length});
            notified[memberId] = Math.max(...unread.map(n => n.timestamp));
          }
        }
        if (entries.length > 0) {
          await showNoteboardNotification(entries);
          await store.set(KEYS.lastNoteboardSeen, {...lastSeen, ...notified});
        }
      } catch (e) { log.error('notifications', 'noteboard unread check error:', e); }
    })();
  }, [front, members, appSettings.notificationsEnabled, appSettings.noteboardNotifications, appSettings.accountMode]);
};
