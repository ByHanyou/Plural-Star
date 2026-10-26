import React from 'react';
import {View, ScrollView, TouchableOpacity, Modal, StyleSheet} from 'react-native';
import {useMappingHelper} from '@shopify/flash-list';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {RichText} from '../../components/MarkdownRenderer';
import {Fonts, fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {JournalEntry, JournalTemplate, Member, fmtTime, membersByIds, tagKey} from '../../utils';
import type {JournalExportFormat} from '../../export/journalExport';
import {stripMarkup} from '../../markdown/parse';

export type EntryAction = 'edit' | 'delete' | 'view' | 'export';

const EXPORT_FORMATS: JournalExportFormat[] = ['txt', 'md', 'json'];
const ROW_HIT = {top: 9, bottom: 9, left: 4, right: 4};

const AuthorChip = ({m}: {m: Member}) => {
  const fs = fontScale(useTheme());
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, backgroundColor: `${m.color}20`, borderColor: `${m.color}45`}}>
      <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: m.color}} />
      <Text style={{fontSize: fs(11), fontWeight: '600', color: m.color}}>{m.name}</Text>
    </View>
  );
};

interface JournalEntryRowProps {
  entry: JournalEntry;
  isLocked: boolean;
  activeTagKey: string | null;
  memberById: Map<string, Member>;
  onMentionPress?: (memberId: string) => void;
  onTogglePin: (entry: JournalEntry) => void;
  onAction: (entry: JournalEntry, action: EntryAction) => void;
  onTagPress: (tag: string, selected: boolean) => void;
}

