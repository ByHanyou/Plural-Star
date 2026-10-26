import React, {useState} from 'react';
import {View, TouchableOpacity} from 'react-native';
import {Text} from './AppText';
import {ColorPickerModal} from './ColorPickerModal';
import {fontScale} from '../theme';
import type {ThemeColors} from '../theme';
import {isValidHex, normalizeHex} from '../utils';

export const PaletteColorField = ({label, value, onChange, T}: {label: string; value: string; onChange: (v: string) => void; T: ThemeColors}) => {
  const fs = fontScale(T);
  const [open, setOpen] = useState(false);
  const valid = isValidHex(normalizeHex(value));
  return (
    <View style={{flex: 1}}>
      <Text style={{fontSize: fs(9), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 4, fontWeight: '600'}}>{label}</Text>
      <TouchableOpacity onPress={() => setOpen(true)} activeOpacity={0.7}
        accessibilityRole="button" accessibilityLabel={label} accessibilityValue={{text: value}}
        hitSlop={{top: 15, bottom: 15}} style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
        <View style={{width: 20, height: 20, borderRadius: 4, backgroundColor: valid ? normalizeHex(value) : '#333', borderWidth: 1, borderColor: T.border}} />
        <View style={{flex: 1, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5}}>
          <Text style={{fontSize: fs(12), fontFamily: 'monospace', color: T.text}} numberOfLines={1}>{value}</Text>
        </View>
      </TouchableOpacity>
      <ColorPickerModal visible={open} title={label} value={value}
        onSave={hex => { onChange(hex); setOpen(false); }}
        onClose={() => setOpen(false)} />
    </View>
  );
};
