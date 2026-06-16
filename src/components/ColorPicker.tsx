import React, {useEffect, useMemo, useRef, useState} from 'react';
import {View, PanResponder} from 'react-native';
import {Text, TextInput} from './AppText';
import {useTranslation} from 'react-i18next';
import {isValidHex, normalizeHex} from '../utils';

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const hexToRgb = (hex: string) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : (h + '000000').slice(0, 6);
  const n = parseInt(full, 16) || 0;
  return {r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255};
};

const rgbToHsv = (r: number, g: number, b: number) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return {h, s: max === 0 ? 0 : d / max, v: max};
};

const hsvToRgb = (h: number, s: number, v: number) => {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) {r = c; g = x;} else if (h < 120) {r = x; g = c;} else if (h < 180) {g = c; b = x;}
  else if (h < 240) {g = x; b = c;} else if (h < 300) {r = x; b = c;} else {r = c; b = x;}
  return {r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255)};
};

const toHex2 = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
const hsvToHex = (h: number, s: number, v: number) => {
  const {r, g, b} = hsvToRgb(h, s, v);
  return ('#' + toHex2(r) + toHex2(g) + toHex2(b)).toUpperCase();
};
const hexToHsv = (hex: string) => { const {r, g, b} = hexToRgb(hex); return rgbToHsv(r, g, b); };

const SAT_N = 60;   // vertical strips across saturation (left→right)
const VAL_N = 64;   // horizontal black-overlay strips for value (top→bottom)
const HUE_N = 72;   // strips across the hue bar
const KNOB_SIZE = 18;
const KNOB_RADIUS = KNOB_SIZE / 2;
const VAL_ALPHAS = Array.from({length: VAL_N}, (_, i) => i / (VAL_N - 1));
const HUE_STRIPS = Array.from({length: HUE_N}, (_, i) => hsvToHex((i / (HUE_N - 1)) * 360, 1, 1));

