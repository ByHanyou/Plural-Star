import {Platform, PermissionsAndroid} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import i18n from '../i18n/i18n';
import {withTimeout} from './concurrency';
import {log} from './log';

const GPS_LOOKUP_MAX_MS = 15000;
const NOMINATIM_USER_AGENT = 'PluralStar (https://github.com/ByHanyou/Plural-Star)';

const locationAllowed = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    {title: i18n.t('notification.locationPermTitle'), message: i18n.t('notification.locationPermMsg'), buttonPositive: i18n.t('notification.allow'), buttonNegative: i18n.t('notification.deny')},
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
};

const currentPosition = (): Promise<{latitude: number; longitude: number}> =>
  new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      pos => resolve(pos.coords),
      err => reject(new Error(err.message)),
      {enableHighAccuracy: false, timeout: 8000, maximumAge: 120000},
    );
  });

const placeName = async (latitude: number, longitude: number): Promise<string | null> => {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=14`,
    {headers: {'User-Agent': NOMINATIM_USER_AGENT}},
  );
  if (!res.ok) throw new Error(`reverse geocoding returned ${res.status}`);
  const data = (await res.json()) as {address?: Record<string, string | undefined>};
  const a = data.address || {};
  return a.neighbourhood || a.suburb || a.village || a.town || a.city || a.county || a.state || null;
};

const lookUp = async (): Promise<string | null> => {
  if (!(await locationAllowed())) return null;
  const {latitude, longitude} = await currentPosition();
  return placeName(latitude, longitude);
};

export const getGPSLocation = async (): Promise<string | null> => {
  try {
    return await withTimeout(lookUp(), GPS_LOOKUP_MAX_MS, 'location lookup');
  } catch (e) {
    log.debug('location', e);
    return null;
  }
};
