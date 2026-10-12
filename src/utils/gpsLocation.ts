import {Platform, PermissionsAndroid} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import i18n from '../i18n/i18n';

const GPS_LOOKUP_MAX_MS = 15000;
const NOMINATIM_USER_AGENT = 'PluralStar (https://github.com/ByHanyou/Plural-Star)';

export const getGPSLocation = (): Promise<string | null> =>
  new Promise(async resolve => {
    let settled = false;
    let guard: ReturnType<typeof setTimeout> | null = null;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      if (guard) clearTimeout(guard);
      resolve(value);
    };
    guard = setTimeout(() => finish(null), GPS_LOOKUP_MAX_MS);
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          {title: i18n.t('notification.locationPermTitle'), message: i18n.t('notification.locationPermMsg'), buttonPositive: i18n.t('notification.allow'), buttonNegative: i18n.t('notification.deny')},
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {finish(null); return;}
      }
      Geolocation.getCurrentPosition(
        async pos => {
          try {
            const {latitude, longitude} = pos.coords;
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=14`,
              {headers: {'User-Agent': NOMINATIM_USER_AGENT}},
            );
            const data = await res.json();
            const a = data.address || {};
            const name = a.neighbourhood || a.suburb || a.village || a.town || a.city || a.county || a.state || null;
            finish(name);
          } catch { finish(null); }
        },
        () => finish(null),
        {enableHighAccuracy: false, timeout: 8000, maximumAge: 120000},
      );
    } catch { finish(null); }
  });
