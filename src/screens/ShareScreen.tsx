import React, {useState} from 'react';
import {View} from 'react-native';
import {KeyboardAwareScrollView} from 'react-native-keyboard-controller';
import {useTranslation} from 'react-i18next';
import {useTheme} from '../themeContext';
import {ChoiceBtn, HIDDEN, share} from './share/ShareParts';
import {ExportSection} from './share/ExportSection';
import {ImportSection} from './share/ImportSection';
import {ShareViewSection} from './share/ShareViewSection';

type Section = 'export' | 'import' | 'shareview';

const SECTIONS: {id: Section; key: string}[] = [
  {id: 'export', key: 'share.export'},
  {id: 'import', key: 'share.import'},
  {id: 'shareview', key: 'share.shareView'},
];

export const ShareScreen = () => {
  const T = useTheme();
  const {t} = useTranslation();
  const [section, setSection] = useState<Section>('export');
  const shown = (id: Section) => (section === id ? undefined : HIDDEN);
  return (
    <KeyboardAwareScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={share.content} keyboardShouldPersistTaps="handled" bottomOffset={24}>
      <View style={{flexDirection: 'row', gap: 6, marginBottom: 4}}>
        {SECTIONS.map(s => (
          <ChoiceBtn key={s.id} label={t(s.key)} selected={section === s.id} onPress={() => setSection(s.id)}
            hitSlop={{top: 7, bottom: 7}} style={{flex: 1, paddingVertical: 8, alignItems: 'center'}} />
        ))}
      </View>
      <View style={shown('export')}><ExportSection /></View>
      <View style={shown('import')}><ImportSection /></View>
      <View style={shown('shareview')}><ShareViewSection /></View>
    </KeyboardAwareScrollView>
  );
};
