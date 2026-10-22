import React, {useState} from 'react';
import {View, ScrollView, TouchableOpacity, Alert} from 'react-native';
import {Text} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {ColorPickerModal} from '../components/ColorPickerModal';
import {PRESET_COLORS, presetColorName, COLOR_SETS, ColorSet, MAX_CUSTOM_COLORS, withCustomColor, DEFAULT_SLOT_COLOR, colorName} from '../utils';
import {useCustomColors} from '../hooks/useCustomColors';
import {sectionLabel} from '../components/controls';

interface Props {
  onBack: () => void;
}

const SET_LABEL_KEYS: Record<ColorSet, string> = {
  default: 'colors.rowDefault',
  darker: 'colors.rowDarker',
  pastel: 'colors.rowPastel',
  neon: 'colors.rowNeon',
};

export const ColorsScreen = ({onBack}: Props) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [customColors, saveColors] = useCustomColors(true);
  const [editSlot, setEditSlot] = useState<number | null>(null);

  const saveSlot = (hex: string) => {
    if (editSlot === null) return;
    const next = withCustomColor(customColors, editSlot, hex);
    if (!next) return;
    saveColors(next);
    setEditSlot(null);
  };

  const clearSlot = () => {
    if (editSlot === null) return;
    Alert.alert(t('colors.clearSlot'), t('colors.clearSlotMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('colors.clearSlot'), style: 'destructive', onPress: () => {
        const next = withCustomColor(customColors, editSlot, '');
        if (next) saveColors(next);
        setEditSlot(null);
      }},
    ]);
  };

  const editingColor = editSlot === null ? '' : customColors[editSlot];

  return (
    <View style={{flex: 1, backgroundColor: T.bg}}>
      <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border, gap: 8}}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}} style={{padding: 6}}>
          <Text style={{fontSize: fs(16), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no">‹</Text>
        </TouchableOpacity>
        <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(16), fontWeight: '600', color: T.text}}>{t('colors.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={{padding: 14, paddingBottom: 32}}>
        {COLOR_SETS.map(set => (
          <View key={set} style={{marginBottom: 18}}>
            <Text accessibilityRole="header" style={sectionLabel(T, {fontSize: fs(11), marginBottom: 8})}>{t(SET_LABEL_KEYS[set])}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{flexDirection: 'row', gap: 8}}>
                {PRESET_COLORS.filter(p => p.set === set).map(p => (
                  <View key={p.hex} accessible accessibilityLabel={presetColorName(p, t)}
                    style={{width: 30, height: 30, borderRadius: 15, backgroundColor: p.hex, borderWidth: 1, borderColor: T.border}} />
                ))}
              </View>
            </ScrollView>
          </View>
        ))}

        <Text accessibilityRole="header" style={sectionLabel(T, {fontSize: fs(11), marginBottom: 8})}>{t('colors.custom')}</Text>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
          {Array.from({length: MAX_CUSTOM_COLORS}, (_, i) => {
            const c = customColors[i];
            return c ? (
              <TouchableOpacity key={i} onPress={() => setEditSlot(i)} activeOpacity={0.8}
                accessibilityRole="button" accessibilityLabel={`${t('colors.customSlot', {n: i + 1})}, ${colorName(c, t)}`}
                hitSlop={{top: 4, bottom: 4, left: 4, right: 4}} style={{width: 36, height: 36, borderRadius: 18, backgroundColor: c, borderWidth: 1, borderColor: T.border}} />
            ) : (
              <TouchableOpacity key={i} onPress={() => setEditSlot(i)} activeOpacity={0.8}
                accessibilityRole="button" accessibilityLabel={t('colors.emptySlot', {n: i + 1})}
                hitSlop={{top: 4, bottom: 4, left: 4, right: 4}} style={{width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: T.dim, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center'}}>
                <Text style={{fontSize: fs(16), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no">＋</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <ColorPickerModal visible={editSlot !== null} title={t('colors.customSlot', {n: (editSlot ?? 0) + 1})} value={editingColor || DEFAULT_SLOT_COLOR}
        onSave={saveSlot} onClose={() => setEditSlot(null)} onClear={editingColor ? clearSlot : undefined} clearLabel={t('colors.clearSlot')} />
    </View>
  );
};
