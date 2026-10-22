import React, {useState} from 'react';
import {View, Image, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {KeyboardAvoidingView} from 'react-native-keyboard-controller';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {fontScale, initialOn} from '../theme';
import {useTheme} from '../themeContext';
import {useKeyboardBehavior} from '../hooks/useKeyboardBehavior';
import {reportSaveError} from '../utils/saveError';
import {entry} from './entryStyles';

interface Props {
  onSave: (info: {name: string; description: string; singlet?: boolean}) => Promise<void>;
}

export const SetupScreen = ({onSave}: Props) => {
  const T = useTheme();
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
      <ScrollView contentContainerStyle={entry.container} keyboardShouldPersistTaps="handled">
        <Image source={require('../assets/splash-logo.png')} style={entry.logo} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        <Text accessibilityRole="header" style={[entry.heading, {color: T.accent, fontSize: 34}]}>{t('setup.welcome')}</Text>
        <Text style={[entry.sub, {color: T.dim}]}>{singlet ? t('setup.subtitleSinglet') : t('setup.subtitle')}</Text>
        <View style={entry.form}>
          <Text style={[entry.label, {color: T.dim}]}>{singlet ? t('setup.yourName') : t('setup.systemName')}</Text>
          <TextInput value={name} onChangeText={setName} accessibilityLabel={singlet ? t('setup.yourNamePlaceholder') : t('setup.systemNamePlaceholder')} placeholder={singlet ? t('setup.yourNamePlaceholder') : t('setup.systemNamePlaceholder')}
            placeholderTextColor={T.muted} style={[entry.input, {backgroundColor: T.surface, color: T.text, borderColor: T.border}]} />
          <Text style={[entry.label, {color: T.dim}]}>{singlet ? t('setup.goals') : t('setup.description')}</Text>
          <TextInput value={desc} onChangeText={setDesc} accessibilityLabel={singlet ? t('setup.goalsPlaceholder') : t('setup.descriptionPlaceholder')} placeholder={singlet ? t('setup.goalsPlaceholder') : t('setup.descriptionPlaceholder')}
            placeholderTextColor={T.muted} multiline numberOfLines={4}
            style={[entry.input, s.textarea, {backgroundColor: T.surface, color: T.text, borderColor: T.border}]} />
          <TouchableOpacity onPress={() => { if (name.trim()) onSave({name: name.trim(), description: desc.trim(), singlet}).catch(reportSaveError); }}
            activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('setup.enter')} accessibilityState={{disabled: !name.trim()}} style={[entry.btn, {backgroundColor: T.accent}]}>
            <Text style={[entry.btnText, {color: initialOn(T.accent)}]}>{t('setup.enter')}</Text>
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
  textarea: {minHeight: 100, textAlignVertical: 'top'},
  modeBtn: {borderRadius: 8, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', marginTop: 14},
});
