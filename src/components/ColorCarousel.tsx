import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {View, FlatList, TouchableOpacity, AccessibilityInfo} from 'react-native';
import {Text} from './AppText';
import {useTranslation} from 'react-i18next';
import type {ThemeColors} from '../theme';
import {PRESET_COLORS, PresetColor, presetColorName, colorName, normalizeCustomColors} from '../utils';
import {store, KEYS} from '../storage';

interface CarouselEntry {
  hex: string;
  label: string;
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

  // Built WITHOUT the selected value in scope: tapping a swatch must not rebuild
  // 116 entries + 92 translation lookups. Selection is applied at render time.
  const baseEntries = useMemo<CarouselEntry[]>(() => {
    const out: CarouselEntry[] = [];
    const seen = new Set<string>();
    for (const p of PRESET_COLORS as PresetColor[]) {
      out.push({hex: p.hex, label: presetColorName(p, t)});
      seen.add(p.hex);
    }
    customColors.forEach((c, i) => {
      if (!c || seen.has(c)) return;
      out.push({hex: c, label: t('colors.customSlot', {n: i + 1})});
      seen.add(c);
    });
    return out;
  }, [customColors, t]);

  const knownHexes = useMemo(() => new Set(baseEntries.map(e => e.hex)), [baseEntries]);
  const strayHex = cur && /^#[0-9A-F]{6}$/.test(cur) && !knownHexes.has(cur) ? cur : '';

  const entries = useMemo<CarouselEntry[]>(
    () => (strayHex ? [{hex: strayHex, label: colorName(strayHex, t)}, ...baseEntries] : baseEntries),
    [strayHex, baseEntries, t],
  );

  const itemW = size + 8;
  const blockW = entries.length * itemW;
  const data = useMemo(() => (srOn ? entries : [...entries, ...entries, ...entries]), [entries, srOn]);
  const selIdx = Math.max(0, entries.findIndex(e => e.hex === cur));
  const selectedLabel = entries.find(e => e.hex === cur)?.label || '';

  const renderItem = useCallback(
    ({item}: {item: CarouselEntry}) => {
      const selected = item.hex === cur;
      return (
        <TouchableOpacity
          onPress={() => onChangeRef.current(item.hex)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{selected}}
          accessibilityLabel={item.label}
          style={{width: itemW, height: size + 10, alignItems: 'center', justifyContent: 'center'}}>
          <View style={{width: size, height: size, borderRadius: size / 2, backgroundColor: item.hex, borderWidth: 2, borderColor: selected ? '#fff' : T.border}} />
        </TouchableOpacity>
      );
    },
    [cur, itemW, size, T.border],
  );

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
        windowSize={5}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        removeClippedSubviews
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
  (prev, next) => prev.value === next.value && prev.T === next.T && prev.size === next.size,
);
