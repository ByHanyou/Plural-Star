import React, {useState, useEffect, useMemo, useRef, useCallback} from 'react';
import {View, TouchableOpacity, Alert, PanResponder, AccessibilityInfo, Modal, ScrollView} from 'react-native';
import Svg, {G, Path} from 'react-native-svg';
import {Text} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {store, KEYS} from '../storage';
import {uid} from '../utils';
import {fontScale, ThemeColors} from '../theme';
import {logError} from '../utils/log';
import {traceEnclosedRegion} from '../utils/floodFill';
import {ColorCarousel} from '../components/ColorCarousel';

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
  theme: ThemeColors;
  onBack: () => void;
}

const WIDTHS = [1, 3, 6, 12, 15];

type ShapeTool = 'line' | 'rect' | 'ellipse';
type Tool = 'draw' | 'move' | 'erase' | 'bucket' | 'poly' | ShapeTool;

const isShapeTool = (tl: Tool): tl is ShapeTool => tl === 'line' || tl === 'rect' || tl === 'ellipse';

/** Shape outlines as plain polyline points, so a committed shape IS an
 *  ordinary stroke: mirrors, sync and older builds render it with no format
 *  change. Closed shapes repeat their first point; the ellipse is a
 *  48-segment approximation. (The polygon tool builds its points tap by tap
 *  instead — see addPolyVertex.) */
const shapePts = (shape: ShapeTool, x0: number, y0: number, x1: number, y1: number): number[] => {
  if (shape === 'line') return [x0, y0, x1, y1];
  if (shape === 'rect') return [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0];
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = Math.abs(x1 - x0) / 2;
  const ry = Math.abs(y1 - y0) / 2;
  const pts: number[] = [];
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    pts.push(Math.round(cx + rx * Math.cos(a)), Math.round(cy + ry * Math.sin(a)));
  }
  return pts;
};

const strokePath = (pts: number[]): string => {
  if (pts.length < 2) return '';
  let d = `M ${pts[0]} ${pts[1]}`;
  if (pts.length === 2) d += ` L ${pts[0] + 0.1} ${pts[1] + 0.1}`;
  for (let i = 2; i < pts.length; i += 2) d += ` L ${pts[i]} ${pts[i + 1]}`;
  return d;
};

