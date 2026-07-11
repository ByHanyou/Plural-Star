import React from 'react';
import {View, TouchableOpacity, ScrollView, Platform} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {parseMoodList, toggleMoodInList, translateMood} from '../utils';
import {fontScale} from '../theme';
import type {ThemeColors} from '../theme';
import type {TFunction} from 'i18next';

export const Btn = ({children, onPress, variant = 'primary', disabled = false, style = {}, T, instant = false}: any) => {
  const variants: any = {primary: {bg: T.accentBg, color: T.accent, border: `${T.accent}40`}, ghost: {bg: 'transparent', color: T.dim, border: T.border}, danger: {bg: T.dangerBg, color: T.danger, border: `${T.danger}40`}, solid: {bg: T.accent, color: '#0a0508', border: T.accent}, info: {bg: T.infoBg, color: T.info, border: `${T.info}40`}};
  const v = variants[variant] || variants.primary;
  const useInstant = instant && Platform.OS === 'ios';
  return (<TouchableOpacity onPress={useInstant ? undefined : onPress} onPressIn={useInstant ? onPress : undefined} disabled={disabled} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{disabled}} style={[{paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: v.bg, borderColor: v.border, opacity: disabled ? 0.5 : 1}, style]}><Text style={{fontSize: 14, fontWeight: '500', color: v.color}}>{children}</Text></TouchableOpacity>);
};

export const Field = ({label, value, onChange, placeholder, multiline = false, numberOfLines = 4, readOnly = false, T}: any) => {
  const fs = fontScale(T);
  return (
  <View style={{marginBottom: 14}}>
    {label && <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 5, fontWeight: '600'}}>{label}</Text>}
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={T.muted} multiline={multiline} numberOfLines={multiline ? numberOfLines : 1}
      editable={!readOnly}
      style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(14), minHeight: multiline ? 100 : undefined, textAlignVertical: multiline ? 'top' : 'center'}} />
  </View>
  );
};

export const SectionDivider = ({label, color, T}: {label: string; color: string; T: ThemeColors}) => {
  const fs = fontScale(T);
  return (
  <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 12}}>
    <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: color}} />
    <Text accessibilityRole="header" style={{fontSize: fs(11), letterSpacing: 1, textTransform: 'uppercase', color, fontWeight: '700'}}>{label}</Text>
    <View style={{flex: 1, height: 1, backgroundColor: T.border}} />
  </View>
  );
};

export const EnergyRow = ({value, onChange, color, T, t, style}: {value: number | undefined; onChange: (v: number | undefined) => void; color: string; T: ThemeColors; t: TFunction; style?: any}) => {
  const fs = fontScale(T);
  return (
    <View style={[{flexDirection: 'row', gap: 3, marginBottom: 8, alignItems: 'center'}, style]}>
      {[1,2,3,4,5,6,7,8,9,10].map(n => (
        <TouchableOpacity key={n} onPress={() => onChange(value === n ? undefined : n)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityState={{selected: value === n}} accessibilityLabel={`${t('energy.level')} ${n}`}
          style={{flex: 1, paddingVertical: 6, borderRadius: 6, borderWidth: 1, alignItems: 'center',
            backgroundColor: value === n ? `${color}30` : T.surface,
            borderColor: value !== undefined && n <= value ? color : T.border}}>
          <Text style={{fontSize: fs(10), color: value !== undefined && n <= value ? color : T.dim, fontWeight: '600'}}>{n}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

export const MoodPicker = ({mood, setMood, customMood, setCustomMood, showCustom, setShowCustom, allMoods, T, t}: any) => {
  const fs = fontScale(T);
  const selected = parseMoodList(mood);
  const isSel = (m: string) => selected.includes(m);
  const chipMoods = [...allMoods, ...selected.filter((m: string) => !allMoods.includes(m))];
  return (
    <>
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('modal.mood')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 4}}>
        <View style={{flexDirection: 'row', gap: 5}}>
          {chipMoods.map((m: string) => (
            <TouchableOpacity key={m} onPress={() => setMood(toggleMoodInList(mood, m))} activeOpacity={0.7}
              accessibilityRole="button" accessibilityState={{selected: isSel(m)}} accessibilityLabel={translateMood(m, t)}
              style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, flexShrink: 0, backgroundColor: isSel(m) ? `${T.accent}20` : T.surface, borderColor: isSel(m) ? `${T.accent}60` : T.border}}>
              <Text style={{fontSize: fs(11), color: isSel(m) ? T.accent : T.dim, fontWeight: isSel(m) ? '600' : '400'}}>{translateMood(m, t)}</Text>
            </TouchableOpacity>))}
          <TouchableOpacity onPress={() => setShowCustom(!showCustom)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityState={{expanded: showCustom}} accessibilityLabel={t('modal.custom')}
            style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, flexShrink: 0, backgroundColor: showCustom ? `${T.accent}20` : T.surface, borderColor: showCustom ? `${T.accent}60` : T.border}}>
            <Text style={{fontSize: fs(11), color: showCustom ? T.accent : T.dim, fontWeight: showCustom ? '600' : '400'}}>{showCustom ? `− ${t('modal.custom')}` : `+ ${t('modal.custom')}`}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      {showCustom && <TextInput value={customMood} onChangeText={setCustomMood} placeholder={t('modal.enterMood')} placeholderTextColor={T.muted}
        style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), marginTop: 4}} />}
    </>
  );
};
