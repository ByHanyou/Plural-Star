import React from 'react';
import {View, TouchableOpacity} from 'react-native';
import type {ThemeColors} from '../theme';

export const TogglePill = ({on, T}: {on: boolean; T: ThemeColors}) => (
  <View style={{width: 40, height: 22, borderRadius: 11, backgroundColor: on ? T.accent : T.toggleOff, justifyContent: 'center'}}>
    <View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', position: 'absolute', left: on ? 20 : 3}} />
  </View>
);

export const ToggleSwitch = ({value, onToggle, label, T, disabled = false, activeOpacity = 0.8, style}: {value: boolean; onToggle?: () => void; label?: string; T: ThemeColors; disabled?: boolean; activeOpacity?: number; style?: any}) => (
  <TouchableOpacity onPress={disabled ? undefined : onToggle} activeOpacity={activeOpacity} disabled={disabled}
    accessibilityRole="switch" accessibilityState={{checked: value, ...(disabled ? {disabled: true} : {})}} accessibilityLabel={label}
    style={[disabled ? {opacity: 0.4} : null, style]}>
    <TogglePill on={value} T={T} />
  </TouchableOpacity>
);
