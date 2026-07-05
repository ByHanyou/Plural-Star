import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeBlobUtil from 'react-native-blob-util';

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
  customFieldDefs: 'ps:customFieldDefs',
  noteboards: 'ps:noteboards',
  lastNoteboardSeen: 'ps:lastNoteboardSeen',
  polls:    'ps:polls',
  journalTemplates: 'ps:journalTemplates',
  relationships: 'ps:relationships',
  relationshipTypes: 'ps:relationshipTypes',
  systemMapMembers: 'ps:systemMapMembers',
  systemMapPositions: 'ps:systemMapPositions',
  whiteboard: 'ps:whiteboard',
  deviceCodes: 'ps:deviceCodes',
  medical: 'ps:medical',
};

const CRITICAL_KEYS = new Set([
  KEYS.system, KEYS.members, KEYS.front, KEYS.history,
  KEYS.journal, KEYS.groups, KEYS.chatChannels, KEYS.relationships,
  KEYS.deviceCodes, KEYS.medical,
  'ps:networkIdentity', 'ps:networkFriends', 'ps:networkSettings',
]);

const STORAGE_DEBUG = __DEV__;

const BACKUP_DIR = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/ps_backup`;

const backupPath = (key: string): string =>
  `${BACKUP_DIR}/${key.replace(/:/g, '_')}.json`;

const ensureBackupDir = async () => {
  const exists = await ReactNativeBlobUtil.fs.exists(BACKUP_DIR);
  if (!exists) await ReactNativeBlobUtil.fs.mkdir(BACKUP_DIR);
};

const writeBackup = async (key: string, value: unknown): Promise<boolean> => {
  try {
    await ensureBackupDir();
    const json = JSON.stringify(value);
    await ReactNativeBlobUtil.fs.writeFile(backupPath(key), json, 'utf8');
    if (STORAGE_DEBUG) console.log(`[STORAGE] backup-write OK ${key} (${json.length}b)`);
    return true;
  } catch (e) {
    console.error(`[STORAGE] backup-write FAILED ${key}:`, e);
    return false;
  }
};

const readBackup = async <T>(key: string): Promise<T | null> => {
  try {
    const path = backupPath(key);
    const exists = await ReactNativeBlobUtil.fs.exists(path);
    if (!exists) {
      if (STORAGE_DEBUG) console.log(`[STORAGE] backup-read MISS ${key} (no file)`);
      return null;
    }
    const raw = await ReactNativeBlobUtil.fs.readFile(path, 'utf8');
    if (STORAGE_DEBUG) console.log(`[STORAGE] backup-read OK ${key} (${raw.length}b)`);
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error(`[STORAGE] backup-read FAILED ${key}:`, e);
    return null;
  }
};

export const chatMsgKey = (channelId: string): string => `ps:chat:${channelId}`;

export type RecoverableEntry = {key: string; sizeBytes: number; mtime: number; preview: string};
export const listRecoverableBackups = async (): Promise<RecoverableEntry[]> => {
  try {
    const exists = await ReactNativeBlobUtil.fs.exists(BACKUP_DIR);
    if (!exists) return [];
    const files = await ReactNativeBlobUtil.fs.lstat(BACKUP_DIR);
    const out: RecoverableEntry[] = [];
    for (const f of files) {
      if (f.type !== 'file' || !f.filename.endsWith('.json')) continue;
      const key = `ps:${f.filename.replace(/\.json$/, '').replace(/^ps_/, '')}`;
      try {
        const raw = await ReactNativeBlobUtil.fs.readFile(f.path, 'utf8');
        const parsed = JSON.parse(raw);
        let preview = '';
        if (Array.isArray(parsed)) preview = `${parsed.length} item${parsed.length === 1 ? '' : 's'}`;
        else if (parsed && typeof parsed === 'object') {
          if (parsed.name) preview = `name: "${String(parsed.name).slice(0, 40)}"`;
          else preview = `${Object.keys(parsed).length} field${Object.keys(parsed).length === 1 ? '' : 's'}`;
        } else preview = String(parsed).slice(0, 40);
        out.push({key, sizeBytes: Number(f.size) || 0, mtime: Number(f.lastModified) || 0, preview});
      } catch {}
    }
    return out.sort((a, b) => b.mtime - a.mtime);
  } catch (e) {
    console.error('[STORAGE] listRecoverableBackups error:', e);
    return [];
  }
};

export const storageLooksWiped = async (): Promise<boolean> => {
  let psKeys: string[] = [];
  let readFailed = false;
  try {
    const all = await AsyncStorage.getAllKeys();
    psKeys = all.filter(k => k.startsWith('ps:'));
  } catch (e) {
    readFailed = true;
    console.error('[STORAGE] getAllKeys THREW during boot probe:', e);
  }
  if (!readFailed && psKeys.length > 0) return false;
  try {
    const backups = await listRecoverableBackups();
    return backups.length > 0;
  } catch {
    return false;
  }
};

export const restoreAllBackups = async (): Promise<number> => {
  let restored = 0;
  try {
    const backups = await listRecoverableBackups();
    for (const b of backups) {
      try {
        if (await restoreFromBackup(b.key)) restored++;
      } catch {}
    }
  } catch (e) {
    console.error('[STORAGE] restoreAllBackups error:', e);
  }
  return restored;
};

export const restoreFromBackup = async (key: string): Promise<boolean> => {
  try {
    const path = backupPath(key);
    const exists = await ReactNativeBlobUtil.fs.exists(path);
    if (!exists) return false;
    const raw = await ReactNativeBlobUtil.fs.readFile(path, 'utf8');
    await AsyncStorage.setItem(key, raw);
    if (STORAGE_DEBUG) console.log(`[STORAGE] restored ${key} from backup (${raw.length}b)`);
    return true;
  } catch (e) {
    console.error(`[STORAGE] restoreFromBackup ${key} error:`, e);
    return false;
  }
};

export const store = {
  async get<T>(key: string, fallback: T | null = null): Promise<T | null> {
    let raw: string | null = null;
    let asyncStorageOk = true;
    try {
      raw = await AsyncStorage.getItem(key);
    } catch (e) {
      asyncStorageOk = false;
      console.error(`[STORAGE] AsyncStorage.getItem THREW for ${key}:`, e);
    }
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw) as T;
        if (STORAGE_DEBUG && CRITICAL_KEYS.has(key)) {
          const len = Array.isArray(parsed) ? `${parsed.length} items` : 'object';
          console.log(`[STORAGE] get ${key} (${raw.length}b, ${len})`);
        }
        if (CRITICAL_KEYS.has(key) && Array.isArray(parsed) && (parsed as any[]).length === 0) {
          const backup = await readBackup<T>(key);
          if (backup !== null && Array.isArray(backup) && (backup as any[]).length > 0) {
            console.warn(`[STORAGE] Recovered ${key} from backup (was empty)`);
            try { await AsyncStorage.setItem(key, JSON.stringify(backup)); } catch {}
            return backup;
          }
        }
        return parsed;
      } catch (e) {
        console.error(`[STORAGE] JSON.parse failed for ${key}, trying backup:`, e);
      }
    }
    if (CRITICAL_KEYS.has(key)) {
      const backup = await readBackup<T>(key);
      if (backup !== null) {
        console.warn(`[STORAGE] Recovered ${key} from backup (AsyncStorage was ${asyncStorageOk ? 'null' : 'broken'})`);
        try { await AsyncStorage.setItem(key, JSON.stringify(backup)); } catch {}
        return backup;
      }
    }
    if (STORAGE_DEBUG && CRITICAL_KEYS.has(key)) console.log(`[STORAGE] get ${key} returned fallback`);
    return fallback;
  },
  async set(key: string, value: unknown): Promise<void> {
    const json = JSON.stringify(value);
    let asyncStorageOk = true;
    try {
      await AsyncStorage.setItem(key, json);
      if (STORAGE_DEBUG && CRITICAL_KEYS.has(key)) console.log(`[STORAGE] set ${key} OK (${json.length}b)`);
    } catch (e) {
      asyncStorageOk = false;
      console.error(`[STORAGE] AsyncStorage.setItem FAILED for ${key} (${json.length}b):`, e);
    }
    if (CRITICAL_KEYS.has(key)) {
      const isArray = Array.isArray(value);
      if (!isArray) {
        if (value != null) {
          const ok = await writeBackup(key, value);
          if (!asyncStorageOk && !ok) {
            console.error(`[STORAGE] CRITICAL: ${key} failed BOTH AsyncStorage AND filesystem backup writes — data lost this session`);
          }
        }
      } else {
        const isEmpty = (value as any[]).length === 0;
        if (!isEmpty) {
          const ok = await writeBackup(key, value);
          if (!asyncStorageOk && !ok) {
            console.error(`[STORAGE] CRITICAL: ${key} failed BOTH AsyncStorage AND filesystem backup writes — data lost this session`);
          }
        } else {
          try {
            const path = backupPath(key);
            const exists = await ReactNativeBlobUtil.fs.exists(path);
            if (exists) await ReactNativeBlobUtil.fs.unlink(path);
            if (STORAGE_DEBUG) console.log(`[STORAGE] backup-delete ${key} (intentional empty)`);
          } catch {}
        }
      }
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
      if (CRITICAL_KEYS.has(key)) {
        const path = backupPath(key);
        const exists = await ReactNativeBlobUtil.fs.exists(path);
        if (exists) await ReactNativeBlobUtil.fs.unlink(path);
      }
    } catch (e) { console.error('Storage remove error:', e); }
  },
  async clearAll(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const psKeys = allKeys.filter(k => k.startsWith('ps:'));
      await AsyncStorage.removeMany(psKeys);
      const exists = await ReactNativeBlobUtil.fs.exists(BACKUP_DIR);
      if (exists) await ReactNativeBlobUtil.fs.unlink(BACKUP_DIR);
    } catch (e) { console.error('Storage clear error:', e); }
  },
};
