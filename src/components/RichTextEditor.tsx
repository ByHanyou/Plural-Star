import React, {useState, useRef} from 'react';
import {View, Text, TouchableOpacity, TextInput, StyleSheet, Platform, KeyboardAvoidingView, Modal, StatusBar, ScrollView} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {RichText, Toolbar, useEditorBridge, CoreBridge, TenTapStartKit} from '@10play/tentap-editor';
import {Fonts} from '../theme';
import type {ThemeColors} from '../theme';

interface Props {
  visible: boolean;
  title: string;
  initialContent: string;
  theme: ThemeColors;
  onSave: (content: string) => void;
  onClose: () => void;
}

const isHTML = (text: string): boolean => {
  const t = (text || '').trim();
  return t.startsWith('<') || /<(?:p|h[1-6]|div|ul|ol|blockquote|pre|hr)\b/i.test(t);
};

const MD_TOOLS: {label: string; before: string; after: string; bold?: boolean; italic?: boolean; strike?: boolean}[] = [
  {label: 'B', before: '**', after: '**', bold: true},
  {label: 'I', before: '*', after: '*', italic: true},
  {label: 'S', before: '~~', after: '~~', strike: true},
  {label: 'H1', before: '# ', after: ''},
  {label: 'H2', before: '## ', after: ''},
  {label: 'H3', before: '### ', after: ''},
  {label: '🔗', before: '[', after: '](url)'},
  {label: '•', before: '- ', after: ''},
  {label: '1.', before: '1. ', after: ''},
  {label: '❝', before: '> ', after: ''},
  {label: '</>', before: '`', after: '`'},
  {label: '—', before: '\n---\n', after: ''},
];

const MdToolbar = ({onInsert, T}: {onInsert: (before: string, after: string) => void; T: ThemeColors}) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false}
    style={{maxHeight: 40, flexGrow: 0, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: T.surface}}
    contentContainerStyle={{paddingHorizontal: 12, paddingVertical: 6, gap: 6, flexDirection: 'row', alignItems: 'center'}}>
    {MD_TOOLS.map(tool => (
      <TouchableOpacity key={tool.label} onPress={() => onInsert(tool.before, tool.after)} activeOpacity={0.7}
        style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: T.border, backgroundColor: T.bg}}>
        <Text style={{fontSize: 12, fontWeight: tool.bold ? '700' : '500', fontStyle: tool.italic ? 'italic' : 'normal', textDecorationLine: tool.strike ? 'line-through' : 'none', color: T.dim}}>{tool.label}</Text>
      </TouchableOpacity>
    ))}
  </ScrollView>
);

const VisualEditor = ({initialContent, theme: T, onSave, onClose, onSwitchMode, title}: {initialContent: string; theme: ThemeColors; onSave: (html: string) => void; onClose: () => void; onSwitchMode: (content: string) => void; title: string}) => {
  const insets = useSafeAreaInsets();

  const editorCSS = `
    * { color: ${T.text}; font-family: -apple-system, system-ui, sans-serif; box-sizing: border-box; }
    html, body { background-color: ${T.bg}; margin: 0; font-size: 15px; line-height: 1.6; max-width: 100vw; overflow-x: hidden; }
    body { padding: 8px 12px; }
    .ProseMirror { outline: none; max-width: 100%; overflow-wrap: break-word; word-wrap: break-word; }
    h1, h2, h3 { color: ${T.text}; margin: 8px 0 4px 0; }
    h1 { font-size: 22px; } h2 { font-size: 18px; } h3 { font-size: 16px; }
    a { color: ${T.info}; }
    blockquote { border-left: 3px solid ${T.accent}; padding-left: 12px; margin-left: 0; color: ${T.dim}; font-style: italic; }
    code { background-color: ${T.surface}; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 13px; }
    pre { background-color: ${T.surface}; padding: 12px; border-radius: 8px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    hr { border: none; border-top: 1px solid ${T.border}; margin: 12px 0; }
    ul, ol { padding-left: 20px; }
    li { margin: 2px 0; }
    s { color: ${T.muted}; }
    p.is-editor-empty:first-child::before { color: ${T.muted}; content: attr(data-placeholder); float: left; height: 0; pointer-events: none; }
  `;

  const editor = useEditorBridge({
    autofocus: true,
    avoidIosKeyboard: true,
    initialContent: initialContent || '<p></p>',
    bridgeExtensions: [
      ...TenTapStartKit,
      CoreBridge.configureCSS(editorCSS),
    ],
  });

  const handleSave = async () => {
    const html = await editor.getHTML();
    onSave(html);
  };

  const handleSwitchMode = async () => {
    const html = await editor.getHTML();
    onSwitchMode(html);
  };

  return (
    <View style={[s.container, {backgroundColor: T.bg, paddingTop: Platform.OS === 'ios' ? insets.top : 0}]}>
      <View style={[s.header, {borderBottomColor: T.border, backgroundColor: T.bg}]}>
        <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={s.headerBtn}>
          <Text style={{fontSize: 14, color: T.dim}}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSwitchMode} activeOpacity={0.7}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
            <Text style={[s.headerTitle, {color: T.text}]}>{title}</Text>
            <Text style={{fontSize: 10, color: T.accent, fontWeight: '600'}}>Visual ▼</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} activeOpacity={0.7} style={[s.headerBtn, {alignItems: 'flex-end'}]}>
          <Text style={{fontSize: 14, fontWeight: '600', color: T.accent}}>Done</Text>
        </TouchableOpacity>
      </View>
      <RichText editor={editor} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{position: 'absolute', width: '100%', bottom: 0}}
      >
        <Toolbar editor={editor} />
      </KeyboardAvoidingView>
    </View>
  );
};

