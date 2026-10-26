import {WhiteboardStroke, clamp, uid} from '../utils';
import {traceEnclosedRegion} from '../utils/floodFill';

export const WORLD = 8000;
export const HALF = WORLD / 2;
export const MIN_SCALE = 0.05;
export const MAX_SCALE = 6;
export const ZOOM_IN_STEP = 1.25;
export const ZOOM_OUT_STEP = 0.8;
export const WIDTHS = [1, 3, 6, 12, 15];
export const BOARD_FILL = -1;
export const REGION_FILL = -2;
export const BOARD_PATH = `M ${-HALF} ${-HALF} H ${HALF} V ${HALF} H ${-HALF} Z`;

export type ShapeTool = 'line' | 'rect' | 'ellipse';
export type Tool = 'draw' | 'move' | 'erase' | 'bucket' | 'poly' | ShapeTool;

export const isShapeTool = (tl: Tool): tl is ShapeTool => tl === 'line' || tl === 'rect' || tl === 'ellipse';

export const shapePts = (shape: ShapeTool, x0: number, y0: number, x1: number, y1: number): number[] => {
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

export const strokePath = (pts: number[]): string => {
  if (pts.length < 2) return '';
  let d = `M ${pts[0]} ${pts[1]}`;
  if (pts.length === 2) d += ` L ${pts[0] + 0.1} ${pts[1] + 0.1}`;
  for (let i = 2; i < pts.length; i += 2) d += ` L ${pts[i]} ${pts[i + 1]}`;
  return d;
};

export const strokeAttrs = (s: Pick<WhiteboardStroke, 'c' | 'w' | 'pts'>) =>
  s.w === BOARD_FILL ? {d: BOARD_PATH, fill: s.c, stroke: 'none'}
  : s.w === REGION_FILL ? {d: `${strokePath(s.pts)} Z`, fill: s.c, stroke: 'none'}
  : {d: strokePath(s.pts), fill: 'none', stroke: s.c, strokeWidth: s.w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};

export const clampWorld = (v: number): number => clamp(Math.round(v), -HALF + 20, HALF - 20);

export const clampScale = (scale: number): number => clamp(scale, MIN_SCALE, MAX_SCALE);

export const polyCloseThreshold = (scale: number): number => Math.max(12, 16 / scale);

export const closePolygon = (pts: number[] | null): number[] | null =>
  !pts || pts.length < 4 ? null : pts.length >= 6 ? [...pts, pts[0], pts[1]] : pts;

export const extendStroke = (cur: WhiteboardStroke, x: number, y: number, scale: number): WhiteboardStroke | null => {
  const n = cur.pts.length;
  return Math.hypot(x - cur.pts[n - 2], y - cur.pts[n - 1]) >= Math.max(1, 1.5 / scale) ? {...cur, pts: [...cur.pts, x, y]} : null;
};

export const isShapeTap = (shapeStarted: boolean, cur: WhiteboardStroke | null): boolean => shapeStarted && cur !== null && cur.pts.length <= 2;

export const eraseStrokes = (strokes: WhiteboardStroke[], wx: number, wy: number, radius: number): WhiteboardStroke[] =>
  strokes.filter(s => {
    if (s.w === BOARD_FILL) return true;
    for (let i = 0; i < s.pts.length; i += 2) {
      if (Math.hypot(s.pts[i] - wx, s.pts[i + 1] - wy) < radius + Math.max(s.w, 0) / 2) return false;
    }
    return true;
  });

export const bucketFill = (wx: number, wy: number, strokes: WhiteboardStroke[], color: string): WhiteboardStroke | null => {
  const region = traceEnclosedRegion(wx, wy, strokes);
  if (region === null) return null;
  return Array.isArray(region)
    ? {id: uid(), c: color, w: REGION_FILL, pts: region}
    : {id: uid(), c: color, w: BOARD_FILL, pts: [0, 0, 0, 0]};
};

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const strokesViewBox = (strokes: WhiteboardStroke[], pad = 40): ViewBox => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let boardFill = false;
  for (const s of strokes) {
    if (!s || !Array.isArray(s.pts)) continue;
    if (s.w === BOARD_FILL) { boardFill = true; continue; }
    for (let i = 0; i + 1 < s.pts.length; i += 2) {
      minX = Math.min(minX, s.pts[i]);
      maxX = Math.max(maxX, s.pts[i]);
      minY = Math.min(minY, s.pts[i + 1]);
      maxY = Math.max(maxY, s.pts[i + 1]);
    }
  }
  if (!Number.isFinite(minX) || boardFill) { minX = -HALF; minY = -HALF; maxX = HALF; maxY = HALF; }
  return {x: minX - pad, y: minY - pad, w: Math.max(1, maxX - minX + pad * 2), h: Math.max(1, maxY - minY + pad * 2)};
};

export const viewBoxAttr = (b: ViewBox): string => `${b.x} ${b.y} ${b.w} ${b.h}`;
