import React from 'react';
import {Text as RNText, TextInput as RNTextInput, TextProps, TextInputProps, StyleSheet} from 'react-native';
import {DYSLEXIC_FONT} from '../theme';

let _enabled = false;
export const setAppTextDyslexicEnabled = (on: boolean) => { _enabled = on; };
export const isAppTextDyslexicEnabled = () => _enabled;

const DYSLEXIC_SCALE = 0.88;
const baseStyle = {fontFamily: DYSLEXIC_FONT};

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

export const Text = React.forwardRef<RNText, TextProps>((props, ref) => {
  const {style, ...rest} = props;
  if (!_enabled) return <RNText ref={ref} style={stripDyslexicFont(style)} {...rest} />;
  return <RNText ref={ref} style={[baseStyle, applyDyslexicScale(style)]} {...rest} />;
});

export const TextInput = React.forwardRef<RNTextInput, TextInputProps>((props, ref) => {
  const {style, ...rest} = props;
  if (!_enabled) return <RNTextInput ref={ref} style={stripDyslexicFont(style)} {...rest} />;
  return <RNTextInput ref={ref} style={[baseStyle, applyDyslexicScale(style)]} {...rest} />;
});
