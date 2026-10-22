import {useCallback, useEffect, useRef, useState} from 'react';
import {store, KEYS} from '../storage';
import {NetworkManager} from '../network/NetworkManager';
import {WhiteboardStroke} from '../utils';
import {logError} from '../utils/log';
import {reportSaveError} from '../utils/saveError';

export const useWhiteboardStrokes = () => {
  const [strokes, setStrokes] = useState<WhiteboardStroke[]>([]);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const dirtyRef = useRef(false);

  useEffect(() => {
    const load = () => {
      store.get<WhiteboardStroke[]>(KEYS.whiteboard, []).then(saved => {
        if (saved && Array.isArray(saved)) setStrokes(saved.filter(s => s && Array.isArray(s.pts) && s.pts.length >= 2));
      }).catch(e => logError('whiteboard', e));
    };
    load();
    return NetworkManager.onSyncApplied(() => { if (!dirtyRef.current) load(); });
  }, []);

  const persist = useCallback((next: WhiteboardStroke[]) => {
    dirtyRef.current = false;
    store.set(KEYS.whiteboard, next).catch(reportSaveError);
  }, []);

  useEffect(() => () => {
    if (dirtyRef.current) store.set(KEYS.whiteboard, strokesRef.current).catch(e => logError('whiteboard', e));
  }, []);

  const commit = (next: WhiteboardStroke[]) => {
    setStrokes(next);
    persist(next);
  };
  const addStroke = (s: WhiteboardStroke) => commit([...strokesRef.current, s]);
  const setUnsaved = (next: WhiteboardStroke[]) => {
    dirtyRef.current = true;
    setStrokes(next);
  };

  return {strokes, strokesRef, dirtyRef, persist, commit, addStroke, setUnsaved};
};
