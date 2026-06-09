import React from 'react';
import {Text as RNText, TextInput as RNTextInput, TextProps, TextInputProps, StyleSheet, Platform} from 'react-native';
import {DYSLEXIC_FONT, resolveFontVariant} from '../theme';

let _family: string | null = null;
export const setAppTextFont = (family: string | null) => { _family = family; };
export const getAppTextFont = () => _family;
export const setAppTextDyslexicEnabled = (on: boolean) => { _family = on ? DYSLEXIC_FONT : null; };
export const isAppTextDyslexicEnabled = () => _family === DYSLEXIC_FONT;

const DYSLEXIC_SCALE = 0.88;

const stripDyslexicFont = (style: any): any => {
  const flat: any = StyleSheet.flatten(style);
  if (flat && flat.fontFamily === DYSLEXIC_FONT) {
    const {fontFamily: _drop, ...rest} = flat;
    return rest;
  }
  return style;
};

const applyDyslexicScale = (style: any): any => {
  const flat: any = StyleSheet.flatten(style);
  if (flat && typeof flat.fontSize === 'number') {
    return {...flat, fontSize: Math.round(flat.fontSize * DYSLEXIC_SCALE)};
  }
  return style;
};

const isMono =(style: any): boolean => {
  const flat: any = StyleSheet.flatten(style);
  return !!flat && flat.fontFamily === 'monospace';
};

const isBoldWeight = (w: any): boolean => w === 'bold' || (w != null && Number(w) >= 600);

const defaultStyle = (style: any): any => {
  const flat: any = StyleSheet.flatten(style);
  if (!flat) return style;
  const out: any = {...flat};
  if (out.fontFamily === DYSLEXIC_FONT) delete out.fontFamily;
  if (Platform.OS === 'android' && isBoldWeight(out.fontWeight)) {
    out.paddingRight = (typeof out.paddingRight === 'number' ? out.paddingRight : 0) + 3;
  }
  return out;
};

const buildCustomStyle =(style: any, family: string): any => {
  if (isMono(style)) return style;
  const flat: any = StyleSheet.flatten(style) || {};
  const wantBold = isBoldWeight(flat.fontWeight);
  const wantItalic = flat.fontStyle === 'italic';
  const {family: face, hasBold, hasItalic} = resolveFontVariant(family, {bold: wantBold, italic: wantItalic});
  const next: any = {...flat, fontFamily: face};
  if (hasBold) delete next.fontWeight;
  if (hasItalic || (Platform.OS === 'android' && wantItalic && !hasItalic)) delete next.fontStyle;
  return next;
};

export const Text = React.forwardRef<RNText, TextProps>((props, ref) => {
  const {style, ...rest} = props;
  if (!_family) return <RNText ref={ref} style={defaultStyle(style)} {...rest} />;
  if (_family === DYSLEXIC_FONT) {
    const styled = applyDyslexicScale(style);
    return <RNText ref={ref} style={isMono(style) ? styled : [styled, {fontFamily: _family}]} {...rest} />;
  }
  return <RNText ref={ref} style={buildCustomStyle(style, _family)} {...rest} />;
});

export const TextInput = React.forwardRef<RNTextInput, TextInputProps>((props, ref) => {
  const {style, ...rest} = props;
  if (!_family) return <RNTextInput ref={ref} style={defaultStyle(style)} {...rest} />;
  if (_family === DYSLEXIC_FONT) {
    const styled = applyDyslexicScale(style);
    return <RNTextInput ref={ref} style={isMono(style) ? styled : [styled, {fontFamily: _family}]} {...rest} />;
  }
  return <RNTextInput ref={ref} style={buildCustomStyle(style, _family)} {...rest} />;
});
