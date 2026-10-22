import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {View, FlatList, TouchableOpacity, AccessibilityInfo} from 'react-native';
import {Text} from './AppText';
import {useTranslation} from 'react-i18next';
import {useTheme} from '../themeContext';
import {ColorChoice, colorChoices} from '../utils';
import {useCustomColors} from '../hooks/useCustomColors';
import {logError} from '../utils/log';

const ColorCarouselInner = ({value, onChange, size = 30}: {value: string; onChange: (hex: string) => void; size?: number}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const [customColors] = useCustomColors();
  const [srOn, setSrOn] = useState(false);
  const listRef = useRef<FlatList<ColorChoice>>(null);
  const jumpingRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setSrOn).catch(e => logError('a11y', e));
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setSrOn);
    return () => sub.remove();
  }, []);

  const cur = (value || '').toUpperCase();

  const entries = useMemo(() => colorChoices(customColors, value, t), [customColors, value, t]);

  const itemW = size + 8;
  const blockW = entries.length * itemW;
  const data = useMemo(() => (srOn ? entries : [...entries, ...entries, ...entries]), [entries, srOn]);
  const selIdx = Math.max(0, entries.findIndex(e => e.hex === cur));
  const selectedLabel = entries.find(e => e.hex === cur)?.label || '';

  const renderItem = useCallback(
    ({item}: {item: ColorChoice}) => {
      const selected = item.hex === cur;
      return (
        <TouchableOpacity
          onPress={() => onChangeRef.current(item.hex)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{selected}}
          accessibilityLabel={item.label}
          hitSlop={{top: 4, bottom: 4}}
          style={{width: itemW, height: size + 10, alignItems: 'center', justifyContent: 'center'}}>
          <View style={{width: size, height: size, borderRadius: size / 2, backgroundColor: item.hex, borderWidth: 2, borderColor: selected ? '#fff' : T.border}} />
        </TouchableOpacity>
      );
    },
    [cur, itemW, size, T.border],
  );

  const onScroll = (x: number) => {
    if (srOn || jumpingRef.current || blockW <= 0) return;
    const shift = x < blockW * 0.25 ? blockW : x > blockW * 1.75 ? -blockW : 0;
    if (!shift) return;
    jumpingRef.current = true;
    listRef.current?.scrollToOffset({offset: x + shift, animated: false});
    setTimeout(() => { jumpingRef.current = false; }, 50);
  };

  return (
    <View>
      <FlatList
        ref={listRef}
        horizontal
        data={data}
        keyExtractor={(_, i) => String(i)}
        showsHorizontalScrollIndicator={false}
        snapToInterval={itemW}
        decelerationRate="fast"
        initialScrollIndex={srOn ? Math.max(0, selIdx - 2) : entries.length + selIdx}
        getItemLayout={(_, i) => ({length: itemW, offset: itemW * i, index: i})}
        onScroll={e => onScroll(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={64}
        windowSize={5}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        renderItem={renderItem}
      />
      {selectedLabel ? (
        <Text style={{fontSize: 11, color: T.muted, marginTop: 4}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{selectedLabel}</Text>
      ) : null}
    </View>
  );
};

export const ColorCarousel = React.memo(
  ColorCarouselInner,
  (prev, next) => prev.value === next.value && prev.size === next.size,
);
