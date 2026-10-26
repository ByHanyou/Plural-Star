import React, {useState, useRef, useMemo} from 'react';
import {View, TouchableOpacity, ScrollView, Modal, Keyboard} from 'react-native';
import {Text} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Sheet} from '../components/Sheet';
import {Fonts, fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {Member, JournalEntry, JournalTemplate, uid, fmtTime, mergeTags, toggleId} from '../utils';
import {RichText as RichDescription} from '../components/MarkdownRenderer';
import {RichTextEditor} from '../components/RichTextEditor';
import {Btn, Field, PasswordSection, TagEditor, sectionLabel} from '../components/controls';
import {useDraft, clearDraft} from '../hooks/useDraft';
import {MemberPicker} from '../components/MemberPicker';
import {PICKER_RESULTS_MAX, memberFacetPools} from '../picker/memberPicker';
import {reportSaveError} from '../utils/saveError';

const blankEntry = (): JournalEntry => ({id: uid(), title: '', body: '', authorIds: [], hashtags: [], timestamp: Date.now()});

export const JournalModal = ({visible, entry, members, templates, onSave, onClose, onMentionPress, lockView = false}: {
  visible: boolean; entry: JournalEntry | null; members: Member[]; templates: JournalTemplate[]; onSave: (e: JournalEntry) => void | Promise<void>; onClose: () => void; onMentionPress?: (memberId: string) => void; lockView?: boolean;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  const isNew = !entry;
  const [f, setF] = useState<JournalEntry>(() => entry || blankEntry());
  const fRef = useRef(f);
  fRef.current = f;
  const [showPwField, setShowPwField] = useState(false); const [tagInput, setTagInput] = useState('');
  const [showBodyEditor, setShowBodyEditor] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [viewMode, setViewMode] = useState(!isNew);
  React.useEffect(() => { if (visible) { const fresh = entry || blankEntry(); setF(fresh); setShowPwField(!!fresh.password); setTagInput(''); setShowBodyEditor(false); setShowTemplatePicker(false); setViewMode(!!entry); } }, [visible, entry]);
  const draftId = isNew ? 'new' : (entry?.id || f.id);
  useDraft<JournalEntry>('journal', lockView || viewMode ? '' : draftId, visible, f, d => setF(d));
  const set = <K extends keyof JournalEntry>(k: K, v: JournalEntry[K]) => {
    fRef.current = {...fRef.current, [k]: v};
    setF(x => ({...x, [k]: v}));
  };
  const togAuthor = (id: string) => set('authorIds', toggleId(f.authorIds || [], id));
  const authorPools = useMemo(() => memberFacetPools(members, t), [members, t]);
  const applyTemplate = (tpl: JournalTemplate) => {
    setF(x => ({...x, title: tpl.title || x.title, body: tpl.body || x.body, hashtags: mergeTags(x.hashtags, tpl.hashtags || [])}));
    setShowTemplatePicker(false);
  };
  const canUseTemplates = isNew && templates.length > 0;

  return (
    <Sheet visible={visible} title={viewMode ? t('modal.viewEntry') : isNew ? t('modal.newEntry') : t('modal.editEntry')} onClose={onClose}
      footer={viewMode
        ? (lockView
          ? <Btn instant variant="ghost" onPress={onClose}>{t('common.close')}</Btn>
          : <Btn instant onPress={() => setViewMode(false)}>{t('common.edit')}</Btn>)
        : <Btn instant onPress={async () => {Keyboard.dismiss(); const cur = fRef.current; try {await onSave({...cur, timestamp: isNew ? Date.now() : cur.timestamp, password: showPwField && cur.password ? cur.password : undefined}); clearDraft('journal', draftId); onClose();} catch (e) {reportSaveError(e);}}}>{t('common.save')}</Btn>}>
      {viewMode ? (
        <>
          <Text accessibilityRole="header" style={{fontFamily: Fonts.display, fontSize: fs(20), fontWeight: '600', fontStyle: 'italic', color: T.text, marginBottom: 4}}>{f.title || t('common.untitled')}</Text>
          <Text style={{fontSize: fs(11), color: T.muted, marginBottom: 14}}>{fmtTime(f.timestamp)}</Text>
          {f.body ? (
            <View style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12, marginBottom: 14}}>
              <RichDescription text={f.body} members={members} onMentionPress={onMentionPress} />
            </View>
          ) : null}
          {(f.hashtags || []).length > 0 && (
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14}}>
              {(f.hashtags || []).map((tag: string) => (
                <View key={tag} style={{paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: `${T.info}18`, borderWidth: 1, borderColor: `${T.info}40`}}>
                  <Text style={{fontSize: fs(12), color: T.info}}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
          {(f.authorIds || []).length > 0 && (
            <>
              <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{t('modal.authors')}</Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14}}>
                {(f.authorIds || []).map((id: string) => { const m = members.find((x: Member) => x.id === id); if (!m) return null; return (
                  <View key={id} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: `${m.color}20`, borderWidth: 1, borderColor: `${m.color}50`}}>
                    <View style={{width: 7, height: 7, borderRadius: 3.5, backgroundColor: m.color}} />
                    <Text style={{fontSize: fs(12), color: m.color}}>{m.name}</Text>
                  </View>
                ); })}
              </View>
            </>
          )}
        </>
      ) : (
      <>
      {canUseTemplates && (
        <View style={{marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8}}>
          <Text style={{flex: 1, fontSize: fs(11), color: T.muted}}>
            {t('journal.templateHint')}
          </Text>
          <TouchableOpacity onPress={() => setShowTemplatePicker(true)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel={t('journal.fromTemplate')}
            hitSlop={{top: 9, bottom: 9}}
            style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
            <Text style={{fontSize: fs(12), fontWeight: '500', color: T.accent}}>
              {t('journal.fromTemplate')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <Field label={t('modal.entryTitle')} value={f.title} onChange={(v: string) => set('title', v)} placeholder={t('modal.entryTitlePlaceholder')} />

      <View style={{marginBottom: 14}}>
        <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 5})}>{t('modal.body')}</Text>
        <TouchableOpacity onPress={() => setShowBodyEditor(true)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel={t('modal.body')}
          style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12, minHeight: 100}}>
          {f.body ? <RichDescription text={f.body} members={members} onMentionPress={onMentionPress} /> : <Text style={{fontSize: fs(13), color: T.muted}}>{t('modal.writeHere')}</Text>}
        </TouchableOpacity>
      </View>
      <RichTextEditor visible={showBodyEditor} title={t('modal.body')} initialContent={f.body || ''}
        members={members}
        onSave={(html: string) => {set('body', html); setShowBodyEditor(false);}} onClose={() => setShowBodyEditor(false)} />

      <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{t('modal.tags')}</Text>
      <TagEditor tags={f.hashtags || []} onChange={tags => set('hashtags', tags)} input={tagInput} setInput={setTagInput} placeholder={t('modal.topic')} style={{marginBottom: 14}} />
      {members.length > 0 && (<>
        <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{t('modal.authors')}</Text>
        <View style={{marginBottom: 8}}>
          <MemberPicker pools={authorPools} selected={f.authorIds} onPick={m => togAuthor(m.id)} multi requireSearch selectedChips
            maxResults={PICKER_RESULTS_MAX} searchLabel={t('modal.searchAuthors')} />
        </View>
      </>)}
      <PasswordSection label={t('modal.entryPassword')} on={showPwField} setOn={on => { setShowPwField(on); if (!on) set('password', undefined); }}
        value={f.password || ''} onChange={v => set('password', v || undefined)} placeholder={t('modal.entryPasswordPlaceholder')}
        addLabel={t('modal.addEntryPassword')} removeLabel={t('modal.removeEntryPassword')} style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14}} />
      {showTemplatePicker && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowTemplatePicker(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => setShowTemplatePicker(false)} accessible={false} importantForAccessibility="no"
            style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 24}}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}} accessible={false}
              accessibilityViewIsModal onAccessibilityEscape={() => setShowTemplatePicker(false)}
              style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, maxHeight: '70%', overflow: 'hidden'}}>
              <View style={{padding: 14, borderBottomWidth: 1, borderBottomColor: T.border}}>
                <Text accessibilityRole="header" style={sectionLabel(T, {fontSize: fs(11)})}>
                  {t('journal.pickTemplate')}
                </Text>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight: 360}}>
                {templates.map((tpl: JournalTemplate) => (
                  <TouchableOpacity key={tpl.id} onPress={() => applyTemplate(tpl)} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityLabel={tpl.name}
                    style={{paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border}}>
                    <Text style={{fontSize: fs(14), fontWeight: '600', color: T.text}}>{tpl.name}</Text>
                    {tpl.title ? <Text style={{fontSize: fs(12), color: T.dim, marginTop: 2}} numberOfLines={1}>{tpl.title}</Text> : null}
                    {(tpl.hashtags || []).length > 0 && (
                      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4}}>
                        {(tpl.hashtags || []).slice(0, 6).map((tag: string) => (
                          <Text key={tag} style={{fontSize: fs(10), color: T.info, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: `${T.info}15`}}>{tag}</Text>
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
      </>
      )}
    </Sheet>
  );
};
