import React, {useState} from 'react';
import {View, ScrollView, TouchableOpacity, Alert} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {PALETTE} from '../theme';
import {Member, MemberGroup, GroupNodeKind, uid, childrenOf, descendantsOf, isDescendant, groupKind} from '../utils';

interface Props {
  theme: any;
  members: Member[];
  groups: MemberGroup[];
  onSaveGroups: (g: MemberGroup[]) => void;
}

export const SystemManagerScreen = ({theme: T, members, groups, onSaveGroups}: Props) => {
  const {t} = useTranslation();
  const fs = (s: number) => Math.round(s * (T.textScale || 1));

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [newKind, setNewKind] = useState<GroupNodeKind>('group');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string>(PALETTE[0]);
  const [movingId, setMovingId] = useState<string | null>(null);

  const addNode = () => {
    const name = newName.trim();
    if (!name) return;
    const siblings = childrenOf(groups, null);
    onSaveGroups([...groups, {id: uid(), name, color: newColor, kind: newKind, parentId: null, sortOrder: siblings.length}]);
    setNewName('');
  };

  const moveNode = (id: string, newParentId: string | null) => {
    if (newParentId === id || (newParentId && isDescendant(groups, newParentId, id))) { setMovingId(null); return; }
    const siblings = childrenOf(groups, newParentId).filter(g => g.id !== id);
    onSaveGroups(groups.map(g => g.id === id ? {...g, parentId: newParentId, sortOrder: siblings.length} : g));
    setMovingId(null);
  };

  const deleteNode = (id: string) => {
    const node = groups.find(g => g.id === id);
    const kids = descendantsOf(groups, id);
    const removeIds = (ids: string[]) => onSaveGroups(groups.filter(g => !ids.includes(g.id)));
    if (kids.length === 0) {
      Alert.alert(t('memberGroups.deleteGroup'), t('memberGroups.deleteGroupMsg'), [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('common.delete'), style: 'destructive', onPress: () => removeIds([id])},
      ]);
      return;
    }
    Alert.alert(
      t('memberGroups.deleteGroup'),
      t('memberGroups.deleteWithChildrenMsg', {count: kids.length}),
      [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('memberGroups.promoteChildren'), onPress: () => {
          const parent = node ? (node.parentId ?? null) : null;
          onSaveGroups(groups.filter(g => g.id !== id).map(g => g.parentId === id ? {...g, parentId: parent} : g));
        }},
        {text: t('memberGroups.deleteSubtree'), style: 'destructive', onPress: () => removeIds([id, ...kids.map(k => k.id)])},
      ],
    );
  };

  const renameNode = (id: string) => {
    const name = editName.trim();
    if (!name) return;
    onSaveGroups(groups.map(g => g.id === id ? {...g, name, color: editColor} : g));
    setEditId(null); setEditName('');
  };

  const renderNode = (g: MemberGroup, depth: number): React.ReactNode => {
    const isEditing = editId === g.id;
    const isSub = groupKind(g) === 'subsystem';
    const memberCount = members.filter(m => (m.groupIds || []).includes(g.id)).length;
    const moving = movingId;
    const canDrop = !!moving && moving !== g.id && !isDescendant(groups, g.id, moving);
    return (
      <View key={g.id}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, paddingLeft: depth * 16}}>
          {depth > 0 && <Text style={{color: T.muted, fontSize: fs(12)}}>└</Text>}
          {isEditing ? (
            <TouchableOpacity onPress={() => { const idx = PALETTE.indexOf(editColor); setEditColor(PALETTE[(idx + 1) % PALETTE.length]); }} accessibilityRole="button" accessibilityLabel={t('memberGroups.changeColor')}
              style={{width: 18, height: 18, borderRadius: isSub ? 4 : 9, backgroundColor: editColor, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)'}} />
          ) : (
            <View style={{width: 12, height: 12, borderRadius: isSub ? 3 : 6, backgroundColor: g.color || T.accent}} />
          )}
          {isEditing ? (
            <View style={{flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center'}}>
              <TextInput value={editName} onChangeText={setEditName} autoFocus style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, fontSize: fs(13)}} onSubmitEditing={() => renameNode(g.id)} returnKeyType="done" />
              <TouchableOpacity onPress={() => renameNode(g.id)} accessibilityRole="button" accessibilityLabel={t('common.save')}><Text style={{color: T.success, fontSize: fs(14)}}>✓</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setEditId(null)} accessibilityRole="button" accessibilityLabel={t('common.cancel')}><Text style={{color: T.dim, fontSize: fs(12)}}>✕</Text></TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={{flex: 1, fontSize: fs(14), color: T.text, fontWeight: '500'}} numberOfLines={1}>{isSub ? '⊟ ' : ''}{g.name}</Text>
              {canDrop ? (
                <TouchableOpacity onPress={() => moveNode(moving!, g.id)} accessibilityRole="button" accessibilityLabel={`${t('memberGroups.moveHere')}: ${g.name}`} style={{paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, backgroundColor: T.successBg, borderColor: `${T.success}40`}}><Text style={{fontSize: fs(11), color: T.success}}>{t('memberGroups.moveHere')}</Text></TouchableOpacity>
              ) : moving === g.id ? (
                <Text style={{fontSize: fs(11), color: T.muted, fontStyle: 'italic'}}>{t('memberGroups.moving')}</Text>
              ) : (
                <>
                  <Text style={{fontSize: fs(11), color: T.muted}}>{memberCount}</Text>
                  <TouchableOpacity onPress={() => setMovingId(g.id)} accessibilityRole="button" accessibilityLabel={`${t('memberGroups.move')} ${g.name}`}><Text style={{fontSize: fs(15), color: T.dim}}>⇄</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => {setEditId(g.id); setEditName(g.name); setEditColor(g.color || PALETTE[0]);}} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t('common.edit')} ${g.name}`} style={{paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}><Text style={{fontSize: fs(11), fontWeight: '500', color: T.accent}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('common.edit')}</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteNode(g.id)} style={{padding: 4}} accessibilityRole="button" accessibilityLabel={`${t('common.delete')} ${g.name}`}><Text style={{fontSize: fs(12), color: T.danger}}>✕</Text></TouchableOpacity>
                </>
              )}
            </>
          )}
        </View>
        {childrenOf(groups, g.id).map(c => renderNode(c, depth + 1))}
      </View>
    );
  };

  return (
    <ScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={{padding: 16, paddingBottom: 32}}>
      <Text style={{fontSize: fs(11), color: T.dim, marginBottom: 14, lineHeight: 18}}>{t('systemManager.desc')}</Text>
      {movingId && (
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, padding: 8, borderRadius: 8, backgroundColor: T.surface, borderWidth: 1, borderColor: `${T.accent}40`}}>
          <Text style={{flex: 1, fontSize: fs(11), color: T.dim}}>{t('memberGroups.movePrompt')}</Text>
          <TouchableOpacity onPress={() => moveNode(movingId!, null)} accessibilityRole="button"><Text style={{fontSize: fs(11), color: T.accent, fontWeight: '600'}}>{t('memberGroups.toRoot')}</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setMovingId(null)} accessibilityRole="button"><Text style={{fontSize: fs(11), color: T.dim}}>{t('common.cancel')}</Text></TouchableOpacity>
        </View>
      )}
      {childrenOf(groups, null).map(g => renderNode(g, 0))}
      {groups.length === 0 && <Text style={{fontSize: fs(12), color: T.muted, fontStyle: 'italic', marginBottom: 10}}>{t('memberGroups.none')}</Text>}
      <View style={{flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 8}}>
        <TouchableOpacity onPress={() => { const idx = PALETTE.indexOf(newColor); setNewColor(PALETTE[(idx + 1) % PALETTE.length]); }}
          accessibilityRole="button" accessibilityLabel={t('memberGroups.changeColor')}
          style={{width: 28, height: 28, borderRadius: newKind === 'subsystem' ? 6 : 14, backgroundColor: newColor, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)'}} />
        <TextInput value={newName} onChangeText={setNewName} placeholder={t('memberGroups.addPlaceholder')} placeholderTextColor={T.muted}
          style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: fs(13)}} onSubmitEditing={addNode} returnKeyType="done" />
        <TouchableOpacity onPress={() => setNewKind(k => k === 'group' ? 'subsystem' : 'group')} activeOpacity={0.7} accessibilityRole="button"
          style={{paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
          <Text style={{fontSize: fs(11), color: T.dim}}>{newKind === 'subsystem' ? t('memberGroups.subsystem') : t('memberGroups.group')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={addNode} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.add')} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
          <Text style={{fontSize: fs(12), fontWeight: '500', color: T.accent}}>{t('common.add')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};
