import React, {useState, useEffect, useCallback, useMemo, useRef, useImperativeHandle, startTransition} from 'react';
import {View, StyleSheet, StatusBar, Alert, AppState, BackHandler, Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {setAppTextFont} from './src/components/AppText';
import {fontFamilyForChoice} from './src/theme';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {KeyboardProvider} from 'react-native-keyboard-controller';
import {useTranslation} from 'react-i18next';

import './src/i18n/i18n';
import i18n, {changeLanguage} from './src/i18n/i18n';
import type {SupportedLanguage} from './src/i18n/i18n';
import {setTerminologyOverrides, setTierNameOverrides} from './src/i18n/terminology';
import {ImageCropHost} from './src/components/ImageCropModal';

import {BUILTIN_PALETTES, deriveTheme} from './src/theme';
import type {CustomPalette, ThemeColors} from './src/theme';
import {store, KEYS, storageLooksWiped, restoreAllBackups, storageReadFailures, anyPsKeysExist} from './src/storage';
import {SystemInfo, Member, MemberGroup, FrontTier, FrontTierKey, HistoryEntry, JournalEntry, JournalTemplate, ShareSettings, AppSettings, ChatChannel, ChatCategory, DeviceCodes, MedicalData, DEFAULT_MEDICAL, PlannerData, DEFAULT_PLANNER, DEFAULT_CHANNELS, findOpenFrontInHistory, migrateFrontState, uid, makeDefaultCustomFronts, allFrontMemberIds, singletStatuses, generateFriendCode, generateSyncCode} from './src/utils';
import {migrateInlineAvatars, clearAllMedia, migrateStaleMediaPaths, downsizeExistingAvatars, restoreMissingMediaFiles} from './src/utils/mediaUtils';
import {clearFrontNotification, setEmergencyNotificationInfo, rescheduleMedicationReminders, rescheduleAppointmentReminders, reschedulePlannerNotifications} from './src/services/NotificationService';
import {waitForProtectedData} from './src/services/LiveActivityService';

import {SetupScreen} from './src/screens/SetupScreen';
import {LockScreen} from './src/screens/LockScreen';
import {FrontScreen} from './src/screens/FrontScreen';
import {MembersScreen} from './src/screens/MembersScreen';
import {SystemManagerScreen} from './src/screens/SystemManagerScreen';
import {HistoryScreen} from './src/screens/HistoryScreen';
import {JournalScreen} from './src/screens/JournalScreen';
import {ShareScreen} from './src/screens/ShareScreen';
import {HubScreen} from './src/screens/HubScreen';
import {StatsScreen} from './src/screens/StatsScreen';
import {ChatScreen} from './src/screens/ChatScreen';
import {CustomFieldsScreen} from './src/screens/CustomFieldsScreen';
import {PollsScreen} from './src/screens/PollsScreen';
import {SystemMapScreen} from './src/screens/SystemMapScreen';
import {MailboxScreen} from './src/screens/MailboxScreen';
import {WhiteboardScreen} from './src/screens/WhiteboardScreen';
import {ColorsScreen} from './src/screens/ColorsScreen';
import {StatusScreen} from './src/screens/StatusScreen';
import {ProfileScreen} from './src/screens/ProfileScreen';
import {NetworkScreen} from './src/screens/NetworkScreen';
import {NetworkManager} from './src/network/NetworkManager';
import {CloudServices, bootCloudServices} from './src/cloud/cloudPlatform';
import {installDestructiveGuard} from './src/cloud/destructiveGuard';
import {SetFrontModal, SetStatusModal, EditFrontDetailModal, MemberModal, JournalModal, SystemModal, SystemProfileModal, CustomFrontModal} from './src/modals';
import {AppErrorBoundary} from './src/components/AppErrorBoundary';
import {SplashView} from './src/components/SplashView';
import {AppHeader} from './src/components/AppHeader';
import {TabBar, Tab, TAB_IDS} from './src/components/TabBar';
import {TabActiveContext, createTabActiveSources} from './src/hooks/useTabActive';
import {useFrontNotifications} from './src/hooks/useFrontNotifications';
import {useNoteboardNotifications} from './src/hooks/useNoteboardNotifications';
import {useAppStore, DEFAULT_SETTINGS} from './src/store/appStore';
import {saveSystem, saveMembers, savePalettes, selectPalette, updateFront, updateFrontDetails, quickAddToFront, removeFromFront, saveMember, deleteMember, restoreDeletedMember, pruneFrontOfRemovedMembers, bulkSetArchived, bulkDeleteMembers, bulkAddGroups, bulkAddTags, bulkSetFacet, saveEntry, deleteEntry, addJournalEntry, saveAppSettings, ensureSelfMember, saveMemberListFields, saveMemberSortMode, reorderMember} from './src/store/actions';
import {requestPermissions} from './src/utils/permissions';
import {logError} from './src/utils/log';
import {mergeHistoryEntries} from './src/import/convert';

type LoadedSlice = {raw: string | null; value: unknown};
type TabMemory = {tab: Tab; mounted: Tab[]};
type TabHostControl = {goTab: (id: Tab) => void; currentTab: () => Tab};

const LOAD_KEYS = [KEYS.system, KEYS.members, KEYS.front, KEYS.history, KEYS.journal, KEYS.journalTemplates, KEYS.share, KEYS.settings, KEYS.groups, KEYS.palettes, KEYS.chatChannels, KEYS.chatCategories];

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
  if (__DEV__) {
    const len = Array.isArray(parsed) ? `${parsed.length} items` : 'object';
    console.log(`[STORAGE] get ${key} (${raw.length}b, ${len})`);
  }
  return parsed;
}

async function readKeyInto<T>(rawNow: Record<string, string | null>, key: string): Promise<T | null> {
  try {
    rawNow[key] = await AsyncStorage.getItem(key);
  } catch {
    delete rawNow[key];
  }
  return getFromRaw<T>(rawNow, key);
}

