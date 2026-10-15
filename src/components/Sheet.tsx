import React, {ReactNode, useEffect, useLayoutEffect, useRef, useState} from 'react';
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
const PRESENT_RETRY_MS = 800;
const PRESENT_MAX_ATTEMPTS = 10;

export const Sheet = ({visible, title, theme: T, onClose, children, footer, headerAction}: SheetProps) => {
  const {t} = useTranslation();
  const sheetRef = useRef<TrueSheet>(null);
  const insets = useSafeAreaInsets();
  const rawBottomInset = isIPad ? 0 : insets.bottom;
  const bottomInset = Platform.OS === 'android'
    ? Math.max(rawBottomInset, ANDROID_NAV_BAR_FLOOR)
    : rawBottomInset;
  const [mountChildren, setMountChildren] = useState(visible);
  const presentedRef = useRef(false);
  const dismissingRef = useRef(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const sessionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const dismissNow = () => {
    dismissingRef.current = true;
    Promise.resolve(sheetRef.current?.dismiss()).catch(() => {});
  };
  const presentWithRetry = (session: number, delayFirst: boolean) => {
    clearTimer();
    let attempts = 0;
    const tick = () => {
      timerRef.current = null;
      if (session !== sessionRef.current || !visibleRef.current || presentedRef.current) return;
      if (attempts >= PRESENT_MAX_ATTEMPTS) {
        dismissNow();
        onCloseRef.current();
        return;
      }
      attempts += 1;
      Promise.resolve(sheetRef.current?.present()).catch(() => {});
      timerRef.current = setTimeout(tick, PRESENT_RETRY_MS);
    };
    if (delayFirst) timerRef.current = setTimeout(tick, PRESENT_RETRY_MS / 2);
    else tick();
  };

  useEffect(() => {
    sessionRef.current += 1;
    if (visible) {
      setMountChildren(true);
      presentWithRetry(sessionRef.current, false);
    } else {
      clearTimer();
      if (presentedRef.current) {
        presentedRef.current = false;
        dismissNow();
      }
    }
    return clearTimer;
  }, [visible]);

  useLayoutEffect(() => () => {
    if (presentedRef.current) {
      presentedRef.current = false;
      dismissNow();
    }
  }, []);

  const scrollPaddingBottom = (footer ? 8 : 56) + bottomInset;

  return (
    <TrueSheet
      ref={sheetRef}
      detents={[0.92]}
      cornerRadius={20}
      backgroundColor={T.card}
      onDidPresent={() => {
        presentedRef.current = true;
        dismissingRef.current = false;
        clearTimer();
        if (!visibleRef.current) {
          presentedRef.current = false;
          dismissNow();
        }
      }}
      onDidDismiss={() => {
        const wasPresented = presentedRef.current;
        const ours = dismissingRef.current;
        presentedRef.current = false;
        dismissingRef.current = false;
        if (visibleRef.current && !wasPresented && ours) {
          presentWithRetry(sessionRef.current, true);
          return;
        }
        setMountChildren(false);
        if (visibleRef.current) onCloseRef.current();
      }}
      scrollable
      header={
        <View style={[s.header, {borderBottomColor: T.border, backgroundColor: T.card}]}>
          <Text style={[s.title, {color: T.text, flex: 1, marginRight: 8}]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
          {headerAction}
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={{top: 10, bottom: 10, left: 8, right: 10}} style={s.closeBtn}>
            <Text style={[s.closeX, {color: T.dim}]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✕</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <ScrollView
        style={s.body}
        contentContainerStyle={{paddingBottom: scrollPaddingBottom}}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {mountChildren ? children : null}
        {mountChildren && footer ? (
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
