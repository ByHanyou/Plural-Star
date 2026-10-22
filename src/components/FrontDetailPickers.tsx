import React from 'react';
import {View, TouchableOpacity, ScrollView} from 'react-native';
import type {StyleProp, TextStyle, ViewStyle} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text, TextInput} from './AppText';
import {sectionLabel} from './controls';
import {parseMoodList, toggleMoodInList, translateMood} from '../utils';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';

export const EnergyRow = ({value, onChange, color, style}: {value: number | undefined; onChange: (v: number | undefined) => void; color: string; style?: StyleProp<ViewStyle>}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <View style={[{flexDirection: 'row', gap: 3, marginBottom: 8, alignItems: 'center'}, style]}>
      {[1,2,3,4,5,6,7,8,9,10].map(n => (
        <TouchableOpacity key={n} onPress={() => onChange(value === n ? undefined : n)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityState={{selected: value === n}} accessibilityLabel={t('energy.levelN', {n})}
          hitSlop={{top: 10, bottom: 10}} style={{flex: 1, paddingVertical: 6, borderRadius: 6, borderWidth: 1, alignItems: 'center',
            backgroundColor: value === n ? `${color}30` : T.surface,
            borderColor: value !== undefined && n <= value ? color : T.border}}>
          <Text style={{fontSize: fs(10), color: value !== undefined && n <= value ? color : T.dim, fontWeight: '600'}}>{n}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

export const LocationPicker = ({location, setLocation, allLocations, color}: {
  location: string; setLocation: (v: string) => void; allLocations?: string[]; color?: string;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const accent = color || T.accent;
  const list: string[] = allLocations || [];
  return (
    <>
      <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 6})}>{t('modal.location')}</Text>
      {list.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 4}}>
          <View style={{flexDirection: 'row', gap: 5}}>
            {list.map((l: string) => (
              <TouchableOpacity key={l} onPress={() => setLocation(location === l ? '' : l)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityState={{selected: location === l}} accessibilityLabel={l}
                hitSlop={{top: 10, bottom: 10}} style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, flexShrink: 0,
                  backgroundColor: location === l ? `${accent}20` : T.surface, borderColor: location === l ? `${accent}60` : T.border}}>
                <Text style={{fontSize: fs(11), color: location === l ? accent : T.dim, fontWeight: location === l ? '600' : '400'}}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}
      <TextInput value={location} onChangeText={setLocation} placeholder={t('modal.typeLocation')} placeholderTextColor={T.muted}
        accessibilityLabel={t('modal.location')}
        style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), marginTop: 4}} />
    </>
  );
};

const MOOD_SIZES = {
  compact: {gap: 5, padH: 10, padV: 5, slop: 10, font: 11, header: 6, row: 4, inputFont: 13, inputPad: 8, inputTop: 4},
  regular: {gap: 6, padH: 12, padV: 6, slop: 9, font: 12, header: 8, row: 6, inputFont: 14, inputPad: 9, inputTop: 6},
} as const;

export const MoodPicker = ({mood, setMood, customMood, setCustomMood, showCustom, setShowCustom, allMoods, size = 'compact'}: {
  mood: string; setMood: (v: string) => void; customMood: string; setCustomMood: (v: string) => void; showCustom: boolean; setShowCustom: (v: boolean) => void; allMoods: string[]; size?: keyof typeof MOOD_SIZES;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const z = MOOD_SIZES[size];
  const selected = parseMoodList(mood);
  const chipMoods = [...allMoods, ...selected.filter((m: string) => !allMoods.includes(m))];
  const hitSlop = {top: z.slop, bottom: z.slop};
  const chipStyle = (on: boolean): ViewStyle => ({paddingHorizontal: z.padH, paddingVertical: z.padV, borderRadius: 999, borderWidth: 1, flexShrink: 0, backgroundColor: on ? `${T.accent}20` : T.surface, borderColor: on ? `${T.accent}60` : T.border});
  const chipText = (on: boolean): TextStyle => ({fontSize: fs(z.font), color: on ? T.accent : T.dim, fontWeight: on ? '600' : '400'});
  return (
    <>
      <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: z.header})}>{t('modal.mood')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: z.row}}>
        <View style={{flexDirection: 'row', gap: z.gap}}>
          {chipMoods.map((m: string) => {
            const on = selected.includes(m);
            return (
              <TouchableOpacity key={m} onPress={() => setMood(toggleMoodInList(mood, m))} activeOpacity={0.7}
                accessibilityRole="button" accessibilityState={{selected: on}} accessibilityLabel={translateMood(m, t)}
                hitSlop={hitSlop} style={chipStyle(on)}>
                <Text style={chipText(on)}>{translateMood(m, t)}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity onPress={() => setShowCustom(!showCustom)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityState={{expanded: showCustom}} accessibilityLabel={t('modal.custom')}
            hitSlop={hitSlop} style={chipStyle(showCustom)}>
            <Text style={chipText(showCustom)}>{showCustom ? `− ${t('modal.custom')}` : `+ ${t('modal.custom')}`}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      {showCustom && <TextInput value={customMood} onChangeText={setCustomMood} accessibilityLabel={t('modal.enterMood')} placeholder={t('modal.enterMood')} placeholderTextColor={T.muted}
        style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: z.inputPad, fontSize: fs(z.inputFont), marginTop: z.inputTop}} />}
    </>
  );
};
