import React, {useRef, useState} from 'react';
import {View, ScrollView, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text, TextInput} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {Member, Relationship, RelationshipTypeDef, toggleId} from '../../utils';
import type {RelationshipTypeFields} from '../../utils';
import {sectionLabel} from '../../components/controls';
import {MemberPickerField, SheetScrim, TypeForm, relColorOf} from './MapParts';

export type RelationshipDraft = {fromId: string; toIds: string[]; typeId: string; note: string};

export const RelationshipEditor = ({rel, presetFromId, types, typeById, hasCustomTypes, typeLabel, typeInverseLabel, typeTitle, roster, facets, memberById,
  onCreateType, onDeleteType, onSubmit, onDelete, onClose, bottomInset, maxHeight}: {
  rel: Relationship | null; presetFromId?: string; types: RelationshipTypeDef[]; typeById: Map<string, RelationshipTypeDef>; hasCustomTypes: boolean;
  typeLabel: (td: RelationshipTypeDef) => string; typeInverseLabel: (td: RelationshipTypeDef) => string; typeTitle: (td: RelationshipTypeDef) => string;
  roster: Member[]; facets: Member[]; memberById: Map<string, Member>;
  onCreateType: (d: RelationshipTypeFields) => Promise<string>; onDeleteType: (td: RelationshipTypeDef, onDeleted: () => void) => void;
  onSubmit: (draft: RelationshipDraft) => void; onDelete: (rel: Relationship) => void; onClose: () => void;
  bottomInset: number; maxHeight: number;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const scrollRef = useRef<ScrollView>(null);
  const [fromId, setFromId] = useState(rel?.fromId || presetFromId || '');
  const [toIds, setToIds] = useState<string[]>(rel?.toId ? [rel.toId] : []);
  const [typeId, setTypeId] = useState(rel?.typeId || '');
  const [note, setNote] = useState(rel?.note || '');
  const [showNewType, setShowNewType] = useState(false);
  const selectedTd = typeById.get(typeId);
  const nameOf = (id: string) => memberById.get(id)?.name || '?';
  const deleteType = (td: RelationshipTypeDef) => {
    if (!td.preset) onDeleteType(td, () => setTypeId(cur => (cur === td.id ? '' : cur)));
  };
  const footerBtn = (label: string, onPress: () => void, color: string, border: string, bg: string, flex: number) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label}
      hitSlop={{top: 6, bottom: 6}} style={{flex, alignItems: 'center', paddingVertical: 12, borderRadius: 8, borderWidth: 1, backgroundColor: bg, borderColor: border}}>
      <Text style={{fontSize: fs(14), fontWeight: '500', color}}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SheetScrim bottomInset={bottomInset} onEscape={onClose} size={{maxHeight}}>
      <ScrollView ref={scrollRef} contentContainerStyle={{padding: 16, paddingBottom: 28}} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={{fontSize: fs(17), fontWeight: '600', color: T.text, marginBottom: 14}}>
          {rel ? t('systemMap.editRelationship') : t('systemMap.addRelationship')}
        </Text>

        <MemberPickerField label={t('systemMap.from')} values={fromId ? [fromId] : []} onPick={setFromId} members={roster} facets={facets} />

        <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 6})}>{t('systemMap.type')}</Text>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6}}>
          {types.map(td => {
            const sel = td.id === typeId;
            const tc = relColorOf(td);
            return (
              <TouchableOpacity key={td.id} onPress={() => setTypeId(td.id)} onLongPress={() => deleteType(td)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityState={{selected: sel}}
                accessibilityLabel={typeTitle(td)}
                accessibilityActions={td.preset ? undefined : [{name: 'longpress', label: t('systemMap.deleteType')}]}
                onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'longpress') deleteType(td); }}
                hitSlop={{top: 6, bottom: 9}} style={{flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6,
                  backgroundColor: sel ? `${tc}25` : T.surface, borderColor: sel ? tc : T.border}}>
                <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: tc}} />
                <Text style={{fontSize: fs(12), color: sel ? tc : T.text}}>{typeTitle(td)}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity onPress={() => setShowNewType(v => !v)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityState={{expanded: showNewType}} accessibilityLabel={t('systemMap.newType')}
            hitSlop={{top: 6, bottom: 9}} style={{borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'transparent', borderColor: T.dim}}>
            <Text style={{fontSize: fs(12), color: T.dim}}>{t('systemMap.newType')}</Text>
          </TouchableOpacity>
        </View>
        {hasCustomTypes && <Text style={{fontSize: fs(9), color: T.muted, marginBottom: 8}}>{t('systemMap.longPressDelete')}</Text>}

        {showNewType && (
          <TypeForm saveLabel={t('common.add')} onSave={async d => {
            setTypeId(await onCreateType(d));
            setShowNewType(false);
          }} />
        )}

        {rel ? (
          <MemberPickerField label={t('systemMap.to')} values={toIds.slice(0, 1)} onPick={id => setToIds([id])} members={roster} facets={facets} />
        ) : (
          <MemberPickerField multi label={t('systemMap.to')} values={toIds} onPick={id => setToIds(prev => toggleId(prev, id))} members={roster} facets={facets} />
        )}

        {selectedTd && fromId && toIds.length > 0 && (
          <Text style={{fontSize: fs(11), color: T.muted, marginBottom: 12}}>
            {selectedTd.directional
              ? `${nameOf(fromId)} (${typeLabel(selectedTd)}) → ${toIds.map(nameOf).join(', ')} (${typeInverseLabel(selectedTd)})`
              : `${nameOf(fromId)} ⟷ ${toIds.map(nameOf).join(', ')} (${typeLabel(selectedTd)})`}
          </Text>
        )}

        <Text style={sectionLabel(T, {marginBottom: 6})}>{t('modal.note')}</Text>
        <TextInput value={note} onChangeText={setNote} accessibilityLabel={t('systemMap.notePlaceholder')} placeholder={t('systemMap.notePlaceholder')} placeholderTextColor={T.muted} multiline
          onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), 80)}
          style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13), minHeight: 60, textAlignVertical: 'top', marginBottom: 16}} />

        <View style={{flexDirection: 'row', gap: 10}}>
          {rel && footerBtn(t('common.delete'), () => onDelete(rel), T.danger, `${T.danger}60`, 'transparent', 1)}
          {footerBtn(t('common.cancel'), onClose, T.dim, T.border, 'transparent', 1)}
          {footerBtn(t('common.save'), () => onSubmit({fromId, toIds, typeId, note}), T.accent, `${T.accent}40`, T.accentBg, 2)}
        </View>
      </ScrollView>
    </SheetScrim>
  );
};
