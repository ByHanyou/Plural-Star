import React from 'react';
import {Text as RNText, TextInput as RNTextInput, TextProps, TextInputProps, StyleSheet, Platform} from 'react-native';
import type {StyleProp, TextStyle} from 'react-native';
import {DYSLEXIC_FONT, resolveFontVariant} from '../theme';

let _family: string | null = null;
export const setAppTextFont = (family: string | null) => { _family = family; };

const DYSLEXIC_SCALE = 0.88;

const applyDyslexicScale = (style: StyleProp<TextStyle>): StyleProp<TextStyle> => {
  const flat = StyleSheet.flatten(style);
  if (flat && typeof flat.fontSize === 'number') {
    return {...flat, fontSize: Math.round(flat.fontSize * DYSLEXIC_SCALE)};
  }
  return style;
};

const isMono = (style: StyleProp<TextStyle>): boolean => {
  const flat = StyleSheet.flatten(style);
  return !!flat && flat.fontFamily === 'monospace';
};

const isBoldWeight = (w: TextStyle['fontWeight'] | undefined): boolean => w === 'bold' || (w != null && Number(w) >= 600);

const androidTailPad = (out: TextStyle | undefined): TextStyle | undefined => {
  if (Platform.OS !== 'android' || !out) return out;
  let pad = 0;
  if (isBoldWeight(out.fontWeight)) pad += 3;
  if (typeof out.letterSpacing === 'number' && out.letterSpacing > 0) pad += Math.ceil(out.letterSpacing);
  if (!pad) return out;
  return {...out, paddingRight: (typeof out.paddingRight === 'number' ? out.paddingRight : 0) + pad};
};

const defaultStyle = (style: StyleProp<TextStyle>): StyleProp<TextStyle> => {
  const flat = StyleSheet.flatten(style);
  if (!flat) return style;
  const out: TextStyle = {...flat};
  if (out.fontFamily === DYSLEXIC_FONT) delete out.fontFamily;
  return androidTailPad(out);
};

const buildCustomStyle = (style: StyleProp<TextStyle>, family: string): StyleProp<TextStyle> => {
  if (isMono(style)) return style;
  const flat: TextStyle = StyleSheet.flatten(style) || {};
  const wantBold = isBoldWeight(flat.fontWeight);
  const wantItalic = flat.fontStyle === 'italic';
  const {family: face, hasBold, hasItalic} = resolveFontVariant(family, {bold: wantBold, italic: wantItalic});
  const next: TextStyle = {...flat, fontFamily: face};
  if (hasBold) delete next.fontWeight;
  if (hasItalic || (Platform.OS === 'android' && wantItalic && !hasItalic)) delete next.fontStyle;
  return androidTailPad(next);
};

const appStyle = (style: StyleProp<TextStyle>): StyleProp<TextStyle> => {
  if (!_family) return defaultStyle(style);
  if (_family === DYSLEXIC_FONT) {
    const styled = androidTailPad(StyleSheet.flatten(applyDyslexicScale(style)));
    return isMono(style) ? styled : [styled, {fontFamily: _family}];
  }
  return buildCustomStyle(style, _family);
};

export const Text = React.forwardRef<RNText, TextProps>(({style, ...rest}, ref) => <RNText ref={ref} style={appStyle(style)} {...rest} />);

export const TextInput = React.forwardRef<RNTextInput, TextInputProps>(({style, ...rest}, ref) => <RNTextInput ref={ref} style={appStyle(style)} {...rest} />);
