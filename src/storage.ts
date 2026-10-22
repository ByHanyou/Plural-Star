import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {config} from './config';
import {asRecord} from './utils';
import {log, logError} from './utils/log';
import {Emitter} from './utils/emitter';
import {ensureDir} from './utils/mediaFiles';
import {FRIENDS_STORAGE_KEY, FRONT_CLEARED_KEY, IDENTITY_STORAGE_KEY, NETWORK_SETTINGS_KEY, PRIVACY_BUCKETS_KEY} from './network/types';

const tierSize = (t: unknown): number => (t && typeof t === 'object' && 'memberIds' in t && Array.isArray(t.memberIds) ? t.memberIds.length : 0);

const frontValueIsEmpty = (v: unknown): boolean => {
  if (v == null) return true;
  if (typeof v !== 'object') return false;
  const f = asRecord(v) ?? {};
  return tierSize(f.primary) + tierSize(f.coFront) + tierSize(f.coConscious) === 0;
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
  medical: 'ps:medical',
  planner: 'ps:planner',
  lastLocation: 'ps:lastLocation',
};

const CRITICAL_KEYS = new Set([
  KEYS.system, KEYS.members, KEYS.front, KEYS.history,
  KEYS.journal, KEYS.groups, KEYS.chatChannels, KEYS.chatCategories, KEYS.relationships,
  KEYS.medical, KEYS.planner,
  IDENTITY_STORAGE_KEY, FRIENDS_STORAGE_KEY, NETWORK_SETTINGS_KEY,
  KEYS.whiteboard, KEYS.polls, KEYS.noteboards, KEYS.customFieldDefs, KEYS.journalTemplates,
  KEYS.relationshipTypes, KEYS.systemMapMembers, KEYS.systemMapPositions, KEYS.palettes,
  KEYS.customColors, KEYS.share, KEYS.settings, PRIVACY_BUCKETS_KEY,
]);

export const CHAT_KEY_PREFIX = 'ps:chat:';
export const chatMsgKey = (channelId: string): string => `${CHAT_KEY_PREFIX}${channelId}`;

const isCritical = (key: string): boolean => CRITICAL_KEYS.has(key) || key.startsWith(CHAT_KEY_PREFIX);

