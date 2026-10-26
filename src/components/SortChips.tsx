import React from 'react';
import {View, ScrollView, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from './AppText';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {MEMBER_SORT_MODES, MemberSortMode} from '../utils';

export const SortChips = ({value, onChange}: {value: MemberSortMode; onChange: (mode: MemberSortMode) => void}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 10, flexGrow: 0}}>
      <View style={{flexDirection: 'row', gap: 6, paddingHorizontal: 2}}>
        {MEMBER_SORT_MODES.map(mode => (
          <TouchableOpacity key={mode} onPress={() => onChange(mode)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityState={{selected: value === mode}} accessibilityLabel={t(`memberSort.${mode}`)}
            hitSlop={{top: 10, bottom: 10}} style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
              backgroundColor: value === mode ? `${T.accent}20` : T.surface,
              borderColor: value === mode ? `${T.accent}50` : T.border}}>
            <Text style={{fontSize: fs(11), color: value === mode ? T.accent : T.dim, fontWeight: value === mode ? '600' : '400'}}>
              {t(`memberSort.${mode}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
};
