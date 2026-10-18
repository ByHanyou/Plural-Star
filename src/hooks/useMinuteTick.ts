import {useEffect, useRef, useState} from 'react';
import {useWhileTabActive} from './useTabActive';

const MINUTE_MS = 60 * 1000;

export const useMinuteTick = (): number => {
  const [tick, setTick] = useState(0);
  const lastTickAt = useRef(0);
  useEffect(() => {
    lastTickAt.current = Date.now();
  }, []);
  useWhileTabActive(() => {
    const fire = () => {
      lastTickAt.current = Date.now();
      setTick(n => n + 1);
    };
    let timer: ReturnType<typeof setTimeout> | null = null;
    let iv: ReturnType<typeof setInterval> | null = null;
    const run = () => {
      iv = setInterval(fire, MINUTE_MS);
    };
    const now = Date.now();
    const wait = lastTickAt.current + MINUTE_MS - now;
    if (wait > 0) {
      timer = setTimeout(() => {
        timer = null;
        fire();
        run();
      }, wait);
    } else {
      fire();
      run();
    }
    return () => {
      if (timer) clearTimeout(timer);
      if (iv) clearInterval(iv);
    };
  });
  return tick;
};
