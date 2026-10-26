import React from 'react';
import {View, ScrollView, TouchableOpacity, AccessibilityInfo, Modal} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text, TextInput} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {tagKey} from '../../utils';
import {useTagAssign} from '../../hooks/useTagAssign';
import {useKeyboardHeight} from '../../hooks/useKeyboardHeight';
import {ApplyFooter, CheckRow} from './SheetParts';

const TagAssignCard = ({known, onApply, onClose}: {known: string[]; onApply: (tags: string[]) => void; onClose: () => void}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const kb = useKeyboardHeight();
  const {input, setInput, choices, isOn, toggle, addTyped: addTag, final} = useTagAssign(known);
  const addTyped = () => {
    const tag = addTag();
    if (tag) AccessibilityInfo.announceForAccessibility(tag);
  };
  return (
    <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24, paddingBottom: 24 + kb}}>
      <View accessibilityViewIsModal onAccessibilityEscape={onClose}
        style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, maxHeight: '80%', overflow: 'hidden'}}>
        <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, padding: 16, paddingBottom: 8}}>{t('members.addTags')}</Text>
        <View style={{flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10}}>
          <TextInput value={input} onChangeText={setInput} accessibilityLabel={t('modal.memberTagPlaceholder')} placeholder={t('modal.memberTagPlaceholder')} placeholderTextColor={T.muted}
            autoCapitalize="none" autoCorrect={false} onSubmitEditing={addTyped} returnKeyType="done" blurOnSubmit={false}
            style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13)}} />
          <TouchableOpacity onPress={addTyped} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.add')}
            hitSlop={{top: 6, bottom: 6}} style={{paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
            <Text style={{fontSize: fs(13), color: T.text}}>{t('common.add')}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={{maxHeight: 320}} keyboardShouldPersistTaps="handled">
          {choices.map(tag => (
            <CheckRow key={tagKey(tag)} label={tag} on={isOn(tag)} onPress={() => toggle(tag)} color={T.info} />
          ))}
        </ScrollView>
        <ApplyFooter canApply={final.length > 0} onApply={() => onApply(final)} onCancel={onClose} />
      </View>
    </View>
  );
};

export const TagAssignSheet = ({visible, known, onApply, onClose}: {
  visible: boolean; known: string[]; onApply: (tags: string[]) => void; onClose: () => void;
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    {visible && <TagAssignCard known={known} onApply={onApply} onClose={onClose} />}
  </Modal>
);
