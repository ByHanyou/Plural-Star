import {useRef, useState, useCallback} from 'react';
import {PanResponder} from 'react-native';
import type {GestureResponderHandlers} from 'react-native';

export interface DragReorderState {
  key: string | null;
  dy: number;
  from: number;
  target: number;
  siblings: string[];
}

const IDLE: DragReorderState = {key: null, dy: 0, from: -1, target: -1, siblings: []};

export const useDragReorder = (opts: {
  enabled: boolean;
  onDrop: (key: string, from: number, to: number, siblings: string[]) => void;
}) => {
  const {enabled, onDrop} = opts;
  const [drag, setDrag] = useState<DragReorderState>(IDLE);
  const heightsRef = useRef<Map<string, number>>(new Map());
  const dragRef = useRef<DragReorderState>(IDLE);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const setDragBoth = (s: DragReorderState) => {
    dragRef.current = s;
    setDrag(s);
  };

  const registerHeight = useCallback((key: string, h: number) => {
    if (h > 0) heightsRef.current.set(key, h);
  }, []);

  const computeTarget = (from: number, dy: number, siblings: string[], ownH: number): number => {
    let remaining = dy;
    let target = from;
    while (remaining > 0 && target < siblings.length - 1) {
      const nh = heightsRef.current.get(siblings[target + 1]) ?? ownH;
      if (remaining > nh / 2) {
        remaining -= nh;
        target++;
      } else {
        break;
      }
    }
    while (remaining < 0 && target > 0) {
      const ph = heightsRef.current.get(siblings[target - 1]) ?? ownH;
      if (-remaining > ph / 2) {
        remaining += ph;
        target--;
      } else {
        break;
      }
    }
    return target;
  };

  const respondersRef = useRef<Map<string, GestureResponderHandlers>>(new Map());
  const siblingsFnsRef = useRef<Map<string, () => string[]>>(new Map());

  const makeHandlePanHandlers = useCallback((key: string, siblings: () => string[]) => {
    siblingsFnsRef.current.set(key, siblings);
    let handlers = respondersRef.current.get(key);
    if (!handlers) {
      const responder = PanResponder.create({
        onStartShouldSetPanResponder: () => enabledRef.current,
        onMoveShouldSetPanResponder: () => enabledRef.current,
        onPanResponderGrant: () => {
          const sibsFn = siblingsFnsRef.current.get(key);
          const sibs = sibsFn ? sibsFn() : [];
          const from = sibs.indexOf(key);
          if (from < 0) return;
          setDragBoth({key, dy: 0, from, target: from, siblings: sibs});
        },
        onPanResponderMove: (_evt, gs) => {
          const cur = dragRef.current;
          if (cur.key !== key) return;
          const ownH = heightsRef.current.get(key) ?? 48;
          const target = computeTarget(cur.from, gs.dy, cur.siblings, ownH);
          setDragBoth({...cur, dy: gs.dy, target});
        },
        onPanResponderRelease: () => {
          const cur = dragRef.current;
          if (cur.key === key && cur.from >= 0 && cur.target !== cur.from) {
            onDropRef.current(key, cur.from, cur.target, cur.siblings);
          }
          setDragBoth(IDLE);
        },
        onPanResponderTerminate: () => {
          const cur = dragRef.current;
          if (cur.key === key && cur.from >= 0 && cur.target !== cur.from) {
            onDropRef.current(key, cur.from, cur.target, cur.siblings);
          }
          setDragBoth(IDLE);
        },
        onPanResponderTerminationRequest: () => false,
      });
      handlers = responder.panHandlers;
      respondersRef.current.set(key, handlers);
    }
    return handlers;
  }, []);

  return {drag, dragging: drag.key !== null, registerHeight, makeHandlePanHandlers};
};
