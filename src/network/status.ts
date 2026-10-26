import {MAX_NOTIF_FRIENDS} from './types';
import type {ConnStatus, Friend, FriendNotifyLevel} from './types';

export const ONLINE_COLOR = '#2faa55';
export const PENDING_COLOR = '#d6a435';
export const ERROR_COLOR = '#cc4444';

export const netStatusColor = (status: ConnStatus, idle: string): string => {
  switch (status) {
    case 'online': return ONLINE_COLOR;
    case 'connecting':
    case 'reconnecting': return PENDING_COLOR;
    case 'error': return ERROR_COLOR;
    default: return idle;
  }
};

export const netStatusKey = (status: ConnStatus): string => `network.status.${status}`;

export const NOTIFY_GLYPH: Record<FriendNotifyLevel, string> = {full: '🔔', alerts: '📳', off: '🔕'};

export const NOTIFY_KEY: Record<FriendNotifyLevel, string> = {full: 'network.notifFull', alerts: 'network.notifAlerts', off: 'network.notifOff'};

export const nextNotifyLevel = (level: FriendNotifyLevel, fullCount: number): FriendNotifyLevel =>
  level === 'full' ? 'alerts' : level === 'alerts' ? 'off' : fullCount >= MAX_NOTIF_FRIENDS ? 'alerts' : 'full';

export const deviceStatusKey = (f: Friend, online: boolean): string =>
  f.status === 'entered_theirs' ? 'network.waitingThem'
    : f.status === 'entered_mine' ? 'network.waitingYou'
    : f.initPending ? (f.initRole === 'source' ? 'network.syncCloneSending' : 'network.syncCloneReceiving')
    : online ? 'network.online' : 'network.offline';

const OFFLINE_HINTS = ['timed out', 'timeout', 'network request failed', 'not connected'];

export const isOfflineError = (msg: string): boolean => OFFLINE_HINTS.some(h => msg.includes(h));
