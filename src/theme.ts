import {Platform} from 'react-native';
import type {FrontTierKey} from './utils';
import {deriveColors, profileColors, readableAccentColor, DARK_PALETTE} from './themeColors';
import type {ThemeColorSet} from './themeColors';

export {hexToRgb, initialOn, ensureReadable, textFloor, inkOn, DARK_PALETTE, LIGHT_PALETTE, BUILTIN_PALETTES, MAX_CUSTOM_PALETTES, PALETTE} from './themeColors';
export type {CustomPalette} from './themeColors';

export interface ThemeColors extends ThemeColorSet {
  textScale: number;
}

export const deriveTheme = (bg: string, accent: string, text: string, mid: string): ThemeColors => ({...deriveColors(bg, accent, text, mid), textScale: 1});

export const profileTheme = (base: ThemeColors, color: string): ThemeColors => ({...base, ...profileColors(base, color)});

export const DEFAULT_THEME: ThemeColors = deriveTheme(DARK_PALETTE.bg, DARK_PALETTE.accent, DARK_PALETTE.text, DARK_PALETTE.mid);

export const scaledFont = (textScale?: number) => (s: number) => Math.round(s * (textScale || 1));

export const fontScale = (T: ThemeColors) => scaledFont(T?.textScale);

export const tierAccent = (T: ThemeColors, tier: FrontTierKey): string => tier === 'primary' ? T.accent : tier === 'coFront' ? T.info : T.success;

export const readableAccent = (T: ThemeColors): string => readableAccentColor(T.accent, T.bg, T.text);

export const DYSLEXIC_FONT = 'OpenDyslexic';

export const Fonts = {display: DYSLEXIC_FONT};

export type FontChoice = 'default' | 'opendyslexic' | 'atkinson' | 'lexend' | 'comicneue' | 'cause' | 'gelasio' | 'anton';

const fontFam = (android: string, ios: string): string => (Platform.OS === 'android' ? android : ios);

const ATKINSON = fontFam('AtkinsonHyperlegible_400Regular', 'AtkinsonHyperlegible-Regular');
const LEXEND = fontFam('Lexend_400Regular', 'Lexend-Regular');
const COMIC_NEUE = fontFam('ComicNeue_400Regular', 'ComicNeue-Regular');
const CAUSE = fontFam('Cause_400Regular', 'Cause-Regular');
const GELASIO = fontFam('Gelasio_400Regular', 'Gelasio-Regular');
const ANTON = fontFam('Anton_400Regular', 'Anton-Regular');

export const FONT_OPTIONS: {value: FontChoice; label: string; family: string | null}[] = [
  {value: 'default', label: 'Default', family: null},
  {value: 'opendyslexic', label: 'OpenDyslexic', family: 'OpenDyslexic'},
  {value: 'atkinson', label: 'Atkinson Hyperlegible', family: ATKINSON},
  {value: 'lexend', label: 'Lexend', family: LEXEND},
  {value: 'comicneue', label: 'Comic Neue', family: COMIC_NEUE},
  {value: 'cause', label: 'Cause', family: CAUSE},
  {value: 'gelasio', label: 'Gelasio', family: GELASIO},
  {value: 'anton', label: 'Anton', family: ANTON},
];

export const fontFamilyForChoice = (c?: FontChoice): string | null =>
  FONT_OPTIONS.find(o => o.value === c)?.family ?? null;

interface FontVariants {
  regular: string;
  bold?: string;
  italic?: string;
  boldItalic?: string;
}

const FONT_VARIANTS: Record<string, FontVariants> = {
  [ATKINSON]: {
    regular: ATKINSON,
    italic: fontFam('AtkinsonHyperlegible_400Regular_Italic', 'AtkinsonHyperlegible-Italic'),
    bold: fontFam('AtkinsonHyperlegible_700Bold', 'AtkinsonHyperlegible-Bold'),
    boldItalic: fontFam('AtkinsonHyperlegible_700Bold_Italic', 'AtkinsonHyperlegible-BoldItalic'),
  },
  [COMIC_NEUE]: {
    regular: COMIC_NEUE,
    italic: fontFam('ComicNeue_400Regular_Italic', 'ComicNeue-Italic'),
    bold: fontFam('ComicNeue_700Bold', 'ComicNeue-Bold'),
    boldItalic: fontFam('ComicNeue_700Bold_Italic', 'ComicNeue-BoldItalic'),
  },
  [GELASIO]: {
    regular: GELASIO,
    italic: fontFam('Gelasio_400Regular_Italic', 'Gelasio-Italic'),
    bold: fontFam('Gelasio_700Bold', 'Gelasio-Bold'),
    boldItalic: fontFam('Gelasio_700Bold_Italic', 'Gelasio-BoldItalic'),
  },
  [LEXEND]: {
    regular: LEXEND,
    bold: fontFam('Lexend_700Bold', 'Lexend-Bold'),
  },
  [CAUSE]: {
    regular: CAUSE,
    bold: fontFam('Cause_700Bold', 'Cause-Bold'),
  },
};

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
