import React, {useState, useEffect, useRef} from 'react';
import {View, StyleSheet, StatusBar} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {KeyboardProvider} from 'react-native-keyboard-controller';
import {useTranslation} from 'react-i18next';

import './src/i18n/i18n';

import {findSelfMember} from './src/utils';

import {SetupScreen} from './src/screens/SetupScreen';
import {LockScreen} from './src/screens/LockScreen';
import {FrontScreen} from './src/screens/FrontScreen';
import {MembersScreen} from './src/screens/MembersScreen';
import {HistoryScreen} from './src/screens/HistoryScreen';
import {JournalScreen} from './src/screens/JournalScreen';
import {HubScreen} from './src/screens/HubScreen';
import {StatusScreen} from './src/screens/StatusScreen';
import {ProfileScreen} from './src/screens/ProfileScreen';
import {AppErrorBoundary} from './src/components/AppErrorBoundary';
import {SplashView} from './src/components/SplashView';
import {AppHeader} from './src/components/AppHeader';
import type {Tab} from './src/components/TabBar';
import {useFrontNotifications} from './src/hooks/useFrontNotifications';
import {useNoteboardNotifications} from './src/hooks/useNoteboardNotifications';
import {useAppStore} from './src/store/appStore';
import {useUiStore} from './src/store/uiStore';
import {createStartup} from './src/app/startup/loadAll';
import type {Startup} from './src/app/startup/loadAll';
import {TabHost, initialTabMemory} from './src/app/TabHost';
import type {TabMemory} from './src/app/TabHost';
import {AppModals} from './src/app/AppModals';
import {useAppTheme} from './src/app/useAppTheme';
import {ThemeProvider} from './src/themeContext';
import {installDataChangeBridge} from './src/app/dataChanges';
import {useBackToFront, useStartupLifecycle, useSyncReload, useSyncAlerts, useFrontMailAlert, usePermissionsOnce, useLastLocation, useFrontShare} from './src/app/lifecycle';
import {completeSetup} from './src/store/actions';
import {requestPermissions} from './src/utils/permissions';

const SETUP_PERMISSIONS_DELAY_MS = 500;

const MemoFrontScreen = React.memo(FrontScreen);
const MemoStatusScreen = React.memo(StatusScreen);
const MemoProfileScreen = React.memo(ProfileScreen);
const MemoMembersScreen = React.memo(MembersScreen);
const MemoHubScreen = React.memo(HubScreen);
const MemoJournalScreen = React.memo(JournalScreen);
const MemoHistoryScreen = React.memo(HistoryScreen);

function MainAppContent() {
  const {t} = useTranslation();

  const loaded = useAppStore(s => s.loaded);
  const [firstRun, setFirstRun] = useState(false);
  const tabMemoryRef = useRef<TabMemory>(initialTabMemory());
  const startupRef = useRef<Startup | null>(null);
  if (!startupRef.current) {
    startupRef.current = createStartup(() => {
      tabMemoryRef.current = initialTabMemory();
      setFirstRun(true);
    });
  }
  const startup = startupRef.current;
  const [locked, setLocked] = useState(false);
  useBackToFront(locked, loaded);
  const system = useAppStore(s => s.system);
  const members = useAppStore(s => s.members);
  const front = useAppStore(s => s.front);
  const appSettings = useAppStore(s => s.appSettings);
  const palettes = useAppStore(s => s.palettes);
  const activePaletteId = useAppStore(s => s.activePaletteId);
  const openSystem = useUiStore(s => s.openSystem);
  const openSystemProfile = useUiStore(s => s.openSystemProfile);
  const C = useAppTheme(appSettings, palettes, activePaletteId);

  useStartupLifecycle(startup);
  useEffect(() => installDataChangeBridge(), []);
  useSyncReload(startup.run);
  useSyncAlerts(t);
  useFrontMailAlert(t);
  usePermissionsOnce(loaded, firstRun);
  useFrontNotifications(front, members, system.name, appSettings, loaded);
  useNoteboardNotifications(front, members, appSettings);
  useLastLocation();

  const isSinglet = appSettings.accountMode === 'singlet';
  const selfMember = isSinglet
    ? findSelfMember(members, appSettings.selfMemberId)
    : undefined;
  const selfMemberId = selfMember?.id;
  useFrontShare(loaded, front, members, selfMemberId);

  if (!loaded) {
    return <SplashView />;
  }

  if (firstRun) {
    return (
      <ThemeProvider value={C}>
        <SafeAreaView edges={['top']} style={[styles.root, {backgroundColor: C.bg}]}>
          <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
          <SetupScreen onSave={async s => {
            await completeSetup(s);
            setFirstRun(false);
            setTimeout(requestPermissions, SETUP_PERMISSIONS_DELAY_MS);
          }} />
        </SafeAreaView>
      </ThemeProvider>
    );
  }

  if (locked && appSettings.appLockPassword) {
    return (
      <ThemeProvider value={C}>
        <SafeAreaView edges={['top']} style={[styles.root, {backgroundColor: C.bg}]}>
          <StatusBar barStyle={C.isLight ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
          <LockScreen password={appSettings.appLockPassword} systemName={system.name} onUnlock={() => setLocked(false)} />
        </SafeAreaView>
      </ThemeProvider>
    );
  }

  const screens: Record<Tab, React.ReactNode> = {
    front: isSinglet
      ? <MemoStatusScreen selfId={selfMemberId} />
      : <MemoFrontScreen />,
    members: isSinglet
      ? <MemoProfileScreen member={selfMember} />
      : <MemoMembersScreen />,
    hub: <MemoHubScreen singlet={isSinglet} selfId={selfMemberId} />,
    journal: <MemoJournalScreen />,
    history: <MemoHistoryScreen singlet={isSinglet} selfId={selfMemberId} />,
  };

  return (
    <ThemeProvider value={C}>
      <View style={[styles.root, {backgroundColor: C.bg}]}>
        <StatusBar barStyle={C.isLight ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
        <AppHeader systemName={system.name || t('systemProfile.unnamed')} canLock={!!appSettings.appLockPassword} onLock={() => setLocked(true)} onOpenSettings={openSystem}
          onOpenProfile={isSinglet ? undefined : openSystemProfile} />
        <TabHost isSinglet={isSinglet} screens={screens} memory={tabMemoryRef} />
        <AppModals isSinglet={isSinglet} selfMember={selfMember} />
      </View>
    </ThemeProvider>
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
});
