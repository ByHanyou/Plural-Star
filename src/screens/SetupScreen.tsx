import React, {useState} from 'react';
import {View, Image, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {KeyboardAvoidingView} from 'react-native-keyboard-controller';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Fonts, fontScale, ThemeColors} from '../theme';
import {useKeyboardBehavior} from '../hooks/useKeyboardBehavior';

interface Props {
  theme: ThemeColors;
  onSave: (info: {name: string; description: string; singlet?: boolean}) => void;
}

export const SetupScreen = ({theme: T, onSave}: Props) => {
  const fs = fontScale(T);
  const {t} = useTranslation();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [singlet, setSinglet] = useState(false);
  const behavior = useKeyboardBehavior();

  return (
    <KeyboardAvoidingView
      style={{flex: 1, backgroundColor: T.bg}}
      behavior={behavior}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <Image source={require('../assets/splash-logo.png')} style={s.logo} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        <Text accessibilityRole="header" style={[s.heading, {color: T.accent}]}>{t('setup.welcome')}</Text>
        <Text style={[s.sub, {color: T.dim}]}>{singlet ? t('setup.subtitleSinglet') : t('setup.subtitle')}</Text>
        <View style={s.form}>
          <Text style={[s.label, {color: T.dim}]}>{singlet ? t('setup.yourName') : t('setup.systemName')}</Text>
          <TextInput value={name} onChangeText={setName} placeholder={singlet ? t('setup.yourNamePlaceholder') : t('setup.systemNamePlaceholder')}
            placeholderTextColor={T.muted} style={[s.input, {backgroundColor: T.surface, color: T.text, borderColor: T.border}]} />
          <Text style={[s.label, {color: T.dim}]}>{singlet ? t('setup.goals') : t('setup.description')}</Text>
          <TextInput value={desc} onChangeText={setDesc} placeholder={singlet ? t('setup.goalsPlaceholder') : t('setup.descriptionPlaceholder')}
            placeholderTextColor={T.muted} multiline numberOfLines={4}
            style={[s.input, s.textarea, {backgroundColor: T.surface, color: T.text, borderColor: T.border}]} />
          <TouchableOpacity onPress={() => name.trim() && onSave({name: name.trim(), description: desc.trim(), singlet})}
            activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('setup.enter')} style={[s.btn, {backgroundColor: T.accent}]}>
            <Text style={s.btnText}>{t('setup.enter')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSinglet(!singlet)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityState={{selected: singlet}} accessibilityLabel={t('setup.observatory')}
            style={[s.modeBtn, {borderColor: singlet ? T.accent : T.border, backgroundColor: singlet ? `${T.accent}18` : 'transparent'}]}>
            <Text style={{fontSize: fs(13), fontWeight: '600', color: singlet ? T.accent : T.dim}}>
              {singlet ? `✓ ${t('setup.observatory')}` : t('setup.observatory')}
            </Text>
            <Text style={{fontSize: fs(10), color: T.muted, marginTop: 2, textAlign: 'center'}}>{t('setup.observatoryHint')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const s = StyleSheet.create({
  container: {flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48},
  logo: {width: 180, height: 180, marginBottom: 24},
  heading: {fontFamily: Fonts.display, fontSize: 34, fontWeight: '600', fontStyle: 'italic', marginBottom: 8},
  sub: {fontSize: 14, marginBottom: 40},
  form: {width: '100%'},
  label: {fontSize: 10, letterSpacing: 1, fontWeight: '600', marginBottom: 5},
  input: {borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 14},
  textarea: {minHeight: 100, textAlignVertical: 'top'},
  btn: {borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 4},
  btnText: {fontSize: 15, fontWeight: '700', color: '#0a0508'},
  modeBtn: {borderRadius: 8, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', marginTop: 14},
});