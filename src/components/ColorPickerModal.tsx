import React, {useState} from 'react';
import {View, TouchableOpacity, Modal} from 'react-native';
import {Text} from './AppText';
import {useTranslation} from 'react-i18next';
import {ColorPicker} from './ColorPicker';
import {fontScale, ThemeColors} from '../theme';
import {isValidHex, normalizeHex} from '../utils';
import {useKeyboardHeight} from '../hooks/useKeyboardHeight';

interface Props {
  visible: boolean;
  title: string;
  value: string;
  onSave: (hex: string) => void;
  onClose: () => void;
  T: ThemeColors;
}

const safeHex = (v: string) => {
  const n = normalizeHex(v || '');
  return isValidHex(n) ? n : '#FF0000';
};

const PickerCard = ({title, value, onSave, onClose, T}: Omit<Props, 'visible'>) => {
  const {t} = useTranslation();
  const fs = fontScale(T);
  const kb = useKeyboardHeight();
  const [draft, setDraft] = useState(() => safeHex(value));
  const save = () => {
    const n = normalizeHex(draft);
    if (isValidHex(n)) onSave(n.toUpperCase());
  };
  return (
    <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20, paddingBottom: 20 + kb}}>
      <View accessibilityViewIsModal onAccessibilityEscape={onClose}
        style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 16}}>
        <Text accessibilityRole="header" style={{fontSize: fs(14), fontWeight: '600', color: T.text, marginBottom: 12}}>{title}</Text>
        <ColorPicker value={draft} onChange={setDraft} T={T} />
        <View style={{flexDirection: 'row', gap: 8, marginTop: 14}}>
          <View style={{flex: 1}} />
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
            style={{paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
            <Text style={{fontSize: fs(12), color: T.dim}}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={save} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.save')}
            style={{paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: `${T.accent}40`, backgroundColor: T.accentBg}}>
            <Text style={{fontSize: fs(12), fontWeight: '600', color: T.accent}}>{t('common.save')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export const ColorPickerModal = ({visible, title, value, onSave, onClose, T}: Props) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    {visible && <PickerCard title={title} value={value} onSave={onSave} onClose={onClose} T={T} />}
  </Modal>
);
