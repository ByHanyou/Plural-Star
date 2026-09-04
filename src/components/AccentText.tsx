import React from 'react';
import {StyleSheet} from 'react-native';
import {Text} from './AppText';
import {ensureReadable} from '../theme';
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
  accessibilityElementsHidden?: boolean;
  importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
}

const OUTLINE_MIN_SIZE = 14;

export const AccentText = ({children, style, T, numberOfLines, adjustsFontSizeToFit, minimumFontScale, maxFontSizeMultiplier, allowFontScaling, accessibilityRole, accessibilityElementsHidden, importantForAccessibility}: Props) => {
  const flat = StyleSheet.flatten(style) || ({} as any);
  const fontSize = flat.fontSize ?? 12;
  const shouldOutline = T.isLight && fontSize >= OUTLINE_MIN_SIZE;
  const textProps = {numberOfLines, adjustsFontSizeToFit, minimumFontScale, maxFontSizeMultiplier, allowFontScaling, accessibilityRole, accessibilityElementsHidden, importantForAccessibility};

  if (!shouldOutline) {
    return <Text style={style} {...textProps}>{children}</Text>;
  }

  const chosen = typeof flat.color === 'string' ? flat.color : T.text;
  return (
    <Text
      style={[style, {color: ensureReadable(chosen, T.bg, 3)}]}
      {...textProps}>
      {children}
    </Text>
  );
};
