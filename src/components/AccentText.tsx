import React from 'react';
import {StyleSheet} from 'react-native';
import type {TextProps, TextStyle} from 'react-native';
import {Text} from './AppText';
import {ensureReadable} from '../theme';
import {useTheme} from '../themeContext';

type Props = Pick<TextProps, 'style' | 'numberOfLines' | 'adjustsFontSizeToFit' | 'minimumFontScale' | 'maxFontSizeMultiplier' | 'allowFontScaling' | 'accessibilityRole' | 'accessibilityElementsHidden' | 'importantForAccessibility'> & {
  children: React.ReactNode;
};

const OUTLINE_MIN_SIZE = 14;

export const AccentText = ({children, style, ...textProps}: Props) => {
  const T = useTheme();
  const flat: TextStyle = StyleSheet.flatten(style) || {};
  const fontSize = flat.fontSize ?? 12;
  const shouldOutline = T.isLight && fontSize >= OUTLINE_MIN_SIZE;

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
