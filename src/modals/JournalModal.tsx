import React, {useState} from 'react';
import {View, TouchableOpacity, ScrollView, Modal} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Sheet} from '../components/Sheet';
import {Fonts, fontScale} from '../theme';
import {Member, JournalEntry, JournalTemplate, uid, fmtTime, sortMembersBySearch} from '../utils';
import {RichText as RichDescription} from '../components/MarkdownRenderer';
import {RichTextEditor} from '../components/RichTextEditor';
import {Btn, Field} from './shared';

export const JournalModal = ({visible, theme: T, entry, members, templates, onSave, onClose, onMentionPress}: any) => {
  const fs = fontScale(T);
  const {t} = useTranslation();
  const isNew = !entry;
  const [f, setF] = useState<JournalEntry>(entry || {id: uid(), title: '', body: '', authorIds: [], hashtags: [], timestamp: Date.now()});
  const [showPwField, setShowPwField] = useState(false); const [tagInput, setTagInput] = useState('');
  const [authorSearch, setAuthorSearch] = useState('');
  const [showBodyEditor, setShowBodyEditor] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [viewMode, setViewMode] = useState(!isNew);
  React.useEffect(() => { if (visible) { const fresh = entry || {id: uid(), title: '', body: '', authorIds: [], hashtags: [], timestamp: Date.now()}; setF(fresh); setShowPwField(!!fresh.password); setTagInput(''); setAuthorSearch(''); setShowBodyEditor(false); setShowTemplatePicker(false); setViewMode(!!entry); } }, [visible, entry]);
  const set = (k: keyof JournalEntry, v: any) => setF(x => ({...x, [k]: v}));
  const togAuthor = (id: string) => set('authorIds', (f.authorIds || []).includes(id) ? (f.authorIds || []).filter((i: string) => i !== id) : [...(f.authorIds || []), id]);
  const addTag = () => { const raw = tagInput.trim().replace(/^#/, '').toLowerCase(); if (!raw) return; const cur = f.hashtags || []; if (!cur.includes(`#${raw}`)) set('hashtags', [...cur, `#${raw}`]); setTagInput(''); };
  const applyTemplate = (tpl: JournalTemplate) => {
    setF(x => ({...x, title: tpl.title || x.title, body: tpl.body || x.body, hashtags: [...(tpl.hashtags || [])]}));
    setShowTemplatePicker(false);
  };
  const templateList: JournalTemplate[] = Array.isArray(templates) ? templates : [];
  const canUseTemplates = isNew && templateList.length > 0;

  return (
    <Sheet visible={visible} title={viewMode ? t('modal.viewEntry') : isNew ? t('modal.newEntry') : t('modal.editEntry')} theme={T} onClose={onClose}
      footer={viewMode
        ? <Btn instant T={T} onPress={() => setViewMode(false)}>{t('common.edit')}</Btn>
        : <Btn instant T={T} onPress={() => {onSave({...f, timestamp: isNew ? Date.now() : f.timestamp, password: showPwField && f.password ? f.password : undefined}); onClose();}}>{t('common.save')}</Btn>}>
      {viewMode ? (
        <>
          <Text style={{fontFamily: Fonts.display, fontSize: fs(20), fontWeight: '600', fontStyle: 'italic', color: T.text, marginBottom: 4}}>{f.title || t('common.untitled')}</Text>
          <Text style={{fontSize: fs(11), color: T.muted, marginBottom: 14}}>{fmtTime(f.timestamp)}</Text>
          {f.body ? (
            <View style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12, marginBottom: 14}}>
              <RichDescription text={f.body} T={T} members={members} onMentionPress={onMentionPress} />
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
              <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.authors')}</Text>
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
            style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
            <Text style={{fontSize: fs(12), fontWeight: '500', color: T.accent}}>
              {t('journal.fromTemplate')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <Field label={t('modal.entryTitle')} value={f.title} onChange={(v: string) => set('title', v)} placeholder={t('modal.entryTitlePlaceholder')} T={T} />

      <View style={{marginBottom: 14}}>
        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 5, fontWeight: '600'}}>{t('modal.body')}</Text>
        <TouchableOpacity onPress={() => setShowBodyEditor(true)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel={t('modal.body')}
          style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12, minHeight: 100}}>
          {f.body ? <RichDescription text={f.body} T={T} members={members} onMentionPress={onMentionPress} /> : <Text style={{fontSize: fs(13), color: T.muted}}>{t('modal.writeHere')}</Text>}
        </TouchableOpacity>
      </View>
      <RichTextEditor visible={showBodyEditor} title={t('modal.body')} initialContent={f.body || ''} theme={T}
        members={members}
        onSave={(html: string) => {set('body', html); setShowBodyEditor(false);}} onClose={() => setShowBodyEditor(false)} />

      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.tags')}</Text>
      {(f.hashtags || []).length > 0 && (<View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8}}>{(f.hashtags || []).map((tag: string) => (<TouchableOpacity key={tag} onPress={() => set('hashtags', (f.hashtags || []).filter((x: string) => x !== tag))} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t('common.remove')} ${tag}`} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: `${T.info}18`, borderWidth: 1, borderColor: `${T.info}40`}}><Text style={{fontSize: fs(12), color: T.info}}>{tag}</Text><Text style={{fontSize: fs(10), color: T.danger}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✕</Text></TouchableOpacity>))}</View>)}
      <View style={{flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 14}}>
        <TextInput value={tagInput} onChangeText={setTagInput} placeholder={t('modal.topic')} placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false} style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13)}} onSubmitEditing={addTag} returnKeyType="done" />
        <Btn T={T} onPress={addTag} style={{paddingHorizontal: 12, paddingVertical: 9}}>{t('common.add')}</Btn>
      </View>
      {members.length > 0 && (<>
        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.authors')}</Text>
        {(f.authorIds || []).length > 0 && (
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8}}>
            {(f.authorIds || []).map((id: string) => { const m = members.find((x: Member) => x.id === id); if (!m) return null; return (
              <TouchableOpacity key={id} onPress={() => togAuthor(id)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={`${m.name}, ${t('common.remove')}`}
                style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: `${m.color}20`, borderWidth: 1, borderColor: `${m.color}50`}}>
                <View style={{width: 7, height: 7, borderRadius: 3.5, backgroundColor: m.color}} />
                <Text style={{fontSize: fs(12), color: m.color}}>{m.name}</Text>
                <Text style={{fontSize: fs(10), color: T.danger}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✕</Text>
              </TouchableOpacity>
            ); })}
          </View>
        )}
        <TextInput value={authorSearch} onChangeText={setAuthorSearch} placeholder={t('modal.searchAuthors')} placeholderTextColor={T.muted}
          autoCorrect={false} autoComplete="off" spellCheck={false} textContentType="none"
          style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), marginBottom: 4}} />
        {authorSearch.length > 0 && (
          <View style={{backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.border, maxHeight: 160, overflow: 'hidden', marginBottom: 8}}>
            <ScrollView nestedScrollEnabled>
              {sortMembersBySearch<Member>(members.filter((m: Member) => !m.archived && !m.isCustomFront && m.name.toLowerCase().includes(authorSearch.toLowerCase())), authorSearch).map((m: Member) => {
                const active = (f.authorIds || []).includes(m.id);
                return (
                  <TouchableOpacity key={m.id} onPress={() => {togAuthor(m.id); setAuthorSearch('');}} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityState={{selected: active}} accessibilityLabel={m.name}
                    style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: 1, borderBottomColor: T.border}}>
                    <View style={{width: 7, height: 7, borderRadius: 3.5, backgroundColor: m.color}} />
                    <Text style={{fontSize: fs(13), color: active ? m.color : T.text, fontWeight: active ? '600' : '400'}}>{m.name}</Text>
                    {active && <Text style={{color: m.color, marginLeft: 'auto'}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </>)}
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14}}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}><Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600'}}>{t('modal.entryPassword')}</Text><TouchableOpacity onPress={() => {setShowPwField(!showPwField); if (showPwField) set('password', undefined);}} accessibilityRole="button" accessibilityLabel={`${showPwField ? t('common.remove') : t('common.add')} ${t('modal.entryPassword')}`}><Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>{showPwField ? t('common.remove') : t('common.add')}</Text></TouchableOpacity></View>
        {showPwField && <TextInput value={f.password || ''} onChangeText={(v: string) => set('password', v || undefined)} placeholder={t('modal.entryPasswordPlaceholder')} placeholderTextColor={T.muted} secureTextEntry style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(14)}} />}
      </View>
      {showTemplatePicker && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowTemplatePicker(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => setShowTemplatePicker(false)} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
            style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 24}}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}} accessible={false}
              style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, maxHeight: '70%', overflow: 'hidden'}}>
              <View style={{padding: 14, borderBottomWidth: 1, borderBottomColor: T.border}}>
                <Text style={{fontSize: fs(11), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600'}}>
                  {t('journal.pickTemplate')}
                </Text>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight: 360}}>
                {templateList.map((tpl: JournalTemplate) => (
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
