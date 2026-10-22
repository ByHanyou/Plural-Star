import {View, TouchableOpacity, Modal} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {fontScale, tierAccent} from '../../theme';
import {useTheme} from '../../themeContext';
import {Member, FrontTierKey, FRONT_TIER_KEYS, TIER_I18N_KEY} from '../../utils';

export const QuickFrontSheet = ({member, onPick, onClose}: {
  member: Member | null; onPick: (m: Member, tier: FrontTierKey) => void; onClose: () => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <Modal visible={!!member} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} accessible={false} importantForAccessibility="no"
        style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 32}}>
        <TouchableOpacity activeOpacity={1} accessible={false} accessibilityViewIsModal onAccessibilityEscape={onClose} style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, overflow: 'hidden'}}>
          <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, padding: 16, paddingBottom: 8}}>
            {member ? t('members.addToFrontName', {name: member.name}) : t('members.addToFront')}
          </Text>
          {FRONT_TIER_KEYS.map(k => (
            <TouchableOpacity key={k} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t(TIER_I18N_KEY[k])}
              onPress={() => {
                const mm = member;
                onClose();
                if (mm) onPick(mm, k);
              }}
              style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: 1, borderTopColor: T.border}}>
              <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: tierAccent(T, k)}} accessibilityElementsHidden importantForAccessibility="no" />
              <Text style={{fontSize: fs(14), color: T.text}}>{t(TIER_I18N_KEY[k])}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
            style={{alignItems: 'center', paddingVertical: 13, borderTopWidth: 1, borderTopColor: T.border}}>
            <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};
