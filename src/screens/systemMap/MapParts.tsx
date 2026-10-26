import React, {useMemo, useState} from 'react';
import {View, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text, TextInput} from '../../components/AppText';
import {TogglePill} from '../../components/ToggleSwitch';
import {ColorCarousel} from '../../components/ColorCarousel';
import {Avatar} from '../../components/Avatar';
import {MemberPicker} from '../../components/MemberPicker';
import {pickerPool} from '../../picker/memberPicker';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {Member, RelationshipTypeDef, DEFAULT_REL_COLOR, membersByIds} from '../../utils';
import type {RelationshipTypeFields} from '../../utils';
import {sectionLabel} from '../../components/controls';

export const MemberPickerField = ({label, values, onPick, multi = false, members, facets}: {
  label: string; values: string[]; onPick: (id: string) => void; multi?: boolean; members: Member[]; facets: Member[];
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [open, setOpen] = useState(false);
  const pools = useMemo(() => [pickerPool('members', members, t), pickerPool('facets', facets, t)], [members, facets, t]);
  const byId = useMemo(() => new Map([...members, ...facets].map(m => [m.id, m])), [members, facets]);
  const selected = membersByIds(values, byId);
  const summary = selected.map(m => m.name).join(', ');
  return (
    <View style={{marginBottom: 12}}>
      <Text style={sectionLabel(T, {marginBottom: 6})}>{label}</Text>
      <TouchableOpacity onPress={() => setOpen(v => !v)} activeOpacity={0.7}
        accessibilityRole="button" accessibilityState={{expanded: open}} accessibilityLabel={label} accessibilityValue={{text: summary || t('systemMap.selectMember')}}
        hitSlop={{top: 6, bottom: 6}} style={{flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8}}>
        {selected.length === 1 ? <Avatar member={selected[0]} size={22} /> : null}
        <Text style={{flex: 1, fontSize: fs(13), color: selected.length ? T.text : T.muted}} numberOfLines={multi ? 1 : undefined}>{summary || t('systemMap.selectMember')}</Text>
        <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(12), color: T.dim}}>▾</Text>
      </TouchableOpacity>
      {open && (
        <View style={{marginTop: 4}}>
          <MemberPicker pools={pools} selected={multi ? values : values[0] ?? ''} onPick={m => { onPick(m.id); if (!multi) setOpen(false); }} multi={multi} autoFocus maxResults={30} listMaxHeight={180} rowSize={22} clearOnPick={!multi} />
        </View>
      )}
    </View>
  );
};

export const TypeForm = ({initial, saveLabel, onSave}: {
  initial?: RelationshipTypeDef | null; saveLabel: string; onSave: (d: RelationshipTypeFields) => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [name, setName] = useState(initial?.name || '');
  const [directional, setDirectional] = useState(initial?.directional || false);
  const [inverse, setInverse] = useState(initial?.inverseName || '');
  const [color, setColor] = useState(initial?.color || DEFAULT_REL_COLOR);
  const trimmed = name.trim();
  const input = {backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: fs(13), marginBottom: 8};
  return (
    <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12, marginBottom: 12}}>
      <TextInput value={name} onChangeText={setName} accessibilityLabel={t('systemMap.typeName')} placeholder={t('systemMap.typeName')} placeholderTextColor={T.muted} style={input} />
      <TouchableOpacity onPress={() => setDirectional(v => !v)} activeOpacity={0.7}
        accessibilityRole="switch" accessibilityState={{checked: directional}} accessibilityLabel={t('systemMap.directional')}
        hitSlop={{top: 8, bottom: 15}} style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8}}>
        <TogglePill on={directional} />
        <Text style={{fontSize: fs(12), color: T.dim}}>{t('systemMap.directional')}</Text>
      </TouchableOpacity>
      {directional && (
        <TextInput value={inverse} onChangeText={setInverse} accessibilityLabel={t('systemMap.inverseName')} placeholder={t('systemMap.inverseName')} placeholderTextColor={T.muted} style={input} />
      )}
      <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 6})}>{t('systemMap.typeColor')}</Text>
      <ColorCarousel value={color} onChange={setColor} />
      <View style={{height: 12}} />
      <TouchableOpacity onPress={() => { if (trimmed) onSave({name: trimmed, directional, inverseName: directional ? (inverse.trim() || trimmed) : undefined, color}); }} activeOpacity={0.7}
        disabled={!trimmed}
        accessibilityRole="button" accessibilityLabel={saveLabel} accessibilityState={{disabled: !trimmed}}
        hitSlop={{top: 6, bottom: 6}} style={{backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingVertical: 9, alignItems: 'center', opacity: trimmed ? 1 : 0.45}}>
        <Text style={{fontSize: fs(12), fontWeight: '600', color: T.accent}}>{saveLabel}</Text>
      </TouchableOpacity>
    </View>
  );
};

export const SheetHeader = ({title, onClose, paddingBottom}: {title: string; onClose: () => void; paddingBottom: number}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom}}>
      <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(17), fontWeight: '600', color: T.text}}>{title}</Text>
      <TouchableOpacity onPress={onClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={{top: 9, bottom: 9, left: 9, right: 9}} style={{padding: 4}}>
        <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(15), color: T.dim}}>✕</Text>
      </TouchableOpacity>
    </View>
  );
};

export const relColorOf = (td: RelationshipTypeDef | undefined): string => td?.color || DEFAULT_REL_COLOR;

export const ABS_FILL = {position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0};

export const SheetScrim = ({bottomInset, onEscape, size, children}: {
  bottomInset: number; onEscape: () => void; size: {maxHeight: number} | {height: number}; children: React.ReactNode;
}) => {
  const T = useTheme();
  return (
    <View style={{...ABS_FILL, backgroundColor: '#00000088', justifyContent: 'flex-end', paddingBottom: bottomInset}}>
      <View accessibilityViewIsModal onAccessibilityEscape={onEscape}
        style={[{backgroundColor: T.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: T.border}, size]}>
        {children}
      </View>
    </View>
  );
};
