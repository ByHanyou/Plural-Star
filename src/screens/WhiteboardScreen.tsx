import React, {useState, useEffect, useMemo, useRef} from 'react';
import {View, PanResponder, AccessibilityInfo} from 'react-native';
import Svg, {G, Path} from 'react-native-svg';
import {useTranslation} from 'react-i18next';
import {clamp, uid, WhiteboardStroke} from '../utils';
import {useTheme} from '../themeContext';
import {logError} from '../utils/log';
import {confirmSteps} from '../utils/confirmSteps';
import {BOARD_PATH, ShapeTool, Tool, WIDTHS, bucketFill, clampScale, clampWorld, closePolygon, eraseStrokes, extendStroke, isShapeTap, isShapeTool, polyCloseThreshold, shapePts, strokeAttrs, strokePath} from '../whiteboard/geometry';
import {ColorCarousel} from '../components/ColorCarousel';
import {useWhiteboardStrokes} from '../hooks/useWhiteboardStrokes';
import {VoCommandsHelp, WhiteboardHeader, WhiteboardToolbar} from './whiteboard/WhiteboardParts';

interface Props {
  onBack: () => void;
}

type Point = {x: number; y: number};

const SHAPE_KEY: Record<ShapeTool, string> = {line: 'whiteboard.shapeLine', rect: 'whiteboard.shapeRect', ellipse: 'whiteboard.shapeEllipse'};
const TAP_SLOP = 6;
const VO_STEP_MIN = 10;
const VO_STEP_MAX = 200;
const VO_FALLBACK_W = 360;
const VO_FALLBACK_H = 640;
const POLY_DOUBLE_TAP_MS = 350;

const isDrag = (dx: number, dy: number) => Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP;

