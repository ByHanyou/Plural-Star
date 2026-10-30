import notifee, {AndroidStyle} from 'react-native-notify-kit';
import {Platform} from 'react-native';
import {truncateRunes} from '../utils';
import {log} from '../utils/log';
import i18n from '../i18n/i18n';
import {REMINDER_ANDROID, setupReminderChannel} from './notify';

import {notificationsAllowed} from './restMode';

const NOTEBOARD_NOTIF_ID = 'ps-noteboard-unread';

export const showNoteboardNotification = async (
  entries: {memberName: string; unreadCount: number}[],
) => {
  try {
    if (!entries || entries.length === 0 || !(await notificationsAllowed())) return false;
    if (Platform.OS === 'android') await setupReminderChannel();
    const totalNotes = entries.reduce((sum, e) => sum + e.unreadCount, 0);
    const title = i18n.t('notification.noteboardUnreadTitle', {count: totalNotes});
    const summary = entries.map(e => `${e.memberName} (${e.unreadCount})`).join(', ');
    const bigLines = entries.map(e => i18n.t('notification.noteboardUnreadLine', {name: e.memberName, count: e.unreadCount})).join('\n');
    await notifee.displayNotification({
      id: NOTEBOARD_NOTIF_ID,
      title,
      body: Platform.OS === 'ios' ? bigLines : summary,
      ios: {sound: 'default'},
      android: {
        ...REMINDER_ANDROID,
        style: {type: AndroidStyle.BIGTEXT, text: bigLines},
      },
    });
    return true;
  } catch (e) {
    log.error('notifications', 'Noteboard notification error:', e);
    return false;
  }
};

export const clearNoteboardNotification = async () => {
  try {
    await notifee.cancelNotification(NOTEBOARD_NOTIF_ID);
  } catch (e) {
    log.error('notifications', 'Noteboard notification clear error:', e);
  }
};

export const showChatPingNotification = async (
  channelName: string,
  speakerName: string,
  preview: string,
) => {
  try {
    if (!(await notificationsAllowed())) return;
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
        ...REMINDER_ANDROID,
        style: safePreview ? {type: AndroidStyle.BIGTEXT, text: safePreview} : undefined,
      },
    });
  } catch (e) {
    log.error('notifications', 'Chat ping notification error:', e);
  }
};
