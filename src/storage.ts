import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {logError} from './utils/log';
import {FRONT_CLEARED_KEY} from './network/types';

const frontValueIsEmpty = (v: unknown): boolean => {
  if (v == null) return true;
  const f = v as any;
  if (typeof f !== 'object') return false;
  const n = (t: any) => (t && Array.isArray(t.memberIds) ? t.memberIds.length : 0);
  return n(f.primary) + n(f.coFront) + n(f.coConscious) === 0;
};

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
  chatCategories: 'ps:chatCategories',
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
  customColors: 'ps:customColors',
  deviceCodes: 'ps:deviceCodes',
  medical: 'ps:medical',
  planner: 'ps:planner',
};

const CRITICAL_KEYS = new Set([
  KEYS.system, KEYS.members, KEYS.front, KEYS.history,
  KEYS.journal, KEYS.groups, KEYS.chatChannels, KEYS.chatCategories, KEYS.relationships,
  KEYS.deviceCodes, KEYS.medical, KEYS.planner,
  'ps:networkIdentity', 'ps:networkFriends', 'ps:networkSettings',
  // Everything else a system writes by hand. Android reads a row back only up
  // to about 2 MB (CursorWindow); the write succeeds regardless, so a channel
  // or a whiteboard that grows past it would read as empty and the next save
  // would overwrite it. The file backup is what makes such a key readable.
  KEYS.whiteboard, KEYS.polls, KEYS.noteboards, KEYS.customFieldDefs, KEYS.journalTemplates,
  KEYS.relationshipTypes, KEYS.systemMapMembers, KEYS.systemMapPositions, KEYS.palettes,
  KEYS.customColors, KEYS.share, KEYS.settings, 'ps:privacyBuckets',
]);

// Chat message lists are one key per channel.
const isCritical = (key: string): boolean => CRITICAL_KEYS.has(key) || key.startsWith('ps:chat:');

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
      // backupPath turns every ':' into '_' (no key name or channel id holds
      // an underscore), so every '_' turns back: ps_chat_<id> is ps:chat:<id>.
      const key = `ps:${f.filename.replace(/\.json$/, '').replace(/^ps_/, '').replace(/_/g, ':')}`;
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
      } catch (e) { logError('storage', e); }
    }
    return out.sort((a, b) => b.mtime - a.mtime);
  } catch (e) {
    console.error('[STORAGE] listRecoverableBackups error:', e);
    return [];
  }
};

let readFailures = 0;
export const storageReadFailures = (): number => readFailures;

export const anyPsKeysExist = async (): Promise<boolean> => {
  try {
    const all = await AsyncStorage.getAllKeys();
    return all.some(k => k.startsWith('ps:'));
  } catch (e) {
    console.error('[STORAGE] getAllKeys THREW during first-run probe:', e);
    readFailures++;
    return false;
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
      } catch (e) { logError('storage', e); }
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

// One listener for "something was saved", used by Cloud Services so that every
// Save also saves to the cloud (SPEC 8.1) without each action knowing about
// it. Applying data FROM the cloud writes AsyncStorage directly, not through
// here, so it cannot echo back into another upload. `removed` is true for a
// store.remove: the one signal that a key left on purpose, as opposed to one
// that merely read back missing and should be repaired from the vault.
let writeListener: ((key: string, removed?: boolean) => void) | null = null;
export const onStoreWrite = (fn: ((key: string, removed?: boolean) => void) | null): void => {
  writeListener = fn;
};

export const store = {
  async get<T>(key: string, fallback: T | null = null): Promise<T | null> {
    let raw: string | null = null;
    let asyncStorageOk = true;
    try {
      raw = await AsyncStorage.getItem(key);
    } catch (e) {
      asyncStorageOk = false;
      readFailures++;
      console.error(`[STORAGE] AsyncStorage.getItem THREW for ${key}:`, e);
    }
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw) as T;
        if (STORAGE_DEBUG && isCritical(key)) {
          const len = Array.isArray(parsed) ? `${parsed.length} items` : 'object';
          console.log(`[STORAGE] get ${key} (${raw.length}b, ${len})`);
        }
        if (isCritical(key) && Array.isArray(parsed) && (parsed as any[]).length === 0) {
          const backup = await readBackup<T>(key);
          if (backup !== null && Array.isArray(backup) && (backup as any[]).length > 0) {
            console.warn(`[STORAGE] Recovered ${key} from backup (was empty)`);
            try { await AsyncStorage.setItem(key, JSON.stringify(backup)); } catch (e) { logError('storage', e); }
            return backup;
          }
        }
        return parsed;
      } catch (e) {
        readFailures++;
        console.error(`[STORAGE] JSON.parse failed for ${key}, trying backup:`, e);
      }
    }
    if (isCritical(key)) {
      const backup = await readBackup<T>(key);
      if (backup !== null) {
        console.warn(`[STORAGE] Recovered ${key} from backup (AsyncStorage was ${asyncStorageOk ? 'null' : 'broken'})`);
        try { await AsyncStorage.setItem(key, JSON.stringify(backup)); } catch (e) { logError('storage', e); }
        return backup;
      }
    }
    if (STORAGE_DEBUG && isCritical(key)) console.log(`[STORAGE] get ${key} returned fallback`);
    return fallback;
  },
  async set(key: string, value: unknown): Promise<void> {
    const json = JSON.stringify(value);
    let asyncStorageOk = true;
    if (key === KEYS.front && frontValueIsEmpty(value)) {
      try { await AsyncStorage.setItem(FRONT_CLEARED_KEY, String(Date.now())); } catch (e) { logError('storage', e); }
    }
    try {
      await AsyncStorage.setItem(key, json);
      if (STORAGE_DEBUG && isCritical(key)) console.log(`[STORAGE] set ${key} OK (${json.length}b)`);
    } catch (e) {
      asyncStorageOk = false;
      console.error(`[STORAGE] AsyncStorage.setItem FAILED for ${key} (${json.length}b):`, e);
    }
    if (isCritical(key)) {
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
    if (writeListener) {
      try { writeListener(key); } catch {}
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
      if (isCritical(key)) {
        const path = backupPath(key);
        const exists = await ReactNativeBlobUtil.fs.exists(path);
        if (exists) await ReactNativeBlobUtil.fs.unlink(path);
      }
    } catch (e) { console.error('Storage remove error:', e); }
    if (writeListener) {
      try { writeListener(key, true); } catch {}
    }
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
