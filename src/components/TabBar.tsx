import React from 'react';
import {View, TouchableOpacity, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTranslation} from 'react-i18next';
import {AccentText} from './AccentText';
import type {ThemeColors} from '../theme';
import {fontScale} from '../theme';

export type Tab = 'front' | 'members' | 'hub' | 'journal' | 'history';

export const TAB_IDS: Tab[] = ['front', 'members', 'hub', 'journal', 'history'];
const TAB_ICONS: Record<Tab, string> = {
  front: '◈', members: '◇', hub: '⬡', journal: '◉', history: '◷',
};

export const TabBar = ({C, tab, isSinglet, onPressTab}: {C: ThemeColors; tab: Tab; isSinglet: boolean; onPressTab: (id: Tab) => void}) => {
  const {t} = useTranslation();
  const insets = useSafeAreaInsets();
  const fs = fontScale(C);
  const tabLabel = (id: Tab): string => {
    if (isSinglet && id === 'front') return t('tabs.status');
    if (isSinglet && id === 'members') return t('tabs.profile');
    return t(`tabs.${id}`);
  };
  return (
    <View style={[styles.tabBar, {backgroundColor: C.surface, borderTopColor: C.border}]} accessibilityRole="tablist" accessibilityLabel={t('a11y.mainNav')}>
      {TAB_IDS.map(id => (
        <TouchableOpacity key={id} onPress={() => onPressTab(id)} activeOpacity={0.7} accessibilityRole="tab" accessibilityState={{selected: tab === id}} accessibilityLabel={tabLabel(id)} style={[styles.tabBtn, {paddingBottom: 8 + (insets.bottom || 0)}]}>
          <View style={{height: fs(24), justifyContent: 'center', marginBottom: 2}}>
            <AccentText T={C} style={[styles.tabIcon, {color: tab === id ? C.accent : C.dim, fontSize: fs(18), lineHeight: fs(22), textAlign: 'center', includeFontPadding: false, textAlignVertical: 'center'}]} maxFontSizeMultiplier={1.2}>{TAB_ICONS[id]}</AccentText>
          </View>
          <AccentText T={C} style={[styles.tabLabel, {color: tab === id ? C.accent : C.dim, fontSize: fs(9)}]} numberOfLines={1} allowFontScaling={false}>{tabLabel(id)}</AccentText>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  tabBar: {flexDirection: 'row', borderTopWidth: 1},
  tabBtn: {flex: 1, alignItems: 'center', paddingVertical: 8, paddingTop: 10},
  tabIcon: {fontSize: 18},
  tabLabel: {fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase'},
});
