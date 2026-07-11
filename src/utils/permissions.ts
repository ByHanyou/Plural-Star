import {Platform, PermissionsAndroid, AppState} from 'react-native';
import notifee from '@notifee/react-native';
import i18n from '../i18n/i18n';
import {useAppStore} from '../store/appStore';

export const requestPermissions = async () => {
  try {
    await notifee.requestPermission();
  } catch (e) { console.error('[PS] notification permission error:', e); }
  if (Platform.OS !== 'android') return;
  if (AppState.currentState !== 'active') return;
  try {
    if (Platform.Version >= 33) {
      const result = await PermissionsAndroid.request(
        'android.permission.POST_NOTIFICATIONS' as any,
        {
          title: i18n.t('notification.notifPermTitle'),
          message: i18n.t('notification.notifPermMsg'),
          buttonPositive: i18n.t('notification.allow'),
          buttonNegative: i18n.t('notification.notNow'),
        },
      );
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        console.warn('[PS] POST_NOTIFICATIONS denied:', result);
      }
    }
  } catch (e) { console.error('[PS] POST_NOTIFICATIONS request error:', e); }
  try {
    if (useAppStore.getState().appSettings.gpsEnabled) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        {title: i18n.t('notification.locationPermTitle'), message: i18n.t('notification.locationPermMsg'), buttonPositive: i18n.t('notification.allow'), buttonNegative: i18n.t('notification.notNow')});
    }
  } catch (e) { console.error('[PS] location permission error:', e); }
};

export const requestGPSPermission = async () => {
  if (Platform.OS !== 'android') return;
  try {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      {title: i18n.t('notification.locationPermTitle'), message: i18n.t('notification.locationPermMsg'), buttonPositive: i18n.t('notification.allow'), buttonNegative: i18n.t('notification.notNow')});
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      console.warn('[PS] GPS permission denied:', result);
    }
  } catch (e) { console.error('[PS] GPS permission error:', e); }
};

export const requestFilesPermission = async () => {
  if (Platform.OS !== 'android') return;
  try {
    if (Platform.Version < 33) {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        {title: i18n.t('notification.filePermTitle'), message: i18n.t('notification.filePermMsg'), buttonPositive: i18n.t('notification.allow'), buttonNegative: i18n.t('notification.notNow')});
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        console.warn('[PS] File permission denied:', result);
      }
    }
  } catch (e) { console.error('[PS] File permission error:', e); }
};
