// src/screens/SetupScreen.tsx
import React, {useState} from 'react';
import {View, Text, Image, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, TextInput} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Fonts} from '../theme';

interface Props {
  theme: any;
  onSave: (info: {name: string; description: string}) => void;
}

export const SetupScreen = ({theme: T, onSave}: Props) => {
  const {t} = useTranslation();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  return (
    <KeyboardAvoidingView style={{flex: 1, backgroundColor: T.bg}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <Image source={require('../assets/splash-logo.png')} style={s.logo} resizeMode="contain" />
        <Text style={[s.heading, {color: T.accent}]}>{t('setup.welcome')}</Text>
        <Text style={[s.sub, {color: T.dim}]}>{t('setup.subtitle')}</Text>
        <View style={s.form}>
          <Text style={[s.label, {color: T.dim}]}>{t('setup.systemName')}</Text>
          <TextInput value={name} onChangeText={setName} placeholder={t('setup.systemNamePlaceholder')}
            placeholderTextColor={T.muted} style={[s.input, {backgroundColor: T.surface, color: T.text, borderColor: T.border}]} />
          <Text style={[s.label, {color: T.dim}]}>{t('setup.description')}</Text>
          <TextInput value={desc} onChangeText={setDesc} placeholder={t('setup.descriptionPlaceholder')}
            placeholderTextColor={T.muted} multiline numberOfLines={4}
            style={[s.input, s.textarea, {backgroundColor: T.surface, color: T.text, borderColor: T.border}]} />
          <TouchableOpacity onPress={() => name.trim() && onSave({name: name.trim(), description: desc.trim()})}
            activeOpacity={0.8} style={[s.btn, {backgroundColor: T.accent}]}>
            <Text style={s.btnText}>{t('setup.enter')}</Text>
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
});
