import AsyncStorage from '@react-native-async-storage/async-storage';
import {AppState} from 'react-native';
import {config} from '../../config';
import i18n, {changeLanguage, i18nCode, isSupportedLanguage} from '../../i18n/i18n';
import {store, KEYS, storageLooksWiped, restoreAllBackups, storageReadFailures, anyPsKeysExist} from '../../storage';
import {SystemInfo, Member, MemberGroup, FrontState, HistoryEntry, JournalEntry, JournalTemplate, ShareSettings, AppSettings, ChatChannel, ChatCategory, MedicalData, DEFAULT_MEDICAL, PlannerData, DEFAULT_PLANNER, DEFAULT_CHANNELS, findOpenFrontInHistory, migrateFrontState, uid, makeDefaultCustomFronts, DEFAULT_SETTINGS, DEFAULT_SHARE, EMPTY_SYSTEM} from '../../utils';
import type {CustomPalette} from '../../theme';
import {DARK_PALETTE, LIGHT_PALETTE} from '../../theme';
import {migrateInlineAvatars, migrateStaleMediaPaths, downsizeExistingAvatars, restoreMissingMediaFiles} from '../../utils/mediaMigrations';
import {clearAllMedia} from '../../utils/mediaFiles';
import {NetworkManager} from '../../network/NetworkManager';
import {CloudServices} from '../../cloud/cloudPlatform';
import {clearFrontNotification} from '../../services/frontNotification';
import {cancelMedicalReminders, reschedulePlannerNotifications} from '../../services/reminders';
import {waitForProtectedData} from '../../services/LiveActivityService';
import {useAppStore} from '../../store/appStore';
import {pruneFrontOfRemovedMembers} from '../../store/actions';
import {log, logError} from '../../utils/log';
import {mergeHistoryEntries} from '../../import/convert';

type LoadedSlice = {raw: string | null; value: unknown};

export type StartupState = {storageSuspect: boolean; retries: number};
export type Startup = {state: StartupState; run: () => Promise<void>; reset: () => Promise<void>; isSuspect: () => boolean};

let current: Startup | null = null;

export const reloadAll = (): Promise<void> => (current ? current.run() : Promise.resolve());
export const resetApp = (): Promise<void> => (current ? current.reset() : Promise.resolve());

const LOAD_KEYS = [KEYS.system, KEYS.members, KEYS.front, KEYS.history, KEYS.journal, KEYS.journalTemplates, KEYS.share, KEYS.settings, KEYS.groups, KEYS.palettes, KEYS.chatChannels, KEYS.chatCategories];
const MAX_SUSPECT_RETRIES = 3;
const AVATARS_DOWNSIZED_KEY = 'ps.avatarsDownsizedV1';

const defaultChannels = (): ChatChannel[] => DEFAULT_CHANNELS.map(c => ({id: uid(), name: i18n.t(c.key), createdAt: Date.now()}));

async function getFromRaw<T>(rawNow: Record<string, string | null>, key: string, fallback: T | null = null): Promise<T | null> {
  const raw = rawNow[key];
  if (raw == null) return store.get<T>(key, fallback);
  let parsed: T;
  try {
    parsed = JSON.parse(raw) as T;
  } catch {
    return store.get<T>(key, fallback);
  }
  if (Array.isArray(parsed) && parsed.length === 0) return store.get<T>(key, fallback);
  if (config().storageTrace) {
    const len = Array.isArray(parsed) ? `${parsed.length} items` : 'object';
    log.debug('storage', `get ${key} (${raw.length}b, ${len})`);
  }
  return parsed;
}

async function readKeyInto<T>(rawNow: Record<string, string | null>, key: string): Promise<T | null> {
  try {
    rawNow[key] = await AsyncStorage.getItem(key);
  } catch (e) {
    log.debug('storage', e);
    delete rawNow[key];
  }
  return getFromRaw<T>(rawNow, key);
}

