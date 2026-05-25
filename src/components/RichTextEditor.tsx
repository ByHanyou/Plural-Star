import React, {useState, useMemo} from 'react';
import {View, TouchableOpacity, StyleSheet, Platform, KeyboardAvoidingView, Modal, ScrollView} from 'react-native';
import {Text, TextInput} from './AppText';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Fonts} from '../theme';
import type {ThemeColors} from '../theme';
import type {Member} from '../utils';
import i18n from '../i18n/i18n';

interface Props {
  visible: boolean;
  title: string;
  initialContent: string;
  theme: ThemeColors;
  onSave: (content: string) => void;
  onClose: () => void;
  members?: Member[];
}

const MD_TOOLS: {label: string; before: string; after: string; bold?: boolean; italic?: boolean; strike?: boolean}[] = [
  {label: 'B', before: '**', after: '**', bold: true},
  {label: 'I', before: '*', after: '*', italic: true},
  {label: 'S', before: '~~', after: '~~', strike: true},
  {label: 'H1', before: '# ', after: ''},
  {label: 'H2', before: '## ', after: ''},
  {label: 'H3', before: '### ', after: ''},
  {label: '🔗', before: '[', after: '](url)'},
  {label: '🖼', before: '<img src="', after: '" width="100" height="100">'},
  {label: '•', before: '- ', after: ''},
  {label: '1.', before: '1. ', after: ''},
  {label: '❝', before: '> ', after: ''},
  {label: '</>', before: '`', after: '`'},
  {label: '—', before: '\n---\n', after: ''},
];

