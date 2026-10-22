import React, {useMemo, useRef, useState} from 'react';
import {View, TouchableOpacity, Alert, AccessibilityInfo, findNodeHandle} from 'react-native';
import {KeyboardAwareScrollView} from 'react-native-keyboard-controller';
import {useTranslation} from 'react-i18next';
import {Text, TextInput} from '../../components/AppText';
import {Avatar} from '../../components/Avatar';
import {ColorCarousel} from '../../components/ColorCarousel';
import {DragHandle, ReorderLockButton} from '../../components/DragHandle';
import {MemberPicker} from '../../components/MemberPicker';
import {PALETTE, fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {useAppStore} from '../../store/appStore';
import {saveGroups} from '../../store/actions';
import {useDragReorder} from '../../hooks/useDragReorder';
import {reportSaveError} from '../../utils/saveError';
import {announceMove} from '../../utils/announce';
import {pickerPool} from '../../picker/memberPicker';
import {MemberGroup, GroupNodeKind, uid, childrenOf, descendantsOf, isDescendant, groupKind, groupParent, moveGroupsTo, removeGroupsPromoting, removeGroupSubtrees, applySortOrder, colorName, countUp, toggleId} from '../../utils';
import {PickerDialog} from './PickerDialog';

const commitGroups = (next: MemberGroup[]) => { saveGroups(next).catch(reportSaveError); };

export const GroupTreeEditor = ({header, onBrowse}: {header?: React.ReactNode; onBrowse: () => void}) => {
  const T = useTheme();
  const members = useAppStore(s => s.members);
  const groups = useAppStore(s => s.groups);
  const {t} = useTranslation();
  const fs = fontScale(T);
  const descInput = {backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: fs(13), marginTop: 8, minHeight: 60, textAlignVertical: 'top' as const};

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(PALETTE[0]);
  const [newDesc, setNewDesc] = useState('');
  const [newKind, setNewKind] = useState<GroupNodeKind>('group');
  const [showNewColor, setShowNewColor] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string>(PALETTE[0]);
  const [editDesc, setEditDesc] = useState('');
  const [editLinked, setEditLinked] = useState<string | null>(null);
  const [linkPickOpen, setLinkPickOpen] = useState(false);
  const [movingIds, setMovingIds] = useState<string[] | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reorderOn, setReorderOn] = useState(false);
  const moveBtnRefs = useRef<Record<string, View | null>>({});

  const linkPools = [pickerPool('members', members.filter(m => !m.deleted && !m.archived && !m.isCustomFront), t)];
  const linkedFronter = editLinked ? members.find(m => m.id === editLinked && !m.deleted) || null : null;
  const memberCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of members) {
      if (m.deleted || m.archived) continue;
      for (const gid of new Set(m.groupIds || [])) countUp(counts, gid);
    }
    return counts;
  }, [members]);

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds([]);
  };

  const addNode = () => {
    const name = newName.trim();
    if (!name) return;
    const siblings = childrenOf(groups, null);
    commitGroups([...groups, {id: uid(), name, color: newColor, kind: newKind, parentId: null, sortOrder: siblings.length, description: newDesc.trim() || undefined}]);
    setNewName('');
    setNewDesc('');
  };

  const moveNodes = (ids: string[], newParentId: string | null) => {
    const next = moveGroupsTo(groups, ids, newParentId);
    setMovingIds(null);
    if (next === groups) return;
    commitGroups(next);
    exitSelectMode();
  };

  const onDropNode = (_key: string, from: number, to: number, sibIds: string[]) => {
    const ordered = [...sibIds];
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    commitGroups(applySortOrder(groups, ordered));
  };
  const {drag, dragging, registerHeight, makeHandlePanHandlers} = useDragReorder({enabled: reorderOn, onDrop: onDropNode});

  const reorderNode = (id: string, direction: 'up' | 'down') => {
    const node = groups.find(g => g.id === id);
    if (!node) return;
    const sibs = childrenOf(groups, groupParent(node));
    const idx = sibs.findIndex(s => s.id === id);
    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (idx === -1 || swapWith < 0 || swapWith >= sibs.length) return;
    const arr = [...sibs];
    [arr[idx], arr[swapWith]] = [arr[swapWith], arr[idx]];
    commitGroups(applySortOrder(groups, arr.map(s => s.id)));
    announceMove(swapWith, sibs.length, sibs[swapWith].name, direction === 'up');
    setTimeout(() => {
      const el = moveBtnRefs.current[id];
      const tag = el ? findNodeHandle(el) : null;
      if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
    }, 100);
  };

  const confirmDelete = (ids: string[], simpleMsg: string, onDone?: () => void) => {
    const removing = new Set(ids);
    const orphans = ids.flatMap(id => descendantsOf(groups, id)).filter(d => !removing.has(d.id));
    const apply = (next: MemberGroup[]) => {
      commitGroups(next);
      onDone?.();
    };
    if (orphans.length === 0) {
      Alert.alert(t('memberGroups.deleteGroup'), simpleMsg, [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('common.delete'), style: 'destructive', onPress: () => apply(groups.filter(g => !removing.has(g.id)))},
      ]);
      return;
    }
    Alert.alert(t('memberGroups.deleteGroup'), t('memberGroups.deleteWithChildrenMsg', {count: orphans.length}), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('memberGroups.promoteChildren'), onPress: () => apply(removeGroupsPromoting(groups, ids))},
      {text: t('memberGroups.deleteSubtree'), style: 'destructive', onPress: () => apply(removeGroupSubtrees(groups, ids))},
    ]);
  };
  const massDelete = () => {
    if (selectedIds.length > 0) confirmDelete(selectedIds, t('systemManager.deleteSelectedMsg', {count: selectedIds.length}), exitSelectMode);
  };
  const deleteNode = (id: string) => confirmDelete([id], t('memberGroups.deleteGroupMsg'));

  const startEdit = (g: MemberGroup) => {
    setEditId(g.id);
    setEditName(g.name);
    setEditColor(g.color || PALETTE[0]);
    setEditDesc(g.description || '');
    setEditLinked(g.linkedMemberId || null);
  };

  const renameNode = (id: string) => {
    const name = editName.trim();
    if (!name) return;
    commitGroups(groups.map(g => g.id === id ? {...g, name, color: editColor, description: editDesc.trim() || undefined, ...(groupKind(g) === 'subsystem' ? {linkedMemberId: editLinked || undefined} : {})} : g));
    setEditId(null);
    setEditName('');
  };

  const renderNode = (g: MemberGroup, depth: number, seen: Set<string> = new Set()): React.ReactNode => {
    if (seen.has(g.id)) return null;
    seen.add(g.id);
    const isEditing = editId === g.id;
    const isSub = groupKind(g) === 'subsystem';
    const memberCount = memberCounts.get(g.id) || 0;
    const canDrop = !!movingIds && !movingIds.includes(g.id) && !movingIds.some(id => isDescendant(groups, g.id, id));
    const isSelected = selectedIds.includes(g.id);
    const sibs = childrenOf(groups, groupParent(g));
    const sibIdx = sibs.findIndex(s => s.id === g.id);
    const isFirst = sibIdx <= 0;
    const isLast = sibIdx === sibs.length - 1;
    const isDropTarget = dragging && drag.key !== g.id && drag.siblings.length > 0 && drag.siblings[drag.target] === g.id;
    const selectable = selectMode && !movingIds;
    return (
      <View
        key={g.id}
        onLayout={e => registerHeight(g.id, e.nativeEvent.layout.height)}
        style={{
          borderTopWidth: 2,
          borderTopColor: isDropTarget ? T.accent : 'transparent',
          ...(drag.key === g.id ? {transform: [{translateY: drag.dy}], zIndex: 10, elevation: 6} : null),
        }}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, paddingLeft: depth * 16}}>
          <DragHandle active={reorderOn && !selectMode && !movingIds} panHandlers={makeHandlePanHandlers(g.id, () => sibs.map(x => x.id))} name={g.name}
            position={sibIdx + 1} count={sibs.length}
            onStep={dir => reorderNode(g.id, dir === 1 ? 'down' : 'up')} />
          {depth > 0 && <Text style={{color: T.muted, fontSize: fs(12)}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">└</Text>}
          {selectable && (
            <TouchableOpacity onPress={() => setSelectedIds(sel => toggleId(sel, g.id))} accessibilityRole="checkbox" accessibilityState={{checked: isSelected}} accessibilityLabel={g.name} hitSlop={{top: 8, bottom: 10}} style={{padding: 2}}>
              <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(16), color: isSelected ? T.accent : T.muted}}>{isSelected ? '☑' : '☐'}</Text>
            </TouchableOpacity>
          )}
          {isEditing ? (
            <View style={{width: 18, height: 18, borderRadius: isSub ? 4 : 9, backgroundColor: editColor, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)'}} />
          ) : (
            <View style={{width: 12, height: 12, borderRadius: isSub ? 3 : 6, backgroundColor: g.color || T.accent}} />
          )}
          {isEditing ? (
            <View style={{flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center'}}>
              <TextInput value={editName} onChangeText={setEditName} autoFocus accessibilityLabel={t('memberGroups.groupName')} style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, fontSize: fs(13)}} onSubmitEditing={() => renameNode(g.id)} returnKeyType="done" />
              <TouchableOpacity hitSlop={{top: 8, bottom: 13}} onPress={() => renameNode(g.id)} accessibilityRole="button" accessibilityLabel={t('common.save')}><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{color: T.success, fontSize: fs(14)}}>✓</Text></TouchableOpacity>
              <TouchableOpacity hitSlop={{top: 8, bottom: 15}} onPress={() => setEditId(null)} accessibilityRole="button" accessibilityLabel={t('common.cancel')}><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{color: T.dim, fontSize: fs(12)}}>✕</Text></TouchableOpacity>
            </View>
          ) : (
            <>
              <Text onPress={selectable ? () => setSelectedIds(sel => toggleId(sel, g.id)) : undefined}
                accessibilityRole={selectable ? 'button' : undefined}
                accessibilityState={selectable ? {selected: isSelected} : undefined}
                accessibilityLabel={isSub ? t('memberGroups.subsystemNamed', {name: g.name}) : g.name}
                style={{flex: 1, fontSize: fs(14), color: T.text, fontWeight: '500'}} numberOfLines={1}>{isSub ? '⊟ ' : ''}{g.name}</Text>
              {movingIds && canDrop ? (
                <TouchableOpacity onPress={() => moveNodes(movingIds, g.id)} accessibilityRole="button" accessibilityLabel={t('a11y.labelValue', {label: t('memberGroups.moveHere'), value: g.name})} hitSlop={{top: 8, bottom: 12}} style={{paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, backgroundColor: T.successBg, borderColor: `${T.success}40`}}><Text style={{fontSize: fs(11), color: T.success}}>{t('memberGroups.moveHere')}</Text></TouchableOpacity>
              ) : movingIds?.includes(g.id) ? (
                <Text style={{fontSize: fs(11), color: T.muted, fontStyle: 'italic'}}>{t('memberGroups.moving')}</Text>
              ) : selectMode || movingIds ? (
                <Text style={{fontSize: fs(11), color: T.muted}}>{memberCount}</Text>
              ) : (
                <>
                  <Text style={{fontSize: fs(11), color: T.muted}}>{memberCount}</Text>
                  <TouchableOpacity ref={el => { moveBtnRefs.current[g.id] = el; }} onPress={() => reorderNode(g.id, 'up')} disabled={isFirst} accessibilityRole="button" accessibilityState={{disabled: isFirst}} accessibilityLabel={isFirst ? t('members.moveUpItem', {name: g.name}) : `${t('members.moveUpItem', {name: g.name})}, ${t('members.moveAbove', {name: sibs[sibIdx - 1].name})}`} hitSlop={{top: 8, bottom: 12}} style={{padding: 2, opacity: isFirst ? 0.25 : 1}}><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(13), color: T.dim}}>▲</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => reorderNode(g.id, 'down')} disabled={isLast} accessibilityRole="button" accessibilityState={{disabled: isLast}} accessibilityLabel={isLast ? t('members.moveDownItem', {name: g.name}) : `${t('members.moveDownItem', {name: g.name})}, ${t('members.moveBelow', {name: sibs[sibIdx + 1].name})}`} hitSlop={{top: 8, bottom: 12}} style={{padding: 2, opacity: isLast ? 0.25 : 1}}><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(13), color: T.dim}}>▼</Text></TouchableOpacity>
                  <TouchableOpacity hitSlop={{top: 8, bottom: 13}} onPress={() => setMovingIds([g.id])} accessibilityRole="button" accessibilityLabel={t('memberGroups.moveItem', {name: g.name})}><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(15), color: T.dim}}>⇄</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => startEdit(g)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.editItem', {name: g.name})} hitSlop={{top: 8, bottom: 12}} style={{paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}><Text style={{fontSize: fs(11), fontWeight: '500', color: T.accent}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('common.edit')}</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteNode(g.id)} hitSlop={{top: 8, bottom: 11}} style={{padding: 4}} accessibilityRole="button" accessibilityLabel={t('common.deleteItem', {name: g.name})}><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(12), color: T.danger}}>✕</Text></TouchableOpacity>
                </>
              )}
            </>
          )}
        </View>
        {isEditing && (
          <View style={{paddingLeft: depth * 16 + 24, paddingRight: 8, marginBottom: 10}}>
            <ColorCarousel value={editColor} onChange={setEditColor} />
            <TextInput value={editDesc} onChangeText={setEditDesc} multiline placeholder={t('modal.descriptionBio')} placeholderTextColor={T.muted}
              accessibilityLabel={t('modal.descriptionBio')}
              style={descInput} />
            {isSub && (
              <TouchableOpacity onPress={() => setLinkPickOpen(true)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={t('a11y.labelValue', {label: t('memberGroups.linkedFronter'), value: linkedFronter ? linkedFronter.name : t('memberGroups.noLinkedFronter')})}
                hitSlop={{top: 6, bottom: 6}} style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface}}>
                <Text style={{fontSize: fs(11), color: T.dim}}>{t('memberGroups.linkedFronter')}</Text>
                <View style={{flex: 1}} />
                {linkedFronter ? <Avatar member={linkedFronter} size={22} /> : null}
                <Text style={{flexShrink: 1, fontSize: fs(13), color: linkedFronter ? T.text : T.muted}} numberOfLines={1}>{linkedFronter ? linkedFronter.name : t('memberGroups.noLinkedFronter')}</Text>
                <Text style={{fontSize: fs(15), color: T.dim}} allowFontScaling={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">›</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {childrenOf(groups, g.id).map(c => renderNode(c, depth + 1, seen))}
      </View>
    );
  };

  const noSelection = selectedIds.length === 0;

  return (
    <KeyboardAwareScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={{padding: 16, paddingBottom: 120}} keyboardShouldPersistTaps="handled" scrollEnabled={!dragging} bottomOffset={24}>
      {header}
      <Text style={{fontSize: fs(11), color: T.dim, marginBottom: 14, lineHeight: fs(18)}}>{t('systemManager.desc')}</Text>
      <View style={{flexDirection: 'row', marginBottom: 12}}>
        <TouchableOpacity onPress={onBrowse} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemManager.browse')}
          hitSlop={{top: 7, bottom: 7}} style={{flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
          <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(13)}} allowFontScaling={false}>🗂</Text>
          <Text style={{fontSize: fs(12), fontWeight: '500', color: T.dim}}>{t('systemManager.browse')}</Text>
        </TouchableOpacity>
        <View style={{flex: 1}} />
        {groups.length > 1 && <ReorderLockButton on={reorderOn} onToggle={() => setReorderOn(v => !v)} />}
      </View>
      {groups.length > 0 && !movingIds && (
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12}}>
          {selectMode ? (
            <>
              <Text style={{fontSize: fs(11), color: T.dim}}>{t('members.selectedCount', {count: selectedIds.length})}</Text>
              <TouchableOpacity hitSlop={{top: 12, bottom: 15}} onPress={() => setSelectedIds(groups.map(g => g.id))} accessibilityRole="button" accessibilityLabel={t('members.selectAll')}><Text style={{fontSize: fs(11), color: T.accent}}>{t('members.selectAll')}</Text></TouchableOpacity>
              <TouchableOpacity hitSlop={{top: 12, bottom: 15}} onPress={() => setSelectedIds([])} accessibilityRole="button" accessibilityLabel={t('members.selectNone')}><Text style={{fontSize: fs(11), color: T.accent}}>{t('members.selectNone')}</Text></TouchableOpacity>
              <View style={{flex: 1}} />
              <TouchableOpacity onPress={() => { if (!noSelection) setMovingIds([...selectedIds]); }} disabled={noSelection} accessibilityRole="button" accessibilityState={{disabled: noSelection}} accessibilityLabel={t('memberGroups.move')}
                hitSlop={{top: 10, bottom: 10}} style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, opacity: noSelection ? 0.45 : 1}}>
                <Text style={{fontSize: fs(11), fontWeight: '600', color: T.accent}}>{t('memberGroups.move')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={massDelete} disabled={noSelection} accessibilityRole="button" accessibilityState={{disabled: noSelection}} accessibilityLabel={t('common.delete')}
                hitSlop={{top: 10, bottom: 10}} style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, backgroundColor: T.dangerBg, borderColor: `${T.danger}40`, opacity: noSelection ? 0.45 : 1}}>
                <Text style={{fontSize: fs(11), fontWeight: '600', color: T.danger}}>{t('common.delete')}</Text>
              </TouchableOpacity>
              <TouchableOpacity hitSlop={{top: 12, bottom: 15}} onPress={exitSelectMode} accessibilityRole="button" accessibilityLabel={t('common.cancel')}><Text style={{fontSize: fs(11), color: T.dim}}>{t('common.cancel')}</Text></TouchableOpacity>
            </>
          ) : (
            <>
              <View style={{flex: 1}} />
              <TouchableOpacity onPress={() => setSelectMode(true)} accessibilityRole="button" accessibilityLabel={t('members.select')}
                hitSlop={{top: 10, bottom: 10}} style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
                <Text style={{fontSize: fs(11), color: T.dim}}>{t('members.select')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
      {movingIds && (
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, padding: 8, borderRadius: 8, backgroundColor: T.surface, borderWidth: 1, borderColor: `${T.accent}40`}}>
          <Text style={{flex: 1, fontSize: fs(11), color: T.dim}}>{t('memberGroups.movePrompt')}</Text>
          <TouchableOpacity hitSlop={{top: 15, bottom: 15}} onPress={() => moveNodes(movingIds, null)} accessibilityRole="button"><Text style={{fontSize: fs(11), color: T.accent, fontWeight: '600'}}>{t('memberGroups.toRoot')}</Text></TouchableOpacity>
          <TouchableOpacity hitSlop={{top: 15, bottom: 15}} onPress={() => setMovingIds(null)} accessibilityRole="button"><Text style={{fontSize: fs(11), color: T.dim}}>{t('common.cancel')}</Text></TouchableOpacity>
        </View>
      )}
      {childrenOf(groups, null).map(g => renderNode(g, 0))}
      {groups.length === 0 && <Text style={{fontSize: fs(12), color: T.muted, fontStyle: 'italic', marginBottom: 10}}>{t('memberGroups.none')}</Text>}
      <View style={{flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 8}}>
        <TouchableOpacity onPress={() => setShowNewColor(v => !v)}
          accessibilityRole="button" accessibilityState={{expanded: showNewColor}} accessibilityLabel={`${t('memberGroups.changeColor')}, ${colorName(newColor, t)}`}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}} style={{width: 28, height: 28, borderRadius: newKind === 'subsystem' ? 6 : 14, backgroundColor: newColor, borderWidth: 2, borderColor: showNewColor ? '#fff' : 'rgba(255,255,255,0.15)'}} />
        <TextInput value={newName} onChangeText={setNewName} accessibilityLabel={t('memberGroups.addPlaceholder')} placeholder={t('memberGroups.addPlaceholder')} placeholderTextColor={T.muted}
          style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: fs(13)}} onSubmitEditing={addNode} returnKeyType="done" />
        <TouchableOpacity onPress={() => setNewKind(k => k === 'group' ? 'subsystem' : 'group')} activeOpacity={0.7} accessibilityRole="button"
          accessibilityLabel={t('memberGroups.newKind')} accessibilityValue={{text: newKind === 'subsystem' ? t('memberGroups.subsystem') : t('memberGroups.group')}}
          hitSlop={{top: 8, bottom: 8}} style={{paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
          <Text style={{fontSize: fs(11), color: T.dim}}>{newKind === 'subsystem' ? t('memberGroups.subsystem') : t('memberGroups.group')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={addNode} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.add')} hitSlop={{top: 8, bottom: 8}} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
          <Text style={{fontSize: fs(12), fontWeight: '500', color: T.accent}}>{t('common.add')}</Text>
        </TouchableOpacity>
      </View>
      {showNewColor && (
        <View style={{marginTop: 10, marginBottom: 4}}>
          <ColorCarousel value={newColor} onChange={setNewColor} />
          <TextInput value={newDesc} onChangeText={setNewDesc} multiline placeholder={t('modal.descriptionBio')} placeholderTextColor={T.muted}
            accessibilityLabel={t('modal.descriptionBio')}
            style={descInput} />
        </View>
      )}
      <PickerDialog visible={linkPickOpen} title={t('memberGroups.linkedFronter')} onClose={() => setLinkPickOpen(false)}
        footer={
          <TouchableOpacity onPress={() => setLinkPickOpen(false)} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
            hitSlop={{top: 6, bottom: 6}} style={{alignItems: 'center', paddingVertical: 10, marginTop: 12, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
            <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        }>
        <TouchableOpacity onPress={() => { setEditLinked(null); setLinkPickOpen(false); }} activeOpacity={0.7}
          accessibilityRole="radio" accessibilityState={{checked: !editLinked}} accessibilityLabel={t('memberGroups.noLinkedFronter')}
          style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, marginBottom: 6}}>
          <View style={{width: 26, height: 26}} />
          <Text style={{flex: 1, fontSize: fs(13), color: T.dim}} numberOfLines={1}>{t('memberGroups.noLinkedFronter')}</Text>
          {!editLinked ? <Text style={{fontSize: fs(13), fontWeight: '700', color: T.accent}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</Text> : null}
        </TouchableOpacity>
        <MemberPicker pools={linkPools} selected={editLinked} onPick={m => { setEditLinked(m.id); setLinkPickOpen(false); }} maxResults={Infinity} rowSize={26} />
      </PickerDialog>
    </KeyboardAwareScrollView>
  );
};
