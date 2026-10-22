import React from 'react';
import {View, ScrollView, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {Avatar} from '../../components/Avatar';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {Member, Relationship, RelationshipTypeDef} from '../../utils';
import {relColorOf} from './MapParts';

export type MapDepth = 1 | 2 | 3;
const DEPTHS: MapDepth[] = [1, 2, 3];

export const MemberPanel = ({member, rels, relCount, memberById, typeById, depth, onDepth, roleOf, onEditRel, onDeleteRel, onViewMember, onRemove, onClose}: {
  member: Member; rels: Relationship[]; relCount: number; memberById: Map<string, Member>; typeById: Map<string, RelationshipTypeDef>;
  depth: MapDepth; onDepth: (d: MapDepth) => void; roleOf: (r: Relationship) => string;
  onEditRel: (r: Relationship) => void; onDeleteRel: (r: Relationship) => void; onViewMember?: (id: string) => void; onRemove: () => void; onClose: () => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <View style={{position: 'absolute', left: 12, right: 12, bottom: 12, backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 14, maxHeight: 300}}>
      <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10}}>
        <View style={{flexDirection: 'row', gap: 4}}>
          {DEPTHS.map(d => (
            <TouchableOpacity key={d} onPress={() => onDepth(d)} activeOpacity={0.7}
              accessibilityRole="button" accessibilityState={{selected: depth === d}} accessibilityLabel={t('systemMap.depthN', {count: d})}
              hitSlop={{top: 9, bottom: 9, left: 2, right: 2}}
              style={{width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
                backgroundColor: depth === d ? `${T.accent}25` : T.surface, borderColor: depth === d ? T.accent : T.border}}>
              <Text style={{fontSize: fs(11), fontWeight: '600', color: depth === d ? T.accent : T.dim}}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{flex: 1}} />
        {onViewMember && (
          <TouchableOpacity onPress={() => onViewMember(member.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemMap.viewProfile')}
            hitSlop={{top: 9, bottom: 9}} style={{borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginRight: 4}}>
            <Text style={{fontSize: fs(11), color: T.accent}}>{t('systemMap.viewProfile')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onRemove} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemMap.removeFromMap')} hitSlop={{top: 9, bottom: 9, left: 4, right: 9}} style={{padding: 4}}>
          <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(14), color: T.danger}}>⊖</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={{top: 9, bottom: 9, left: 0, right: 9}} style={{padding: 4}}>
          <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(14), color: T.dim}}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8}}>
        <Avatar member={member} size={30} />
        <View style={{flex: 1}}>
          <Text style={{fontSize: fs(15), fontWeight: '600', color: member.color}} numberOfLines={1}>{member.name}</Text>
          <Text style={{fontSize: fs(10), color: T.muted}} numberOfLines={1}>{t('systemMap.relationships', {count: relCount})}</Text>
        </View>
      </View>
      <ScrollView style={{maxHeight: 170}}>
        {rels.length === 0 ? (
          <Text style={{fontSize: fs(12), color: T.dim, paddingVertical: 8}}>{t('systemMap.noneForMember')}</Text>
        ) : rels.map(r => {
          const other = memberById.get(r.fromId === member.id ? r.toId : r.fromId);
          if (!other) return null;
          const role = roleOf(r);
          const color = relColorOf(typeById.get(r.typeId));
          return (
            <View key={r.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border}}>
              <TouchableOpacity onPress={() => onEditRel(r)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={`${role}: ${other.name}`}
                hitSlop={{top: 8, bottom: 10}} style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10}}>
                <Avatar member={other} size={24} />
                <View style={{flex: 1}}>
                  <Text style={{fontSize: fs(13), color: T.text}} numberOfLines={1}>{other.name}</Text>
                  {r.note ? <Text style={{fontSize: fs(10), color: T.muted}} numberOfLines={1}>{r.note}</Text> : null}
                </View>
                <View style={{backgroundColor: `${color}20`, borderWidth: 1, borderColor: `${color}60`, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3}}>
                  <Text style={{fontSize: fs(10), color}}>{role}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDeleteRel(r)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemMap.deleteRelationship')} style={{padding: 4}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                <Text style={{fontSize: fs(12), color: T.danger}} accessibilityElementsHidden importantForAccessibility="no">✕</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};