const MemoFrontScreen = React.memo(FrontScreen);
const MemoStatusScreen = React.memo(StatusScreen);
const MemoProfileScreen = React.memo(ProfileScreen);
const MemoMembersScreen = React.memo(MembersScreen);
const MemoHubScreen = React.memo(HubScreen);
const MemoJournalScreen = React.memo(JournalScreen);
const MemoHistoryScreen = React.memo(HistoryScreen);
const MemoShareScreen = React.memo(ShareScreen);
const MemoStatsScreen = React.memo(StatsScreen);
const MemoChatScreen = React.memo(ChatScreen);
const MemoCustomFieldsScreen = React.memo(CustomFieldsScreen);
const MemoSystemManagerScreen = React.memo(SystemManagerScreen);
const MemoPollsScreen = React.memo(PollsScreen);
const MemoSystemMapScreen = React.memo(SystemMapScreen);
const MemoNetworkScreen = React.memo(NetworkScreen);
const MemoMailboxScreen = React.memo(MailboxScreen);
const MemoWhiteboardScreen = React.memo(WhiteboardScreen);
const MemoColorsScreen = React.memo(ColorsScreen);

const noop = () => {};
const archiveMembers = (ids: string[]) => bulkSetArchived(ids, true);
const restoreMembers = (ids: string[]) => bulkSetArchived(ids, false);
const togglePinned = (e: JournalEntry) => saveEntry({...e, pinned: !e.pinned});

function useLatestCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A) => ref.current(...args), []);
}

