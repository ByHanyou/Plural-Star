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
  useEffect(() => {
    if (visible) {
      Promise.resolve(sheetRef.current?.present()).catch(() => {});
      wasVisible.current = true;
    } else if (wasVisible.current) {
      Promise.resolve(sheetRef.current?.dismiss()).catch(() => {});
      wasVisible.current = false;
    }
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
      onDidDismiss={onClose}
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
