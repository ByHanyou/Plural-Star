// src/components/Sheet.tsx
import React, {ReactNode, useRef, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, NativeSyntheticEvent, NativeScrollEvent} from 'react-native';
import Modal from 'react-native-modal';
import {Fonts} from '../theme';

interface SheetProps {
  visible: boolean;
  title: string;
  theme: any;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export const Sheet = ({visible, title, theme: T, onClose, children, footer}: SheetProps) => {
  const scrollRef = useRef<ScrollView>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  const handleOnScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollOffset(e.nativeEvent.contentOffset.y);
  };

  const handleScrollTo = (p: {x?: number; y?: number; animated?: boolean}) => {
    scrollRef.current?.scrollTo(p);
  };

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onSwipeComplete={onClose}
      swipeDirection="down"
      style={{justifyContent: 'flex-end', margin: 0}}
      backdropOpacity={0.85}
      propagateSwipe
      scrollTo={handleScrollTo}
      scrollOffset={scrollOffset}
      scrollOffsetMax={400}
      onModalShow={() => {
        // Reset scroll position every time the modal opens
        scrollRef.current?.scrollTo({y: 0, animated: false});
        setScrollOffset(0);
      }}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.sheet, {backgroundColor: T.card, borderColor: T.border}]}>
          <View style={[s.handle, {backgroundColor: T.borderLt}]} />
          <View style={[s.header, {borderBottomColor: T.border}]}>
            <Text style={[s.title, {color: T.text}]}>{title}</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={s.closeBtn}>
              <Text style={[s.closeX, {color: T.dim}]}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            ref={scrollRef}
            style={s.body}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScroll={handleOnScroll}
            scrollEventThrottle={16}
          >
            {children}
            <View style={{height: 16}} />
          </ScrollView>
          {footer && <View style={[s.footer, {borderTopColor: T.border}]}>{footer}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const s = StyleSheet.create({
  sheet: {borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, maxHeight: '92%'},
  handle: {width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 6},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1},
  title: {fontFamily: Fonts.display, fontSize: 22, fontWeight: '600', fontStyle: 'italic'},
  closeBtn: {padding: 4},
  closeX: {fontSize: 16},
  body: {paddingHorizontal: 20, paddingTop: 16},
  footer: {flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1},
});
