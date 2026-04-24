import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';

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
};

const CRITICAL_KEYS = new Set([
  KEYS.system, KEYS.members, KEYS.front, KEYS.history,
  KEYS.journal, KEYS.groups, KEYS.chatChannels,
]);

// Diagnostic flag — when true, logs every critical key read/write with size,
// success/failure, and recovery actions. Investigating Samsung Galaxy device
// reports of system info not persisting across launches.
const STORAGE_DEBUG = true;

const BACKUP_DIR = `${RNFS.DocumentDirectoryPath}/ps_backup`;

const backupPath = (key: string): string =>
  `${BACKUP_DIR}/${key.replace(/:/g, '_')}.json`;

const ensureBackupDir = async () => {
  const exists = await RNFS.exists(BACKUP_DIR);
  if (!exists) await RNFS.mkdir(BACKUP_DIR);
};

// Returns true on success, false on any failure. Awaitable so callers can react.
const writeBackup = async (key: string, value: unknown): Promise<boolean> => {
  try {
    await ensureBackupDir();
    const json = JSON.stringify(value);
    await RNFS.writeFile(backupPath(key), json, 'utf8');
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
    const exists = await RNFS.exists(path);
    if (!exists) {
      if (STORAGE_DEBUG) console.log(`[STORAGE] backup-read MISS ${key} (no file)`);
      return null;
    }
    const raw = await RNFS.readFile(path, 'utf8');
    if (STORAGE_DEBUG) console.log(`[STORAGE] backup-read OK ${key} (${raw.length}b)`);
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error(`[STORAGE] backup-read FAILED ${key}:`, e);
    return null;
  }
};

export const chatMsgKey = (channelId: string): string => `ps:chat:${channelId}`;

// Helper for the Recover Data UI in ShareScreen. Scans the backup directory
// and returns metadata about every recoverable critical key, including size and
// content summary. Used to present users with what they can restore when
// AsyncStorage has been wiped.
export type RecoverableEntry = {key: string; sizeBytes: number; mtime: number; preview: string};
export const listRecoverableBackups = async (): Promise<RecoverableEntry[]> => {
  try {
    const exists = await RNFS.exists(BACKUP_DIR);
    if (!exists) return [];
    const files = await RNFS.readDir(BACKUP_DIR);
    const out: RecoverableEntry[] = [];
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith('.json')) continue;
      const key = `ps:${f.name.replace(/\.json$/, '').replace(/^ps_/, '')}`;
      try {
        const raw = await RNFS.readFile(f.path, 'utf8');
        const parsed = JSON.parse(raw);
        let preview = '';
        if (Array.isArray(parsed)) preview = `${parsed.length} item${parsed.length === 1 ? '' : 's'}`;
        else if (parsed && typeof parsed === 'object') {
          if (parsed.name) preview = `name: "${String(parsed.name).slice(0, 40)}"`;
          else preview = `${Object.keys(parsed).length} field${Object.keys(parsed).length === 1 ? '' : 's'}`;
        } else preview = String(parsed).slice(0, 40);
        out.push({key, sizeBytes: f.size, mtime: f.mtime ? f.mtime.getTime() : 0, preview});
      } catch { /* skip unreadable */ }
    }
    return out.sort((a, b) => b.mtime - a.mtime);
  } catch (e) {
    console.error('[STORAGE] listRecoverableBackups error:', e);
    return [];
  }
};

// Restore a single backup file's contents back into AsyncStorage. Used by the
// Recover Data UI. After calling this for the keys the user wants, the app
// should reload (loadAll) to pick up the recovered data into React state.
export const restoreFromBackup = async (key: string): Promise<boolean> => {
  try {
    const path = backupPath(key);
    const exists = await RNFS.exists(path);
    if (!exists) return false;
    const raw = await RNFS.readFile(path, 'utf8');
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
        // Empty-array critical key: try recovery from backup
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
    // AsyncStorage returned null OR threw OR returned unparseable data.
    // For critical keys, try the RNFS backup as fallback.
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
      // Two distinct cases for critical keys:
      //   - Object values (system, front): always back up. They never get
      //     "emptied" — they're either present with content or null.
      //   - Array values (members, history, journal, groups, chatChannels):
      //     back up only when non-empty. An explicit empty array means the
      //     user cleared the collection — delete the backup so next load
      //     doesn't resurrect deleted data.
      const isArray = Array.isArray(value);
      if (!isArray) {
        if (value != null) {
          // AWAITED — if AsyncStorage already failed, we MUST get the backup
          // written before returning so future loads can recover.
          const ok = await writeBackup(key, value);
          if (!asyncStorageOk && !ok) {
            console.error(`[STORAGE] CRITICAL: ${key} failed BOTH AsyncStorage AND RNFS backup writes — data lost this session`);
          }
        }
      } else {
        const isEmpty = (value as any[]).length === 0;
        if (!isEmpty) {
          const ok = await writeBackup(key, value);
          if (!asyncStorageOk && !ok) {
            console.error(`[STORAGE] CRITICAL: ${key} failed BOTH AsyncStorage AND RNFS backup writes — data lost this session`);
          }
        } else {
          // User explicitly cleared this collection. Remove the backup file
          // so the next `get` doesn't resurrect stale data. App.tsx pre-load
          // guards already prevent transient empties from reaching here.
          try {
            const path = backupPath(key);
            const exists = await RNFS.exists(path);
            if (exists) await RNFS.unlink(path);
            if (STORAGE_DEBUG) console.log(`[STORAGE] backup-delete ${key} (intentional empty)`);
          } catch { /* non-fatal */ }
        }
      }
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
      if (CRITICAL_KEYS.has(key)) {
        const path = backupPath(key);
        const exists = await RNFS.exists(path);
        if (exists) await RNFS.unlink(path);
      }
    } catch (e) { console.error('Storage remove error:', e); }
  },
  async clearAll(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const psKeys = allKeys.filter(k => k.startsWith('ps:'));
      await AsyncStorage.multiRemove(psKeys);
      const exists = await RNFS.exists(BACKUP_DIR);
      if (exists) await RNFS.unlink(BACKUP_DIR);
    } catch (e) { console.error('Storage clear error:', e); }
  },
};
