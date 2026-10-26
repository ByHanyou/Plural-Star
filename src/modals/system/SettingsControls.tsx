import React, {useState} from 'react';
import {View, TouchableOpacity} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {Text} from '../../components/AppText';
import {useTranslation} from 'react-i18next';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {AddRow, sectionLabel} from '../../components/controls';

export const Dropdown = <V extends string | number,>({label, value, options, optionLabel, onPick}: {
  label: string; value: V; options: readonly V[]; optionLabel: (v: V) => string; onPick: (v: V) => void;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(!open)} activeOpacity={0.7}
        accessibilityRole="button" accessibilityState={{expanded: open}} accessibilityLabel={label} accessibilityValue={{text: optionLabel(value)}}
        hitSlop={{top: 6, bottom: 6}} style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: open ? `${T.accent}60` : T.border}}>
        <Text style={{fontSize: fs(14), color: T.text}}>{optionLabel(value)}</Text>
        <Text style={{fontSize: fs(12), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={{backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.border, marginTop: 4, overflow: 'hidden'}}>
          {options.map(opt => {
            const sel = opt === value;
            const text = optionLabel(opt);
            return (
              <TouchableOpacity key={String(opt)} onPress={() => { onPick(opt); setOpen(false); }} activeOpacity={0.7}
                accessibilityRole="menuitem" accessibilityState={{selected: sel}} accessibilityLabel={text}
                style={{paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border,
                  backgroundColor: sel ? `${T.accent}15` : 'transparent'}}>
                <Text style={{fontSize: fs(14), color: sel ? T.accent : T.text, fontWeight: sel ? '600' : '400'}}>{text}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </>
  );
};

export const ChipListEditor = ({label, items, onChange, placeholder, style}: {
  label: string; items: string[]; onChange: (items: string[]) => void; placeholder: string; style?: StyleProp<ViewStyle>;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setInput('');
  };
  return (
    <View style={style}>
      <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{label}</Text>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 8}}>
        {items.map(item => (
          <TouchableOpacity key={item} onPress={() => onChange(items.filter(x => x !== item))} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel={t('common.removeItem', {name: item})}
            hitSlop={{top: 7, bottom: 10}} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface}}>
            <Text style={{fontSize: fs(12), color: T.dim}}>{item}</Text>
            <Text style={{fontSize: fs(10), color: T.danger}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✕</Text>
          </TouchableOpacity>
        ))}
      </View>
      <AddRow value={input} onChange={setInput} onAdd={add} placeholder={placeholder} label={label} />
    </View>
  );
};
