import React, {useState, useMemo, useCallback, useDeferredValue, useRef, useEffect} from 'react';
import {View, ScrollView, TouchableOpacity, StyleSheet, Alert, Modal, AccessibilityInfo} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {Avatar} from '../components/Avatar';
import {FlashList, FlashListRef} from '@shopify/flash-list';
import {useTranslation} from 'react-i18next';
import {Fonts, PALETTE, fontScale, ThemeColors} from '../theme';
import {useAppStore} from '../store/appStore';
import {Member, MemberGroup, GroupNodeKind, FrontState, FrontTierKey, MemberSortMode, allFrontMemberIds, uid, isValidHex, normalizeHex, sortMembers, childrenOf, descendantsOf, isDescendant, groupKind, sortGroupsForDisplay} from '../utils';
import {useDragReorder} from '../hooks/useDragReorder';
import {DragHandle, ReorderLockButton} from '../components/DragHandle';
import {PlusMinusIcon} from '../components/Glyphs';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const getMemberTier = (id: string, front: FrontState | null): FrontTierKey | null => {
  if (!front) return null;
  if (front.primary.memberIds.includes(id)) return 'primary';
  if (front.coFront.memberIds.includes(id)) return 'coFront';
  if (front.coConscious.memberIds.includes(id)) return 'coConscious';
  return null;
};

const TIER_BADGE_KEY: Record<FrontTierKey, {i18nKey: string; colorKey: string}> = {
  primary: {i18nKey: 'tier.primaryBadge', colorKey: 'accent'},
  coFront: {i18nKey: 'tier.coFrontBadge', colorKey: 'info'},
  coConscious: {i18nKey: 'tier.coConBadge', colorKey: 'success'},
};

interface MemberCardProps {
  m: Member;
  index: number;
  isLast: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  showReorder: boolean;
  front: FrontState | null;
  allFrontIds: Set<string>;
  groups: MemberGroup[];
  T: ThemeColors;
  fs: (n: number) => number;
  t: (key: string, opts?: any) => string;
  onActivate: (m: Member) => void;
  onToggleSelect: (id: string) => void;
  onEnterSelection: (id: string) => void;
  onReorder?: (id: string, direction: 'up' | 'down') => void;
  onEditMember: (m: Member) => void;
  onQuickFront?: (m: Member) => void;
  onRemoveFromFront?: (m: Member) => void;
  fields: {groups?: boolean; descriptions?: boolean; pronouns?: boolean; roles?: boolean};
  prevName?: string;
  nextName?: string;
  dragHandle?: React.ReactNode;
}

