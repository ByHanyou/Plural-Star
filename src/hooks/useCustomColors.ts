import {useEffect, useState} from 'react';
import {normalizeCustomColors} from '../utils';
import {store, KEYS} from '../storage';
import {NetworkManager} from '../network/NetworkManager';
import {reportSaveError} from '../utils/saveError';
import {logError} from '../utils/log';

export const useCustomColors = (reloadOnSync = false): [string[], (next: string[]) => void] => {
  const [colors, setColors] = useState<string[]>(() => normalizeCustomColors([]));
  useEffect(() => {
    const load = () => { store.get<string[]>(KEYS.customColors, []).then(v => setColors(normalizeCustomColors(v))).catch(e => logError('colors', e)); };
    load();
    return reloadOnSync ? NetworkManager.onSyncApplied(load) : undefined;
  }, [reloadOnSync]);
  const save = (next: string[]) => {
    setColors(next);
    store.set(KEYS.customColors, next).catch(reportSaveError);
  };
  return [colors, save];
};
