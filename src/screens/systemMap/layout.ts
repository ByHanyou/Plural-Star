import {Member, Relationship, clamp, pushTo, relationshipDegrees} from '../../utils';

export interface MapNode {
  id: string;
  x: number;
  y: number;
  r: number;
}

export type MapPoint = {x: number; y: number};

export const WORLD = 4000;
export const HALF = WORLD / 2;
export const MAP_CAP = HALF - 80;
export const MIN_SCALE = 0.05;
export const MAX_SCALE = 3;

export const clampMapScale = (s: number): number => clamp(s, MIN_SCALE, MAX_SCALE);
export const clampMapCoord = (v: number): number => clamp(v, -MAP_CAP, MAP_CAP);

const SPIRAL_STEP = 46;
const GOLDEN_ANGLE = 2.39996;
const GRID_CELL = 150;
const REPEL = 5200;
const SPRING = 0.04;
const SPRING_LENGTH = 110;
const GRAVITY = 0.012;

const iterationsFor = (n: number): number => (n > 800 ? 40 : n > 250 ? 60 : n > 120 ? 120 : 220);

export const buildLayout = (ms: Member[], rels: Relationship[]): {nodes: MapNode[]; byId: Map<string, MapNode>; maxExtent: number} => {
  const ids = ms.map(m => m.id);
  const degrees = relationshipDegrees(ids, rels);
  const order = [...ids].sort((a, b) => (degrees[b] || 0) - (degrees[a] || 0));
  const idx = new Map(order.map((id, i) => [id, i]));
  const n = order.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const rad = SPIRAL_STEP * Math.sqrt(i);
    const ang = i * GOLDEN_ANGLE;
    xs[i] = rad * Math.cos(ang);
    ys[i] = rad * Math.sin(ang);
  }
  const edges: [number, number][] = [];
  for (const rel of rels) {
    const a = idx.get(rel.fromId);
    const b = idx.get(rel.toId);
    if (a !== undefined && b !== undefined && a !== b) edges.push([a, b]);
  }
  const iterations = iterationsFor(n);
  const useGrid = n > 250;
  const repel = (i: number, j: number, fx: Float64Array, fy: Float64Array) => {
    let dx = xs[i] - xs[j];
    let dy = ys[i] - ys[j];
    const d2 = Math.max(1, dx * dx + dy * dy);
    const d = Math.sqrt(d2);
    const f = REPEL / d2;
    dx /= d;
    dy /= d;
    fx[i] += dx * f;
    fy[i] += dy * f;
    fx[j] -= dx * f;
    fy[j] -= dy * f;
  };
  for (let it = 0; it < iterations; it++) {
    const fx = new Float64Array(n);
    const fy = new Float64Array(n);
    if (useGrid) {
      const grid = new Map<string, number[]>();
      const cellX = new Int32Array(n);
      const cellY = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        cellX[i] = Math.floor(xs[i] / GRID_CELL);
        cellY[i] = Math.floor(ys[i] / GRID_CELL);
        const key = `${cellX[i]},${cellY[i]}`;
        pushTo(grid, key, i);
      }
      for (let i = 0; i < n; i++) {
        for (let gx = cellX[i] - 1; gx <= cellX[i] + 1; gx++) {
          for (let gy = cellY[i] - 1; gy <= cellY[i] + 1; gy++) {
            for (const j of grid.get(`${gx},${gy}`) || []) {
              if (j > i) repel(i, j, fx, fy);
            }
          }
        }
      }
    } else {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) repel(i, j, fx, fy);
      }
    }
    for (const [a, b] of edges) {
      let dx = xs[b] - xs[a];
      let dy = ys[b] - ys[a];
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = SPRING * (d - SPRING_LENGTH);
      dx /= d;
      dy /= d;
      fx[a] += dx * f;
      fy[a] += dy * f;
      fx[b] -= dx * f;
      fy[b] -= dy * f;
    }
    const maxStep = 24 * (1 - it / iterations) + 2;
    for (let i = 1; i < n; i++) {
      fx[i] -= xs[i] * GRAVITY;
      fy[i] -= ys[i] * GRAVITY;
      const mag = Math.hypot(fx[i], fy[i]) || 1;
      const step = Math.min(maxStep, mag);
      xs[i] = clampMapCoord(xs[i] + (fx[i] / mag) * step);
      ys[i] = clampMapCoord(ys[i] + (fy[i] / mag) * step);
    }
  }
  const nodes: MapNode[] = order.map((id, i) => ({id, x: xs[i], y: ys[i], r: 12 + Math.min(degrees[id] || 0, 10) * 2}));
  const byId = new Map(nodes.map(node => [node.id, node]));
  let maxExtent = 120;
  for (const node of nodes) {
    maxExtent = Math.max(maxExtent, Math.abs(node.x) + node.r + 40, Math.abs(node.y) + node.r + 40);
  }
  return {nodes, byId, maxExtent};
};
