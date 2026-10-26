import {createContext, useContext, useEffect, useRef} from 'react';
import {Emitter} from '../utils/emitter';

type ActiveListener = (active: boolean) => void;

export type TabActiveSource = {
  get: () => boolean;
  subscribe: (fn: ActiveListener) => () => void;
};

export type TabActiveSwitch = TabActiveSource & {set: (active: boolean) => void};

const createTabActiveSource = (initial: boolean): TabActiveSwitch => {
  let active = initial;
  const changes = new Emitter<[active: boolean]>('tabActive');
  return {
    get: () => active,
    subscribe: fn => changes.on(fn),
    set: next => {
      if (next === active) return;
      active = next;
      changes.emit(next);
    },
  };
};

export const createTabActiveSources = <K extends string>(ids: readonly K[], activeId: K): Record<K, TabActiveSwitch> => {
  const sources = {} as Record<K, TabActiveSwitch>;
  ids.forEach(id => {
    sources[id] = createTabActiveSource(id === activeId);
  });
  return sources;
};

const ALWAYS_ACTIVE: TabActiveSource = {get: () => true, subscribe: () => () => {}};

export const TabActiveContext = createContext<TabActiveSource>(ALWAYS_ACTIVE);

export const useWhileTabActive = (start: () => () => void): void => {
  const source = useContext(TabActiveContext);
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    let stop: (() => void) | null = null;
    const apply = (active: boolean) => {
      if (active && !stop) {
        stop = startRef.current();
      } else if (!active && stop) {
        const end = stop;
        stop = null;
        end();
      }
    };
    apply(source.get());
    const unsubscribe = source.subscribe(apply);
    return () => {
      unsubscribe();
      apply(false);
    };
  }, [source]);
};
