import {View, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {Avatar} from '../../components/Avatar';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {Member} from '../../utils';
import {sectionLabel} from '../../components/controls';

export const DeletedMembersFooter = ({members, onRestore}: {members: Member[]; onRestore: (id: string) => void}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <View style={{marginTop: 20}}>
      <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{t('members.recentlyDeleted')}</Text>
      {members.map(m => (
        <View key={m.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, marginBottom: 6, borderRadius: 10, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, opacity: 0.85}}>
          <Avatar member={m} size={32} />
          <Text style={{flex: 1, fontSize: fs(13), color: T.text}} numberOfLines={1}>{m.name}</Text>
          <TouchableOpacity onPress={() => onRestore(m.id)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel={t('members.restoreItem', {name: m.name})}
            hitSlop={{top: 9, bottom: 9}} style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
            <Text style={{fontSize: fs(12), fontWeight: '600', color: T.accent}}>{t('members.restore')}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
};
