import React, {ReactNode, useCallback, useState, useRef, useEffect} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform} from 'react-native';
import Modal from 'react-native-modal';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [scrollViewHeight, setScrollViewHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [layoutReady, setLayoutReady] = useState(false);

  useEffect(() => {
    if (visible) {
      setLayoutReady(false);
      const timer = setTimeout(() => setLayoutReady(true), 300);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  const handleScrollTo = useCallback((p: {x?: number; y?: number; animated?: boolean}) => {
    scrollRef.current?.scrollTo(p);
  }, []);

  const handleScroll = useCallback((event: any) => {
    setScrollOffset(event.nativeEvent.contentOffset.y);
  }, []);

  const handleModalShow = useCallback(() => {
    setScrollOffset(0);
    scrollRef.current?.scrollTo({x: 0, y: 0, animated: false});
  }, []);

  const scrollOffsetMax = layoutReady ? Math.max(0, contentHeight - scrollViewHeight) : 9999;

  return (
    <Modal
      isVisible={visible}
      onModalShow={handleModalShow}
      onBackdropPress={onClose}
      onSwipeComplete={onClose}
      swipeDirection="down"
      style={{justifyContent: 'flex-end', margin: 0}}
      backdropOpacity={0.85}
      animationIn="slideInUp"
      animationOut="slideOutDown"
      animationInTiming={220}
      animationOutTiming={180}
      backdropTransitionInTiming={220}
      backdropTransitionOutTiming={180}
      useNativeDriver={false}
      useNativeDriverForBackdrop={false}
      avoidKeyboard={Platform.OS === 'ios'}
      propagateSwipe
      scrollTo={handleScrollTo}
      scrollOffset={scrollOffset}
      scrollOffsetMax={scrollOffsetMax}
    >
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
          contentContainerStyle={{paddingBottom: footer ? 24 : 24 + insets.bottom}}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          scrollEventThrottle={16}
          removeClippedSubviews={Platform.OS === 'ios'}
          bounces={Platform.OS === 'ios'}
          overScrollMode="never"
          onScroll={handleScroll}
          onLayout={event => setScrollViewHeight(event.nativeEvent.layout.height)}
          onContentSizeChange={(_, height) => setContentHeight(height)}
        >
          {children}
        </ScrollView>
        {footer && <View style={[s.footer, {borderTopColor: T.border, paddingBottom: 16 + insets.bottom}]}>{footer}</View>}
      </View>
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
