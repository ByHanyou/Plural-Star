import React, {useEffect, useRef, useState} from 'react';
import {Modal, View, Image, PanResponder, TouchableOpacity} from 'react-native';
import ImageEditor from '@react-native-community/image-editor';
import {Text} from './AppText';
import i18n from '../i18n/i18n';
import {fontScale} from '../theme';
import {CROP_CORNERS, CropCorner, CropMode, CropRect, CropSize, containRect, cornerPoint, cropPixels, dragCropRect, stepCropArea, stepCropCorner} from '../utils';
import {useTheme} from '../themeContext';

interface CropSource {
  uri: string;
  width?: number;
  height?: number;
}

interface CropRequest {
  id: number;
  src: CropSource;
  resolve: (r: {uri: string} | null) => void;
  reject: (e: unknown) => void;
}

const hosts: ((req: CropRequest) => void)[] = [];
let nextRequestId = 1;

export const requestImageCrop = (src: CropSource): Promise<{uri: string} | null> =>
  new Promise((resolve, reject) => {
    const open = hosts[hosts.length - 1];
    if (!open) { resolve(null); return; }
    open({id: nextRequestId++, src, resolve, reject});
  });

const HANDLE = 28;

const STEP = 0.05;
const MOVES: Record<string, [number, number]> = {move_up: [0, -1], move_down: [0, 1], move_left: [-1, 0], move_right: [1, 0]};
const OUTWARD: Record<CropCorner, [number, number]> = {tl: [-1, -1], tr: [1, -1], bl: [-1, 1], br: [1, 1]};
const CORNER_LABEL: Record<CropCorner, string> = {tl: 'modal.cropHandleTl', tr: 'modal.cropHandleTr', bl: 'modal.cropHandleBl', br: 'modal.cropHandleBr'};
const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

const Shade = ({left, top, width, height}: {left: number; top: number; width: number; height: number}) => (
  <View pointerEvents="none" style={{position: 'absolute', left, top, width, height, backgroundColor: 'rgba(0,0,0,0.55)'}} />
);

export const ImageCropHost = () => {
  const T = useTheme();
  const fs = fontScale(T);
  const [req, setReq] = useState<CropRequest | null>(null);
  const [natural, setNatural] = useState<CropSize | null>(null);
  const [box, setBox] = useState<CropSize | null>(null);
  const [rect, setRect] = useState<CropRect | null>(null);
  const [busy, setBusy] = useState(false);
  const rectRef = useRef<CropRect | null>(null);
  const dispRef = useRef<CropRect | null>(null);
  const startRef = useRef<CropRect | null>(null);
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
        Image.getSize(r.src.uri, (w, h) => setNatural({w, h}), e => {
          if (reqRef.current === r) { reqRef.current = null; setReq(null); }
          r.reject(e);
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

  const disp: CropRect | null = natural && box ? containRect(natural, box) : null;
  dispRef.current = disp;

  useEffect(() => {
    const d = dispRef.current;
    if (d && !rectRef.current) {
      const full = {...d};
      rectRef.current = full;
      setRect(full);
    }
  }, [disp?.x, disp?.y, disp?.w, disp?.h]);

  const makeResponder = (mode: CropMode) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { startRef.current = rectRef.current; },
    onPanResponderMove: (_e, g) => {
      const s = startRef.current;
      const d = dispRef.current;
      if (!s || !d) return;
      const next = dragCropRect(mode, s, g.dx, g.dy, d);
      rectRef.current = next;
      setRect(next);
    },
  });

  const [responders] = useState(() => ({
    move: makeResponder('move'),
    tl: makeResponder('tl'),
    tr: makeResponder('tr'),
    bl: makeResponder('bl'),
    br: makeResponder('br'),
  }));

  const stepArea = (dx: number, dy: number, grow: number) => {
    const r = rectRef.current;
    const d = dispRef.current;
    if (!r || !d) return;
    const next = stepCropArea(r, d, STEP, dx, dy, grow);
    rectRef.current = next;
    setRect(next);
  };

  const stepCorner = (corner: CropCorner, dx: number, dy: number) => {
    const r = rectRef.current;
    const d = dispRef.current;
    if (!r || !d) return;
    const next = stepCropCorner(r, d, STEP, corner, dx, dy);
    rectRef.current = next;
    setRect(next);
  };

  const onAreaAction = (name: string) => {
    const m = MOVES[name];
    if (name === 'increment') stepArea(0, 0, 1);
    else if (name === 'decrement') stepArea(0, 0, -1);
    else if (m) stepArea(m[0], m[1], 0);
  };

  const onCornerAction = (corner: CropCorner, name: string) => {
    const m = MOVES[name];
    const [ox, oy] = OUTWARD[corner];
    if (name === 'increment') stepCorner(corner, ox, oy);
    else if (name === 'decrement') stepCorner(corner, -ox, -oy);
    else if (m) stepCorner(corner, m[0], m[1]);
  };

  const take = () => {
    const r = reqRef.current;
    reqRef.current = null;
    setReq(null);
    return r;
  };

  const finish = (result: {uri: string} | null) => take()?.resolve(result);

  const confirmCrop = async () => {
    const r = rectRef.current;
    const d = dispRef.current;
    if (!req || !r || !d || !natural || busy) return;
    setBusy(true);
    try {
      const {x, y, width, height} = cropPixels(r, d, natural);
      const {uri} = await ImageEditor.cropImage(req.src.uri, {offset: {x, y}, size: {width, height}});
      finish({uri});
    } catch (e) {
      take()?.reject(e);
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
              <Shade left={disp.x} top={disp.y} width={disp.w} height={rect.y - disp.y} />
              <Shade left={disp.x} top={rect.y + rect.h} width={disp.w} height={disp.y + disp.h - rect.y - rect.h} />
              <Shade left={disp.x} top={rect.y} width={rect.x - disp.x} height={rect.h} />
              <Shade left={rect.x + rect.w} top={rect.y} width={disp.x + disp.w - rect.x - rect.w} height={rect.h} />
              <View
                {...responders.move.panHandlers}
                accessible accessibilityRole="adjustable" accessibilityLabel={i18n.t('modal.cropArea')}
                accessibilityValue={{text: i18n.t('modal.cropAreaValue', {w: pct(rect.w, disp.w), h: pct(rect.h, disp.h), x: pct(rect.x - disp.x, disp.w), y: pct(rect.y - disp.y, disp.h)})}}
                accessibilityActions={cropActions}
                onAccessibilityAction={e => onAreaAction(e.nativeEvent.actionName)}
                style={{position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderWidth: 2, borderColor: T.accent}}
              />
              {CROP_CORNERS.map(corner => {
                const at = cornerPoint(corner, rect);
                return (
                  <View
                    key={corner}
                    {...responders[corner].panHandlers}
                    accessible accessibilityRole="adjustable" accessibilityLabel={i18n.t(CORNER_LABEL[corner])}
                    accessibilityValue={{text: i18n.t('modal.cropHandleValue', {x: pct(at.x - disp.x, disp.w), y: pct(at.y - disp.y, disp.h)})}}
                    accessibilityActions={cropActions}
                    onAccessibilityAction={e => onCornerAction(corner, e.nativeEvent.actionName)}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                    style={{
                      position: 'absolute',
                      left: at.x - HANDLE / 2,
                      top: at.y - HANDLE / 2,
                      width: HANDLE, height: HANDLE, alignItems: 'center', justifyContent: 'center',
                    }}>
                    <View style={{width: 14, height: 14, borderRadius: 7, backgroundColor: T.accent, borderWidth: 2, borderColor: '#fff'}} />
                  </View>
                );
              })}
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
