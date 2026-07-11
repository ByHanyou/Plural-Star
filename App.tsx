import React, {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import {View, StyleSheet, StatusBar, Alert, AppState} from 'react-native';
import {setAppTextFont} from './src/components/AppText';
import {fontFamilyForChoice} from './src/theme';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {KeyboardProvider} from 'react-native-keyboard-controller';
import {useTranslation} from 'react-i18next';

import './src/i18n/i18n';
import {changeLanguage} from './src/i18n/i18n';
import type {SupportedLanguage} from './src/i18n/i18n';

import {BUILTIN_PALETTES, deriveTheme} from './src/theme';
import type {CustomPalette, ThemeColors} from './src/theme';
import {store, KEYS, storageLooksWiped, restoreAllBackups} from './src/storage';
import {SystemInfo, Member, MemberGroup, FrontState, FrontTier, FrontTierKey, HistoryEntry, JournalEntry, JournalTemplate, ShareSettings, AppSettings, ChatChannel, DeviceCodes, MedicalData, DEFAULT_MEDICAL, DEFAULT_CHANNELS, findOpenFrontInHistory, migrateFrontState, uid, makeDefaultCustomFronts, allFrontMemberIds, singletStatuses, generateFriendCode, generateSyncCode, emergencyNotificationLine} from './src/utils';
import {migrateInlineAvatars, clearAllMedia, migrateStaleMediaPaths, downsizeExistingAvatars} from './src/utils/mediaUtils';
import {clearFrontNotification, setEmergencyNotificationInfo, rescheduleMedicationReminders, rescheduleAppointmentReminders} from './src/services/NotificationService';
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
import {AppErrorBoundary} from './src/components/AppErrorBoundary';
import {SplashView} from './src/components/SplashView';
import {AppHeader} from './src/components/AppHeader';
import {TabBar, Tab, TAB_IDS} from './src/components/TabBar';
import {useFrontNotifications} from './src/hooks/useFrontNotifications';
import {useNoteboardNotifications} from './src/hooks/useNoteboardNotifications';
import {useAppStore, DEFAULT_SETTINGS} from './src/store/appStore';
import {loadChatMessages, saveSystem, saveMembers, saveHistory, saveJournal, saveJournalTemplates, saveShareSettings, saveGroups, savePalettes, saveChatChannels, saveMedical, selectPalette, updateFront, updateFrontDetails, quickAddToFront, removeFromFront, saveMember, deleteMember, bulkSetArchived, bulkDeleteMembers, bulkAddGroups, bulkRemoveFromGroup, saveEntry, deleteEntry, addJournalEntry, saveAppSettings, ensureSelfMember, saveMemberListFields, saveMemberSortMode, reorderMember} from './src/store/actions';
import {requestPermissions} from './src/utils/permissions';

function MainAppContent() {
  const {t} = useTranslation();

  const loaded = useAppStore(s => s.loaded);
  const setLoaded = useAppStore(s => s.setLoaded);
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
  const shareSettings = useAppStore(s => s.shareSettings);
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
  const allChatMessages = useAppStore(s => s.allChatMessages);
  const setAllChatMessages = useAppStore(s => s.setAllChatMessages);
  const medical = useAppStore(s => s.medical);
  const setMedical = useAppStore(s => s.setMedical);

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

  useFrontNotifications(front, members, system.name, appSettings);
  useNoteboardNotifications(front, members, appSettings);


  const lastKnownLocation = useAppStore(s => s.lastKnownLocation);
  const setLastKnownLocation = useAppStore(s => s.setLastKnownLocation);
  useEffect(() => { store.get<string>('ps:lastLocation').then(loc => { if (loc) setLastKnownLocation(loc); }); }, []);

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

  const isSinglet = appSettings.accountMode === 'singlet';
  const selfMember = isSinglet
    ? (members.find(m => m.id === appSettings.selfMemberId && !m.isCustomFront)
      || members.find(m => !m.isCustomFront && !m.archived))
    : undefined;

  if (!loaded) {
    return <SplashView />;
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

  const renderShareScreen = () => (
    <ShareScreen theme={C} onDataImported={loadAll} onAddJournalEntry={addJournalEntry} onDeleteAccount={handleDeleteAccount} />
  );

  const renderStatsScreen = () => (
    <StatsScreen theme={C} singlet={isSinglet} selfId={selfMember?.id} />
  );

  const renderChatScreen = () => (
    <ChatScreen theme={C} onMentionPress={openMemberById} />
  );

  const renderCustomFieldsScreen = () => (
    <CustomFieldsScreen theme={C} onUpdate={loadAll} />
  );

  const renderPollsScreen = () => (
    <PollsScreen theme={C} />
  );

  const renderSystemMapScreen = () => (
    <SystemMapScreen theme={C} onViewMember={openMemberById} onRelCountChange={setSystemMapRelCount} focus={mapFocus} />
  );

  const renderMedicalScreen = () => (
    <MedicalScreen theme={C} />
  );

  const renderNetworkScreen = () => (
    <NetworkScreen theme={C} />
  );

  const renderMailboxScreen = (onBack: () => void) => (
    <MailboxScreen theme={C} onBack={onBack} />
  );

  const renderWhiteboardScreen = (onBack: () => void) => (
    <WhiteboardScreen theme={C} onBack={onBack} />
  );

  const renderArchiveScreen = () => (
    <MembersScreen theme={C} archiveOnly
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
          return <StatusScreen theme={C} selfId={selfMember?.id}
            onSetStatus={async () => {await ensureSelfMember(); setShowSetFront(true);}} onEditDetails={handleEditDetails} />;
        }
        return <FrontScreen theme={C} onSetFront={() => setShowSetFront(true)} onEditDetails={handleEditDetails} />;
      case 'members':
        if (isSinglet) {
          return <ProfileScreen theme={C} member={selfMember}
            onEditProfile={async () => {const self = await ensureSelfMember(); setEditMember(self); setViewOnlyMember(false); setAddCustomFront(false); setShowMember(true);}}
            onAddStatus={() => {setEditCustomFront(null); setShowCustomFront(true);}}
            onEditStatus={m => {setEditCustomFront(m); setShowCustomFront(true);}} />;
        }
        return <MembersScreen theme={C} initialSortMode={appSettings.memberSortMode} memberListFields={appSettings.memberListFields} onSaveListFields={saveMemberListFields}
          onQuickAddToFront={quickAddToFront} onRemoveFromFront={removeFromFront}
          onAdd={() => {setEditMember(null); setViewOnlyMember(false); setAddCustomFront(false); setShowMember(true);}}
          onAddCustomFront={() => {setEditCustomFront(null); setShowCustomFront(true);}}
          onEdit={m => { if (m.isCustomFront) {setEditCustomFront(m); setShowCustomFront(true);} else {setEditMember(m); setViewOnlyMember(false); setShowMember(true);} }}
          onView={m => { if (m.isCustomFront) {setEditCustomFront(m); setShowCustomFront(true);} else {setEditMember(m); setViewOnlyMember(true); setShowMember(true);} }}
          onSaveGroups={saveGroups} onSaveSortMode={saveMemberSortMode} onReorderMember={reorderMember}
          onBulkArchive={(ids: string[]) => bulkSetArchived(ids, true)}
          onBulkRestore={(ids: string[]) => bulkSetArchived(ids, false)}
          onBulkDelete={bulkDeleteMembers}
          onBulkAddGroups={bulkAddGroups}
        />;
      case 'hub':
        return <HubScreen theme={C} singlet={isSinglet} selfId={selfMember?.id} renderShareScreen={renderShareScreen} renderStatsScreen={renderStatsScreen} renderChatScreen={renderChatScreen} renderCustomFieldsScreen={renderCustomFieldsScreen} renderSystemManagerScreen={() => <SystemManagerScreen theme={C} onViewMember={openMemberById} />} renderArchiveScreen={renderArchiveScreen} renderPollsScreen={renderPollsScreen} renderSystemMapScreen={renderSystemMapScreen} systemMapRelCount={systemMapRelCount} mapFocus={mapFocus} renderMedicalScreen={renderMedicalScreen} renderMailboxScreen={renderMailboxScreen} renderWhiteboardScreen={renderWhiteboardScreen} renderNetworkScreen={renderNetworkScreen} resetKey={hubResetKey} editHistoryIndex={editHistoryIndex} onClearEditHistory={() => setEditHistoryIndex(null)} />;
      case 'journal':
        return <JournalScreen theme={C} onAdd={() => {setEditJournal(null); setShowJournal(true);}} onEdit={e => {setEditJournal(e); setShowJournal(true);}} onDelete={deleteEntry} onTogglePin={e => saveEntry({...e, pinned: !e.pinned})} onMentionPress={openMemberById} />;
      case 'history':
        return <HistoryScreen theme={C} singlet={isSinglet} selfId={selfMember?.id} onEditEntry={(idx: number) => {setEditHistoryIndex(idx); setTab('hub');}} />;
    }
  };

  return (
    <View style={[styles.root, {backgroundColor: C.bg}]}>
      <StatusBar barStyle={C.isLight ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
      <AppHeader C={C} systemName={system.name} canLock={!!appSettings.appLockPassword} onLock={() => setLocked(true)} onOpenSettings={() => setShowSystem(true)} />
      <View style={styles.content}>
        {TAB_IDS.map(id => mountedTabs.includes(id) ? (
          <View key={id} style={{flex: 1, display: tab === id ? 'flex' : 'none'}}>
            {renderScreenFor(id)}
          </View>
        ) : null)}
      </View>
      <TabBar C={C} tab={tab} isSinglet={isSinglet} onPressTab={id => { if (id === 'hub' && tab === 'hub') setHubResetKey(k => k + 1); setTab(id); }} />

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
});
