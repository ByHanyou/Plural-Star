import React, {useState} from 'react';
import {View, Image, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Fonts, fontScale, ThemeColors} from '../theme';

interface Props {
  theme: ThemeColors;
  password: string;
  systemName?: string;
  onUnlock: () => void;
}

export const LockScreen = ({theme: T, password, systemName, onUnlock}: Props) => {
  const fs = fontScale(T);
  const {t} = useTranslation();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    if (input === password) {
      setInput('');
      setError('');
      onUnlock();
    } else {
      setError(t('lock.wrongPassword'));
    }
  };

  return (
    <KeyboardAvoidingView style={{flex: 1, backgroundColor: T.bg}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <Image source={require('../assets/splash-logo.png')} style={s.logo} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        <Text accessibilityRole="header" style={[s.heading, {color: T.accent}]}>{systemName || t('lock.locked')}</Text>
        <Text style={[s.sub, {color: T.dim}]}>{t('lock.subtitle')}</Text>
        <View style={s.form}>
          <Text style={[s.label, {color: T.dim}]}>{t('lock.password')}</Text>
          <TextInput
            value={input}
            onChangeText={v => { setInput(v); if (error) setError(''); }}
            placeholder={t('lock.passwordPlaceholder')}
            placeholderTextColor={T.muted}
            secureTextEntry
            autoFocus
            onSubmitEditing={submit}
            returnKeyType="go"
            style={[s.input, {backgroundColor: T.surface, color: T.text, borderColor: error ? T.danger : T.border}]}
          />
          {error ? <Text style={{fontSize: fs(12), color: T.danger, marginBottom: 10, marginTop: -8}}>{error}</Text> : null}
          <TouchableOpacity onPress={submit} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('lock.unlock')} style={[s.btn, {backgroundColor: T.accent}]}>
            <Text style={s.btnText}>{t('lock.unlock')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const s = StyleSheet.create({
  container: {flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48},
  logo: {width: 180, height: 180, marginBottom: 24},
  heading: {fontFamily: Fonts.display, fontSize: 24, fontWeight: '600', fontStyle: 'italic', marginBottom: 8, textAlign: 'center'},
  sub: {fontSize: 14, marginBottom: 40, textAlign: 'center'},
  form: {width: '100%'},
  label: {fontSize: 10, letterSpacing: 1, fontWeight: '600', marginBottom: 5},
  input: {borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 14},
  btn: {borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 4},
  btnText: {fontSize: 15, fontWeight: '700', color: '#0a0508'},
});