const MemberCard = React.memo(function MemberCard({
  m, index, isLast, selectionMode, isSelected, showReorder,
  front, allFrontIds, groups, T, fs, t,
  onActivate, onToggleSelect, onEnterSelection, onReorder, onEditMember, onQuickFront, onRemoveFromFront, fields, prevName, nextName, dragHandle,
}: MemberCardProps) {
  const tier = getMemberTier(m.id, front);
  const isFronting = allFrontIds.has(m.id);
  const badgeCfg = tier ? TIER_BADGE_KEY[tier] : null;
  const badgeColor = badgeCfg ? (T as any)[badgeCfg.colorKey] || T.accent : T.accent;
  const memberGroups = useMemo(
    () => sortGroupsForDisplay(groups.filter(g => (m.groupIds || []).includes(g.id)), groups),
    [groups, m.groupIds],
  );
  const isFirst = index === 0;
  const cardBorder = selectionMode
    ? (isSelected ? T.accent : T.border)
    : (isFronting ? `${m.color}60` : T.border);
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={[m.name, badgeCfg ? t(badgeCfg.i18nKey) : null, fields?.pronouns !== false ? m.pronouns : null, fields?.roles !== false ? m.role : null, fields?.groups !== false && memberGroups.length ? memberGroups.map(g => g.name).join(', ') : null, fields?.descriptions !== false ? m.description : null].filter(Boolean).join(', ')}
      accessibilityState={selectionMode ? {selected: isSelected} : undefined}
      style={[s.card, {backgroundColor: T.card, borderColor: cardBorder, borderWidth: selectionMode && isSelected ? 2 : 1, marginBottom: 8}]}
      onPress={selectionMode ? () => onToggleSelect(m.id) : () => onActivate(m)}
      onLongPress={() => onEnterSelection(m.id)}
      delayLongPress={350}
      accessibilityActions={[{name: 'longpress', label: t('members.selectAction')}]}
      onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'longpress') onEnterSelection(m.id); }}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 14}}>
        {dragHandle}
        {selectionMode && (
          <View style={{width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: isSelected ? T.accent : T.border, backgroundColor: isSelected ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
            {isSelected && <Text style={{fontSize: fs(12), fontWeight: '700', color: T.bg}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</Text>}
          </View>
        )}
        {!selectionMode && showReorder && (
          <View style={{justifyContent: 'center', gap: 2, marginRight: -6}}>
            <TouchableOpacity onPress={() => !isFirst && onReorder && onReorder(m.id, 'up')} hitSlop={{top: 6, bottom: 2, left: 8, right: 8}} disabled={isFirst} accessibilityRole="button" accessibilityLabel={isFirst || !prevName ? `${t('members.moveUp')}, ${m.name}` : `${t('members.moveUp')}, ${m.name}, ${t('members.moveAbove', {name: prevName})}`}>
              <Text style={{fontSize: fs(14), color: isFirst ? T.muted : T.dim, opacity: isFirst ? 0.3 : 1}}>▲</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => !isLast && onReorder && onReorder(m.id, 'down')} hitSlop={{top: 2, bottom: 6, left: 8, right: 8}} disabled={isLast} accessibilityRole="button" accessibilityLabel={isLast || !nextName ? `${t('members.moveDown')}, ${m.name}` : `${t('members.moveDown')}, ${m.name}, ${t('members.moveBelow', {name: nextName})}`}>
              <Text style={{fontSize: fs(14), color: isLast ? T.muted : T.dim, opacity: isLast ? 0.3 : 1}}>▼</Text>
            </TouchableOpacity>
          </View>
        )}
        <Avatar member={m} size={44} pulse={isFronting} T={T} />
        <View style={{flex: 1, overflow: 'hidden'}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2}}>
            <Text style={{fontSize: fs(15), fontWeight: '500', color: T.text, flexShrink: 1}} numberOfLines={1} maxFontSizeMultiplier={1.4}>{m.name}</Text>
            {badgeCfg && (<View style={{paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: `${badgeColor}18`, borderWidth: 1, borderColor: `${badgeColor}35`, flexShrink: 0}}><Text style={{fontSize: fs(10), color: badgeColor, fontWeight: '500'}} numberOfLines={1} maxFontSizeMultiplier={1.3}>{t(badgeCfg.i18nKey)}</Text></View>)}
          </View>
          {[fields?.pronouns !== false ? m.pronouns : null, fields?.roles !== false ? m.role : null].filter(Boolean).length > 0 ? <Text style={{fontSize: fs(12), color: T.dim}}>{[fields?.pronouns !== false ? m.pronouns : null, fields?.roles !== false ? m.role : null].filter(Boolean).join(' · ')}</Text> : null}
          {fields?.descriptions !== false && m.description ? <Text style={{fontSize: fs(11), color: T.muted, marginTop: 2}} numberOfLines={2}>{m.description}</Text> : null}
          {fields?.groups !== false && memberGroups.length > 0 && (
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4}}>
              {memberGroups.map(g => (<View key={g.id} style={{flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: `${g.color || T.accent}15`}}><View style={{width: 5, height: 5, borderRadius: 2.5, backgroundColor: g.color || T.accent}} /><Text style={{fontSize: fs(10), color: g.color || T.accent}}>{g.name}</Text></View>))}
            </View>
          )}
        </View>
        {!selectionMode && (
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
            {!!onQuickFront && !!onRemoveFromFront && !m.archived && !m.deleted && (
              <TouchableOpacity onPress={() => isFronting ? onRemoveFromFront(m) : onQuickFront(m)} activeOpacity={0.7} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                accessibilityRole="button" accessibilityLabel={`${isFronting ? t('members.removeFromFront') : t('members.addToFront')}, ${m.name}`}
                style={{width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isFronting ? `${T.danger}12` : T.accentBg, borderColor: isFronting ? `${T.danger}50` : `${T.accent}40`}}>
                <PlusMinusIcon minus={isFronting} size={12} color={isFronting ? T.danger : T.accent} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

interface Props {
  theme: ThemeColors;
  initialSortMode?: MemberSortMode;
  archiveOnly?: boolean;
  onAdd: () => void;
  onAddCustomFront?: () => void;
  onEdit: (member: Member) => void;
  onView?: (member: Member) => void;
  onSaveGroups: (groups: MemberGroup[]) => void;
  onSaveSortMode?: (mode: MemberSortMode) => void;
  onReorderMember?: (id: string, direction: 'up' | 'down') => void;
  onBulkArchive?: (ids: string[]) => void | Promise<void>;
  onBulkRestore?: (ids: string[]) => void | Promise<void>;
  onBulkDelete?: (ids: string[]) => void | Promise<void>;
  onBulkAddGroups?: (ids: string[], groupIds: string[]) => void | Promise<void>;
  memberListFields?: {groups?: boolean; descriptions?: boolean; pronouns?: boolean; roles?: boolean};
  onSaveListFields?: (next: {groups?: boolean; descriptions?: boolean; pronouns?: boolean; roles?: boolean}) => void;
  onQuickAddToFront?: (id: string, tier: FrontTierKey) => void | Promise<void>;
  onRemoveFromFront?: (id: string) => void | Promise<void>;
}

export const MembersScreen = ({theme: T, initialSortMode, archiveOnly = false, onAdd, onAddCustomFront, onEdit, onView, onSaveGroups, onSaveSortMode, onReorderMember, onBulkArchive, onBulkRestore, onBulkDelete, onBulkAddGroups, memberListFields, onSaveListFields, onQuickAddToFront, onRemoveFromFront}: Props) => {
  const members = useAppStore(s => s.members);
  const front = useAppStore(s => s.front);
  const groups = useAppStore(s => s.groups);
  const {t} = useTranslation();
  const fs = useCallback(fontScale(T), [T.textScale]);
  const [memberTab, setMemberTab] = useState<'active' | 'archived' | 'customFronts'>(archiveOnly ? 'archived' : 'active');
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<MemberSortMode>(initialSortMode || 'alphabetical');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showGroupAssign, setShowGroupAssign] = useState(false);
  const [groupAssignSel, setGroupAssignSel] = useState<Set<string>>(new Set());
  const [showDisplayOptions, setShowDisplayOptions] = useState(false);
  const [quickFrontFor, setQuickFrontFor] = useState<Member | null>(null);
  const [listFields, setListFields] = useState({groups: true, descriptions: true, pronouns: true, roles: true, count: true, ...(memberListFields || {})});
  const toggleListField = (k: 'groups' | 'descriptions' | 'pronouns' | 'roles' | 'count') => {
    const next = {...listFields, [k]: !listFields[k]};
    setListFields(next);
    onSaveListFields && onSaveListFields(next);
  };
  const searchRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const listRef = useRef<FlashListRef<Member>>(null);
  const [showTop, setShowTop] = useState(false);
  const scrollToTop = (animated: boolean) => { try { listRef.current?.scrollToOffset({offset: 0, animated}); } catch {} };

  const enterSelection = useCallback((id?: string) => {
    setSelectionMode(true);
    setSelectedIds(id ? new Set([id]) : new Set());
  }, []);
  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const switchTab = (tab: 'active' | 'archived' | 'customFronts') => {
    setMemberTab(tab);
    setQuery(''); setActiveGroup(null); setActiveTag(null);
    searchRef.current?.clear();
    exitSelection();
  };

  const confirmBulkArchive = () => {
    const ids = [...selectedIds];
    if (ids.length === 0 || !onBulkArchive) return;
    if (ids.some(id => allFrontIds.has(id))) { Alert.alert(t('members.frontingLockTitle'), t('members.frontingLockMsg')); return; }
    Alert.alert(
      t('members.bulkArchive'),
      t('members.bulkArchiveMsg', {count: ids.length}),
      [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('members.archive'), onPress: async () => { await onBulkArchive(ids); exitSelection(); }},
      ],
    );
  };
  const confirmBulkRestore = () => {
    const ids = [...selectedIds];
    if (ids.length === 0 || !onBulkRestore) return;
    Alert.alert(
      t('members.bulkRestore'),
      t('members.bulkRestoreMsg', {count: ids.length}),
      [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('members.restore'), onPress: async () => { await onBulkRestore(ids); exitSelection(); }},
      ],
    );
  };
  const confirmBulkDelete = () => {
    const ids = [...selectedIds];
    if (ids.length === 0 || !onBulkDelete) return;
    if (ids.some(id => allFrontIds.has(id))) { Alert.alert(t('members.frontingLockTitle'), t('members.frontingLockMsg')); return; }
    Alert.alert(
      t('members.bulkDelete'),
      t('members.bulkDeleteMsg', {count: ids.length}),
      [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('common.delete'), style: 'destructive', onPress: async () => { await onBulkDelete(ids); exitSelection(); }},
      ],
    );
  };
  const toggleGroupAssign = (gid: string) => setGroupAssignSel(prev => { const n = new Set(prev); if (n.has(gid)) n.delete(gid); else n.add(gid); return n; });
  const applyGroupAssign = async () => {
    const ids = [...selectedIds];
    const gids = [...groupAssignSel];
    if (ids.length === 0 || gids.length === 0 || !onBulkAddGroups) { setShowGroupAssign(false); return; }
    await onBulkAddGroups(ids, gids);
    setShowGroupAssign(false);
    setGroupAssignSel(new Set());
    exitSelection();
  };

  const deferredQuery = useDeferredValue(query);

  const tabMembers = members.filter(m => {
    if (m.deleted) return false;
    if (m.isCustomFront) return memberTab === 'customFronts';
    if (memberTab === 'customFronts') return false;
    return memberTab === 'archived' ? m.archived : !m.archived;
  });
  const allFrontIds = useMemo(() => new Set(allFrontMemberIds(front)), [front]);
  const allTags = [...new Set(tabMembers.flatMap(m => m.tags || []))].sort();
  const archivedCount = members.filter(m => m.archived && !m.isCustomFront && !m.deleted).length;
  const customFrontCount = members.filter(m => m.isCustomFront && !m.deleted).length;

  const activeGroupIds = useMemo(() => activeGroup ? new Set([activeGroup, ...descendantsOf(groups, activeGroup).map(g => g.id)]) : null, [activeGroup, groups]);

  const filtered = useMemo(() => sortMembers(tabMembers.filter(m => {
    const nameMatch = !deferredQuery || m.name.toLowerCase().includes(deferredQuery.toLowerCase()) || m.role?.toLowerCase().includes(deferredQuery.toLowerCase());
    const groupMatch = !activeGroupIds || (m.groupIds || []).some(id => activeGroupIds.has(id));
    const tagMatch = !activeTag || (m.tags || []).includes(activeTag);
    return nameMatch && groupMatch && tagMatch;
  }), sortMode), [tabMembers, deferredQuery, activeGroupIds, activeTag, sortMode]);

  const showReorder = sortMode === 'manual' && (memberTab === 'active' || memberTab === 'customFronts') && !query && !activeGroup && !activeTag;

  useEffect(() => {
    const id = setTimeout(() => scrollToTop(false), 0);
    return () => clearTimeout(id);
  }, [deferredQuery, activeGroup, activeTag, memberTab]);

  const jumpToLetter = (letter: string) => {
    const idx = filtered.findIndex(m => ((m.name || '').trim().toUpperCase()[0] || '') === letter);
    if (idx >= 0) { try { listRef.current?.scrollToIndex({index: idx, animated: false}); } catch {} }
  };
  const showRail = !selectionMode && (sortMode === 'alphabetical' || sortMode === 'reverse-alphabetical') && filtered.length > 12;
  const railLetters = sortMode === 'reverse-alphabetical' ? [...ALPHABET].reverse() : ALPHABET;

  const handleActivate = useCallback((mm: Member) => (onView || onEdit)(mm), [onView, onEdit]);

  const handleReorder = useCallback((id: string, direction: 'up' | 'down') => {
    const idx = filtered.findIndex(m => m.id === id);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= filtered.length) return;
    const neighbor = filtered[swapIdx];
    const msg = swapIdx === 0
      ? t('common.movedToTop')
      : swapIdx === filtered.length - 1
        ? t('common.movedToBottom')
        : direction === 'up'
          ? t('common.movedAbove', {name: neighbor.name})
          : t('common.movedBelow', {name: neighbor.name});
    AccessibilityInfo.announceForAccessibility(msg);
    onReorderMember && onReorderMember(id, direction);
  }, [filtered, t, onReorderMember]);

  const [reorderOn, setReorderOn] = useState(false);
  const onDropMember = useCallback((id: string, from: number, to: number) => {
    if (!onReorderMember || to === from) return;
    const steps = Math.abs(to - from);
    const dir: 'up' | 'down' = to > from ? 'down' : 'up';
    for (let i = 0; i < steps; i++) onReorderMember(id, dir);
    const msg = to === 0
      ? t('common.movedToTop')
      : to === filtered.length - 1
        ? t('common.movedToBottom')
        : dir === 'up'
          ? t('common.movedAbove', {name: filtered[to].name})
          : t('common.movedBelow', {name: filtered[to].name});
    AccessibilityInfo.announceForAccessibility(msg);
  }, [onReorderMember, filtered, t]);
  const {drag, dragging, registerHeight, makeHandlePanHandlers} = useDragReorder({enabled: reorderOn && showReorder && !!onReorderMember, onDrop: onDropMember});

  const renderMember = useCallback(({item: m, index}: {item: Member; index: number}) => (
    <View
      onLayout={e => registerHeight(m.id, e.nativeEvent.layout.height)}
      style={{
        borderTopWidth: 2,
        borderTopColor: dragging && drag.key !== m.id && drag.siblings[drag.target] === m.id ? T.accent : 'transparent',
        ...(drag.key === m.id ? {transform: [{translateY: drag.dy}], zIndex: 10, elevation: 6} : null),
      }}>
    <MemberCard
      m={m}
      index={index}
      isLast={index === filtered.length - 1}
      selectionMode={selectionMode}
      isSelected={selectedIds.has(m.id)}
      showReorder={showReorder}
      front={front}
      allFrontIds={allFrontIds}
      groups={groups}
      T={T}
      fs={fs}
      t={t}
      onActivate={handleActivate}
      onToggleSelect={toggleSelected}
      onEnterSelection={enterSelection}
      onReorder={handleReorder}
      onEditMember={onEdit}
      onQuickFront={onQuickAddToFront ? setQuickFrontFor : undefined}
      onRemoveFromFront={onRemoveFromFront ? (mm: Member) => {
        Alert.alert(t('members.removeFromFront'), t('members.removeFromFrontMsg', {name: mm.name}), [
          {text: t('common.cancel'), style: 'cancel'},
          {text: t('network.remove'), style: 'destructive', onPress: () => { onRemoveFromFront(mm.id); }},
        ]);
      } : undefined}
      fields={listFields}
      prevName={index > 0 ? filtered[index - 1].name : undefined}
      nextName={index < filtered.length - 1 ? filtered[index + 1].name : undefined}
      dragHandle={showReorder && !selectionMode ? (
        <DragHandle T={T} active={reorderOn} panHandlers={makeHandlePanHandlers(m.id, () => filtered.map(x => x.id))} name={m.name}
          position={index + 1} count={filtered.length}
          onStep={dir => handleReorder(m.id, dir === 1 ? 'down' : 'up')} />
      ) : undefined}
    />
    </View>
  ), [filtered, selectionMode, selectedIds, showReorder, front, allFrontIds, groups, T, fs, t, handleActivate, toggleSelected, enterSelection, handleReorder, onEdit, listFields, onQuickAddToFront, onRemoveFromFront, reorderOn, drag, dragging, registerHeight, makeHandlePanHandlers]);

  const allVisibleIds = filtered.map(m => m.id);
  const allSelectedInView = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id));

  const flashExtraData = useMemo(
    () => ({T, front, groups, showReorder, filteredLength: filtered.length, selectionMode, selectedCount: selectedIds.size, listFields, reorderOn, drag}),
    [T, front, groups, showReorder, filtered.length, selectionMode, selectedIds.size, listFields, reorderOn, drag],
  );
  const toggleSelectAll = () => {
    if (allSelectedInView) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allVisibleIds));
    }
  };

  const ListHeader = (
    <View>
      {selectionMode ? (
        <View style={{marginBottom: 14}}>
          <Text
            accessibilityRole="header"
            style={[s.heading, {color: T.text, fontSize: fs(22), marginBottom: 10}]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}>
            {t('members.selectedCount', {count: selectedIds.size})}
          </Text>
          <View style={{flexDirection: 'row', gap: 6, flexWrap: 'wrap'}}>
            <TouchableOpacity onPress={toggleSelectAll} activeOpacity={0.7} accessibilityRole="button"
              style={[s.addBtn, {backgroundColor: T.surface, borderColor: T.border}]}>
              <Text style={{fontSize: fs(12), fontWeight: '500', color: T.dim}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{allSelectedInView ? t('members.selectNone') : t('members.selectAll')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={exitSelection} activeOpacity={0.7} accessibilityRole="button"
              style={[s.addBtn, {backgroundColor: T.surface, borderColor: T.border}]}>
              <Text style={{fontSize: fs(13), fontWeight: '500', color: T.dim}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={{marginBottom: 14}}>
          {!archiveOnly && (
            <Text
              accessibilityRole="header"
              style={[s.heading, {color: T.text}]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}>
              {t('members.title')}
            </Text>
          )}
          {listFields.count !== false && (
          <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2, marginBottom: 10}} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {(query || activeGroup || activeTag)
              ? t('members.countFiltered', {filtered: filtered.length, total: tabMembers.length})
              : t('members.count', {count: tabMembers.length})}
          </Text>
          )}
          <View style={{flexDirection: 'row', gap: 6, flexWrap: 'wrap'}}>
            <TouchableOpacity onPress={() => enterSelection()} activeOpacity={0.7} accessibilityRole="button"
              style={[s.addBtn, {backgroundColor: T.surface, borderColor: T.border}]}>
              <Text style={{fontSize: fs(12), fontWeight: '500', color: T.dim}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('members.select')}</Text>
            </TouchableOpacity>
            {!archiveOnly && (
              <TouchableOpacity onPress={memberTab === 'customFronts' ? (onAddCustomFront || onAdd) : onAdd} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={memberTab === 'customFronts' ? t('members.addCustomFront') : t('members.add')} style={[s.addBtn, {backgroundColor: T.accentBg, borderColor: `${T.accent}40`}]}>
                <Text style={{fontSize: fs(13), fontWeight: '500', color: T.accent}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{memberTab === 'customFronts' ? `+ ${t('members.customFront')}` : t('members.add')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setShowDisplayOptions(true)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('members.displayFields')}
              style={[s.addBtn, {backgroundColor: T.surface, borderColor: T.border}]}>
              <Text style={{fontSize: fs(13), color: T.dim}} numberOfLines={1} maxFontSizeMultiplier={1.2} allowFontScaling={false}>⚙</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {selectionMode && selectedIds.size > 0 && (
        <View style={{flexDirection: 'row', gap: 8, marginBottom: 14}}>
          {memberTab === 'active' && onBulkAddGroups && groups.length > 0 && (
            <TouchableOpacity onPress={() => {setGroupAssignSel(new Set()); setShowGroupAssign(true);}} activeOpacity={0.7} accessibilityRole="button"
              style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
              <Text style={{fontSize: fs(13), fontWeight: '500', color: T.text}} numberOfLines={1}>{t('members.assignGroup')}</Text>
            </TouchableOpacity>
          )}
          {(memberTab === 'active' || memberTab === 'customFronts') && (
            <TouchableOpacity onPress={confirmBulkArchive} activeOpacity={0.7} accessibilityRole="button"
              style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
              <Text style={{fontSize: fs(13), fontWeight: '500', color: T.text}} numberOfLines={1}>{t('members.archive')}</Text>
            </TouchableOpacity>
          )}
          {(memberTab === 'archived' || memberTab === 'customFronts') && (
            <TouchableOpacity onPress={confirmBulkRestore} activeOpacity={0.7} accessibilityRole="button"
              style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
              <Text style={{fontSize: fs(13), fontWeight: '500', color: T.text}} numberOfLines={1}>{t('members.restore')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={confirmBulkDelete} activeOpacity={0.7} accessibilityRole="button"
            style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: `${T.danger}15`, borderColor: `${T.danger}50`}}>
            <Text style={{fontSize: fs(13), fontWeight: '600', color: T.danger}} numberOfLines={1}>{t('common.delete')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {!archiveOnly && (
      <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 14, borderBottomWidth: 1, borderBottomColor: T.border}}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexGrow: 0, flex: 1}}>
          {(['active', 'customFronts'] as const).map(tab => (
            <TouchableOpacity key={tab} onPress={() => switchTab(tab)} activeOpacity={0.7}
              accessibilityRole="tab" accessibilityState={{selected: memberTab === tab}}
              style={{paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: memberTab === tab ? T.accent : 'transparent'}}>
              <Text style={{fontSize: fs(13), color: memberTab === tab ? T.accent : T.dim, fontWeight: memberTab === tab ? '600' : '400'}} numberOfLines={1}>
                {tab === 'active' ? t('members.active')
                  : `${t('members.customFronts')}${customFrontCount > 0 ? ` (${customFrontCount})` : ''}`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {showReorder && <ReorderLockButton T={T} on={reorderOn} onToggle={() => setReorderOn(v => !v)} />}
      </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 10, flexGrow: 0}}>
        <View style={{flexDirection: 'row', gap: 6, paddingHorizontal: 2}}>
          {(['alphabetical', 'reverse-alphabetical', 'age', 'color', 'role', 'manual'] as const).map(mode => (
            <TouchableOpacity key={mode} onPress={() => {setSortMode(mode); onSaveSortMode && onSaveSortMode(mode);}} activeOpacity={0.7}
              accessibilityRole="button" accessibilityState={{selected: sortMode === mode}} accessibilityLabel={t(`memberSort.${mode}`)}
              style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
                backgroundColor: sortMode === mode ? `${T.accent}20` : T.surface,
                borderColor: sortMode === mode ? `${T.accent}50` : T.border}}>
              <Text style={{fontSize: fs(11), color: sortMode === mode ? T.accent : T.dim, fontWeight: sortMode === mode ? '600' : '400'}}>
                {t(`memberSort.${mode}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {groups.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 6}}>
          <View style={{flexDirection: 'row', gap: 6}}>
            <TouchableOpacity onPress={() => setActiveGroup(null)} activeOpacity={0.7}
              accessibilityRole="button" accessibilityState={{selected: !activeGroup}} accessibilityLabel={t('memberGroups.allGroups')}
              style={[s.chip, {backgroundColor: !activeGroup ? `${T.accent}18` : T.surface, borderColor: !activeGroup ? `${T.accent}50` : T.border}]}>
              <Text style={{fontSize: fs(11), color: !activeGroup ? T.accent : T.dim, fontWeight: !activeGroup ? '600' : '400'}}>{t('memberGroups.allGroups')}</Text>
            </TouchableOpacity>
            {sortGroupsForDisplay(groups, groups).map(g => (
              <TouchableOpacity key={g.id} onPress={() => setActiveGroup(activeGroup === g.id ? null : g.id)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityState={{selected: activeGroup === g.id}} accessibilityLabel={g.name}
                style={[s.chip, {backgroundColor: activeGroup === g.id ? `${g.color || T.accent}18` : T.surface, borderColor: activeGroup === g.id ? `${g.color || T.accent}50` : T.border}]}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 5}}>
                  <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: g.color || T.accent}} />
                  <Text style={{fontSize: fs(11), color: activeGroup === g.id ? (g.color || T.accent) : T.dim, fontWeight: activeGroup === g.id ? '600' : '400'}}>{g.name}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {allTags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 8}}>
          <View style={{flexDirection: 'row', gap: 6}}>
            <TouchableOpacity onPress={() => setActiveTag(null)} activeOpacity={0.7}
              accessibilityRole="button" accessibilityState={{selected: !activeTag}} accessibilityLabel={t('members.allTags')}
              style={[s.chip, {backgroundColor: !activeTag ? `${T.info}18` : T.surface, borderColor: !activeTag ? `${T.info}50` : T.border}]}>
              <Text style={{fontSize: fs(11), color: !activeTag ? T.info : T.dim, fontWeight: !activeTag ? '600' : '400'}}>{t('members.allTags')}</Text>
            </TouchableOpacity>
            {allTags.map(tag => (
              <TouchableOpacity key={tag} onPress={() => setActiveTag(activeTag === tag ? null : tag)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityState={{selected: activeTag === tag}} accessibilityLabel={tag}
                style={[s.chip, {backgroundColor: activeTag === tag ? `${T.info}18` : T.surface, borderColor: activeTag === tag ? `${T.info}50` : T.border}]}>
                <Text style={{fontSize: fs(11), color: activeTag === tag ? T.info : T.dim, fontWeight: activeTag === tag ? '600' : '400'}}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {tabMembers.length > 3 && (
        <TextInput ref={searchRef} defaultValue="" onChangeText={setQuery} placeholder={t('members.search')} placeholderTextColor={T.muted}
          autoCorrect={false} autoComplete="off" spellCheck={false} textContentType="none"
          style={[s.search, {backgroundColor: T.surface, color: T.text, borderColor: T.border}]} />
      )}
    </View>
  );

  return (
    <>
    <FlashList
      ref={listRef}
      data={filtered}
      renderItem={renderMember}
      keyExtractor={(m: Member) => m.id}
      extraData={flashExtraData}
      maintainVisibleContentPosition={{disabled: true}}
      contentContainerStyle={{padding: 16, paddingBottom: 32, backgroundColor: T.bg}}
      keyboardShouldPersistTaps="handled"
      scrollEnabled={!dragging}
      onScroll={e => setShowTop((e.nativeEvent.contentOffset?.y || 0) > 500)}
      scrollEventThrottle={32}
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={tabMembers.length === 0 ? (
        <View style={s.empty}>
          <Text style={{fontSize: fs(36), opacity: 0.4, marginBottom: 12}}>◇</Text>
          <Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center', marginBottom: 16}}>{memberTab === 'archived' ? t('members.noArchived') : memberTab === 'customFronts' ? t('members.noCustomFronts') : t('members.noMembers')}</Text>
          {memberTab === 'active' && (
            <TouchableOpacity onPress={onAdd} activeOpacity={0.7} accessibilityRole="button" style={[s.addBtn, {backgroundColor: T.accentBg, borderColor: `${T.accent}40`}]}>
              <Text style={{fontSize: fs(13), fontWeight: '500', color: T.accent}}>{t('members.addMember')}</Text>
            </TouchableOpacity>
          )}
          {memberTab === 'customFronts' && (
            <TouchableOpacity onPress={onAddCustomFront || onAdd} activeOpacity={0.7} accessibilityRole="button" style={[s.addBtn, {backgroundColor: T.accentBg, borderColor: `${T.accent}40`}]}>
              <Text style={{fontSize: fs(13), fontWeight: '500', color: T.accent}}>{t('members.addCustomFront')}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    />
    {showRail && (
      <View style={{position: 'absolute', right: 1, top: 96, bottom: 96, justifyContent: 'center'}}>
        {railLetters.map(L => (
          <TouchableOpacity key={L} onPress={() => jumpToLetter(L)} hitSlop={{left: 10, right: 4, top: 1, bottom: 1}} accessibilityRole="button" accessibilityLabel={L} style={{paddingHorizontal: 3, paddingVertical: 0.5}}>
            <Text style={{fontSize: fs(9), fontWeight: '700', color: T.dim}} allowFontScaling={false}>{L}</Text>
          </TouchableOpacity>
        ))}
      </View>
    )}
    {showTop && (
      <TouchableOpacity onPress={() => scrollToTop(true)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('members.backToTop')}
        style={{position: 'absolute', right: 16, bottom: 24, width: 44, height: 44, borderRadius: 22, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 4}}>
        <Text style={{fontSize: fs(20), fontWeight: '700', color: T.bg}} allowFontScaling={false}>↑</Text>
      </TouchableOpacity>
    )}
    <Modal visible={showGroupAssign} transparent animationType="fade" onRequestClose={() => setShowGroupAssign(false)}>
      <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24}}>
        <View style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, maxHeight: '70%', overflow: 'hidden'}}>
          <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, padding: 16, paddingBottom: 8}}>{t('members.addToGroups')}</Text>
          <ScrollView style={{maxHeight: 320}}>
            {sortGroupsForDisplay(groups, groups).map(g => { const on = groupAssignSel.has(g.id); return (
              <TouchableOpacity key={g.id} onPress={() => toggleGroupAssign(g.id)} activeOpacity={0.7}
                accessibilityRole="checkbox" accessibilityState={{checked: on}} accessibilityLabel={g.name}
                style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: T.border}}>
                <View style={{width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: on ? T.accent : T.border, backgroundColor: on ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
                  {on ? <Text style={{fontSize: fs(11), color: T.bg, fontWeight: '700'}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</Text> : null}
                </View>
                <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: g.color || T.accent}} />
                <Text style={{flex: 1, fontSize: fs(14), color: T.text}} numberOfLines={1}>{g.name}</Text>
              </TouchableOpacity>
            ); })}
          </ScrollView>
          <View style={{flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: T.border}}>
            <TouchableOpacity onPress={() => setShowGroupAssign(false)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
              style={{flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
              <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={applyGroupAssign} disabled={groupAssignSel.size === 0} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{disabled: groupAssignSel.size === 0}} accessibilityLabel={t('common.add')}
              style={{flex: 2, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, opacity: groupAssignSel.size === 0 ? 0.4 : 1}}>
              <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('common.add')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    <Modal visible={!!quickFrontFor} transparent animationType="fade" onRequestClose={() => setQuickFrontFor(null)}>
      <TouchableOpacity activeOpacity={1} onPress={() => setQuickFrontFor(null)} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
        style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 32}}>
        <TouchableOpacity activeOpacity={1} style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, overflow: 'hidden'}}>
          <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, padding: 16, paddingBottom: 8}}>
            {t('members.addToFront')}{quickFrontFor ? ` — ${quickFrontFor.name}` : ''}
          </Text>
          {(([
            ['primary', t('tier.primaryFront'), T.accent],
            ['coFront', t('tier.coFront'), T.info || T.accent],
            ['coConscious', t('tier.coConscious'), T.success || T.accent],
          ] as [FrontTierKey, string, string][])
            .filter(([k]) => !(quickFrontFor?.isCustomFront && k === 'coConscious')))
            .map(([k, label, color]) => (
              <TouchableOpacity key={k} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label}
                onPress={() => {
                  const mm = quickFrontFor;
                  setQuickFrontFor(null);
                  if (mm && onQuickAddToFront) onQuickAddToFront(mm.id, k);
                }}
                style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: 1, borderTopColor: T.border}}>
                <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: color}} importantForAccessibility="no" />
                <Text style={{fontSize: fs(14), color: T.text}}>{label}</Text>
              </TouchableOpacity>
            ))}
          <TouchableOpacity onPress={() => setQuickFrontFor(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
            style={{alignItems: 'center', paddingVertical: 13, borderTopWidth: 1, borderTopColor: T.border}}>
            <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
    <Modal visible={showDisplayOptions} transparent animationType="fade" onRequestClose={() => setShowDisplayOptions(false)}>
      <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24}}>
        <View style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, overflow: 'hidden'}}>
          <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, padding: 16, paddingBottom: 8}}>{t('members.displayFields')}</Text>
          {([['groups', t('members.fieldGroups')], ['descriptions', t('members.fieldDescriptions')], ['pronouns', t('members.fieldPronouns')], ['roles', t('members.fieldRoles')], ['count', t('members.fieldCount')]] as ['groups' | 'descriptions' | 'pronouns' | 'roles' | 'count', string][]).map(([k, label]) => {
            const on = listFields[k] !== false;
            return (
              <TouchableOpacity key={k} onPress={() => toggleListField(k)} activeOpacity={0.7}
                accessibilityRole="switch" accessibilityState={{checked: on}} accessibilityLabel={label}
                style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.border}}>
                <Text style={{flex: 1, fontSize: fs(14), color: T.text}} numberOfLines={1}>{label}</Text>
                <View style={{width: 44, height: 26, borderRadius: 13, backgroundColor: on ? T.accent : T.toggleOff, justifyContent: 'center'}}>
                  <View style={{width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', position: 'absolute', left: on ? 21 : 3}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
                </View>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity onPress={() => setShowDisplayOptions(false)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')}
            style={{alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.border}}>
            <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </>
  );
};

const s = StyleSheet.create({
  headerRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14},
  heading: {fontFamily: Fonts.display, fontSize: 22, fontWeight: '600', fontStyle: 'italic'},
  addBtn: {paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1},
  search: {borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, fontSize: 13, marginBottom: 14},
  empty: {alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24},
  card: {borderRadius: 12, borderWidth: 1, padding: 14},
  chip: {paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1},
});
