import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {View, Text, Image, TouchableOpacity, StyleSheet, StatusBar, Platform, PermissionsAndroid, Alert} from 'react-native';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTranslation} from 'react-i18next';
import notifee from '@notifee/react-native';

import './src/i18n/i18n';
import {changeLanguage} from './src/i18n/i18n';
import type {SupportedLanguage} from './src/i18n/i18n';

import {T, TLight, BUILTIN_PALETTES, deriveTheme} from './src/theme';
import type {CustomPalette, ThemeColors} from './src/theme';
import {AccentText} from './src/components/AccentText';
import {store, KEYS} from './src/storage';
import {SystemInfo, Member, MemberGroup, FrontState, FrontTier, FrontTierKey, HistoryEntry, JournalEntry, ShareSettings, AppSettings, ChatChannel, ChatMessage, DEFAULT_CHANNELS, EMPTY_TIER, findOpenFrontInHistory, migrateFrontState, isFrontEmpty, frontToHistoryEntry, uid} from './src/utils';
import {showFrontNotification, clearFrontNotification} from './src/services/NotificationService';

import {SetupScreen} from './src/screens/SetupScreen';
import {FrontScreen} from './src/screens/FrontScreen';
import {MembersScreen} from './src/screens/MembersScreen';
import {HistoryScreen} from './src/screens/HistoryScreen';
import {JournalScreen} from './src/screens/JournalScreen';
import {ShareScreen} from './src/screens/ShareScreen';
import {HubScreen} from './src/screens/HubScreen';
import {StatsScreen} from './src/screens/StatsScreen';
import {ChatScreen} from './src/screens/ChatScreen';
import {SetFrontModal, EditFrontDetailModal, MemberModal, JournalModal, SystemModal} from './src/modals';

type Tab = 'front' | 'members' | 'hub' | 'journal' | 'history';

const TAB_IDS: Tab[] = ['front', 'members', 'hub', 'journal', 'history'];
const TAB_ICONS: Record<Tab, string> = {
  front: '◈', members: '◇', hub: '⬡', journal: '◉', history: '◷',
};

const DEFAULT_SETTINGS: AppSettings = {locations: [], customMoods: [], lightMode: false, gpsEnabled: false, filesEnabled: true, language: 'en', notificationsEnabled: true, activePaletteId: '__dark__', textScale: 1.0};

