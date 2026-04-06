import AsyncStorage from '@react-native-async-storage/async-storage';

export const KEYS = {
  system:   'ps:system',
  members:  'ps:members',
  front:    'ps:front',
  history:  'ps:history',
  journal:  'ps:journal',
  share:    'ps:share',
  settings: 'ps:settings',
  lightMode:'ps:lightMode',
  language: 'ps:language',
  groups:   'ps:groups',
  palettes: 'ps:palettes',
  chatChannels: 'ps:chatChannels',
};

export const chatMsgKey = (channelId: string): string => `ps:chat:${channelId}`;

export const store = {
  async get<T>(key: string, fallback: T | null = null): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw) as T;
    } catch { return fallback; }
  },
  async set(key: string, value: unknown): Promise<void> {
    try { await AsyncStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.error('Storage write error:', e); }
  },
  async remove(key: string): Promise<void> {
    try { await AsyncStorage.removeItem(key); }
    catch (e) { console.error('Storage remove error:', e); }
  },
  async clearAll(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const psKeys = allKeys.filter(k => k.startsWith('ps:'));
      await AsyncStorage.multiRemove(psKeys);
    } catch (e) { console.error('Storage clear error:', e); }
  },
};
