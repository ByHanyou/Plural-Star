import {View, TouchableOpacity, Modal} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {MemberListFields} from './shared';
import {sectionLabel} from '../../components/controls';
import {TogglePill} from '../../components/ToggleSwitch';

const FIELD_TOGGLES = [['groups', 'members.fieldGroups'], ['descriptions', 'members.fieldDescriptions'], ['pronouns', 'members.fieldPronouns'], ['roles', 'members.fieldRoles'], ['count', 'members.fieldCount']] as const;
const BACKGROUNDS = [['plain', 'members.bgPlain'], ['color', 'members.bgMemberColor'], ['banner', 'members.bgBanner']] as const;

export const DisplayOptionsSheet = ({visible, fields, onChange, onClose}: {
  visible: boolean; fields: MemberListFields; onChange: (next: MemberListFields) => void; onClose: () => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24}}>
        <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, overflow: 'hidden'}}>
          <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, padding: 16, paddingBottom: 8}}>{t('members.displayFields')}</Text>
          {FIELD_TOGGLES.map(([k, labelKey]) => {
            const label = t(labelKey);
            const on = fields[k] !== false;
            return (
              <TouchableOpacity key={k} onPress={() => onChange({...fields, [k]: !fields[k]})} activeOpacity={0.7}
                accessibilityRole="switch" accessibilityState={{checked: on}} accessibilityLabel={label}
                style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.border}}>
                <Text style={{flex: 1, fontSize: fs(14), color: T.text}} numberOfLines={1}>{label}</Text>
                <TogglePill on={on} large />
              </TouchableOpacity>
            );
          })}
          <View style={{paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.border}}>
            <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{t('members.cardBackground')}</Text>
            <View style={{flexDirection: 'row', gap: 7}}>
              {BACKGROUNDS.map(([mode, labelKey]) => {
                const label = t(labelKey);
                const sel = (fields.background || 'plain') === mode;
                return (
                  <TouchableOpacity key={mode} activeOpacity={0.7}
                    onPress={() => onChange({...fields, background: mode})}
                    accessibilityRole="radio" accessibilityState={{selected: sel, checked: sel}} accessibilityLabel={label}
                    hitSlop={{top: 6, bottom: 6}} style={{flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 8, borderWidth: 1,
                      backgroundColor: sel ? T.accentBg : T.surface, borderColor: sel ? `${T.accent}60` : T.border}}>
                    <Text style={{fontSize: fs(12), color: sel ? T.accent : T.dim, fontWeight: sel ? '600' : '400'}} numberOfLines={1}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')}
            hitSlop={{top: 6, bottom: 6}} style={{alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.border}}>
            <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};
