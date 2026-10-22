import React from 'react';
import {View, TouchableOpacity, ScrollView, Image, Modal} from 'react-native';
import {Text} from '../../components/AppText';
import {useTranslation} from 'react-i18next';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import type {CloneSelection, MemberGroup} from '../../utils';

export const AvatarViewer = ({visible, uri, name, onClose}: {visible: boolean; uri: string | undefined; name: string; onClose: () => void}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 16}} activeOpacity={1}
        onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')}
        accessibilityViewIsModal onAccessibilityEscape={onClose}>
        <Image source={{uri}} style={{width: '100%', height: '80%', borderRadius: 12}} resizeMode="contain"
          accessibilityRole="image" accessibilityLabel={t('modal.viewPfpOf', {name})} />
        <Text style={{fontSize: fs(13), color: T.dim, marginTop: 16}}>{t('common.close')}</Text>
      </TouchableOpacity>
    </Modal>
  );
};

export const GroupInfoDialog = ({group, onClose}: {group: MemberGroup | null; onClose: () => void}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <Modal visible={!!group} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 28}} activeOpacity={1} onPress={onClose} accessible={false} importantForAccessibility="no">
        <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 16}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10}}>
            <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: group?.color || T.accent}} accessibilityElementsHidden importantForAccessibility="no" />
            <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(15), fontWeight: '600', color: T.text}} numberOfLines={1}>{group?.name}</Text>
          </View>
          <ScrollView style={{maxHeight: 260}}>
            <Text style={{fontSize: fs(13), color: T.dim, lineHeight: fs(19)}}>{group?.description}</Text>
          </ScrollView>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')}
            hitSlop={{top: 6, bottom: 6}} style={{alignItems: 'center', paddingVertical: 11, marginTop: 12, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
            <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

export const CloneDialog = ({visible, sel, setSel, onClone, onCancel}: {
  visible: boolean; sel: CloneSelection; setSel: React.Dispatch<React.SetStateAction<CloneSelection>>; onClone: () => void; onCancel: () => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24}}>
        <View accessibilityViewIsModal onAccessibilityEscape={onCancel} style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, overflow: 'hidden'}}>
          <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, padding: 16, paddingBottom: 4}}>{t('members.clone')}</Text>
          <Text style={{fontSize: fs(12), color: T.dim, paddingHorizontal: 16, paddingBottom: 8}}>{t('members.cloneFields')}</Text>
          {([['name', t('modal.name')], ['pronouns', t('modal.pronouns')], ['role', t('modal.role')], ['color', t('memberProfile.color')], ['description', t('modal.descriptionLabel')]] as ['name' | 'pronouns' | 'role' | 'color' | 'description', string][]).map(([k, label]) => {
            const on = sel[k];
            return (
              <TouchableOpacity key={k} onPress={() => setSel(s => ({...s, [k]: !s[k]}))} activeOpacity={0.7}
                accessibilityRole="switch" accessibilityState={{checked: on}} accessibilityLabel={label}
                style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: 1, borderTopColor: T.border}}>
                <View style={{width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: on ? T.accent : T.border, backgroundColor: on ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
                  {on ? <Text style={{fontSize: fs(12), color: T.bg, fontWeight: '700'}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</Text> : null}
                </View>
                <Text style={{flex: 1, fontSize: fs(14), color: T.text}} numberOfLines={1}>{label}</Text>
              </TouchableOpacity>
            );
          })}
          <View style={{flexDirection: 'row', borderTopWidth: 1, borderTopColor: T.border}}>
            <TouchableOpacity onPress={onCancel} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
              style={{flex: 1, alignItems: 'center', paddingVertical: 13, borderRightWidth: 1, borderRightColor: T.border}}>
              <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClone} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('members.clone')}
              style={{flex: 1, alignItems: 'center', paddingVertical: 13}}>
              <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('members.clone')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};