function MainAppContent() {
  const {t} = useTranslation();

  const loaded = useAppStore(s => s.loaded);
  const setLoaded = useAppStore(s => s.setLoaded);
  const [firstRun, setFirstRun] = useState(false);
  const storageSuspectRef = useRef(false);
  const suspectRetriesRef = useRef(0);
  const loadAllRef = useRef<(() => Promise<void>) | null>(null);
  const loadedRef = useRef<Record<string, LoadedSlice>>({});
  const [locked, setLocked] = useState(false);
  const [systemMapRelCount, setSystemMapRelCount] = useState(0);
  const [mapFocus, setMapFocus] = useState<{id: string; n: number} | null>(null);
  const tabMemoryRef = useRef<TabMemory>({tab: 'front', mounted: ['front']});
  const tabControlRef = useRef<TabHostControl | null>(null);
  const goTab = useCallback((id: Tab) => { tabControlRef.current?.goTab(id); }, []);
  const [hubResetKey, setHubResetKey] = useState(0);
  const [editHistoryIndex, setEditHistoryIndex] = useState<number | null>(null);
  const backStateRef = useRef({locked, loaded});
  backStateRef.current = {locked, loaded};
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const s = backStateRef.current;
      if (!s.loaded || s.locked) return false;
      const host = tabControlRef.current;
      if (host && host.currentTab() !== 'front') {
        host.goTab('front');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);
  const system = useAppStore(s => s.system);
  const setSystem = useAppStore(s => s.setSystem);
  const members = useAppStore(s => s.members);
  const setMembers = useAppStore(s => s.setMembers);
  const front = useAppStore(s => s.front);
  const setFront = useAppStore(s => s.setFront);
  const history = useAppStore(s => s.history);
  const setHistory = useAppStore(s => s.setHistory);
  const journal = useAppStore(s => s.journal);
  const setJournal = useAppStore(s => s.setJournal);
  const journalTemplates = useAppStore(s => s.journalTemplates);
  const setJournalTemplates = useAppStore(s => s.setJournalTemplates);
  const setShareSettings = useAppStore(s => s.setShareSettings);
  const appSettings = useAppStore(s => s.appSettings);
  const setAppSettings = useAppStore(s => s.setAppSettings);
  const groups = useAppStore(s => s.groups);
  const setGroups = useAppStore(s => s.setGroups);
  const palettes = useAppStore(s => s.palettes);
  const setPalettes = useAppStore(s => s.setPalettes);
  const activePaletteId = useAppStore(s => s.activePaletteId);
  const setActivePaletteId = useAppStore(s => s.setActivePaletteId);
  const chatChannels = useAppStore(s => s.chatChannels);
  const setChatChannels = useAppStore(s => s.setChatChannels);
  const setChatCategories = useAppStore(s => s.setChatCategories);
  const setAllChatMessages = useAppStore(s => s.setAllChatMessages);
  const medical = useAppStore(s => s.medical);
  const setMedical = useAppStore(s => s.setMedical);
  const setPlanner = useAppStore(s => s.setPlanner);
  const [dyslexicTick, setDyslexicTick] = useState(0);
  useEffect(() => { setTerminologyOverrides(appSettings.terminology); setDyslexicTick(n => n + 1); }, [appSettings.terminology]);
  useEffect(() => { setTierNameOverrides(appSettings.tierNames); setDyslexicTick(n => n + 1); }, [appSettings.tierNames]);

  const [showSetFront, setShowSetFront] = useState(false);
  const [showEditFrontDetail, setShowEditFrontDetail] = useState(false);
  const [editTier, setEditTier] = useState<FrontTierKey>('primary');
  const [showMember, setShowMember] = useState(false);
  const [memberSession, setMemberSession] = useState(0);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [viewOnlyMember, setViewOnlyMember] = useState(false);
  const [addCustomFront, setAddCustomFront] = useState(false);
  const [addFacet, setAddFacet] = useState(false);
  const [showCustomFront, setShowCustomFront] = useState(false);
  const [editCustomFront, setEditCustomFront] = useState<Member | null>(null);
  const [showJournal, setShowJournal] = useState(false);
  const [editJournal, setEditJournal] = useState<JournalEntry | null>(null);
  const [showSystem, setShowSystem] = useState(false);
  const [showSystemProfile, setShowSystemProfile] = useState(false);

  const openMemberById = useLatestCallback((id: string) => {
    const m = members.find(mb => mb.id === id);
    if (!m) return;
    if (!showMember) setMemberSession(k => k + 1);
    setEditMember(m);
    setViewOnlyMember(true);
    setShowMember(true);
  });

  const showMemberOnMap = (id: string) => {
    setShowMember(false); setViewOnlyMember(false);
    setMapFocus({id, n: Date.now()});
    goTab('hub');
  };

  const C: ThemeColors = useMemo(() => {
    const allPals = [...BUILTIN_PALETTES, ...palettes];
    const pal = allPals.find(p => p.id === activePaletteId) || BUILTIN_PALETTES[0];
    const theme = deriveTheme(pal.bg, pal.accent, pal.text, pal.mid);
    theme.textScale = appSettings.textScale || 1;
    return theme;
  }, [activePaletteId, palettes, appSettings.textScale, dyslexicTick]);

  const loadAll = useCallback(async () => {
    const hadAnyPsKeys = await anyPsKeysExist();
    let storageSuspect = false;
    if (!(await waitForProtectedData())) {
      if (__DEV__) console.warn('[STARTUP] Protected data still locked (pre-unlock background launch) -marking storage suspect.');
      storageSuspect = true;
    }
    try {
      if (!storageSuspect && await storageLooksWiped()) {
        if (__DEV__) console.warn('[STARTUP] AsyncStorage blank but backups exist -restoring before load');
        const n = await restoreAllBackups();
        if (__DEV__) console.warn(`[STARTUP] restored ${n} keys from file backups`);
        if (n === 0) storageSuspect = true;
      }
    } catch {
      storageSuspect = true;
    }
    storageSuspectRef.current = storageSuspect;
    const readFailuresBefore = storageReadFailures();
    try {
      let rawNow: Record<string, string | null> = {};
      try { rawNow = await AsyncStorage.getMany(LOAD_KEYS); } catch { rawNow = {}; }
      const [sys, mem, fr, hist, jour, jourTemplates, share, settings, savedLang, grps, savedPalettes, savedChannels, savedChatCats] = await Promise.all([
        getFromRaw<SystemInfo>(rawNow, KEYS.system),
        getFromRaw<Member[]>(rawNow, KEYS.members, []),
        getFromRaw<any>(rawNow, KEYS.front),
        getFromRaw<HistoryEntry[]>(rawNow, KEYS.history, []),
        getFromRaw<JournalEntry[]>(rawNow, KEYS.journal, []),
        getFromRaw<JournalTemplate[]>(rawNow, KEYS.journalTemplates, []),
        getFromRaw<ShareSettings>(rawNow, KEYS.share, {showFront: true, showMembers: true, showDescriptions: false}),
        getFromRaw<AppSettings>(rawNow, KEYS.settings, DEFAULT_SETTINGS),
        store.get<string>(KEYS.language, ''),
        getFromRaw<MemberGroup[]>(rawNow, KEYS.groups, []),
        getFromRaw<CustomPalette[]>(rawNow, KEYS.palettes, []),
        getFromRaw<ChatChannel[]>(rawNow, KEYS.chatChannels, []),
        getFromRaw<ChatCategory[]>(rawNow, KEYS.chatCategories, []),
      ]);
      if (!storageSuspect && !sys && (mem || []).length === 0 && (hist || []).length === 0 && AppState.currentState !== 'active') {
        if (__DEV__) console.warn('[STARTUP] Blank load while app is not active -background/prewarm launch, storage may still be locked. Marking suspect; will retry on foreground.');
        storageSuspect = true;
        storageSuspectRef.current = true;
      }
      if (!storageSuspect && storageReadFailures() > readFailuresBefore) {
        if (__DEV__) console.warn('[STARTUP] AsyncStorage read(s) FAILED during this load -marking suspect; will retry on foreground.');
        storageSuspect = true;
        storageSuspectRef.current = true;
      }
      const prevLoaded = loadedRef.current;
      const nextLoaded: Record<string, LoadedSlice> = {};
      const keep = (key: string, current: unknown): boolean => {
        const p = prevLoaded[key];
        if (storageSuspect || !p || !(key in rawNow) || p.raw !== rawNow[key] || p.value !== current) return false;
        nextLoaded[key] = p;
        return true;
      };
      const loadedInto = <V,>(key: string, value: V): V => {
        if (key in rawNow) nextLoaded[key] = {raw: rawNow[key], value};
        return value;
      };
      let loadedSystem = sys;
      const parsedMembers = mem || [];
      let loadedMembers = parsedMembers;
      try {
        if (!storageSuspect) {
          const {members: migratedMembers, changed: avatarsChanged} = await migrateInlineAvatars(loadedMembers);
          if (avatarsChanged) {
            loadedMembers = migratedMembers;
            await store.set(KEYS.members, loadedMembers);
          }
        }
      } catch (e) {
        console.error('[PS] avatar migration error:', e);
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
        console.error('[PS] media path rebase error:', e);
      }
      try {
        const alreadyDownsized = await store.get<boolean>('ps.avatarsDownsizedV1', false);
        if (!alreadyDownsized && !storageSuspect) {
          const {members: downsizedMembers, changed: downsizedChanged} = await downsizeExistingAvatars(loadedMembers);
          if (downsizedChanged) {
            loadedMembers = downsizedMembers;
            await store.set(KEYS.members, loadedMembers);
          }
          await store.set('ps.avatarsDownsizedV1', true);
        }
      } catch (e) {
        console.error('[PS] avatar downsize migration error:', e);
      }
      const parsedSettings: AppSettings = {...DEFAULT_SETTINGS, ...(settings || {})};
      let loadedSettingsObj: AppSettings = parsedSettings;
      if (!loadedSettingsObj.customFrontsSeeded && !storageSuspect) {
        const existingCustomNames = new Set(loadedMembers.filter(m => m.isCustomFront).map(m => (m.name || '').toLowerCase()));
        const seeds = makeDefaultCustomFronts().filter(cf => !existingCustomNames.has(cf.name.toLowerCase()));
        loadedMembers = [...loadedMembers, ...seeds];
        loadedSettingsObj = {...loadedSettingsObj, customFrontsSeeded: true};
        if (seeds.length > 0) await store.set(KEYS.members, loadedMembers);
        await store.set(KEYS.settings, loadedSettingsObj);
      }
      if (!loadedSystem) {
        const realMemberCount = (loadedMembers || []).filter(m => !m.isCustomFront).length;
        const hasUserData = realMemberCount > 0 || (hist && hist.length > 0) || (jour && jour.length > 0) || (grps && grps.length > 0);
        if (hasUserData) {
          if (__DEV__) console.warn(`[STARTUP] System missing but ${realMemberCount} members + data present -reconstructing system, NOT entering first-run.`);
          const recovered: SystemInfo = {name: '', description: ''};
          loadedSystem = recovered;
          if (!storageSuspect) await store.set(KEYS.system, recovered);
          setSystem(recovered);
        } else if (storageSuspect) {
          if (__DEV__) console.warn('[STARTUP] Blank load with suspect storage -staying OUT of first-run; will retry on foreground.');
          setSystem({name: '', description: ''});
        } else if (hadAnyPsKeys) {
          if (__DEV__) console.warn('[STARTUP] Blank load BUT ps: keys existed BEFORE this load -this is not a fresh install. Staying OUT of first-run; will retry on foreground.');
          storageSuspect = true;
          storageSuspectRef.current = true;
          setSystem({name: '', description: ''});
        } else {
          if (__DEV__) console.warn('[STARTUP] No system info loaded and no ps: keys present -entering first-run state.');
          setFirstRun(true);
        }
      } else if (loadedSystem !== sys || !keep(KEYS.system, useAppStore.getState().system)) {
        setSystem(loadedInto(KEYS.system, loadedSystem));
      }
      if (loadedMembers !== parsedMembers || !keep(KEYS.members, useAppStore.getState().members)) setMembers(loadedInto(KEYS.members, loadedMembers));
      if (!storageSuspect) {
        restoreMissingMediaFiles(loadedMembers).then(async r => {
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
      const histKept = keep(KEYS.history, useAppStore.getState().history);
      const rawHist = hist || [];
      const dedupedHist = histKept ? useAppStore.getState().history : mergeHistoryEntries([], rawHist);
      if (!histKept && dedupedHist.length !== rawHist.length && !storageSuspect) {
        if (__DEV__) console.warn(`[STARTUP] collapsed ${rawHist.length - dedupedHist.length} duplicate history entries`);
        await store.set(KEYS.history, dedupedHist);
      }
      const frontKept = (histKept || !!fr?.primary) && keep(KEYS.front, useAppStore.getState().front);
      if (!frontKept) {
        const migratedFront = migrateFrontState(fr) || findOpenFrontInHistory(dedupedHist);
        setFront(loadedInto(KEYS.front, migratedFront));
        if (((fr && !fr.primary && migratedFront) || (!fr && migratedFront)) && !storageSuspect) {
          await store.set(KEYS.front, migratedFront);
        }
      }
      if (!storageSuspect) await pruneFrontOfRemovedMembers();
      if (!histKept) setHistory(loadedInto(KEYS.history, dedupedHist));
      if (!keep(KEYS.journal, useAppStore.getState().journal)) setJournal(loadedInto(KEYS.journal, jour || []));
      if (!keep(KEYS.journalTemplates, useAppStore.getState().journalTemplates)) setJournalTemplates(loadedInto(KEYS.journalTemplates, jourTemplates || []));
      if (!keep(KEYS.share, useAppStore.getState().shareSettings)) setShareSettings(loadedInto(KEYS.share, share || {showFront: true, showMembers: true, showDescriptions: false}));
      const mergedSettings = loadedSettingsObj;
      const settingsKept = mergedSettings === parsedSettings && keep(KEYS.settings, useAppStore.getState().appSettings);
      if (!settingsKept) setAppSettings(loadedInto(KEYS.settings, mergedSettings));
      if (!keep(KEYS.groups, useAppStore.getState().groups)) setGroups(loadedInto(KEYS.groups, grps || []));
      if (!keep(KEYS.palettes, useAppStore.getState().palettes)) setPalettes(loadedInto(KEYS.palettes, savedPalettes || []));

      const parsedChannels = savedChannels || [];
      let channels = parsedChannels;
      if (channels.length === 0) {
        channels = DEFAULT_CHANNELS.map(c => ({id: uid(), name: i18n.t(c.key), createdAt: Date.now()}));
        if (!storageSuspect) await store.set(KEYS.chatChannels, channels);
      }
      if (channels !== parsedChannels || !keep(KEYS.chatChannels, useAppStore.getState().chatChannels)) setChatChannels(loadedInto(KEYS.chatChannels, channels));
      if (!keep(KEYS.chatCategories, useAppStore.getState().chatCategories)) setChatCategories(loadedInto(KEYS.chatCategories, savedChatCats || []));

      if (!settingsKept) {
        const paletteId = mergedSettings.activePaletteId || '__dark__';
        if (mergedSettings.lightMode && !mergedSettings.activePaletteId) {
          setActivePaletteId('__light__');
        } else {
          setActivePaletteId(paletteId);
        }
      }

      try {
        const savedMedical = await readKeyInto<MedicalData>(rawNow, KEYS.medical);
        const medicalKept = keep(KEYS.medical, useAppStore.getState().medical);
        const med: MedicalData = {...DEFAULT_MEDICAL, ...(savedMedical || {})};
        if (!medicalKept) setMedical(med);
        setEmergencyNotificationInfo(null);
        if (!medicalKept) {
          await rescheduleMedicationReminders(med.medications || []);
          await rescheduleAppointmentReminders(med.appointments || []);
          loadedInto(KEYS.medical, med);
        }
      } catch (e) {
        console.error('[PS] medical init error:', e);
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
        console.error('[PS] planner init error:', e);
      }

      try {
        const savedCodes = await store.get<DeviceCodes>(KEYS.deviceCodes);
        if ((!savedCodes || !savedCodes.friendCode || !savedCodes.syncCode) && !storageSuspect) {
          const fresh: DeviceCodes = {friendCode: generateFriendCode(), syncCode: generateSyncCode(), createdAt: Date.now()};
          await store.set(KEYS.deviceCodes, fresh);
        }
      } catch (e) {
        console.error('[PS] device codes init error:', e);
      }

      if (savedLang && savedLang !== i18n.language) changeLanguage(savedLang as SupportedLanguage);
      if (!storageSuspectRef.current) loadedRef.current = nextLoaded;
    } catch (e) {
      console.error('[PS] startup load error:', e);
      storageSuspectRef.current = true;
      let recoveredMembers: Member[] = [];
      let recoveredSystem: SystemInfo | null = null;
      try { recoveredMembers = (await store.get<Member[]>(KEYS.members, [])) || []; } catch {}
      try { recoveredSystem = await store.get<SystemInfo>(KEYS.system); } catch {}
      const realCount = recoveredMembers.filter(m => !m.isCustomFront).length;
      setMembers(recoveredMembers);
      setFront(null);
      setHistory([]);
      setJournal([]);
      setJournalTemplates([]);
      setShareSettings({showFront: true, showMembers: true, showDescriptions: false});
      setAppSettings(DEFAULT_SETTINGS);
      setGroups([]);
      setPalettes([]);
      setChatChannels(DEFAULT_CHANNELS.map(c => ({id: uid(), name: i18n.t(c.key), createdAt: Date.now()})));
      setChatCategories([]);
      setAllChatMessages([]);
      if (recoveredSystem) {
        setSystem(recoveredSystem);
      } else if (realCount > 0) {
        const r: SystemInfo = {name: '', description: ''};
        setSystem(r);
        if (__DEV__) console.warn(`[STARTUP] load error but ${realCount} members recovered -reconstructed system instead of first-run.`);
      } else {
        setSystem({name: '', description: ''});
        if (__DEV__) console.warn('[STARTUP] load error with nothing recovered -staying OUT of first-run; will retry on foreground.');
      }
    } finally {
      setLoaded(true);
      if (storageSuspectRef.current) {
        if (suspectRetriesRef.current < 3) {
          const attempt = ++suspectRetriesRef.current;
          const delay = attempt * 800;
          if (__DEV__) console.warn(`[STARTUP] suspect load -auto-retry ${attempt}/3 in ${delay}ms`);
          setTimeout(() => { loadAllRef.current?.(); }, delay);
        } else {
          if (__DEV__) console.warn('[STARTUP] suspect load -auto-retry budget exhausted; waiting for foreground.');
        }
      } else {
        suspectRetriesRef.current = 0;
      }
    }
  }, []);
  loadAllRef.current = loadAll;

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active' && storageSuspectRef.current) {
        if (__DEV__) console.warn('[STARTUP] foreground after suspect load -retrying loadAll');
        loadAll();
      }
      if (s === 'active') {
        NetworkManager.retryInitIfLocked();
        NetworkManager.requestFriendFronts();
        NetworkManager.flushPendingFronts();
        CloudServices.wake();
      }
    });
    return () => sub.remove();
  }, [loadAll]);
  useEffect(() => {
    NetworkManager.init()
      .catch(e => console.error('[NETWORK] init failed:', e))
      .finally(() => {
        bootCloudServices();
        installDestructiveGuard();
      });
  }, []);
  useEffect(() => {
    NetworkManager.notifyDataChanged();
    CloudServices.schedulePush();
  }, [system, members, history, journal, journalTemplates, groups, palettes, chatChannels, medical, appSettings]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = NetworkManager.onSyncApplied(() => {
      if (!timer) timer = setTimeout(() => { timer = null; loadAll(); }, 400);
    });
    return () => { if (timer) clearTimeout(timer); unsub(); };
  }, [loadAll]);
  useEffect(() => NetworkManager.onSyncConflict(c => {
    Alert.alert(
      t('network.syncConflictTitle'),
      t('network.syncConflictMsg', {device: c.deviceName}),
      [
        {text: t('network.keepThisDevice'), onPress: () => { NetworkManager.resolveConflict(c.peerId, 'mine'); }},
        {text: t('network.keepOtherDevice'), onPress: () => { NetworkManager.resolveConflict(c.peerId, 'theirs'); }},
      ],
    );
  }), [t]);
  useEffect(() => NetworkManager.onSyncRoleMismatch(c => {
    Alert.alert(
      t('network.syncRoleMismatchTitle'),
      t('network.syncRoleMismatchMsg', {device: c.deviceName}),
    );
  }), [t]);
  const permsRequestedRef = useRef(false);
  useEffect(() => {
    if (!loaded || firstRun || permsRequestedRef.current) return;
    if (AppState.currentState === 'active') {
      permsRequestedRef.current = true;
      requestPermissions();
      return;
    }
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active' && !permsRequestedRef.current) {
        permsRequestedRef.current = true;
        requestPermissions();
        sub.remove();
      }
    });
    return () => sub.remove();
  }, [loaded, firstRun]);

  useEffect(() => {
    const choice = appSettings.fontChoice ?? (appSettings.useDyslexicFont === true ? 'opendyslexic' : 'default');
    setAppTextFont(fontFamilyForChoice(choice));
    setDyslexicTick(t => t + 1);
  }, [appSettings.fontChoice, appSettings.useDyslexicFont]);

  useFrontNotifications(front, members, system.name, appSettings, loaded);
  useNoteboardNotifications(front, members, appSettings);


  const lastKnownLocation = useAppStore(s => s.lastKnownLocation);
  const setLastKnownLocation = useAppStore(s => s.setLastKnownLocation);
  useEffect(() => { store.get<string>('ps:lastLocation').then(loc => { if (loc) setLastKnownLocation(loc); }); }, []);

  const handleDeleteAccount = useLatestCallback(async () => {
    await CloudServices.unlink().catch(() => {});
    await clearFrontNotification(); await store.clearAll(); await clearAllMedia();
    await NetworkManager.wipe().catch(() => {});
    setSystem({name: '', description: ''}); setMembers([]); setFront(null);
    setHistory([]); setJournal([]); setJournalTemplates([]);
    setShareSettings({showFront: true, showMembers: true, showDescriptions: false});
    setAppSettings(DEFAULT_SETTINGS); setGroups([]); setPalettes([]); setActivePaletteId('__dark__');
    setChatChannels([]); setChatCategories([]); setAllChatMessages([]);
    setMedical(DEFAULT_MEDICAL); setEmergencyNotificationInfo(null);
    setPlanner(DEFAULT_PLANNER);
    await rescheduleMedicationReminders([]);
    await rescheduleAppointmentReminders([]);
    await reschedulePlannerNotifications(null);
    tabMemoryRef.current = {tab: 'front', mounted: ['front']}; setFirstRun(true);
  });

  const isSinglet = appSettings.accountMode === 'singlet';
  const selfMember = isSinglet
    ? (members.find(m => m.id === appSettings.selfMemberId && !m.isCustomFront && !m.isFacet)
      || members.find(m => !m.isCustomFront && !m.isFacet && !m.archived))
    : undefined;

  const selfMemberId = selfMember?.id;
  const activeMembers = useMemo(() => members.filter(m => !m.archived), [members]);
  const membersRef = useRef(members);
  membersRef.current = members;
  const shareSig = useMemo(() => members.map(m => `${m.id}|${m.name}|${m.private ? 1 : 0}|${m.isFacet ? 1 : 0}|${m.isCustomFront ? 1 : 0}`).join('\n'), [members]);
  useEffect(() => {
    if (!loaded) return;
    let shareFront: any = front;
    if (isSinglet && selfMemberId && !(front && allFrontMemberIds(front).length > 0)) {
      shareFront = {primary: {memberIds: [selfMemberId]}, coFront: {memberIds: []}, coConscious: {memberIds: []}};
    }
    NetworkManager.updateMyFront(shareFront, membersRef.current).catch(() => {});
  }, [loaded, front, shareSig, isSinglet, selfMemberId]);

  const handleEditDetails = useLatestCallback((tier: FrontTierKey) => { setEditTier(tier); setShowEditFrontDetail(true); });
  const openSetFront = useLatestCallback(() => setShowSetFront(true));
  const openSetStatus = useLatestCallback(async () => {await ensureSelfMember(); setShowSetFront(true);});
  const editProfile = useLatestCallback(async () => {const self = await ensureSelfMember(); setMemberSession(k => k + 1); setEditMember(self); setViewOnlyMember(false); setAddCustomFront(false); setShowMember(true);});
  const openNewCustomFront = useLatestCallback(() => {setEditCustomFront(null); setShowCustomFront(true);});
  const openCustomFront = useLatestCallback((m: Member) => {setEditCustomFront(m); setShowCustomFront(true);});
  const openNewMember = useLatestCallback(() => {setMemberSession(k => k + 1); setEditMember(null); setViewOnlyMember(false); setAddCustomFront(false); setAddFacet(false); setShowMember(true);});
  const openNewFacet = useLatestCallback(() => {setMemberSession(k => k + 1); setEditMember(null); setViewOnlyMember(false); setAddCustomFront(false); setAddFacet(true); setShowMember(true);});
  const editMemberEntry = useLatestCallback((m: Member) => { if (m.isCustomFront) {setEditCustomFront(m); setShowCustomFront(true);} else {setMemberSession(k => k + 1); setEditMember(m); setViewOnlyMember(false); setShowMember(true);} });
  const viewMemberEntry = useLatestCallback((m: Member) => { if (m.isCustomFront) {setEditCustomFront(m); setShowCustomFront(true);} else {setMemberSession(k => k + 1); setEditMember(m); setViewOnlyMember(true); setShowMember(true);} });
  const editArchivedMember = useLatestCallback((m: Member) => {setMemberSession(k => k + 1); setEditMember(m); setViewOnlyMember(false); setAddCustomFront(false); setShowMember(true);});
  const viewArchivedMember = useLatestCallback((m: Member) => {setMemberSession(k => k + 1); setEditMember(m); setViewOnlyMember(true); setShowMember(true);});
  const openNewJournal = useLatestCallback(() => {setEditJournal(null); setShowJournal(true);});
  const openJournal = useLatestCallback((e: JournalEntry) => {setEditJournal(e); setShowJournal(true);});
  const editHistoryEntry = useLatestCallback((idx: number) => {setEditHistoryIndex(idx); goTab('hub');});
  const clearEditHistory = useLatestCallback(() => setEditHistoryIndex(null));
  const reselectHub = useLatestCallback(() => setHubResetKey(k => k + 1));

  const renderShareScreen = useCallback(() => (
    <MemoShareScreen theme={C} onDataImported={loadAll} onAddJournalEntry={addJournalEntry} onDeleteAccount={handleDeleteAccount} />
  ), [C, loadAll, handleDeleteAccount]);

  const renderStatsScreen = useCallback(() => (
    <MemoStatsScreen theme={C} singlet={isSinglet} selfId={selfMemberId} />
  ), [C, isSinglet, selfMemberId]);

  const renderChatScreen = useCallback(() => (
    <MemoChatScreen theme={C} onMentionPress={openMemberById} />
  ), [C, openMemberById]);

  const renderCustomFieldsScreen = useCallback(() => (
    <MemoCustomFieldsScreen theme={C} onUpdate={loadAll} />
  ), [C, loadAll]);

  const renderSystemManagerScreen = useCallback(() => (
    <MemoSystemManagerScreen theme={C} onViewMember={openMemberById} />
  ), [C, openMemberById]);

  const renderPollsScreen = useCallback(() => (
    <MemoPollsScreen theme={C} />
  ), [C]);

  const renderSystemMapScreen = useCallback(() => (
    <MemoSystemMapScreen theme={C} onViewMember={openMemberById} onRelCountChange={setSystemMapRelCount} focus={mapFocus} />
  ), [C, openMemberById, mapFocus]);

  const renderNetworkScreen = useCallback(() => (
    <MemoNetworkScreen theme={C} />
  ), [C]);

  const renderMailboxScreen = useCallback((onBack: () => void) => (
    <MemoMailboxScreen theme={C} onBack={onBack} />
  ), [C]);

  const renderWhiteboardScreen = useCallback((onBack: () => void) => (
    <MemoWhiteboardScreen theme={C} onBack={onBack} />
  ), [C]);

  const renderColorsScreen = useCallback((onBack: () => void) => (
    <MemoColorsScreen theme={C} onBack={onBack} />
  ), [C]);

  const renderArchiveScreen = useCallback(() => (
    <MemoMembersScreen theme={C} archiveOnly
      onAdd={noop}
      onEdit={editArchivedMember}
      onView={viewArchivedMember}
      onBulkRestore={restoreMembers}
      onBulkDelete={bulkDeleteMembers}
      onRestoreDeleted={restoreDeletedMember}
    />
  ), [C, editArchivedMember, viewArchivedMember]);

  if (!loaded) {
    return <SplashView />;
  }

  if (firstRun) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, {backgroundColor: C.bg}]}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <SetupScreen theme={C} onSave={async s => {
          await saveSystem({name: s.name, description: s.description});
          if (s.singlet) {
            const self: Member = {id: uid(), name: s.name, pronouns: '', role: '', color: '#DAA520', description: '', tags: [], groupIds: [], customFields: [], createdAt: Date.now()};
            await saveMembers([...members, self]);
            await saveAppSettings({...appSettings, accountMode: 'singlet', selfMemberId: self.id});
          }
          setFirstRun(false); setTimeout(requestPermissions, 500);
        }} />
      </SafeAreaView>
    );
  }

  if (locked && appSettings.appLockPassword) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, {backgroundColor: C.bg}]}>
        <StatusBar barStyle={C.isLight ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
        <LockScreen theme={C} password={appSettings.appLockPassword} systemName={system.name} onUnlock={() => setLocked(false)} />
      </SafeAreaView>
    );
  }

  const screens: Record<Tab, React.ReactNode> = {
    front: isSinglet
      ? <MemoStatusScreen theme={C} selfId={selfMemberId} onSetStatus={openSetStatus} onEditDetails={handleEditDetails} />
      : <MemoFrontScreen theme={C} onSetFront={openSetFront} onEditDetails={handleEditDetails} onOpenMember={openMemberById} />,
    members: isSinglet
      ? <MemoProfileScreen theme={C} member={selfMember} onEditProfile={editProfile} onAddStatus={openNewCustomFront} onEditStatus={openCustomFront} />
      : <MemoMembersScreen theme={C} initialSortMode={appSettings.memberSortMode} memberListFields={appSettings.memberListFields} onSaveListFields={saveMemberListFields}
          onQuickAddToFront={quickAddToFront} onRemoveFromFront={removeFromFront}
          onAdd={openNewMember}
          onAddCustomFront={openNewCustomFront}
          onAddFacet={openNewFacet}
          onEdit={editMemberEntry}
          onView={viewMemberEntry}
          onSaveSortMode={saveMemberSortMode} onReorderMember={reorderMember}
          onBulkArchive={archiveMembers}
          onBulkRestore={restoreMembers}
          onBulkDelete={bulkDeleteMembers}
          onBulkAddGroups={bulkAddGroups}
          onBulkAddTags={bulkAddTags}
          onBulkSetFacet={bulkSetFacet}
        />,
    hub: <MemoHubScreen theme={C} singlet={isSinglet} selfId={selfMemberId} renderShareScreen={renderShareScreen} renderStatsScreen={renderStatsScreen} renderChatScreen={renderChatScreen} renderCustomFieldsScreen={renderCustomFieldsScreen} renderSystemManagerScreen={renderSystemManagerScreen} renderArchiveScreen={renderArchiveScreen} renderPollsScreen={renderPollsScreen} renderSystemMapScreen={renderSystemMapScreen} systemMapRelCount={systemMapRelCount} mapFocus={mapFocus} renderMailboxScreen={renderMailboxScreen} renderWhiteboardScreen={renderWhiteboardScreen} renderColorsScreen={renderColorsScreen} renderNetworkScreen={renderNetworkScreen} resetKey={hubResetKey} editHistoryIndex={editHistoryIndex} onClearEditHistory={clearEditHistory} />,
    journal: <MemoJournalScreen theme={C} onAdd={openNewJournal} onEdit={openJournal} onDelete={deleteEntry} onTogglePin={togglePinned} onMentionPress={openMemberById} />,
    history: <MemoHistoryScreen theme={C} singlet={isSinglet} selfId={selfMemberId} onEditEntry={editHistoryEntry} />,
  };

  return (
    <View style={[styles.root, {backgroundColor: C.bg}]}>
      <StatusBar barStyle={C.isLight ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
      <AppHeader C={C} systemName={system.name || t('systemProfile.unnamed')} canLock={!!appSettings.appLockPassword} onLock={() => setLocked(true)} onOpenSettings={() => setShowSystem(true)}
        onOpenProfile={appSettings.accountMode === 'singlet' ? undefined : () => setShowSystemProfile(true)} />
      <TabHost C={C} isSinglet={isSinglet} screens={screens} memory={tabMemoryRef} controlRef={tabControlRef} onReselectHub={reselectHub} />

      {isSinglet ? (
        <SetStatusModal visible={showSetFront} theme={C} statuses={singletStatuses(members)} selfId={selfMember?.id} current={front} settings={appSettings}
          lastKnownLocation={lastKnownLocation}
          onSave={async (primary: FrontTier, coFront: FrontTier, coConscious: FrontTier) => {
            try { await updateFront(primary, coFront, coConscious); } catch (e: any) { Alert.alert(t('modal.saveFailed'), String(e?.message || e || '')); return; }
            setShowSetFront(false);
          }}
          onClose={() => setShowSetFront(false)} />
      ) : (
        <SetFrontModal visible={showSetFront} theme={C} members={activeMembers} current={front} settings={appSettings}
          lastKnownLocation={lastKnownLocation}
          onSave={async (primary: FrontTier, coFront: FrontTier, coConscious: FrontTier) => {
            try { await updateFront(primary, coFront, coConscious); } catch (e: any) { Alert.alert(t('modal.saveFailed'), String(e?.message || e || '')); return; }
            setShowSetFront(false);
          }}
          onClose={() => setShowSetFront(false)} />
      )}
      {front && (
        <EditFrontDetailModal visible={showEditFrontDetail} theme={C} front={front} tier={editTier} settings={appSettings} statusMode={isSinglet}
          lastKnownLocation={lastKnownLocation}
          onSave={async (mood: string, location: string, note: string, energyLevel?: number) => {
            try { await updateFrontDetails(editTier, mood, location, note, energyLevel); } catch (e: any) { Alert.alert(t('modal.saveFailed'), String(e?.message || e || '')); return; }
            setShowEditFrontDetail(false);
          }}
          onClose={() => setShowEditFrontDetail(false)} />
      )}
      <MemberModal key={memberSession} visible={showMember} theme={C} member={editMember} members={members} groups={groups} settings={appSettings}
        readOnly={viewOnlyMember}
        facetMode={addFacet || !!editMember?.isFacet}
        profileMode={isSinglet && editMember?.id === selfMember?.id && !editMember?.isCustomFront}
        isFronting={!!editMember && allFrontMemberIds(front).includes(editMember.id)}
        onMentionPress={openMemberById}
        onShowOnMap={showMemberOnMap}
        onSave={async (m: Member) => {await saveMember(addCustomFront && !editMember ? {...m, isCustomFront: true} : addFacet && !editMember ? {...m, isFacet: true} : m); setShowMember(false); setViewOnlyMember(false); setAddCustomFront(false); setAddFacet(false);}}
        onDelete={async (id: string) => {await deleteMember(id); setShowMember(false); setViewOnlyMember(false);}}
        onClose={() => {setShowMember(false); setViewOnlyMember(false); setAddFacet(false);}} />
      <CustomFrontModal visible={showCustomFront} theme={C} customFront={editCustomFront} statusMode={isSinglet} groups={groups}
        isFronting={!!editCustomFront && allFrontMemberIds(front).includes(editCustomFront.id)}
        onSave={async (m: Member) => {await saveMember({...m, isCustomFront: true}); setShowCustomFront(false); setEditCustomFront(null);}}
        onDelete={async (id: string) => {await deleteMember(id); setShowCustomFront(false); setEditCustomFront(null);}}
        onClose={() => {setShowCustomFront(false); setEditCustomFront(null);}} />
      <JournalModal visible={showJournal} theme={C} entry={editJournal} members={members} templates={journalTemplates}
        onMentionPress={openMemberById}
        onSave={async (e: JournalEntry) => {await saveEntry(e); setShowJournal(false);}}
        onClose={() => setShowJournal(false)} />
      <SystemModal visible={showSystem} theme={C} system={system} settings={appSettings}
        palettes={palettes} activePaletteId={activePaletteId}
        onSave={async (s: SystemInfo) => {await saveSystem(s); setShowSystem(false);}}
        onSaveSettings={async (s: AppSettings) => {
          let next = s;
          if (s.accountMode === 'singlet' && !members.find(m => m.id === s.selfMemberId && !m.isCustomFront && !m.isFacet)) {
            const existing = members.find(m => !m.isCustomFront && !m.isFacet && !m.archived);
            if (existing) {
              next = {...s, selfMemberId: existing.id};
            } else {
              const nm: Member = {id: uid(), name: system.name || t('share.system'), pronouns: '', role: '', color: '#DAA520', description: '', tags: [], groupIds: [], customFields: [], createdAt: Date.now()};
              await saveMembers([...members, nm]);
              next = {...s, selfMemberId: nm.id};
            }
          }
          await saveAppSettings(next); setShowSystem(false);
        }}
        onSavePalettes={savePalettes}
        onSelectPalette={selectPalette}
        onOpenProfile={() => { setShowSystem(false); setShowSystemProfile(true); }}
        onClose={() => setShowSystem(false)} />
      <SystemProfileModal visible={showSystemProfile && appSettings.accountMode !== 'singlet'} theme={C} system={system}
        onSave={(s: SystemInfo) => { saveSystem(s).catch(e => console.warn('[PS] system profile save failed:', e)); }}
        onClose={() => setShowSystemProfile(false)} />
      <ImageCropHost theme={C} />
    </View>
  );
}

