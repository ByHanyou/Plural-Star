import React, {useEffect, useRef, useState} from 'react';
import {Modal, View, Image, PanResponder, TouchableOpacity} from 'react-native';
import ImageEditor from '@react-native-community/image-editor';
import {Text} from './AppText';
import i18n from '../i18n/i18n';
import {fontScale} from '../theme';
import type {ThemeColors} from '../theme';

interface CropSource {
  uri: string;
  width?: number;
  height?: number;
}

interface CropRequest {
  id: number;
  src: CropSource;
  resolve: (r: {uri: string} | null) => void;
}

const hosts: ((req: CropRequest) => void)[] = [];
let nextRequestId = 1;

export const requestImageCrop = (src: CropSource): Promise<{uri: string} | null> =>
  new Promise(resolve => {
    const open = hosts[hosts.length - 1];
    if (!open) { resolve(null); return; }
    open({id: nextRequestId++, src, resolve});
  });

const HANDLE = 28;
const MIN_SIZE = 40;

type Corner = 'tl' | 'tr' | 'bl' | 'br';

interface Rect { x: number; y: number; w: number; h: number; }

const STEP = 0.05;
const MOVES: Record<string, [number, number]> = {move_up: [0, -1], move_down: [0, 1], move_left: [-1, 0], move_right: [1, 0]};
const OUTWARD: Record<Corner, [number, number]> = {tl: [-1, -1], tr: [1, -1], bl: [-1, 1], br: [1, 1]};
const CORNER_LABEL: Record<Corner, string> = {tl: 'modal.cropHandleTl', tr: 'modal.cropHandleTr', bl: 'modal.cropHandleBl', br: 'modal.cropHandleBr'};
const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