async function detectSuspectStorage(): Promise<boolean> {
  let storageSuspect = false;
  if (!(await waitForProtectedData())) {
    if (config().startupTrace) log.info('startup', 'Protected data still locked (pre-unlock background launch), marking storage suspect.');
    storageSuspect = true;
  }
  try {
    if (!storageSuspect && await storageLooksWiped()) {
      if (config().startupTrace) log.info('startup', 'AsyncStorage blank but backups exist, restoring before load');
      const n = await restoreAllBackups();
      if (config().startupTrace) log.info('startup', `restored ${n} keys from file backups`);
      if (n === 0) storageSuspect = true;
    }
  } catch (e) {
    logError('startup', e);
    storageSuspect = true;
  }
  return storageSuspect;
}

async function migrateMemberMedia(members: Member[], system: SystemInfo | null, storageSuspect: boolean): Promise<{members: Member[]; system: SystemInfo | null}> {
  let loadedMembers = members;
  let loadedSystem = system;
  try {
    if (!storageSuspect) {
      const {members: migratedMembers, changed: avatarsChanged} = await migrateInlineAvatars(loadedMembers);
      if (avatarsChanged) {
        loadedMembers = migratedMembers;
        await store.set(KEYS.members, loadedMembers);
      }
    }
  } catch (e) {
    log.error('startup', 'avatar migration error:', e);
  }
  try {
    const {members: rebasedMembers, system: rebasedSystem, changed: pathsChanged} = await migrateStaleMediaPaths(loadedMembers, loadedSystem);
    if (pathsChanged) {
      loadedMembers = rebasedMembers;
      loadedSystem = rebasedSystem;
      if (!storageSuspect) {
        await store.set(KEYS.members, loadedMembers);
        if (rebasedSystem) await store.set(KEYS.system, rebasedSystem);
      }
    }
  } catch (e) {
    log.error('startup', 'media path rebase error:', e);
  }
  try {
    const alreadyDownsized = await store.get<boolean>(AVATARS_DOWNSIZED_KEY, false);
    if (!alreadyDownsized && !storageSuspect) {
      const {members: downsizedMembers, changed: downsizedChanged} = await downsizeExistingAvatars(loadedMembers);
      if (downsizedChanged) {
        loadedMembers = downsizedMembers;
        await store.set(KEYS.members, loadedMembers);
      }
      await store.set(AVATARS_DOWNSIZED_KEY, true);
    }
  } catch (e) {
    log.error('startup', 'avatar downsize migration error:', e);
  }
  return {members: loadedMembers, system: loadedSystem};
}

async function seedCustomFronts(members: Member[], settings: AppSettings, storageSuspect: boolean): Promise<{members: Member[]; settings: AppSettings}> {
  if (settings.customFrontsSeeded || storageSuspect) return {members, settings};
  const existingCustomNames = new Set(members.filter(m => m.isCustomFront).map(m => (m.name || '').toLowerCase()));
  const seeds = makeDefaultCustomFronts().filter(cf => !existingCustomNames.has(cf.name.toLowerCase()));
  const seeded = [...members, ...seeds];
  const next: AppSettings = {...settings, customFrontsSeeded: true};
  if (seeds.length > 0) await store.set(KEYS.members, seeded);
  await store.set(KEYS.settings, next);
  return {members: seeded, settings: next};
}

function healMissingMedia(members: Member[]): void {
  restoreMissingMediaFiles(members).then(async r => {
    if (!r.changed) return;
    const healedById = new Map(r.members.map((m: Member) => [m.id, m]));
    const cur = useAppStore.getState().members;
    const adopt = (curV: string | undefined, healedV: string | undefined) =>
      healedV && healedV !== curV && (!curV || curV.startsWith('file://')) ? healedV : curV;
    const merged = cur.map(m => {
      const h = healedById.get(m.id);
      if (!h) return m;
      const avatar = adopt(m.avatar, h.avatar);
      const banner = adopt(m.banner, h.banner);
      return avatar !== m.avatar || banner !== m.banner ? {...m, avatar, banner} : m;
    });
    useAppStore.getState().setMembers(merged);
    await store.set(KEYS.members, merged);
  }).catch(e => logError('media-restore', e));
}

