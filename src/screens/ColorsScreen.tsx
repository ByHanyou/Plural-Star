import React, {useEffect, useState} from 'react';
import {View, ScrollView, TouchableOpacity, Modal, Alert} from 'react-native';
import {Text} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {fontScale, ThemeColors} from '../theme';
import {ColorPicker} from '../components/ColorPicker';
import {PRESET_COLORS, PresetColor, presetColorName, COLOR_SETS, ColorSet, MAX_CUSTOM_COLORS, normalizeCustomColors, isValidHex, normalizeHex} from '../utils';
import {store, KEYS} from '../storage';
import {logError} from '../utils/log';
import {useKeyboardHeight} from '../hooks/useKeyboardHeight';

interface Props {
  theme: ThemeColors;
  onBack: () => void;
}

const SET_LABEL_KEYS: Record<ColorSet, string> = {
  default: 'colors.rowDefault',
  darker: 'colors.rowDarker',
  pastel: 'colors.rowPastel',
  neon: 'colors.rowNeon',
};

export const ColorsScreen = ({theme: T, onBack}: Props) => {
  const {t} = useTranslation();
  const fs = fontScale(T);
  const kb = useKeyboardHeight();
  const [customColors, setCustomColors] = useState<string[]>(normalizeCustomColors([]));
  const [editSlot, setEditSlot] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('#FF0000');

  useEffect(() => {
    store.get<string[]>(KEYS.customColors, []).then(v => setCustomColors(normalizeCustomColors(v)));
  }, []);

  const saveColors = (next: string[]) => {
    setCustomColors(next);
    store.set(KEYS.customColors, next).catch(e => logError('colors', e));
  };

  const openSlot = (i: number) => {
    setEditValue(customColors[i] || '#FF0000');
    setEditSlot(i);
  };

  const saveSlot = () => {
    if (editSlot === null) return;
    const n = normalizeHex(editValue);
    if (!isValidHex(n)) return;
    const next = [...customColors];
    next[editSlot] = n.toUpperCase();
    saveColors(next);
    setEditSlot(null);
  };

  const clearSlot = () => {
    if (editSlot === null) return;
    Alert.alert(t('colors.clearSlot'), t('colors.clearSlotMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('colors.clearSlot'), style: 'destructive', onPress: () => {
        const next = [...customColors];
        next[editSlot] = '';
        saveColors(next);
        setEditSlot(null);
      }},
    ]);
  };

  const editing = editSlot !== null;
  const editingFilled = editing && !!customColors[editSlot as number];

  return (
    <View style={{flex: 1, backgroundColor: T.bg}}>
      <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border, gap: 8}}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{padding: 6}}>
          <Text style={{fontSize: fs(16), color: T.dim}} importantForAccessibility="no">‹</Text>
        </TouchableOpacity>
        <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(16), fontWeight: '600', color: T.text}}>{t('colors.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={{padding: 14, paddingBottom: 32}}>
        {COLOR_SETS.map(set => (
          <View key={set} style={{marginBottom: 18}}>
            <Text accessibilityRole="header" style={{fontSize: fs(11), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{t(SET_LABEL_KEYS[set])}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{flexDirection: 'row', gap: 8}}>
                {(PRESET_COLORS as PresetColor[]).filter(p => p.set === set).map(p => (
                  <View key={p.hex} accessible accessibilityLabel={presetColorName(p, t)}
                    style={{width: 30, height: 30, borderRadius: 15, backgroundColor: p.hex, borderWidth: 1, borderColor: T.border}} />
                ))}
              </View>
            </ScrollView>
          </View>
        ))}

        <Text accessibilityRole="header" style={{fontSize: fs(11), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{t('colors.custom')}</Text>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
          {Array.from({length: MAX_CUSTOM_COLORS}, (_, i) => {
            const c = customColors[i];
            return c ? (
              <TouchableOpacity key={i} onPress={() => openSlot(i)} activeOpacity={0.8}
                accessibilityRole="button" accessibilityLabel={`${t('colors.customSlot', {n: i + 1})}, ${c}`}
                style={{width: 36, height: 36, borderRadius: 18, backgroundColor: c, borderWidth: 1, borderColor: T.border}} />
            ) : (
              <TouchableOpacity key={i} onPress={() => openSlot(i)} activeOpacity={0.8}
                accessibilityRole="button" accessibilityLabel={t('colors.emptySlot', {n: i + 1})}
                style={{width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: T.dim, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center'}}>
                <Text style={{fontSize: fs(16), color: T.dim}} importantForAccessibility="no">＋</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditSlot(null)}>
        <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20, paddingBottom: 20 + kb}}>
          <View style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 16}}>
            <Text accessibilityRole="header" style={{fontSize: fs(14), fontWeight: '600', color: T.text, marginBottom: 12}}>{t('colors.customSlot', {n: (editSlot ?? 0) + 1})}</Text>
            <ColorPicker value={editValue} onChange={setEditValue} T={T} />
            <View style={{flexDirection: 'row', gap: 8, marginTop: 14}}>
              {editingFilled && (
                <TouchableOpacity onPress={clearSlot} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('colors.clearSlot')}
                  style={{paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: `${T.danger}40`, backgroundColor: T.dangerBg}}>
                  <Text style={{fontSize: fs(12), fontWeight: '600', color: T.danger}}>{t('colors.clearSlot')}</Text>
                </TouchableOpacity>
              )}
              <View style={{flex: 1}} />
              <TouchableOpacity onPress={() => setEditSlot(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
                style={{paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
                <Text style={{fontSize: fs(12), color: T.dim}}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveSlot} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.save')}
                style={{paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: `${T.accent}40`, backgroundColor: T.accentBg}}>
                <Text style={{fontSize: fs(12), fontWeight: '600', color: T.accent}}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};