const FrozenTab = React.memo(
  ({children}: {frozen: boolean; children: React.ReactNode}) => <>{children}</>,
  (_prev, next) => next.frozen,
);

function TabHost({C, isSinglet, screens, memory, controlRef, onReselectHub}: {C: ThemeColors; isSinglet: boolean; screens: Record<Tab, React.ReactNode>; memory: React.RefObject<TabMemory>; controlRef: React.RefObject<TabHostControl | null>; onReselectHub: () => void}) {
  const [tab, setTab] = useState<Tab>(memory.current.tab);
  const [shownTab, setShownTab] = useState<Tab>(memory.current.tab);
  const [mountedTabs, setMountedTabs] = useState<Tab[]>(memory.current.mounted);
  const [activeSources] = useState(() => createTabActiveSources(TAB_IDS, memory.current.tab));
  const tabRef = useRef(tab);
  const tabSwitchStart = useRef<{id: Tab; at: number} | null>(null);
  const goTab = useCallback((id: Tab) => {
    if (__DEV__) tabSwitchStart.current = {id, at: Date.now()};
    tabRef.current = id;
    setTab(id);
    startTransition(() => {
      setMountedTabs(prev => prev.includes(id) ? prev : [...prev, id]);
      setShownTab(id);
    });
  }, []);
  useImperativeHandle(controlRef, () => ({goTab, currentTab: () => tabRef.current}), [goTab]);
  useEffect(() => { memory.current = {tab: shownTab, mounted: mountedTabs}; }, [memory, shownTab, mountedTabs]);
  useEffect(() => { TAB_IDS.forEach(id => activeSources[id].set(id === shownTab)); }, [activeSources, shownTab]);
  useEffect(() => {
    if (!__DEV__) return;
    const s = tabSwitchStart.current;
    if (!s || s.id !== shownTab) return;
    tabSwitchStart.current = null;
    const commit = Date.now() - s.at;
    requestAnimationFrame(() => console.log(`[perf] tab ${shownTab}: ${commit} ms to commit, ${Date.now() - s.at} ms to next frame`));
  }, [shownTab]);
  const onPressTab = useCallback((id: Tab) => {
    if (id === 'hub' && tabRef.current === 'hub') onReselectHub();
    goTab(id);
  }, [goTab, onReselectHub]);
  return (
    <>
      <View style={styles.content}>
        {TAB_IDS.map(id => mountedTabs.includes(id) ? (
          <View key={id} style={[StyleSheet.absoluteFill, shownTab === id ? null : styles.hiddenTab]} pointerEvents={shownTab === id ? 'auto' : 'none'}
            importantForAccessibility={shownTab === id ? 'auto' : 'no-hide-descendants'} accessibilityElementsHidden={shownTab !== id}>
            <TabActiveContext.Provider value={activeSources[id]}>
              <FrozenTab frozen={shownTab !== id}>{screens[id]}</FrozenTab>
            </TabActiveContext.Provider>
          </View>
        ) : null)}
      </View>
      <TabBar C={C} tab={tab} isSinglet={isSinglet} onPressTab={onPressTab} />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
        <AppErrorBoundary>
          <MainAppContent />
        </AppErrorBoundary>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {flex: 1},
  hiddenTab: {transform: [{translateX: 100000}]},
});
