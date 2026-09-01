import React, {useEffect, useRef, useState} from 'react';
import {Modal, View, Image, PanResponder, TouchableOpacity} from 'react-native';
import ImageEditor from '@react-native-community/image-editor';
import {Text} from './AppText';
import i18n from '../i18n/i18n';
import {fontScale} from '../theme';
import type {ThemeColors} from '../theme';

// The Edit half of the picture upload choice: a freeform crop over the picked
// image, then @react-native-community/image-editor does the actual pixel
// crop. The cropped file feeds the exact same save/resize path the Auto
// option uses, so storage stays identical either way.
//
// Promise bridge instead of per-call-site modals: five pick sites share one
// host mounted in App. RN Modal presents natively above TrueSheet (the View
// Photo modal is the shipped precedent), so tree position does not matter.

interface CropSource {
  uri: string;
  width?: number;
  height?: number;
}

interface CropRequest {
  src: CropSource;
  resolve: (r: {uri: string} | null) => void;
}

let hostOpen: ((req: CropRequest) => void) | null = null;

/** Resolves with the cropped file's uri, or null if the user backs out (or
 *  the host is not mounted, which callers must treat as cancel). */
export const requestImageCrop = (src: CropSource): Promise<{uri: string} | null> =>
  new Promise(resolve => {
    if (!hostOpen) { resolve(null); return; }
    hostOpen({src, resolve});
  });

const HANDLE = 28;
const MIN_SIZE = 40;

type Corner = 'tl' | 'tr' | 'bl' | 'br';

interface Rect { x: number; y: number; w: number; h: number; }

