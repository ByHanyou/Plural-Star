import {useEffect, useState} from 'react';
import {configOverrides, ConfigOverrides, parseConfigOverrides, saveConfigOverrides} from '../config';
import {isRecord} from '../utils';
import {errorMessage, onLog, recentLogs} from '../utils/log';

export const useDevOverrides = () => {
  const [over, setOver] = useState<ConfigOverrides>(configOverrides);
  const [json, setJson] = useState(() => JSON.stringify(configOverrides(), null, 2));
  const [jsonError, setJsonError] = useState('');
  const [, bump] = useState(0);
  useEffect(() => onLog(() => bump(n => n + 1)), []);
  const apply = (next: ConfigOverrides) => {
    setOver(next);
    setJson(JSON.stringify(next, null, 2));
    setJsonError('');
    saveConfigOverrides(next).catch(e => setJsonError(errorMessage(e)));
  };
  const set = <K extends keyof ConfigOverrides>(k: K, v: ConfigOverrides[K] | undefined) => {
    const next = {...over};
    if (v === undefined || v === '') delete next[k];
    else next[k] = v;
    apply(next);
  };
  const applyJson = () => {
    try {
      const parsed: unknown = JSON.parse(json || '{}');
      if (!isRecord(parsed)) throw new Error('not an object');
      apply(parseConfigOverrides(parsed));
    } catch (e) {
      setJsonError(errorMessage(e));
    }
  };
  const reset = () => apply({});
  return {over, json, setJson, jsonError, set, applyJson, reset, logs: recentLogs().slice(-80).reverse()};
};
