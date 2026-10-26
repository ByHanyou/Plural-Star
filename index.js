import {AppRegistry} from 'react-native';
import notifee, {EventType} from 'react-native-notify-kit';
import App from './App';
import {name as appName} from './app.json';
import {logError} from './src/utils/log';
import {NOTIF_ID, noteFrontNotifDismissed, reassertFrontNotification, rearmFrontNotificationRefresh} from './src/services/frontNotification';

const handleFrontNotifEvent = allowReassert => async event => {
  try {
    const notification = event?.detail?.notification;
    if (notification?.id !== NOTIF_ID) return;
    if (event.type === EventType.DISMISSED) {
      await noteFrontNotifDismissed(notification);
      return;
    }
    if (event.type !== EventType.DELIVERED) return;
    if (allowReassert) await reassertFrontNotification();
    await rearmFrontNotificationRefresh();
  } catch (e) {
    logError('notif', e);
  }
};

notifee.onBackgroundEvent(handleFrontNotifEvent(true));
notifee.onForegroundEvent(handleFrontNotifEvent(false));

notifee.registerForegroundService(() => new Promise(() => {}));

AppRegistry.registerComponent(appName, () => App);
