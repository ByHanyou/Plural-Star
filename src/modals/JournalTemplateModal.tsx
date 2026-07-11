import React, {useState} from 'react';
import {View, TouchableOpacity} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Sheet} from '../components/Sheet';
import {JournalTemplate, uid} from '../utils';
import {fontScale} from '../theme';
import {RichText as RichDescription} from '../components/MarkdownRenderer';
import {RichTextEditor} from '../components/RichTextEditor';
import {Btn, Field} from './shared';

export const JournalTemplateModal = ({visible, theme: T, template, onSave, onDelete, onClose}: any) => {
  const fs = fontScale(T);
  const {t} = useTranslation();
  const isNew = !template;
  const blank = (): JournalTemplate => ({id: uid(), name: '', title: '', body: '', hashtags: [], createdAt: Date.now()});
  const [f, setF] = useState<JournalTemplate>(template || blank());
  const [tagInput, setTagInput] = useState('');
  const [showBodyEditor, setShowBodyEditor] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  React.useEffect(() => {
    if (visible) {
      setF(template || blank());
      setTagInput('');
      setShowBodyEditor(false);
      setConfirmDel(false);
    }
  }, [visible, template]);
  const set = (k: keyof JournalTemplate, v: any) => setF(x => ({...x, [k]: v}));
  const addTag = () => {
    const raw = tagInput.trim().replace(/^#/, '').toLowerCase();
    if (!raw) return;
    const cur = f.hashtags || [];
    if (!cur.includes(`#${raw}`)) set('hashtags', [...cur, `#${raw}`]);
    setTagInput('');
  };

  return (
    <Sheet
      visible={visible}
      title={isNew
        ? t('journal.newTemplate')
        : t('journal.editTemplate')}
      theme={T}
      onClose={onClose}
      footer={
        <>
          {!isNew && (
            confirmDel
              ? <Btn instant variant="danger" T={T} onPress={() => {onDelete?.(f.id); onClose();}}>{t('common.confirm')}</Btn>
              : <Btn instant variant="ghost" T={T} onPress={() => setConfirmDel(true)}>{t('common.delete')}</Btn>
          )}
          <Btn instant T={T} onPress={() => {
            if (!f.name.trim()) return;
            onSave({...f, name: f.name.trim(), title: f.title.trim()});
            onClose();
          }}>{t('common.save')}</Btn>
        </>
      }>
      <Field
        label={t('journal.templateName')}
        value={f.name}
        onChange={(v: string) => set('name', v)}
        placeholder={t('journal.templateNamePlaceholder')}
        T={T} />
      <Field
        label={t('journal.templateTitle')}
        value={f.title}
        onChange={(v: string) => set('title', v)}
        placeholder={t('modal.entryTitlePlaceholder')}
        T={T} />
      <View style={{marginBottom: 14}}>
        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 5, fontWeight: '600'}}>
          {t('journal.templateBody')}
        </Text>
        <TouchableOpacity onPress={() => setShowBodyEditor(true)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel={t('journal.templateBody')}
          style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12, minHeight: 100}}>
          {f.body
            ? <RichDescription text={f.body} T={T} />
            : <Text style={{fontSize: fs(13), color: T.muted}}>{t('modal.writeHere')}</Text>}
        </TouchableOpacity>
      </View>
      <RichTextEditor
        visible={showBodyEditor}
        title={t('journal.templateBody')}
        initialContent={f.body || ''}
        theme={T}
        onSave={(html: string) => {set('body', html); setShowBodyEditor(false);}}
        onClose={() => setShowBodyEditor(false)} />
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.tags')}</Text>
      {(f.hashtags || []).length > 0 && (
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8}}>
          {(f.hashtags || []).map((tag: string) => (
            <TouchableOpacity key={tag}
              onPress={() => set('hashtags', (f.hashtags || []).filter((x: string) => x !== tag))}
              activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel={`${t('common.remove')} ${tag}`}
              style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: `${T.info}18`, borderWidth: 1, borderColor: `${T.info}40`}}>
              <Text style={{fontSize: fs(12), color: T.info}}>{tag}</Text>
              <Text style={{fontSize: fs(10), color: T.danger}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✕</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>
        <TextInput value={tagInput} onChangeText={setTagInput} placeholder={t('modal.topic')} placeholderTextColor={T.muted}
          autoCapitalize="none" autoCorrect={false}
          style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13)}}
          onSubmitEditing={addTag} returnKeyType="done" />
        <Btn T={T} onPress={addTag} style={{paddingHorizontal: 12, paddingVertical: 9}}>{t('common.add')}</Btn>
      </View>
    </Sheet>
  );
};
