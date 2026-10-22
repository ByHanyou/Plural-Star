import i18n from '../i18n/i18n';
import {hhmm, parseClock} from './time';

type IntlListFormat = {format(items: string[]): string};
type IntlApi = typeof Intl & {ListFormat?: new (tag: string, options?: {style?: string; type?: string}) => IntlListFormat};

const intlApi = <K extends keyof IntlApi>(name: K): NonNullable<IntlApi[K]> | null => {
  const intl = (typeof Intl !== 'undefined' ? Intl : null) as IntlApi | null;
  const api = intl ? intl[name] : undefined;
  return typeof api === 'function' ? (api as NonNullable<IntlApi[K]>) : null;
};

const listFormatCache = new Map<string, (items: string[]) => string>();

export const listFormatter = (kind: string, options: {style?: string; type?: string}): ((items: string[]) => string) => {
  const tag = getLocale();
  const key = `${tag}|${kind}`;
  const cached = listFormatCache.get(key);
  if (cached) return cached;
  let fmt: (xs: string[]) => string = xs => xs.join(', ');
  try {
    const ListFormat = intlApi('ListFormat');
    if (ListFormat) {
      const lf = new ListFormat(tag, options);
      fmt = xs => lf.format(xs);
    }
  } catch {}
  listFormatCache.set(key, fmt);
  return fmt;
};

const LOCALE_OVERRIDES: Record<string, string> = {en: 'en-US', pt: 'pt-BR', zh: 'zh-Hans'};

let localeCache: {lang: string; tag: string} | null = null;

export const getLocale = (): string => {
  const lang = i18n.language || 'en';
  if (localeCache && localeCache.lang === lang) return localeCache.tag;
  const candidate = LOCALE_OVERRIDES[lang] || lang;
  let tag = 'en-US';
  try {
    new Date(0).toLocaleDateString(candidate);
    tag = candidate;
  } catch {
    tag = 'en-US';
  }
  localeCache = {lang, tag};
  return tag;
};

let collatorCache: {tag: string; cmp: (a: string, b: string) => number} | null = null;

const localeComparer = (): ((a: string, b: string) => number) => {
  const tag = getLocale();
  if (collatorCache && collatorCache.tag === tag) return collatorCache.cmp;
  let cmp: (a: string, b: string) => number = (a, b) => a.localeCompare(b);
  try {
    const Collator = intlApi('Collator');
    if (Collator) {
      const collator = new Collator(tag);
      cmp = (a, b) => collator.compare(a, b);
    }
  } catch {}
  collatorCache = {tag, cmp};
  return cmp;
};

export const nameCompare = (a: unknown, b: unknown): number =>
  localeComparer()(String(a ?? ''), String(b ?? ''));

let clockCache: {tag: string; hour12: boolean; am: string; pm: string} | null = null;

const clockInfo = (): {tag: string; hour12: boolean; am: string; pm: string} => {
  const tag = getLocale();
  if (clockCache && clockCache.tag === tag) return clockCache;
  let hour12 = true;
  let am = 'AM';
  let pm = 'PM';
  try {
    const DateTimeFormat = intlApi('DateTimeFormat');
    if (DateTimeFormat) {
      const resolved: {hour12?: boolean; hourCycle?: string} = new DateTimeFormat(tag, {hour: 'numeric'}).resolvedOptions();
      if (typeof resolved.hour12 === 'boolean') hour12 = resolved.hour12;
      else if (typeof resolved.hourCycle === 'string') hour12 = resolved.hourCycle === 'h11' || resolved.hourCycle === 'h12';
      const twelve = new DateTimeFormat(tag, {hour: 'numeric', hour12: true});
      if (typeof twelve.formatToParts === 'function') {
        const period = (d: Date): string | null => {
          const part = twelve.formatToParts(d).find(p => p && p.type === 'dayPeriod');
          return part && part.value ? String(part.value) : null;
        };
        const a = period(new Date(2000, 0, 1, 1, 0, 0));
        const p = period(new Date(2000, 0, 1, 13, 0, 0));
        if (a && p && a !== p) { am = a; pm = p; }
      }
    }
  } catch {}
  clockCache = {tag, hour12, am, pm};
  return clockCache;
};