export const WhiteboardScreen = ({theme: T, onBack}: Props) => {
  const {t} = useTranslation();
  const fs = fontScale(T);

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [color, setColor] = useState('#FFFFFF');
  const [width, setWidth] = useState(WIDTHS[2]);
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
  const panRef = useRef({tx: 0, ty: 0, scale: 1, startTx: 0, startTy: 0, startScale: 1, startDist: 0, originX: 0, originY: 0});
  const dirtyRef = useRef(false);
  const bucketTapRef = useRef<{wx: number; wy: number; moved: boolean} | null>(null);
  const shapeStartRef = useRef<{x: number; y: number} | null>(null);
  // Polygon tool (Paint-style): each tap adds a corner, lines connect them.
  // Tapping the first corner again (3+ corners) or double-tapping the last
  // one finishes; the shape commits closed, exactly two corners commit as a
  // line. The in-progress polygon lives in `current` as the preview.
  const polyTapRef = useRef<{wx: number; wy: number; moved: boolean} | null>(null);
  const polyPtsRef = useRef<number[] | null>(null);
  const polyIdRef = useRef<string | null>(null);
  const polyLastTapRef = useRef(0);

  const [voStep, setVoStep] = useState(40);
  const [voCursor, setVoCursor] = useState({x: 0, y: 0});
  const [srEnabled, setSrEnabled] = useState(false);
  const [voHelpOpen, setVoHelpOpen] = useState(false);
  const voStepRef = useRef(40);
  const voCursorRef = useRef({x: 0, y: 0});
  const voStrokeIdRef = useRef<string | null>(null);
  const setStep = (n: number) => { voStepRef.current = n; setVoStep(n); };
  const setCursor = (c: {x: number; y: number}) => { voCursorRef.current = c; setVoCursor(c); };

  useEffect(() => {
    (async () => {
      const saved = await store.get<Stroke[]>(KEYS.whiteboard, []);
      if (saved && Array.isArray(saved)) setStrokes(saved.filter(s => s && Array.isArray(s.pts) && s.pts.length >= 2));
    })();
  }, []);

  const persist = useCallback((next: Stroke[]) => {
    dirtyRef.current = false;
    store.set(KEYS.whiteboard, next).catch(e => logError('whiteboard', e));
  }, []);

  useEffect(() => () => {
    if (dirtyRef.current) store.set(KEYS.whiteboard, strokesRef.current).catch(e => logError('whiteboard', e));
  }, []);

  useEffect(() => {
    let on = true;
    AccessibilityInfo.isScreenReaderEnabled().then(v => { if (on) setSrEnabled(v); });
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (v: boolean) => setSrEnabled(v));
    return () => { on = false; (sub as any)?.remove?.(); };
  }, []);

  const toWorld = (localX: number, localY: number): [number, number] => {
    const vp = viewportRef.current;
    const p = panRef.current;
    return [
      (localX - vp.w / 2 - p.tx) / p.scale,
      (localY - vp.h / 2 - p.ty) / p.scale,
    ];
  };

  const clampWorld = (v: number) => Math.max(-HALF + 20, Math.min(HALF - 20, Math.round(v)));

  const cancelPoly = () => {
    polyTapRef.current = null;
    polyPtsRef.current = null;
    polyIdRef.current = null;
    currentRef.current = null;
    setCurrent(null);
  };

  const finishPoly = () => {
    const pts = polyPtsRef.current;
    polyPtsRef.current = null;
    polyIdRef.current = null;
    currentRef.current = null;
    setCurrent(null);
    if (!pts || pts.length < 4) return;
    // 3+ corners close back to the first; exactly two commit as a line.
    const closed = pts.length >= 6 ? [...pts, pts[0], pts[1]] : pts;
    const s: Stroke = {id: uid(), c: colorRef.current, w: widthRef.current, pts: closed};
    const next = [...strokesRef.current, s];
    setStrokes(next);
    persist(next);
  };

  const addPolyVertex = (wx: number, wy: number): void => {
    const cx = clampWorld(wx);
    const cy = clampWorld(wy);
    const pts = polyPtsRef.current;
    const now = Date.now();
    if (!pts) {
      polyPtsRef.current = [cx, cy];
      polyIdRef.current = uid();
      currentRef.current = {id: polyIdRef.current, c: colorRef.current, w: widthRef.current, pts: [cx, cy]};
      setCurrent(currentRef.current);
      polyLastTapRef.current = now;
      return;
    }
    const closeThresh = Math.max(12, 16 / panRef.current.scale);
    const nearFirst = Math.hypot(cx - pts[0], cy - pts[1]) <= closeThresh;
    const nearLast = Math.hypot(cx - pts[pts.length - 2], cy - pts[pts.length - 1]) <= closeThresh;
    if ((nearFirst && pts.length >= 6) || (nearLast && now - polyLastTapRef.current < 350 && pts.length >= 4)) {
      finishPoly();
      return;
    }
    polyLastTapRef.current = now;
    if (Math.hypot(cx - pts[pts.length - 2], cy - pts[pts.length - 1]) < 1) return;
    polyPtsRef.current = [...pts, cx, cy];
    currentRef.current = {id: polyIdRef.current || uid(), c: colorRef.current, w: widthRef.current, pts: polyPtsRef.current};
    setCurrent(currentRef.current);
  };

  // Leaving the polygon tool abandons the unfinished polygon, same as the
  // drag shapes abandon on a two-finger gesture.
  useEffect(() => {
    if (tool !== 'poly' && polyPtsRef.current) cancelPoly();
  }, [tool]); // eslint-disable-line react-hooks/exhaustive-deps

  const eraseAt = (wx: number, wy: number) => {
    const radius = widthRef.current;
    const survivors = strokesRef.current.filter(s => {
      if (s.w === -1) return true;
      for (let i = 0; i < s.pts.length; i += 2) {
        if (Math.hypot(s.pts[i] - wx, s.pts[i + 1] - wy) < radius + Math.max(s.w, 0) / 2) return false;
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
      const ne = evt.nativeEvent;
      p.originX = ne.pageX - ne.locationX;
      p.originY = ne.pageY - ne.locationY;
      const [wx, wy] = toWorld(ne.locationX, ne.locationY);
      if (toolRef.current === 'draw') {
        currentRef.current = {id: uid(), c: colorRef.current, w: widthRef.current, pts: [clampWorld(wx), clampWorld(wy)]};
        setCurrent(currentRef.current);
      } else if (isShapeTool(toolRef.current)) {
        // Anchor corner; the preview stroke is rebuilt from it on every move.
        shapeStartRef.current = {x: clampWorld(wx), y: clampWorld(wy)};
        currentRef.current = {id: uid(), c: colorRef.current, w: widthRef.current, pts: [clampWorld(wx), clampWorld(wy)]};
        setCurrent(currentRef.current);
      } else if (toolRef.current === 'erase') {
        eraseAt(wx, wy);
      } else if (toolRef.current === 'bucket') {
        bucketTapRef.current = {wx, wy, moved: false};
      } else if (toolRef.current === 'poly') {
        polyTapRef.current = {wx, wy, moved: false};
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
        shapeStartRef.current = null;
        if (polyPtsRef.current) cancelPoly();
        if (bucketTapRef.current) bucketTapRef.current.moved = true;
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
      const [wx, wy] = toWorld(evt.nativeEvent.pageX - p.originX, evt.nativeEvent.pageY - p.originY);
      if (toolRef.current === 'erase') {
        eraseAt(wx, wy);
        return;
      }
      if (toolRef.current === 'bucket') {
        if (bucketTapRef.current && (Math.abs(gs.dx) > 6 || Math.abs(gs.dy) > 6)) bucketTapRef.current.moved = true;
        return;
      }
      if (toolRef.current === 'poly') {
        // Taps only; a drag is neither a corner nor a freehand append onto
        // the polygon preview sitting in `current`.
        if (polyTapRef.current && (Math.abs(gs.dx) > 6 || Math.abs(gs.dy) > 6)) polyTapRef.current.moved = true;
        return;
      }
      const cur = currentRef.current;
      if (!cur) return;
      const cx = clampWorld(wx);
      const cy = clampWorld(wy);
      const start = shapeStartRef.current;
      if (start && isShapeTool(toolRef.current)) {
        currentRef.current = {...cur, pts: shapePts(toolRef.current, start.x, start.y, cx, cy)};
        setCurrent(currentRef.current);
        return;
      }
      const n = cur.pts.length;
      const minStep = Math.max(1, 1.5 / p.scale);
      if (Math.hypot(cx - cur.pts[n - 2], cy - cur.pts[n - 1]) >= minStep) {
        currentRef.current = {...cur, pts: [...cur.pts, cx, cy]};
        setCurrent(currentRef.current);
      }
    },
    onPanResponderRelease: () => {
      const tap = bucketTapRef.current;
      bucketTapRef.current = null;
      if (toolRef.current === 'bucket' && tap && !tap.moved) {
        bucketFill(tap.wx, tap.wy);
        return;
      }
      if (toolRef.current === 'poly') {
        // The polygon preview lives in `current`; falling through would
        // commit it on every tap. Corners are added here instead.
        const pTap = polyTapRef.current;
        polyTapRef.current = null;
        if (pTap && !pTap.moved) addPolyVertex(pTap.wx, pTap.wy);
        return;
      }
      const cur = currentRef.current;
      currentRef.current = null;
      // A shape that was never dragged out is a tap, not a shape: committing
      // it would leave an invisible dot the eraser then has to hunt down.
      const shapeTap = shapeStartRef.current !== null && cur !== null && cur.pts.length <= 2;
      shapeStartRef.current = null;
      if (cur && cur.pts.length >= 2 && !shapeTap) {
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
      bucketTapRef.current = null;
      shapeStartRef.current = null;
      polyTapRef.current = null;
      setCurrent(null);
    },
  }), [persist]);

  const bucketFill = (wx: number, wy: number) => {
    // Real enclosure detection: all strokes' segments are walls, flood from
    // the tap. Enclosed → fill exactly that region (works across multiple
    // strokes and un-touching endpoints — the old single-stroke polygon test
    // missed those and fell through to painting the whole board). Open →
    // the deliberate background fill, which now only happens when the tap
    // point genuinely isn't enclosed by anything. On a wall → do nothing.
    const region = traceEnclosedRegion(wx, wy, strokesRef.current);
    if (region === null) return;
    const fill: Stroke = Array.isArray(region)
      ? {id: uid(), c: colorRef.current, w: -2, pts: region}
      : {id: uid(), c: colorRef.current, w: -1, pts: [0, 0, 0, 0]};
    const next = [...strokesRef.current, fill];
    setStrokes(next);
    persist(next);
  };

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
        Alert.alert(t('whiteboard.clearConfirm2Title'), t('whiteboard.clearConfirm2Msg'), [
          {text: t('common.cancel'), style: 'cancel'},
          {text: t('common.delete'), style: 'destructive', onPress: () => {
            Alert.alert(t('whiteboard.clearConfirm3Title'), t('whiteboard.clearConfirm3Msg'), [
              {text: t('common.cancel'), style: 'cancel'},
              {text: t('common.delete'), style: 'destructive', onPress: () => {
                setStrokes([]);
                persist([]);
              }},
            ]);
          }},
        ]);
      }},
    ]);
  };

  const voClampX = (v: number) => { const h = (viewportRef.current.w || 360) / 2; return Math.max(-h, Math.min(h, Math.round(v))); };
  const voClampY = (v: number) => { const h = (viewportRef.current.h || 640) / 2; return Math.max(-h, Math.min(h, Math.round(v))); };

  const voAnnounce = (msg: string) => { setTimeout(() => AccessibilityInfo.announceForAccessibility(msg), 50); };

  const voPosText = (c: {x: number; y: number}) => {
    const h = c.x >= 0 ? t('whiteboard.voPosRight', {n: c.x}) : t('whiteboard.voPosLeft', {n: -c.x});
    const v = c.y >= 0 ? t('whiteboard.voPosDown', {n: c.y}) : t('whiteboard.voPosUp', {n: -c.y});
    return t('whiteboard.voAt', {h, v});
  };

  const voMove = (dx: number, dy: number, dirKey: string, draw: boolean) => {
    const step = voStepRef.current;
    const prev = voCursorRef.current;
    const nx = voClampX(prev.x + dx * step);
    const ny = voClampY(prev.y + dy * step);
    setCursor({x: nx, y: ny});
    const dir = t(dirKey);
    if (draw) {
      if (voStrokeIdRef.current == null) {
        const s: Stroke = {id: uid(), c: color, w: width, pts: [prev.x, prev.y, nx, ny]};
        voStrokeIdRef.current = s.id;
        const next = [...strokesRef.current, s];
        setStrokes(next); persist(next);
      } else {
        const id = voStrokeIdRef.current;
        const next = strokesRef.current.map(s => s.id === id ? {...s, pts: [...s.pts, nx, ny]} : s);
        setStrokes(next); persist(next);
      }
      voAnnounce(`${t('whiteboard.voDrew', {dir, dist: step})}. ${voPosText({x: nx, y: ny})}`);
    } else {
      voStrokeIdRef.current = null;
      voAnnounce(`${t('whiteboard.voMoved', {dir, dist: step})}. ${voPosText({x: nx, y: ny})}`);
    }
  };

  const voWhere = () => {
    const c = voCursorRef.current;
    const hw = (viewportRef.current.w || 360) / 2;
    const hh = (viewportRef.current.h || 640) / 2;
    const edges = t('whiteboard.voEdges', {
      left: Math.round(hw + c.x), right: Math.round(hw - c.x),
      top: Math.round(hh + c.y), bottom: Math.round(hh - c.y),
    });
    voAnnounce(`${voPosText(c)}. ${edges}`);
  };

  const voRecenter = () => {
    setCursor({x: 0, y: 0});
    voStrokeIdRef.current = null;
    voAnnounce(t('whiteboard.voRecentered'));
  };

  const voStepChange = (delta: number) => {
    const n = Math.max(10, Math.min(200, voStepRef.current + delta));
    setStep(n);
    voAnnounce(t('whiteboard.voStepValue', {px: n}));
  };

  const shapeName = (shape: ShapeTool) =>
    shape === 'line' ? t('whiteboard.shapeLine') : shape === 'rect' ? t('whiteboard.shapeRect') : t('whiteboard.shapeEllipse');

  /** Screen-reader path for the shape tools: place the shape centred on the
   *  VO cursor, sized by the step, same commit as a drag. */
  const voPlaceShape = (shape: ShapeTool) => {
    voStrokeIdRef.current = null;
    const c = voCursorRef.current;
    const r = voStepRef.current;
    const s: Stroke = {
      id: uid(), c: color, w: width,
      pts: shape === 'line' ? shapePts('line', c.x - r, c.y, c.x + r, c.y) : shapePts(shape, c.x - r, c.y - r, c.x + r, c.y + r),
    };
    const next = [...strokesRef.current, s];
    setStrokes(next);
    persist(next);
    voAnnounce(`${t('whiteboard.voPlacedShape', {shape: shapeName(shape)})}. ${voPosText(c)}`);
  };

  /** Screen-reader polygon: each activation drops a corner at the cursor;
   *  finish commits through the same path as the tap flow. */
  const voPolyPoint = () => {
    voStrokeIdRef.current = null;
    const c = voCursorRef.current;
    addPolyVertex(c.x, c.y);
    voAnnounce(`${t('whiteboard.voPolyPointAdded')}. ${voPosText(c)}`);
  };

  const voPolyFinish = () => {
    if (!polyPtsRef.current) return;
    finishPoly();
    voAnnounce(t('whiteboard.voPlacedShape', {shape: t('whiteboard.shapePoly')}));
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
      <Text style={{fontSize: fs(15), color: tool === id ? T.accent : T.dim}} accessibilityElementsHidden importantForAccessibility="no">{glyph}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{flex: 1, backgroundColor: T.bg}}>
      <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border, gap: 8}}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{padding: 6}}>
          <Text style={{fontSize: fs(16), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no">‹</Text>
        </TouchableOpacity>
        <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(16), fontWeight: '600', color: T.text}}>{t('whiteboard.title')}</Text>
        <TouchableOpacity onPress={undo} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('whiteboard.undo')} accessibilityState={{disabled: strokes.length === 0}} style={{padding: 6}}>
          <Text style={{fontSize: fs(15), color: strokes.length ? T.text : T.muted}} accessibilityElementsHidden importantForAccessibility="no">↩</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => zoomBy(1.25)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemMap.zoomIn')} style={{padding: 6}}>
          <Text style={{fontSize: fs(15), color: T.text}} accessibilityElementsHidden importantForAccessibility="no">＋</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => zoomBy(0.8)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemMap.zoomOut')} style={{padding: 6}}>
          <Text style={{fontSize: fs(15), color: T.text}} accessibilityElementsHidden importantForAccessibility="no">－</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={clearAll} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('whiteboard.clear')} style={{padding: 6}}>
          <Text style={{fontSize: fs(15), color: T.danger}} accessibilityElementsHidden importantForAccessibility="no">🗑</Text>
        </TouchableOpacity>
      </View>

      <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: T.border}}>
        {toolBtn('draw', '✎', t('whiteboard.draw'))}
        {toolBtn('move', '✥', t('whiteboard.move'))}
        {toolBtn('erase', '⌫', t('whiteboard.erase'))}
        <View style={{width: 1, height: 22, backgroundColor: T.border}} importantForAccessibility="no" accessibilityElementsHidden />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexGrow: 1, flexShrink: 1}} contentContainerStyle={{alignItems: 'center', gap: 8}} snapToInterval={38} decelerationRate="fast">
          {toolBtn('line', '╱', t('whiteboard.shapeLine'))}
          {toolBtn('rect', '▭', t('whiteboard.shapeRect'))}
          {toolBtn('ellipse', '◯', t('whiteboard.shapeEllipse'))}
          {toolBtn('poly', '⬠', t('whiteboard.shapePoly'))}
          <View style={{width: 1, height: 22, backgroundColor: T.border}} importantForAccessibility="no" accessibilityElementsHidden />
          {WIDTHS.map(wd => (
            <TouchableOpacity key={wd} onPress={() => setWidth(wd)} activeOpacity={0.7}
              accessibilityRole="button" accessibilityState={{selected: width === wd}} accessibilityLabel={`${t('whiteboard.brushSize')} ${wd}`}
              style={{width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: width === wd ? T.accent : T.border}}>
              <View style={{width: wd + 4, height: wd + 4, borderRadius: (wd + 4) / 2, backgroundColor: color}} accessibilityElementsHidden importantForAccessibility="no" />
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => setTool('bucket')} activeOpacity={0.7}
            accessibilityRole="button" accessibilityState={{selected: tool === 'bucket'}} accessibilityLabel={t('whiteboard.bucket')}
            style={{width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: tool === 'bucket' ? T.accentBg : 'transparent', borderColor: tool === 'bucket' ? T.accent : T.border}}>
            <Text style={{fontSize: fs(14)}} accessibilityElementsHidden importantForAccessibility="no">🪣</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <View style={{paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border}}>
        <ColorCarousel value={color} onChange={setColor} T={T} size={24} />
      </View>

      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('whiteboard.title')}
        accessibilityValue={{text: t('whiteboard.voStepValue', {px: voStep})}}
        accessibilityHint={t('whiteboard.voLearnHint')}
        onAccessibilityTap={voWhere}
        accessibilityActions={[
          {name: 'draw_up', label: t('whiteboard.voDrawUp')},
          {name: 'draw_down', label: t('whiteboard.voDrawDown')},
          {name: 'draw_left', label: t('whiteboard.voDrawLeft')},
          {name: 'draw_right', label: t('whiteboard.voDrawRight')},
          {name: 'move_up', label: t('whiteboard.voMoveUp')},
          {name: 'move_down', label: t('whiteboard.voMoveDown')},
          {name: 'move_left', label: t('whiteboard.voMoveLeft')},
          {name: 'move_right', label: t('whiteboard.voMoveRight')},
          {name: 'fill', label: t('whiteboard.voFill')},
          {name: 'shape_line', label: t('whiteboard.voPlaceShape', {shape: t('whiteboard.shapeLine')})},
          {name: 'shape_rect', label: t('whiteboard.voPlaceShape', {shape: t('whiteboard.shapeRect')})},
          {name: 'shape_ellipse', label: t('whiteboard.voPlaceShape', {shape: t('whiteboard.shapeEllipse')})},
          {name: 'poly_point', label: t('whiteboard.voPolyPoint')},
          {name: 'poly_finish', label: t('whiteboard.voPolyFinish')},
          {name: 'where', label: t('whiteboard.voWhere')},
          {name: 'recenter', label: t('whiteboard.voRecenter')},
          {name: 'commands', label: t('whiteboard.voCommands')},
          {name: 'undo', label: t('whiteboard.undo')},
          {name: 'clear', label: t('whiteboard.clear')},
        ]}
        onAccessibilityAction={(e) => {
          switch (e.nativeEvent.actionName) {
            case 'increment': voStepChange(10); break;
            case 'decrement': voStepChange(-10); break;
            case 'draw_up': voMove(0, -1, 'whiteboard.voUp', true); break;
            case 'draw_down': voMove(0, 1, 'whiteboard.voDown', true); break;
            case 'draw_left': voMove(-1, 0, 'whiteboard.voLeft', true); break;
            case 'draw_right': voMove(1, 0, 'whiteboard.voRight', true); break;
            case 'move_up': voMove(0, -1, 'whiteboard.voUp', false); break;
            case 'move_down': voMove(0, 1, 'whiteboard.voDown', false); break;
            case 'move_left': voMove(-1, 0, 'whiteboard.voLeft', false); break;
            case 'move_right': voMove(1, 0, 'whiteboard.voRight', false); break;
            case 'fill': voStrokeIdRef.current = null; bucketFill(voCursorRef.current.x, voCursorRef.current.y); voAnnounce(t('whiteboard.voFilled')); break;
            case 'shape_line': voPlaceShape('line'); break;
            case 'shape_rect': voPlaceShape('rect'); break;
            case 'shape_ellipse': voPlaceShape('ellipse'); break;
            case 'poly_point': voPolyPoint(); break;
            case 'poly_finish': voPolyFinish(); break;
            case 'where': voWhere(); break;
            case 'recenter': voRecenter(); break;
            case 'commands': setVoHelpOpen(true); break;
            case 'undo': voStrokeIdRef.current = null; undo(); break;
            case 'clear': voStrokeIdRef.current = null; clearAll(); break;
          }
        }}
        style={{flex: 1, overflow: 'hidden', backgroundColor: T.card}}
        onLayout={(e) => {
          const {width: w, height: h} = e.nativeEvent.layout;
          viewportRef.current = {...viewportRef.current, w, h};
        }}
        {...responder.panHandlers}>
        <Svg width="100%" height="100%" pointerEvents="none">
          <G transform={`translate(${viewportRef.current.w / 2 + view.tx}, ${viewportRef.current.h / 2 + view.ty}) scale(${view.scale})`}>
            {paths.map(p => p.w === -1 ? (
              <Path key={p.id} d={`M ${-HALF} ${-HALF} H ${HALF} V ${HALF} H ${-HALF} Z`} fill={p.c} stroke="none" />
            ) : p.w === -2 ? (
              <Path key={p.id} d={`${p.d} Z`} fill={p.c} stroke="none" />
            ) : (
              <Path key={p.id} d={p.d} stroke={p.c} strokeWidth={p.w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            ))}
            <Path d={`M ${-HALF} ${-HALF} H ${HALF} V ${HALF} H ${-HALF} Z`} fill="none" stroke={T.border} strokeWidth={2 / view.scale} />
            {currentPath ? (
              <Path d={currentPath} stroke={current!.c} strokeWidth={current!.w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            ) : null}
            {srEnabled ? (
              <Path d={`M ${voCursor.x - 14} ${voCursor.y} H ${voCursor.x + 14} M ${voCursor.x} ${voCursor.y - 14} V ${voCursor.y + 14}`} stroke={T.accent} strokeWidth={2 / view.scale} strokeLinecap="round" />
            ) : null}
          </G>
        </Svg>
      </View>
      <Modal visible={voHelpOpen} transparent animationType="fade" onRequestClose={() => setVoHelpOpen(false)}>
        <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24}}>
          <View style={{backgroundColor: T.card, borderRadius: 12, padding: 16, maxHeight: '80%'}}>
            <Text accessibilityRole="header" style={{fontSize: fs(17), fontWeight: '700', color: T.text, marginBottom: 8}}>{t('whiteboard.voCommands')}</Text>
            <ScrollView>
              <Text style={{fontSize: fs(13), color: T.dim, marginBottom: 12}}>{t('whiteboard.voHint')}</Text>
              {[
                t('whiteboard.voDrawUp'), t('whiteboard.voDrawDown'), t('whiteboard.voDrawLeft'), t('whiteboard.voDrawRight'),
                t('whiteboard.voMoveUp'), t('whiteboard.voMoveDown'), t('whiteboard.voMoveLeft'), t('whiteboard.voMoveRight'),
                t('whiteboard.voFill'),
                t('whiteboard.voPlaceShape', {shape: t('whiteboard.shapeLine')}),
                t('whiteboard.voPlaceShape', {shape: t('whiteboard.shapeRect')}),
                t('whiteboard.voPlaceShape', {shape: t('whiteboard.shapeEllipse')}),
                t('whiteboard.voPolyPoint'),
                t('whiteboard.voPolyFinish'),
                t('whiteboard.voWhere'), t('whiteboard.voRecenter'),
                t('whiteboard.undo'), t('whiteboard.clear'),
              ].map((c, i) => (
                <Text key={i} style={{fontSize: fs(15), color: T.text, paddingVertical: 6}}>{`• ${c}`}</Text>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setVoHelpOpen(false)} accessibilityRole="button" accessibilityLabel={t('common.close')} style={{marginTop: 12, alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 12}}>
              <Text style={{fontSize: fs(15), color: T.accent, fontWeight: '600'}}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};
