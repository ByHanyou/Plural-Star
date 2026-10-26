import React, {memo, useEffect, useRef, useState} from 'react';
import {View, PanResponder, TouchableOpacity} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {Text, TextInput} from './AppText';
import {useTranslation} from 'react-i18next';
import {clamp, colorHexToHsv, colorHsvToHex, hexOr, isValidHex, mergeHsv, normalizeHex} from '../utils';
import {useTheme} from '../themeContext';

const SV_STEP = 0.05;

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

export const ColorPicker = ({value, onChange}: {value: string; onChange: (hex: string) => void}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const safe = hexOr(value, '#FF0000');
  const [hsv, setHsv] = useState(() => colorHexToHsv(safe));
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
    const merged = mergeHsv(hsvRef.current, colorHexToHsv(n));
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
    const hex = colorHsvToHex(next.h, next.s, next.v);
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

  const hueHex = colorHsvToHex(hsv.h, 1, 1);
  const curHex = colorHsvToHex(hsv.h, hsv.s, hsv.v);
  const hexOk = isValidHex(normalizeHex(hexText)) || hexText.length < 2;

  return (
    <View>
      {locked && (
        <View pointerEvents="box-none" style={{position: 'absolute', left: 0, top: 0, right: 0, height: 160, zIndex: 2, alignItems: 'center', justifyContent: 'center'}}>
          <TouchableOpacity
            onPress={() => setLocked(false)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('lock.unlock')}
            hitSlop={{top: 6, bottom: 6}}
            style={{flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.65)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)'}}>
            <Text style={{fontSize: 14}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">🔒</Text>
            <Text style={{fontSize: 13, fontWeight: '600', color: '#FFFFFF'}}>{t('lock.unlock')}</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={{opacity: locked ? 0.45 : 1}}>
        <View
          onLayout={e => { const {width, height} = e.nativeEvent.layout; sqRef.current = {w: width, h: height}; setSqSize({w: width, h: height}); }}
          {...sqPan.panHandlers}
          accessible accessibilityRole="adjustable"
          accessibilityLabel={t('modal.color')}
          accessibilityValue={{text: t('modal.colorSquareValue', {hex: curHex, s: Math.round(hsv.s * 100), v: Math.round(hsv.v * 100)})}}
          accessibilityState={{disabled: locked}}
          accessibilityActions={[
            {name: 'increment', label: t('modal.brightnessUp')},
            {name: 'decrement', label: t('modal.brightnessDown')},
            {name: 'saturation_up', label: t('modal.saturationUp')},
            {name: 'saturation_down', label: t('modal.saturationDown')},
          ]}
          onAccessibilityAction={e => {
            if (lockedRef.current) return;
            const cur = hsvRef.current;
            switch (e.nativeEvent.actionName) {
              case 'increment': commit({...cur, v: clamp(cur.v + SV_STEP, 0, 1)}); break;
              case 'decrement': commit({...cur, v: clamp(cur.v - SV_STEP, 0, 1)}); break;
              case 'saturation_up': commit({...cur, s: clamp(cur.s + SV_STEP, 0, 1)}); break;
              case 'saturation_down': commit({...cur, s: clamp(cur.s - SV_STEP, 0, 1)}); break;
            }
          }}
          style={{width: '100%', height: 160, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: T.border}}>
          <SatValGradient hueHex={hueHex} />
          <View pointerEvents="none" style={{position: 'absolute', left: hsv.s * sqSize.w - 9, top: (1 - hsv.v) * sqSize.h - 9, width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#fff', backgroundColor: curHex}} />
        </View>

        <View
          onLayout={e => { const {width} = e.nativeEvent.layout; hueRef.current = width; setHueW(width); }}
          {...huePan.panHandlers}
          accessible accessibilityRole="adjustable" accessibilityLabel={t('modal.hue')} accessibilityValue={{text: `${Math.round(hsv.h)}°`}}
          accessibilityState={{disabled: locked}}
          accessibilityActions={[{name: 'increment', label: t('a11y.hueUp')}, {name: 'decrement', label: t('a11y.hueDown')}]}
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
          accessibilityHint={hexOk ? undefined : t('modal.invalidHex')}
          style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: hexOk ? T.border : T.danger, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, fontFamily: 'monospace'}} />
        <TouchableOpacity
          onPress={() => setLocked(l => !l)}
          accessibilityRole="switch"
          accessibilityLabel={t('modal.colorLock')}
          accessibilityState={{checked: locked}}
          hitSlop={{top: 4, bottom: 4, left: 4, right: 4}}
          style={{width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: locked ? T.accent : T.border, backgroundColor: T.surface}}>
          <Text style={{fontSize: 16}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{locked ? '🔒' : '🔓'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
