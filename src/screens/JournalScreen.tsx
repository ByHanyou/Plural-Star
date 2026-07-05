import React, {useState} from 'react';
import {View, ScrollView, TouchableOpacity, Modal, Alert, Image, StyleSheet} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Fonts} from '../theme';
import {JournalEntry, JournalTemplate, Member, fmtTime, sortMembersBySearch} from '../utils';
import {exportEntryTxt, exportEntryMd, exportEntryJSON} from '../export/exportUtils';
import {RichText} from '../components/MarkdownRenderer';
import {JournalTemplateModal} from '../modals';

interface Props {
  theme: any;
  journal: JournalEntry[];
  templates: JournalTemplate[];
  members: Member[];
  systemJournalPassword?: string;
  onAdd: () => void;
  onEdit: (entry: JournalEntry) => void;
  onDelete: (id: string) => void;
  onTogglePin: (entry: JournalEntry) => void;
  onSaveTemplates: (t: JournalTemplate[]) => void;
  onMentionPress?: (memberId: string) => void;
}

type JournalSubTab = 'entries' | 'templates';

export const JournalScreen = ({theme: T, journal, templates, members, systemJournalPassword, onAdd, onEdit, onDelete, onTogglePin, onSaveTemplates, onMentionPress}: Props) => {
  const {t} = useTranslation();
  const fs = (s: number) => Math.round(s * (T.textScale || 1));
  const [journalUnlocked, setJournalUnlocked] = useState(!systemJournalPassword);
  const [globalPwInput, setGlobalPwInput] = useState('');
  const [globalPwError, setGlobalPwError] = useState(false);
  const [unlockedEntries, setUnlockedEntries] = useState<Set<string>>(new Set());
  const [entryPwModal, setEntryPwModal] = useState<{entry: JournalEntry; mode: 'edit' | 'delete' | 'view'} | null>(null);
  const [viewEntry, setViewEntry] = useState<JournalEntry | null>(null);
  const [entryPwInput, setEntryPwInput] = useState('');
  const [entryPwError, setEntryPwError] = useState(false);
  const [exportMenuEntry, setExportMenuEntry] = useState<JournalEntry | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeAuthor, setActiveAuthor] = useState<string | null>(null);
  const [tagSearch, setTagSearch] = useState('');
  const [authorSearch, setAuthorSearch] = useState('');
  const [showTagResults, setShowTagResults] = useState(false);
  const [showAuthorResults, setShowAuthorResults] = useState(false);
  const [subTab, setSubTab] = useState<JournalSubTab>('entries');
  const [editingTemplate, setEditingTemplate] = useState<JournalTemplate | 'new' | null>(null);

  const handleSaveTemplate = (tpl: JournalTemplate) => {
    const existing = templates.find(x => x.id === tpl.id);
    const next = existing
      ? templates.map(x => (x.id === tpl.id ? tpl : x))
      : [...templates, tpl];
    onSaveTemplates(next);
    setEditingTemplate(null);
  };
  const handleDeleteTemplate = (id: string) => {
    Alert.alert(t('common.delete'), t('journal.deleteTemplateMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => {
        onSaveTemplates(templates.filter(x => x.id !== id));
        setEditingTemplate(null);
      }},
    ]);
  };

  const getMember = (id: string) => members.find(m => m.id === id);
  const allTags = [...new Set(journal.flatMap(e => e.hashtags || []))].sort();
  const activeAuthors = members.filter(m => journal.some(e => (e.authorIds || []).includes(m.id)));

  const filteredJournal = journal.filter(e => {
    const tagMatch = !activeTag || (e.hashtags || []).includes(activeTag);
    const authorMatch = !activeAuthor || (e.authorIds || []).includes(activeAuthor);
    return tagMatch && authorMatch;
  }).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const filteredTags = allTags.filter(tag => !tagSearch || tag.toLowerCase().includes(tagSearch.toLowerCase()));
  const filteredAuthors = sortMembersBySearch(activeAuthors.filter(m => !authorSearch || m.name.toLowerCase().includes(authorSearch.toLowerCase())), authorSearch);

  const handleGlobalUnlock = () => {
    if (globalPwInput === systemJournalPassword) {setJournalUnlocked(true); setGlobalPwError(false); setGlobalPwInput('');}
    else setGlobalPwError(true);
  };

  const handleEntryTap = (entry: JournalEntry) => {
    if (!entry.password || unlockedEntries.has(entry.id)) {onEdit(entry);}
    else {setEntryPwInput(''); setEntryPwError(false); setEntryPwModal({entry, mode: 'edit'});}
  };

  const handleViewTap = (entry: JournalEntry) => {
    if (!entry.password || unlockedEntries.has(entry.id)) {setViewEntry(entry);}
    else {setEntryPwInput(''); setEntryPwError(false); setEntryPwModal({entry, mode: 'view'});}
  };

  const handleDeleteTap = (entry: JournalEntry) => {
    if (!entry.password || unlockedEntries.has(entry.id)) {
      Alert.alert(t('journal.deleteEntry'), t('journal.areYouSure'), [{text: t('common.cancel'), style: 'cancel'}, {text: t('common.delete'), style: 'destructive', onPress: () => onDelete(entry.id)}]);
    } else {
      setEntryPwInput(''); setEntryPwError(false); setEntryPwModal({entry, mode: 'delete'});
    }
  };

  const handleEntryPwConfirm = () => {
    if (!entryPwModal) return;
    if (entryPwInput === entryPwModal.entry.password) {
      setUnlockedEntries(prev => new Set([...prev, entryPwModal.entry.id]));
      setEntryPwError(false);
      if (entryPwModal.mode === 'edit') {onEdit(entryPwModal.entry);}
      else if (entryPwModal.mode === 'view') {setViewEntry(entryPwModal.entry);}
      else {Alert.alert(t('journal.deleteEntry'), t('journal.areYouSure'), [{text: t('common.cancel'), style: 'cancel'}, {text: t('common.delete'), style: 'destructive', onPress: () => onDelete(entryPwModal.entry.id)}]);}
      setEntryPwModal(null);
    } else setEntryPwError(true);
  };

  const handleEntryExport = (entry: JournalEntry, fmt: 'txt' | 'md' | 'json') => {
    setExportMenuEntry(null);
    const run = async () => {
      try {
        if (fmt === 'txt') await exportEntryTxt(entry, members);
        else if (fmt === 'md') await exportEntryMd(entry, members);
        else await exportEntryJSON(entry);
      } catch (e) {Alert.alert(t('share.exportFailed'), String(e));}
    };
    run();
  };

  if (!journalUnlocked) {
    return (
      <View style={{flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32}}>
        <Text style={{fontSize: fs(44), color: T.accent, marginBottom: 16}}>◉</Text>
        <Text accessibilityRole="header" style={[s.heading, {color: T.text, marginBottom: 8}]}>{t('journal.locked')}</Text>
        <Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center', marginBottom: 24}}>{t('journal.enterPasswordToContinue')}</Text>
        <TextInput value={globalPwInput} onChangeText={v => {setGlobalPwInput(v); setGlobalPwError(false);}}
          placeholder={t('journal.password')} placeholderTextColor={T.muted} secureTextEntry
          style={[s.input, {width: '100%', backgroundColor: T.surface, color: T.text, borderColor: globalPwError ? T.danger : T.border, marginBottom: 6}]}
          onSubmitEditing={handleGlobalUnlock} />
        {globalPwError && <Text style={{fontSize: fs(12), color: T.danger, marginBottom: 10, alignSelf: 'flex-start'}}>{t('journal.incorrectPassword')}</Text>}
        <TouchableOpacity onPress={handleGlobalUnlock} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('journal.unlockJournal')}
          style={{width: '100%', backgroundColor: T.accent, borderRadius: 8, paddingVertical: 13, alignItems: 'center', marginTop: 8}}>
          <Text style={{fontSize: fs(15), fontWeight: '700', color: '#0a0508'}}>{t('journal.unlockJournal')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.headerRow}>
        <Text
          accessibilityRole="header"
          style={[s.heading, {color: T.text, flex: 1, marginRight: 8}]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}>
          {t('journal.title')}
        </Text>
        <TouchableOpacity
          onPress={() => subTab === 'entries' ? onAdd() : setEditingTemplate('new')}
          activeOpacity={0.7}
          accessibilityRole="button"
          style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
          <Text style={{fontSize: fs(13), fontWeight: '500', color: T.accent}}>
            {subTab === 'entries'
              ? t('journal.new')
              : t('journal.newTemplate')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{flexDirection: 'row', gap: 0, marginBottom: 14, borderBottomWidth: 1, borderBottomColor: T.border}}>
        {(['entries', 'templates'] as JournalSubTab[]).map(tab => (
          <TouchableOpacity key={tab} onPress={() => setSubTab(tab)} activeOpacity={0.7}
            accessibilityRole="tab" accessibilityState={{selected: subTab === tab}}
            style={{flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: subTab === tab ? T.accent : 'transparent'}}>
            <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={{fontSize: fs(13), textAlign: 'center', color: subTab === tab ? T.accent : T.dim, fontWeight: subTab === tab ? '600' : '400'}}>
              {tab === 'entries'
                ? t('journal.entriesTab')
                : t('journal.templatesTab')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {subTab === 'templates' ? (
        templates.length === 0 ? (
          <View style={{alignItems: 'center', paddingVertical: 48}}>
            <Text style={{fontSize: fs(36), opacity: 0.4, marginBottom: 12}}>◫</Text>
            <Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center', marginBottom: 16}}>
              {t('journal.noTemplates')}
            </Text>
            <TouchableOpacity onPress={() => setEditingTemplate('new')} activeOpacity={0.7} accessibilityRole="button"
              style={{paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
              <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>
                {t('journal.newTemplate')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{gap: 9}}>
            {templates.map(tpl => (
              <TouchableOpacity key={tpl.id} onPress={() => setEditingTemplate(tpl)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={`${tpl.name}, ${t('common.edit')}`}
                style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 14}}>
                <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4}}>
                  <Text style={{fontSize: fs(14), fontWeight: '600', color: T.text, flex: 1}} numberOfLines={1}>{tpl.name}</Text>
                  <Text style={{fontSize: fs(11), color: T.muted}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✎</Text>
                </View>
                {tpl.title ? (
                  <Text style={{fontSize: fs(12), color: T.dim, marginBottom: 4}} numberOfLines={1}>{tpl.title}</Text>
                ) : null}
                {tpl.body ? (
                  <Text style={{fontSize: fs(11), color: T.muted, marginBottom: 4}} numberOfLines={2}>
                    {tpl.body.replace(/<[^>]+>/g, '').replace(/[#*`~_]/g, '').trim()}
                  </Text>
                ) : null}
                {(tpl.hashtags || []).length > 0 && (
                  <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4}}>
                    {tpl.hashtags.slice(0, 8).map(tag => (
                      <Text key={tag} style={{fontSize: fs(10), color: T.info, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: `${T.info}15`}}>{tag}</Text>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )
      ) : (
      <>

      {allTags.length > 0 && (
        <View style={{marginBottom: 8}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4}}>
            {activeTag && (
              <TouchableOpacity onPress={() => {setActiveTag(null); setTagSearch('');}} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={`${t('common.clear')} ${activeTag}`}
                style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: `${T.info}18`, borderWidth: 1, borderColor: `${T.info}40`}}>
                <Text style={{fontSize: fs(11), color: T.info, fontWeight: '600'}}>{activeTag}</Text>
                <Text style={{fontSize: fs(10), color: T.danger}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✕</Text>
              </TouchableOpacity>
            )}
            <TextInput value={tagSearch} onChangeText={v => {setTagSearch(v); setShowTagResults(v.length > 0);}} onFocus={() => setShowTagResults(tagSearch.length > 0)}
              placeholder={t('journal.searchTags')} placeholderTextColor={T.muted}
              style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, fontSize: fs(12)}} />
          </View>
          {showTagResults && filteredTags.length > 0 && (
            <View style={{backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.border, maxHeight: 140, overflow: 'hidden', marginBottom: 4}}>
              <ScrollView nestedScrollEnabled>
                {filteredTags.map(tag => (
                  <TouchableOpacity key={tag} onPress={() => {setActiveTag(activeTag === tag ? null : tag); setTagSearch(''); setShowTagResults(false);}} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityState={{selected: activeTag === tag}} accessibilityLabel={tag}
                    style={{paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: activeTag === tag ? `${T.info}12` : 'transparent'}}>
                    <Text style={{fontSize: fs(12), color: activeTag === tag ? T.info : T.text}}>{tag}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      {activeAuthors.length > 0 && (
        <View style={{marginBottom: 14}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4}}>
            {activeAuthor && (() => {
              const m = getMember(activeAuthor);
              return m ? (
                <TouchableOpacity onPress={() => {setActiveAuthor(null); setAuthorSearch('');}} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityLabel={`${t('common.clear')} ${m.name}`}
                  style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: `${m.color}18`, borderWidth: 1, borderColor: `${m.color}40`}}>
                  <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: m.color}} />
                  <Text style={{fontSize: fs(11), color: m.color, fontWeight: '600'}}>{m.name}</Text>
                  <Text style={{fontSize: fs(10), color: T.danger}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✕</Text>
                </TouchableOpacity>
              ) : null;
            })()}
            <TextInput value={authorSearch} onChangeText={v => {setAuthorSearch(v); setShowAuthorResults(v.length > 0);}} onFocus={() => setShowAuthorResults(authorSearch.length > 0)}
              placeholder={t('journal.searchAuthors')} placeholderTextColor={T.muted}
              style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, fontSize: fs(12)}} />
          </View>
          {showAuthorResults && filteredAuthors.length > 0 && (
            <View style={{backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.border, maxHeight: 140, overflow: 'hidden', marginBottom: 4}}>
              <ScrollView nestedScrollEnabled>
                {filteredAuthors.map(m => (
                  <TouchableOpacity key={m.id} onPress={() => {setActiveAuthor(activeAuthor === m.id ? null : m.id); setAuthorSearch(''); setShowAuthorResults(false);}} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityState={{selected: activeAuthor === m.id}} accessibilityLabel={m.name}
                    style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: activeAuthor === m.id ? `${m.color}12` : 'transparent'}}>
                    <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: m.color}} />
                    <Text style={{fontSize: fs(12), color: activeAuthor === m.id ? m.color : T.text}}>{m.name}</Text>
                    {activeAuthor === m.id && <Text style={{color: m.color, marginLeft: 'auto'}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      {!filteredJournal.length ? (
        <View style={{alignItems: 'center', paddingVertical: 48}}>
          <Text style={{fontSize: fs(36), opacity: 0.4, marginBottom: 12}}>◉</Text>
          <Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center', marginBottom: 16}}>
            {activeTag ? t('journal.noEntriesTagged', {tag: activeTag}) : t('journal.noEntries')}
          </Text>
          {!activeTag && (
            <TouchableOpacity onPress={onAdd} activeOpacity={0.7} accessibilityRole="button"
              style={{paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
              <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>{t('journal.writeEntry')}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={{gap: 9}}>
          {filteredJournal.map(e => {
            const authors = (e.authorIds || []).map(id => getMember(id)).filter(Boolean) as Member[];
            const isLocked = !!e.password && !unlockedEntries.has(e.id);
            return (
              <View key={e.id} style={[s.card, {backgroundColor: e.pinned ? `${T.accent}10` : T.card, borderColor: e.pinned ? `${T.accent}50` : T.border}]}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4}}>
                  <Text style={{fontSize: fs(15), fontWeight: '500', color: T.text, flex: 1, marginRight: 8}} numberOfLines={2}>{e.pinned ? '📌 ' : ''}{e.title || t('common.untitled')}</Text>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                    {isLocked && <Text style={{fontSize: fs(13)}} accessibilityLabel={t('journal.locked')}>🔒</Text>}
                    <TouchableOpacity onPress={() => onTogglePin(e)} style={{padding: 4}} accessibilityRole="button" accessibilityState={{selected: !!e.pinned}} accessibilityLabel={e.pinned ? t('noteboard.unpin') : t('noteboard.pin')}><Text style={{fontSize: fs(12), color: e.pinned ? T.accent : T.muted}}>📌</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => handleEntryTap(e)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t('common.edit')}, ${e.title || t('common.untitled')}`} style={{paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}><Text style={{fontSize: fs(11), fontWeight: '500', color: T.accent}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('common.edit')}</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => setExportMenuEntry(e)} style={{padding: 4}} accessibilityRole="button" accessibilityLabel={t('common.export')}><Text style={{fontSize: fs(14), color: T.dim}}>↑</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteTap(e)} style={{padding: 4}} accessibilityRole="button" accessibilityLabel={t('common.delete')}><Text style={{fontSize: fs(14), color: T.muted}}>✕</Text></TouchableOpacity>
                  </View>
                </View>
                <Text style={{fontSize: fs(11), color: T.muted, marginBottom: 8}}>{fmtTime(e.timestamp)}</Text>
                {authors.length > 0 && (
                  <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 8}}>
                    {authors.map(m => (
                      <View key={m.id} style={{flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3,
                        borderRadius: 999, borderWidth: 1, backgroundColor: `${m.color}20`, borderColor: `${m.color}45`}}>
                        <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: m.color}} />
                        <Text style={{fontSize: fs(11), fontWeight: '600', color: m.color}}>{m.name}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {isLocked ? (
                  <TouchableOpacity onPress={() => handleViewTap(e)} accessibilityRole="button" accessibilityLabel={t('journal.tapToUnlock')} style={{paddingVertical: 8, alignItems: 'center'}}>
                    <Text style={{fontSize: fs(12), color: T.muted, fontStyle: 'italic'}}>{t('journal.tapToUnlock')}</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    {e.body ? (
                      <TouchableOpacity onPress={() => handleViewTap(e)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${e.title || t('common.untitled')}`}>
                        <View style={{maxHeight: 80, overflow: 'hidden'}} pointerEvents="none"><RichText text={e.body} T={T} numberOfLines={4} members={members} onMentionPress={onMentionPress} /></View>
                      </TouchableOpacity>
                    ) : null}
                    {(e.hashtags || []).length > 0 && (
                      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8}}>
                        {(e.hashtags || []).map(tag => (
                          <TouchableOpacity key={tag} onPress={() => {setActiveTag(activeTag === tag ? null : tag); setTagSearch('');}} activeOpacity={0.7}
                            accessibilityRole="button" accessibilityState={{selected: activeTag === tag}} accessibilityLabel={tag}
                            style={[s.tagChip, {backgroundColor: activeTag === tag ? `${T.info}25` : `${T.info}12`, borderColor: activeTag === tag ? `${T.info}60` : `${T.info}30`}]}>
                            <Text style={{fontSize: fs(11), color: T.info}}>{tag}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </View>
            );
          })}
        </View>
      )}
      </>
      )}

      <JournalTemplateModal
        visible={editingTemplate !== null}
        theme={T}
        template={editingTemplate === 'new' ? null : editingTemplate}
        onSave={handleSaveTemplate}
        onDelete={handleDeleteTemplate}
        onClose={() => setEditingTemplate(null)} />

      <Modal visible={!!exportMenuEntry} transparent animationType="fade" onRequestClose={() => setExportMenuEntry(null)}>
        <View style={s.overlay}>
          <View style={[s.modalCard, {backgroundColor: T.card, borderColor: T.border}]}>
            <Text accessibilityRole="header" style={[s.modalTitle, {color: T.text}]}>{t('journal.exportEntry')}</Text>
            <Text style={{fontSize: fs(13), color: T.dim, marginBottom: 16}} numberOfLines={1}>{exportMenuEntry?.title || t('common.untitled')}</Text>
            <View style={{flexDirection: 'row', gap: 8, marginBottom: 8}}>
              {(['txt', 'md', 'json'] as const).map(fmt => (
                <TouchableOpacity key={fmt} onPress={() => exportMenuEntry && handleEntryExport(exportMenuEntry, fmt)} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityLabel={`.${fmt}`}
                  style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1,
                    backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
                  <Text style={{fontSize: fs(13), color: T.accent, fontWeight: '500'}}>↓ .{fmt}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setExportMenuEntry(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
              style={{alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
              <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!viewEntry} transparent animationType="fade" onRequestClose={() => setViewEntry(null)}>
        <View style={s.overlay}>
          <View style={[s.modalCard, {backgroundColor: T.card, borderColor: T.border, maxWidth: 480, maxHeight: '85%'}]}>
            <Text accessibilityRole="header" style={[s.modalTitle, {color: T.text}]} numberOfLines={2}>{viewEntry?.pinned ? '📌 ' : ''}{viewEntry?.title || t('common.untitled')}</Text>
            <Text style={{fontSize: fs(11), color: T.muted, marginBottom: 8}}>{viewEntry ? fmtTime(viewEntry.timestamp) : ''}</Text>
            {viewEntry && (viewEntry.authorIds || []).length > 0 && (
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 10}}>
                {(viewEntry.authorIds || []).map(id => getMember(id)).filter(Boolean).map(m => (
                  <View key={m!.id} style={{flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, backgroundColor: `${m!.color}20`, borderColor: `${m!.color}45`}}>
                    <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: m!.color}} />
                    <Text style={{fontSize: fs(11), fontWeight: '600', color: m!.color}}>{m!.name}</Text>
                  </View>
                ))}
              </View>
            )}
            <ScrollView style={{flexShrink: 1}} contentContainerStyle={{paddingBottom: 4}}>
              {viewEntry?.body ? <RichText text={viewEntry.body} T={T} members={members} onMentionPress={onMentionPress} /> : null}
              {viewEntry && (viewEntry.hashtags || []).length > 0 && (
                <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10}}>
                  {(viewEntry.hashtags || []).map(tag => (
                    <View key={tag} style={[s.tagChip, {backgroundColor: `${T.info}12`, borderColor: `${T.info}30`}]}>
                      <Text style={{fontSize: fs(11), color: T.info}}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
            <View style={{flexDirection: 'row', gap: 8, marginTop: 14}}>
              <TouchableOpacity onPress={() => setViewEntry(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')}
                style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
                <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.close')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { const e = viewEntry; setViewEntry(null); if (e) handleEntryTap(e); }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.edit')}
                style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`}}>
                <Text style={{fontSize: fs(13), fontWeight: '500', color: T.accent}}>{t('common.edit')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!entryPwModal} transparent animationType="fade" onRequestClose={() => setEntryPwModal(null)}>
        <View style={s.overlay}>
          <View style={[s.modalCard, {backgroundColor: T.card, borderColor: T.border}]}>
            <Text accessibilityRole="header" style={[s.modalTitle, {color: T.text}]}>{t('journal.entryLocked')}</Text>
            <Text style={{fontSize: fs(13), color: T.dim, marginBottom: 16}}>
              {entryPwModal?.mode === 'delete' ? t('journal.deletePasswordPrompt') : t('journal.unlockPasswordPrompt')}
            </Text>
            <TextInput value={entryPwInput} onChangeText={v => {setEntryPwInput(v); setEntryPwError(false);}}
              placeholder={t('journal.password')} placeholderTextColor={T.muted} secureTextEntry
              style={[s.input, {backgroundColor: T.surface, color: T.text, borderColor: entryPwError ? T.danger : T.border, marginBottom: 6}]}
              onSubmitEditing={handleEntryPwConfirm} />
            {entryPwError && <Text style={{fontSize: fs(12), color: T.danger, marginBottom: 10}}>{t('journal.incorrectPassword')}</Text>}
            <View style={{flexDirection: 'row', gap: 8, marginTop: 12}}>
              <TouchableOpacity onPress={() => setEntryPwModal(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
                style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
                <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleEntryPwConfirm} activeOpacity={0.7} accessibilityRole="button"
                style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`}}>
                <Text style={{fontSize: fs(13), fontWeight: '500', color: T.accent}}>
                  {entryPwModal?.mode === 'delete' ? t('common.delete') : t('journal.unlock')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const s = StyleSheet.create({
  content: {padding: 16, paddingBottom: 32},
  headerRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14},
  heading: {fontFamily: Fonts.display, fontSize: 22, fontWeight: '600', fontStyle: 'italic'},
  input: {borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15},
  card: {borderRadius: 12, borderWidth: 1, padding: 14},
  tagChip: {paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1},
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24},
  modalCard: {borderRadius: 16, borderWidth: 1, padding: 24, width: '100%', maxWidth: 360},
  modalTitle: {fontFamily: Fonts.display, fontSize: 20, fontWeight: '600', fontStyle: 'italic', marginBottom: 6},
});
