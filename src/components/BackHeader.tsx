import React from 'react';
import {View, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from './AppText';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {tileTitle} from './controls';

export const BackHeader = ({title, onBack, right, tile = false, titleSize = 20}: {
  title: string; onBack: () => void; right?: React.ReactNode; tile?: boolean; titleSize?: number;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8}}>
      <TouchableOpacity onPress={onBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={{top: 9, bottom: 9, left: 9, right: 9}} style={{padding: 4, marginRight: 12}}>
        <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(18), color: T.dim}}>←</Text>
      </TouchableOpacity>
      <Text accessibilityRole="header" style={tile ? tileTitle(T) : {fontSize: fs(titleSize), fontWeight: '600', color: T.text, flex: 1, marginRight: 8}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{title}</Text>
      {right}
    </View>
  );
};
