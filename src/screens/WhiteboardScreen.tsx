import React, {useState, useEffect, useMemo, useRef, useCallback} from 'react';
import {View, TouchableOpacity, Alert, PanResponder} from 'react-native';
import Svg, {G, Path} from 'react-native-svg';
import {Text} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {store, KEYS} from '../storage';
import {uid} from '../utils';

const WORLD = 8000;
const HALF = WORLD / 2;
const MIN_SCALE = 0.05;
const MAX_SCALE = 6;

interface Stroke {
  id: string;
  c: string;
  w: number;
  pts: number[];
}

interface Props {
  theme: any;
  onBack: () => void;
}

const COLORS = ['#FFFFFF', '#111111', '#E05B5B', '#E8933A', '#D9B84A', '#5BBF7A', '#4AA8D9', '#7B6BE8', '#E87BA8', '#8B5A2B', '#9AA5B1', '#DAA520'];
const WIDTHS = [3, 6, 12];

type Tool = 'draw' | 'move' | 'erase';

const strokePath = (pts: number[]): string => {
  if (pts.length < 2) return '';
  let d = `M ${pts[0]} ${pts[1]}`;
  if (pts.length === 2) d += ` L ${pts[0] + 0.1} ${pts[1] + 0.1}`;
  for (let i = 2; i < pts.length; i += 2) d += ` L ${pts[i]} ${pts[i + 1]}`;
  return d;
};

