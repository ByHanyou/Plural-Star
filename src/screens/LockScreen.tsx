import React, {useState} from 'react';
import {View, Image, ScrollView, TouchableOpacity, AccessibilityInfo} from 'react-native';
import {KeyboardAvoidingView} from 'react-native-keyboard-controller';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {fontScale, initialOn} from '../theme';
import {useTheme} from '../themeContext';
import {useKeyboardBehavior} from '../hooks/useKeyboardBehavior';
import {entry} from './entryStyles';

interface Props {
  password: string;
  systemName?: string;
  onUnlock: () => void;
}

export const LockScreen = ({password, systemName, onUnlock}: Props) => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const behavior = useKeyboardBehavior();

  const submit = () => {
    if (input === password) {
      setInput('');
      setError('');
      onUnlock();
    } else {
      setError(t('lock.wrongPassword'));
      AccessibilityInfo.announceForAccessibility(t('lock.wrongPassword'));
    }
  };

  return (
    <KeyboardAvoidingView style={{flex: 1, backgroundColor: T.bg}} behavior={behavior}>
      <ScrollView contentContainerStyle={entry.container} keyboardShouldPersistTaps="handled">
        <Image source={require('../assets/splash-logo.png')} style={entry.logo} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        <Text accessibilityRole="header" style={[entry.heading, {color: T.accent, fontSize: fs(24), textAlign: 'center'}]}>{systemName || t('lock.locked')}</Text>
        <Text style={[entry.sub, {color: T.dim, fontSize: fs(14), textAlign: 'center'}]}>{t('lock.subtitle')}</Text>
        <View style={entry.form}>
          <Text style={[entry.label, {color: T.dim, fontSize: fs(10)}]}>{t('lock.password')}</Text>
          <TextInput
            value={input}
            onChangeText={v => { setInput(v); if (error) setError(''); }}
            accessibilityLabel={t('lock.passwordPlaceholder')} placeholder={t('lock.passwordPlaceholder')}
            placeholderTextColor={T.muted}
            secureTextEntry
            autoFocus
            onSubmitEditing={submit}
            returnKeyType="go"
            style={[entry.input, {backgroundColor: T.surface, color: T.text, borderColor: error ? T.danger : T.border, fontSize: fs(14)}]}
          />
          {error ? <Text style={{fontSize: fs(12), color: T.danger, marginBottom: 10, marginTop: -8}}>{error}</Text> : null}
          <TouchableOpacity onPress={submit} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('lock.unlock')} style={[entry.btn, {backgroundColor: T.accent}]}>
            <Text style={[entry.btnText, {color: initialOn(T.accent), fontSize: fs(15)}]}>{t('lock.unlock')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};
