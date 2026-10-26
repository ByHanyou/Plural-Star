export const pad2 = (n: number): string => String(n).padStart(2, '0');

export const hhmm = (h: number, m: number): string => `${pad2(h)}:${pad2(m)}`;

export const fmtCountdown = (until: number | null, now = Date.now()): string => {
  const s = Math.ceil(Math.max(0, (until ?? now) - now) / 1000);
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
};

export const localDateKey = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const localDateTimeValue = (d: Date): string => `${localDateKey(d)}T${hhmm(d.getHours(), d.getMinutes())}`;

export const DAY_MS = 86400000;

export const daysInMonth = (year: number, monthZeroIndexed: number): number =>
  new Date(year, monthZeroIndexed + 1, 0).getDate();

export const isValidTimeHHMM = (v: string): boolean =>
  /^([01]?\d|2[0-3]):[0-5]\d$/.test(v.trim());

export const time12to24 = (raw: string, ampm: 'AM' | 'PM'): string | null => {
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec((raw || '').trim());
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (h < 1 || h > 12 || min < 0 || min > 59) return null;
  if (ampm === 'AM') { if (h === 12) h = 0; } else { if (h !== 12) h += 12; }
  return hhmm(h, min);
};

export const parseClock = (value: unknown): [number, number] | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
};

export const parseTime24 = (raw: string): string | null => {
  const c = parseClock(raw);
  return !c || c[0] > 23 || c[1] > 59 ? null : hhmm(c[0], c[1]);
};
