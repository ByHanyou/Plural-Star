import notifee, {AndroidImportance, AndroidVisibility, AndroidStyle} from 'react-native-notify-kit';
import {Platform} from 'react-native';
import {logError} from '../utils/log';
import {NetworkManager} from '../network/NetworkManager';
import {Friend} from '../network/types';
import {friendNotifyLevel} from '../network/friendState';
import {frontShareLines} from '../network/frontShare';
import i18n from '../i18n/i18n';
import {ANDROID_BASE, durSuffix} from './notify';

const FRIEND_ALERT_CHANNEL_ID = 'plural-space-friend-alerts';
const FRIEND_ALERT_PREFIX = 'ps-friend-alert-';

const setupFriendAlertChannel = async () => {
  await notifee.createChannel({
    id: FRIEND_ALERT_CHANNEL_ID,
    name: i18n.t('notification.channelFriends'),
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
  });
};

export const showFriendUpdateAlert = async (f: Friend) => {
  if (!NetworkManager.getState().enabled) return;
  if (friendNotifyLevel(f) === 'off') return;
  const s = f.lastStatus;
  if (!s?.fronters) return;
  const lines = frontShareLines(s, i18n.t);
  if (Platform.OS === 'ios') {
    await notifee.displayNotification({
      id: `${FRIEND_ALERT_PREFIX}${f.peerId}`,
      title: f.displayName,
      body: lines.length > 1 ? lines.slice(0, 6).join('\n') : `${s.fronters}${durSuffix(s)}`,
      ios: {sound: 'default'},
    });
    return;
  }
  await setupFriendAlertChannel();
  try { await notifee.cancelNotification(`${FRIEND_ALERT_PREFIX}${f.peerId}`); } catch (e) { logError('notif', e); }
  await notifee.displayNotification({
    id: `${FRIEND_ALERT_PREFIX}${f.peerId}`,
    title: f.displayName,
    body: `${s.fronters}${durSuffix(s)}`,
    android: {
      ...ANDROID_BASE,
      channelId: FRIEND_ALERT_CHANNEL_ID,
      timestamp: Date.now(),
      showTimestamp: true,
      ongoing: false,
      autoCancel: true,
      onlyAlertOnce: false,
      importance: AndroidImportance.HIGH,
      style: {type: AndroidStyle.BIGTEXT as const, text: lines.join('\n')},
    },
  });
};