export function createStartup(onFirstRun: () => void): Startup {
  const state: StartupState = {storageSuspect: false, retries: 0};
  let loadedSlices: Record<string, LoadedSlice> = {};

  const run = async (): Promise<void> => {
    const {
      setLoaded, setSystem, setMembers, setFront, setHistory, setJournal, setJournalTemplates, setShareSettings, setAppSettings,
      setGroups, setPalettes, setActivePaletteId, setChatChannels, setChatCategories, setAllChatMessages, setMedical, setPlanner,
    } = useAppStore.getState();
    const hadAnyPsKeys = await anyPsKeysExist();
    let storageSuspect = await detectSuspectStorage();
    state.storageSuspect = storageSuspect;
    const readFailuresBefore = storageReadFailures();
    try {
      let rawNow: Record<string, string | null> = {};
      try { rawNow = await AsyncStorage.getMany(LOAD_KEYS); } catch (e) { log.debug('storage', e); rawNow = {}; }
      const [sys, mem, fr, hist, jour, jourTemplates, share, settings, savedLang, grps, savedPalettes, savedChannels, savedChatCats] = await Promise.all([
        getFromRaw<SystemInfo>(rawNow, KEYS.system),
        getFromRaw<Member[]>(rawNow, KEYS.members, []),
        getFromRaw<Partial<FrontState>>(rawNow, KEYS.front),
        getFromRaw<HistoryEntry[]>(rawNow, KEYS.history, []),
        getFromRaw<JournalEntry[]>(rawNow, KEYS.journal, []),
        getFromRaw<JournalTemplate[]>(rawNow, KEYS.journalTemplates, []),
        getFromRaw<ShareSettings>(rawNow, KEYS.share, DEFAULT_SHARE),
        getFromRaw<AppSettings>(rawNow, KEYS.settings, DEFAULT_SETTINGS),
        store.get<string>(KEYS.language, ''),
        getFromRaw<MemberGroup[]>(rawNow, KEYS.groups, []),
        getFromRaw<CustomPalette[]>(rawNow, KEYS.palettes, []),
        getFromRaw<ChatChannel[]>(rawNow, KEYS.chatChannels, []),
        getFromRaw<ChatCategory[]>(rawNow, KEYS.chatCategories, []),
      ]);
      if (!storageSuspect && !sys && (mem || []).length === 0 && (hist || []).length === 0 && AppState.currentState !== 'active') {
        if (config().startupTrace) log.info('startup', 'Blank load while app is not active, background/prewarm launch, storage may still be locked. Marking suspect; will retry on foreground.');
        storageSuspect = true;
        state.storageSuspect = true;
      }
      if (!storageSuspect && storageReadFailures() > readFailuresBefore) {
        if (config().startupTrace) log.info('startup', 'AsyncStorage read(s) FAILED during this load, marking suspect; will retry on foreground.');
        storageSuspect = true;
        state.storageSuspect = true;
      }
      const prevLoaded = loadedSlices;
      const nextLoaded: Record<string, LoadedSlice> = {};
      const keep = (key: string, value: unknown): boolean => {
        const p = prevLoaded[key];
        if (storageSuspect || !p || !(key in rawNow) || p.raw !== rawNow[key] || p.value !== value) return false;
        nextLoaded[key] = p;
        return true;
      };
      const loadedInto = <V,>(key: string, value: V): V => {
        if (key in rawNow) nextLoaded[key] = {raw: rawNow[key], value};
        return value;
      };
      const parsedMembers = mem || [];
      const media = await migrateMemberMedia(parsedMembers, sys, storageSuspect);
      let loadedSystem = media.system;
      let loadedMembers = media.members;
      const parsedSettings: AppSettings = {...DEFAULT_SETTINGS, ...(settings || {})};
      const seeded = await seedCustomFronts(loadedMembers, parsedSettings, storageSuspect);
      loadedMembers = seeded.members;
      const loadedSettings = seeded.settings;
      if (!loadedSystem) {
        const realMemberCount = loadedMembers.filter(m => !m.isCustomFront).length;
        const hasUserData = realMemberCount > 0 || (hist && hist.length > 0) || (jour && jour.length > 0) || (grps && grps.length > 0);
        if (hasUserData) {
          if (config().startupTrace) log.info('startup', `System missing but ${realMemberCount} members + data present, reconstructing system, NOT entering first-run.`);
          loadedSystem = EMPTY_SYSTEM;
          if (!storageSuspect) await store.set(KEYS.system, EMPTY_SYSTEM);
          setSystem(EMPTY_SYSTEM);
        } else if (storageSuspect) {
          if (config().startupTrace) log.info('startup', 'Blank load with suspect storage, staying OUT of first-run; will retry on foreground.');
          setSystem(EMPTY_SYSTEM);
        } else if (hadAnyPsKeys) {
          if (config().startupTrace) log.info('startup', 'Blank load BUT ps: keys existed BEFORE this load, this is not a fresh install. Staying OUT of first-run; will retry on foreground.');
          storageSuspect = true;
          state.storageSuspect = true;
          setSystem(EMPTY_SYSTEM);
        } else {
          if (config().startupTrace) log.info('startup', 'No system info loaded and no ps: keys present, entering first-run state.');
          onFirstRun();
        }
      } else if (loadedSystem !== sys || !keep(KEYS.system, useAppStore.getState().system)) {
        setSystem(loadedInto(KEYS.system, loadedSystem));
      }
      if (loadedMembers !== parsedMembers || !keep(KEYS.members, useAppStore.getState().members)) setMembers(loadedInto(KEYS.members, loadedMembers));
      if (!storageSuspect) healMissingMedia(loadedMembers);
      const histKept = keep(KEYS.history, useAppStore.getState().history);
      const rawHist = hist || [];
      const dedupedHist = histKept ? useAppStore.getState().history : mergeHistoryEntries([], rawHist);
      if (!histKept && dedupedHist.length !== rawHist.length && !storageSuspect) {
        if (config().startupTrace) log.info('startup', `collapsed ${rawHist.length - dedupedHist.length} duplicate history entries`);
        await store.set(KEYS.history, dedupedHist);
      }
      const frontKept = (histKept || !!fr?.primary) && keep(KEYS.front, useAppStore.getState().front);
      if (!frontKept) {
        const migratedFront = migrateFrontState(fr) || findOpenFrontInHistory(dedupedHist);
        setFront(loadedInto(KEYS.front, migratedFront));
        if (migratedFront && !fr?.primary && !storageSuspect) {
          await store.set(KEYS.front, migratedFront);
        }
      }
      if (!storageSuspect) await pruneFrontOfRemovedMembers();
      if (!histKept) setHistory(loadedInto(KEYS.history, dedupedHist));
      if (!keep(KEYS.journal, useAppStore.getState().journal)) setJournal(loadedInto(KEYS.journal, jour || []));
      if (!keep(KEYS.journalTemplates, useAppStore.getState().journalTemplates)) setJournalTemplates(loadedInto(KEYS.journalTemplates, jourTemplates || []));
      if (!keep(KEYS.share, useAppStore.getState().shareSettings)) setShareSettings(loadedInto(KEYS.share, share || DEFAULT_SHARE));
      const settingsKept = loadedSettings === parsedSettings && keep(KEYS.settings, useAppStore.getState().appSettings);
      if (!settingsKept) setAppSettings(loadedInto(KEYS.settings, loadedSettings));
      if (!keep(KEYS.groups, useAppStore.getState().groups)) setGroups(loadedInto(KEYS.groups, grps || []));
      if (!keep(KEYS.palettes, useAppStore.getState().palettes)) setPalettes(loadedInto(KEYS.palettes, savedPalettes || []));

      const parsedChannels = savedChannels || [];
      let channels = parsedChannels;
      if (channels.length === 0) {
        channels = defaultChannels();
        if (!storageSuspect) await store.set(KEYS.chatChannels, channels);
      }
      if (channels !== parsedChannels || !keep(KEYS.chatChannels, useAppStore.getState().chatChannels)) setChatChannels(loadedInto(KEYS.chatChannels, channels));
      if (!keep(KEYS.chatCategories, useAppStore.getState().chatCategories)) setChatCategories(loadedInto(KEYS.chatCategories, savedChatCats || []));

      if (!settingsKept) setActivePaletteId(loadedSettings.activePaletteId || (loadedSettings.lightMode ? LIGHT_PALETTE.id : DARK_PALETTE.id));

      try {
        const savedMedical = await readKeyInto<MedicalData>(rawNow, KEYS.medical);
        if (!keep(KEYS.medical, useAppStore.getState().medical)) {
          const med: MedicalData = {...DEFAULT_MEDICAL, ...(savedMedical || {})};
          setMedical(med);
          await cancelMedicalReminders();
          loadedInto(KEYS.medical, med);
        }
      } catch (e) {
        log.error('startup', 'medical init error:', e);
      }

      try {
        const savedPlanner = await readKeyInto<PlannerData>(rawNow, KEYS.planner);
        if (!keep(KEYS.planner, useAppStore.getState().planner)) {
          const plan: PlannerData = {...DEFAULT_PLANNER, ...(savedPlanner || {})};
          setPlanner(plan);
          await reschedulePlannerNotifications(plan);
          loadedInto(KEYS.planner, plan);
        }
      } catch (e) {
        log.error('startup', 'planner init error:', e);
      }

      try {
        if (!storageSuspect) await store.remove('ps:deviceCodes');
      } catch (e) {
        log.error('startup', 'device codes cleanup error:', e);
      }

      if (isSupportedLanguage(savedLang) && i18nCode(savedLang) !== i18n.language) changeLanguage(savedLang);
      if (!state.storageSuspect) loadedSlices = nextLoaded;
    } catch (e) {
      log.error('startup', 'startup load error:', e);
      state.storageSuspect = true;
      let recoveredMembers: Member[] = [];
      let recoveredSystem: SystemInfo | null = null;
      try { recoveredMembers = (await store.get<Member[]>(KEYS.members, [])) || []; } catch (err) { logError('startup', err); }
      try { recoveredSystem = await store.get<SystemInfo>(KEYS.system); } catch (err) { logError('startup', err); }
      const realCount = recoveredMembers.filter(m => !m.isCustomFront).length;
      setMembers(recoveredMembers);
      setFront(null);
      setHistory([]);
      setJournal([]);
      setJournalTemplates([]);
      setShareSettings(DEFAULT_SHARE);
      setAppSettings(DEFAULT_SETTINGS);
      setGroups([]);
      setPalettes([]);
      setChatChannels(defaultChannels());
      setChatCategories([]);
      setAllChatMessages([]);
      if (recoveredSystem) {
        setSystem(recoveredSystem);
      } else if (realCount > 0) {
        setSystem(EMPTY_SYSTEM);
        if (config().startupTrace) log.info('startup', `load error but ${realCount} members recovered, reconstructed system instead of first-run.`);
      } else {
        setSystem(EMPTY_SYSTEM);
        if (config().startupTrace) log.info('startup', 'load error with nothing recovered, staying OUT of first-run; will retry on foreground.');
      }
    } finally {
      setLoaded(true);
      if (state.storageSuspect) {
        if (state.retries < MAX_SUSPECT_RETRIES) {
          const attempt = ++state.retries;
          const delay = attempt * 800;
          if (config().startupTrace) log.info('startup', `suspect load, auto-retry ${attempt}/${MAX_SUSPECT_RETRIES} in ${delay}ms`);
          setTimeout(() => { run(); }, delay);
        } else {
          if (config().startupTrace) log.info('startup', 'suspect load, auto-retry budget exhausted; waiting for foreground.');
        }
      } else {
        state.retries = 0;
      }
    }
  };

  const reset = async (): Promise<void> => {
    await CloudServices.unlink().catch(e => logError('startup', e));
    await clearFrontNotification(); await store.clearAll(); await clearAllMedia();
    await NetworkManager.wipe().catch(e => logError('startup', e));
    useAppStore.getState().resetData();
    await cancelMedicalReminders();
    await reschedulePlannerNotifications(null);
    onFirstRun();
  };

  current = {state, run, reset, isSuspect: () => state.storageSuspect};
  return current;
}
