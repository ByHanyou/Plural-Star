import React, {ReactNode, useEffect, useRef, useState} from 'react';
import {View, TouchableOpacity, ScrollView, StyleSheet, LayoutChangeEvent, Platform, Keyboard} from 'react-native';
import {Text} from './AppText';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {TrueSheet} from '@lodev09/react-native-true-sheet';
import {Fonts} from '../theme';
import {useTranslation} from 'react-i18next';

interface SheetProps {
  visible: boolean;
  title: string;
  theme: any;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

const isIPad = Platform.OS === 'ios' && Platform.isPad;

const ANDROID_NAV_BAR_FLOOR = 24;

export const Sheet = ({visible, title, theme: T, onClose, children, footer}: SheetProps) => {
  const {t} = useTranslation();
  const sheetRef = useRef<TrueSheet>(null);
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const rawBottomInset = isIPad ? 0 : insets.bottom;
  const bottomInset = Platform.OS === 'android'
    ? Math.max(rawBottomInset, ANDROID_NAV_BAR_FLOOR)
    : rawBottomInset;
  const [footerHeight, setFooterHeight] = useState(0);
  const onFooterLayout = (e: LayoutChangeEvent) => setFooterHeight(e.nativeEvent.layout.height);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

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
  const scrollPaddingBottom = basePaddingBottom + keyboardHeight;

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
          <Text style={[s.title, {color: T.text}]} accessibilityRole="header">{title}</Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')} style={s.closeBtn}>
            <Text style={[s.closeX, {color: T.dim}]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✕</Text>
          </TouchableOpacity>
        </View>
      }
      footer={
        footer ? (
          <View
            onLayout={onFooterLayout}
            style={[s.footer, {borderTopColor: T.border, backgroundColor: T.card, paddingBottom: 16 + bottomInset}]}
          >
            {footer}
          </View>
        ) : undefined
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
});
