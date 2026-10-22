import type { Friend, FriendNotifyLevel } from './types';

export const isAcceptedFriend = (f: Friend): boolean => f.kind !== 'device' && f.status === 'accepted';

export const isAcceptedDevice = (f: Friend): boolean => f.kind === 'device' && f.status === 'accepted';

export const friendNotifyLevel = (f: Friend): FriendNotifyLevel =>
  f.notifyLevel ?? (f.showInNotification ? 'full' : 'alerts');
