import React from 'react';
import {View, TouchableOpacity, StyleSheet, StatusBar, Platform} from 'react-native';
import {Text} from './AppText';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTranslation} from 'react-i18next';
import {AccentText} from './AccentText';
import {readableAccent} from '../theme';
import type {ThemeColors} from '../theme';

export const AppHeader = ({C, systemName, canLock, onLock, onOpenSettings}: {C: ThemeColors; systemName: string; canLock: boolean; onLock: () => void; onOpenSettings: () => void}) => {
  const {t} = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View style={{backgroundColor: C.bg, paddingTop: Platform.OS === 'ios' ? Math.max(insets.top - 6, 0) : Math.max(StatusBar.currentHeight || 0, insets.top || 0, 28)}}>
      <View style={[styles.header, {borderBottomColor: C.border, backgroundColor: C.bg}]}>
        <View style={{flex: 1, minWidth: 0, marginRight: 8, overflow: 'hidden'}}>
          <AccentText
            T={C}
            style={[styles.headerTitle, {color: readableAccent(C), flex: 1}]}
            numberOfLines={1}
            accessibilityRole="header"
            maxFontSizeMultiplier={1.2}>{systemName}</AccentText>
        </View>
        <View style={styles.headerRight} accessibilityRole="toolbar" accessibilityLabel={t('a11y.toolbar')}>
          <TouchableOpacity
            onPress={() => { if (canLock) onLock(); }}
            disabled={!canLock}
            activeOpacity={canLock ? 0.7 : 1}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.lockApp')}
            accessibilityState={{disabled: !canLock}}
            style={styles.settingsBtn}>
            <Text style={[styles.settingsIcon, {color: canLock ? C.dim : C.muted, opacity: canLock ? 1 : 0.35}]} maxFontSizeMultiplier={1.2} allowFontScaling={false} importantForAccessibility="no" accessibilityElementsHidden>🔒</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenSettings} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('a11y.settings')} style={styles.settingsBtn}>
            <Text style={[styles.settingsIcon, {color: C.dim}]} maxFontSizeMultiplier={1.2} allowFontScaling={false} importantForAccessibility="no" accessibilityElementsHidden>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1},
  headerTitle: {fontFamily: 'OpenDyslexic', fontSize: 20, fontWeight: '600', fontStyle: 'italic', letterSpacing: 0.3},
  headerRight: {flexDirection: 'row', alignItems: 'center', flexShrink: 0},
  settingsBtn: {padding: 4, marginLeft: 8},
  settingsIcon: {fontSize: 18},
});
