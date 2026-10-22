import React from 'react';
import {View, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text, TextInput} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {AddRow} from '../../components/controls';

export const Pill = ({onPress, label, color, bg, a11y, hitSlop, compact}: {onPress: () => void; label: string; color: string; bg: string; a11y?: string; hitSlop: {top: number; bottom: number}; compact?: boolean}) => {
  const T = useTheme();
  const fs = fontScale(T);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={hitSlop} style={{paddingHorizontal: compact ? 8 : 10, paddingVertical: compact ? 3 : 4, borderRadius: 6, borderWidth: 1, backgroundColor: bg, borderColor: `${color}40`}}>
      <Text style={{fontSize: fs(11), fontWeight: '500', color}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{label}</Text>
    </TouchableOpacity>
  );
};

export const InlineRename = ({value, onChange, label, onSubmit, onCancel, top}: {value: string; onChange: (v: string) => void; label: string; onSubmit: () => void; onCancel: () => void; top: number}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const hit = {top, bottom: 12, left: 6, right: 10};
  return (
    <View style={{flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center'}}>
      <TextInput value={value} onChangeText={onChange} autoFocus accessibilityLabel={label}
        style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: fs(13)}}
        onSubmitEditing={onSubmit} returnKeyType="done" />
      <TouchableOpacity hitSlop={hit} onPress={onSubmit} accessibilityRole="button" accessibilityLabel={t('common.save')}><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(14), color: T.success}}>✓</Text></TouchableOpacity>
      <TouchableOpacity hitSlop={hit} onPress={onCancel} accessibilityRole="button" accessibilityLabel={t('common.cancel')}><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(12), color: T.dim}}>✕</Text></TouchableOpacity>
    </View>
  );
};

const AUTO_FOCUS = {autoFocus: true};

export const NewItemRow = ({open, onOpen, value, onChange, label, newLabel, onSubmit}: {open: boolean; onOpen: () => void; value: string; onChange: (v: string) => void; label: string; newLabel: string; onSubmit: () => void}) => {
  const T = useTheme();
  const fs = fontScale(T);
  if (open) return <AddRow value={value} onChange={onChange} onAdd={onSubmit} placeholder={label} inputProps={AUTO_FOCUS} style={{marginTop: 8}} />;
  return (
    <TouchableOpacity onPress={onOpen} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={newLabel}
      hitSlop={{top: 6, bottom: 6}} style={{alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: T.border, marginTop: 8}}>
      <Text style={{fontSize: fs(12), color: T.dim}}>+ {newLabel}</Text>
    </TouchableOpacity>
  );
};
