import React, {ReactNode, useEffect, useRef, useState} from 'react';
import {View, Text, TouchableOpacity, ScrollView, StyleSheet, LayoutChangeEvent, Platform} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {TrueSheet} from '@lodev09/react-native-true-sheet';
import {Fonts} from '../theme';

interface SheetProps {
  visible: boolean;
  title: string;
  theme: any;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

const isIPad = Platform.OS === 'ios' && Platform.isPad;

export const Sheet = ({visible, title, theme: T, onClose, children, footer}: SheetProps) => {
  const sheetRef = useRef<TrueSheet>(null);
  const insets = useSafeAreaInsets();
  const bottomInset = isIPad ? 0 : insets.bottom;
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

  const scrollPaddingBottom = footer
    ? (footerHeight > 0 ? footerHeight + 24 : 96)
    : 56 + bottomInset;

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
          <Text style={[s.title, {color: T.text}]}>{title}</Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={s.closeBtn}>
            <Text style={[s.closeX, {color: T.dim}]}>✕</Text>
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
        style={s.body}
        contentContainerStyle={{paddingBottom: scrollPaddingBottom}}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
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
