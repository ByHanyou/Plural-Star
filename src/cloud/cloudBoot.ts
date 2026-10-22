import {onStoreWrite} from '../storage';
import {NetworkManager} from '../network/NetworkManager';
import {MIRROR_CACHE_PREFIX, SYNC_STATE_KEY} from '../network/types';
import {log, logError} from '../utils/log';
import {CLOUD_LINK_KEY} from './cloudTypes';
import type {CloudService} from './cloudVault';

export const watchCloudTriggers = (service: CloudService): void => {
  service.init().catch(e => logError('cloud', e));
  onStoreWrite((key, removed) => {
    if (!key.startsWith('ps:') || key === CLOUD_LINK_KEY || key === SYNC_STATE_KEY || key.startsWith(MIRROR_CACHE_PREFIX)) return;
    if (removed) service.noteRemoved(key);
    service.schedulePush();
  });
  let wasOnline = false;
  NetworkManager.subscribe(s => {
    const online = s.status === 'online';
    const rising = online && !wasOnline;
    wasOnline = online;
    if (!rising) return;
    service.refreshAvailability()
      .then(ok => {
        if (ok) service.wake();
      })
      .catch(e => log.debug('cloud', e));
  });
};