const MdToolbar = ({onInsert, T}: {onInsert: (before: string, after: string) => void; T: ThemeColors}) => {
  const fs = (s: number) => Math.round(s * (T?.textScale || 1));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      style={{maxHeight: 40, flexGrow: 0, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: T.surface}}
      contentContainerStyle={{paddingHorizontal: 12, paddingVertical: 6, gap: 6, flexDirection: 'row', alignItems: 'center'}}>
      {MD_TOOLS.map(tool => (
        <TouchableOpacity key={tool.label} onPress={() => onInsert(tool.before, tool.after)} activeOpacity={0.7}
          style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: T.border, backgroundColor: T.bg}}>
          <Text style={{fontSize: fs(12), fontWeight: tool.bold ? '700' : '500', fontStyle: tool.italic ? 'italic' : 'normal', textDecorationLine: tool.strike ? 'line-through' : 'none', color: T.dim}}>{tool.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};

const MentionPicker = ({members, theme: T, onPick, onCancel}: {members: Member[]; theme: ThemeColors; onPick: (m: Member) => void; onCancel: () => void}) => {
  const fs = (s: number) => Math.round(s * (T?.textScale || 1));
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const active = members.filter(m => !m.archived);
    if (!q) return active;
    return active.filter(m => m.name.toLowerCase().includes(q));
  }, [members, search]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableOpacity activeOpacity={1} onPress={onCancel}
        style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 24}}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}
          style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, maxHeight: '70%', overflow: 'hidden'}}>
          <View style={{padding: 12, borderBottomWidth: 1, borderBottomColor: T.border}}>
            <Text style={{fontSize: fs(11), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>
              {i18n.t('mention.pickMember', {defaultValue: 'Mention a member'})}
            </Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={i18n.t('common.search', {defaultValue: 'Search…'})}
              placeholderTextColor={T.muted}
              autoFocus
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              textContentType="none"
              style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13)}}
            />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight: 320}}>
            {filtered.length === 0 ? (
              <Text style={{fontSize: fs(13), color: T.muted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 20}}>
                {i18n.t('mention.noMembers', {defaultValue: 'No members match'})}
              </Text>
            ) : (
              filtered.map(m => (
                <TouchableOpacity key={m.id} onPress={() => onPick(m)} activeOpacity={0.7}
                  style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border}}>
                  <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: m.color}} />
                  <Text style={{flex: 1, fontSize: fs(14), color: T.text}}>{m.name}</Text>
                  {m.pronouns ? <Text style={{fontSize: fs(11), color: T.muted}}>{m.pronouns}</Text> : null}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const MarkdownEditor = ({initialContent, theme: T, onSave, onClose, title, members}: {initialContent: string; theme: ThemeColors; onSave: (text: string) => void; onClose: () => void; title: string; members?: Member[]}) => {
  const fs = (s: number) => Math.round(s * (T?.textScale || 1));
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(initialContent || '');
  const [showMentionPicker, setShowMentionPicker] = useState(false);

  const insertFormat = (before: string, after: string) => {
    const placeholder = before.includes('<img') ? 'URL Here' : (after ? 'text' : '');
    setText(prev => prev + before + placeholder + after);
  };

  const insertMention = (m: Member) => {
    setText(prev => `${prev}${prev && !prev.endsWith(' ') && !prev.endsWith('\n') ? ' ' : ''}@[${m.name}](member:${m.id}) `);
    setShowMentionPicker(false);
  };

  const handleSave = () => {
    try {
      onSave(text);
    } catch (e) {
      console.error('[PS] save error:', e);
    }
  };

  return (
    <View style={[s.container, {backgroundColor: T.bg, paddingTop: Platform.OS === 'ios' ? insets.top : 0}]}>
      <View style={[s.header, {borderBottomColor: T.border, backgroundColor: T.bg}]}>
        <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={s.headerBtn}>
          <Text style={{fontSize: fs(14), color: T.dim}}>{i18n.t('common.cancel')}</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, {color: T.text}]}>{title}</Text>
        <TouchableOpacity onPress={handleSave} activeOpacity={0.7} style={[s.headerBtn, {alignItems: 'flex-end'}]}>
          <Text style={{fontSize: fs(14), fontWeight: '600', color: T.accent}}>{i18n.t('common.save')}</Text>
        </TouchableOpacity>
      </View>
      <View style={{flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: T.surface}}>
        <View style={{flex: 1}}>
          <MdToolbar onInsert={insertFormat} T={T} />
        </View>
        {members && members.length > 0 && (
          <TouchableOpacity onPress={() => setShowMentionPicker(true)} activeOpacity={0.7}
            style={{paddingHorizontal: 14, paddingVertical: 7, marginRight: 8, borderRadius: 6, borderWidth: 1, borderColor: T.accent, backgroundColor: T.accentBg}}>
            <Text style={{fontSize: fs(14), fontWeight: '700', color: T.accent}}>@</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView style={{flex: 1}} contentContainerStyle={{padding: 16, paddingBottom: 40}} keyboardShouldPersistTaps="handled">
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Write in markdown…"
          placeholderTextColor={T.muted}
          multiline
          autoFocus
          style={{fontSize: fs(15), color: T.text, lineHeight: 22, fontFamily: 'monospace', minHeight: 300, textAlignVertical: 'top'}}
        />
      </ScrollView>
      {showMentionPicker && members && (
        <MentionPicker members={members} theme={T} onPick={insertMention} onCancel={() => setShowMentionPicker(false)} />
      )}
    </View>
  );
};

export const RichTextEditor = ({visible, title, initialContent, theme, onSave, onClose, members}: Props) => {
  return (
    <Modal visible={visible} animationType="none" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{flex: 1, backgroundColor: theme.bg}}>
        {visible && (
          <MarkdownEditor
            title={title}
            initialContent={initialContent}
            theme={theme}
            onSave={onSave}
            onClose={onClose}
            members={members}
          />
        )}
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  container: {flex: 1, overflow: 'hidden'},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1},
  headerTitle: {fontFamily: Fonts.display, fontSize: 18, fontWeight: '600', fontStyle: 'italic'},
  headerBtn: {padding: 4, minWidth: 60},
});
