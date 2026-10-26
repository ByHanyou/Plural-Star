import {useAppStore} from '../store/appStore';
import {NetworkManager} from '../network/NetworkManager';
import {CloudServices} from '../cloud/cloudPlatform';

const SYNCED_SLICES = ['system', 'members', 'history', 'journal', 'journalTemplates', 'groups', 'palettes', 'chatChannels', 'medical', 'appSettings'] as const;

const announce = (): void => {
  NetworkManager.notifyDataChanged();
  CloudServices.schedulePush();
};

export const installDataChangeBridge = (): (() => void) => {
  announce();
  return useAppStore.subscribe((next, prev) => {
    if (SYNCED_SLICES.some(k => next[k] !== prev[k])) announce();
  });
};
