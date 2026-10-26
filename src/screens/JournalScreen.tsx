import React, {useState, useMemo, useEffect, useCallback} from 'react';
import {View, ScrollView, TouchableOpacity, Alert, StyleSheet, AccessibilityInfo} from 'react-native';
import type {ScrollViewProps} from 'react-native';
import {KeyboardAwareScrollView} from 'react-native-keyboard-controller';
import type {KeyboardAwareScrollViewRef} from 'react-native-keyboard-controller';
import {FlashList} from '@shopify/flash-list';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {errorMessage} from '../utils/log';
import {Fonts, fontScale, initialOn} from '../theme';
import {useTheme} from '../themeContext';
import {useAppStore} from '../store/appStore';
import {saveJournalTemplates, saveEntry, deleteEntry} from '../store/actions';
import {reportSaveError} from '../utils/saveError';
import {useUiStore} from '../store/uiStore';
import {JournalEntry, JournalTemplate, tagKey, uniqueTags, upsertById, isRosterMember, isFacetMember} from '../utils';
import {exportEntry} from '../export/journalExport';
import type {JournalExportFormat} from '../export/journalExport';
import {JournalTemplateModal} from '../modals';
import {PasswordDialog} from '../components/PasswordDialog';
import {MemberPicker} from '../components/MemberPicker';
import {pickerPool} from '../picker/memberPicker';
import {filterJournal, filterTags, journalAuthorIds} from '../journal/journal';
import {EntryAction, EntryViewer, ExportMenu, JournalEntryRow, TemplateCards} from './journal/JournalParts';

const togglePinned = (e: JournalEntry) => { saveEntry({...e, pinned: !e.pinned}).catch(reportSaveError); };

type JournalSubTab = 'entries' | 'templates';

const SUB_TABS: {tab: JournalSubTab; key: string}[] = [
  {tab: 'entries', key: 'journal.entriesTab'},
  {tab: 'templates', key: 'journal.templatesTab'},
];

const JournalScrollView = React.forwardRef<KeyboardAwareScrollViewRef, ScrollViewProps>(function JournalScrollView(props, ref) {
  return <KeyboardAwareScrollView {...props} ref={ref} bottomOffset={24} />;
});

const EntryGap = () => <View style={{height: 9}} />;
const entryKey = (e: JournalEntry) => e.id;
const NO_ENTRIES: JournalEntry[] = [];
const NO_ANCHOR = {disabled: true};