export const uses12HourClock = (): boolean => clockInfo().hour12;

export const dayPeriodLabel = (isPM: boolean): string => (isPM ? clockInfo().pm : clockInfo().am);

export const fmtClock = (hours: number, minutes: number): string => {
  const d = new Date(2000, 0, 1, hours, minutes, 0);
  try {
    return dateFormatter('clock', {hour: 'numeric', minute: '2-digit'})(d);
  } catch {
    return hhmm(hours, minutes);
  }
};

export const fmtClockHHMM = (value: string): string => {
  const c = parseClock(value);
  return c ? fmtClock(c[0], c[1]) : value;
};

const dateFormatCache = new Map<string, (d: Date) => string>();

export const dateFormatter = (kind: string, options: Intl.DateTimeFormatOptions): ((d: Date) => string) => {
  const tag = getLocale();
  const key = `${tag}|${kind}`;
  const cached = dateFormatCache.get(key);
  if (cached) return cached;
  let fmt: (d: Date) => string = d => d.toLocaleString(tag, options);
  try {
    const DateTimeFormat = intlApi('DateTimeFormat');
    if (DateTimeFormat) {
      const df = new DateTimeFormat(tag, options);
      fmt = d => df.format(d);
    }
  } catch {}
  dateFormatCache.set(key, fmt);
  return fmt;
};

const numberFormatCache = new Map<string, (n: number) => string>();

const numberFormatter = (style: 'decimal' | 'percent', minFrac: number, maxFrac: number): ((n: number) => string) => {
  const tag = getLocale();
  const key = `${tag}|${style}|${minFrac}|${maxFrac}`;
  const cached = numberFormatCache.get(key);
  if (cached) return cached;
  let fmt: (n: number) => string = n => (style === 'percent' ? `${(n * 100).toFixed(maxFrac)}%` : n.toFixed(maxFrac));
  try {
    const NumberFormat = intlApi('NumberFormat');
    if (NumberFormat) {
      const nf = new NumberFormat(tag, {style, minimumFractionDigits: minFrac, maximumFractionDigits: maxFrac});
      fmt = n => nf.format(n);
    }
  } catch {}
  numberFormatCache.set(key, fmt);
  return fmt;
};

export const fmtNum = (n: number, maxFractionDigits = 1, minFractionDigits = 0): string =>
  numberFormatter('decimal', Math.min(minFractionDigits, maxFractionDigits), maxFractionDigits)(n);

export const fmtPercent = (ratio: number, maxFractionDigits = 1, minFractionDigits = 0): string =>
  numberFormatter('percent', Math.min(minFractionDigits, maxFractionDigits), maxFractionDigits)(ratio);

export const fmtTime = (ts: number): string =>
  dateFormatter('time', {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'})(new Date(ts));

export const fmtDate = (ts: number): string =>
  dateFormatter('date', {weekday: 'short', month: 'short', day: 'numeric'})(new Date(ts));

export const fmtList = (items: string[]): string => listFormatter('unit', {style: 'short', type: 'unit'})(items);

export const fmtDur = (start: number, end?: number | null): string => {
  const ms = (end ?? Date.now()) - start;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) return i18n.t('common.durDaysHours', {d: Math.floor(h / 24), h: h % 24});
  if (h > 0) return i18n.t('common.durHoursMinutes', {h, m});
  return m > 0 ? i18n.t('common.durMinutes', {m}) : i18n.t('common.durUnderMinute');
};

const SUNDAY_FIRST_LANGS = new Set(['en', 'pt', 'ja', 'ko', 'hi', 'th', 'zh-Hant', 'af']);

export const firstDayOfWeek = (): number => (SUNDAY_FIRST_LANGS.has(i18n.language || 'en') ? 0 : 1);
