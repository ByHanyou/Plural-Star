import {AppRegistry} from 'react-native';
import notifee from 'react-native-notify-kit';
import App from './App';
import {name as appName} from './app.json';

// When the front-status refresh trigger delivers while the process is dead,
// notifee boots headless JS and this fires. Re-assert the front notification
// with FRESH content from storage — the trigger's own payload is a snapshot
// from schedule time. Everything lazy-required and swallowed: this path must
// never crash a headless boot.
notifee.onBackgroundEvent(async event => {
  try {
    const {EventType} = require('react-native-notify-kit');
    if (event?.type !== EventType.DELIVERED) return;
    const svc = require('./src/services/NotificationService');
    if (event?.detail?.notification?.id !== svc.NOTIF_ID) return;
    await svc.reassertFrontNotification();
  } catch (e) {}
});

notifee.registerForegroundService(() => new Promise(() => {}));

AppRegistry.registerComponent(appName, () => App);