const MarkdownEditor = ({initialContent, theme: T, onSave, onClose, onSwitchMode, title}: {initialContent: string; theme: ThemeColors; onSave: (text: string) => void; onClose: () => void; onSwitchMode: (content: string) => void; title: string}) => {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(initialContent || '');

  const insertFormat = (before: string, after: string) => {
    setText(prev => prev + before + (after ? 'text' : '') + after);
  };

  return (
    <View style={[s.container, {backgroundColor: T.bg, paddingTop: Platform.OS === 'ios' ? insets.top : 0}]}>
      <View style={[s.header, {borderBottomColor: T.border, backgroundColor: T.bg}]}>
        <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={s.headerBtn}>
          <Text style={{fontSize: 14, color: T.dim}}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onSwitchMode(text)} activeOpacity={0.7}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
            <Text style={[s.headerTitle, {color: T.text}]}>{title}</Text>
            <Text style={{fontSize: 10, color: T.info, fontWeight: '600'}}>Markdown ▼</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onSave(text)} activeOpacity={0.7} style={[s.headerBtn, {alignItems: 'flex-end'}]}>
          <Text style={{fontSize: 14, fontWeight: '600', color: T.accent}}>Done</Text>
        </TouchableOpacity>
      </View>
      <MdToolbar onInsert={insertFormat} T={T} />
      <ScrollView style={{flex: 1}} contentContainerStyle={{padding: 16, paddingBottom: 40}} keyboardShouldPersistTaps="handled">
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Write in markdown…"
          placeholderTextColor={T.muted}
          multiline
          autoFocus
          style={{fontSize: 15, color: T.text, lineHeight: 22, fontFamily: 'monospace', minHeight: 300, textAlignVertical: 'top'}}
        />
      </ScrollView>
    </View>
  );
};

export const RichTextEditor = ({visible, title, initialContent, theme, onSave, onClose}: Props) => {
  const [mode, setMode] = useState<'visual' | 'markdown'>(() => isHTML(initialContent) ? 'visual' : (initialContent ? 'markdown' : 'visual'));
  const [content, setContent] = useState(initialContent);
  const [editorKey, setEditorKey] = useState(0);

  React.useEffect(() => {
    if (visible) {
      setContent(initialContent);
      setMode(isHTML(initialContent) ? 'visual' : (initialContent ? 'markdown' : 'visual'));
      setEditorKey(k => k + 1);
    }
  }, [visible, initialContent]);

  const switchToMarkdown = (currentContent: string) => {
    setContent(currentContent);
    setMode('markdown');
  };

  const switchToVisual = (currentContent: string) => {
    setContent(currentContent);
    setEditorKey(k => k + 1);
    setMode('visual');
  };

  return (
    <Modal visible={visible} animationType="none" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{flex: 1, backgroundColor: theme.bg}}>
        {visible && mode === 'visual' && (
          <VisualEditor key={`v-${editorKey}`} title={title} initialContent={content} theme={theme} onSave={onSave} onClose={onClose} onSwitchMode={switchToMarkdown} />
        )}
        {visible && mode === 'markdown' && (
          <MarkdownEditor key={`m-${editorKey}`} title={title} initialContent={content} theme={theme} onSave={onSave} onClose={onClose} onSwitchMode={switchToVisual} />
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
