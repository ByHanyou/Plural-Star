import React from 'react';
import {View, ScrollView, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {fmtNum} from '../../utils';
import {ms, MemberTab} from './shared';
import {TogglePill} from '../../components/ToggleSwitch';

export const GroupsToggle = ({on, onToggle, toggleRef}: {
  on: boolean; onToggle: () => void; toggleRef: React.Ref<React.ComponentRef<typeof TouchableOpacity>>;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <TouchableOpacity ref={toggleRef} onPress={onToggle} activeOpacity={0.7} hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}
      accessibilityRole="switch" accessibilityState={{checked: on}} accessibilityLabel={t('memberGroups.title')}
      style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingLeft: 10}}>
      <Text style={{fontSize: fs(12), fontWeight: '500', color: on ? T.accent : T.dim}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('memberGroups.title')}</Text>
      <TogglePill on={on} large />
    </TouchableOpacity>
  );
};

export const FrontersHeading = ({right}: {right: React.ReactNode}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <View style={{flexDirection: 'row', alignItems: 'center'}}>
      <Text
        accessibilityRole="header"
        style={[ms.heading, {color: T.text, flex: 1, fontSize: fs(22)}]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}>
        {t('tabs.fronters')}
      </Text>
      {right}
    </View>
  );
};

export const SelectionHeader = ({count, allSelected, onToggleAll, onCancel}: {
  count: number; allSelected: boolean; onToggleAll: () => void; onCancel: () => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <View style={{marginBottom: 14}}>
      <Text
        accessibilityRole="header"
        style={[ms.heading, {color: T.text, fontSize: fs(22), marginBottom: 10}]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}>
        {t('members.selectedCount', {count})}
      </Text>
      <View style={{flexDirection: 'row', gap: 6, flexWrap: 'wrap'}}>
        <TouchableOpacity onPress={onToggleAll} activeOpacity={0.7} accessibilityRole="button"
          hitSlop={{top: 9, bottom: 9}} style={[ms.addBtn, {backgroundColor: T.surface, borderColor: T.border}]}>
          <Text style={{fontSize: fs(12), fontWeight: '500', color: T.dim}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{allSelected ? t('members.selectNone') : t('members.selectAll')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} activeOpacity={0.7} accessibilityRole="button"
          hitSlop={{top: 8, bottom: 8}} style={[ms.addBtn, {backgroundColor: T.surface, borderColor: T.border}]}>
          <Text style={{fontSize: fs(13), fontWeight: '500', color: T.dim}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const TAB_LABEL: Record<MemberTab, {key: string; countKey: string}> = {
  active: {key: 'members.title', countKey: 'members.titleCount'},
  facets: {key: 'members.facets', countKey: 'members.facetsCount'},
  customFronts: {key: 'members.customFronts', countKey: 'members.customFrontsCount'},
};

export const MemberTabs = ({tab, onSwitch, counts, showCount, right}: {
  tab: MemberTab; onSwitch: (tab: MemberTab) => void;
  counts: Record<MemberTab, number>; showCount: boolean; right?: React.ReactNode;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 14, borderBottomWidth: 1, borderBottomColor: T.border}}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flex: 1}} contentContainerStyle={{alignItems: 'center'}}>
        {(['active', 'facets', 'customFronts'] as const).map(tb => {
          const spec = TAB_LABEL[tb];
          const n = counts[tb];
          return (
            <TouchableOpacity key={tb} onPress={() => onSwitch(tb)} activeOpacity={0.7}
              accessibilityRole="tab" accessibilityState={{selected: tab === tb}}
              hitSlop={{top: 6, bottom: 6}} style={{paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: tab === tb ? T.accent : 'transparent'}}>
              <Text style={{fontSize: fs(13), color: tab === tb ? T.accent : T.dim, fontWeight: tab === tb ? '600' : '400'}} numberOfLines={1}>
                {showCount && n > 0 ? t(spec.countKey, {n: fmtNum(n, 0)}) : t(spec.key)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {right}
    </View>
  );
};
