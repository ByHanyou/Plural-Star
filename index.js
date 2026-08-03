import {AppRegistry} from 'react-native';
import notifee from 'react-native-notify-kit';
import App from './App';
import {name as appName} from './app.json';

const handleFrontNotifEvent = allowReassert => async event => {
  try {
    const {EventType} = require('react-native-notify-kit');
    const svc = require('./src/services/NotificationService');
    if (event?.detail?.notification?.id !== svc.NOTIF_ID) return;
    if (event?.type === EventType.DISMISSED) {
      await svc.noteFrontNotifDismissed();
      return;
    }
    if (!allowReassert || event?.type !== EventType.DELIVERED) return;
    await svc.reassertFrontNotification();
  } catch (e) {}
};

notifee.onBackgroundEvent(handleFrontNotifEvent(true));
notifee.onForegroundEvent(handleFrontNotifEvent(false));

notifee.registerForegroundService(() => new Promise(() => {}));

AppRegistry.registerComponent(appName, () => App);