export const ImageCropHost = ({theme: T}: {theme: ThemeColors}) => {
  const fs = fontScale(T);
  const [req, setReq] = useState<CropRequest | null>(null);
  const [natural, setNatural] = useState<{w: number; h: number} | null>(null);
  const [box, setBox] = useState<{w: number; h: number} | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const rectRef = useRef<Rect | null>(null);
  const dispRef = useRef<Rect | null>(null);
  const startRef = useRef<Rect | null>(null);
  const reqRef = useRef<CropRequest | null>(null);

  useEffect(() => {
    const open = (r: CropRequest) => {
      const stale = reqRef.current;
      reqRef.current = r;
      if (stale) stale.resolve(null);
      setNatural(null); setBox(null); setRect(null); rectRef.current = null; setBusy(false);
      setReq(r);
      if (r.src.width && r.src.height) {
        setNatural({w: r.src.width, h: r.src.height});
      } else {
        Image.getSize(r.src.uri, (w, h) => setNatural({w, h}), () => {
          if (reqRef.current === r) { reqRef.current = null; setReq(null); }
          r.resolve(null);
        });
      }
    };
    hosts.push(open);
    return () => {
      const i = hosts.indexOf(open);
      if (i >= 0) hosts.splice(i, 1);
      const pending = reqRef.current;
      reqRef.current = null;
      if (pending) pending.resolve(null);
    };
  }, []);

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
        if (w < MIN_SIZE) { if (mode === 'tl' || mode === 'bl') x = s.x + s.w - MIN_SIZE; w = MIN_SIZE; }
        if (h < MIN_SIZE) { if (mode === 'tl' || mode === 'tr') y = s.y + s.h - MIN_SIZE; h = MIN_SIZE; }
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

  const moveResponder = useRef(makeResponder('move')).current;
  const tlResponder = useRef(makeResponder('tl')).current;
  const trResponder = useRef(makeResponder('tr')).current;
  const blResponder = useRef(makeResponder('bl')).current;
  const brResponder = useRef(makeResponder('br')).current;

  const stepArea = (dx: number, dy: number, grow: number) => {
    const r = rectRef.current;
    const d = dispRef.current;
    if (!r || !d) return;
    const w = Math.max(MIN_SIZE, Math.min(d.w, r.w + grow * d.w * STEP));
    const h = Math.max(MIN_SIZE, Math.min(d.h, r.h + grow * d.h * STEP));
    const next = clampRect({x: r.x + (r.w - w) / 2 + dx * d.w * STEP, y: r.y + (r.h - h) / 2 + dy * d.h * STEP, w, h});
    rectRef.current = next;
    setRect(next);
  };

  const stepCorner = (corner: Corner, dx: number, dy: number) => {
    const r = rectRef.current;
    const d = dispRef.current;
    if (!r || !d) return;
    let left = r.x, top = r.y, right = r.x + r.w, bottom = r.y + r.h;
    if (corner === 'tl' || corner === 'bl') left = Math.max(d.x, Math.min(right - MIN_SIZE, left + dx * d.w * STEP));
    else right = Math.min(d.x + d.w, Math.max(left + MIN_SIZE, right + dx * d.w * STEP));
    if (corner === 'tl' || corner === 'tr') top = Math.max(d.y, Math.min(bottom - MIN_SIZE, top + dy * d.h * STEP));
    else bottom = Math.min(d.y + d.h, Math.max(top + MIN_SIZE, bottom + dy * d.h * STEP));
    const next = {x: left, y: top, w: right - left, h: bottom - top};
    rectRef.current = next;
    setRect(next);
  };

  const onAreaAction = (name: string) => {
    const m = MOVES[name];
    if (name === 'increment') stepArea(0, 0, 1);
    else if (name === 'decrement') stepArea(0, 0, -1);
    else if (m) stepArea(m[0], m[1], 0);
  };

  const onCornerAction = (corner: Corner, name: string) => {
    const m = MOVES[name];
    const [ox, oy] = OUTWARD[corner];
    if (name === 'increment') stepCorner(corner, ox, oy);
    else if (name === 'decrement') stepCorner(corner, -ox, -oy);
    else if (m) stepCorner(corner, m[0], m[1]);
  };

  const finish = (result: {uri: string} | null) => {
    const r = reqRef.current;
    reqRef.current = null;
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
      finish(null);
    } finally {
      setBusy(false);
    }
  };

  if (!req) return null;
  const cropActions = [
    {name: 'increment', label: i18n.t('modal.cropBigger')},
    {name: 'decrement', label: i18n.t('modal.cropSmaller')},
    {name: 'move_up', label: i18n.t('modal.cropMoveUp')},
    {name: 'move_down', label: i18n.t('modal.cropMoveDown')},
    {name: 'move_left', label: i18n.t('modal.cropMoveLeft')},
    {name: 'move_right', label: i18n.t('modal.cropMoveRight')},
  ];
  return (
    <Modal key={req.id} visible transparent={false} animationType="fade" onRequestClose={() => finish(null)}>
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
              <View pointerEvents="none" style={{position: 'absolute', left: disp.x, top: disp.y, width: disp.w, height: rect.y - disp.y, backgroundColor: 'rgba(0,0,0,0.55)'}} />
              <View pointerEvents="none" style={{position: 'absolute', left: disp.x, top: rect.y + rect.h, width: disp.w, height: disp.y + disp.h - rect.y - rect.h, backgroundColor: 'rgba(0,0,0,0.55)'}} />
              <View pointerEvents="none" style={{position: 'absolute', left: disp.x, top: rect.y, width: rect.x - disp.x, height: rect.h, backgroundColor: 'rgba(0,0,0,0.55)'}} />
              <View pointerEvents="none" style={{position: 'absolute', left: rect.x + rect.w, top: rect.y, width: disp.x + disp.w - rect.x - rect.w, height: rect.h, backgroundColor: 'rgba(0,0,0,0.55)'}} />
              <View
                {...moveResponder.panHandlers}
                accessible accessibilityRole="adjustable" accessibilityLabel={i18n.t('modal.cropArea')}
                accessibilityValue={{text: i18n.t('modal.cropAreaValue', {w: pct(rect.w, disp.w), h: pct(rect.h, disp.h), x: pct(rect.x - disp.x, disp.w), y: pct(rect.y - disp.y, disp.h)})}}
                accessibilityActions={cropActions}
                onAccessibilityAction={e => onAreaAction(e.nativeEvent.actionName)}
                style={{position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderWidth: 2, borderColor: T.accent}}
              />
              {([['tl', tlResponder], ['tr', trResponder], ['bl', blResponder], ['br', brResponder]] as [Corner, typeof tlResponder][]).map(([corner, resp]) => (
                <View
                  key={corner}
                  {...resp.panHandlers}
                  accessible accessibilityRole="adjustable" accessibilityLabel={i18n.t(CORNER_LABEL[corner])}
                  accessibilityValue={{text: i18n.t('modal.cropHandleValue', {x: pct((corner === 'tl' || corner === 'bl' ? rect.x : rect.x + rect.w) - disp.x, disp.w), y: pct((corner === 'tl' || corner === 'tr' ? rect.y : rect.y + rect.h) - disp.y, disp.h)})}}
                  accessibilityActions={cropActions}
                  onAccessibilityAction={e => onCornerAction(corner, e.nativeEvent.actionName)}
                  hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
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
          <TouchableOpacity onPress={() => finish(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={i18n.t('common.cancel')} hitSlop={{top: 6, bottom: 6}}
            style={{flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center'}}>
            <Text style={{fontSize: fs(14), fontWeight: '600', color: '#fff'}}>{i18n.t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmCrop} disabled={busy || !rect} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={i18n.t('common.save')} accessibilityState={{disabled: busy || !rect}} hitSlop={{top: 6, bottom: 6}}
            style={{flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: T.accent, alignItems: 'center', opacity: busy || !rect ? 0.5 : 1}}>
            <Text style={{fontSize: fs(14), fontWeight: '600', color: '#fff'}}>{i18n.t('common.save')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};
