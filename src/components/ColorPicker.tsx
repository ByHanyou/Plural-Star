import React, {memo, useEffect, useRef, useState} from 'react';
import {View, PanResponder, TouchableOpacity} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {Text, TextInput} from './AppText';
import {useTranslation} from 'react-i18next';
import {isValidHex, normalizeHex} from '../utils';
import type {ThemeColors} from '../theme';

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

const SatValGradient = memo(({hueHex}: {hueHex: string}) => (
  <View pointerEvents="none" style={{position: 'absolute', left: 0, top: 0, right: 0, bottom: 0}}>
    <LinearGradient colors={['#FFFFFF', hueHex]} start={{x: 0, y: 0.5}} end={{x: 1, y: 0.5}} style={{flex: 1}} />
    <LinearGradient colors={['rgba(0,0,0,0)', '#000000']} start={{x: 0.5, y: 0}} end={{x: 0.5, y: 1}} style={{position: 'absolute', left: 0, top: 0, right: 0, bottom: 0}} />
  </View>
));

const HUE_STOPS = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'];
const HueGradient = memo(() => (
  <LinearGradient
    pointerEvents="none"
    colors={HUE_STOPS}
    start={{x: 0, y: 0.5}}
    end={{x: 1, y: 0.5}}
    style={{position: 'absolute', left: 0, top: 0, right: 0, bottom: 0}}
  />
));

export const ColorPicker = ({value, onChange, T}: {value: string; onChange: (hex: string) => void; T: ThemeColors}) => {
  const {t} = useTranslation();
  const safe = isValidHex(normalizeHex(value || '')) ? normalizeHex(value) : '#FF0000';
  const [hsv, setHsv] = useState(() => hexToHsv(safe));
  const [hexText, setHexText] = useState(safe.toUpperCase());
  const [sqSize, setSqSize] = useState({w: 0, h: 0});
  const [hueW, setHueW] = useState(0);
  const [locked, setLocked] = useState(true);
  const lockedRef = useRef(locked); lockedRef.current = locked;

  const hsvRef = useRef(hsv); hsvRef.current = hsv;
  const sqRef = useRef({w: 0, h: 0});
  const hueRef = useRef(0);
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const emittedRef = useRef<string[]>([safe.toUpperCase()]);

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
    emittedRef.current = [n.toUpperCase()];
  };

  useEffect(() => {
    const n = normalizeHex(value || '');
    if (!isValidHex(n)) return;
    const idx = emittedRef.current.indexOf(n.toUpperCase());
    if (idx >= 0) {
      emittedRef.current.splice(0, idx);
      return;
    }
    adopt(n);
    setHexText(n.toUpperCase());
  }, [value]);

  const commit = (next: {h: number; s: number; v: number}) => {
    hsvRef.current = next;
    setHsv(next);
    const hex = hsvToHex(next.h, next.s, next.v);
    emittedRef.current.push(hex.toUpperCase());
    if (emittedRef.current.length > 64) emittedRef.current.splice(0, emittedRef.current.length - 64);
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
    onStartShouldSetPanResponder: () => !lockedRef.current,
    onMoveShouldSetPanResponder: () => !lockedRef.current,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: e => { if (!lockedRef.current) applySq(e.nativeEvent.locationX, e.nativeEvent.locationY); },
    onPanResponderMove: e => { if (!lockedRef.current) applySq(e.nativeEvent.locationX, e.nativeEvent.locationY); },
  })).current;

  const huePan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !lockedRef.current,
    onMoveShouldSetPanResponder: () => !lockedRef.current,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: e => { if (!lockedRef.current) applyHue(e.nativeEvent.locationX); },
    onPanResponderMove: e => { if (!lockedRef.current) applyHue(e.nativeEvent.locationX); },
  })).current;

  const onHexChange = (val: string) => {
    setHexText(val);
    const n = normalizeHex(val);
    if (isValidHex(n)) {
      adopt(n);
      onChangeRef.current(n.toUpperCase());
    }
  };

  const hueHex = hsvToHex(hsv.h, 1, 1);
  const curHex = hsvToHex(hsv.h, hsv.s, hsv.v);

  return (
    <View>
      <View style={{opacity: locked ? 0.45 : 1}}>
        <View
          onLayout={e => { const {width, height} = e.nativeEvent.layout; sqRef.current = {w: width, h: height}; setSqSize({w: width, h: height}); }}
          {...sqPan.panHandlers}
          accessibilityRole="adjustable"
          accessibilityLabel={t('modal.color')}
          accessibilityValue={{text: curHex}}
          accessibilityState={{disabled: locked}}
          style={{width: '100%', height: 160, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: T.border}}>
          <SatValGradient hueHex={hueHex} />
          <View pointerEvents="none" style={{position: 'absolute', left: hsv.s * sqSize.w - 9, top: (1 - hsv.v) * sqSize.h - 9, width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#fff', backgroundColor: curHex}} />
        </View>

        <View
          onLayout={e => { const {width} = e.nativeEvent.layout; hueRef.current = width; setHueW(width); }}
          {...huePan.panHandlers}
          accessibilityRole="adjustable" accessibilityLabel={t('modal.hue')} accessibilityValue={{text: `${Math.round(hsv.h)}°`}}
          accessibilityState={{disabled: locked}}
          accessibilityActions={[{name: 'increment'}, {name: 'decrement'}]}
          onAccessibilityAction={e => { if (lockedRef.current) return; const cur = hsvRef.current; const step = e.nativeEvent.actionName === 'increment' ? 10 : -10; commit({...cur, h: (cur.h + step + 360) % 360}); }}
          style={{height: 18, borderRadius: 9, overflow: 'hidden', marginTop: 14, borderWidth: 1, borderColor: T.border}}>
          <HueGradient />
          <View pointerEvents="none" style={{position: 'absolute', left: (hsv.h / 360) * hueW - 9, top: -1, width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#fff', backgroundColor: hueHex}} />
        </View>
      </View>

      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14}}>
        <View style={{width: 32, height: 32, borderRadius: 8, backgroundColor: curHex, borderWidth: 1, borderColor: T.border}} />
        <TextInput value={hexText} onChangeText={onHexChange} placeholder="#000000" placeholderTextColor={T.muted} maxLength={7} autoCapitalize="characters" autoCorrect={false}
          accessibilityLabel={t('modal.color')}
          style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: isValidHex(normalizeHex(hexText)) || hexText.length < 2 ? T.border : T.danger, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, fontFamily: 'monospace'}} />
        <TouchableOpacity
          onPress={() => setLocked(l => !l)}
          accessibilityRole="switch"
          accessibilityLabel={t('modal.colorLock')}
          accessibilityState={{checked: locked}}
          style={{width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: locked ? T.accent : T.border, backgroundColor: T.surface}}>
          <Text style={{fontSize: 16}}>{locked ? '🔒' : '🔓'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
