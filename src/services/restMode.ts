import {NativeModules, Platform} from 'react-native';
import type {AppSettings} from '../model/types';
import {clockMinutes, isResting} from '../model/restMode';
import {store, KEYS} from '../storage';

export const notificationSettings = () => store.get<AppSettings>(KEYS.settings, null);

export const notificationsAllowed = async (): Promise<boolean> => {
  const settings = await notificationSettings();
  return settings?.notificationsEnabled !== false && !isResting(settings?.restMode);
};

export const syncNotificationSettings = async (settings: AppSettings): Promise<void> => {
  if (Platform.OS !== 'android') return;
  await NativeModules.RestMode.configure(
    settings.notificationsEnabled !== false,
    settings.restMode?.enabled === true,
    clockMinutes(settings.restMode?.start) ?? -1,
    clockMinutes(settings.restMode?.end) ?? -1,
  );
};
