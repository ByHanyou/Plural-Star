import {useEffect, useMemo, useRef} from 'react';
import {Alert, AppState, BackHandler, Platform} from 'react-native';
import type {TFunction} from 'i18next';
import {config, loadConfigOverrides} from '../config';
import {log, logError} from '../utils/log';
import {requestPermissions} from '../utils/permissions';
import {NetworkManager} from '../network/NetworkManager';
import {singletShareFront} from '../network/frontShare';
import {CloudServices, bootCloudServices} from '../cloud/cloudPlatform';
import {installDestructiveGuard} from '../cloud/destructiveGuard';
import {loadLastLocation, onFrontersHaveMail} from '../store/actions';
import type {FrontState, Member} from '../utils';
import {goTab, currentTab} from './navigation';
import type {Startup} from './startup/loadAll';

const SYNC_RELOAD_DELAY_MS = 400;

const configReady = loadConfigOverrides();

export const useBackToFront = (locked: boolean, loaded: boolean): void => {
  const stateRef = useRef({locked, loaded});
  stateRef.current = {locked, loaded};
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const s = stateRef.current;
      if (!s.loaded || s.locked) return false;
      const tab = currentTab();
      if (tab && tab !== 'front') {
        goTab('front');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);
};

export const useStartupLifecycle = (startup: Startup): void => {
  const loadAll = startup.run;
  useEffect(() => { configReady.finally(() => loadAll()); }, [loadAll]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active' && startup.isSuspect()) {
        if (config().startupTrace) log.info('startup', 'foreground after suspect load, retrying loadAll');
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
  }, [loadAll, startup]);
  useEffect(() => {
    configReady.then(() => NetworkManager.init())
      .catch(e => log.error('network', 'init failed:', e))
      .finally(() => {
        bootCloudServices();
        installDestructiveGuard();
      });
  }, []);
};

export const useSyncReload = (loadAll: () => Promise<void>): void => {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = NetworkManager.onSyncApplied(() => {
      if (!timer) timer = setTimeout(() => { timer = null; loadAll(); }, SYNC_RELOAD_DELAY_MS);
    });
    return () => { if (timer) clearTimeout(timer); unsub(); };
  }, [loadAll]);
};

export const useSyncAlerts = (t: TFunction): void => {
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
};

export const useFrontMailAlert = (t: TFunction): void => {
  useEffect(() => onFrontersHaveMail(names => {
    Alert.alert(t('mailbox.title'), t('mailbox.frontersHaveMail', {names}));
  }), [t]);
};

export const usePermissionsOnce = (loaded: boolean, firstRun: boolean): void => {
  const requestedRef = useRef(false);
  useEffect(() => {
    if (!loaded || firstRun || requestedRef.current) return;
    if (AppState.currentState === 'active') {
      requestedRef.current = true;
      requestPermissions();
      return;
    }
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active' && !requestedRef.current) {
        requestedRef.current = true;
        requestPermissions();
        sub.remove();
      }
    });
    return () => sub.remove();
  }, [loaded, firstRun]);
};

export const useLastLocation = (): void => {
  useEffect(() => { loadLastLocation().catch(e => logError('storage', e)); }, []);
};

export const useFrontShare = (loaded: boolean, front: FrontState | null, members: Member[], selfMemberId: string | undefined): void => {
  const membersRef = useRef(members);
  membersRef.current = members;
  const shareSig = useMemo(() => members.map(m => `${m.id}|${m.name}|${m.private ? 1 : 0}|${m.isFacet ? 1 : 0}|${m.isCustomFront ? 1 : 0}`).join('\n'), [members]);
  useEffect(() => {
    if (loaded) NetworkManager.updateMyFront(singletShareFront(front, selfMemberId), membersRef.current).catch(e => log.debug('network', e));
  }, [loaded, front, shareSig, selfMemberId]);
};
