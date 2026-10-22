import React from 'react';
import {View, TouchableOpacity, StyleSheet, StatusBar, Platform} from 'react-native';
import {Text} from './AppText';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTranslation} from 'react-i18next';
import {AccentText} from './AccentText';
import {Fonts, readableAccent} from '../theme';
import {useTheme} from '../themeContext';

const HIT_SLOP = {top: 8, bottom: 8, left: 8, right: 8};

export const AppHeader = ({systemName, canLock, onLock, onOpenSettings, onOpenProfile}: {systemName: string; canLock: boolean; onLock: () => void; onOpenSettings: () => void; onOpenProfile?: () => void}) => {
  const {t} = useTranslation();
  const C = useTheme();
  const insets = useSafeAreaInsets();
  const title = (
    <AccentText
      style={[styles.headerTitle, {color: readableAccent(C), flex: 1}]}
      numberOfLines={1}
      importantForAccessibility={onOpenProfile ? 'no-hide-descendants' : undefined}
      accessibilityElementsHidden={!!onOpenProfile}
      accessibilityRole={onOpenProfile ? undefined : 'header'}
      maxFontSizeMultiplier={1.2}>{systemName}</AccentText>
  );
  return (
    <View style={{backgroundColor: C.bg, paddingTop: Platform.OS === 'ios' ? Math.max(insets.top - 6, 0) : Math.max(StatusBar.currentHeight || 0, insets.top || 0, 28)}}>
      <View style={[styles.header, {borderBottomColor: C.border, backgroundColor: C.bg}]}>
        {onOpenProfile ? (
          <TouchableOpacity
            onPress={onOpenProfile}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={systemName}
            accessibilityHint={t('systemProfile.openHint')}
            style={styles.titleBox}>
            {title}
          </TouchableOpacity>
        ) : (
          <View style={styles.titleBox}>{title}</View>
        )}
        <View style={styles.headerRight} accessibilityRole="toolbar" accessibilityLabel={t('a11y.toolbar')}>
          <TouchableOpacity
            onPress={onLock}
            disabled={!canLock}
            activeOpacity={canLock ? 0.7 : 1}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.lockApp')}
            accessibilityState={{disabled: !canLock}}
            hitSlop={HIT_SLOP}
            style={styles.settingsBtn}>
            <Text style={[styles.settingsIcon, {color: canLock ? C.dim : C.muted, opacity: canLock ? 1 : 0.35}]} maxFontSizeMultiplier={1.2} allowFontScaling={false} importantForAccessibility="no" accessibilityElementsHidden>🔒</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenSettings} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('a11y.settings')} hitSlop={HIT_SLOP} style={styles.settingsBtn}>
            <Text style={[styles.settingsIcon, {color: C.dim}]} maxFontSizeMultiplier={1.2} allowFontScaling={false} importantForAccessibility="no" accessibilityElementsHidden>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1},
  headerTitle: {fontFamily: Fonts.display, fontSize: 20, fontWeight: '600', fontStyle: 'italic', letterSpacing: 0.3},
  titleBox: {flex: 1, minWidth: 0, marginRight: 8, overflow: 'hidden'},
  headerRight: {flexDirection: 'row', alignItems: 'center', flexShrink: 0},
  settingsBtn: {padding: 4, marginLeft: 8},
  settingsIcon: {fontSize: 18},
});
