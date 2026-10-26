import React, {useState, useMemo, useCallback, useDeferredValue, useRef, useEffect, startTransition} from 'react';
import {log} from '../utils/log';
import {reportSaveError} from '../utils/saveError';
import {announceMove} from '../utils/announce';
import {View, TouchableOpacity, Alert, AccessibilityInfo, findNodeHandle} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {FlashList, FlashListRef} from '@shopify/flash-list';
import {useTranslation} from 'react-i18next';
import {scaledFont} from '../theme';
import {useTheme} from '../themeContext';
import {useAppStore} from '../store/appStore';
import {useUiStore} from '../store/uiStore';
import {bulkSetArchived, bulkDeleteMembers, bulkAddGroups, bulkAddTags, bulkSetFacet, restoreDeletedMember, saveMemberSortMode, reorderMember, saveMemberListFields, quickAddToFront, removeFromFront} from '../store/actions';
import {Member, FrontTierKey, MemberSortMode, allFrontMemberIds, descendantsOf, sortGroupsForDisplay, tagKey, toggleInSet, uniqueTags} from '../utils';
import {useDragReorder} from '../hooks/useDragReorder';
import {DragHandle, ReorderLockButton} from '../components/DragHandle';
import {SystemManagerScreen} from './SystemManagerScreen';
import {ms, MemberTab, MemberListFields} from './members/shared';
import {MemberCard} from './members/MemberCard';
import {AlphaRail} from './members/AlphaRail';
import {GroupsToggle, FrontersHeading, SelectionHeader, MemberTabs} from './members/MembersListHeader';
import {GroupFilterChips, TagFilterChips} from './members/FilterChips';
import {SortChips} from '../components/SortChips';
import {BulkActionBar} from './members/BulkActionBar';
import {GroupAssignSheet} from './members/GroupAssignSheet';
import {TagAssignSheet} from './members/TagAssignSheet';
import {QuickFrontSheet} from './members/QuickFrontSheet';
import {DisplayOptionsSheet} from './members/DisplayOptionsSheet';
import {DeletedMembersFooter} from './members/DeletedMembersFooter';
import {MembersEmpty} from './members/MembersEmpty';
import {countByTab, filterMembers, letterIndex, railLettersFor, tabOf} from './members/memberList';

const TAB_TEXT: Record<MemberTab, {add: string; addShort: string; count: string; countFiltered: string}> = {
  active: {add: 'members.add', addShort: 'modal.member', count: 'members.countFronters', countFiltered: 'members.countFiltered'},
  facets: {add: 'members.addFacet', addShort: 'members.facet', count: 'members.countFacet', countFiltered: 'members.countFilteredFacet'},
  customFronts: {add: 'members.addCustomFront', addShort: 'members.customFront', count: 'members.countCustomFront', countFiltered: 'members.countFilteredCustomFront'},
};

interface Props {
  archiveOnly?: boolean;
}

