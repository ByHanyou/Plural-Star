import {useState} from 'react';
import {View, ScrollView, Modal} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {MemberGroup, sortGroupsForDisplay, groupKind, toggleId} from '../../utils';
import {ApplyFooter, CheckRow} from './SheetParts';

const GroupAssignCard = ({groups, onApply, onClose}: {
  groups: MemberGroup[]; onApply: (groupIds: string[]) => void; onClose: () => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [sel, setSel] = useState<string[]>([]);
  const toggle = (gid: string) => setSel(prev => toggleId(prev, gid));
  return (
    <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24}}>
      <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, maxHeight: '70%', overflow: 'hidden'}}>
        <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, padding: 16, paddingBottom: 8}}>{t('members.addToGroups')}</Text>
        <ScrollView style={{maxHeight: 320}}>
          {sortGroupsForDisplay(groups, groups).map(g => (
            <CheckRow key={g.id} label={g.name} on={sel.includes(g.id)} onPress={() => toggle(g.id)} color={T.accent}>
              <View style={{width: 8, height: 8, borderRadius: groupKind(g) === 'subsystem' ? 1 : 4, backgroundColor: g.color || T.accent}} />
            </CheckRow>
          ))}
        </ScrollView>
        <ApplyFooter canApply={sel.length > 0} onApply={() => onApply(sel)} onCancel={onClose} />
      </View>
    </View>
  );
};

export const GroupAssignSheet = ({visible, groups, onApply, onClose}: {
  visible: boolean; groups: MemberGroup[]; onApply: (groupIds: string[]) => void; onClose: () => void;
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    {visible && <GroupAssignCard groups={groups} onApply={onApply} onClose={onClose} />}
  </Modal>
);
