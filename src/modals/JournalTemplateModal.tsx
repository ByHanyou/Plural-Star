import React, {useState, useRef} from 'react';
import {View, TouchableOpacity, Alert} from 'react-native';
import {Text} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Sheet} from '../components/Sheet';
import {JournalTemplate, uid} from '../utils';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {RichText as RichDescription} from '../components/MarkdownRenderer';
import {RichTextEditor} from '../components/RichTextEditor';
import {Btn, Field, TagEditor, sectionLabel} from '../components/controls';
import {useDraft, clearDraft} from '../hooks/useDraft';
import {reportSaveError} from '../utils/saveError';

export const JournalTemplateModal = ({visible, template, onSave, onDelete, onClose}: {
  visible: boolean; template: JournalTemplate | null; onSave: (tpl: JournalTemplate) => void | Promise<void>; onDelete?: (id: string) => void; onClose: () => void;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  const isNew = !template;
  const blank = (): JournalTemplate => ({id: uid(), name: '', title: '', body: '', hashtags: [], createdAt: Date.now()});
  const [f, setF] = useState<JournalTemplate>(template || blank());
  const fRef = useRef(f);
  fRef.current = f;
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
  const draftId = isNew ? 'new' : (template?.id || f.id);
  useDraft<JournalTemplate>('journalTemplate', draftId, visible, f, d => setF(d));
  const set = <K extends keyof JournalTemplate>(k: K, v: JournalTemplate[K]) => {
    fRef.current = {...fRef.current, [k]: v};
    setF(x => ({...x, [k]: v}));
  };

  return (
    <Sheet
      visible={visible}
      title={isNew
        ? t('journal.newTemplate')
        : t('journal.editTemplate')}
      onClose={onClose}
      footer={
        <>
          {!isNew && (
            confirmDel
              ? <Btn instant variant="danger" onPress={() => {clearDraft('journalTemplate', draftId); onDelete?.(f.id); onClose();}}>{t('common.confirm')}</Btn>
              : <Btn instant variant="ghost" onPress={() => setConfirmDel(true)}>{t('common.delete')}</Btn>
          )}
          <Btn instant onPress={async () => {
            const cur = fRef.current;
            if (!(cur.name || '').trim()) { Alert.alert(t('modal.nameRequired')); return; }
            try {
              await onSave({...cur, name: cur.name.trim(), title: (cur.title || '').trim()});
              clearDraft('journalTemplate', draftId);
              onClose();
            } catch (e) {
              reportSaveError(e);
            }
          }}>{t('common.save')}</Btn>
        </>
      }>
      <Field
        label={t('journal.templateName')}
        value={f.name}
        onChange={(v: string) => set('name', v)}
        placeholder={t('journal.templateNamePlaceholder')} />
      <Field
        label={t('journal.templateTitle')}
        value={f.title}
        onChange={(v: string) => set('title', v)}
        placeholder={t('modal.entryTitlePlaceholder')} />
      <View style={{marginBottom: 14}}>
        <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 5})}>
          {t('journal.templateBody')}
        </Text>
        <TouchableOpacity onPress={() => setShowBodyEditor(true)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel={t('journal.templateBody')}
          style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12, minHeight: 100}}>
          {f.body
            ? <RichDescription text={f.body} />
            : <Text style={{fontSize: fs(13), color: T.muted}}>{t('modal.writeHere')}</Text>}
        </TouchableOpacity>
      </View>
      <RichTextEditor
        visible={showBodyEditor}
        title={t('journal.templateBody')}
        initialContent={f.body || ''}
        onSave={(html: string) => {set('body', html); setShowBodyEditor(false);}}
        onClose={() => setShowBodyEditor(false)} />
      <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{t('modal.tags')}</Text>
      <TagEditor tags={f.hashtags || []} onChange={tags => set('hashtags', tags)} input={tagInput} setInput={setTagInput} placeholder={t('modal.topic')} />
    </Sheet>
  );
};
