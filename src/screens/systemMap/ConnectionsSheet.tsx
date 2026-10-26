import React, {useState} from 'react';
import {View, ScrollView, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {RelationshipTypeDef} from '../../utils';
import type {RelationshipTypeFields} from '../../utils';
import {sectionLabel} from '../../components/controls';
import {SheetHeader, SheetScrim, TypeForm, relColorOf} from './MapParts';

export const ConnectionsSheet = ({userTypes, presetTypes, usageByType, typeLabel, typeInverseLabel, typeTitle, onCreateType, onUpdateType, onDeleteType, onClose, bottomInset, maxHeight}: {
  userTypes: RelationshipTypeDef[]; presetTypes: RelationshipTypeDef[]; usageByType: Record<string, number>;
  typeLabel: (td: RelationshipTypeDef) => string; typeInverseLabel: (td: RelationshipTypeDef) => string; typeTitle: (td: RelationshipTypeDef) => string;
  onCreateType: (d: RelationshipTypeFields) => Promise<string>; onUpdateType: (id: string, d: RelationshipTypeFields) => Promise<void>; onDeleteType: (td: RelationshipTypeDef) => void;
  onClose: () => void; bottomInset: number; maxHeight: number;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [showAddType, setShowAddType] = useState(false);
  const [editTypeId, setEditTypeId] = useState<string | null>(null);
  const card = {backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden' as const};

  const typeRow = (td: RelationshipTypeDef) => (
    <View key={td.id} style={{borderBottomWidth: 1, borderBottomColor: T.border}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10}}>
        <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: relColorOf(td)}} />
        <View style={{flex: 1}}>
          <Text style={{fontSize: fs(13), color: T.text}} numberOfLines={1}>{typeTitle(td)}</Text>
          <Text style={{fontSize: fs(10), color: T.muted}}>{t('systemMap.inUse', {count: usageByType[td.id] || 0})}</Text>
        </View>
        <TouchableOpacity onPress={() => { setEditTypeId(editTypeId === td.id ? null : td.id); setShowAddType(false); }} activeOpacity={0.7}
          accessibilityRole="button" accessibilityState={{expanded: editTypeId === td.id}} accessibilityLabel={t('systemMap.editType')}
          hitSlop={{top: 10, bottom: 10}} style={{borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5}}>
          <Text style={{fontSize: fs(11), color: T.accent}}>{t('common.edit')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onDeleteType(td)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemMap.deleteType')} hitSlop={{top: 9, bottom: 9, left: 9, right: 9}} style={{padding: 4}}>
          <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(13), color: T.danger}}>✕</Text>
        </TouchableOpacity>
      </View>
      {editTypeId === td.id && (
        <View style={{paddingHorizontal: 12, paddingBottom: 12}}>
          <TypeForm initial={{...td, name: typeLabel(td), inverseName: td.directional ? typeInverseLabel(td) : td.inverseName}} saveLabel={t('common.save')} onSave={async d => {
            await onUpdateType(td.id, d);
            setEditTypeId(null);
          }} />
        </View>
      )}
    </View>
  );

  return (
    <SheetScrim bottomInset={bottomInset} onEscape={onClose} size={{maxHeight}}>
      <SheetHeader title={t('systemMap.connections')} onClose={onClose} paddingBottom={4} />
      <ScrollView contentContainerStyle={{padding: 16, paddingTop: 8, paddingBottom: 28}} keyboardShouldPersistTaps="handled">
        {showAddType ? (
          <TypeForm saveLabel={t('common.add')} onSave={async d => {
            await onCreateType(d);
            setShowAddType(false);
          }} />
        ) : (
          <TouchableOpacity onPress={() => { setShowAddType(true); setEditTypeId(null); }} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel={t('systemMap.newType')}
            hitSlop={{top: 6, bottom: 6}} style={{borderWidth: 1, borderStyle: 'dashed', borderColor: T.dim, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginBottom: 14}}>
            <Text style={{fontSize: fs(13), color: T.dim}}>{t('systemMap.newType')}</Text>
          </TouchableOpacity>
        )}

        <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{t('systemMap.customTypes')}</Text>
        {userTypes.length === 0 ? (
          <Text style={{fontSize: fs(12), color: T.muted, marginBottom: 14}}>{t('systemMap.noCustomTypes')}</Text>
        ) : (
          <View style={[card, {marginBottom: 14}]}>{userTypes.map(typeRow)}</View>
        )}

        <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{t('systemMap.presetTypes')}</Text>
        <View style={card}>{presetTypes.map(typeRow)}</View>
      </ScrollView>
    </SheetScrim>
  );
};
