import React from 'react';
import {View, TouchableOpacity} from 'react-native';
import type {GestureResponderHandlers} from 'react-native';
import {Text} from './AppText';
import {useTranslation} from 'react-i18next';
import {ThemeColors, fontScale} from '../theme';

export const DragHandle = ({T, active, panHandlers, name, position, count, onStep}: {
  T: ThemeColors;
  active: boolean;
  panHandlers: GestureResponderHandlers;
  name?: string;
  position?: number;
  count?: number;
  onStep?: (dir: 1 | -1) => void;
}) => {
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <View
      {...(active ? panHandlers : {})}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={name ? `${t('common.dragReorder')}, ${name}` : t('common.dragReorder')}
      accessibilityState={{disabled: !active}}
      accessibilityValue={position != null && count != null ? {text: `${position} / ${count}`} : undefined}
      accessibilityActions={[{name: 'increment'}, {name: 'decrement'}]}
      onAccessibilityAction={e => {
        if (!active || !onStep) return;
        onStep(e.nativeEvent.actionName === 'increment' ? 1 : -1);
      }}
      style={{alignSelf: 'stretch', justifyContent: 'center', paddingHorizontal: 9, opacity: active ? 1 : 0.25}}>
      <Text style={{fontSize: fs(15), color: active ? T.accent : T.muted}} importantForAccessibility="no">⠿</Text>
    </View>
  );
};

export const ReorderLockButton = ({T, on, onToggle}: {T: ThemeColors; on: boolean; onToggle: () => void}) => {
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      accessibilityRole="switch"
      accessibilityState={{checked: on}}
      accessibilityLabel={t('common.reorderLock')}
      hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
      style={{padding: 8, opacity: on ? 1 : 0.35}}>
      <Text style={{fontSize: fs(16)}} importantForAccessibility="no">🤏</Text>
    </TouchableOpacity>
  );
};