export const WhiteboardScreen = ({onBack}: Props) => {
  const T = useTheme();
  const {t} = useTranslation();

  const {strokes, strokesRef, dirtyRef, persist, commit, addStroke, setUnsaved} = useWhiteboardStrokes();
  const [current, setCurrent] = useState<WhiteboardStroke | null>(null);
  const [color, setColor] = useState(T.text);
  const [width, setWidth] = useState(WIDTHS[2]);
  const [tool, setTool] = useState<Tool>('draw');
  const [view, setView] = useState({tx: 0, ty: 0, scale: 1});

  const currentRef = useRef<WhiteboardStroke | null>(null);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const colorRef = useRef(color);
  colorRef.current = color;
  const widthRef = useRef(width);
  widthRef.current = width;
  const viewportRef = useRef({x: 0, y: 0, w: 0, h: 0});
  const panRef = useRef({tx: 0, ty: 0, scale: 1, startTx: 0, startTy: 0, startScale: 1, startDist: 0, originX: 0, originY: 0});
  const bucketTapRef = useRef<{wx: number; wy: number; moved: boolean} | null>(null);
  const shapeStartRef = useRef<Point | null>(null);
  const polyTapRef = useRef<{wx: number; wy: number; moved: boolean} | null>(null);
  const polyPtsRef = useRef<number[] | null>(null);
  const polyIdRef = useRef<string | null>(null);
  const polyLastTapRef = useRef(0);

  const [voStep, setVoStep] = useState(40);
  const [voCursor, setVoCursor] = useState<Point>({x: 0, y: 0});
  const [srEnabled, setSrEnabled] = useState(false);
  const [voHelpOpen, setVoHelpOpen] = useState(false);
  const voStepRef = useRef(40);
  const voCursorRef = useRef<Point>({x: 0, y: 0});
  const voStrokeIdRef = useRef<string | null>(null);
  const setStep = (n: number) => { voStepRef.current = n; setVoStep(n); };
  const setCursor = (c: Point) => { voCursorRef.current = c; setVoCursor(c); };

  useEffect(() => {
    let on = true;
    AccessibilityInfo.isScreenReaderEnabled().then(v => { if (on) setSrEnabled(v); }).catch(e => logError('a11y', e));
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (v: boolean) => setSrEnabled(v));
    return () => { on = false; sub.remove(); };
  }, []);

  const showCurrent = (s: WhiteboardStroke | null) => {
    currentRef.current = s;
    setCurrent(s);
  };
  const newStroke = (pts: number[], id: string = uid()): WhiteboardStroke => ({id, c: colorRef.current, w: widthRef.current, pts});

  const toWorld = (localX: number, localY: number): [number, number] => {
    const vp = viewportRef.current;
    const p = panRef.current;
    return [
      (localX - vp.w / 2 - p.tx) / p.scale,
      (localY - vp.h / 2 - p.ty) / p.scale,
    ];
  };

  const cancelPoly = () => {
    polyTapRef.current = null;
    polyPtsRef.current = null;
    polyIdRef.current = null;
    showCurrent(null);
  };

  const finishPoly = () => {
    const pts = polyPtsRef.current;
    polyPtsRef.current = null;
    polyIdRef.current = null;
    showCurrent(null);
    const closed = closePolygon(pts);
    if (closed) addStroke(newStroke(closed));
  };

  const addPolyVertex = (wx: number, wy: number): void => {
    const cx = clampWorld(wx);
    const cy = clampWorld(wy);
    const pts = polyPtsRef.current;
    const now = Date.now();
    if (!pts) {
      polyPtsRef.current = [cx, cy];
      polyIdRef.current = uid();
      showCurrent(newStroke([cx, cy], polyIdRef.current));
      polyLastTapRef.current = now;
      return;
    }
    const closeThresh = polyCloseThreshold(panRef.current.scale);
    const lastDist = Math.hypot(cx - pts[pts.length - 2], cy - pts[pts.length - 1]);
    const nearFirst = Math.hypot(cx - pts[0], cy - pts[1]) <= closeThresh;
    const nearLast = lastDist <= closeThresh;
    if ((nearFirst && pts.length >= 6) || (nearLast && now - polyLastTapRef.current < POLY_DOUBLE_TAP_MS && pts.length >= 4)) {
      finishPoly();
      return;
    }
    polyLastTapRef.current = now;
    if (lastDist < 1) return;
    polyPtsRef.current = [...pts, cx, cy];
    showCurrent(newStroke(polyPtsRef.current, polyIdRef.current || uid()));
  };

  const selectTool = (next: Tool) => {
    if (next !== 'poly' && polyPtsRef.current) cancelPoly();
    setTool(next);
  };

  const eraseAt = (wx: number, wy: number) => {
    const survivors = eraseStrokes(strokesRef.current, wx, wy, widthRef.current);
    if (survivors.length !== strokesRef.current.length) setUnsaved(survivors);
  };

  const fillAt = (wx: number, wy: number): boolean => {
    const fill = bucketFill(wx, wy, strokesRef.current, colorRef.current);
    if (!fill) return false;
    addStroke(fill);
    return true;
  };

  const [responder] = useState(() => PanResponder.create({
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
      const tl = toolRef.current;
      if (tl === 'draw' || isShapeTool(tl)) {
        const x = clampWorld(wx);
        const y = clampWorld(wy);
        if (isShapeTool(tl)) shapeStartRef.current = {x, y};
        showCurrent(newStroke([x, y]));
      } else if (tl === 'erase') {
        eraseAt(wx, wy);
      } else if (tl === 'bucket') {
        bucketTapRef.current = {wx, wy, moved: false};
      } else if (tl === 'poly') {
        polyTapRef.current = {wx, wy, moved: false};
      }
    },
    onPanResponderMove: (evt, gs) => {
      const p = panRef.current;
      const touches = evt.nativeEvent.touches;
      if (touches.length >= 2) {
        if (currentRef.current) showCurrent(null);
        shapeStartRef.current = null;
        if (polyPtsRef.current) cancelPoly();
        if (bucketTapRef.current) bucketTapRef.current.moved = true;
        const dist = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY) || 1;
        if (p.startDist === 0) {
          p.startDist = dist;
          p.startScale = p.scale;
        } else {
          p.scale = clampScale(p.startScale * (dist / p.startDist));
          setView({tx: p.tx, ty: p.ty, scale: p.scale});
        }
        return;
      }
      const tl = toolRef.current;
      if (tl === 'move') {
        p.tx = p.startTx + gs.dx;
        p.ty = p.startTy + gs.dy;
        setView({tx: p.tx, ty: p.ty, scale: p.scale});
        return;
      }
      const [wx, wy] = toWorld(evt.nativeEvent.pageX - p.originX, evt.nativeEvent.pageY - p.originY);
      if (tl === 'erase') {
        eraseAt(wx, wy);
        return;
      }
      if (tl === 'bucket' || tl === 'poly') {
        const tap = tl === 'bucket' ? bucketTapRef.current : polyTapRef.current;
        if (tap && isDrag(gs.dx, gs.dy)) tap.moved = true;
        return;
      }
      const cur = currentRef.current;
      if (!cur) return;
      const cx = clampWorld(wx);
      const cy = clampWorld(wy);
      const start = shapeStartRef.current;
      if (start && isShapeTool(tl)) {
        showCurrent({...cur, pts: shapePts(tl, start.x, start.y, cx, cy)});
        return;
      }
      const extended = extendStroke(cur, cx, cy, p.scale);
      if (extended) showCurrent(extended);
    },
    onPanResponderRelease: () => {
      const tap = bucketTapRef.current;
      bucketTapRef.current = null;
      if (toolRef.current === 'bucket' && tap && !tap.moved) {
        fillAt(tap.wx, tap.wy);
        return;
      }
      if (toolRef.current === 'poly') {
        const pTap = polyTapRef.current;
        polyTapRef.current = null;
        if (pTap && !pTap.moved) addPolyVertex(pTap.wx, pTap.wy);
        return;
      }
      const cur = currentRef.current;
      const shapeTap = isShapeTap(shapeStartRef.current !== null, cur);
      shapeStartRef.current = null;
      showCurrent(null);
      if (cur && cur.pts.length >= 2 && !shapeTap) addStroke(cur);
      else if (toolRef.current === 'erase' && dirtyRef.current) persist(strokesRef.current);
    },
    onPanResponderTerminate: () => {
      bucketTapRef.current = null;
      shapeStartRef.current = null;
      polyTapRef.current = null;
      showCurrent(null);
    },
  }));

  const undo = () => {
    if (strokesRef.current.length === 0) return;
    commit(strokesRef.current.slice(0, -1));
  };

  const clearAll = () => {
    const action = t('common.delete');
    confirmSteps([
      {title: t('whiteboard.clearTitle'), message: t('whiteboard.clearMsg'), action},
      {title: t('whiteboard.clearConfirm2Title'), message: t('whiteboard.clearConfirm2Msg'), action},
      {title: t('whiteboard.clearConfirm3Title'), message: t('whiteboard.clearConfirm3Msg'), action},
    ], () => commit([]));
  };

  const halfViewport = () => ({hw: (viewportRef.current.w || VO_FALLBACK_W) / 2, hh: (viewportRef.current.h || VO_FALLBACK_H) / 2});

  const voAnnounce = (msg: string) => { setTimeout(() => AccessibilityInfo.announceForAccessibility(msg), 50); };

  const voPosText = (c: Point) => {
    const h = c.x >= 0 ? t('whiteboard.voPosRight', {n: c.x}) : t('whiteboard.voPosLeft', {n: -c.x});
    const v = c.y >= 0 ? t('whiteboard.voPosDown', {n: c.y}) : t('whiteboard.voPosUp', {n: -c.y});
    return t('whiteboard.voAt', {h, v});
  };
  const voReport = (a: string, c: Point) => voAnnounce(t('whiteboard.voTwoParts', {a, b: voPosText(c)}));

  const voMove = (dx: number, dy: number, dirKey: string, draw: boolean) => {
    const step = voStepRef.current;
    const prev = voCursorRef.current;
    const {hw, hh} = halfViewport();
    const next = {x: clamp(Math.round(prev.x + dx * step), -hw, hw), y: clamp(Math.round(prev.y + dy * step), -hh, hh)};
    setCursor(next);
    const dir = t(dirKey);
    if (!draw) {
      voStrokeIdRef.current = null;
      voReport(t('whiteboard.voMoved', {dir, dist: step}), next);
      return;
    }
    const id = voStrokeIdRef.current;
    if (id == null) {
      const s = newStroke([prev.x, prev.y, next.x, next.y]);
      voStrokeIdRef.current = s.id;
      addStroke(s);
    } else {
      commit(strokesRef.current.map(s => s.id === id ? {...s, pts: [...s.pts, next.x, next.y]} : s));
    }
    voReport(t('whiteboard.voDrew', {dir, dist: step}), next);
  };

  const voWhere = () => {
    const c = voCursorRef.current;
    const {hw, hh} = halfViewport();
    const edges = t('whiteboard.voEdges', {
      left: Math.round(hw + c.x), right: Math.round(hw - c.x),
      top: Math.round(hh + c.y), bottom: Math.round(hh - c.y),
    });
    voAnnounce(t('whiteboard.voTwoParts', {a: voPosText(c), b: edges}));
  };

  const voRecenter = () => {
    setCursor({x: 0, y: 0});
    voStrokeIdRef.current = null;
    voAnnounce(t('whiteboard.voRecentered'));
  };

  const voStepChange = (delta: number) => {
    const n = clamp(voStepRef.current + delta, VO_STEP_MIN, VO_STEP_MAX);
    setStep(n);
    voAnnounce(t('whiteboard.voStepValue', {px: n}));
  };

  const voPlaceShape = (shape: ShapeTool) => {
    voStrokeIdRef.current = null;
    const c = voCursorRef.current;
    const r = voStepRef.current;
    addStroke(newStroke(shape === 'line' ? shapePts('line', c.x - r, c.y, c.x + r, c.y) : shapePts(shape, c.x - r, c.y - r, c.x + r, c.y + r)));
    voReport(t('whiteboard.voPlacedShape', {shape: t(SHAPE_KEY[shape])}), c);
  };

  const voPolyPoint = () => {
    voStrokeIdRef.current = null;
    const c = voCursorRef.current;
    addPolyVertex(c.x, c.y);
    voReport(t('whiteboard.voPolyPointAdded'), c);
  };

  const voPolyFinish = () => {
    if (!polyPtsRef.current) return;
    finishPoly();
    voAnnounce(t('whiteboard.voPlacedShape', {shape: t('whiteboard.shapePoly')}));
  };

  const voFill = () => {
    voStrokeIdRef.current = null;
    voAnnounce(fillAt(voCursorRef.current.x, voCursorRef.current.y) ? t('whiteboard.voFilled') : t('whiteboard.voFillNone'));
  };

  const placeShapeLabel = (shape: ShapeTool) => t('whiteboard.voPlaceShape', {shape: t(SHAPE_KEY[shape])});
  const voCommands: {name: string; label: string; help: boolean; run: () => void}[] = [
    {name: 'draw_up', label: t('whiteboard.voDrawUp'), help: true, run: () => voMove(0, -1, 'whiteboard.voUp', true)},
    {name: 'draw_down', label: t('whiteboard.voDrawDown'), help: true, run: () => voMove(0, 1, 'whiteboard.voDown', true)},
    {name: 'draw_left', label: t('whiteboard.voDrawLeft'), help: true, run: () => voMove(-1, 0, 'whiteboard.voLeft', true)},
    {name: 'draw_right', label: t('whiteboard.voDrawRight'), help: true, run: () => voMove(1, 0, 'whiteboard.voRight', true)},
    {name: 'move_up', label: t('whiteboard.voMoveUp'), help: true, run: () => voMove(0, -1, 'whiteboard.voUp', false)},
    {name: 'move_down', label: t('whiteboard.voMoveDown'), help: true, run: () => voMove(0, 1, 'whiteboard.voDown', false)},
    {name: 'move_left', label: t('whiteboard.voMoveLeft'), help: true, run: () => voMove(-1, 0, 'whiteboard.voLeft', false)},
    {name: 'move_right', label: t('whiteboard.voMoveRight'), help: true, run: () => voMove(1, 0, 'whiteboard.voRight', false)},
    {name: 'fill', label: t('whiteboard.voFill'), help: true, run: voFill},
    {name: 'shape_line', label: placeShapeLabel('line'), help: true, run: () => voPlaceShape('line')},
    {name: 'shape_rect', label: placeShapeLabel('rect'), help: true, run: () => voPlaceShape('rect')},
    {name: 'shape_ellipse', label: placeShapeLabel('ellipse'), help: true, run: () => voPlaceShape('ellipse')},
    {name: 'poly_point', label: t('whiteboard.voPolyPoint'), help: true, run: voPolyPoint},
    {name: 'poly_finish', label: t('whiteboard.voPolyFinish'), help: true, run: voPolyFinish},
    {name: 'where', label: t('whiteboard.voWhere'), help: true, run: voWhere},
    {name: 'recenter', label: t('whiteboard.voRecenter'), help: true, run: voRecenter},
    {name: 'commands', label: t('whiteboard.voCommands'), help: false, run: () => setVoHelpOpen(true)},
    {name: 'undo', label: t('whiteboard.undo'), help: true, run: () => { voStrokeIdRef.current = null; undo(); }},
    {name: 'clear', label: t('whiteboard.clear'), help: true, run: () => { voStrokeIdRef.current = null; clearAll(); }},
  ];

  const onVoAction = (actionName: string) => {
    if (actionName === 'increment') voStepChange(10);
    else if (actionName === 'decrement') voStepChange(-10);
    else voCommands.find(c => c.name === actionName)?.run();
  };

  const zoomBy = (f: number) => {
    const p = panRef.current;
    p.scale = clampScale(p.scale * f);
    setView({tx: p.tx, ty: p.ty, scale: p.scale});
  };

  const paths = useMemo(() => strokes.map(s => ({id: s.id, ...strokeAttrs(s)})), [strokes]);

  return (
    <View style={{flex: 1, backgroundColor: T.bg}}>
      <WhiteboardHeader onBack={onBack} onUndo={undo} onZoom={zoomBy} onClear={clearAll} hasStrokes={strokes.length > 0} />

      <WhiteboardToolbar tool={tool} onTool={selectTool} width={width} onWidth={setWidth} color={color} />

      <View style={{paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border}}>
        <ColorCarousel value={color} onChange={setColor} size={24} />
      </View>

      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('whiteboard.title')}
        accessibilityValue={{text: t('whiteboard.voStepValue', {px: voStep})}}
        accessibilityHint={t('whiteboard.voLearnHint')}
        onAccessibilityTap={voWhere}
        accessibilityActions={[{name: 'increment'}, {name: 'decrement'}, ...voCommands.map(({name, label}) => ({name, label}))]}
        onAccessibilityAction={e => onVoAction(e.nativeEvent.actionName)}
        style={{flex: 1, overflow: 'hidden', backgroundColor: T.card}}
        onLayout={(e) => {
          const {width: w, height: h} = e.nativeEvent.layout;
          viewportRef.current = {...viewportRef.current, w, h};
        }}
        {...responder.panHandlers}>
        <Svg width="100%" height="100%" pointerEvents="none">
          <G transform={`translate(${viewportRef.current.w / 2 + view.tx}, ${viewportRef.current.h / 2 + view.ty}) scale(${view.scale})`}>
            {paths.map(({id, ...attrs}) => <Path key={id} {...attrs} />)}
            <Path d={BOARD_PATH} fill="none" stroke={T.border} strokeWidth={2 / view.scale} />
            {current ? (
              <Path d={strokePath(current.pts)} stroke={current.c} strokeWidth={current.w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            ) : null}
            {srEnabled ? (
              <Path d={`M ${voCursor.x - 14} ${voCursor.y} H ${voCursor.x + 14} M ${voCursor.x} ${voCursor.y - 14} V ${voCursor.y + 14}`} stroke={T.accent} strokeWidth={2 / view.scale} strokeLinecap="round" />
            ) : null}
          </G>
        </Svg>
      </View>
      <VoCommandsHelp visible={voHelpOpen} commands={voCommands} onClose={() => setVoHelpOpen(false)} />
    </View>
  );
};