export const WhiteboardScreen = ({theme: T, onBack}: Props) => {
  const {t} = useTranslation();
  const fs = (s: number) => Math.round(s * (T.textScale || 1));

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [tool, setTool] = useState<Tool>('draw');
  const [view, setView] = useState({tx: 0, ty: 0, scale: 1});

  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const currentRef = useRef<Stroke | null>(null);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const colorRef = useRef(color);
  colorRef.current = color;
  const widthRef = useRef(width);
  widthRef.current = width;
  const viewportRef = useRef({x: 0, y: 0, w: 0, h: 0});
  const panRef = useRef({tx: 0, ty: 0, scale: 1, startTx: 0, startTy: 0, startScale: 1, startDist: 0});
  const dirtyRef = useRef(false);

  useEffect(() => {
    (async () => {
      const saved = await store.get<Stroke[]>(KEYS.whiteboard, []);
      if (saved && Array.isArray(saved)) setStrokes(saved.filter(s => s && Array.isArray(s.pts) && s.pts.length >= 2));
    })();
  }, []);

  const persist = useCallback((next: Stroke[]) => {
    dirtyRef.current = false;
    store.set(KEYS.whiteboard, next).catch(() => {});
  }, []);

  useEffect(() => () => {
    if (dirtyRef.current) store.set(KEYS.whiteboard, strokesRef.current).catch(() => {});
  }, []);

  const toWorld = (pageX: number, pageY: number): [number, number] => {
    const vp = viewportRef.current;
    const p = panRef.current;
    return [
      (pageX - vp.x - vp.w / 2 - p.tx) / p.scale,
      (pageY - vp.y - vp.h / 2 - p.ty) / p.scale,
    ];
  };

  const clampWorld = (v: number) => Math.max(-HALF + 20, Math.min(HALF - 20, Math.round(v)));

  const eraseAt = (wx: number, wy: number) => {
    const p = panRef.current;
    const radius = Math.max(18, 18 / p.scale);
    const survivors = strokesRef.current.filter(s => {
      for (let i = 0; i < s.pts.length; i += 2) {
        if (Math.hypot(s.pts[i] - wx, s.pts[i + 1] - wy) < radius + s.w / 2) return false;
      }
      return true;
    });
    if (survivors.length !== strokesRef.current.length) {
      dirtyRef.current = true;
      setStrokes(survivors);
    }
  };

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      const p = panRef.current;
      p.startTx = p.tx;
      p.startTy = p.ty;
      p.startScale = p.scale;
      p.startDist = 0;
      const [wx, wy] = toWorld(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      if (toolRef.current === 'draw') {
        currentRef.current = {id: uid(), c: colorRef.current, w: widthRef.current, pts: [clampWorld(wx), clampWorld(wy)]};
        setCurrent(currentRef.current);
      } else if (toolRef.current === 'erase') {
        eraseAt(wx, wy);
      }
    },
    onPanResponderMove: (evt, gs) => {
      const p = panRef.current;
      const touches = evt.nativeEvent.touches;
      if (touches.length >= 2) {
        if (currentRef.current) {
          currentRef.current = null;
          setCurrent(null);
        }
        const dx = touches[0].pageX - touches[1].pageX;
        const dy = touches[0].pageY - touches[1].pageY;
        const dist = Math.hypot(dx, dy) || 1;
        if (p.startDist === 0) {
          p.startDist = dist;
          p.startScale = p.scale;
        } else {
          p.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, p.startScale * (dist / p.startDist)));
          setView({tx: p.tx, ty: p.ty, scale: p.scale});
        }
        return;
      }
      if (toolRef.current === 'move') {
        p.tx = p.startTx + gs.dx;
        p.ty = p.startTy + gs.dy;
        setView({tx: p.tx, ty: p.ty, scale: p.scale});
        return;
      }
      const [wx, wy] = toWorld(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      if (toolRef.current === 'erase') {
        eraseAt(wx, wy);
        return;
      }
      const cur = currentRef.current;
      if (!cur) return;
      const cx = clampWorld(wx);
      const cy = clampWorld(wy);
      const n = cur.pts.length;
      const minStep = Math.max(1, 1.5 / p.scale);
      if (Math.hypot(cx - cur.pts[n - 2], cy - cur.pts[n - 1]) >= minStep) {
        currentRef.current = {...cur, pts: [...cur.pts, cx, cy]};
        setCurrent(currentRef.current);
      }
    },
    onPanResponderRelease: () => {
      const cur = currentRef.current;
      currentRef.current = null;
      if (cur && cur.pts.length >= 2) {
        const next = [...strokesRef.current, cur];
        setStrokes(next);
        setCurrent(null);
        persist(next);
      } else {
        setCurrent(null);
        if (toolRef.current === 'erase' && dirtyRef.current) persist(strokesRef.current);
      }
    },
    onPanResponderTerminate: () => {
      currentRef.current = null;
      setCurrent(null);
    },
  }), [persist]);

  const undo = () => {
    if (strokesRef.current.length === 0) return;
    const next = strokesRef.current.slice(0, -1);
    setStrokes(next);
    persist(next);
  };

  const clearAll = () => {
    Alert.alert(t('whiteboard.clearTitle'), t('whiteboard.clearMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => {
        setStrokes([]);
        persist([]);
      }},
    ]);
  };

  const zoomBy = (f: number) => {
    const p = panRef.current;
    p.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, p.scale * f));
    setView({tx: p.tx, ty: p.ty, scale: p.scale});
  };

  const paths = useMemo(() => strokes.map(s => ({id: s.id, d: strokePath(s.pts), c: s.c, w: s.w})), [strokes]);
  const currentPath = current ? strokePath(current.pts) : '';

  const toolBtn = (id: Tool, glyph: string, label: string) => (
    <TouchableOpacity key={id} onPress={() => setTool(id)} activeOpacity={0.7}
      accessibilityRole="button" accessibilityState={{selected: tool === id}} accessibilityLabel={label}
      style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
        backgroundColor: tool === id ? T.accentBg : 'transparent', borderColor: tool === id ? T.accent : T.border}}>
      <Text style={{fontSize: fs(15), color: tool === id ? T.accent : T.dim}} importantForAccessibility="no">{glyph}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{flex: 1, backgroundColor: T.bg}}>
      <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border, gap: 8}}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{padding: 6}}>
          <Text style={{fontSize: fs(16), color: T.dim}} importantForAccessibility="no">‹</Text>
        </TouchableOpacity>
        <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(16), fontWeight: '600', color: T.text}}>{t('whiteboard.title')}</Text>
        <TouchableOpacity onPress={undo} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('whiteboard.undo')} accessibilityState={{disabled: strokes.length === 0}} style={{padding: 6}}>
          <Text style={{fontSize: fs(15), color: strokes.length ? T.text : T.muted}} importantForAccessibility="no">↩</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => zoomBy(1.25)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemMap.zoomIn')} style={{padding: 6}}>
          <Text style={{fontSize: fs(15), color: T.text}} importantForAccessibility="no">＋</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => zoomBy(0.8)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemMap.zoomOut')} style={{padding: 6}}>
          <Text style={{fontSize: fs(15), color: T.text}} importantForAccessibility="no">－</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={clearAll} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('whiteboard.clear')} style={{padding: 6}}>
          <Text style={{fontSize: fs(15), color: T.danger}} importantForAccessibility="no">🗑</Text>
        </TouchableOpacity>
      </View>

      <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: T.border}}>
        {toolBtn('draw', '✎', t('whiteboard.draw'))}
        {toolBtn('move', '✥', t('whiteboard.move'))}
        {toolBtn('erase', '⌫', t('whiteboard.erase'))}
        <View style={{width: 1, height: 22, backgroundColor: T.border}} importantForAccessibility="no" accessibilityElementsHidden />
        {WIDTHS.map(wd => (
          <TouchableOpacity key={wd} onPress={() => setWidth(wd)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityState={{selected: width === wd}} accessibilityLabel={`${t('whiteboard.brushSize')} ${wd}`}
            style={{width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: width === wd ? T.accent : T.border}}>
            <View style={{width: wd + 4, height: wd + 4, borderRadius: (wd + 4) / 2, backgroundColor: color}} importantForAccessibility="no" />
          </TouchableOpacity>
        ))}
      </View>

      <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 6, borderBottomWidth: 1, borderBottomColor: T.border, flexWrap: 'wrap'}}>
        {COLORS.map(c => (
          <TouchableOpacity key={c} onPress={() => setColor(c)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityState={{selected: color === c}} accessibilityLabel={`${t('whiteboard.penColor')} ${c}`}
            style={{width: 24, height: 24, borderRadius: 12, backgroundColor: c, borderWidth: color === c ? 3 : 1, borderColor: color === c ? T.accent : T.border}} />
        ))}
      </View>

      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('whiteboard.title')}
        style={{flex: 1, overflow: 'hidden', backgroundColor: T.card}}
        onLayout={(e) => {
          const {x, y, width: w, height: h} = e.nativeEvent.layout;
          viewportRef.current = {...viewportRef.current, w, h};
        }}
        ref={(node: any) => {
          if (node && node.measureInWindow) {
            node.measureInWindow((x: number, y: number, w: number, h: number) => {
              viewportRef.current = {x, y, w, h};
            });
          }
        }}
        {...responder.panHandlers}>
        <Svg width="100%" height="100%">
          <G transform={`translate(${viewportRef.current.w / 2 + view.tx}, ${viewportRef.current.h / 2 + view.ty}) scale(${view.scale})`}>
            <Path d={`M ${-HALF} ${-HALF} H ${HALF} V ${HALF} H ${-HALF} Z`} fill="none" stroke={T.border} strokeWidth={2 / view.scale} />
            {paths.map(p => (
              <Path key={p.id} d={p.d} stroke={p.c} strokeWidth={p.w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            ))}
            {currentPath ? (
              <Path d={currentPath} stroke={current!.c} strokeWidth={current!.w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            ) : null}
          </G>
        </Svg>
      </View>
    </View>
  );
};
