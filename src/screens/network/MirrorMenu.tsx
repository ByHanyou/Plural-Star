import React from 'react';
import {View, TouchableOpacity, Modal} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {Friend, MirrorFeature} from '../../network/types';
import {Bucket, BUCKET_ROWS, effectiveShare, featureLabel, scopeSummary} from '../../network/buckets';

const MIRROR_OPTIONS: {feature: MirrorFeature; key: string}[] = [
  {feature: 'systemProfile', key: 'systemProfile.title'},
  {feature: 'members', key: 'tabs.members'},
  {feature: 'groups', key: 'members.fieldGroups'},
  {feature: 'journal', key: 'tabs.journal'},
  {feature: 'history', key: 'tabs.history'},
  {feature: 'whiteboard', key: 'whiteboard.title'},
  {feature: 'planner', key: 'planner.title'},
];

export const MirrorMenu = ({friend, buckets, onPick, onClose}: {
  friend: Friend | null; buckets: Bucket[]; onPick: (friend: Friend, feature: MirrorFeature) => void; onClose: () => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <Modal visible={!!friend} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24}} activeOpacity={1} onPress={onClose} accessible={false} importantForAccessibility="no">
        <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, overflow: 'hidden'}}>
          <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, padding: 16, paddingBottom: 8}} numberOfLines={1}>
            {t('network.viewSharedTitle', {name: friend?.displayName || ''})}
          </Text>
          {friend && (
            <Text style={{fontSize: fs(11), color: T.dim, paddingHorizontal: 16, paddingBottom: 12}}>
              {BUCKET_ROWS
                .map(f => t('a11y.labelValue', {label: featureLabel(t, f), value: scopeSummary(t, effectiveShare(buckets, friend.peerId, f), true)}))
                .join('  ·  ')}
            </Text>
          )}
          {MIRROR_OPTIONS.map(opt => (
            <TouchableOpacity key={opt.feature} activeOpacity={0.7}
              onPress={() => { if (friend) onPick(friend, opt.feature); }}
              accessibilityRole="button" accessibilityLabel={t(opt.key)}
              style={{paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: 1, borderTopColor: T.border}}>
              <Text style={{fontSize: fs(14), color: T.text}}>{t(opt.key)}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
            style={{alignItems: 'center', paddingVertical: 13, borderTopWidth: 1, borderTopColor: T.border}}>
            <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};
