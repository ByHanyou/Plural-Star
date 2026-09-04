import {useEffect, useState} from 'react';

export const useMinuteTick = (): number => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 60 * 1000);
    return () => clearInterval(iv);
  }, []);
  return tick;
};
