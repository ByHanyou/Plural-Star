import React, {useState, useRef} from 'react';
import {View, ScrollView, TouchableOpacity, Alert, Modal, KeyboardAvoidingView, AccessibilityInfo, findNodeHandle} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {PALETTE} from '../theme';
import {ColorPicker} from '../components/ColorPicker';
import {Avatar} from '../components/Avatar';
import {useKeyboardBehavior} from '../hooks/useKeyboardBehavior';
import {Member, MemberGroup, GroupNodeKind, FrontState, FrontTierKey, uid, childrenOf, descendantsOf, isDescendant, groupKind, groupParent, sortMembersBySearch, colorName} from '../utils';

interface Props {
  theme: any;
  members: Member[];
  groups: MemberGroup[];
  onSaveGroups: (g: MemberGroup[]) => void;
  onViewMember?: (id: string) => void;
  front?: FrontState | null;
  onQuickFront?: (memberId: string, tier: FrontTierKey) => void;
  onRemoveFromFront?: (memberId: string) => void;
  onAddToGroup?: (memberIds: string[], groupId: string) => void;
  onRemoveFromGroup?: (memberIds: string[], groupId: string) => void;
}

export const SystemManagerScreen = ({theme: T, members, groups, onSaveGroups, onViewMember, front, onQuickFront, onRemoveFromFront, onAddToGroup, onRemoveFromGroup}: Props) => {
  const {t} = useTranslation();
  const fs = (s: number) => Math.round(s * (T.textScale || 1));
  const behavior = useKeyboardBehavior();

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [newKind, setNewKind] = useState<GroupNodeKind>('group');
  const [showNewColor, setShowNewColor] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string>(PALETTE[0]);
  const [movingIds, setMovingIds] = useState<string[] | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [browse, setBrowse] = useState(false);
  const [browseId, setBrowseId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [quickFrontFor, setQuickFrontFor] = useState<Member | null>(null);
  const [addPickOpen, setAddPickOpen] = useState(false);
  const [addPickIds, setAddPickIds] = useState<string[]>([]);
  const [addSearch, setAddSearch] = useState('');
  const [removeMode, setRemoveMode] = useState(false);
  const [removeIds, setRemoveIds] = useState<string[]>([]);

  const isFronting = (id: string): boolean => !!front && (
    (front.primary?.memberIds || []).includes(id) ||
    (front.coFront?.memberIds || []).includes(id) ||
    (front.coConscious?.memberIds || []).includes(id)
  );

  const goBrowseTo = (id: string | null) => {
    setBrowseId(id);
    setRemoveMode(false);
    setRemoveIds([]);
    setAddPickOpen(false);
    setAddPickIds([]);
    setAddSearch('');
  };

  const addNode = () => {
    const name = newName.trim();
    if (!name) return;
    const siblings = childrenOf(groups, null);
    onSaveGroups([...groups, {id: uid(), name, color: newColor, kind: newKind, parentId: null, sortOrder: siblings.length}]);
    setNewName('');
  };

  const moveNodes = (ids: string[], newParentId: string | null) => {
    const valid = ids.filter(id => newParentId !== id && !(newParentId && isDescendant(groups, newParentId, id)));
    if (valid.length === 0) { setMovingIds(null); return; }
    const validSet = new Set(valid);
    const siblings = childrenOf(groups, newParentId).filter(g => !validSet.has(g.id));
    const orderBase = siblings.length;
    const orderMap = new Map(valid.map((id, i) => [id, orderBase + i]));
    onSaveGroups(groups.map(g => validSet.has(g.id) ? {...g, parentId: newParentId, sortOrder: orderMap.get(g.id)!} : g));
    setMovingIds(null);
    setSelectMode(false);
    setSelectedIds([]);
  };

  const moveBtnRefs = useRef<Record<string, any>>({});

  const reorderNode = (id: string, direction: 'up' | 'down') => {
    const node = groups.find(g => g.id === id);
    if (!node) return;
    const sibs = childrenOf(groups, groupParent(node));
    const idx = sibs.findIndex(s => s.id === id);
    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (idx === -1 || swapWith < 0 || swapWith >= sibs.length) return;
    const neighbor = sibs[swapWith];
    const arr = [...sibs];
    [arr[idx], arr[swapWith]] = [arr[swapWith], arr[idx]];
    const orderMap = new Map(arr.map((s, i) => [s.id, i]));
    onSaveGroups(groups.map(g => orderMap.has(g.id) ? {...g, sortOrder: orderMap.get(g.id)!} : g));
    const msg = swapWith === 0
      ? t('common.movedToTop')
      : swapWith === sibs.length - 1
        ? t('common.movedToBottom')
        : direction === 'up'
          ? t('common.movedAbove', {name: neighbor.name})
          : t('common.movedBelow', {name: neighbor.name});
    AccessibilityInfo.announceForAccessibility(msg);
    setTimeout(() => {
      const el = moveBtnRefs.current[id];
      const tag = el ? findNodeHandle(el) : null;
      if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
    }, 100);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds([]);
  };

  const nearestSurvivor = (g: MemberGroup, removedSet: Set<string>): string | null => {
    let pid = groupParent(g);
    const byId = new Map(groups.map(x => [x.id, x]));
    while (pid && removedSet.has(pid)) {
      const parent = byId.get(pid);
      pid = parent ? groupParent(parent) : null;
    }
    return pid;
  };

  const massDelete = () => {
    if (selectedIds.length === 0) return;
    const removedSet = new Set(selectedIds);
    const orphanDescendants = selectedIds
      .flatMap(id => descendantsOf(groups, id))
      .filter(d => !removedSet.has(d.id));
    const finishSimple = () => {
      onSaveGroups(groups.filter(g => !removedSet.has(g.id)));
      exitSelectMode();
    };
    if (orphanDescendants.length === 0) {
      Alert.alert(t('memberGroups.deleteGroup'), t('systemManager.deleteSelectedMsg', {count: selectedIds.length}), [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('common.delete'), style: 'destructive', onPress: finishSimple},
      ]);
      return;
    }
    Alert.alert(
      t('memberGroups.deleteGroup'),
      t('memberGroups.deleteWithChildrenMsg', {count: orphanDescendants.length}),
      [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('memberGroups.promoteChildren'), onPress: () => {
          onSaveGroups(groups
            .filter(g => !removedSet.has(g.id))
            .map(g => g.parentId && removedSet.has(g.parentId) ? {...g, parentId: nearestSurvivor(g, removedSet)} : g));
          exitSelectMode();
        }},
        {text: t('memberGroups.deleteSubtree'), style: 'destructive', onPress: () => {
          const allGone = new Set([...selectedIds, ...selectedIds.flatMap(id => descendantsOf(groups, id).map(d => d.id))]);
          onSaveGroups(groups.filter(g => !allGone.has(g.id)));
          exitSelectMode();
        }},
      ],
    );
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
    const moving = movingIds;
    const canDrop = !!moving && !moving.includes(g.id) && !moving.some(id => isDescendant(groups, g.id, id));
    const isSelected = selectedIds.includes(g.id);
    const sibs = childrenOf(groups, groupParent(g));
    const sibIdx = sibs.findIndex(s => s.id === g.id);
    return (
      <View key={g.id}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, paddingLeft: depth * 16}}>
          {depth > 0 && <Text style={{color: T.muted, fontSize: fs(12)}}>└</Text>}
          {selectMode && !moving && (
            <TouchableOpacity onPress={() => toggleSelected(g.id)} accessibilityRole="checkbox" accessibilityState={{checked: isSelected}} accessibilityLabel={g.name} style={{padding: 2}}>
              <Text style={{fontSize: fs(16), color: isSelected ? T.accent : T.muted}}>{isSelected ? '☑' : '☐'}</Text>
            </TouchableOpacity>
          )}
          {isEditing ? (
            <TouchableOpacity onPress={() => { const idx = PALETTE.indexOf(editColor); setEditColor(PALETTE[(idx + 1) % PALETTE.length]); }} accessibilityRole="button" accessibilityLabel={`${t('memberGroups.changeColor')}, ${colorName(editColor, t)}`}
              style={{width: 18, height: 18, borderRadius: isSub ? 4 : 9, backgroundColor: editColor, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)'}} />
          ) : (
            <View style={{width: 12, height: 12, borderRadius: isSub ? 3 : 6, backgroundColor: g.color || T.accent}} />
          )}
          {isEditing ? (
            <View style={{flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center'}}>
              <TextInput value={editName} onChangeText={setEditName} autoFocus accessibilityLabel={t('memberGroups.groupName')} style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, fontSize: fs(13)}} onSubmitEditing={() => renameNode(g.id)} returnKeyType="done" />
              <TouchableOpacity onPress={() => renameNode(g.id)} accessibilityRole="button" accessibilityLabel={t('common.save')}><Text style={{color: T.success, fontSize: fs(14)}}>✓</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setEditId(null)} accessibilityRole="button" accessibilityLabel={t('common.cancel')}><Text style={{color: T.dim, fontSize: fs(12)}}>✕</Text></TouchableOpacity>
            </View>
          ) : (
            <>
              <Text onPress={selectMode && !moving ? () => toggleSelected(g.id) : undefined} style={{flex: 1, fontSize: fs(14), color: T.text, fontWeight: '500'}} numberOfLines={1}>{isSub ? '⊟ ' : ''}{g.name}</Text>
              {canDrop ? (
                <TouchableOpacity onPress={() => moveNodes(moving!, g.id)} accessibilityRole="button" accessibilityLabel={`${t('memberGroups.moveHere')}: ${g.name}`} style={{paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, backgroundColor: T.successBg, borderColor: `${T.success}40`}}><Text style={{fontSize: fs(11), color: T.success}}>{t('memberGroups.moveHere')}</Text></TouchableOpacity>
              ) : moving && moving.includes(g.id) ? (
                <Text style={{fontSize: fs(11), color: T.muted, fontStyle: 'italic'}}>{t('memberGroups.moving')}</Text>
              ) : selectMode || moving ? (
                <Text style={{fontSize: fs(11), color: T.muted}}>{memberCount}</Text>
              ) : (
                <>
                  <Text style={{fontSize: fs(11), color: T.muted}}>{memberCount}</Text>
                  <TouchableOpacity ref={(el) => { moveBtnRefs.current[g.id] = el; }} onPress={() => reorderNode(g.id, 'up')} disabled={sibIdx <= 0} accessibilityRole="button" accessibilityState={{disabled: sibIdx <= 0}} accessibilityLabel={sibIdx <= 0 ? `${t('members.moveUp')} ${g.name}` : `${t('members.moveUp')} ${g.name}, ${t('members.moveAbove', {name: sibs[sibIdx - 1].name})}`} style={{padding: 2, opacity: sibIdx <= 0 ? 0.25 : 1}}><Text style={{fontSize: fs(13), color: T.dim}}>▲</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => reorderNode(g.id, 'down')} disabled={sibIdx === sibs.length - 1} accessibilityRole="button" accessibilityState={{disabled: sibIdx === sibs.length - 1}} accessibilityLabel={sibIdx === sibs.length - 1 ? `${t('members.moveDown')} ${g.name}` : `${t('members.moveDown')} ${g.name}, ${t('members.moveBelow', {name: sibs[sibIdx + 1].name})}`} style={{padding: 2, opacity: sibIdx === sibs.length - 1 ? 0.25 : 1}}><Text style={{fontSize: fs(13), color: T.dim}}>▼</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setMovingIds([g.id])} accessibilityRole="button" accessibilityLabel={`${t('memberGroups.move')} ${g.name}`}><Text style={{fontSize: fs(15), color: T.dim}}>⇄</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => {setEditId(g.id); setEditName(g.name); setEditColor(g.color || PALETTE[0]);}} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t('common.edit')} ${g.name}`} style={{paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}><Text style={{fontSize: fs(11), fontWeight: '500', color: T.accent}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('common.edit')}</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteNode(g.id)} style={{padding: 4}} accessibilityRole="button" accessibilityLabel={`${t('common.delete')} ${g.name}`}><Text style={{fontSize: fs(12), color: T.danger}}>✕</Text></TouchableOpacity>
                </>
              )}
            </>
          )}
        </View>
        {isEditing && (
          <View style={{paddingLeft: depth * 16 + 24, paddingRight: 8, marginBottom: 10}}>
            <ColorPicker value={editColor} onChange={setEditColor} T={T} />
          </View>
        )}
        {childrenOf(groups, g.id).map(c => renderNode(c, depth + 1))}
      </View>
    );
  };

  const browseEligible = members.filter(m => !m.archived && !m.isCustomFront);
  if (browse) {
    const folders = childrenOf(groups, browseId);
    const folderMembers = browseId === null
      ? browseEligible.filter(m => !(m.groupIds || []).length)
      : browseEligible.filter(m => (m.groupIds || []).includes(browseId));
    const current = browseId ? groups.find(g => g.id === browseId) || null : null;
    const addCandidates = current
      ? sortMembersBySearch(browseEligible.filter(m => !(m.groupIds || []).includes(current.id) && (!addSearch || m.name.toLowerCase().includes(addSearch.toLowerCase()))), addSearch)
      : [];
    const toggleAddPick = (id: string) => setAddPickIds(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
    const toggleRemovePick = (id: string) => setRemoveIds(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
    const confirmRemove = () => {
      if (!current || removeIds.length === 0) return;
      Alert.alert(t('memberGroups.removeMembers'), t('members.selectedCount', {count: removeIds.length}), [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('network.remove'), style: 'destructive', onPress: () => {
          onRemoveFromGroup?.(removeIds, current.id);
          setRemoveMode(false);
          setRemoveIds([]);
        }},
      ]);
    };
    return (
      <ScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={{padding: 16, paddingBottom: 120}}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14}}>
          {browseId !== null && (
            <TouchableOpacity onPress={() => goBrowseTo(current?.parentId ?? null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{padding: 4}}>
              <Text style={{fontSize: fs(18), color: T.dim}} allowFontScaling={false}>←</Text>
            </TouchableOpacity>
          )}
          <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(16), fontWeight: '600', color: current?.color || T.text}} numberOfLines={1}>{current ? current.name : t('systemManager.title')}</Text>
          {current && onAddToGroup && !removeMode && (
            <TouchableOpacity onPress={() => { setAddPickIds([]); setAddSearch(''); setAddPickOpen(true); }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('memberGroups.addMembers')}
              style={{width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
              <Text style={{fontSize: fs(15), color: T.accent}} allowFontScaling={false}>＋</Text>
            </TouchableOpacity>
          )}
          {current && onRemoveFromGroup && folderMembers.length > 0 && !removeMode && (
            <TouchableOpacity onPress={() => { setRemoveIds([]); setRemoveMode(true); }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('memberGroups.removeMembers')}
              style={{width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: T.dangerBg, borderColor: `${T.danger}40`}}>
              <Text style={{fontSize: fs(15), color: T.danger}} allowFontScaling={false}>−</Text>
            </TouchableOpacity>
          )}
          {!removeMode && (
            <TouchableOpacity onPress={() => setBrowse(false)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.edit')}
              style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
              <Text style={{fontSize: fs(11), color: T.dim}}>{t('common.edit')}</Text>
            </TouchableOpacity>
          )}
        </View>
        {removeMode && current && (
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, padding: 8, borderRadius: 8, backgroundColor: T.surface, borderWidth: 1, borderColor: `${T.danger}40`}}>
            <Text style={{flex: 1, fontSize: fs(11), color: T.dim}}>{t('members.selectedCount', {count: removeIds.length})}</Text>
            <TouchableOpacity onPress={confirmRemove} disabled={removeIds.length === 0} accessibilityRole="button" accessibilityState={{disabled: removeIds.length === 0}} accessibilityLabel={t('memberGroups.removeMembers')}
              style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, backgroundColor: T.dangerBg, borderColor: `${T.danger}40`, opacity: removeIds.length === 0 ? 0.45 : 1}}>
              <Text style={{fontSize: fs(11), fontWeight: '600', color: T.danger}}>{t('network.remove')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setRemoveMode(false); setRemoveIds([]); }} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
              <Text style={{fontSize: fs(11), color: T.dim}}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        )}
        {folders.map(g => {
          const cnt = browseEligible.filter(m => (m.groupIds || []).includes(g.id)).length;
          const subs = childrenOf(groups, g.id).length;
          return (
            <TouchableOpacity key={g.id} onPress={() => goBrowseTo(g.id)} activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel={`${g.name}, ${groupKind(g) === 'subsystem' ? t('memberGroups.subsystem') : t('memberGroups.group')}, ${cnt}`}
              style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: T.border, backgroundColor: T.card, marginBottom: 8}}>
              <View style={{width: 16, height: 16, borderRadius: groupKind(g) === 'subsystem' ? 4 : 8, backgroundColor: g.color || T.accent}} />
              <Text style={{flex: 1, fontSize: fs(14), fontWeight: '500', color: T.text}} numberOfLines={1}>{g.name}</Text>
              <Text style={{fontSize: fs(11), color: T.muted}}>{subs > 0 ? `${subs} ⊟ · ` : ''}{cnt}</Text>
              <Text style={{fontSize: fs(16), color: T.dim}} allowFontScaling={false}>›</Text>
            </TouchableOpacity>
          );
        })}
        {folderMembers.map(m => {
          if (removeMode) {
            const checked = removeIds.includes(m.id);
            return (
              <TouchableOpacity key={m.id} onPress={() => toggleRemovePick(m.id)} activeOpacity={0.7}
                accessibilityRole="checkbox" accessibilityState={{checked}} accessibilityLabel={m.name}
                style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 10, marginBottom: 4}}>
                <Text style={{fontSize: fs(16), color: checked ? T.danger : T.muted}}>{checked ? '☑' : '☐'}</Text>
                <Avatar member={m} size={30} T={T} />
                <View style={{flex: 1}}>
                  <Text style={{fontSize: fs(14), color: T.text}} numberOfLines={1}>{m.name}</Text>
                  {[m.pronouns, m.role].filter(Boolean).length > 0 ? <Text style={{fontSize: fs(11), color: T.dim}} numberOfLines={1}>{[m.pronouns, m.role].filter(Boolean).join(' · ')}</Text> : null}
                </View>
              </TouchableOpacity>
            );
          }
          const fronting = isFronting(m.id);
          return (
            <View key={m.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 10, marginBottom: 4}}>
              <TouchableOpacity onPress={() => onViewMember && onViewMember(m.id)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={[m.name, m.pronouns, m.role].filter(Boolean).join(', ')}
                style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10}}>
                <Avatar member={m} size={30} T={T} />
                <View style={{flex: 1}}>
                  <Text style={{fontSize: fs(14), color: T.text}} numberOfLines={1}>{m.name}</Text>
                  {[m.pronouns, m.role].filter(Boolean).length > 0 ? <Text style={{fontSize: fs(11), color: T.dim}} numberOfLines={1}>{[m.pronouns, m.role].filter(Boolean).join(' · ')}</Text> : null}
                </View>
              </TouchableOpacity>
              {onQuickFront && onRemoveFromFront && (
                fronting ? (
                  <TouchableOpacity
                    onPress={() => Alert.alert(t('members.removeFromFront'), t('members.removeFromFrontMsg', {name: m.name}), [
                      {text: t('common.cancel'), style: 'cancel'},
                      {text: t('network.remove'), style: 'destructive', onPress: () => onRemoveFromFront(m.id)},
                    ])}
                    accessibilityRole="button" accessibilityLabel={`${t('members.removeFromFront')} — ${m.name}`}
                    style={{width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: T.dangerBg, borderColor: `${T.danger}40`}}>
                    <Text style={{fontSize: fs(15), color: T.danger}} allowFontScaling={false}>−</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => setQuickFrontFor(m)}
                    accessibilityRole="button" accessibilityLabel={`${t('members.addToFront')} — ${m.name}`}
                    style={{width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
                    <Text style={{fontSize: fs(15), color: T.accent}} allowFontScaling={false}>＋</Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          );
        })}
        {folders.length === 0 && folderMembers.length === 0 && (
          <Text style={{fontSize: fs(12), color: T.muted, fontStyle: 'italic', marginTop: 8}}>{t('memberGroups.none')}</Text>
        )}

        <Modal visible={!!quickFrontFor} transparent animationType="fade" onRequestClose={() => setQuickFrontFor(null)}>
          <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24}}>
            <View style={{borderRadius: 16, borderWidth: 1, padding: 18, width: '100%', maxWidth: 360, backgroundColor: T.card, borderColor: T.border}}>
              <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, marginBottom: 12}} numberOfLines={1}>{t('members.addToFront')} — {quickFrontFor?.name}</Text>
              {(['primary', 'coFront', 'coConscious'] as FrontTierKey[]).map(tier => (
                <TouchableOpacity key={tier}
                  onPress={() => { const m = quickFrontFor; setQuickFrontFor(null); if (m) onQuickFront?.(m.id, tier); }}
                  accessibilityRole="button"
                  accessibilityLabel={tier === 'primary' ? t('tier.primaryFront') : tier === 'coFront' ? t('tier.coFront') : t('tier.coConscious')}
                  style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border}}>
                  <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: tier === 'primary' ? T.accent : tier === 'coFront' ? T.info : T.success}} />
                  <Text style={{fontSize: fs(14), color: T.text}}>{tier === 'primary' ? t('tier.primaryFront') : tier === 'coFront' ? t('tier.coFront') : t('tier.coConscious')}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setQuickFrontFor(null)} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
                style={{alignItems: 'center', paddingVertical: 10, marginTop: 12, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
                <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={addPickOpen} transparent animationType="fade" onRequestClose={() => setAddPickOpen(false)}>
          <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24}}>
            <View style={{borderRadius: 16, borderWidth: 1, padding: 18, width: '100%', maxWidth: 400, maxHeight: '80%', backgroundColor: T.card, borderColor: T.border}}>
              <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, marginBottom: 10}} numberOfLines={1}>{t('memberGroups.addMembers')} — {current?.name}</Text>
              <TextInput value={addSearch} onChangeText={setAddSearch} placeholder={t('common.search')} placeholderTextColor={T.muted}
                accessibilityLabel={t('common.search')}
                style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: fs(13), marginBottom: 10}} />
              <ScrollView style={{flexShrink: 1}} keyboardShouldPersistTaps="handled">
                {addCandidates.map(m => {
                  const checked = addPickIds.includes(m.id);
                  return (
                    <TouchableOpacity key={m.id} onPress={() => toggleAddPick(m.id)} activeOpacity={0.7}
                      accessibilityRole="checkbox" accessibilityState={{checked}} accessibilityLabel={m.name}
                      style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8}}>
                      <Text style={{fontSize: fs(16), color: checked ? T.accent : T.muted}}>{checked ? '☑' : '☐'}</Text>
                      <Avatar member={m} size={26} T={T} />
                      <Text style={{flex: 1, fontSize: fs(13), color: T.text}} numberOfLines={1}>{m.name}</Text>
                    </TouchableOpacity>
                  );
                })}
                {addCandidates.length === 0 && (
                  <Text style={{fontSize: fs(12), color: T.muted, fontStyle: 'italic', paddingVertical: 8}}>{t('members.noMembers')}</Text>
                )}
              </ScrollView>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12}}>
                <Text style={{flex: 1, fontSize: fs(11), color: T.dim}}>{t('members.selectedCount', {count: addPickIds.length})}</Text>
                <TouchableOpacity onPress={() => setAddPickOpen(false)} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
                  style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
                  <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { if (current && addPickIds.length > 0) { onAddToGroup?.(addPickIds, current.id); } setAddPickOpen(false); setAddPickIds([]); }}
                  disabled={addPickIds.length === 0}
                  accessibilityRole="button" accessibilityState={{disabled: addPickIds.length === 0}} accessibilityLabel={t('common.add')}
                  style={{paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, opacity: addPickIds.length === 0 ? 0.45 : 1}}>
                  <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('common.add')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={{flex: 1}} behavior={behavior}>
    <ScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={{padding: 16, paddingBottom: 120}} keyboardShouldPersistTaps="handled">
      <Text style={{fontSize: fs(11), color: T.dim, marginBottom: 14, lineHeight: 18}}>{t('systemManager.desc')}</Text>
      <View style={{flexDirection: 'row', marginBottom: 12}}>
        <TouchableOpacity onPress={() => { goBrowseTo(null); setBrowse(true); }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemManager.browse')}
          style={{flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
          <Text style={{fontSize: fs(13)}} allowFontScaling={false}>🗂</Text>
          <Text style={{fontSize: fs(12), fontWeight: '500', color: T.dim}}>{t('systemManager.browse')}</Text>
        </TouchableOpacity>
        <View style={{flex: 1}} />
      </View>
      {groups.length > 0 && !movingIds && (
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12}}>
          {selectMode ? (
            <>
              <Text style={{fontSize: fs(11), color: T.dim}}>{t('members.selectedCount', {count: selectedIds.length})}</Text>
              <TouchableOpacity onPress={() => setSelectedIds(groups.map(g => g.id))} accessibilityRole="button" accessibilityLabel={t('members.selectAll')}><Text style={{fontSize: fs(11), color: T.accent}}>{t('members.selectAll')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setSelectedIds([])} accessibilityRole="button" accessibilityLabel={t('members.selectNone')}><Text style={{fontSize: fs(11), color: T.accent}}>{t('members.selectNone')}</Text></TouchableOpacity>
              <View style={{flex: 1}} />
              <TouchableOpacity onPress={() => { if (selectedIds.length > 0) setMovingIds([...selectedIds]); }} disabled={selectedIds.length === 0} accessibilityRole="button" accessibilityState={{disabled: selectedIds.length === 0}} accessibilityLabel={t('memberGroups.move')}
                style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, opacity: selectedIds.length === 0 ? 0.45 : 1}}>
                <Text style={{fontSize: fs(11), fontWeight: '600', color: T.accent}}>{t('memberGroups.move')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={massDelete} disabled={selectedIds.length === 0} accessibilityRole="button" accessibilityState={{disabled: selectedIds.length === 0}} accessibilityLabel={t('common.delete')}
                style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, backgroundColor: T.dangerBg, borderColor: `${T.danger}40`, opacity: selectedIds.length === 0 ? 0.45 : 1}}>
                <Text style={{fontSize: fs(11), fontWeight: '600', color: T.danger}}>{t('common.delete')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={exitSelectMode} accessibilityRole="button" accessibilityLabel={t('common.cancel')}><Text style={{fontSize: fs(11), color: T.dim}}>{t('common.cancel')}</Text></TouchableOpacity>
            </>
          ) : (
            <>
              <View style={{flex: 1}} />
              <TouchableOpacity onPress={() => setSelectMode(true)} accessibilityRole="button" accessibilityLabel={t('members.select')}
                style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
                <Text style={{fontSize: fs(11), color: T.dim}}>{t('members.select')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
      {movingIds && (
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, padding: 8, borderRadius: 8, backgroundColor: T.surface, borderWidth: 1, borderColor: `${T.accent}40`}}>
          <Text style={{flex: 1, fontSize: fs(11), color: T.dim}}>{t('memberGroups.movePrompt')}</Text>
          <TouchableOpacity onPress={() => moveNodes(movingIds!, null)} accessibilityRole="button"><Text style={{fontSize: fs(11), color: T.accent, fontWeight: '600'}}>{t('memberGroups.toRoot')}</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setMovingIds(null)} accessibilityRole="button"><Text style={{fontSize: fs(11), color: T.dim}}>{t('common.cancel')}</Text></TouchableOpacity>
        </View>
      )}
      {childrenOf(groups, null).map(g => renderNode(g, 0))}
      {groups.length === 0 && <Text style={{fontSize: fs(12), color: T.muted, fontStyle: 'italic', marginBottom: 10}}>{t('memberGroups.none')}</Text>}
      <View style={{flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 8}}>
        <TouchableOpacity onPress={() => setShowNewColor(s => !s)}
          accessibilityRole="button" accessibilityState={{expanded: showNewColor}} accessibilityLabel={`${t('memberGroups.changeColor')}, ${colorName(newColor, t)}`}
          style={{width: 28, height: 28, borderRadius: newKind === 'subsystem' ? 6 : 14, backgroundColor: newColor, borderWidth: 2, borderColor: showNewColor ? '#fff' : 'rgba(255,255,255,0.15)'}} />
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
      {showNewColor && (
        <View style={{marginTop: 10, marginBottom: 4}}>
          <ColorPicker value={newColor} onChange={setNewColor} T={T} />
        </View>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
};