const BACKUP_DIR = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/ps_backup`;

const backupPath = (key: string): string =>
  `${BACKUP_DIR}/${key.replace(/:/g, '_')}.json`;

const writeBackup = async (key: string, value: unknown): Promise<boolean> => {
  try {
    await ensureDir(BACKUP_DIR);
    const json = JSON.stringify(value);
    await ReactNativeBlobUtil.fs.writeFile(backupPath(key), json, 'utf8');
    if (config().storageTrace) log.debug('storage', `backup-write OK ${key} (${json.length}b)`);
    return true;
  } catch (e) {
    log.error('storage', `backup-write FAILED ${key}:`, e);
    return false;
  }
};

const readBackup = async <T>(key: string): Promise<T | null> => {
  try {
    const path = backupPath(key);
    const exists = await ReactNativeBlobUtil.fs.exists(path);
    if (!exists) {
      if (config().storageTrace) log.debug('storage', `backup-read MISS ${key} (no file)`);
      return null;
    }
    const raw = await ReactNativeBlobUtil.fs.readFile(path, 'utf8');
    if (config().storageTrace) log.debug('storage', `backup-read OK ${key} (${raw.length}b)`);
    return JSON.parse(raw) as T;
  } catch (e) {
    log.error('storage', `backup-read FAILED ${key}:`, e);
    return null;
  }
};

export type RecoverableEntry = {key: string; sizeBytes: number; mtime: number; items?: number; fields?: number; name?: string; text?: string};
export const listRecoverableBackups = async (): Promise<RecoverableEntry[]> => {
  try {
    const exists = await ReactNativeBlobUtil.fs.exists(BACKUP_DIR);
    if (!exists) return [];
    const files = await ReactNativeBlobUtil.fs.lstat(BACKUP_DIR);
    const out: RecoverableEntry[] = [];
    for (const f of files) {
      if (f.type !== 'file' || !f.filename.endsWith('.json')) continue;
      const key = `ps:${f.filename.replace(/\.json$/, '').replace(/^ps_/, '').replace(/_/g, ':')}`;
      try {
        const raw = await ReactNativeBlobUtil.fs.readFile(f.path, 'utf8');
        const parsed: unknown = JSON.parse(raw);
        const record = asRecord(parsed);
        const entry: RecoverableEntry = {key, sizeBytes: Number(f.size) || 0, mtime: Number(f.lastModified) || 0};
        if (Array.isArray(parsed)) entry.items = parsed.length;
        else if (record) {
          if (record.name) entry.name = String(record.name).slice(0, 40);
          else entry.fields = Object.keys(record).length;
        } else entry.text = String(parsed).slice(0, 40);
        out.push(entry);
      } catch (e) { logError('storage', e); }
    }
    return out.sort((a, b) => b.mtime - a.mtime);
  } catch (e) {
    log.error('storage', 'listRecoverableBackups error:', e);
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
    log.error('storage', 'getAllKeys THREW during first-run probe:', e);
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
    log.error('storage', 'getAllKeys THREW during boot probe:', e);
  }
  if (!readFailed && psKeys.length > 0) return false;
  return (await listRecoverableBackups()).length > 0;
};

export const restoreAllBackups = async (): Promise<number> => {
  let restored = 0;
  for (const b of await listRecoverableBackups()) {
    if (await restoreFromBackup(b.key)) restored++;
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
    if (config().storageTrace) log.debug('storage', `restored ${key} from backup (${raw.length}b)`);
    return true;
  } catch (e) {
    log.error('storage', `restoreFromBackup ${key} error:`, e);
    return false;
  }
};

const writes = new Emitter<[key: string, removed?: boolean]>('storage');
export const onStoreWrite = (fn: (key: string, removed?: boolean) => void): (() => void) => writes.on(fn);

const dropBackup = async (key: string): Promise<void> => {
  try {
    const path = backupPath(key);
    if (await ReactNativeBlobUtil.fs.exists(path)) await ReactNativeBlobUtil.fs.unlink(path);
    if (config().storageTrace) log.debug('storage', `backup-delete ${key} (intentional empty)`);
  } catch (e) {
    logError('storage', e);
  }
};

const writeWithBackup = async (key: string, json: string, value: unknown): Promise<void> => {
  if (key === KEYS.front && frontValueIsEmpty(value)) {
    try { await AsyncStorage.setItem(FRONT_CLEARED_KEY, String(Date.now())); } catch (e) { logError('storage', e); }
  }
  let writeError: unknown = null;
  try {
    await AsyncStorage.setItem(key, json);
    if (config().storageTrace && isCritical(key)) log.debug('storage', `set ${key} OK (${json.length}b)`);
  } catch (e) {
    writeError = e;
    log.error('storage', `AsyncStorage.setItem FAILED for ${key} (${json.length}b):`, e);
  }
  let backedUp = false;
  if (isCritical(key)) {
    if (Array.isArray(value) && value.length === 0) {
      if (!writeError) await dropBackup(key);
    } else if (value != null) {
      backedUp = await writeBackup(key, value);
    }
  }
  if (writeError && !backedUp) {
    if (isCritical(key)) log.error('storage', `CRITICAL: ${key} failed BOTH AsyncStorage AND filesystem backup writes`);
    throw writeError;
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
      readFailures++;
      log.error('storage', `AsyncStorage.getItem THREW for ${key}:`, e);
    }
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw) as T;
        if (config().storageTrace && isCritical(key)) {
          const len = Array.isArray(parsed) ? `${parsed.length} items` : 'object';
          log.debug('storage', `get ${key} (${raw.length}b, ${len})`);
        }
        if (isCritical(key) && Array.isArray(parsed) && parsed.length === 0) {
          const backup = await readBackup<T>(key);
          if (backup !== null && Array.isArray(backup) && backup.length > 0) {
            log.warn('storage', `Recovered ${key} from backup (was empty)`);
            try { await AsyncStorage.setItem(key, JSON.stringify(backup)); } catch (e) { logError('storage', e); }
            return backup;
          }
        }
        return parsed;
      } catch (e) {
        readFailures++;
        log.error('storage', `JSON.parse failed for ${key}, trying backup:`, e);
      }
    }
    if (isCritical(key)) {
      const backup = await readBackup<T>(key);
      if (backup !== null) {
        log.warn('storage', `Recovered ${key} from backup (AsyncStorage was ${asyncStorageOk ? 'null' : 'broken'})`);
        try { await AsyncStorage.setItem(key, JSON.stringify(backup)); } catch (e) { logError('storage', e); }
        return backup;
      }
    }
    if (config().storageTrace && isCritical(key)) log.debug('storage', `get ${key} returned fallback`);
    return fallback;
  },
  async set(key: string, value: unknown): Promise<void> {
    await writeWithBackup(key, JSON.stringify(value), value);
    writes.emit(key);
  },
  async setRaw(key: string, json: string): Promise<void> {
    let value: unknown;
    try { value = JSON.parse(json); } catch {}
    await writeWithBackup(key, json, value);
  },
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
      if (isCritical(key)) {
        const path = backupPath(key);
        const exists = await ReactNativeBlobUtil.fs.exists(path);
        if (exists) await ReactNativeBlobUtil.fs.unlink(path);
      }
    } catch (e) {
      log.error('storage', 'remove error:', e);
      throw e;
    }
    writes.emit(key, true);
  },
  async clearAll(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const psKeys = allKeys.filter(k => k.startsWith('ps:') || k.startsWith('ps.'));
      await AsyncStorage.removeMany(psKeys);
      const exists = await ReactNativeBlobUtil.fs.exists(BACKUP_DIR);
      if (exists) await ReactNativeBlobUtil.fs.unlink(BACKUP_DIR);
    } catch (e) { log.error('storage', 'clear error:', e); }
  },
};
