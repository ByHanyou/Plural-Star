import {Platform} from 'react-native';

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

export type FontChoice = 'default' | 'opendyslexic' | 'atkinson' | 'lexend' | 'comicneue' | 'cause' | 'gelasio' | 'anton';

// react-native-asset links these TTFs from src/assets/fonts. The fontFamily that
// resolves at runtime differs by platform: Android uses the file name (no
// extension), iOS uses the font's PostScript name. OpenDyslexic is the exception
// — it's also registered as a native Android res/font family, so 'OpenDyslexic'
// works directly. Using the human display name (e.g. 'Atkinson Hyperlegible')
// matches neither, which is why those fonts silently fell back to the default.
const fontFam = (android: string, ios: string): string => (Platform.OS === 'android' ? android : ios);

export const FONT_OPTIONS: {value: FontChoice; label: string; family: string | null}[] = [
  {value: 'default', label: 'Default', family: null},
  {value: 'opendyslexic', label: 'OpenDyslexic', family: 'OpenDyslexic'},
  {value: 'atkinson', label: 'Atkinson Hyperlegible', family: fontFam('AtkinsonHyperlegible_400Regular', 'AtkinsonHyperlegible-Regular')},
  {value: 'lexend', label: 'Lexend', family: fontFam('Lexend_400Regular', 'Lexend-Regular')},
  {value: 'comicneue', label: 'Comic Neue', family: fontFam('ComicNeue_400Regular', 'ComicNeue-Regular')},
  {value: 'cause', label: 'Cause', family: fontFam('Cause_400Regular', 'Cause-Regular')},
  {value: 'gelasio', label: 'Gelasio', family: fontFam('Gelasio_400Regular', 'Gelasio-Regular')},
  {value: 'anton', label: 'Anton', family: fontFam('Anton_400Regular', 'Anton-Regular')},
];

export const fontFamilyForChoice = (c?: FontChoice): string | null =>
  FONT_OPTIONS.find(o => o.value === c)?.family ?? null;

// Real bold/italic faces, keyed by the regular family that fontFamilyForChoice
// returns. Each asset font ships separate files per style, and on Android a face
// is reached by its own filename family (not by fontWeight/fontStyle on the
// regular family). Atkinson / Comic Neue / Gelasio ship all four; Lexend & Cause
// ship bold only (no italic exists); Anton is single-weight (handled by faux
// styling + the Android italic guard in AppText). OpenDyslexic is excluded — its
// native res/font family already maps weight/style.
interface FontVariants { regular: string; bold?: string; italic?: string; boldItalic?: string; }
const FONT_VARIANTS: Record<string, FontVariants> = {
  [fontFam('AtkinsonHyperlegible_400Regular', 'AtkinsonHyperlegible-Regular')]: {
    regular: fontFam('AtkinsonHyperlegible_400Regular', 'AtkinsonHyperlegible-Regular'),
    italic: fontFam('AtkinsonHyperlegible_400Regular_Italic', 'AtkinsonHyperlegible-Italic'),
    bold: fontFam('AtkinsonHyperlegible_700Bold', 'AtkinsonHyperlegible-Bold'),
    boldItalic: fontFam('AtkinsonHyperlegible_700Bold_Italic', 'AtkinsonHyperlegible-BoldItalic'),
  },
  [fontFam('ComicNeue_400Regular', 'ComicNeue-Regular')]: {
    regular: fontFam('ComicNeue_400Regular', 'ComicNeue-Regular'),
    italic: fontFam('ComicNeue_400Regular_Italic', 'ComicNeue-Italic'),
    bold: fontFam('ComicNeue_700Bold', 'ComicNeue-Bold'),
    boldItalic: fontFam('ComicNeue_700Bold_Italic', 'ComicNeue-BoldItalic'),
  },
  [fontFam('Gelasio_400Regular', 'Gelasio-Regular')]: {
    regular: fontFam('Gelasio_400Regular', 'Gelasio-Regular'),
    italic: fontFam('Gelasio_400Regular_Italic', 'Gelasio-Italic'),
    bold: fontFam('Gelasio_700Bold', 'Gelasio-Bold'),
    boldItalic: fontFam('Gelasio_700Bold_Italic', 'Gelasio-BoldItalic'),
  },
  [fontFam('Lexend_400Regular', 'Lexend-Regular')]: {
    regular: fontFam('Lexend_400Regular', 'Lexend-Regular'),
    bold: fontFam('Lexend_700Bold', 'Lexend-Bold'),
  },
  [fontFam('Cause_400Regular', 'Cause-Regular')]: {
    regular: fontFam('Cause_400Regular', 'Cause-Regular'),
    bold: fontFam('Cause_700Bold', 'Cause-Bold'),
  },
};

// Resolve the concrete face for a base family + requested bold/italic. The
// returned hasBold/hasItalic indicate whether the chosen file already bakes in
// that style (so the caller can drop the corresponding fontWeight/fontStyle and
// avoid Android double-styling / fallback).
export const resolveFontVariant = (
  family: string,
  opts: {bold?: boolean; italic?: boolean},
): {family: string; hasBold: boolean; hasItalic: boolean} => {
  const v = FONT_VARIANTS[family];
  if (!v) return {family, hasBold: false, hasItalic: false};
  const {bold, italic} = opts;
  if (bold && italic) {
    if (v.boldItalic) return {family: v.boldItalic, hasBold: true, hasItalic: true};
    if (v.bold) return {family: v.bold, hasBold: true, hasItalic: false};
    if (v.italic) return {family: v.italic, hasBold: false, hasItalic: true};
    return {family: v.regular, hasBold: false, hasItalic: false};
  }
  if (bold) return v.bold ? {family: v.bold, hasBold: true, hasItalic: false} : {family: v.regular, hasBold: false, hasItalic: false};
  if (italic) return v.italic ? {family: v.italic, hasBold: false, hasItalic: true} : {family: v.regular, hasBold: false, hasItalic: false};
  return {family: v.regular, hasBold: false, hasItalic: false};
};
