import {AppRegistry} from 'react-native';
import notifee from 'react-native-notify-kit';
import App from './App';
import {name as appName} from './app.json';

notifee.onBackgroundEvent(async () => {});

notifee.registerForegroundService(() => new Promise(() => {}));

AppRegistry.registerComponent(appName, () => App);
