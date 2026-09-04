import React, {ReactNode, useEffect, useRef} from 'react';
import {View, ScrollView, TouchableOpacity, StyleSheet, Platform} from 'react-native';
import {Text} from './AppText';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {TrueSheet} from '@lodev09/react-native-true-sheet';
import {Fonts, ThemeColors} from '../theme';
import {useTranslation} from 'react-i18next';

interface SheetProps {
  visible: boolean;
  title: string;
  theme: ThemeColors;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  headerAction?: ReactNode;
}

const isIPad = Platform.OS === 'ios' && Platform.isPad;

const ANDROID_NAV_BAR_FLOOR = 24;

export const Sheet = ({visible, title, theme: T, onClose, children, footer, headerAction}: SheetProps) => {
  const {t} = useTranslation();
  const sheetRef = useRef<TrueSheet>(null);
  const scrollRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const rawBottomInset = isIPad ? 0 : insets.bottom;
  const bottomInset = Platform.OS === 'android'
    ? Math.max(rawBottomInset, ANDROID_NAV_BAR_FLOOR)
    : rawBottomInset;
  const wasVisible = useRef(false);
  const presentedRef = useRef(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const watchdogs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearWatchdogs = () => {
    for (const w of watchdogs.current) clearTimeout(w);
    watchdogs.current = [];
  };
  useEffect(() => {
    if (visible) {
      wasVisible.current = true;
      presentedRef.current = false;
      clearWatchdogs();
      const attempt = () => {
        Promise.resolve(sheetRef.current?.present())
          .then(() => {
            presentedRef.current = true;
            clearWatchdogs();
            if (!visibleRef.current) Promise.resolve(sheetRef.current?.dismiss()).catch(() => {});
          })
          .catch(() => {});
      };
      attempt();
      watchdogs.current.push(setTimeout(() => {
        if (!presentedRef.current && visibleRef.current) attempt();
      }, 3000));
    } else if (wasVisible.current) {
      wasVisible.current = false;
      clearWatchdogs();
      const tryDismiss = () => Promise.resolve(sheetRef.current?.dismiss()).catch(() => {});
      tryDismiss();
      watchdogs.current.push(setTimeout(() => {
        if (presentedRef.current && !visibleRef.current) tryDismiss();
      }, 700));
    }
    return clearWatchdogs;
  }, [visible]);

  const scrollPaddingBottom = (footer ? 8 : 56) + bottomInset;

  return (
    <TrueSheet
      ref={sheetRef}
      detents={[0.92]}
      cornerRadius={20}
      backgroundColor={T.card}
      onDidPresent={() => {
        presentedRef.current = true;
        clearWatchdogs();
        if (!visibleRef.current) Promise.resolve(sheetRef.current?.dismiss()).catch(() => {});
      }}
      onDidDismiss={() => { presentedRef.current = false; onClose(); }}
      scrollable
      header={
        <View style={[s.header, {borderBottomColor: T.border, backgroundColor: T.card}]}>
          <Text style={[s.title, {color: T.text, flex: 1, marginRight: 8}]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
          {headerAction}
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')} style={s.closeBtn}>
            <Text style={[s.closeX, {color: T.dim}]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✕</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <ScrollView
        ref={scrollRef}
        style={s.body}
        contentContainerStyle={{paddingBottom: scrollPaddingBottom}}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {children}
        {footer ? (
          <View style={[s.footer, {borderTopColor: T.border}]}>
            {footer}
          </View>
        ) : null}
      </ScrollView>
    </TrueSheet>
  );
};

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {fontFamily: Fonts.display, fontSize: 22, fontWeight: '600', fontStyle: 'italic'},
  closeBtn: {padding: 4},
  closeX: {fontSize: 16},
  body: {flex: 1, paddingHorizontal: 20, paddingTop: 16},
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
});