export const JournalScreen = () => {
  const T = useTheme();
  const openJournal = useUiStore(s => s.openJournal);
  const onMentionPress = useUiStore(s => s.openMemberById);
  const onAdd = () => openJournal(null);
  const journal = useAppStore(s => s.journal);
  const templates = useAppStore(s => s.journalTemplates);
  const members = useAppStore(s => s.members);
  const systemJournalPassword = useAppStore(s => s.system.journalPassword);
  const {t} = useTranslation();
  const fs = useMemo(() => fontScale(T), [T]);
  const [journalUnlocked, setJournalUnlocked] = useState(!systemJournalPassword);
  const [globalPwInput, setGlobalPwInput] = useState('');
  const [globalPwError, setGlobalPwError] = useState(false);
  const [unlockedEntries, setUnlockedEntries] = useState<Set<string>>(new Set());
  const [entryPwModal, setEntryPwModal] = useState<{entry: JournalEntry; mode: EntryAction} | null>(null);
  const [viewEntry, setViewEntry] = useState<JournalEntry | null>(null);
  const [entryPwInput, setEntryPwInput] = useState('');
  const [entryPwError, setEntryPwError] = useState(false);
  const [exportMenuEntry, setExportMenuEntry] = useState<JournalEntry | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeAuthor, setActiveAuthor] = useState<string | null>(null);
  const [tagSearch, setTagSearch] = useState('');
  const [showTagResults, setShowTagResults] = useState(false);
  const [subTab, setSubTab] = useState<JournalSubTab>('entries');
  const [editingTemplate, setEditingTemplate] = useState<JournalTemplate | 'new' | null>(null);

  const handleSaveTemplate = async (tpl: JournalTemplate) => {
    await saveJournalTemplates(upsertById(templates, tpl));
    setEditingTemplate(null);
  };
  const handleDeleteTemplate = (id: string) => {
    Alert.alert(t('common.delete'), t('journal.deleteTemplateMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => {
        saveJournalTemplates(templates.filter(x => x.id !== id)).then(() => setEditingTemplate(null), reportSaveError);
      }},
    ]);
  };

  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const allTags = useMemo(() => uniqueTags(journal.flatMap(e => e.hashtags || [])), [journal]);
  const activeTagKey = activeTag ? tagKey(activeTag) : null;

  const authorIdsInJournal = useMemo(() => journalAuthorIds(journal), [journal]);
  const activeAuthors = useMemo(
    () => members.filter(m => isRosterMember(m) && !m.archived && authorIdsInJournal.has(m.id)),
    [members, authorIdsInJournal],
  );
  const facetAuthors = useMemo(
    () => members.filter(m => isFacetMember(m) && !m.archived && authorIdsInJournal.has(m.id)),
    [members, authorIdsInJournal],
  );

  const filteredJournal = useMemo(() => filterJournal(journal, activeTagKey, activeAuthor), [journal, activeTagKey, activeAuthor]);

  const filteredTags = useMemo(() => filterTags(allTags, tagSearch), [allTags, tagSearch]);
  const authorPools = useMemo(
    () => [pickerPool('members', activeAuthors, t), pickerPool('facets', facetAuthors, t)],
    [activeAuthors, facetAuthors, t],
  );

  useEffect(() => { if (!systemJournalPassword) setJournalUnlocked(true); }, [systemJournalPassword]);

  const handleGlobalUnlock = () => {
    if (globalPwInput === systemJournalPassword) {setJournalUnlocked(true); setGlobalPwError(false); setGlobalPwInput('');}
    else {setGlobalPwError(true); AccessibilityInfo.announceForAccessibility(t('journal.incorrectPassword'));}
  };

  const performEntryAction = useCallback((entry: JournalEntry, action: EntryAction) => {
    if (action === 'edit') openJournal(entry);
    else if (action === 'view') setViewEntry(entry);
    else if (action === 'export') setExportMenuEntry(entry);
    else {
      Alert.alert(t('journal.deleteEntry'), t('journal.areYouSure'), [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('common.delete'), style: 'destructive', onPress: () => { deleteEntry(entry.id).catch(reportSaveError); }},
      ]);
    }
  }, [openJournal, t]);

  const requestEntry = useCallback((entry: JournalEntry, action: EntryAction) => {
    if (!entry.password || unlockedEntries.has(entry.id)) {
      performEntryAction(entry, action);
      return;
    }
    setEntryPwInput('');
    setEntryPwError(false);
    setEntryPwModal({entry, mode: action});
  }, [unlockedEntries, performEntryAction]);

  const selectTag = useCallback((tag: string, selected: boolean) => {setActiveTag(selected ? null : tag); setTagSearch('');}, []);

  const handleEntryPwConfirm = () => {
    if (!entryPwModal) return;
    if (entryPwInput !== entryPwModal.entry.password) {
      setEntryPwError(true);
      AccessibilityInfo.announceForAccessibility(t('journal.incorrectPassword'));
      return;
    }
    setUnlockedEntries(prev => new Set([...prev, entryPwModal.entry.id]));
    setEntryPwError(false);
    performEntryAction(entryPwModal.entry, entryPwModal.mode);
    setEntryPwModal(null);
  };

  const handleEntryExport = (entry: JournalEntry, fmt: JournalExportFormat) => {
    setExportMenuEntry(null);
    exportEntry(entry, members, fmt).catch(e => Alert.alert(t('share.exportFailed'), errorMessage(e)));
  };

  const renderEntry = useCallback(({item}: {item: JournalEntry}) => (
    <JournalEntryRow
      entry={item}
      isLocked={!!item.password && !unlockedEntries.has(item.id)}
      activeTagKey={activeTagKey}
      memberById={memberById}
      onMentionPress={onMentionPress}
      onTogglePin={togglePinned}
      onAction={requestEntry}
      onTagPress={selectTag}
    />
  ), [unlockedEntries, activeTagKey, memberById, onMentionPress, requestEntry, selectTag]);

  const listExtraData = useMemo(
    () => ({unlockedEntries, activeTagKey, memberById, T, t, onMentionPress}),
    [unlockedEntries, activeTagKey, memberById, T, t, onMentionPress],
  );

  if (!journalUnlocked) {
    return (
      <View style={{flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32}}>
        <Text style={{fontSize: fs(44), color: T.accent, marginBottom: 16}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">◉</Text>
        <Text accessibilityRole="header" style={[s.heading, {color: T.text, marginBottom: 8, fontSize: fs(22)}]}>{t('journal.locked')}</Text>
        <Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center', marginBottom: 24}}>{t('journal.enterPasswordToContinue')}</Text>
        <TextInput value={globalPwInput} onChangeText={v => {setGlobalPwInput(v); setGlobalPwError(false);}}
          accessibilityLabel={t('journal.password')} placeholder={t('journal.password')} placeholderTextColor={T.muted} secureTextEntry
          style={[s.input, {width: '100%', backgroundColor: T.surface, color: T.text, borderColor: globalPwError ? T.danger : T.border, marginBottom: 6, fontSize: fs(15)}]}
          onSubmitEditing={handleGlobalUnlock} />
        {globalPwError && <Text accessibilityRole="alert" style={{fontSize: fs(12), color: T.danger, marginBottom: 10, alignSelf: 'flex-start'}}>{t('journal.incorrectPassword')}</Text>}
        <TouchableOpacity onPress={handleGlobalUnlock} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('journal.unlockJournal')}
          style={{width: '100%', backgroundColor: T.accent, borderRadius: 8, paddingVertical: 13, alignItems: 'center', marginTop: 8}}>
          <Text style={{fontSize: fs(15), fontWeight: '700', color: initialOn(T.accent)}}>{t('journal.unlockJournal')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const listHeader = (
    <>
      <View style={s.headerRow}>
        <Text
          accessibilityRole="header"
          style={[s.heading, {color: T.text, flex: 1, marginRight: 8, fontSize: fs(22)}]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}>
          {t('journal.title')}
        </Text>
        <TouchableOpacity
          onPress={() => subTab === 'entries' ? onAdd() : setEditingTemplate('new')}
          activeOpacity={0.7}
          accessibilityRole="button"
          hitSlop={{top: 8, bottom: 8}} style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
          <Text style={{fontSize: fs(13), fontWeight: '500', color: T.accent}}>{subTab === 'entries' ? t('journal.new') : t('journal.newTemplate')}</Text>
        </TouchableOpacity>
      </View>

      <View style={{flexDirection: 'row', marginBottom: 14, borderBottomWidth: 1, borderBottomColor: T.border}}>
        {SUB_TABS.map(({tab, key}) => (
          <TouchableOpacity key={tab} onPress={() => setSubTab(tab)} activeOpacity={0.7}
            accessibilityRole="tab" accessibilityState={{selected: subTab === tab}}
            hitSlop={{top: 6, bottom: 6}} style={{flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: subTab === tab ? T.accent : 'transparent'}}>
            <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={{fontSize: fs(13), textAlign: 'center', color: subTab === tab ? T.accent : T.dim, fontWeight: subTab === tab ? '600' : '400'}}>{t(key)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {subTab === 'templates' ? (
        <TemplateCards templates={templates} onEdit={setEditingTemplate} />
      ) : (
        <>
          {allTags.length > 0 && (
            <View style={{marginBottom: 8}}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4}}>
                {activeTag && (
                  <TouchableOpacity onPress={() => selectTag(activeTag, true)} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityLabel={t('common.clearItem', {name: activeTag})}
                    hitSlop={{top: 10, bottom: 10}} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: `${T.info}18`, borderWidth: 1, borderColor: `${T.info}40`}}>
                    <Text style={{fontSize: fs(11), color: T.info, fontWeight: '600'}}>{activeTag}</Text>
                    <Text style={{fontSize: fs(10), color: T.danger}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✕</Text>
                  </TouchableOpacity>
                )}
                <TextInput value={tagSearch} onChangeText={v => {setTagSearch(v); setShowTagResults(v.length > 0);}} onFocus={() => setShowTagResults(tagSearch.length > 0)}
                  accessibilityLabel={t('journal.searchTags')} placeholder={t('journal.searchTags')} placeholderTextColor={T.muted}
                  style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, fontSize: fs(12)}} />
              </View>
              {showTagResults && filteredTags.length > 0 && (
                <View style={{backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.border, maxHeight: 140, overflow: 'hidden', marginBottom: 4}}>
                  <ScrollView nestedScrollEnabled>
                    {filteredTags.map(tag => {
                      const sel = activeTagKey === tagKey(tag);
                      return (
                        <TouchableOpacity key={tag} onPress={() => {selectTag(tag, sel); setShowTagResults(false);}} activeOpacity={0.7}
                          accessibilityRole="button" accessibilityState={{selected: sel}} accessibilityLabel={tag}
                          style={{paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: sel ? `${T.info}12` : 'transparent'}}>
                          <Text style={{fontSize: fs(12), color: sel ? T.info : T.text}}>{tag}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {(activeAuthors.length > 0 || facetAuthors.length > 0) && (
            <View style={{marginBottom: 14}}>
              <MemberPicker pools={authorPools} selected={activeAuthor} onPick={m => setActiveAuthor(activeAuthor === m.id ? null : m.id)} requireSearch selectedChips
                maxResults={Infinity} listMaxHeight={140} searchLabel={t('journal.searchAuthors')} />
            </View>
          )}
        </>
      )}
    </>
  );

  const listEmpty = subTab === 'entries' ? (
    <View style={{alignItems: 'center', paddingVertical: 48}}>
      <Text style={{fontSize: fs(36), opacity: 0.4, marginBottom: 12}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">◉</Text>
      <Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center', marginBottom: 16}}>
        {activeTag ? t('journal.noEntriesTagged', {tag: activeTag}) : t('journal.noEntries')}
      </Text>
      {!activeTag && (
        <TouchableOpacity onPress={onAdd} activeOpacity={0.7} accessibilityRole="button"
          hitSlop={{top: 6, bottom: 6}} style={{paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
          <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>{t('journal.writeEntry')}</Text>
        </TouchableOpacity>
      )}
    </View>
  ) : null;

  return (
    <View style={{flex: 1, backgroundColor: T.bg}}>
      <FlashList
        data={subTab === 'entries' ? filteredJournal : NO_ENTRIES}
        renderItem={renderEntry}
        keyExtractor={entryKey}
        extraData={listExtraData}
        ItemSeparatorComponent={EntryGap}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        renderScrollComponent={JournalScrollView}
        maintainVisibleContentPosition={NO_ANCHOR}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      />

      <JournalTemplateModal
        visible={editingTemplate !== null}
        template={editingTemplate === 'new' ? null : editingTemplate}
        onSave={handleSaveTemplate}
        onDelete={handleDeleteTemplate}
        onClose={() => setEditingTemplate(null)} />

      <ExportMenu entry={exportMenuEntry} onPick={handleEntryExport} onClose={() => setExportMenuEntry(null)} />

      <EntryViewer
        entry={viewEntry}
        memberById={memberById}
        onMentionPress={onMentionPress}
        onClose={() => setViewEntry(null)}
        onEdit={e => { setViewEntry(null); requestEntry(e, 'edit'); }}
      />

      <PasswordDialog
        visible={!!entryPwModal}
        title={t('journal.entryLocked')}
        hint={entryPwModal?.mode === 'delete' ? t('journal.deletePasswordPrompt') : t('journal.unlockPasswordPrompt')}
        value={entryPwInput}
        onChange={v => { setEntryPwInput(v); setEntryPwError(false); }}
        submitLabel={entryPwModal?.mode === 'delete' ? t('common.delete') : t('journal.unlock')}
        onSubmit={handleEntryPwConfirm}
        submitOnEnter
        error={entryPwError}
        onCancel={() => setEntryPwModal(null)}
      />
    </View>
  );
};

const s = StyleSheet.create({
  content: {padding: 16, paddingBottom: 32},
  headerRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14},
  heading: {fontFamily: Fonts.display, fontSize: 22, fontWeight: '600', fontStyle: 'italic'},
  input: {borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15},
});
