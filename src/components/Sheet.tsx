import React, {ReactNode, useEffect, useRef, useState} from 'react';
import {View, ScrollView, TouchableOpacity, StyleSheet, LayoutChangeEvent, Platform} from 'react-native';
import {KeyboardAwareScrollView, KeyboardStickyView} from 'react-native-keyboard-controller';
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

const isIOS = Platform.OS === 'ios';
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
  const [footerHeight, setFooterHeight] = useState(0);
  const onFooterLayout = (e: LayoutChangeEvent) => setFooterHeight(e.nativeEvent.layout.height);

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

  const basePaddingBottom = footer
    ? (footerHeight > 0 ? footerHeight + 24 : 96)
    : 56 + bottomInset;
  const scrollPaddingBottom = basePaddingBottom;

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
      footer={
        footer ? (
          isIOS ? (
            <View
              onLayout={onFooterLayout}
              style={[s.footer, {borderTopColor: T.border, backgroundColor: T.card, paddingBottom: 16 + bottomInset}]}
            >
              {footer}
            </View>
          ) : (
            <KeyboardStickyView offset={{closed: 0, opened: bottomInset}}>
              <View
                onLayout={onFooterLayout}
                style={[s.footer, {borderTopColor: T.border, backgroundColor: T.card, paddingBottom: 16 + bottomInset}]}
              >
                {footer}
              </View>
            </KeyboardStickyView>
          )
        ) : undefined
      }
    >
      {isIOS ? (
        <ScrollView
          ref={scrollRef}
          style={s.body}
          contentContainerStyle={{paddingBottom: scrollPaddingBottom}}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {children}
        </ScrollView>
      ) : (
        <KeyboardAwareScrollView
          ref={scrollRef}
          style={s.body}
          contentContainerStyle={{paddingBottom: scrollPaddingBottom}}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          bottomOffset={footer ? footerHeight + 24 : 24}
          nestedScrollEnabled
        >
          {children}
        </KeyboardAwareScrollView>
      )}
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
});
