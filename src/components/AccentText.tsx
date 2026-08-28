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
  // Set when a parent already carries the label, so the text does not read out
  // a second time under it (the header title inside its profile button).
  accessibilityElementsHidden?: boolean;
  importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
}

const OUTLINE_MIN_SIZE = 14;
const OUTLINE_COLOR = '#0A1F2E';

/**
 * Light-theme legibility for accent-coloured text. This USED TO stack six
 * copies of the children (four offset outline layers, a transparent sizer, the
 * real one), which broke two ways in light themes only:
 *   - emoji and other colour glyphs ignore both `color` and 'transparent', so
 *     every icon rendered SIX times, offset — the duplicated tab icons.
 *   - the real layer was position:absolute inside a wrapper sized by the
 *     transparent layer, so a constrained parent could collapse or clip it,
 *     and a low-contrast accent left only the dark ghosts — the missing name.
 * One Text with a text shadow keeps the outlined look with a single render, and
 * the colour is clamped to the large-text floor so it can never vanish into a
 * light background.
 */
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
      style={[style, {
        color: ensureReadable(chosen, T.bg, 3),
        textShadowColor: OUTLINE_COLOR,
        textShadowOffset: {width: 0, height: 0},
        textShadowRadius: 1.5,
      }]}
      {...textProps}>
      {children}
    </Text>
  );
};
