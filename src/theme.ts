export interface ThemeColors {
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
  textScale: number;
}

export interface CustomPalette {
  id: string;
  name: string;
  bg: string;
  accent: string;
  text: string;
  mid: string;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

const rgbToHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

const mix = (c1: string, c2: string, t: number): string => {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
};

const luminance = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

export const deriveTheme = (bg: string, accent: string, text: string, mid: string): ThemeColors => {
  const lum = luminance(bg);
  const isLight = lum > 0.3;

  const surfaceT = isLight ? 0.04 : 0.08;
  const cardT = isLight ? 0.07 : 0.14;
  const borderT = isLight ? 0.12 : 0.20;
  const borderLtT = isLight ? 0.18 : 0.30;

  const surface = mix(bg, mid, surfaceT);
  const card = mix(bg, mid, cardT);
  const border = mix(bg, mid, borderT);
  const borderLt = mix(bg, mid, borderLtT);

  const dim = mix(text, mid, 0.12);
  const muted = mix(text, mid, 0.30);
  const toggleOff = mix(bg, mid, 0.22);

  const accentRgb = hexToRgb(accent);
  const bgRgb = hexToRgb(bg);
  const accentBg = rgbToHex(
    bgRgb[0] + (accentRgb[0] - bgRgb[0]) * 0.12,
    bgRgb[1] + (accentRgb[1] - bgRgb[1]) * 0.12,
    bgRgb[2] + (accentRgb[2] - bgRgb[2]) * 0.12,
  );

  const dangerBase = '#d9534f';
  const successBase = isLight ? '#2e7a5a' : '#4caf8a';
  const infoBase = isLight ? '#2a5aaa' : '#7B9FE8';

  const dangerBgRgb = hexToRgb(dangerBase);
  const successBgRgb = hexToRgb(successBase);
  const infoBgRgb = hexToRgb(infoBase);
  const opacity = isLight ? 0.15 : 0.12;

  return {
    bg,
    surface,
    card,
    border,
    borderLt,
    accent,
    accentBg,
    text,
    dim,
    muted,
    toggleOff,
    danger: dangerBase,
    dangerBg: rgbToHex(
      bgRgb[0] + (dangerBgRgb[0] - bgRgb[0]) * opacity,
      bgRgb[1] + (dangerBgRgb[1] - bgRgb[1]) * opacity,
      bgRgb[2] + (dangerBgRgb[2] - bgRgb[2]) * opacity,
    ),
    success: successBase,
    successBg: rgbToHex(
      bgRgb[0] + (successBgRgb[0] - bgRgb[0]) * opacity,
      bgRgb[1] + (successBgRgb[1] - bgRgb[1]) * opacity,
      bgRgb[2] + (successBgRgb[2] - bgRgb[2]) * opacity,
    ),
    info: infoBase,
    infoBg: rgbToHex(
      bgRgb[0] + (infoBgRgb[0] - bgRgb[0]) * opacity,
      bgRgb[1] + (infoBgRgb[1] - bgRgb[1]) * opacity,
      bgRgb[2] + (infoBgRgb[2] - bgRgb[2]) * opacity,
    ),
    isLight,
    textScale: 1,
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

export const T: ThemeColors = deriveTheme(DARK_PALETTE.bg, DARK_PALETTE.accent, DARK_PALETTE.text, DARK_PALETTE.mid);

export const BUILTIN_PALETTES: CustomPalette[] = [DARK_PALETTE, LIGHT_PALETTE];

export const PALETTE = [
  '#DAA520', '#7B9FE8', '#E87BA8', '#7BE8C4',
  '#A87BE8', '#E8A87B', '#6EC9A9', '#E87B7B',
  '#85B4E8', '#C97BE8', '#B4E885', '#E8C97B',
];

export const DYSLEXIC_FONT = 'OpenDyslexic';

export const Fonts = {
  display: 'OpenDyslexic',
  body: 'System',
  mono: 'monospace',
};