export const ColorPicker = ({value, onChange, T}: {value: string; onChange: (hex: string) => void; T: any}) => {
  const {t} = useTranslation();
  const safe = isValidHex(normalizeHex(value || '')) ? normalizeHex(value) : '#FF0000';
  const [hsv, setHsv] = useState(() => hexToHsv(safe));
  const [hexText, setHexText] = useState(safe.toUpperCase());
  const [sqSize, setSqSize] = useState({w: 0, h: 0});
  const [hueW, setHueW] = useState(0);

  const hsvRef = useRef(hsv); hsvRef.current = hsv;
  const sqRef = useRef({w: 0, h: 0});
  const hueRef = useRef(0);
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  // the exact hex we last emitted, so we can ignore the parent echoing it back to us
  const lastHexRef = useRef(safe.toUpperCase());

  // Adopt an external/typed hex while preserving hue (and saturation for black),
  // which a grayscale/white/black hex cannot represent on its own.
  const adopt = (n: string) => {
    const nh = hexToHsv(n);
    const prev = hsvRef.current;
    const merged = {
      h: nh.s === 0 ? prev.h : nh.h,
      s: (nh.s === 0 && nh.v === 0) ? prev.s : nh.s,
      v: nh.v,
    };
    hsvRef.current = merged;
    setHsv(merged);
    lastHexRef.current = n.toUpperCase();
  };

  useEffect(() => {
    const n = normalizeHex(value || '');
    if (!isValidHex(n)) return;
    if (n.toUpperCase() === lastHexRef.current) return; // our own echo — ignore
    adopt(n);
    setHexText(n.toUpperCase());
  }, [value]);

  const commit = (next: {h: number; s: number; v: number}) => {
    hsvRef.current = next;
    setHsv(next);
    const hex = hsvToHex(next.h, next.s, next.v);
    lastHexRef.current = hex.toUpperCase();
    setHexText(hex);
    onChangeRef.current(hex);
  };

  const applySq = (x: number, y: number) => {
    const {w, h} = sqRef.current;
    if (w <= 0 || h <= 0) return;
    commit({h: hsvRef.current.h, s: clamp(x / w, 0, 1), v: clamp(1 - y / h, 0, 1)});
  };
  const applyHue = (x: number) => {
    const w = hueRef.current;
    if (w <= 0) return;
    commit({...hsvRef.current, h: clamp(x / w, 0, 1) * 360});
  };

  const sqPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => applySq(e.nativeEvent.locationX, e.nativeEvent.locationY),
    onPanResponderMove: e => applySq(e.nativeEvent.locationX, e.nativeEvent.locationY),
  })).current;

  const huePan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => applyHue(e.nativeEvent.locationX),
    onPanResponderMove: e => applyHue(e.nativeEvent.locationX),
  })).current;

  const onHexChange = (val: string) => {
    setHexText(val);
    const n = normalizeHex(val);
    if (isValidHex(n)) {
      adopt(n);
      onChangeRef.current(n.toUpperCase());
    }
  };

  // vertical saturation strips for the current hue (white → full hue), at value 1
  const satStrips = useMemo(
    () => Array.from({length: SAT_N}, (_, i) => hsvToHex(hsv.h, i / (SAT_N - 1), 1)),
    [hsv.h],
  );

  const hueHex = hsvToHex(hsv.h, 1, 1);
  const curHex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const sqLeft = clamp(hsv.s * sqSize.w - KNOB_RADIUS, 0, Math.max(0, sqSize.w - KNOB_SIZE));
  const sqTop = clamp((1 - hsv.v) * sqSize.h - KNOB_RADIUS, 0, Math.max(0, sqSize.h - KNOB_SIZE));
  const hueRatio = Math.min(hsv.h, 359.999) / 360;
  const hueLeft = clamp(hueRatio * hueW - KNOB_RADIUS, 0, Math.max(0, hueW - KNOB_SIZE));

  return (
    <View>
      <View
        onLayout={e => { const {width, height} = e.nativeEvent.layout; sqRef.current = {w: width, h: height}; setSqSize({w: width, h: height}); }}
        {...sqPan.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel={t('modal.color')}
        accessibilityValue={{text: curHex}}
        style={{width: '100%', height: 160, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: T.border}}>
        <View style={{position: 'absolute', left: 0, top: 0, width: sqSize.w, height: sqSize.h, flexDirection: 'row'}} pointerEvents="none">
          {satStrips.map((c, i) => (<View key={i} style={{width: Math.round((i + 1) * sqSize.w / SAT_N) - Math.round(i * sqSize.w / SAT_N), height: sqSize.h, backgroundColor: c}} />))}
        </View>
        <View style={{position: 'absolute', left: 0, top: 0, width: sqSize.w, height: sqSize.h, flexDirection: 'column'}} pointerEvents="none">
          {VAL_ALPHAS.map((a, i) => (<View key={i} style={{width: sqSize.w, height: Math.round((i + 1) * sqSize.h / VAL_N) - Math.round(i * sqSize.h / VAL_N), backgroundColor: `rgba(0,0,0,${a})`}} />))}
        </View>
        <View pointerEvents="none" style={{position: 'absolute', left: sqLeft, top: sqTop, width: KNOB_SIZE, height: KNOB_SIZE, borderRadius: KNOB_RADIUS, borderWidth: 2, borderColor: '#fff', backgroundColor: curHex}} />
      </View>

      <View
        onLayout={e => { const {width} = e.nativeEvent.layout; hueRef.current = width; setHueW(width); }}
        {...huePan.panHandlers}
        accessibilityRole="adjustable" accessibilityLabel={t('modal.hue')} accessibilityValue={{text: `${Math.round(hsv.h)}°`}}
        accessibilityActions={[{name: 'increment'}, {name: 'decrement'}]}
        onAccessibilityAction={e => { const cur = hsvRef.current; const step = e.nativeEvent.actionName === 'increment' ? 10 : -10; commit({...cur, h: (cur.h + step + 360) % 360}); }}
        style={{height: 18, borderRadius: 9, overflow: 'hidden', marginTop: 14, borderWidth: 1, borderColor: T.border}}>
        <View style={{position: 'absolute', left: 0, top: 0, width: hueW, height: 18, flexDirection: 'row'}} pointerEvents="none">
          {HUE_STRIPS.map((c, i) => (<View key={i} style={{width: Math.round((i + 1) * hueW / HUE_N) - Math.round(i * hueW / HUE_N), height: 18, backgroundColor: c}} />))}
        </View>
        <View pointerEvents="none" style={{position: 'absolute', left: hueLeft, top: -1, width: KNOB_SIZE, height: KNOB_SIZE, borderRadius: KNOB_RADIUS, borderWidth: 2, borderColor: '#fff', backgroundColor: hueHex}} />
      </View>

      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14}}>
        <View style={{width: 32, height: 32, borderRadius: 8, backgroundColor: curHex, borderWidth: 1, borderColor: T.border}} />
        <TextInput value={hexText} onChangeText={onHexChange} placeholder="#000000" placeholderTextColor={T.muted} maxLength={7} autoCapitalize="characters" autoCorrect={false}
          accessibilityLabel={t('modal.color')}
          style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: isValidHex(normalizeHex(hexText)) || hexText.length < 2 ? T.border : T.danger, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, fontFamily: 'monospace'}} />
      </View>
    </View>
  );
};
