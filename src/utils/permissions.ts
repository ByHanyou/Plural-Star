import {Platform, PermissionsAndroid, AppState, type Permission} from 'react-native';
import {log} from './log';
import notifee from 'react-native-notify-kit';
import i18n from '../i18n/i18n';
import {useAppStore} from '../store/appStore';

const askAndroid = async (permission: Permission, titleKey: string, messageKey: string, label: string): Promise<void> => {
  try {
    const result = await PermissionsAndroid.request(permission, {
      title: i18n.t(titleKey),
      message: i18n.t(messageKey),
      buttonPositive: i18n.t('notification.allow'),
      buttonNegative: i18n.t('notification.notNow'),
    });
    if (result !== PermissionsAndroid.RESULTS.GRANTED) log.warn('permissions', `${label} denied:`, result);
  } catch (e) { log.error('permissions', `${label} request error:`, e); }
};

export const requestGPSPermission = async () => {
  if (Platform.OS !== 'android') return;
  await askAndroid(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION, 'notification.locationPermTitle', 'notification.locationPermMsg', 'GPS permission');
};

export const requestFilesPermission = async () => {
  if (Platform.OS !== 'android' || Platform.Version >= 33) return;
  await askAndroid(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE, 'notification.filePermTitle', 'notification.filePermMsg', 'File permission');
};

export const requestPermissions = async () => {
  try {
    await notifee.requestPermission();
  } catch (e) { log.error('permissions', 'notification permission error:', e); }
  if (Platform.OS !== 'android' || AppState.currentState !== 'active') return;
  if (Platform.Version >= 33) {
    await askAndroid(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS, 'notification.notifPermTitle', 'notification.notifPermMsg', 'POST_NOTIFICATIONS');
  }
  if (useAppStore.getState().appSettings.gpsEnabled) await requestGPSPermission();
};