export const ImageCropHost = ({theme: T}: {theme: ThemeColors}) => {
  const fs = fontScale(T);
  const [req, setReq] = useState<CropRequest | null>(null);
  const [natural, setNatural] = useState<{w: number; h: number} | null>(null);
  const [box, setBox] = useState<{w: number; h: number} | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  // Gestures mutate the ref and mirror to state; reading state inside a
  // PanResponder created once would see the mount-time value forever.
  const rectRef = useRef<Rect | null>(null);
  const dispRef = useRef<Rect | null>(null);
  const startRef = useRef<Rect | null>(null);

  useEffect(() => {
    hostOpen = (r: CropRequest) => {
      setNatural(null); setBox(null); setRect(null); rectRef.current = null; setBusy(false);
      setReq(r);
      if (r.src.width && r.src.height) {
        setNatural({w: r.src.width, h: r.src.height});
      } else {
        Image.getSize(r.src.uri, (w, h) => setNatural({w, h}), () => { r.resolve(null); setReq(null); });
      }
    };
    return () => { hostOpen = null; };
  }, []);

  // Displayed image rect: contain fit inside the measured box.
  const disp: Rect | null = natural && box ? (() => {
    const scale = Math.min(box.w / natural.w, box.h / natural.h);
    const w = natural.w * scale;
    const h = natural.h * scale;
    return {x: (box.w - w) / 2, y: (box.h - h) / 2, w, h};
  })() : null;
  dispRef.current = disp;

  useEffect(() => {
    if (disp && !rectRef.current) {
      const full = {x: disp.x, y: disp.y, w: disp.w, h: disp.h};
      rectRef.current = full;
      setRect(full);
    }
    // Depends on the derived rect being freshly computable; rect seeds once
    // per request because hostOpen nulled it.
  }, [disp?.x, disp?.y, disp?.w, disp?.h]); // eslint-disable-line react-hooks/exhaustive-deps

  const clampRect = (r: Rect): Rect => {
    const d = dispRef.current;
    if (!d) return r;
    const w = Math.max(MIN_SIZE, Math.min(r.w, d.w));
    const h = Math.max(MIN_SIZE, Math.min(r.h, d.h));
    const x = Math.max(d.x, Math.min(r.x, d.x + d.w - w));
    const y = Math.max(d.y, Math.min(r.y, d.y + d.h - h));
    return {x, y, w, h};
  };

  const makeResponder = (mode: 'move' | Corner) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { startRef.current = rectRef.current; },
    onPanResponderMove: (_e, g) => {
      const s = startRef.current;
      const d = dispRef.current;
      if (!s || !d) return;
      let next: Rect;
      if (mode === 'move') {
        next = clampRect({...s, x: s.x + g.dx, y: s.y + g.dy});
      } else {
        let {x, y, w, h} = s;
        if (mode === 'tl' || mode === 'bl') { x = s.x + g.dx; w = s.w - g.dx; }
        if (mode === 'tr' || mode === 'br') { w = s.w + g.dx; }
        if (mode === 'tl' || mode === 'tr') { y = s.y + g.dy; h = s.h - g.dy; }
        if (mode === 'bl' || mode === 'br') { h = s.h + g.dy; }
        // Left/top edges stop at MIN_SIZE by pinning the opposite edge.
        if (w < MIN_SIZE) { if (mode === 'tl' || mode === 'bl') x = s.x + s.w - MIN_SIZE; w = MIN_SIZE; }
        if (h < MIN_SIZE) { if (mode === 'tl' || mode === 'tr') y = s.y + s.h - MIN_SIZE; h = MIN_SIZE; }
        // Clamp within the displayed image without moving the anchored edges.
        const x1 = Math.max(d.x, x);
        const y1 = Math.max(d.y, y);
        const x2 = Math.min(d.x + d.w, x + w);
        const y2 = Math.min(d.y + d.h, y + h);
        next = {x: x1, y: y1, w: Math.max(MIN_SIZE, x2 - x1), h: Math.max(MIN_SIZE, y2 - y1)};
      }
      rectRef.current = next;
      setRect(next);
    },
  });

  // Created once; they read live values through the refs.
  const moveResponder = useRef(makeResponder('move')).current;
  const tlResponder = useRef(makeResponder('tl')).current;
  const trResponder = useRef(makeResponder('tr')).current;
  const blResponder = useRef(makeResponder('bl')).current;
  const brResponder = useRef(makeResponder('br')).current;

  const finish = (result: {uri: string} | null) => {
    const r = req;
    setReq(null);
    r?.resolve(result);
  };

  const confirmCrop = async () => {
    const r = rectRef.current;
    const d = dispRef.current;
    if (!req || !r || !d || !natural || busy) return;
    setBusy(true);
    try {
      const sx = natural.w / d.w;
      const sy = natural.h / d.h;
      const offset = {
        x: Math.max(0, Math.round((r.x - d.x) * sx)),
        y: Math.max(0, Math.round((r.y - d.y) * sy)),
      };
      const size = {
        width: Math.max(1, Math.min(natural.w - offset.x, Math.round(r.w * sx))),
        height: Math.max(1, Math.min(natural.h - offset.y, Math.round(r.h * sy))),
      };
      const out = await ImageEditor.cropImage(req.src.uri, {offset, size});
      const uri = typeof out === 'string' ? out : out?.uri;
      finish(uri ? {uri} : null);
    } catch {
      // Crop failing must never eat the flow silently mid-air: backing out is
      // a cancel, and the caller's picker can simply be reopened.
      finish(null);
    } finally {
      setBusy(false);
    }
  };

  if (!req) return null;
  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={() => finish(null)}>
      <View style={{flex: 1, backgroundColor: '#000'}}>
        <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: '#fff', textAlign: 'center', paddingTop: 48, paddingBottom: 8}} maxFontSizeMultiplier={1.3}>
          {i18n.t('modal.cropImage')}
        </Text>
        <View style={{flex: 1, margin: 12}} onLayout={e => setBox({w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height})}>
          {box && (
            <Image source={{uri: req.src.uri}} style={{width: box.w, height: box.h}} resizeMode="contain" accessibilityRole="image" accessibilityLabel={i18n.t('a11y.image')} />
          )}
          {rect && disp && (
            <>
              {/* Dimmed surround, then the live window. */}
              <View pointerEvents="none" style={{position: 'absolute', left: disp.x, top: disp.y, width: disp.w, height: rect.y - disp.y, backgroundColor: 'rgba(0,0,0,0.55)'}} />
              <View pointerEvents="none" style={{position: 'absolute', left: disp.x, top: rect.y + rect.h, width: disp.w, height: disp.y + disp.h - rect.y - rect.h, backgroundColor: 'rgba(0,0,0,0.55)'}} />
              <View pointerEvents="none" style={{position: 'absolute', left: disp.x, top: rect.y, width: rect.x - disp.x, height: rect.h, backgroundColor: 'rgba(0,0,0,0.55)'}} />
              <View pointerEvents="none" style={{position: 'absolute', left: rect.x + rect.w, top: rect.y, width: disp.x + disp.w - rect.x - rect.w, height: rect.h, backgroundColor: 'rgba(0,0,0,0.55)'}} />
              <View
                {...moveResponder.panHandlers}
                accessible accessibilityRole="adjustable" accessibilityLabel={i18n.t('modal.cropImage')}
                style={{position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderWidth: 2, borderColor: T.accent}}
              />
              {([['tl', tlResponder], ['tr', trResponder], ['bl', blResponder], ['br', brResponder]] as [Corner, typeof tlResponder][]).map(([corner, resp]) => (
                <View
                  key={corner}
                  {...resp.panHandlers}
                  accessible accessibilityRole="adjustable" accessibilityLabel={i18n.t('modal.cropImage')}
                  style={{
                    position: 'absolute',
                    left: (corner === 'tl' || corner === 'bl' ? rect.x : rect.x + rect.w) - HANDLE / 2,
                    top: (corner === 'tl' || corner === 'tr' ? rect.y : rect.y + rect.h) - HANDLE / 2,
                    width: HANDLE, height: HANDLE, alignItems: 'center', justifyContent: 'center',
                  }}>
                  <View style={{width: 14, height: 14, borderRadius: 7, backgroundColor: T.accent, borderWidth: 2, borderColor: '#fff'}} />
                </View>
              ))}
            </>
          )}
        </View>
        <View style={{flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 32}}>
          <TouchableOpacity onPress={() => finish(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={i18n.t('common.cancel')}
            style={{flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center'}}>
            <Text style={{fontSize: fs(14), fontWeight: '600', color: '#fff'}}>{i18n.t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmCrop} disabled={busy || !rect} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={i18n.t('common.save')} accessibilityState={{disabled: busy || !rect}}
            style={{flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: T.accent, alignItems: 'center', opacity: busy || !rect ? 0.5 : 1}}>
            <Text style={{fontSize: fs(14), fontWeight: '600', color: '#fff'}}>{i18n.t('common.save')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};
