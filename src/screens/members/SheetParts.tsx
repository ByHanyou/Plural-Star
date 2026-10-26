import React from 'react';
import {TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {CancelConfirmRow, CheckBox} from '../../components/controls';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';

export const CheckRow = ({label, on, onPress, color, children}: {
  label: string; on: boolean; onPress: () => void; color: string; children?: React.ReactNode;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      accessibilityRole="checkbox" accessibilityState={{checked: on}} accessibilityLabel={label}
      style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: T.border}}>
      <CheckBox on={on} color={color} />
      {children}
      <Text style={{flex: 1, fontSize: fs(14), color: T.text}} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
};

export const ApplyFooter = ({canApply, onApply, onCancel}: {canApply: boolean; onApply: () => void; onCancel: () => void}) => {
  const T = useTheme();
  const {t} = useTranslation();
  return (
    <CancelConfirmRow label={t('common.add')} onConfirm={onApply} onCancel={onCancel} disabled={!canApply}
      style={{gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: T.border}} />
  );
};
