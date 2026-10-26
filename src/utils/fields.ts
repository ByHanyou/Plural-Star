import type {CustomFieldType, CustomFieldValue, Member} from '../model/types';
import {asRecord} from './collections';
import {dateFormatter, getLocale} from './intl';
import {localDateTimeValue, pad2} from './time';

const fieldDateOf = (y: number, m: number, d: number, h = 0, min = 0): Date | null => {
  const dt = new Date(y, m - 1, d, h, min, 0, 0);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
};

export const parseFieldDate = (val: unknown): Date | null => {
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return null;
    if (Number.isInteger(val) && val >= 1000 && val <= 9999) return new Date(val, 0, 1);
    return new Date(val);
  }
  if (typeof val !== 'string') return null;
  const s = val.trim();
  if (!s) return null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})$/.exec(s))) return fieldDateOf(+m[1], 1, 1);
  if ((m = /^(\d{4})-(\d{1,2})$/.exec(s))) return fieldDateOf(+m[1], +m[2], 1);
  if ((m = /^(\d{1,2})-(\d{1,2})$/.exec(s))) return fieldDateOf(2000, +m[1], +m[2]);
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/.exec(s))) {
    return fieldDateOf(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  }
  if ((m = /^(\d{4})-(\d{2})-(\d{2})T00:00(?::00(?:\.0+)?)?Z$/.exec(s))) return fieldDateOf(+m[1], +m[2], +m[3]);
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFieldDate(Number(s));
  const parsed = Date.parse(s);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
};

export const encodeFieldDate = (type: CustomFieldType, d: Date): string | number => {
  const y = d.getFullYear();
  const mo = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  switch (type) {
    case 'year': return String(y);
    case 'month':
    case 'monthYear': return `${y}-${mo}`;
    case 'monthDay': return `${mo}-${day}`;
    case 'timestamp': return d.getTime();
    default: return `${y}-${mo}-${day}`;
  }
};

export const parseFieldRange = (val: unknown): {start: Date; end: Date} | null => {
  if (typeof val !== 'string' || !val.trim()) return null;
  const s = val.trim();
  if (s.startsWith('{')) {
    try {
      const parsed = asRecord(JSON.parse(s));
      const start = parseFieldDate(parsed?.start);
      const end = parseFieldDate(parsed?.end);
      return start && end ? {start, end} : null;
    } catch {
      return null;
    }
  }
  const [a, b] = s.split('|');
  const start = parseFieldDate(a);
  const end = parseFieldDate(b);
  const first = start ?? end;
  const last = end ?? start;
  return first && last ? {start: first, end: last} : null;
};

export const encodeFieldRange = (start: Date, end: Date): string =>
  `${encodeFieldDate('date', start)}|${encodeFieldDate('date', end)}`;

export const fieldInputValue = (type: CustomFieldType, val: unknown): string => {
  if (val === null || val === undefined || val === '') return '';
  const d = parseFieldDate(val);
  if (!d) return typeof val === 'string' ? val : '';
  if (type === 'timestamp') return localDateTimeValue(d);
  return String(encodeFieldDate(type, d));
};

export const fieldRangeInput = (val: unknown): [string, string] => {
  const s = typeof val === 'string' ? val.trim() : '';
  if (!s) return ['', ''];
  if (!s.startsWith('{')) {
    const [a = '', b = ''] = s.split('|');
    return [fieldInputValue('date', a), fieldInputValue('date', b)];
  }
  const r = parseFieldRange(s);
  return r ? [fieldInputValue('date', r.start), fieldInputValue('date', r.end)] : ['', ''];
};

export const fmtFieldValue = (type: CustomFieldType, val: unknown): string => {
  const raw = String(val ?? '');
  try {
    if (type === 'dateRange') {
      const r = parseFieldRange(val);
      return r ? `${fmtFieldValue('date', r.start)} – ${fmtFieldValue('date', r.end)}` : raw;
    }
    if (type === 'date' || type === 'timestamp' || type === 'month' || type === 'monthYear' || type === 'year' || type === 'monthDay') {
      const d = parseFieldDate(val);
      if (!d) return raw;
      if (type === 'date') return dateFormatter('fieldDate', {year: 'numeric', month: 'short', day: 'numeric'})(d);
      if (type === 'timestamp') return dateFormatter('fieldTimestamp', {year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'})(d);
      if (type === 'year') return String(d.getFullYear());
      if (type === 'month') return dateFormatter('fieldMonth', {month: 'long'})(d);
      if (type === 'monthYear') return dateFormatter('fieldMonthYear', {month: 'long', year: 'numeric'})(d);
      return dateFormatter('fieldMonthDay', {month: 'long', day: 'numeric'})(d);
    } else if (type === 'number') {
      const n = Number(raw);
      if (raw.trim() !== '' && Number.isFinite(n)) return new Intl.NumberFormat(getLocale(), {useGrouping: false, maximumFractionDigits: 10}).format(n);
    }
  } catch {}
  return raw;
};

export const CUSTOM_FIELD_TYPES: CustomFieldType[] = [
  'text', 'markdown', 'image', 'color', 'date', 'month', 'year', 'monthYear',
  'timestamp', 'monthDay', 'dateRange', 'number', 'toggle',
];

export const asCustomFieldType = (v: unknown): CustomFieldType => CUSTOM_FIELD_TYPES.find(x => x === v) || 'text';

export const customFieldTypeKey = (type: CustomFieldType): string => `customFields.type${type.charAt(0).toUpperCase()}${type.slice(1)}`;

export const stripCustomField = (members: Member[], fieldId: string): Member[] | null => {
  let changed = false;
  const next = members.map(m => {
    if (!(m.customFields || []).some(v => v.fieldId === fieldId)) return m;
    changed = true;
    return {...m, customFields: (m.customFields || []).filter(v => v.fieldId !== fieldId)};
  });
  return changed ? next : null;
};

export const withFieldValue = (values: CustomFieldValue[] | undefined, fieldId: string, value: CustomFieldValue['value']): CustomFieldValue[] => {
  const existing = values || [];
  return existing.some(v => v.fieldId === fieldId)
    ? existing.map(v => (v.fieldId === fieldId ? {...v, value} : v))
    : [...existing, {fieldId, value}];
};
