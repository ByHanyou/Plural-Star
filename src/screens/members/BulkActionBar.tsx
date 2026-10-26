import {View, TouchableOpacity, ViewStyle} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {MemberTab} from './shared';

export const BulkActionBar = ({memberTab, onAssignGroups, onAssignTags, onArchive, onRestore, onFacet, onDelete}: {
  memberTab: MemberTab;
  onAssignGroups?: () => void; onAssignTags?: () => void; onArchive?: () => void; onRestore?: () => void; onFacet?: () => void; onDelete: () => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const btn: ViewStyle = {flex: 1, minWidth: '22%', alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border};
  const action = (onPress: (() => void) | undefined, label: string, a11yLabel?: string) => onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={a11yLabel} hitSlop={{top: 6, bottom: 6}} style={btn}>
      <Text style={{fontSize: fs(13), fontWeight: '500', color: T.text}} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  ) : null;
  return (
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14}}>
      {action(onAssignGroups, t('members.assignGroup'))}
      {action(onAssignTags, t('members.assignTag'), t('members.addTags'))}
      {action(onArchive, t('members.archive'))}
      {action(onRestore, t('members.restore'))}
      {action(onFacet, memberTab === 'active' ? t('members.makeFacet') : t('members.makeMember'))}
      <TouchableOpacity onPress={onDelete} activeOpacity={0.7} accessibilityRole="button"
        hitSlop={{top: 6, bottom: 6}} style={[btn, {backgroundColor: `${T.danger}15`, borderColor: `${T.danger}50`}]}>
        <Text style={{fontSize: fs(13), fontWeight: '600', color: T.danger}} numberOfLines={1}>{t('common.delete')}</Text>
      </TouchableOpacity>
    </View>
  );
};
