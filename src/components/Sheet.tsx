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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const watchdogs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearWatchdogs = () => {
    for (const w of watchdogs.current) clearTimeout(w);
    watchdogs.current = [];
  };
  useEffect(() => {
    // present() is not fire-and-forget any more. On Android a present issued
    // while another sheet is still mid-dismiss can be silently DROPPED: the
    // host's `visible` stays true, so the opening button becomes a no-op
    // ("press update front and it doesn't do it"), and the half-mounted dialog
    // can keep eating touches until the app is killed. The watchdog retries
    // the present until onDidPresent confirms it, and if it will not take,
    // calls onClose so the host resets and the button works again.
    if (visible) {
      wasVisible.current = true;
      presentedRef.current = false;
      clearWatchdogs();
      const attempt = () => { Promise.resolve(sheetRef.current?.present()).catch(() => {}); };
      attempt();
      watchdogs.current.push(setTimeout(() => {
        if (!presentedRef.current && visibleRef.current) attempt();
      }, 700));
      watchdogs.current.push(setTimeout(() => {
        if (!presentedRef.current && visibleRef.current) attempt();
      }, 1600));
      watchdogs.current.push(setTimeout(() => {
        if (!presentedRef.current && visibleRef.current) onCloseRef.current();
      }, 2800));
    } else if (wasVisible.current) {
      wasVisible.current = false;
      clearWatchdogs();
      const tryDismiss = () => Promise.resolve(sheetRef.current?.dismiss()).catch(() => {});
      tryDismiss();
      // A dropped dismiss strands a full-screen dialog over the app with the
      // host already believing it closed — the "nothing registers until I
      // reopen the app" report. One delayed retry clears it.
      watchdogs.current.push(setTimeout(() => {
        if (presentedRef.current && !visibleRef.current) tryDismiss();
      }, 700));
    }
    return clearWatchdogs;
  }, [visible]);

  // With the footer inside the scroll body it supplies its own spacing; the
  // bottom inset still keeps the last row above gesture/nav bars.
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
        // Presented late, after the host already closed it (present was in
        // flight when visible flipped): close it now, or it stays up over a
        // host that thinks it is gone.
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
      {/*
        Attempt 11. The footer is deliberately NOT TrueSheet's `footer` prop —
        that native overlay strands mid-sheet whenever a positionFooter() event
        is missed (attempts 1–9 all tuned that movement). Attempt 10 (1.14.2)
        made it the bottom row of a flex column and trusted the native content
        view to bound the column at the sheet's visible height; on real devices
        it does not — the column sizes to its children, so the footer row landed
        BELOW THE FOLD (Save missing on iOS, clipped on Android — the 1.14.2
        bug wave). Now the footer lives INSIDE the scroll body, after the
        content. Scroll content cannot end up outside the scrollport by
        construction — worst case the user scrolls to it — and it cannot move
        when the keyboard opens, which was the original spec. Do not "pin" this
        again without a device in hand.
      */}
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
  // No paddingHorizontal: the footer sits inside the scroll body, which
  // already insets 20 — doubling it squeezed the buttons.
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
});
