import {Platform, PermissionsAndroid} from 'react-native';
import i18n from '../i18n/i18n';

export const getGPSLocation = (): Promise<string | null> =>
  new Promise(async resolve => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          {title: i18n.t('notification.locationPermTitle'), message: i18n.t('notification.locationPermMsg'), buttonPositive: i18n.t('notification.allow'), buttonNegative: i18n.t('notification.deny')},
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {resolve(null); return;}
      }
      ((globalThis as any).navigator)?.geolocation?.getCurrentPosition(
        async (pos: any) => {
          try {
            const {latitude, longitude} = pos.coords;
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=10`,
              {headers: {'User-Agent': 'PluralStar/1.9.0'}},
            );
            const data = await res.json();
            const a = data.address || {};
            const name = a.neighbourhood || a.suburb || a.village || a.town || a.city || a.county || a.state || null;
            resolve(name);
          } catch { resolve(null); }
        },
        () => resolve(null),
        {timeout: 8000, maximumAge: 120000},
      );
    } catch { resolve(null); }
  });
