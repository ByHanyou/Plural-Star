export interface RestMode {
  enabled: boolean;
  start: string;
  end: string;
}

export const clockMinutes = (clock: unknown): number | null => {
  if (typeof clock !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)) return null;
  return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
};

export const validRestMode = (mode?: RestMode): boolean => {
  if (!mode?.enabled) return true;
  const start = clockMinutes(mode.start);
  const end = clockMinutes(mode.end);
  return start !== null && end !== null && start !== end;
};

export const isResting = (mode?: RestMode, timestamp = Date.now()): boolean => {
  if (!mode?.enabled) return false;
  // Invalid imported schedules fail closed until corrected in settings.
  if (!validRestMode(mode) || !Number.isFinite(timestamp)) return true;
  const start = clockMinutes(mode.start)!;
  const end = clockMinutes(mode.end)!;
  const date = new Date(timestamp);
  const minute = date.getHours() * 60 + date.getMinutes();
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
};

const nextClock = (clock: string, timestamp: number): number => {
  const minute = clockMinutes(clock)!;
  const date = new Date(timestamp);
  date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  if (date.getTime() <= timestamp) {
    date.setDate(date.getDate() + 1);
    date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  }
  return date.getTime();
};

export const nextRestBoundary = (mode?: RestMode, timestamp = Date.now()): number | null => {
  if (!mode?.enabled || !validRestMode(mode) || !Number.isFinite(timestamp)) return null;
  return nextClock(isResting(mode, timestamp) ? mode.end : mode.start, timestamp);
};

export const nextAllowedNotification = (mode: RestMode | undefined, timestamp: number): number | null => {
  if (!Number.isFinite(timestamp) || (mode?.enabled && !validRestMode(mode))) return null;
  return isResting(mode, timestamp) ? nextClock(mode!.end, timestamp) : timestamp;
};
