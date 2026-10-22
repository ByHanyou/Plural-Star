import {View, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {ms, MemberTab} from './shared';

const EMPTY_KEY: Record<MemberTab, {none: string; noneArchived: string; add: string}> = {
  active: {none: 'members.noMembers', noneArchived: 'members.noArchived', add: 'members.addMember'},
  facets: {none: 'members.noFacets', noneArchived: 'members.noArchivedFacets', add: 'members.addFacet'},
  customFronts: {none: 'members.noCustomFronts', noneArchived: 'members.noArchivedCustomFronts', add: 'members.addCustomFront'},
};

export const MembersEmpty = ({archiveOnly, memberTab, total, onAdd, onClear}: {
  archiveOnly: boolean; memberTab: MemberTab; total: number;
  onAdd: () => void; onClear: () => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  if (total === 0) {
    const keys = EMPTY_KEY[memberTab];
    return (
      <View style={ms.empty}>
        <Text style={{fontSize: fs(36), opacity: 0.4, marginBottom: 12}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">◇</Text>
        <Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center', marginBottom: 16}}>{t(archiveOnly ? keys.noneArchived : keys.none)}</Text>
        {!archiveOnly && (
          <TouchableOpacity onPress={onAdd} activeOpacity={0.7} accessibilityRole="button" hitSlop={{top: 8, bottom: 8}} style={[ms.addBtn, {backgroundColor: T.accentBg, borderColor: `${T.accent}40`}]}>
            <Text style={{fontSize: fs(13), fontWeight: '500', color: T.accent}}>{t(keys.add)}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }
  return (
    <View style={ms.empty}>
      <Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center', marginBottom: 16}}>{t('members.countFiltered', {filtered: 0, total})}</Text>
      <TouchableOpacity onPress={onClear} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.clear')} hitSlop={{top: 8, bottom: 8}} style={[ms.addBtn, {backgroundColor: T.surface, borderColor: T.border}]}>
        <Text style={{fontSize: fs(13), fontWeight: '500', color: T.dim}}>{t('common.clear')}</Text>
      </TouchableOpacity>
    </View>
  );
};