export const MembersScreen = ({archiveOnly = false}: Props) => {
  const T = useTheme();
  const savedSortMode = useAppStore(s => s.appSettings.memberSortMode);
  const savedListFields = useAppStore(s => s.appSettings.memberListFields);
  const openNewMember = useUiStore(s => s.openNewMember);
  const openNewFacet = useUiStore(s => s.openNewFacet);
  const openCustomFront = useUiStore(s => s.openCustomFront);
  const viewMemberEntry = useUiStore(s => s.viewMemberEntry);
  const viewArchivedMember = useUiStore(s => s.viewArchivedMember);
  const activate = archiveOnly ? viewArchivedMember : viewMemberEntry;
  const members = useAppStore(s => s.members);
  const front = useAppStore(s => s.front);
  const groups = useAppStore(s => s.groups);
  const {t} = useTranslation();
  const fs = useMemo(() => scaledFont(T.textScale), [T.textScale]);
  const [memberTab, setMemberTab] = useState<MemberTab>('active');
  const [pressedTab, setPressedTab] = useState<MemberTab>('active');
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<MemberSortMode>((archiveOnly ? undefined : savedSortMode) || 'alphabetical');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showGroupAssign, setShowGroupAssign] = useState(false);
  const [showTagAssign, setShowTagAssign] = useState(false);
  const [showDisplayOptions, setShowDisplayOptions] = useState(false);
  const [quickFrontFor, setQuickFrontFor] = useState<Member | null>(null);
  const [listFields, setListFields] = useState<MemberListFields>({groups: true, descriptions: true, pronouns: true, roles: true, count: true, ...(archiveOnly ? undefined : savedListFields)});
  const changeListFields = (next: MemberListFields) => {
    setListFields(next);
    if (!archiveOnly) saveMemberListFields(next).catch(reportSaveError);
  };
  const changeSortMode = (mode: MemberSortMode) => {
    setSortMode(mode);
    if (!archiveOnly) saveMemberSortMode(mode).catch(reportSaveError);
  };
  const addForTab = () => {
    if (memberTab === 'customFronts') openCustomFront(null);
    else if (memberTab === 'facets') openNewFacet();
    else openNewMember();
  };
  const browseGroups = !archiveOnly && listFields.browse === true;
  const groupsToggleRef = useRef<React.ComponentRef<typeof TouchableOpacity>>(null);
  const focusGroupsToggle = useRef(false);
  const toggleBrowseGroups = () => {
    focusGroupsToggle.current = true;
    clearFilters();
    exitSelection();
    changeListFields({...listFields, browse: !browseGroups});
  };
  useEffect(() => {
    if (!focusGroupsToggle.current) return;
    focusGroupsToggle.current = false;
    const timer = setTimeout(() => {
      const tag = groupsToggleRef.current ? findNodeHandle(groupsToggleRef.current) : null;
      if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
    }, 100);
    return () => clearTimeout(timer);
  }, [browseGroups]);
  const searchRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const listRef = useRef<FlashListRef<Member>>(null);
  const [showTop, setShowTop] = useState(false);
  const scrollToTop = (animated: boolean) => {
    try { listRef.current?.scrollToOffset({offset: 0, animated}); } catch (e) { log.debug('members', e); }
  };

  const enterSelection = useCallback((id?: string) => {
    setSelectionMode(true);
    setSelectedIds(id ? new Set([id]) : new Set());
  }, []);
  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(prev => (prev.size ? new Set() : prev));
  };
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds(prev => toggleInSet(prev, id));
  }, []);
  const clearFilters = () => {
    setQuery('');
    setActiveGroup(null);
    setActiveTag(null);
    searchRef.current?.clear();
  };
  const subTabStart = useRef<{tab: string; at: number} | null>(null);
  useEffect(() => {
    const s = subTabStart.current;
    if (!s || s.tab !== memberTab) return;
    subTabStart.current = null;
    const commit = Date.now() - s.at;
    requestAnimationFrame(() => log.debug('perf', `fronters sub-tab ${memberTab}: ${commit} ms to commit, ${Date.now() - s.at} ms to next frame`));
  }, [memberTab]);
  const switchTab = (tab: MemberTab) => {
    subTabStart.current = {tab, at: Date.now()};
    setPressedTab(tab);
    startTransition(() => {
      setMemberTab(tab);
      clearFilters();
      exitSelection();
    });
  };

  const confirmBulk = ({title, message, action, destructive = false, lockFronting = false, run}: {
    title: string; message: string; action: string; destructive?: boolean; lockFronting?: boolean; run: (ids: string[]) => Promise<void>;
  }) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (lockFronting && ids.some(id => allFrontIds.has(id))) { Alert.alert(t('members.frontingLockTitle'), t('members.frontingLockMsg')); return; }
    Alert.alert(title, message, [
      {text: t('common.cancel'), style: 'cancel'},
      {text: action, style: destructive ? 'destructive' : 'default', onPress: () => { run(ids).then(exitSelection, reportSaveError); }},
    ]);
  };
  const selectedCount = selectedIds.size;
  const confirmBulkArchive = () => confirmBulk({
    title: t('members.bulkArchive'), message: t('members.bulkArchiveMsg', {count: selectedCount}), action: t('members.archive'),
    lockFronting: true, run: ids => bulkSetArchived(ids, true),
  });
  const confirmBulkRestore = () => confirmBulk({
    title: t('members.bulkRestore'), message: t('members.bulkRestoreMsg', {count: selectedCount}), action: t('members.restore'),
    run: ids => bulkSetArchived(ids, false),
  });
  const confirmBulkDelete = () => confirmBulk({
    title: t('members.bulkDelete'), message: t('members.bulkDeleteMsg', {count: selectedCount}), action: t('common.delete'),
    destructive: true, lockFronting: true, run: bulkDeleteMembers,
  });
  const confirmBulkFacet = () => {
    const toFacet = memberTab === 'active';
    const label = toFacet ? t('members.makeFacet') : t('members.makeMember');
    confirmBulk({title: label, message: t('members.selectedCount', {count: selectedCount}), action: label, lockFronting: true, run: ids => bulkSetFacet(ids, toFacet)});
  };
  const applyGroupAssign = (gids: string[]) => {
    const ids = [...selectedIds];
    if (ids.length === 0 || gids.length === 0) { setShowGroupAssign(false); return; }
    bulkAddGroups(ids, gids).then(() => { setShowGroupAssign(false); exitSelection(); }, reportSaveError);
  };
  const knownTags = useMemo(() => uniqueTags(members.filter(m => !m.deleted).flatMap(m => m.tags || [])), [members]);
  const applyTagAssign = (tags: string[]) => {
    const ids = [...selectedIds];
    setShowTagAssign(false);
    if (ids.length === 0 || tags.length === 0) return;
    bulkAddTags(ids, tags).then(exitSelection, reportSaveError);
  };

  const deferredQuery = useDeferredValue(query);

  const tabMembers = useMemo(
    () => members.filter(m => !m.deleted && archiveOnly === !!m.archived && tabOf(m) === memberTab),
    [members, memberTab, archiveOnly],
  );
  const deletedMembers = useMemo(
    () => (archiveOnly ? members.filter(m => m.deleted && tabOf(m) === memberTab) : []),
    [members, memberTab, archiveOnly],
  );
  const allFrontIds = useMemo(() => new Set(allFrontMemberIds(front)), [front]);
  const allTags = useMemo(() => uniqueTags(tabMembers.flatMap(m => m.tags || [])), [tabMembers]);
  const groupChoices = useMemo(() => sortGroupsForDisplay(groups, groups), [groups]);
  useEffect(() => {
    if (activeGroup && !groups.some(g => g.id === activeGroup)) setActiveGroup(null);
  }, [groups, activeGroup]);
  useEffect(() => {
    if (activeTag && !allTags.some(tag => tagKey(tag) === tagKey(activeTag))) setActiveTag(null);
  }, [allTags, activeTag]);
  useEffect(() => {
    if (query && tabMembers.length <= 3) {
      setQuery('');
      searchRef.current?.clear();
    }
  }, [tabMembers.length, query]);
  const tabCounts = useMemo(() => countByTab(members, archiveOnly), [members, archiveOnly]);

  const activeGroupIds = useMemo(() => activeGroup ? new Set([activeGroup, ...descendantsOf(groups, activeGroup).map(g => g.id)]) : null, [activeGroup, groups]);

  const activeTagKey = activeTag ? tagKey(activeTag) : null;
  const filtered = useMemo(
    () => filterMembers(tabMembers, deferredQuery, activeGroupIds, activeTagKey, sortMode),
    [tabMembers, deferredQuery, activeGroupIds, activeTagKey, sortMode],
  );

  const showReorder = !archiveOnly && sortMode === 'manual' && !query && !activeGroup && !activeTag;

  useEffect(() => {
    const id = setTimeout(() => scrollToTop(false), 0);
    return () => clearTimeout(id);
  }, [deferredQuery, activeGroup, activeTag, memberTab]);

  const jumpToLetter = useCallback((letter: string) => {
    const idx = letterIndex(filtered, letter, sortMode);
    if (idx < 0) return;
    try { listRef.current?.scrollToIndex({index: idx, animated: false, viewPosition: 0}); } catch (e) { log.debug('members', e); }
  }, [filtered, sortMode]);
  const showRail = !selectionMode && (sortMode === 'alphabetical' || sortMode === 'reverse-alphabetical') && filtered.length > 12;
  const railLetters = useMemo(() => railLettersFor(filtered, sortMode), [filtered, sortMode]);

  const handleRemoveFromFront = useCallback((mm: Member) => {
    Alert.alert(t('members.removeFromFront'), t('members.removeFromFrontMsg', {name: mm.name}), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('network.remove'), style: 'destructive', onPress: () => { removeFromFront(mm.id).catch(reportSaveError); }},
    ]);
  }, [t]);
  const quickFront = (mm: Member, tier: FrontTierKey) => {
    quickAddToFront(mm.id, tier).catch(reportSaveError);
  };

  const handleReorder = useCallback((id: string, direction: 'up' | 'down') => {
    const idx = filtered.findIndex(m => m.id === id);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= filtered.length) return;
    announceMove(swapIdx, filtered.length, filtered[swapIdx].name, direction === 'up');
    reorderMember(id, direction).catch(reportSaveError);
  }, [filtered]);

  const [reorderOn, setReorderOn] = useState(false);
  const onDropMember = useCallback((id: string, from: number, to: number) => {
    if (to === from) return;
    const dir: 'up' | 'down' = to > from ? 'down' : 'up';
    Promise.all(Array.from({length: Math.abs(to - from)}, () => reorderMember(id, dir))).catch(reportSaveError);
    announceMove(to, filtered.length, filtered[to].name, dir === 'up');
  }, [filtered]);
  const {drag, dragging, registerHeight, makeHandlePanHandlers} = useDragReorder({enabled: reorderOn && showReorder, onDrop: onDropMember});

  const renderMember = useCallback(({item: m, index}: {item: Member; index: number}) => (
    <View
      onLayout={reorderOn && showReorder ? e => registerHeight(m.id, e.nativeEvent.layout.height) : undefined}
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
        showReorder={showReorder && reorderOn}
        front={front}
        allFrontIds={allFrontIds}
        groups={groups}
        onActivate={activate}
        onToggleSelect={toggleSelected}
        onEnterSelection={enterSelection}
        onReorder={handleReorder}
        onQuickFront={archiveOnly ? undefined : setQuickFrontFor}
        onRemoveFromFront={archiveOnly ? undefined : handleRemoveFromFront}
        fields={listFields}
        prevName={index > 0 ? filtered[index - 1].name : undefined}
        nextName={index < filtered.length - 1 ? filtered[index + 1].name : undefined}
        dragHandle={showReorder && !selectionMode ? (
          <DragHandle active={reorderOn} panHandlers={makeHandlePanHandlers(m.id, () => filtered.map(x => x.id))} name={m.name}
            position={index + 1} count={filtered.length}
            onStep={dir => handleReorder(m.id, dir === 1 ? 'down' : 'up')} />
        ) : undefined}
      />
    </View>
  ), [filtered, selectionMode, selectedIds, showReorder, front, allFrontIds, groups, T, activate, toggleSelected, enterSelection, handleReorder, handleRemoveFromFront, listFields, archiveOnly, reorderOn, drag, dragging, registerHeight, makeHandlePanHandlers]);

  const allVisibleIds = useMemo(() => filtered.map(m => m.id), [filtered]);
  const allSelectedInView = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id));

  const flashExtraData = useMemo(
    () => ({T, front, groups, showReorder, filteredLength: filtered.length, selectionMode, selectedCount: selectedIds.size, listFields, reorderOn, drag}),
    [T, front, groups, showReorder, filtered.length, selectionMode, selectedIds.size, listFields, reorderOn, drag],
  );
  const toggleSelectAll = () => setSelectedIds(new Set(allSelectedInView ? [] : allVisibleIds));

  const tabText = TAB_TEXT[memberTab];
  const frontersHeading = <FrontersHeading right={<GroupsToggle on={browseGroups} onToggle={toggleBrowseGroups} toggleRef={groupsToggleRef} />} />;

  const ListHeader = (
    <View>
      {selectionMode ? (
        <SelectionHeader count={selectedIds.size} allSelected={allSelectedInView} onToggleAll={toggleSelectAll} onCancel={exitSelection} />
      ) : (
        <View style={{marginBottom: 14}}>
          {!archiveOnly && frontersHeading}
          {listFields.count !== false && (
            <Text accessibilityLiveRegion="polite" style={{fontSize: fs(11), color: T.dim, marginTop: 2, marginBottom: 10}} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {(query || activeGroup || activeTag)
                ? t(tabText.countFiltered, {filtered: filtered.length, total: tabMembers.length})
                : t(tabText.count, {count: tabMembers.length})}
            </Text>
          )}
          <View style={{flexDirection: 'row', gap: 6, flexWrap: 'wrap'}}>
            <TouchableOpacity onPress={() => enterSelection()} activeOpacity={0.7} accessibilityRole="button"
              hitSlop={{top: 9, bottom: 9}} style={[ms.addBtn, {backgroundColor: T.surface, borderColor: T.border}]}>
              <Text style={{fontSize: fs(12), fontWeight: '500', color: T.dim}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('members.select')}</Text>
            </TouchableOpacity>
            {!archiveOnly && (
              <TouchableOpacity
                onPress={addForTab}
                activeOpacity={0.7} accessibilityRole="button"
                accessibilityLabel={t(tabText.add)}
                hitSlop={{top: 6, bottom: 8}} style={[ms.addBtn, {backgroundColor: T.accentBg, borderColor: `${T.accent}40`}]}>
                <Text style={{fontSize: fs(13), fontWeight: '500', color: T.accent}} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                  {`+ ${t(tabText.addShort)}`}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setShowDisplayOptions(true)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('members.displayFields')}
              hitSlop={{top: 6, bottom: 8}} style={[ms.addBtn, {backgroundColor: T.surface, borderColor: T.border}]}>
              <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(13), color: T.dim}} numberOfLines={1} maxFontSizeMultiplier={1.2} allowFontScaling={false}>⚙</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {selectionMode && selectedIds.size > 0 && (
        <BulkActionBar memberTab={memberTab}
          onAssignGroups={!archiveOnly && groups.length > 0 ? () => setShowGroupAssign(true) : undefined}
          onAssignTags={archiveOnly ? undefined : () => setShowTagAssign(true)}
          onArchive={archiveOnly ? undefined : confirmBulkArchive}
          onRestore={archiveOnly ? confirmBulkRestore : undefined}
          onFacet={!archiveOnly && memberTab !== 'customFronts' ? confirmBulkFacet : undefined}
          onDelete={confirmBulkDelete} />
      )}

      <MemberTabs tab={pressedTab} onSwitch={switchTab} showCount={listFields.count !== false}
        counts={tabCounts}
        right={showReorder ? <ReorderLockButton on={reorderOn} onToggle={() => setReorderOn(v => !v)} /> : undefined} />

      <SortChips value={sortMode} onChange={changeSortMode} />
      <GroupFilterChips groups={groups} choices={groupChoices} active={activeGroup} onChange={setActiveGroup} />
      <TagFilterChips tags={allTags} active={activeTag} onChange={setActiveTag} />

      {tabMembers.length > 3 && (
        <TextInput ref={searchRef} defaultValue="" onChangeText={setQuery} accessibilityLabel={t('members.search')} placeholder={t('members.search')} placeholderTextColor={T.muted}
          autoCorrect={false} autoComplete="off" spellCheck={false} textContentType="none"
          style={[ms.search, {backgroundColor: T.surface, color: T.text, borderColor: T.border, fontSize: fs(13)}]} />
      )}
    </View>
  );

  if (browseGroups) {
    return (
      <SystemManagerScreen startBrowsing hideRootTitle
        onViewMember={id => { const mm = members.find(x => x.id === id); if (mm) activate(mm); }}
        header={<View style={{marginBottom: 14}}>{frontersHeading}</View>} />
    );
  }

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
        ListFooterComponent={deletedMembers.length > 0 ? (
          <DeletedMembersFooter members={deletedMembers} onRestore={id => { restoreDeletedMember(id).catch(reportSaveError); }} />
        ) : null}
        ListEmptyComponent={
          <MembersEmpty archiveOnly={archiveOnly} memberTab={memberTab} total={tabMembers.length}
            onAdd={addForTab} onClear={clearFilters} />
        }
      />
      <AlphaRail show={showRail} letters={railLetters} color={T.dim} onJump={jumpToLetter} />
      {showTop && (
        <TouchableOpacity onPress={() => scrollToTop(true)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('members.backToTop')}
          style={{position: 'absolute', right: 16, bottom: 24, width: 44, height: 44, borderRadius: 22, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 4}}>
          <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(20), fontWeight: '700', color: T.bg}} allowFontScaling={false}>↑</Text>
        </TouchableOpacity>
      )}
      <GroupAssignSheet visible={showGroupAssign} groups={groups} onApply={applyGroupAssign} onClose={() => setShowGroupAssign(false)} />
      <TagAssignSheet visible={showTagAssign} known={knownTags} onApply={applyTagAssign} onClose={() => setShowTagAssign(false)} />
      <QuickFrontSheet member={quickFrontFor} onPick={quickFront} onClose={() => setQuickFrontFor(null)} />
      <DisplayOptionsSheet visible={showDisplayOptions} fields={listFields} onChange={changeListFields} onClose={() => setShowDisplayOptions(false)} />
    </>
  );
};
