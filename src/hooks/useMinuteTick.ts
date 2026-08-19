import {useEffect, useState} from 'react';

/**
 * Re-render once a minute. Screens that print live durations (fmtDur of an
 * open front, "since" lines, friend fronting times) compute them at render and
 * otherwise freeze until something else happens to update state — the
 * "time doesn't update unless you wiggle the app" report. Call this hook in
 * any component whose displayed durations should stay current on their own.
 */
export const useMinuteTick = (): number => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 60 * 1000);
    return () => clearInterval(iv);
  }, []);
  return tick;
};
