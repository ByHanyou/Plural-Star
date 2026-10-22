export interface ThemeColorSet {
  bg: string;
  surface: string;
  card: string;
  border: string;
  borderLt: string;
  accent: string;
  accentBg: string;
  text: string;
  dim: string;
  muted: string;
  toggleOff: string;
  danger: string;
  dangerBg: string;
  success: string;
  successBg: string;
  info: string;
  infoBg: string;
  isLight: boolean;
}

export interface CustomPalette {
  id: string;
  name: string;
  bg: string;
  accent: string;
  text: string;
  mid: string;
}

export const hexToRgb = (hex: string): [number, number, number] => {
  const raw = String(hex ?? '').replace('#', '');
  const h = (raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw).padEnd(6, '0');
  const n = (s: string) => { const v = parseInt(s, 16); return Number.isFinite(v) ? v : 0; };
  return [n(h.slice(0, 2)), n(h.slice(2, 4)), n(h.slice(4, 6))];
};

export const rgbToHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

export const mix = (c1: string, c2: string, t: number): string => {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
};

const luminance = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

export const initialOn = (bg: string): string =>
  luminance(bg) > 0.35 ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.92)';

export const contrastRatio = (hexA: string, hexB: string): number => {
  const lum = (hex: string): number => {
    const chan = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const [r, g, b] = hexToRgb(hex);
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  };
  const la = lum(hexA);
  const lb = lum(hexB);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
};

export const ensureReadable = (color: string, bg: string, min: number): string => {
  if (contrastRatio(color, bg) >= min) return color;
  const preferred = luminance(color) <= luminance(bg) ? '#000000' : '#FFFFFF';
  const other = preferred === '#000000' ? '#FFFFFF' : '#000000';
  const pole = contrastRatio(preferred, bg) >= min
    ? preferred
    : contrastRatio(other, bg) >= min
      ? other
      : (contrastRatio(preferred, bg) >= contrastRatio(other, bg) ? preferred : other);
  if (contrastRatio(pole, bg) < min) return pole;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 8; i++) {
    const t = (lo + hi) / 2;
    if (contrastRatio(mix(color, pole, t), bg) >= min) hi = t;
    else lo = t;
  }
  return mix(color, pole, hi);
};

export const textFloor = (bg: string): number =>
  Math.max(contrastRatio('#000000', bg), contrastRatio('#FFFFFF', bg)) >= 7 ? 4.5 : 3;

export const inkOn = (bg: string): string =>
  contrastRatio('#000000', bg) >= contrastRatio('#FFFFFF', bg) ? '#000000' : '#FFFFFF';

export const readableAccentColor = (accent: string, bg: string, text: string): string =>
  contrastRatio(accent, bg) >= 3 ? accent : text;

export const deriveColors = (bg: string, accent: string, text: string, mid: string): ThemeColorSet => {
  const isLight = luminance(bg) > 0.3;
  const floor = textFloor(bg);
  const effText = ensureReadable(text, bg, floor);
  const danger = '#d9534f';
  const success = isLight ? '#2e7a5a' : '#4caf8a';
  const info = isLight ? '#2a5aaa' : '#7B9FE8';
  const opacity = isLight ? 0.15 : 0.12;
  return {
    bg,
    surface: mix(bg, mid, isLight ? 0.04 : 0.08),
    card: mix(bg, mid, isLight ? 0.07 : 0.14),
    border: mix(bg, mid, isLight ? 0.12 : 0.20),
    borderLt: mix(bg, mid, isLight ? 0.18 : 0.30),
    accent,
    accentBg: mix(bg, accent, 0.12),
    text: effText,
    dim: ensureReadable(mix(effText, mid, 0.12), bg, floor),
    muted: ensureReadable(mix(effText, mid, 0.30), bg, 3),
    toggleOff: mix(bg, mid, 0.22),
    danger,
    dangerBg: mix(bg, danger, opacity),
    success,
    successBg: mix(bg, success, opacity),
    info,
    infoBg: mix(bg, info, opacity),
    isLight,
  };
};

export const profileColors = (base: Pick<ThemeColorSet, 'accent' | 'danger' | 'success' | 'info'>, color: string): ThemeColorSet => {
  const ink = inkOn(color);
  const surface = mix(color, ink === '#000000' ? '#FFFFFF' : '#000000', 0.18);
  const readable = (c: string, min: number) => ensureReadable(ensureReadable(c, surface, min), color, min);
  return {
    bg: color,
    surface,
    card: color,
    border: mix(color, ink, 0.3),
    borderLt: mix(color, ink, 0.4),
    accent: readable(base.accent, 4.5),
    accentBg: surface,
    text: ink,
    dim: readable(mix(ink, color, 0.2), 4.5),
    muted: readable(mix(ink, color, 0.35), 3),
    toggleOff: mix(color, ink, 0.35),
    danger: readable(base.danger, 4.5),
    dangerBg: surface,
    success: readable(base.success, 4.5),
    successBg: surface,
    info: readable(base.info, 4.5),
    infoBg: surface,
    isLight: ink === '#000000',
  };
};

export const DARK_PALETTE: CustomPalette = {
  id: '__dark__',
  name: 'Obsidian',
  bg: '#0A1F2E',
  accent: '#DAA520',
  text: '#C0C0C0',
  mid: '#7A8A99',
};

export const LIGHT_PALETTE: CustomPalette = {
  id: '__light__',
  name: 'Steel',
  bg: '#7A8A99',
  accent: '#DAA520',
  text: '#0A1F2E',
  mid: '#C0C0C0',
};

export const BUILTIN_PALETTES: CustomPalette[] = [DARK_PALETTE, LIGHT_PALETTE];

export const MAX_CUSTOM_PALETTES = 20;

export const PALETTE = [
  '#DAA520', '#7B9FE8', '#E87BA8', '#7BE8C4',
  '#A87BE8', '#E8A87B', '#6EC9A9', '#E87B7B',
  '#85B4E8', '#C97BE8', '#B4E885', '#E8C97B',
] as const;
