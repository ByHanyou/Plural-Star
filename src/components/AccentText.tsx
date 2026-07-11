import React from 'react';
import {View, StyleSheet} from 'react-native';
import {Text} from './AppText';
import type {ThemeColors} from '../theme';

interface Props {
  children: React.ReactNode;
  style?: any;
  T: ThemeColors;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
  maxFontSizeMultiplier?: number;
  allowFontScaling?: boolean;
  accessibilityRole?: any;
}

const OFFSETS = [[-1,-1],[1,-1],[-1,1],[1,1]];
const OUTLINE_MIN_SIZE = 14;

export const AccentText = ({children, style, T, numberOfLines, adjustsFontSizeToFit, minimumFontScale, maxFontSizeMultiplier, allowFontScaling, accessibilityRole}: Props) => {
  const fontSize = StyleSheet.flatten(style)?.fontSize ?? 12;
  const shouldOutline = T.isLight && fontSize >= OUTLINE_MIN_SIZE;
  const textProps = {numberOfLines, adjustsFontSizeToFit, minimumFontScale, maxFontSizeMultiplier, allowFontScaling, accessibilityRole};

  if (!shouldOutline) {
    return <Text style={style} {...textProps}>{children}</Text>;
  }

  return (
    <View style={[s.wrap, style && {width: undefined, height: undefined}]}>
      {OFFSETS.map(([dx, dy], i) => (
        <Text key={i} style={[style, s.abs, {color: '#0A1F2E', left: dx, top: dy}]} {...textProps}>
          {children}
        </Text>
      ))}
      <Text style={[style, {color: 'transparent'}]} {...textProps}>{children}</Text>
      <Text style={[style, s.abs, {top: 0, left: 0}]} {...textProps}>{children}</Text>
    </View>
  );
};

const s = StyleSheet.create({
  wrap: {position: 'relative'},
  abs: {position: 'absolute'},
});
