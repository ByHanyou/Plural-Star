import React from 'react';
import {View, TouchableOpacity, ScrollView} from 'react-native';
import type {TextStyle, ViewStyle} from 'react-native';
import {KeyboardAvoidingView} from 'react-native-keyboard-controller';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {fontScale, ThemeColors} from '../../theme';
import {useTheme} from '../../themeContext';
import {useKeyboardBehavior} from '../../hooks/useKeyboardBehavior';
import {BackHeader} from '../../components/BackHeader';
import {CancelConfirmRow} from '../../components/controls';

export const inputStyle = (T: ThemeColors, extra?: TextStyle): TextStyle =>
  ({backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fontScale(T)(13), ...extra});

export const PlannerForm = ({title, onClose, onSave, canSave, children}: {
  title: string; onClose: () => void; onSave: () => void; canSave: boolean; children: React.ReactNode;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const behavior = useKeyboardBehavior();
  return (
    <View style={{flex: 1, backgroundColor: T.bg}}>
      <BackHeader title={title} onBack={onClose} />
      <KeyboardAvoidingView style={{flex: 1}} behavior={behavior}>
        <ScrollView style={{flex: 1}} contentContainerStyle={{padding: 16, paddingTop: 4, paddingBottom: 32}} keyboardShouldPersistTaps="handled">
          {children}
          <CancelConfirmRow label={t('common.save')} onConfirm={onSave} onCancel={onClose} disabled={!canSave} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export const SectionHeading = ({label}: {label: string}) => {
  const T = useTheme();
  return <Text accessibilityRole="header" style={{fontSize: fontScale(T)(11), color: T.dim, marginBottom: 6}}>{label}</Text>;
};

export function ChoiceChips<V>({choices, value, label, onPick, style}: {
  choices: V[]; value: V; label: (v: V) => string; onPick: (v: V) => void; style?: ViewStyle;
}) {
  const T = useTheme();
  const fs = fontScale(T);
  return (
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12, ...style}}>
      {choices.map(choice => {
        const sel = value === choice;
        const text = label(choice);
        return (
          <TouchableOpacity key={String(choice)} onPress={() => onPick(choice)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityState={{selected: sel}} accessibilityLabel={text}
            hitSlop={{top: 6, bottom: 9}} style={{paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
              backgroundColor: sel ? `${T.accent}20` : T.bg, borderColor: sel ? `${T.accent}50` : T.border}}>
            <Text style={{fontSize: fs(11), color: sel ? T.accent : T.dim}}>{text}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export const DeleteButton = ({label, onPress}: {label: string; onPress: () => void}) => {
  const T = useTheme();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label} style={{padding: 8}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
      <Text style={{fontSize: fontScale(T)(15), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no">✕</Text>
    </TouchableOpacity>
  );
};
