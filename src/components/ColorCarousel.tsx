import React, {useEffect, useMemo, useRef, useState} from 'react';
import {View, FlatList, TouchableOpacity, AccessibilityInfo} from 'react-native';
import {Text} from './AppText';
import {useTranslation} from 'react-i18next';
import type {ThemeColors} from '../theme';
import {PRESET_COLORS, PresetColor, presetColorName, colorName, normalizeCustomColors} from '../utils';
import {store, KEYS} from '../storage';

interface CarouselEntry {
  hex: string;
  label: string;
  selected: boolean;
}

const ColorCarouselInner = ({value, onChange, T, size = 30}: {value: string; onChange: (hex: string) => void; T: ThemeColors; size?: number}) => {
  const {t} = useTranslation();
  const [customColors, setCustomColors] = useState<string[]>([]);
  const [srOn, setSrOn] = useState(false);
  const listRef = useRef<FlatList<CarouselEntry>>(null);
  const jumpingRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    store.get<string[]>(KEYS.customColors, []).then(v => setCustomColors(normalizeCustomColors(v)));
  }, []);

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setSrOn);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setSrOn);
    return () => sub.remove();
  }, []);

  const cur = (value || '').toUpperCase();

  const entries = useMemo<CarouselEntry[]>(() => {
    const out: CarouselEntry[] = [];
    const seen = new Set<string>();
    for (const p of PRESET_COLORS as PresetColor[]) {
      out.push({hex: p.hex, label: presetColorName(p, t), selected: p.hex === cur});
      seen.add(p.hex);
    }
    customColors.forEach((c, i) => {
      if (!c || seen.has(c)) return;
      out.push({hex: c, label: t('colors.customSlot', {n: i + 1}), selected: c === cur});
      seen.add(c);
    });
    if (cur && /^#[0-9A-F]{6}$/.test(cur) && !seen.has(cur)) {
      out.unshift({hex: cur, label: colorName(cur, t), selected: true});
    }
    return out;
  }, [customColors, cur, t]);

  const itemW = size + 8;
  const blockW = entries.length * itemW;
  const data = useMemo(() => (srOn ? entries : [...entries, ...entries, ...entries]), [entries, srOn]);
  const selIdx = Math.max(0, entries.findIndex(e => e.selected));
  const selectedLabel = entries.find(e => e.selected)?.label || '';

  const onScroll = (x: number) => {
    if (srOn || jumpingRef.current || blockW <= 0) return;
    if (x < blockW * 0.25) {
      jumpingRef.current = true;
      listRef.current?.scrollToOffset({offset: x + blockW, animated: false});
      setTimeout(() => { jumpingRef.current = false; }, 50);
    } else if (x > blockW * 1.75) {
      jumpingRef.current = true;
      listRef.current?.scrollToOffset({offset: x - blockW, animated: false});
      setTimeout(() => { jumpingRef.current = false; }, 50);
    }
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
        renderItem={({item}) => (
          <TouchableOpacity
            onPress={() => onChangeRef.current(item.hex)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{selected: item.selected}}
            accessibilityLabel={item.label}
            style={{width: itemW, height: size + 10, alignItems: 'center', justifyContent: 'center'}}>
            <View style={{width: size, height: size, borderRadius: size / 2, backgroundColor: item.hex, borderWidth: 2, borderColor: item.selected ? '#fff' : T.border}} />
          </TouchableOpacity>
        )}
      />
      {selectedLabel ? (
        <Text style={{fontSize: 11, color: T.muted, marginTop: 4}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{selectedLabel}</Text>
      ) : null}
    </View>
  );
};

export const ColorCarousel = React.memo(
  ColorCarouselInner,
  (prev, next) => prev.value === next.value && prev.T === next.T && prev.size === next.size,
);
