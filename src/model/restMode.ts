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
  if (!Number.isFinite(date.getTime())) return true;
  const minute = date.getHours() * 60 + date.getMinutes();
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
};

const nextClock = (clock: string, timestamp: number): number => {
  const minute = clockMinutes(clock)!;
  const date = new Date(timestamp);
  date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  if (date.getTime() <= timestamp) {
    // setHours chooses the first occurrence when the local clock repeats.
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const repeated = new Date(date.getTime() + (tomorrow.getTimezoneOffset() - date.getTimezoneOffset()) * 60000);
    if (repeated.getTime() > timestamp && repeated.toDateString() === date.toDateString()
      && repeated.getHours() === date.getHours() && repeated.getMinutes() === date.getMinutes()) {
      return repeated.getTime();
    }
    date.setDate(date.getDate() + 1);
    date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  }
  return date.getTime();
};

export const nextRestBoundary = (mode?: RestMode, timestamp = Date.now()): number | null => {
  if (!mode?.enabled || !validRestMode(mode) || !Number.isFinite(timestamp)) return null;
  const resting = isResting(mode, timestamp);
  let cursor = timestamp;
  // A daily window can disappear on a clock-jump day; also examine the following dates.
  const limit = timestamp + 3 * 86400000;
  while (cursor < limit) {
    let boundary = nextClock(resting ? mode.end : mode.start, cursor);
    if (!Number.isFinite(boundary) || boundary <= cursor) return null;
    const offset = new Date(cursor).getTimezoneOffset();
    if (new Date(boundary).getTimezoneOffset() !== offset) {
      let before = cursor;
      let after = boundary;
      while (after - before > 1) {
        const middle = before + Math.floor((after - before) / 2);
        if (new Date(middle).getTimezoneOffset() === offset) before = middle;
        else after = middle;
      }
      // A skipped or repeated hour can change rest state before the clock boundary.
      if (isResting(mode, after) !== resting) boundary = after;
    }
    if (isResting(mode, boundary) !== resting) return boundary;
    cursor = boundary;
  }
  return null;
};

export const nextAllowedNotification = (mode: RestMode | undefined, timestamp: number): number | null => {
  if (!Number.isFinite(new Date(timestamp).getTime()) || (mode?.enabled && !validRestMode(mode))) return null;
  return isResting(mode, timestamp) ? nextRestBoundary(mode, timestamp) : timestamp;
};
