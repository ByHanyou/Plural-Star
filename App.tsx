import React, {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import {View, Image, TouchableOpacity, StyleSheet, StatusBar, Platform, PermissionsAndroid, Alert, AppState} from 'react-native';
import {Text, TextInput, setAppTextDyslexicEnabled, setAppTextFont} from './src/components/AppText';
import {fontFamilyForChoice} from './src/theme';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {KeyboardProvider} from 'react-native-keyboard-controller';
import {useTranslation} from 'react-i18next';
import notifee from '@notifee/react-native';

import './src/i18n/i18n';
import i18n, {changeLanguage} from './src/i18n/i18n';
import type {SupportedLanguage} from './src/i18n/i18n';

import {T, BUILTIN_PALETTES, deriveTheme} from './src/theme';
import type {CustomPalette, ThemeColors} from './src/theme';
import {AccentText} from './src/components/AccentText';
import {store, KEYS, storageLooksWiped, restoreAllBackups} from './src/storage';
import {SystemInfo, Member, MemberGroup, FrontState, FrontTier, FrontTierKey, HistoryEntry, JournalEntry, JournalTemplate, ShareSettings, AppSettings, ChatChannel, ChatMessage, NoteboardEntry, DeviceCodes, MedicalData, DEFAULT_MEDICAL, DEFAULT_CHANNELS, findOpenFrontInHistory, migrateFrontState, frontToHistoryEntry, uid, makeDefaultCustomFronts, isFrontEmpty, allFrontMemberIds, singletStatuses, generateFriendCode, generateSyncCode, emergencyNotificationLine} from './src/utils';
import {migrateInlineAvatars, migrateInlineChatMedia, clearAllMedia, migrateStaleMediaPaths, rebaseChatMessageMedia, downsizeExistingAvatars} from './src/utils/mediaUtils';
import {showFrontNotification, clearFrontNotification, scheduleFrontCheckReminder, cancelFrontCheckReminder, showNoteboardNotification, clearNoteboardNotification, scheduleFrontNotificationRefresh, cancelFrontNotificationRefresh, setEmergencyNotificationInfo, rescheduleMedicationReminders, rescheduleAppointmentReminders} from './src/services/NotificationService';
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
import {MedicalScreen} from './src/screens/MedicalScreen';
import {MailboxScreen} from './src/screens/MailboxScreen';
import {WhiteboardScreen} from './src/screens/WhiteboardScreen';
import {StatusScreen} from './src/screens/StatusScreen';
import {ProfileScreen} from './src/screens/ProfileScreen';
import {NetworkScreen} from './src/screens/NetworkScreen';
import {NetworkManager} from './src/network/NetworkManager';
import {SetFrontModal, SetStatusModal, EditFrontDetailModal, MemberModal, JournalModal, SystemModal, CustomFrontModal} from './src/modals';

type Tab = 'front' | 'members' | 'hub' | 'journal' | 'history';

const TAB_IDS: Tab[] = ['front', 'members', 'hub', 'journal', 'history'];
const TAB_ICONS: Record<Tab, string> = {
  front: '◈', members: '◇', hub: '⬡', journal: '◉', history: '◷',
};

const DEFAULT_SETTINGS: AppSettings = {locations: [], customMoods: [], lightMode: false, gpsEnabled: false, filesEnabled: true, language: 'en', notificationsEnabled: true, noteboardNotifications: true, activePaletteId: '__dark__', textScale: 1.0, useDyslexicFont: false, pkFrontSyncEnabled: false};

const PK_MEMBER_REF_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z]{5})$/i;
const EXTERNAL_API_USER_AGENT = 'PluralStar/1.10.2 (the1hanyou@gmail.com)';
const PK_FRONT_SYNC_COOLDOWN_MS = 5000;

const isPluralKitMemberRef = (value?: string): value is string => !!value && PK_MEMBER_REF_RE.test(value.trim());

const setDyslexicEnabled = (on: boolean) => {
  setAppTextDyslexicEnabled(on);
};

const getGPSLocation = (): Promise<string | null> =>
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
              {headers: {'User-Agent': EXTERNAL_API_USER_AGENT}},
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