const getGPSLocation = (): Promise<string | null> =>
  new Promise(async resolve => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          {title: 'Location Permission', message: 'Plural Space wants to tag your approximate location when fronting.', buttonPositive: 'Allow', buttonNegative: 'Deny'},
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {resolve(null); return;}
      }
      (navigator as any).geolocation?.getCurrentPosition(
        async (pos: any) => {
          try {
            const {latitude, longitude} = pos.coords;
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=10`,
              {headers: {'User-Agent': 'PluralSpace/1.0'}},
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
  const [tab, setTab] = useState<Tab>('front');
  const [system, setSystem] = useState<SystemInfo>({name: '', description: ''});
  const [members, setMembers] = useState<Member[]>([]);
  const [front, setFront] = useState<FrontState | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [shareSettings, setShareSettings] = useState<ShareSettings>({showFront: true, showMembers: true, showDescriptions: false});
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [palettes, setPalettes] = useState<CustomPalette[]>([]);
  const [activePaletteId, setActivePaletteId] = useState<string>('__dark__');
  const [chatChannels, setChatChannels] = useState<ChatChannel[]>([]);
  const [allChatMessages, setAllChatMessages] = useState<ChatMessage[]>([]);

  const [showSetFront, setShowSetFront] = useState(false);
  const [showEditFrontDetail, setShowEditFrontDetail] = useState(false);
  const [editTier, setEditTier] = useState<FrontTierKey>('primary');
  const [showMember, setShowMember] = useState(false);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [showJournal, setShowJournal] = useState(false);
  const [editJournal, setEditJournal] = useState<JournalEntry | null>(null);
  const [showSystem, setShowSystem] = useState(false);

  const insets = useSafeAreaInsets();

  const C: ThemeColors = useMemo(() => {
    const allPals = [...BUILTIN_PALETTES, ...palettes];
    const pal = allPals.find(p => p.id === activePaletteId) || BUILTIN_PALETTES[0];
    return deriveTheme(pal.bg, pal.accent, pal.text, pal.mid);
  }, [activePaletteId, palettes]);

  const loadChatMessages = useCallback(async (channels: ChatChannel[]) => {
    const allMsgs: ChatMessage[] = [];
    for (const ch of channels) {
      if (ch.archived) continue;
      const msgs = await store.get<ChatMessage[]>(`ps:chat:${ch.id}`, []);
      if (msgs) allMsgs.push(...msgs);
    }
    setAllChatMessages(allMsgs);
  }, []);

  const loadAll = useCallback(async () => {
    const [sys, mem, fr, hist, jour, share, settings, savedLang, grps, savedPalettes, savedChannels] = await Promise.all([
      store.get<SystemInfo>(KEYS.system),
      store.get<Member[]>(KEYS.members, []),
      store.get<any>(KEYS.front),
      store.get<HistoryEntry[]>(KEYS.history, []),
      store.get<JournalEntry[]>(KEYS.journal, []),
      store.get<ShareSettings>(KEYS.share, {showFront: true, showMembers: true, showDescriptions: false}),
      store.get<AppSettings>(KEYS.settings, DEFAULT_SETTINGS),
      store.get<string>(KEYS.language, ''),
      store.get<MemberGroup[]>(KEYS.groups, []),
      store.get<CustomPalette[]>(KEYS.palettes, []),
      store.get<ChatChannel[]>(KEYS.chatChannels, []),
    ]);
    if (!sys) {setFirstRun(true);} else {setSystem(sys);}
    setMembers(mem || []);
    const migratedFront = migrateFrontState(fr) || findOpenFrontInHistory(hist || []);
    setFront(migratedFront);
    if ((fr && !fr.primary && migratedFront) || (!fr && migratedFront)) {
      await store.set(KEYS.front, migratedFront);
    }
    setHistory(hist || []);
    setJournal(jour || []);
    setShareSettings(share || {showFront: true, showMembers: true, showDescriptions: false});
    const mergedSettings = {...DEFAULT_SETTINGS, ...(settings || {})};
    setAppSettings(mergedSettings);
    setGroups(grps || []);
    setPalettes(savedPalettes || []);

    let channels = savedChannels || [];
    if (channels.length === 0) {
      channels = DEFAULT_CHANNELS.map(c => ({id: uid(), name: c.name, createdAt: Date.now()}));
      await store.set(KEYS.chatChannels, channels);
    }
    setChatChannels(channels);
    await loadChatMessages(channels);

    const paletteId = mergedSettings.activePaletteId || '__dark__';
    if (mergedSettings.lightMode && !mergedSettings.activePaletteId) {
      setActivePaletteId('__light__');
    } else {
      setActivePaletteId(paletteId);
    }

    if (savedLang) changeLanguage(savedLang as SupportedLanguage);
    setLoaded(true);
  }, []);

  const requestPermissions = async () => {
    try {
      await notifee.requestPermission();
    } catch (e) { console.error('[PS] notification permission error:', e); }
    if (Platform.OS !== 'android') return;
    try {
      if (appSettings.gpsEnabled) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          {title: 'Location', message: 'Allow Plural Space to tag your approximate location when fronting.', buttonPositive: 'Allow', buttonNegative: 'Not now'});
      }
    } catch (e) { console.error('[PS] location permission error:', e); }
  };

  const requestGPSPermission = async () => {
    if (Platform.OS !== 'android') return;
    try {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        {title: 'Location', message: 'Allow Plural Space to tag your approximate location when fronting.', buttonPositive: 'Allow', buttonNegative: 'Not now'});
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
          {title: 'File Access', message: 'Allow Plural Space to import and export files.', buttonPositive: 'Allow', buttonNegative: 'Not now'});
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          console.warn('[PS] File permission denied:', result);
        }
      }
    } catch (e) { console.error('[PS] File permission error:', e); }
  };

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (loaded && !firstRun) requestPermissions(); }, [loaded, firstRun]);

  useEffect(() => {
    if (appSettings.notificationsEnabled) { showFrontNotification(front, members, system.name).catch(e => console.error('[PS] notif error:', e)); }
    else { clearFrontNotification().catch(e => console.error('[PS] clear notif error:', e)); }
  }, [front, members, appSettings.notificationsEnabled, system.name]);

  useEffect(() => {
    if (!front || !appSettings.notificationsEnabled) return;
    const interval = setInterval(() => { showFrontNotification(front, members, system.name).catch(e => console.error('[PS] notif refresh error:', e)); }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [front, members, appSettings.notificationsEnabled, system.name]);

  const saveSystem = async (d: SystemInfo) => {setSystem(d); await store.set(KEYS.system, d);};
  const saveMembers = async (d: Member[]) => {setMembers(d); await store.set(KEYS.members, d);};
  const saveHistory = async (d: HistoryEntry[]) => {setHistory(d); await store.set(KEYS.history, d);};
  const saveJournal = async (d: JournalEntry[]) => {setJournal(d); await store.set(KEYS.journal, d);};
  const saveShareSettings = async (d: ShareSettings) => {setShareSettings(d); await store.set(KEYS.share, d);};
  const saveGroups = async (d: MemberGroup[]) => {setGroups(d); await store.set(KEYS.groups, d);};
  const savePalettes = async (d: CustomPalette[]) => {setPalettes(d); await store.set(KEYS.palettes, d);};
  const saveChatChannels = async (d: ChatChannel[]) => {setChatChannels(d); await store.set(KEYS.chatChannels, d); await loadChatMessages(d);};

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

  useEffect(() => { store.get<string>('ps:lastLocation').then(loc => { if (loc) setLastKnownLocation(loc); }); }, []);

  const maybeGPS = async (manualLocation?: string): Promise<string | undefined> => {
    const loc = manualLocation?.trim() || undefined;
    if (loc) return loc;
    if (appSettings.gpsEnabled) { const gps = await getGPSLocation(); return gps || undefined; }
    return undefined;
  };

  const updateFront = async (primary: FrontTier, coFront: FrontTier, coConscious: FrontTier) => {
    const now = Date.now();
    let newHistory = [...history];
    if (front) {
      newHistory = newHistory.map(e =>
        e.endTime === null && e.startTime === front.startTime && e.changeType === 'front' ? {...e, endTime: now} : e);
    }
    const isEmpty = primary.memberIds.length === 0 && coFront.memberIds.length === 0 && coConscious.memberIds.length === 0;

    const quickLocation = primary.location?.trim() || lastKnownLocation || undefined;
    const nf: FrontState | null = isEmpty ? null : {primary: {...primary, location: quickLocation}, coFront, coConscious, startTime: now};

    if (nf) {
      const frontEntry = frontToHistoryEntry(nf, null, 'front');
      newHistory = [frontEntry, ...newHistory].slice(0, 1000);
    }

    setFront(nf);
    await store.set(KEYS.front, nf);
    await saveHistory(newHistory);

    if (nf && appSettings.gpsEnabled && !primary.location?.trim()) {
      try {
        const gpsLocation = await getGPSLocation();
        if (gpsLocation && gpsLocation !== quickLocation) {
          const patched: FrontState = {...nf, primary: {...nf.primary, location: gpsLocation}};
          setFront(patched);
          await store.set(KEYS.front, patched);
          await updateLastLocation(gpsLocation);
        }
      } catch (e) { console.error('[PS] GPS post-save error:', e); }
    } else if (quickLocation) {
      await updateLastLocation(quickLocation);
    }
  };

  const updateFrontNote = async (tier: FrontTierKey, note: string) => {
    if (!front) return;
    const now = Date.now();
    const tierData = front[tier];
    if (note === tierData.note) return;
    const updated = {...front, [tier]: {...tierData, note}};
    setFront(updated); await store.set(KEYS.front, updated);
    const noteEntry = frontToHistoryEntry(updated, null, 'note', tier);
    noteEntry.changeTime = now;
    await saveHistory([noteEntry, ...history].slice(0, 1000));
  };

  const updateFrontDetails = async (tier: FrontTierKey, mood?: string, location?: string, note?: string) => {
    if (!front) return;
    const now = Date.now();
    const tierData = front[tier];
    const resolvedLocation = tier === 'primary' ? await maybeGPS(location?.trim() || lastKnownLocation) : tierData.location;
    const updatedTier = {...tierData, mood, location: resolvedLocation, note: note ?? tierData.note};
    const updated = {...front, [tier]: updatedTier};
    setFront(updated); await store.set(KEYS.front, updated);
    if (resolvedLocation && tier === 'primary') await updateLastLocation(resolvedLocation);
    const extras: HistoryEntry[] = [];
    const moodChanged = (mood || undefined) !== (tierData.mood || undefined);
    const locChanged = tier === 'primary' && (resolvedLocation || undefined) !== (tierData.location || undefined);
    const noteChanged = note !== undefined && (note || undefined) !== (tierData.note || undefined);
    if (moodChanged || locChanged) { const entry = frontToHistoryEntry(updated, null, moodChanged ? 'mood' : 'location', tier); entry.changeTime = now; extras.push(entry); }
    if (noteChanged) { const entry = frontToHistoryEntry(updated, null, 'note', tier); entry.changeTime = now + 1; extras.push(entry); }
    if (extras.length > 0) await saveHistory([...extras, ...history].slice(0, 1000));
  };

  const saveMember = async (m: Member) => {
    const u = members.find(x => x.id === m.id) ? members.map(x => (x.id === m.id ? m : x)) : [...members, m];
    await saveMembers(u);
  };
  const deleteMember = async (id: string) => saveMembers(members.filter(m => m.id !== id));
  const saveEntry = async (e: JournalEntry) => {
    const u = journal.find(x => x.id === e.id) ? journal.map(x => (x.id === e.id ? e : x)) : [e, ...journal];
    await saveJournal(u);
  };
  const deleteEntry = async (id: string) => saveJournal(journal.filter(e => e.id !== id));
  const addJournalEntry = async (e: JournalEntry) => saveJournal([e, ...journal]);

  const handleDeleteAccount = async () => {
    await clearFrontNotification(); await store.clearAll();
    setSystem({name: '', description: ''}); setMembers([]); setFront(null);
    setHistory([]); setJournal([]);
    setShareSettings({showFront: true, showMembers: true, showDescriptions: false});
    setAppSettings(DEFAULT_SETTINGS); setGroups([]); setPalettes([]); setActivePaletteId('__dark__');
    setChatChannels([]); setAllChatMessages([]);
    setTab('front'); setFirstRun(true);
  };

  const handleHubSetFront = async (f: FrontState | null) => {
    setFront(f);
    await store.set(KEYS.front, f);
  };

  if (!loaded) {
    return (
      <View style={[styles.loading, {backgroundColor: T.bg}]}>
        <StatusBar barStyle="light-content" backgroundColor={T.bg} translucent={false} />
        <Image source={require('./src/assets/splash-logo.png')} style={styles.splashLogo} resizeMode="contain" />
        <Text style={[styles.splashName, {color: T.accent}]}>Plural Space</Text>
      </View>
    );
  }

  if (firstRun) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} translucent={false} />
        <SetupScreen theme={C} onSave={async s => {await saveSystem(s); setFirstRun(false); setTimeout(requestPermissions, 500);}} />
      </>
    );
  }

  const handleEditDetails = (tier: FrontTierKey) => { setEditTier(tier); setShowEditFrontDetail(true); };

  const renderShareScreen = () => (
    <ShareScreen theme={C} system={system} members={members} front={front} history={history} journal={journal} shareSettings={shareSettings} appSettings={appSettings} onSettingsChange={saveShareSettings} getMember={getMember} onDataImported={loadAll} onAddJournalEntry={addJournalEntry} onDeleteAccount={handleDeleteAccount} />
  );

  const renderStatsScreen = () => (
    <StatsScreen theme={C} history={history} members={members} chatMessages={allChatMessages} />
  );

  const renderChatScreen = () => (
    <ChatScreen theme={C} members={members} channels={chatChannels} onSaveChannels={saveChatChannels} />
  );

  const renderScreen = () => {
    switch (tab) {
      case 'front':
        return <FrontScreen theme={C} front={front} getMember={getMember} onSetFront={() => setShowSetFront(true)} onUpdateNote={updateFrontNote} onEditDetails={handleEditDetails} />;
      case 'members':
        return <MembersScreen theme={C} members={members} front={front} groups={groups} onAdd={() => {setEditMember(null); setShowMember(true);}} onEdit={m => {setEditMember(m); setShowMember(true);}} onSaveGroups={saveGroups} />;
      case 'hub':
        return <HubScreen theme={C} members={members} history={history} front={front} onSaveHistory={saveHistory} onSetFront={handleHubSetFront} renderShareScreen={renderShareScreen} renderStatsScreen={renderStatsScreen} renderChatScreen={renderChatScreen} />;
      case 'journal':
        return <JournalScreen theme={C} journal={journal} members={members} systemJournalPassword={system.journalPassword} onAdd={() => {setEditJournal(null); setShowJournal(true);}} onEdit={e => {setEditJournal(e); setShowJournal(true);}} onDelete={deleteEntry} />;
      case 'history':
        return <HistoryScreen theme={C} history={history} journal={journal} getMember={getMember} members={members} />;
    }
  };

  return (
    <View style={[styles.root, {backgroundColor: C.bg}]}>
      <StatusBar barStyle={C.isLight ? 'dark-content' : 'light-content'} backgroundColor={C.bg} translucent={false} />
      <View style={{backgroundColor: C.bg, paddingTop: Platform.OS === 'ios' ? Math.max(insets.top - 6, 0) : StatusBar.currentHeight || 0}}>
        <View style={[styles.header, {borderBottomColor: C.border, backgroundColor: C.bg}]}>
          <AccentText T={C} style={[styles.headerTitle, {color: C.accent}]}>{system.name}</AccentText>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => setShowSystem(true)} activeOpacity={0.7} style={styles.settingsBtn}>
              <Text style={[styles.settingsIcon, {color: C.dim}]}>⚙</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <View style={styles.content}>{renderScreen()}</View>
      <View style={[styles.tabBar, {backgroundColor: C.surface, borderTopColor: C.border}]}>
        {TAB_IDS.map(id => (
          <TouchableOpacity key={id} onPress={() => setTab(id)} activeOpacity={0.7} style={[styles.tabBtn, {paddingBottom: 8 + (insets.bottom || 0)}]}>
            <AccentText T={C} style={[styles.tabIcon, {color: tab === id ? C.accent : C.dim}]}>{TAB_ICONS[id]}</AccentText>
            <AccentText T={C} style={[styles.tabLabel, {color: tab === id ? C.accent : C.dim}]}>{t(`tabs.${id}`)}</AccentText>
          </TouchableOpacity>
        ))}
      </View>

      <SetFrontModal visible={showSetFront} theme={C} members={members.filter(m => !m.archived)} groups={groups} current={front} settings={appSettings}
        lastKnownLocation={lastKnownLocation}
        onSave={async (primary: FrontTier, coFront: FrontTier, coConscious: FrontTier) => {await updateFront(primary, coFront, coConscious); setShowSetFront(false);}}
        onClose={() => setShowSetFront(false)} />
      {front && (
        <EditFrontDetailModal visible={showEditFrontDetail} theme={C} front={front} tier={editTier} settings={appSettings}
          lastKnownLocation={lastKnownLocation}
          onSave={async (mood: string, location: string, note: string) => {await updateFrontDetails(editTier, mood, location, note); setShowEditFrontDetail(false);}}
          onClose={() => setShowEditFrontDetail(false)} />
      )}
      <MemberModal visible={showMember} theme={C} member={editMember} groups={groups}
        onSave={async (m: Member) => {await saveMember(m); setShowMember(false);}}
        onDelete={async (id: string) => {await deleteMember(id); setShowMember(false);}}
        onClose={() => setShowMember(false)} />
      <JournalModal visible={showJournal} theme={C} entry={editJournal} members={members}
        onSave={async (e: JournalEntry) => {await saveEntry(e); setShowJournal(false);}}
        onClose={() => setShowJournal(false)} />
      <SystemModal visible={showSystem} theme={C} system={system} settings={appSettings}
        palettes={palettes} activePaletteId={activePaletteId}
        onSave={async (s: SystemInfo) => {await saveSystem(s); setShowSystem(false);}}
        onSaveSettings={async (s: AppSettings) => {await saveAppSettings(s); setShowSystem(false);}}
        onSavePalettes={savePalettes}
        onSelectPalette={selectPalette}
        onClose={() => setShowSystem(false)} />
    </View>
  );
}

export default function App() {
  return (<SafeAreaProvider><MainAppContent /></SafeAreaProvider>);
}

const styles = StyleSheet.create({
  root: {flex: 1},
  loading: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  splashLogo: {width: 200, height: 200},
  splashName: {fontFamily: 'Georgia', fontSize: 22, fontStyle: 'italic', letterSpacing: 2, marginTop: 16},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1},
  headerTitle: {fontFamily: 'Georgia', fontSize: 20, fontWeight: '600', fontStyle: 'italic', letterSpacing: 0.3},
  headerRight: {flexDirection: 'row', alignItems: 'center'},
  settingsBtn: {padding: 4, marginLeft: 8},
  settingsIcon: {fontSize: 18},
  content: {flex: 1},
  tabBar: {flexDirection: 'row', borderTopWidth: 1},
  tabBtn: {flex: 1, alignItems: 'center', paddingVertical: 8, paddingTop: 10},
  tabIcon: {fontSize: 18, marginBottom: 2},
  tabLabel: {fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase'},
});
