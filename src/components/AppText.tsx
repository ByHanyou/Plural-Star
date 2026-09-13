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

// Android under-measures text width in two ways that clip the last glyph, and
// both get worse as the text scale goes up. Synthetic bold overhangs the box it
// was measured in, and letterSpacing is applied after the final character
// without being counted in the width. The default-font path has compensated for
// bold since the Oppo/OnePlus cut-off reports; the custom-font and dyslexic
// paths never did, and nothing anywhere compensated for letterSpacing, which is
// why uppercase letter-spaced labels (the tab bar, section headers) lost their
// last letter at large text sizes.
const androidTailPad = (out: any): any => {
  if (Platform.OS !== 'android' || !out) return out;
  let pad = 0;
  if (isBoldWeight(out.fontWeight)) pad += 3;
  if (typeof out.letterSpacing === 'number' && out.letterSpacing > 0) pad += Math.ceil(out.letterSpacing);
  if (!pad) return out;
  return {...out, paddingRight: (typeof out.paddingRight === 'number' ? out.paddingRight : 0) + pad};
};

const defaultStyle = (style: any): any => {
  const flat: any = StyleSheet.flatten(style);
  if (!flat) return style;
  const out: any = {...flat};
  if (out.fontFamily === DYSLEXIC_FONT) delete out.fontFamily;
  return androidTailPad(out);
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
  // After the deletes: a font with a real bold face is not synthesised, so it
  // needs no bold padding, and androidTailPad sees that from the dropped weight.
  return androidTailPad(next);
};

export const Text = React.forwardRef<RNText, TextProps>((props, ref) => {
  const {style, ...rest} = props;
  if (!_family) return <RNText ref={ref} style={defaultStyle(style)} {...rest} />;
  if (_family === DYSLEXIC_FONT) {
    const styled = androidTailPad(StyleSheet.flatten(applyDyslexicScale(style)));
    return <RNText ref={ref} style={isMono(style) ? styled : [styled, {fontFamily: _family}]} {...rest} />;
  }
  return <RNText ref={ref} style={buildCustomStyle(style, _family)} {...rest} />;
});

export const TextInput = React.forwardRef<RNTextInput, TextInputProps>((props, ref) => {
  const {style, ...rest} = props;
  if (!_family) return <RNTextInput ref={ref} style={defaultStyle(style)} {...rest} />;
  if (_family === DYSLEXIC_FONT) {
    const styled = androidTailPad(StyleSheet.flatten(applyDyslexicScale(style)));
    return <RNTextInput ref={ref} style={isMono(style) ? styled : [styled, {fontFamily: _family}]} {...rest} />;
  }
  return <RNTextInput ref={ref} style={buildCustomStyle(style, _family)} {...rest} />;
});