function MainAppContent() {
  const {t} = useTranslation();

  const [loaded, setLoaded] = useState(false);
  const [firstRun, setFirstRun] = useState(false);
  const storageSuspectRef = useRef(false);
  const [locked, setLocked] = useState(false);
  const [tab, setTab] = useState<Tab>('front');
  const [systemMapRelCount, setSystemMapRelCount] = useState(0);
  const [mapFocus, setMapFocus] = useState<{id: string; n: number} | null>(null);
  const [mountedTabs, setMountedTabs] = useState<Tab[]>(['front']);
  useEffect(() => {
    setMountedTabs(prev => prev.includes(tab) ? prev : [...prev, tab]);
  }, [tab]);
  const [hubResetKey, setHubResetKey] = useState(0);
  const [editHistoryIndex, setEditHistoryIndex] = useState<number | null>(null);
  const [system, setSystem] = useState<SystemInfo>({name: '', description: ''});
  const [members, setMembers] = useState<Member[]>([]);
  const [front, setFront] = useState<FrontState | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [journalTemplates, setJournalTemplates] = useState<JournalTemplate[]>([]);
  const [shareSettings, setShareSettings] = useState<ShareSettings>({showFront: true, showMembers: true, showDescriptions: false});
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [palettes, setPalettes] = useState<CustomPalette[]>([]);
  const [activePaletteId, setActivePaletteId] = useState<string>('__dark__');
  const [chatChannels, setChatChannels] = useState<ChatChannel[]>([]);
  const [allChatMessages, setAllChatMessages] = useState<ChatMessage[]>([]);
  const [medical, setMedical] = useState<MedicalData>(DEFAULT_MEDICAL);

  const [showSetFront, setShowSetFront] = useState(false);
  const [showEditFrontDetail, setShowEditFrontDetail] = useState(false);
  const [editTier, setEditTier] = useState<FrontTierKey>('primary');
  const [showMember, setShowMember] = useState(false);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [viewOnlyMember, setViewOnlyMember] = useState(false);
  const [addCustomFront, setAddCustomFront] = useState(false);
  const [showCustomFront, setShowCustomFront] = useState(false);
  const [editCustomFront, setEditCustomFront] = useState<Member | null>(null);
  const [showJournal, setShowJournal] = useState(false);
  const [editJournal, setEditJournal] = useState<JournalEntry | null>(null);
  const [showSystem, setShowSystem] = useState(false);
  const [, setDyslexicTick] = useState(0);
  const insets = useSafeAreaInsets();
  const fs = (s: number) => Math.round(s * (appSettings.textScale || 1));
  const pkSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pkPendingMemberRefsRef = useRef<string[] | null>(null);
  const pkLastSyncedKeyRef = useRef<string>('');
  const pkLastSyncAtRef = useRef(0);
  const pkSyncInFlightRef = useRef(false);

  const openMemberById = (id: string) => {
    const m = members.find(mb => mb.id === id);
    if (!m) return;
    setEditMember(m);
    setViewOnlyMember(true);
    setShowMember(true);
  };

  const showMemberOnMap = (id: string) => {
    setShowMember(false); setEditMember(null); setViewOnlyMember(false);
    setMapFocus({id, n: Date.now()});
    setTab('hub');
  };

  const C: ThemeColors = useMemo(() => {
    const allPals = [...BUILTIN_PALETTES, ...palettes];
    const pal = allPals.find(p => p.id === activePaletteId) || BUILTIN_PALETTES[0];
    const theme = deriveTheme(pal.bg, pal.accent, pal.text, pal.mid);
    theme.textScale = appSettings.textScale || 1;
    return theme;
  }, [activePaletteId, palettes, appSettings.textScale]);

  const loadChatMessages = useCallback(async (channels: ChatChannel[]) => {
    const allMsgs: ChatMessage[] = [];
    for (const ch of channels) {
      if (ch.archived) continue;
      try {
        const msgs = await store.get<ChatMessage[]>(`ps:chat:${ch.id}`, []);
        if (msgs) {
          const {messages: migrated, changed} = await migrateInlineChatMedia(msgs);
          const {messages: rebased, changed: rebasedChanged} = rebaseChatMessageMedia(changed ? migrated : msgs);
          const finalMsgs = rebasedChanged ? rebased : (changed ? migrated : msgs);
          if (changed || rebasedChanged) await store.set(`ps:chat:${ch.id}`, finalMsgs);
          allMsgs.push(...finalMsgs);
        }
      } catch (e) {
        console.error('[PS] chat load error:', ch.id, e);
      }
    }
    setAllChatMessages(allMsgs);
  }, []);

  const loadAll = useCallback(async () => {
    let storageSuspect = false;
    if (!(await waitForProtectedData())) {
      console.warn('[STARTUP] Protected data still locked (pre-unlock background launch) — marking storage suspect.');
      storageSuspect = true;
    }
    try {
      if (!storageSuspect && await storageLooksWiped()) {
        console.warn('[STARTUP] AsyncStorage blank but backups exist — restoring before load');
        const n = await restoreAllBackups();
        console.warn(`[STARTUP] restored ${n} keys from file backups`);
        if (n === 0) storageSuspect = true;
      }
    } catch {
      storageSuspect = true;
    }
    storageSuspectRef.current = storageSuspect;
    try {
      const [sys, mem, fr, hist, jour, jourTemplates, share, settings, savedLang, grps, savedPalettes, savedChannels] = await Promise.all([
        store.get<SystemInfo>(KEYS.system),
        store.get<Member[]>(KEYS.members, []),
        store.get<any>(KEYS.front),
        store.get<HistoryEntry[]>(KEYS.history, []),
        store.get<JournalEntry[]>(KEYS.journal, []),
        store.get<JournalTemplate[]>(KEYS.journalTemplates, []),
        store.get<ShareSettings>(KEYS.share, {showFront: true, showMembers: true, showDescriptions: false}),
        store.get<AppSettings>(KEYS.settings, DEFAULT_SETTINGS),
        store.get<string>(KEYS.language, ''),
        store.get<MemberGroup[]>(KEYS.groups, []),
        store.get<CustomPalette[]>(KEYS.palettes, []),
        store.get<ChatChannel[]>(KEYS.chatChannels, []),
      ]);
      console.log(`[STARTUP] loadAll begin — sys:${!!sys} members:${(mem||[]).length} groups:${(grps||[]).length} journal:${(jour||[]).length} history:${(hist||[]).length} channels:${(savedChannels||[]).length}`);
      if (!storageSuspect && !sys && (mem || []).length === 0 && (hist || []).length === 0 && AppState.currentState !== 'active') {
        console.warn('[STARTUP] Blank load while app is not active — background/prewarm launch, storage may still be locked. Marking suspect; will retry on foreground.');
        storageSuspect = true;
        storageSuspectRef.current = true;
      }
      let loadedSystem = sys;
      let loadedMembers = mem || [];
      try {
        const {members: migratedMembers, changed: avatarsChanged} = await migrateInlineAvatars(loadedMembers);
        if (avatarsChanged) {
          loadedMembers = migratedMembers;
          if (!storageSuspect) await store.set(KEYS.members, loadedMembers);
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
          console.log('[STARTUP] rebased stale Documents:// media paths');
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
      let loadedSettingsObj: AppSettings = {...DEFAULT_SETTINGS, ...(settings || {})};
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
          console.warn(`[STARTUP] System missing but ${realMemberCount} members + data present — reconstructing system, NOT entering first-run.`);
          const recovered: SystemInfo = {name: '', description: ''};
          loadedSystem = recovered;
          if (!storageSuspect) await store.set(KEYS.system, recovered);
          setSystem(recovered);
        } else if (storageSuspect) {
          console.warn('[STARTUP] Blank load with suspect storage — staying OUT of first-run; will retry on foreground.');
          setSystem({name: '', description: ''});
        } else {
          console.warn('[STARTUP] No system info loaded — entering first-run state. If this is unexpected, check for AsyncStorage failures above.');
          setFirstRun(true);
        }
      } else {
        setSystem(loadedSystem);
      }
      setMembers(loadedMembers);
      const migratedFront = migrateFrontState(fr) || findOpenFrontInHistory(hist || []);
      setFront(migratedFront);
      if (((fr && !fr.primary && migratedFront) || (!fr && migratedFront)) && !storageSuspect) {
        await store.set(KEYS.front, migratedFront);
      }
      setHistory(hist || []);
      setJournal(jour || []);
      setJournalTemplates(jourTemplates || []);
      setShareSettings(share || {showFront: true, showMembers: true, showDescriptions: false});
      const mergedSettings = loadedSettingsObj;
      setAppSettings(mergedSettings);
      setGroups(grps || []);
      setPalettes(savedPalettes || []);

      let channels = savedChannels || [];
      if (channels.length === 0) {
        channels = DEFAULT_CHANNELS.map(c => ({id: uid(), name: c.name, createdAt: Date.now()}));
        if (!storageSuspect) await store.set(KEYS.chatChannels, channels);
      }
      setChatChannels(channels);
      await loadChatMessages(channels);

      const paletteId = mergedSettings.activePaletteId || '__dark__';
      if (mergedSettings.lightMode && !mergedSettings.activePaletteId) {
        setActivePaletteId('__light__');
      } else {
        setActivePaletteId(paletteId);
      }

      try {
        const savedMedical = await store.get<MedicalData>(KEYS.medical);
        const med: MedicalData = {...DEFAULT_MEDICAL, ...(savedMedical || {})};
        setMedical(med);
        setEmergencyNotificationInfo(emergencyNotificationLine(med.emergency));
        await rescheduleMedicationReminders(med.medications || []);
        await rescheduleAppointmentReminders(med.appointments || []);
      } catch (e) {
        console.error('[PS] medical init error:', e);
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

      if (savedLang) changeLanguage(savedLang as SupportedLanguage);
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
      setChatChannels(DEFAULT_CHANNELS.map(c => ({id: uid(), name: c.name, createdAt: Date.now()})));
      setAllChatMessages([]);
      if (recoveredSystem) {
        setSystem(recoveredSystem);
      } else if (realCount > 0) {
        const r: SystemInfo = {name: '', description: ''};
        setSystem(r);
        console.warn(`[STARTUP] load error but ${realCount} members recovered — reconstructed system instead of first-run.`);
      } else {
        setSystem({name: '', description: ''});
        console.warn('[STARTUP] load error with nothing recovered — staying OUT of first-run; will retry on foreground.');
      }
    } finally {
      setLoaded(true);
    }
  }, []);

  const requestPermissions = async () => {
    try {
      await notifee.requestPermission();
    } catch (e) { console.error('[PS] notification permission error:', e); }
    if (Platform.OS !== 'android') return;
    if (AppState.currentState !== 'active') return;
    try {
      if (Platform.Version >= 33) {
        const result = await PermissionsAndroid.request(
          'android.permission.POST_NOTIFICATIONS' as any,
          {
            title: t('notification.notifPermTitle'),
            message: t('notification.notifPermMsg'),
            buttonPositive: t('notification.allow'),
            buttonNegative: t('notification.notNow'),
          },
        );
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          console.warn('[PS] POST_NOTIFICATIONS denied:', result);
        }
      }
    } catch (e) { console.error('[PS] POST_NOTIFICATIONS request error:', e); }
    try {
      if (appSettings.gpsEnabled) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          {title: t('notification.locationPermTitle'), message: t('notification.locationPermMsg'), buttonPositive: t('notification.allow'), buttonNegative: t('notification.notNow')});
      }
    } catch (e) { console.error('[PS] location permission error:', e); }
  };

  const requestGPSPermission = async () => {
    if (Platform.OS !== 'android') return;
    try {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        {title: t('notification.locationPermTitle'), message: t('notification.locationPermMsg'), buttonPositive: t('notification.allow'), buttonNegative: t('notification.notNow')});
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        console.warn('[PS] GPS permission denied:', result);
      }
    } catch (e) { console.error('[PS] GPS permission error:', e); }
  };

  const requestFilesPermission = async () => {
    if (Platform.OS !== 'android') return;
    try {
      if (Platform.Version < 33) {
        const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
          {title: t('notification.filePermTitle'), message: t('notification.filePermMsg'), buttonPositive: t('notification.allow'), buttonNegative: t('notification.notNow')});
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          console.warn('[PS] File permission denied:', result);
        }
      }
    } catch (e) { console.error('[PS] File permission error:', e); }
  };

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active' && storageSuspectRef.current) {
        console.warn('[STARTUP] foreground after suspect load — retrying loadAll');
        loadAll();
      }
    });
    return () => sub.remove();
  }, [loadAll]);
  useEffect(() => { NetworkManager.init().catch(e => console.error('[NETWORK] init failed:', e)); }, []);
  useEffect(() => { if (loaded) NetworkManager.updateMyFront(front, members).catch(() => {}); }, [loaded, front, members]);
  useEffect(() => { NetworkManager.notifyDataChanged(); }, [system, members, history, journal, journalTemplates, groups, palettes, chatChannels, medical, appSettings]);
  useEffect(() => NetworkManager.onSyncApplied(() => { loadAll(); }), [loadAll]);
  useEffect(() => NetworkManager.onSyncConflict(c => {
    Alert.alert(
      t('network.syncConflictTitle'),
      t('network.syncConflictMsg', {device: c.deviceName, defaultValue: `Your data differs from ${c.deviceName}. Which device should win?`}),
      [
        {text: t('network.keepThisDevice'), onPress: () => { NetworkManager.resolveConflict(c.peerId, 'mine'); }},
        {text: t('network.keepOtherDevice'), onPress: () => { NetworkManager.resolveConflict(c.peerId, 'theirs'); }},
      ],
    );
  }), [t]);
  useEffect(() => NetworkManager.onSyncRoleMismatch(c => {
    Alert.alert(
      t('network.syncRoleMismatchTitle', {defaultValue: 'Sync setup mismatch'}),
      t('network.syncRoleMismatchMsg', {device: c.deviceName, defaultValue: `You and ${c.deviceName} both chose the same direction, so the initial copy was skipped. New changes will still sync. To copy everything, remove the link and pair again — choose "send" on one device and "receive" on the other.`}),
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

  useEffect(() => {
    if (appSettings.notificationsEnabled) { showFrontNotification(front, members, system.name).catch(e => console.error('[PS] notif error:', e)); }
    else { clearFrontNotification().catch(e => console.error('[PS] clear notif error:', e)); }
  }, [front, members, appSettings.notificationsEnabled, system.name]);

  useEffect(() => {
    let last: string | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const unsub = NetworkManager.subscribe(s => {
      const sig = `${s.enabled}|${s.friends.filter(f => f.showInNotification && f.status === 'accepted').map(f => `${f.peerId}:${f.statusUpdatedAt || 0}`).join(',')}`;
      if (last !== null && sig !== last && appSettings.notificationsEnabled) {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => { showFrontNotification(front, members, system.name).catch(() => {}); }, 2000);
      }
      last = sig;
    });
    return () => { if (debounce) clearTimeout(debounce); unsub(); };
  }, [front, members, appSettings.notificationsEnabled, system.name]);

  useEffect(() => {
    if (!front || !appSettings.notificationsEnabled) return;
    const interval = setInterval(() => { showFrontNotification(front, members, system.name).catch(e => console.error('[PS] notif refresh error:', e)); }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [front, members, appSettings.notificationsEnabled, system.name]);

  const frontNotifRef = useRef({front, members, systemName: system.name, enabled: appSettings.notificationsEnabled});
  frontNotifRef.current = {front, members, systemName: system.name, enabled: appSettings.notificationsEnabled};
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active' || !frontNotifRef.current.enabled) return;
      const {front: f, members: m, systemName: n} = frontNotifRef.current;
      showFrontNotification(f, m, n).catch(() => {});
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const interval = appSettings.frontCheckInterval || 0;
    if (!appSettings.notificationsEnabled || interval <= 0) {
      cancelFrontCheckReminder().catch(e => console.error('[PS] front-check cancel error:', e));
    } else {
      scheduleFrontCheckReminder(interval, appSettings.accountMode === 'singlet').catch(e => console.error('[PS] front-check schedule error:', e));
    }
  }, [appSettings.frontCheckInterval, appSettings.notificationsEnabled, appSettings.accountMode]);

  useEffect(() => {
    const mins = appSettings.notificationRefreshMinutes || 0;
    if (!front || !appSettings.notificationsEnabled || mins <= 0) {
      cancelFrontNotificationRefresh().catch(e => console.error('[PS] notif refresh cancel error:', e));
    } else {
      scheduleFrontNotificationRefresh(front, members, mins).catch(e => console.error('[PS] notif refresh schedule error:', e));
    }
  }, [front, members, appSettings.notificationRefreshMinutes, appSettings.notificationsEnabled]);

  const prevFrontIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!appSettings.notificationsEnabled || !appSettings.noteboardNotifications || appSettings.accountMode === 'singlet') {
      prevFrontIdsRef.current = new Set();
      clearNoteboardNotification().catch(() => {});
      return;
    }
    const collectFrontIds = (f: FrontState | null): Set<string> => {
      const ids = new Set<string>();
      if (!f) return ids;
      const tiers: (keyof FrontState)[] = ['primary', 'coFront', 'coConscious'];
      for (const tk of tiers) {
        const tier = (f as any)[tk];
        const tierIds: string[] = tier?.memberIds || [];
        tierIds.forEach(id => ids.add(id));
      }
      return ids;
    };
    const currentIds = collectFrontIds(front);
    const newlyFronting: string[] = [];
    currentIds.forEach(id => { if (!prevFrontIdsRef.current.has(id)) newlyFronting.push(id); });
    prevFrontIdsRef.current = currentIds;
    if (currentIds.size === 0) {
      clearNoteboardNotification().catch(() => {});
      return;
    }
    if (newlyFronting.length === 0) return;
    (async () => {
      try {
        const allNotes = await store.get<NoteboardEntry[]>(KEYS.noteboards, []) || [];
        const lastSeen = await store.get<Record<string, number>>(KEYS.lastNoteboardSeen, {}) || {};
        const entries: {memberName: string; unreadCount: number}[] = [];
        for (const memberId of newlyFronting) {
          const member = members.find(m => m.id === memberId);
          if (!member) continue;
          const lastSeenTs = lastSeen[memberId] || 0;
          const unread = allNotes.filter(n => n.memberId === memberId && !n.read && n.timestamp > lastSeenTs);
          if (unread.length > 0) {
            entries.push({memberName: member.name, unreadCount: unread.length});
          }
        }
        if (entries.length > 0) {
          await showNoteboardNotification(entries);
        }
      } catch (e) { console.error('[PS] noteboard unread check error:', e); }
    })();
  }, [front, members, appSettings.notificationsEnabled, appSettings.noteboardNotifications, appSettings.accountMode]);

  const saveSystem = async (d: SystemInfo) => {setSystem(d); await store.set(KEYS.system, d);};
  const saveMembers = async (d: Member[]) => {
    if (!loaded && d.length === 0) {
      console.warn('[PS] Blocked pre-load save of empty members');
      return;
    }
    setMembers(d);
    await store.set(KEYS.members, d);
    const archivedIds = new Set(d.filter(m => m.archived).map(m => m.id));
    if (archivedIds.size > 0 && front) {
      const pruneTier = (tier: any) => tier ? {...tier, memberIds: (tier.memberIds || []).filter((id: string) => !archivedIds.has(id))} : tier;
      const next: any = {...front, primary: pruneTier(front.primary), coFront: pruneTier(front.coFront), coConscious: pruneTier(front.coConscious)};
      const count = (f: any) => (f?.primary?.memberIds?.length || 0) + (f?.coFront?.memberIds?.length || 0) + (f?.coConscious?.memberIds?.length || 0);
      if (count(next) !== count(front)) {
        const cleaned = isFrontEmpty(next) ? null : next;
        setFront(cleaned);
        await store.set(KEYS.front, cleaned);
      }
    }
  };
  const saveHistory = async (d: HistoryEntry[]) => {
    if (!loaded && d.length === 0) return;
    setHistory(d); await store.set(KEYS.history, d);
  };
  const saveJournal = async (d: JournalEntry[]) => {
    if (!loaded && d.length === 0) return;
    setJournal(d); await store.set(KEYS.journal, d);
  };
  const saveJournalTemplates = async (d: JournalTemplate[]) => {
    if (!loaded && d.length === 0) return;
    setJournalTemplates(d); await store.set(KEYS.journalTemplates, d);
  };
  const saveShareSettings = async (d: ShareSettings) => {setShareSettings(d); await store.set(KEYS.share, d);};
  const saveGroups = async (d: MemberGroup[]) => {
    if (!loaded && d.length === 0) return;
    setGroups(d); await store.set(KEYS.groups, d);
  };
  const savePalettes = async (d: CustomPalette[]) => {setPalettes(d); await store.set(KEYS.palettes, d);};
  const saveChatChannels = async (d: ChatChannel[]) => {setChatChannels(d); await store.set(KEYS.chatChannels, d); await loadChatMessages(d);};

  const saveMedical = async (d: MedicalData) => {
    setMedical(d);
    await store.set(KEYS.medical, d);
    setEmergencyNotificationInfo(emergencyNotificationLine(d.emergency));
    await rescheduleMedicationReminders(d.medications || []);
    await rescheduleAppointmentReminders(d.appointments || []);
    if (appSettings.notificationsEnabled) {
      showFrontNotification(front, members, system.name).catch(e => console.error('[PS] notif error:', e));
    }
  };

  const selectPalette = async (id: string) => {
    setActivePaletteId(id);
    const updated = {...appSettings, activePaletteId: id, lightMode: id === '__light__'};
    setAppSettings(updated);
    await store.set(KEYS.settings, updated);
    await store.set(KEYS.lightMode, id === '__light__');
  };

  const saveAppSettings = async (d: AppSettings) => {
    const gpsJustEnabled = d.gpsEnabled && !appSettings.gpsEnabled;
    const filesJustEnabled = d.filesEnabled && !appSettings.filesEnabled;
    setAppSettings(d);
    await store.set(KEYS.settings, d);
    if (d.language) { changeLanguage(d.language); await store.set(KEYS.language, d.language); }
    if (gpsJustEnabled) { await requestGPSPermission(); }
    if (filesJustEnabled) { await requestFilesPermission(); }
  };

  const [lastKnownLocation, setLastKnownLocation] = useState<string | undefined>(undefined);
  const getMember = (id: string) => members.find(m => m.id === id);

  const updateLastLocation = async (loc: string | undefined) => {
    if (loc) { setLastKnownLocation(loc); await store.set('ps:lastLocation', loc); }
  };

  const clearLastLocation = async () => {
    setLastKnownLocation(undefined);
    await store.remove('ps:lastLocation');
  };

  useEffect(() => { store.get<string>('ps:lastLocation').then(loc => { if (loc) setLastKnownLocation(loc); }); }, []);

  const maybeGPS = async (manualLocation?: string): Promise<string | undefined> => {
    const loc = manualLocation?.trim() || undefined;
    if (loc) return loc;
    if (appSettings.gpsEnabled) { const gps = await getGPSLocation(); return gps || undefined; }
    return undefined;
  };

  const flushPluralKitFrontSync = async () => {
    if (pkSyncInFlightRef.current) return;
    if (!appSettings.pkFrontSyncEnabled) return;
    const token = appSettings.pkToken?.trim();
    const memberRefs = pkPendingMemberRefsRef.current;
    if (!token || !memberRefs) return;
    const payloadKey = memberRefs.join('|');
    pkPendingMemberRefsRef.current = null;
    pkSyncInFlightRef.current = true;
    pkLastSyncAtRef.current = Date.now();
    try {
      const res = await fetch('https://api.pluralkit.me/v2/systems/@me/switches', {
        method: 'POST',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
          'User-Agent': EXTERNAL_API_USER_AGENT,
        },
        body: JSON.stringify({members: memberRefs}),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('[PS] PluralKit front sync failed:', res.status, text);
      } else {
        pkLastSyncedKeyRef.current = payloadKey;
      }
    } catch (e) {
      console.error('[PS] PluralKit front sync error:', e);
    } finally {
      pkSyncInFlightRef.current = false;
      if (pkPendingMemberRefsRef.current) {
        const delay = Math.max(0, PK_FRONT_SYNC_COOLDOWN_MS - (Date.now() - pkLastSyncAtRef.current));
        pkSyncTimeoutRef.current = setTimeout(() => {
          pkSyncTimeoutRef.current = null;
          void flushPluralKitFrontSync();
        }, delay);
      }
    }
  };

  const syncFrontToPluralKit = async (nextFront: FrontState | null) => {
    if (!appSettings.pkFrontSyncEnabled) return;
    const token = appSettings.pkToken?.trim();
    if (!token) return;
    const memberRefs = (nextFront?.primary.memberIds || [])
      .map(id => members.find(m => m.id === id)?.sourceId?.trim())
      .filter(isPluralKitMemberRef);
    const payloadKey = memberRefs.join('|');
    if (payloadKey === pkLastSyncedKeyRef.current) return;
    pkPendingMemberRefsRef.current = memberRefs;
    if (pkSyncTimeoutRef.current) clearTimeout(pkSyncTimeoutRef.current);
    const delay = pkSyncInFlightRef.current ? PK_FRONT_SYNC_COOLDOWN_MS : Math.max(0, PK_FRONT_SYNC_COOLDOWN_MS - (Date.now() - pkLastSyncAtRef.current));
    if (delay === 0 && !pkSyncInFlightRef.current) {
      await flushPluralKitFrontSync();
      return;
    }
    pkSyncTimeoutRef.current = setTimeout(() => {
      pkSyncTimeoutRef.current = null;
      void flushPluralKitFrontSync();
    }, delay);
  };

  useEffect(() => () => {
    if (pkSyncTimeoutRef.current) clearTimeout(pkSyncTimeoutRef.current);
  }, []);

  const updateFront = async (primary: FrontTier, coFront: FrontTier, coConscious: FrontTier) => {
    const now = Date.now();
    const cleanTier = (tier: FrontTier): FrontTier =>
      tier.memberIds.length === 0
        ? {memberIds: [], mood: undefined, note: '', location: undefined, energyLevel: undefined}
        : tier;
    const cleanPrimary = cleanTier(primary);
    const cleanCoFront = cleanTier(coFront);
    const cleanCoConscious = cleanTier(coConscious);
    const isEmpty = cleanPrimary.memberIds.length === 0 && cleanCoFront.memberIds.length === 0 && cleanCoConscious.memberIds.length === 0;

    const sameMembers = (a: string[] = [], b: string[] = []) =>
      a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
    const continuing = !!front && !isEmpty
      && sameMembers(front.primary.memberIds, cleanPrimary.memberIds)
      && sameMembers(front.coFront.memberIds, cleanCoFront.memberIds)
      && sameMembers(front.coConscious.memberIds, cleanCoConscious.memberIds);

    const explicitLocation = cleanPrimary.location?.trim() || undefined;
    const nf: FrontState | null = isEmpty ? null : {primary: {...cleanPrimary, location: explicitLocation}, coFront: cleanCoFront, coConscious: cleanCoConscious, startTime: continuing ? front!.startTime : now};

    let newHistory = [...history];
    if (front && !continuing) {
      newHistory = newHistory.map(e =>
        e.endTime === null && e.startTime === front.startTime && (!e.changeType || e.changeType === 'front') ? {...e, endTime: now} : e);
    }

    let finalFront = nf;
    if (nf) {
      if (continuing) {
        const extras: HistoryEntry[] = [];
        const moodChanged = (nf.primary.mood || undefined) !== (front!.primary.mood || undefined);
        const locChanged = (nf.primary.location || undefined) !== (front!.primary.location || undefined);
        const noteChanged = (nf.primary.note || undefined) !== (front!.primary.note || undefined);
        if (moodChanged || locChanged) {
          const entry = frontToHistoryEntry(nf, null, moodChanged ? 'mood' : 'location');
          entry.changeTime = now;
          extras.push(entry);
        }
        if (noteChanged) {
          const entry = frontToHistoryEntry(nf, null, 'note');
          entry.changeTime = now + 1;
          extras.push(entry);
        }
        const tierTracked = (a: FrontTier, b: FrontTier) =>
          (a.mood || undefined) !== (b.mood || undefined) || (a.energyLevel ?? undefined) !== (b.energyLevel ?? undefined);
        const segment = tierTracked(nf.primary, front!.primary) || tierTracked(nf.coFront, front!.coFront)
          || tierTracked(nf.coConscious, front!.coConscious) || locChanged;
        if (segment) {
          finalFront = {...nf, startTime: now};
          const segEntry = frontToHistoryEntry(finalFront, null, 'front');
          newHistory = newHistory.map(e =>
            e.endTime === null && e.startTime === front!.startTime && (!e.changeType || e.changeType === 'front') ? {...e, endTime: now} : e);
          newHistory = [segEntry, ...extras, ...newHistory];
        } else {
          const frontEntry = frontToHistoryEntry(nf, null, 'front');
          newHistory = newHistory.map(e =>
            e.endTime === null && e.startTime === front!.startTime && (!e.changeType || e.changeType === 'front') ? frontEntry : e);
          newHistory = [...extras, ...newHistory];
        }
      } else {
        const frontEntry = frontToHistoryEntry(nf, null, 'front');
        newHistory = [frontEntry, ...newHistory];
      }
    }

    setFront(finalFront);
    await store.set(KEYS.front, finalFront);
    await saveHistory(newHistory);
    await syncFrontToPluralKit(nf);

    if (nf) {
      const allFrontIds = [...nf.primary.memberIds, ...nf.coFront.memberIds, ...nf.coConscious.memberIds];
      if (allFrontIds.length > 0) {
        try {
          const notes = await store.get<any[]>(KEYS.noteboards) || [];
          if (notes && notes.length > 0) {
            const memberNotes: Record<string, number> = {};
            for (const n of notes) {
              if (allFrontIds.includes(n.memberId)) {
                memberNotes[n.memberId] = (memberNotes[n.memberId] || 0) + 1;
              }
            }
            const withNotes = Object.entries(memberNotes);
            if (withNotes.length > 0) {
              const names = withNotes.map(([id, count]) => {
                const m = members.find(mm => mm.id === id);
                return `${m?.name || '?'} (${count})`;
              }).join(', ');
              Alert.alert(t('noteboard.title'), `${names}`);
            }
          }
        } catch {}
      }
    }

    if (nf && appSettings.gpsEnabled && !cleanPrimary.location?.trim()) {
      try {
        const gpsLocation = await getGPSLocation();
        if (gpsLocation && gpsLocation !== explicitLocation) {
          const patched: FrontState = {...nf, primary: {...nf.primary, location: gpsLocation}};
          setFront(patched);
          await store.set(KEYS.front, patched);
          await updateLastLocation(gpsLocation);
        }
      } catch (e) { console.error('[PS] GPS post-save error:', e); }
    } else if (explicitLocation) {
      await updateLastLocation(explicitLocation);
    } else if (nf) {
      await clearLastLocation();
    }
  };

  const updateFrontDetails = async (tier: FrontTierKey, mood?: string, location?: string, note?: string) => {
    if (!front) return;
    const now = Date.now();
    const tierData = front[tier];
    const resolvedLocation = tier === 'primary' ? await maybeGPS(location) : tierData.location;
    const updatedTier = {...tierData, mood, location: resolvedLocation, note: note ?? tierData.note};
    const moodChanged = (mood || undefined) !== (tierData.mood || undefined);
    const locChanged = tier === 'primary' && (resolvedLocation || undefined) !== (tierData.location || undefined);
    const noteChanged = note !== undefined && (note || undefined) !== (tierData.note || undefined);
    const segment = moodChanged || locChanged;
    const updated = segment ? {...front, [tier]: updatedTier, startTime: now} : {...front, [tier]: updatedTier};
    setFront(updated); await store.set(KEYS.front, updated);
    if (tier === 'primary') {
      if (resolvedLocation) await updateLastLocation(resolvedLocation);
      else await clearLastLocation();
    }
    const extras: HistoryEntry[] = [];
    if (moodChanged || locChanged) { const entry = frontToHistoryEntry(updated, null, moodChanged ? 'mood' : 'location', tier); entry.changeTime = now; extras.push(entry); }
    if (noteChanged) { const entry = frontToHistoryEntry(updated, null, 'note', tier); entry.changeTime = now + 1; extras.push(entry); }
    let newHistory = [...history];
    if (segment) {
      const segEntry = frontToHistoryEntry(updated, null, 'front');
      newHistory = newHistory.map(e =>
        e.endTime === null && e.startTime === front.startTime && (!e.changeType || e.changeType === 'front') ? {...e, endTime: now} : e);
      newHistory = [segEntry, ...extras, ...newHistory];
      await saveHistory(newHistory);
    } else if (extras.length > 0) {
      await saveHistory([...extras, ...newHistory]);
    }
  };

  const quickAddToFront = async (id: string, tierKey: FrontTierKey) => {
    const strip = (tier: FrontTier): FrontTier => ({...tier, memberIds: tier.memberIds.filter(x => x !== id)});
    const tiers: Record<FrontTierKey, FrontTier> = {
      primary: front ? strip(front.primary) : {memberIds: [], note: ''},
      coFront: front ? strip(front.coFront) : {memberIds: [], note: ''},
      coConscious: front ? strip(front.coConscious) : {memberIds: [], note: ''},
    };
    tiers[tierKey] = {...tiers[tierKey], memberIds: [...tiers[tierKey].memberIds, id]};
    await updateFront(tiers.primary, tiers.coFront, tiers.coConscious);
  };

  const removeFromFront = async (id: string) => {
    if (!front) return;
    await updateFront(
      {...front.primary, memberIds: front.primary.memberIds.filter(x => x !== id)},
      {...front.coFront, memberIds: front.coFront.memberIds.filter(x => x !== id)},
      {...front.coConscious, memberIds: front.coConscious.memberIds.filter(x => x !== id)},
    );
  };

  const saveMember = async (m: Member) => {
    const u = members.find(x => x.id === m.id) ? members.map(x => (x.id === m.id ? m : x)) : [...members, m];
    await saveMembers(u);
  };
  const deleteMember = async (id: string) => saveMembers(members.map(m => m.id === id ? {...m, archived: true, deleted: true} : m));
  const bulkSetArchived = async (ids: string[], archived: boolean) => {
    const idSet = new Set(ids);
    await saveMembers(members.map(m => idSet.has(m.id) ? {...m, archived} : m));
  };
  const bulkDeleteMembers = async (ids: string[]) => {
    const idSet = new Set(ids);
    await saveMembers(members.map(m => idSet.has(m.id) ? {...m, archived: true, deleted: true} : m));
  };
  const bulkAddGroups = async (ids: string[], groupIds: string[]) => {
    const idSet = new Set(ids);
    await saveMembers(members.map(m => idSet.has(m.id) ? {...m, groupIds: [...new Set([...(m.groupIds || []), ...groupIds])]} : m));
  };
  const bulkRemoveFromGroup = async (ids: string[], groupId: string) => {
    const idSet = new Set(ids);
    await saveMembers(members.map(m => idSet.has(m.id) ? {...m, groupIds: (m.groupIds || []).filter(g => g !== groupId)} : m));
  };
  const saveEntry = async (e: JournalEntry) => {
    const u = journal.find(x => x.id === e.id) ? journal.map(x => (x.id === e.id ? e : x)) : [e, ...journal];
    await saveJournal(u);
  };
  const deleteEntry = async (id: string) => saveJournal(journal.filter(e => e.id !== id));
  const addJournalEntry = async (e: JournalEntry) => saveJournal([e, ...journal]);

  const handleDeleteAccount = async () => {
    await clearFrontNotification(); await store.clearAll(); await clearAllMedia();
    setSystem({name: '', description: ''}); setMembers([]); setFront(null);
    setHistory([]); setJournal([]); setJournalTemplates([]);
    setShareSettings({showFront: true, showMembers: true, showDescriptions: false});
    setAppSettings(DEFAULT_SETTINGS); setGroups([]); setPalettes([]); setActivePaletteId('__dark__');
    setChatChannels([]); setAllChatMessages([]);
    setMedical(DEFAULT_MEDICAL); setEmergencyNotificationInfo(null);
    await rescheduleMedicationReminders([]);
    await rescheduleAppointmentReminders([]);
    setTab('front'); setMountedTabs(['front']); setFirstRun(true);
  };

  const handleHubSetFront = async (f: FrontState | null) => {
    setFront(f);
    await store.set(KEYS.front, f);
  };

  const isSinglet = appSettings.accountMode === 'singlet';
  const selfMember = isSinglet
    ? (members.find(m => m.id === appSettings.selfMemberId && !m.isCustomFront)
      || members.find(m => !m.isCustomFront && !m.archived))
    : undefined;

  if (!loaded) {
    return (
      <View style={[styles.loading, {backgroundColor: T.bg}]}>
        <StatusBar barStyle="light-content" backgroundColor={T.bg} translucent={false} />
        <Image source={require('./src/assets/splash-logo.png')} accessibilityElementsHidden importantForAccessibility="no" style={styles.splashLogo} resizeMode="contain" />
        <Text style={[styles.splashName, {color: T.accent}]}>Plural Star</Text>
      </View>
    );
  }

  if (firstRun) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} translucent={false} />
        <SetupScreen theme={C} onSave={async s => {
          await saveSystem({name: s.name, description: s.description});
          if (s.singlet) {
            const self: Member = {id: uid(), name: s.name, pronouns: '', role: '', color: '#DAA520', description: '', tags: [], groupIds: [], customFields: [], createdAt: Date.now()};
            await saveMembers([...members, self]);
            await saveAppSettings({...appSettings, accountMode: 'singlet', selfMemberId: self.id});
          }
          setFirstRun(false); setTimeout(requestPermissions, 500);
        }} />
      </>
    );
  }

  if (locked && appSettings.appLockPassword) {
    return (
      <>
        <StatusBar barStyle={C.isLight ? 'dark-content' : 'light-content'} backgroundColor={C.bg} translucent={false} />
        <LockScreen theme={C} password={appSettings.appLockPassword} systemName={system.name} onUnlock={() => setLocked(false)} />
      </>
    );
  }

  const handleEditDetails = (tier: FrontTierKey) => { setEditTier(tier); setShowEditFrontDetail(true); };

  const ensureSelfMember = async (): Promise<Member> => {
    if (selfMember) {
      if (selfMember.id !== appSettings.selfMemberId) await saveAppSettings({...appSettings, selfMemberId: selfMember.id});
      return selfMember;
    }
    const nm: Member = {id: uid(), name: system.name || t('share.system'), pronouns: '', role: '', color: '#DAA520', description: '', tags: [], groupIds: [], customFields: [], createdAt: Date.now()};
    await saveMembers([...members, nm]);
    await saveAppSettings({...appSettings, selfMemberId: nm.id});
    return nm;
  };
  const tabLabel = (id: Tab): string => {
    if (isSinglet && id === 'front') return t('tabs.status');
    if (isSinglet && id === 'members') return t('tabs.profile');
    return t(`tabs.${id}`);
  };

  const renderShareScreen = () => (
    <ShareScreen theme={C} system={system} members={members} front={front} history={history} journal={journal} shareSettings={shareSettings} appSettings={appSettings} onSettingsChange={saveShareSettings} getMember={getMember} onDataImported={loadAll} onAddJournalEntry={addJournalEntry} onDeleteAccount={handleDeleteAccount} />
  );

  const renderStatsScreen = () => (
    <StatsScreen theme={C} history={history} members={members} chatMessages={allChatMessages} singlet={isSinglet} selfId={selfMember?.id} />
  );

  const renderChatScreen = () => (
    <ChatScreen theme={C} members={members} channels={chatChannels} onSaveChannels={saveChatChannels} onMentionPress={openMemberById} />
  );

  const renderCustomFieldsScreen = () => (
    <CustomFieldsScreen theme={C} onUpdate={loadAll} />
  );

  const renderPollsScreen = () => (
    <PollsScreen theme={C} members={members} />
  );

  const renderSystemMapScreen = () => (
    <SystemMapScreen theme={C} members={members} onViewMember={openMemberById} onRelCountChange={setSystemMapRelCount} focus={mapFocus} />
  );

  const renderMedicalScreen = () => (
    <MedicalScreen theme={C} medical={medical} onSave={saveMedical} />
  );

  const renderNetworkScreen = () => (
    <NetworkScreen theme={C} members={members} groups={groups} journal={journal} />
  );

  const renderMailboxScreen = (onBack: () => void) => (
    <MailboxScreen theme={C} members={members} onBack={onBack}
      onSetMailboxPassword={(memberId, password) => {
        const m = members.find(x => x.id === memberId);
        if (m) saveMember({...m, mailboxPassword: password});
      }} />
  );

  const renderWhiteboardScreen = (onBack: () => void) => (
    <WhiteboardScreen theme={C} onBack={onBack} />
  );

  const renderArchiveScreen = () => (
    <MembersScreen theme={C} members={members} front={front} groups={groups} archiveOnly
      onAdd={() => {}}
      onEdit={m => {setEditMember(m); setViewOnlyMember(false); setAddCustomFront(false); setShowMember(true);}}
      onView={m => {setEditMember(m); setViewOnlyMember(true); setShowMember(true);}}
      onSaveGroups={saveGroups}
      onBulkRestore={(ids: string[]) => bulkSetArchived(ids, false)}
      onBulkDelete={bulkDeleteMembers}
    />
  );

  const renderScreenFor = (id: Tab) => {
    switch (id) {
      case 'front':
        if (isSinglet) {
          return <StatusScreen theme={C} front={front} getMember={getMember} selfId={selfMember?.id}
            onSetStatus={async () => {await ensureSelfMember(); setShowSetFront(true);}} onEditDetails={handleEditDetails} />;
        }
        return <FrontScreen theme={C} front={front} getMember={getMember} onSetFront={() => setShowSetFront(true)} onEditDetails={handleEditDetails} />;
      case 'members':
        if (isSinglet) {
          return <ProfileScreen theme={C} member={selfMember} statuses={singletStatuses(members)} front={front}
            onEditProfile={async () => {const self = await ensureSelfMember(); setEditMember(self); setViewOnlyMember(false); setAddCustomFront(false); setShowMember(true);}}
            onAddStatus={() => {setEditCustomFront(null); setShowCustomFront(true);}}
            onEditStatus={m => {setEditCustomFront(m); setShowCustomFront(true);}} />;
        }
        return <MembersScreen theme={C} members={members} front={front} groups={groups} initialSortMode={appSettings.memberSortMode} memberListFields={appSettings.memberListFields} onSaveListFields={async (next: any) => {const sNext = {...appSettings, memberListFields: next}; setAppSettings(sNext); await store.set(KEYS.settings, sNext);}}
          onQuickAddToFront={quickAddToFront} onRemoveFromFront={removeFromFront}
          onAdd={() => {setEditMember(null); setViewOnlyMember(false); setAddCustomFront(false); setShowMember(true);}}
          onAddCustomFront={() => {setEditCustomFront(null); setShowCustomFront(true);}}
          onEdit={m => { if (m.isCustomFront) {setEditCustomFront(m); setShowCustomFront(true);} else {setEditMember(m); setViewOnlyMember(false); setShowMember(true);} }}
          onView={m => { if (m.isCustomFront) {setEditCustomFront(m); setShowCustomFront(true);} else {setEditMember(m); setViewOnlyMember(true); setShowMember(true);} }}
          onSaveGroups={saveGroups} onSaveSortMode={async (mode) => {const next = {...appSettings, memberSortMode: mode}; setAppSettings(next); await store.set(KEYS.settings, next);}} onReorderMember={async (id, direction) => {
          const active = members.filter(m => !m.archived);
          const archived = members.filter(m => m.archived);
          const ordered = [...active].sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER));
          const idx = ordered.findIndex(m => m.id === id);
          if (idx === -1) return;
          const swapWith = direction === 'up' ? idx - 1 : idx + 1;
          if (swapWith < 0 || swapWith >= ordered.length) return;
          [ordered[idx], ordered[swapWith]] = [ordered[swapWith], ordered[idx]];
          const reindexed = ordered.map((m, i) => ({...m, sortOrder: i}));
          await saveMembers([...reindexed, ...archived]);
        }}
          onBulkArchive={(ids: string[]) => bulkSetArchived(ids, true)}
          onBulkRestore={(ids: string[]) => bulkSetArchived(ids, false)}
          onBulkDelete={bulkDeleteMembers}
          onBulkAddGroups={bulkAddGroups}
        />;
      case 'hub':
        return <HubScreen theme={C} singlet={isSinglet} selfId={selfMember?.id} members={members} history={history} front={front} onSaveHistory={saveHistory} onSetFront={handleHubSetFront} renderShareScreen={renderShareScreen} renderStatsScreen={renderStatsScreen} renderChatScreen={renderChatScreen} renderCustomFieldsScreen={renderCustomFieldsScreen} renderSystemManagerScreen={() => <SystemManagerScreen theme={C} members={members} groups={groups} onSaveGroups={saveGroups} onViewMember={openMemberById} front={front} onQuickFront={quickAddToFront} onRemoveFromFront={removeFromFront} onAddToGroup={(ids, groupId) => bulkAddGroups(ids, [groupId])} onRemoveFromGroup={bulkRemoveFromGroup} />} renderArchiveScreen={renderArchiveScreen} renderPollsScreen={renderPollsScreen} renderSystemMapScreen={renderSystemMapScreen} systemMapRelCount={systemMapRelCount} mapFocus={mapFocus} renderMedicalScreen={renderMedicalScreen} renderMailboxScreen={renderMailboxScreen} renderWhiteboardScreen={renderWhiteboardScreen} renderNetworkScreen={renderNetworkScreen} resetKey={hubResetKey} editHistoryIndex={editHistoryIndex} onClearEditHistory={() => setEditHistoryIndex(null)} />;
      case 'journal':
        return <JournalScreen theme={C} journal={journal} templates={journalTemplates} members={members} systemJournalPassword={system.journalPassword} onAdd={() => {setEditJournal(null); setShowJournal(true);}} onEdit={e => {setEditJournal(e); setShowJournal(true);}} onDelete={deleteEntry} onTogglePin={e => saveEntry({...e, pinned: !e.pinned})} onSaveTemplates={saveJournalTemplates} onMentionPress={openMemberById} />;
      case 'history':
        return <HistoryScreen theme={C} history={history} journal={journal} getMember={getMember} members={members} singlet={isSinglet} selfId={selfMember?.id} onSaveHistory={saveHistory} onEditEntry={(idx: number) => {setEditHistoryIndex(idx); setTab('hub');}} />;
    }
  };

  return (
    <View style={[styles.root, {backgroundColor: C.bg}]}>
      <StatusBar barStyle={C.isLight ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
      <View style={{backgroundColor: C.bg, paddingTop: Platform.OS === 'ios' ? Math.max(insets.top - 6, 0) : Math.max(StatusBar.currentHeight || 0, insets.top || 0, 28)}}>
        <View style={[styles.header, {borderBottomColor: C.border, backgroundColor: C.bg}]}>
          <View style={{flex: 1, minWidth: 0, marginRight: 8, overflow: 'hidden'}}>
            <AccentText
              T={C}
              style={[styles.headerTitle, {color: C.accent, flex: 1}]}
              numberOfLines={1}
              accessibilityRole="header"
              maxFontSizeMultiplier={1.2}>{system.name}</AccentText>
          </View>
          <View style={styles.headerRight} accessibilityRole="toolbar" accessibilityLabel={t('a11y.toolbar')}>
            <TouchableOpacity
              onPress={() => { if (appSettings.appLockPassword) setLocked(true); }}
              disabled={!appSettings.appLockPassword}
              activeOpacity={appSettings.appLockPassword ? 0.7 : 1}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.lockApp')}
              accessibilityState={{disabled: !appSettings.appLockPassword}}
              style={styles.settingsBtn}>
              <Text style={[styles.settingsIcon, {color: appSettings.appLockPassword ? C.dim : C.muted, opacity: appSettings.appLockPassword ? 1 : 0.35}]} maxFontSizeMultiplier={1.2} allowFontScaling={false} importantForAccessibility="no" accessibilityElementsHidden>🔒</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSystem(true)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('a11y.settings')} style={styles.settingsBtn}>
              <Text style={[styles.settingsIcon, {color: C.dim}]} maxFontSizeMultiplier={1.2} allowFontScaling={false} importantForAccessibility="no" accessibilityElementsHidden>⚙</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <View style={styles.content}>
        {TAB_IDS.map(id => mountedTabs.includes(id) ? (
          <View key={id} style={{flex: 1, display: tab === id ? 'flex' : 'none'}}>
            {renderScreenFor(id)}
          </View>
        ) : null)}
      </View>
      <View style={[styles.tabBar, {backgroundColor: C.surface, borderTopColor: C.border}]} accessibilityRole="tablist" accessibilityLabel={t('a11y.mainNav')}>
        {TAB_IDS.map(id => (
          <TouchableOpacity key={id} onPress={() => { if (id === 'hub' && tab === 'hub') setHubResetKey(k => k + 1); setTab(id); }} activeOpacity={0.7} accessibilityRole="tab" accessibilityState={{selected: tab === id}} accessibilityLabel={tabLabel(id)} style={[styles.tabBtn, {paddingBottom: 8 + (insets.bottom || 0)}]}>
            <AccentText T={C} style={[styles.tabIcon, {color: tab === id ? C.accent : C.dim, fontSize: fs(18)}]} maxFontSizeMultiplier={1.2}>{TAB_ICONS[id]}</AccentText>
            <AccentText T={C} style={[styles.tabLabel, {color: tab === id ? C.accent : C.dim, fontSize: fs(9)}]} numberOfLines={1} allowFontScaling={false}>{tabLabel(id)}</AccentText>
          </TouchableOpacity>
        ))}
      </View>

      {isSinglet ? (
        <SetStatusModal visible={showSetFront} theme={C} statuses={singletStatuses(members)} selfId={selfMember?.id} current={front} settings={appSettings}
          lastKnownLocation={lastKnownLocation}
          onSave={async (primary: FrontTier, coFront: FrontTier, coConscious: FrontTier) => {await updateFront(primary, coFront, coConscious); setShowSetFront(false);}}
          onClose={() => setShowSetFront(false)} />
      ) : (
        <SetFrontModal visible={showSetFront} theme={C} members={members.filter(m => !m.archived)} groups={groups} current={front} settings={appSettings}
          lastKnownLocation={lastKnownLocation}
          onSave={async (primary: FrontTier, coFront: FrontTier, coConscious: FrontTier) => {await updateFront(primary, coFront, coConscious); setShowSetFront(false);}}
          onClose={() => setShowSetFront(false)} />
      )}
      {front && (
        <EditFrontDetailModal visible={showEditFrontDetail} theme={C} front={front} tier={editTier} settings={appSettings} statusMode={isSinglet}
          lastKnownLocation={lastKnownLocation}
          onSave={async (mood: string, location: string, note: string) => {await updateFrontDetails(editTier, mood, location, note); setShowEditFrontDetail(false);}}
          onClose={() => setShowEditFrontDetail(false)} />
      )}
      <MemberModal key={`${editMember?.id || 'new-member'}-${viewOnlyMember ? 'view' : 'edit'}`} visible={showMember} theme={C} member={editMember} members={members} groups={groups} settings={appSettings}
        readOnly={viewOnlyMember}
        profileMode={isSinglet && editMember?.id === selfMember?.id && !editMember?.isCustomFront}
        onRequestEdit={isSinglet && viewOnlyMember ? () => setViewOnlyMember(false) : undefined}
        isFronting={!!editMember && allFrontMemberIds(front).includes(editMember.id)}
        onMentionPress={openMemberById}
        onShowOnMap={showMemberOnMap}
        onSave={async (m: Member) => {await saveMember(addCustomFront && !editMember ? {...m, isCustomFront: true} : m); setShowMember(false); setEditMember(null); setViewOnlyMember(false); setAddCustomFront(false);}}
        onDelete={async (id: string) => {await deleteMember(id); setShowMember(false); setEditMember(null); setViewOnlyMember(false);}}
        onClose={() => {setShowMember(false); setEditMember(null); setViewOnlyMember(false);}} />
      <CustomFrontModal visible={showCustomFront} theme={C} customFront={editCustomFront} statusMode={isSinglet}
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
          if (s.accountMode === 'singlet' && !members.find(m => m.id === s.selfMemberId && !m.isCustomFront)) {
            const existing = members.find(m => !m.isCustomFront && !m.archived);
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
        onClose={() => setShowSystem(false)} />
    </View>
  );
}

class AppErrorBoundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
  state = {error: null as Error | null};
  static getDerivedStateFromError(error: Error) {
    return {error};
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('AppErrorBoundary caught:', error, info?.componentStack);
    }
  }
  reset = () => this.setState({error: null});
  render() {
    if (!this.state.error) return this.props.children;
    const err = this.state.error as Error;
    const msg = err?.message || String(err);
    return (
      <View style={{flex: 1, backgroundColor: '#0a0a0a', padding: 24, justifyContent: 'center', alignItems: 'center'}}>
        <Text style={{color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12, textAlign: 'center'}}>
          {i18n.t('errorBoundary.title')}
        </Text>
        <Text style={{color: '#bbb', fontSize: 13, marginBottom: 24, textAlign: 'center'}}>
          {i18n.t('errorBoundary.body')}
        </Text>
        <Text style={{color: '#666', fontSize: 11, marginBottom: 24, textAlign: 'center'}} numberOfLines={4}>
          {msg}
        </Text>
        <TouchableOpacity onPress={this.reset} style={{paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, backgroundColor: '#3a7bd5'}}>
          <Text style={{color: '#fff', fontSize: 14, fontWeight: '600'}}>
            {i18n.t('errorBoundary.retry')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }
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
  loading: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  splashLogo: {width: 200, height: 200},
  splashName: {fontFamily: 'OpenDyslexic', fontSize: 22, fontStyle: 'italic', letterSpacing: 2, marginTop: 16},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1},
  headerTitle: {fontFamily: 'OpenDyslexic', fontSize: 20, fontWeight: '600', fontStyle: 'italic', letterSpacing: 0.3},
  headerRight: {flexDirection: 'row', alignItems: 'center', flexShrink: 0},
  settingsBtn: {padding: 4, marginLeft: 8},
  settingsIcon: {fontSize: 18},
  content: {flex: 1},
  tabBar: {flexDirection: 'row', borderTopWidth: 1},
  tabBtn: {flex: 1, alignItems: 'center', paddingVertical: 8, paddingTop: 10},
  tabIcon: {fontSize: 18, marginBottom: 2},
  tabLabel: {fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase'},
});
