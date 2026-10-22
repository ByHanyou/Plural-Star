import React from 'react';
import {View, Modal} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text, TextInput} from './AppText';
import {CancelConfirmRow} from './controls';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {useKeyboardHeight} from '../hooks/useKeyboardHeight';

export const PasswordDialog = ({visible, title, hint, value, onChange, submitLabel, onSubmit, submitOnEnter = false, autoFocus = false, error = false, onCancel}: {
  visible: boolean; title: string; hint?: string; value: string; onChange: (v: string) => void; submitLabel: string; onSubmit: () => void;
  submitOnEnter?: boolean; autoFocus?: boolean; error?: boolean; onCancel: () => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const kbHeight = useKeyboardHeight();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 32, paddingBottom: 32 + kbHeight}}>
        <View accessibilityViewIsModal onAccessibilityEscape={onCancel} style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 16}}>
          <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, marginBottom: hint ? 6 : 10}}>{title}</Text>
          {hint ? <Text style={{fontSize: fs(12), color: T.dim, marginBottom: 10}}>{hint}</Text> : null}
          <TextInput value={value} onChangeText={onChange} placeholder={t('journal.password')} placeholderTextColor={T.muted} secureTextEntry autoFocus={autoFocus}
            accessibilityLabel={t('journal.password')} onSubmitEditing={submitOnEnter ? onSubmit : undefined}
            style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: error ? T.danger : T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13), marginBottom: error ? 8 : 12}} />
          {error && <Text style={{fontSize: fs(12), color: T.danger, marginBottom: 8}} accessibilityRole="alert">{t('journal.incorrectPassword')}</Text>}
          <CancelConfirmRow label={submitLabel} onConfirm={onSubmit} onCancel={onCancel} />
        </View>
      </View>
    </Modal>
  );
};
