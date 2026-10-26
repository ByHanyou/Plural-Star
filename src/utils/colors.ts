import type {TFunction} from 'i18next';
import {PALETTE, hexToRgb} from '../themeColors';
import {clamp} from './collections';

export const isValidHex = (hex: string): boolean =>
  /^#[0-9A-Fa-f]{6}$/.test(hex);

export const normalizeHex = (input: string): string =>
  (input.startsWith('#') ? input : `#${input}`).toUpperCase();

export const hexOr = (value: string, fallback: string): string => {
  const n = normalizeHex(value || '');
  return isValidHex(n) ? n : fallback;
};

const PALETTE_NAMES: Record<(typeof PALETTE)[number], string> = {
  '#DAA520': 'goldenrod',
  '#7B9FE8': 'periwinkle',
  '#E87BA8': 'pink',
  '#7BE8C4': 'mint',
  '#A87BE8': 'lavender',
  '#E8A87B': 'peach',
  '#6EC9A9': 'seaGreen',
  '#E87B7B': 'coral',
  '#85B4E8': 'skyBlue',
  '#C97BE8': 'orchid',
  '#B4E885': 'lime',
  '#E8C97B': 'sand',
};

const COLOR_NAMES: Record<string, string> = {
  '#FFFFFF': 'white',
  '#111111': 'black',
  '#E05B5B': 'red',
  '#E8933A': 'orange',
  '#D9B84A': 'yellow',
  '#5BBF7A': 'green',
  '#4AA8D9': 'blue',
  '#7B6BE8': 'indigo',
  '#8B5A2B': 'brown',
  '#9AA5B1': 'gray',
  '#8A94A6': 'slate',
  ...PALETTE_NAMES,
};

export const colorName = (hex: string, t: (k: string) => string): string => {
  if (!hex || typeof hex !== 'string') return '';
  const key = COLOR_NAMES[hex.toUpperCase()];
  return key ? t(`colors.${key}`) : hex;
};

const BASE_COLORS = Object.keys(COLOR_NAMES);

export type ColorSet = 'default' | 'darker' | 'pastel' | 'neon';
export const COLOR_SETS: ColorSet[] = ['default', 'darker', 'pastel', 'neon'];

export const colorHexToHsv = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let hh = 0;
  if (d !== 0) {
    if (max === r) hh = ((g - b) / d) % 6;
    else if (max === g) hh = (b - r) / d + 2;
    else hh = (r - g) / d + 4;
    hh *= 60; if (hh < 0) hh += 360;
  }
  return {h: hh, s: max === 0 ? 0 : d / max, v: max};
};

export const colorHsvToHex = (h: number, s: number, v: number) => {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) {r = c; g = x;} else if (h < 120) {r = x; g = c;} else if (h < 180) {g = c; b = x;}
  else if (h < 240) {g = x; b = c;} else if (h < 300) {r = x; b = c;} else {r = c; b = x;}
  const two = (val: number) => clamp(Math.round((val + m) * 255), 0, 255).toString(16).padStart(2, '0');
  return ('#' + two(r) + two(g) + two(b)).toUpperCase();
};

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export const mergeHsv = (prev: Hsv, next: Hsv): Hsv => ({
  h: next.s === 0 ? prev.h : next.h,
  s: next.s === 0 && next.v === 0 ? prev.s : next.s,
  v: next.v,
});

const variantHsv = (hex: string, set: ColorSet) => {
  const {h, s, v} = colorHexToHsv(hex);
  if (set === 'default') return {h, s, v};
  if (s < 0.2) {
    if (set === 'darker') return {h, s, v: clamp(v * 0.6, 0, 1)};
    if (set === 'pastel') return {h, s: s * 0.5, v: clamp(v + 0.28, 0, 1)};
    return {h, s, v: clamp(v * 1.25 + 0.02, 0, 1)};
  }
  if (set === 'darker') return {h, s: clamp(s * 1.05, 0, 1), v: clamp(v * 0.58, 0, 1)};
  if (set === 'pastel') return {h, s: s * 0.38, v: Math.max(v, 0.94)};
  return {h, s: 1, v: 1};
};

export interface PresetColor {
  hex: string;
  baseKey: string;
  set: ColorSet;
}

const buildPresetColors = (): PresetColor[] => {
  const out: PresetColor[] = [];
  const used = new Set<string>();
  for (const set of COLOR_SETS) {
    for (const baseHex of BASE_COLORS) {
      const hsv = variantHsv(baseHex, set);
      let hex = colorHsvToHex(hsv.h, hsv.s, hsv.v);
      let v = hsv.v;
      let guard = 0;
      while (used.has(hex) && guard < 24) {
        v = clamp(v - 0.04, 0, 1);
        hex = colorHsvToHex(hsv.h, hsv.s, v);
        guard++;
      }
      used.add(hex);
      out.push({hex, baseKey: COLOR_NAMES[baseHex], set});
    }
  }
  return out;
};

export const PRESET_COLORS: PresetColor[] = buildPresetColors();

export const presetColorName = (p: PresetColor, t: TFunction): string => {
  const base = t(`colors.${p.baseKey}`);
  if (p.set === 'default') return base;
  if (p.set === 'darker') return t('colors.setDarker', {name: base});
  if (p.set === 'pastel') return t('colors.setPastel', {name: base});
  return t('colors.setNeon', {name: base});
};

export const MAX_CUSTOM_COLORS = 24;

export const normalizeCustomColors = (raw: unknown): string[] => {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (let i = 0; i < MAX_CUSTOM_COLORS; i++) {
    const v = typeof list[i] === 'string' ? (list[i] as string).toUpperCase() : '';
    out.push(isValidHex(v) ? v : '');
  }
  return out;
};

export interface ColorChoice {
  hex: string;
  label: string;
}

export const colorChoices = (customColors: string[], value: string, t: TFunction): ColorChoice[] => {
  const out: ColorChoice[] = [];
  const seen = new Set<string>();
  for (const p of PRESET_COLORS) {
    out.push({hex: p.hex, label: presetColorName(p, t)});
    seen.add(p.hex);
  }
  customColors.forEach((c, i) => {
    if (!c || seen.has(c)) return;
    out.push({hex: c, label: t('colors.customSlot', {n: i + 1})});
    seen.add(c);
  });
  const cur = (value || '').toUpperCase();
  return isValidHex(cur) && !seen.has(cur) ? [{hex: cur, label: colorName(cur, t)}, ...out] : out;
};

export const DEFAULT_SLOT_COLOR = '#FF0000';

export const withCustomColor = (colors: string[], slot: number, value: string): string[] | null => {
  const hex = value ? normalizeHex(value) : '';
  if (hex && !isValidHex(hex)) return null;
  const next = normalizeCustomColors(colors);
  next[slot] = hex;
  return next;
};
