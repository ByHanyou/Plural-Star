import type {AppSettings} from '../model/types';
import {KEYS, store} from '../storage';
import {useAppStore} from './appStore';

let pending: Promise<void> = Promise.resolve();

// Read live settings when each write starts, and publish only after it succeeds.
// A failed save must neither delete the current image nor block later changes.
export const commitAppSettings = (update: (current: AppSettings) => AppSettings): Promise<void> => {
  const save = pending.then(async () => {
    const next = update(useAppStore.getState().appSettings);
    await store.set(KEYS.settings, next);
    useAppStore.getState().setAppSettings(next);
  });
  pending = save.catch(() => {});
  return save;
};
