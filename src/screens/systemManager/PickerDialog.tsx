import React from 'react';
import {View, ScrollView, Modal} from 'react-native';
import {Text} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';

export const PickerDialog = ({visible, title, onClose, footer, children}: {
  visible: boolean; title: string; onClose: () => void; footer: React.ReactNode; children: React.ReactNode;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24}}>
        <View accessibilityViewIsModal onAccessibilityEscape={onClose}
          style={{borderRadius: 16, borderWidth: 1, padding: 18, width: '100%', maxWidth: 400, maxHeight: '80%', backgroundColor: T.card, borderColor: T.border}}>
          <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, marginBottom: 10}} numberOfLines={1}>{title}</Text>
          <ScrollView style={{flexShrink: 1}} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer}
        </View>
      </View>
    </Modal>
  );
};
