import React from 'react';
import {ScrollView, TouchableOpacity} from 'react-native';
import type {TextStyle} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';

const FORMAT_TOOLS: {label: string; a11y: string; before: string; after: string | null; style?: TextStyle}[] = [
  {label: 'B', a11y: 'markdown.toolBold', before: '**', after: '**', style: {fontWeight: '700'}},
  {label: 'I', a11y: 'markdown.toolItalic', before: '*', after: '*', style: {fontStyle: 'italic'}},
  {label: 'S', a11y: 'markdown.toolStrike', before: '~~', after: '~~', style: {textDecorationLine: 'line-through'}},
  {label: 'H1', a11y: 'markdown.toolH1', before: '# ', after: ''},
  {label: 'H2', a11y: 'markdown.toolH2', before: '## ', after: ''},
  {label: '🔗', a11y: 'markdown.toolLink', before: '[', after: null},
  {label: '•', a11y: 'markdown.toolBullets', before: '- ', after: ''},
  {label: '1.', a11y: 'markdown.toolNumbered', before: '1. ', after: ''},
  {label: '❝', a11y: 'markdown.toolQuote', before: '> ', after: ''},
  {label: '</>', a11y: 'markdown.toolCode', before: '`', after: '`'},
];

export const FormatBar = ({onInsert}: {onInsert: (before: string, after: string) => void}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      style={{maxHeight: Math.max(40, fs(12) * 2 + 28), flexGrow: 0, borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.surface}}
      contentContainerStyle={{paddingHorizontal: 12, paddingVertical: 6, gap: 6, flexDirection: 'row', alignItems: 'center'}}>
      {FORMAT_TOOLS.map(tool => (
        <TouchableOpacity key={tool.label} onPress={() => onInsert(tool.before, tool.after ?? `](${t('editor.linkUrl')})`)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel={t(tool.a11y)}
          hitSlop={{top: 10, bottom: 10}} style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: T.border, backgroundColor: T.bg}}>
          <Text style={[{fontSize: fs(12), fontWeight: '500', color: T.dim}, tool.style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{tool.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};
