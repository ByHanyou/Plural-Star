import {useEffect, useRef} from 'react';
import {store} from '../storage';

export const draftKey = (kind: string, id: string): string => `ps.draft:${kind}:${id}`;

export const clearDraft = (kind: string, id: string): void => {
  store.remove(draftKey(kind, id)).catch(() => {});
};

export function useDraft<T>(
  kind: string,
  id: string,
  visible: boolean,
  current: T,
  restore: (draft: T) => void,
): void {
  const openedFor = useRef<string | null>(null);
  const baseline = useRef<string>('');
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const latest = useRef(current);
  latest.current = current;

  useEffect(() => {
    if (!visible || !id) {
      openedFor.current = null;
      return;
    }
    if (openedFor.current === id) return;
    openedFor.current = id;
    baseline.current = JSON.stringify(current ?? null);
    let cancelled = false;
    store
      .get<T | null>(draftKey(kind, id), null)
      .then(draft => {
        if (cancelled || draft == null) return;
        if (JSON.stringify(draft) === baseline.current) return;
        restoreRef.current(draft);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, id, kind]);

  // Deliberately NO serialization during render/commit — stringifying the whole
  // record on every keystroke and every colour tap was measurable lag. The
  // timer is cheap to (re)schedule; the compare happens once, 500ms after the
  // last change.
  useEffect(() => {
    if (!visible || !id || openedFor.current !== id) return;
    const timer = setTimeout(() => {
      const value = latest.current;
      const serialized = JSON.stringify(value ?? null);
      if (serialized === baseline.current) return;
      store.set(draftKey(kind, id), value).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [visible, id, kind, current]);
}