export const JournalEntryRow = React.memo(function JournalEntryRow({
  entry: e, isLocked, activeTagKey, memberById, onMentionPress, onTogglePin, onAction, onTagPress,
}: JournalEntryRowProps) {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  const {getMappingKey} = useMappingHelper();
  const authors = membersByIds(e.authorIds, memberById);
  const tags = e.hashtags || [];
  const title = e.title || t('common.untitled');
  return (
    <View style={[s.card, {backgroundColor: e.pinned ? `${T.accent}10` : T.card, borderColor: e.pinned ? `${T.accent}50` : T.border}]}>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4}}>
        <Text style={{fontSize: fs(15), fontWeight: '500', color: T.text, flex: 1, marginRight: 8}} numberOfLines={2}>{e.pinned ? '📌 ' : ''}{title}</Text>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
          {isLocked && <Text style={{fontSize: fs(13)}} accessibilityLabel={t('journal.locked')}>🔒</Text>}
          <TouchableOpacity onPress={() => onTogglePin(e)} hitSlop={ROW_HIT} style={{padding: 4}} accessibilityRole="button" accessibilityState={{selected: !!e.pinned}} accessibilityLabel={e.pinned ? t('noteboard.unpin') : t('noteboard.pin')}><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(12), color: e.pinned ? T.accent : T.muted}}>📌</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => onAction(e, 'edit')} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.editItem', {name: title})} hitSlop={ROW_HIT} style={{paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}><Text style={{fontSize: fs(11), fontWeight: '500', color: T.accent}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('common.edit')}</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => onAction(e, 'export')} hitSlop={ROW_HIT} style={{padding: 4}} accessibilityRole="button" accessibilityLabel={t('common.exportItem', {name: title})}><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(14), color: T.dim}}>↑</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => onAction(e, 'delete')} hitSlop={ROW_HIT} style={{padding: 4}} accessibilityRole="button" accessibilityLabel={t('common.deleteItem', {name: title})}><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(14), color: T.muted}}>✕</Text></TouchableOpacity>
        </View>
      </View>
      <Text style={{fontSize: fs(11), color: T.muted, marginBottom: 8}}>{fmtTime(e.timestamp)}</Text>
      {authors.length > 0 && (
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 8}}>
          {authors.map((m, ai) => <AuthorChip key={getMappingKey(m.id, ai)} m={m} />)}
        </View>
      )}
      {isLocked ? (
        <TouchableOpacity onPress={() => onAction(e, 'view')} accessibilityRole="button" accessibilityLabel={t('journal.tapToUnlock')} hitSlop={{top: 7, bottom: 7}} style={{paddingVertical: 8, alignItems: 'center'}}>
          <Text style={{fontSize: fs(12), color: T.muted, fontStyle: 'italic'}}>{t('journal.tapToUnlock')}</Text>
        </TouchableOpacity>
      ) : (
        <>
          {e.body ? (
            <TouchableOpacity onPress={() => onAction(e, 'view')} activeOpacity={0.7} accessibilityRole="button" accessibilityHint={t('journal.openEntryHint')}>
              <View style={{maxHeight: 80, overflow: 'hidden'}} pointerEvents="none"><RichText text={e.body} numberOfLines={4} memberById={memberById} onMentionPress={onMentionPress} /></View>
            </TouchableOpacity>
          ) : null}
          {tags.length > 0 && (
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8}}>
              {tags.map((tag, ti) => {
                const sel = activeTagKey === tagKey(tag);
                return (
                  <TouchableOpacity key={getMappingKey(`${ti}-${tag}`, ti)} onPress={() => onTagPress(tag, sel)} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityState={{selected: sel}} accessibilityLabel={tag}
                    hitSlop={{top: 5, bottom: 10}} style={[s.tagChip, {backgroundColor: sel ? `${T.info}25` : `${T.info}12`, borderColor: sel ? `${T.info}60` : `${T.info}30`}]}>
                    <Text style={{fontSize: fs(11), color: T.info}}>{tag}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
});

export const TemplateCards = ({templates, onEdit}: {
  templates: JournalTemplate[]; onEdit: (tpl: JournalTemplate | 'new') => void;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  if (templates.length === 0) {
    return (
      <View style={{alignItems: 'center', paddingVertical: 48}}>
        <Text style={{fontSize: fs(36), opacity: 0.4, marginBottom: 12}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">◫</Text>
        <Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center', marginBottom: 16}}>{t('journal.noTemplates')}</Text>
        <TouchableOpacity onPress={() => onEdit('new')} activeOpacity={0.7} accessibilityRole="button"
          hitSlop={{top: 6, bottom: 6}} style={{paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
          <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>{t('journal.newTemplate')}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <View style={{gap: 9}}>
      {templates.map(tpl => (
        <TouchableOpacity key={tpl.id} onPress={() => onEdit(tpl)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel={`${tpl.name}, ${t('common.edit')}`}
          style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 14}}>
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4}}>
            <Text style={{fontSize: fs(14), fontWeight: '600', color: T.text, flex: 1}} numberOfLines={1}>{tpl.name}</Text>
            <Text style={{fontSize: fs(11), color: T.muted}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✎</Text>
          </View>
          {tpl.title ? <Text style={{fontSize: fs(12), color: T.dim, marginBottom: 4}} numberOfLines={1}>{tpl.title}</Text> : null}
          {tpl.body ? <Text style={{fontSize: fs(11), color: T.muted, marginBottom: 4}} numberOfLines={2}>{stripMarkup(tpl.body)}</Text> : null}
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
  );
};

export const ExportMenu = ({entry, onPick, onClose}: {
  entry: JournalEntry | null; onPick: (entry: JournalEntry, fmt: JournalExportFormat) => void; onClose: () => void;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  return (
    <Modal visible={!!entry} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={[s.modalCard, {backgroundColor: T.card, borderColor: T.border}]}>
          <Text accessibilityRole="header" style={[s.modalTitle, {color: T.text, fontSize: fs(20)}]}>{t('journal.exportEntry')}</Text>
          <Text style={{fontSize: fs(13), color: T.dim, marginBottom: 16}} numberOfLines={1}>{entry?.title || t('common.untitled')}</Text>
          <View style={{flexDirection: 'row', gap: 8, marginBottom: 8}}>
            {EXPORT_FORMATS.map(fmt => (
              <TouchableOpacity key={fmt} onPress={() => entry && onPick(entry, fmt)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={`.${fmt}`}
                hitSlop={{top: 6, bottom: 6}} style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
                <Text style={{fontSize: fs(13), color: T.accent, fontWeight: '500'}}>↓ .{fmt}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
            hitSlop={{top: 6, bottom: 6}} style={{alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
            <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export const EntryViewer = ({entry, memberById, onMentionPress, onClose, onEdit}: {
  entry: JournalEntry | null; memberById: Map<string, Member>; onMentionPress?: (memberId: string) => void;
  onClose: () => void; onEdit: (entry: JournalEntry) => void;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  const authors = entry ? membersByIds(entry.authorIds, memberById) : [];
  const tags = entry?.hashtags || [];
  return (
    <Modal visible={!!entry} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={[s.modalCard, {backgroundColor: T.card, borderColor: T.border, maxWidth: 480, maxHeight: '85%'}]}>
          <Text accessibilityRole="header" style={[s.modalTitle, {color: T.text, fontSize: fs(20)}]} numberOfLines={2}>{entry?.pinned ? '📌 ' : ''}{entry?.title || t('common.untitled')}</Text>
          <Text style={{fontSize: fs(11), color: T.muted, marginBottom: 8}}>{entry ? fmtTime(entry.timestamp) : ''}</Text>
          {authors.length > 0 && (
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 10}}>
              {authors.map(m => <AuthorChip key={m.id} m={m} />)}
            </View>
          )}
          <ScrollView style={{flexShrink: 1}} contentContainerStyle={{paddingBottom: 4}}>
            {entry?.body ? <RichText text={entry.body} memberById={memberById} onMentionPress={onMentionPress} /> : null}
            {tags.length > 0 && (
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10}}>
                {tags.map(tag => (
                  <View key={tag} style={[s.tagChip, {backgroundColor: `${T.info}12`, borderColor: `${T.info}30`}]}>
                    <Text style={{fontSize: fs(11), color: T.info}}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
          <View style={{flexDirection: 'row', gap: 8, marginTop: 14}}>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')}
              hitSlop={{top: 6, bottom: 6}} style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
              <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.close')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => entry && onEdit(entry)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.edit')}
              hitSlop={{top: 6, bottom: 6}} style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`}}>
              <Text style={{fontSize: fs(13), fontWeight: '500', color: T.accent}}>{t('common.edit')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  card: {borderRadius: 12, borderWidth: 1, padding: 14},
  tagChip: {paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1},
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24},
  modalCard: {borderRadius: 16, borderWidth: 1, padding: 24, width: '100%', maxWidth: 360},
  modalTitle: {fontFamily: Fonts.display, fontSize: 20, fontWeight: '600', fontStyle: 'italic', marginBottom: 6},
});
