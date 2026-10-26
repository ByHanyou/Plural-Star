import React from 'react';
import {View, TouchableOpacity} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {useTheme} from '../themeContext';

const PILL = {
  regular: {w: 40, h: 22, knob: 16, onLeft: 20},
  large: {w: 44, h: 26, knob: 20, onLeft: 21},
};

export const TogglePill = ({on, large = false}: {on: boolean; large?: boolean}) => {
  const T = useTheme();
  const p = large ? PILL.large : PILL.regular;
  return (
    <View style={{width: p.w, height: p.h, borderRadius: p.h / 2, backgroundColor: on ? T.accent : T.toggleOff, justifyContent: 'center'}}>
      <View style={{width: p.knob, height: p.knob, borderRadius: p.knob / 2, backgroundColor: '#fff', position: 'absolute', left: on ? p.onLeft : 3}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
    </View>
  );
};

export const ToggleSwitch = ({value, onToggle, label, disabled = false, activeOpacity = 0.8, style}: {value: boolean; onToggle?: () => void; label?: string; disabled?: boolean; activeOpacity?: number; style?: StyleProp<ViewStyle>}) => (
  <TouchableOpacity onPress={onToggle} activeOpacity={activeOpacity} disabled={disabled}
    accessibilityRole="switch" accessibilityState={{checked: value, disabled}} accessibilityLabel={label}
    hitSlop={{top: 11, bottom: 11, left: 4, right: 4}}
    style={[disabled ? {opacity: 0.4} : null, style]}>
    <TogglePill on={value} />
  </TouchableOpacity>
);
