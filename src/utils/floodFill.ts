export const traceEnclosedRegion = (
  wx: number,
  wy: number,
  strokes: {w: number; pts: number[]}[],
): number[] | 'open' | null => {
  const walls = strokes.filter(s => s.w > 0 && s.pts.length >= 4);
  if (walls.length === 0) return 'open';

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of walls) {
    for (let i = 0; i + 1 < s.pts.length; i += 2) {
      const x = s.pts[i], y = s.pts[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const MARGIN = 40;
  minX -= MARGIN; minY -= MARGIN; maxX += MARGIN; maxY += MARGIN;
  if (wx <= minX || wx >= maxX || wy <= minY || wy >= maxY) return 'open';

  const span = Math.max(maxX - minX, maxY - minY);
  const cell = Math.max(0.5, span / 512);
  const W = Math.min(1024, Math.ceil((maxX - minX) / cell) + 1);
  const H = Math.min(1024, Math.ceil((maxY - minY) / cell) + 1);
  const grid = new Uint8Array(W * H);
  const toCX = (x: number) => Math.max(0, Math.min(W - 1, Math.floor((x - minX) / cell)));
  const toCY = (y: number) => Math.max(0, Math.min(H - 1, Math.floor((y - minY) / cell)));

  for (const s of walls) {
    const r = Math.max(1, Math.round(s.w / 2 / cell));
    const r2 = r * r + r;
    for (let i = 0; i + 3 < s.pts.length; i += 2) {
      const x1 = s.pts[i], y1 = s.pts[i + 1], x2 = s.pts[i + 2], y2 = s.pts[i + 3];
      const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (cell / 2)));
      for (let t = 0; t <= steps; t++) {
        const cx = toCX(x1 + ((x2 - x1) * t) / steps);
        const cy = toCY(y1 + ((y2 - y1) * t) / steps);
        for (let oy = -r; oy <= r; oy++) {
          for (let ox = -r; ox <= r; ox++) {
            if (ox * ox + oy * oy > r2) continue;
            const gx = cx + ox, gy = cy + oy;
            if (gx >= 0 && gx < W && gy >= 0 && gy < H) grid[gy * W + gx] = 1;
          }
        }
      }
    }
  }

  let sx = toCX(wx), sy = toCY(wy);
  if (grid[sy * W + sx] === 1) {
    let found = false;
    for (let rad = 1; rad <= 4 && !found; rad++) {
      for (let oy = -rad; oy <= rad && !found; oy++) {
        for (let ox = -rad; ox <= rad && !found; ox++) {
          const gx = sx + ox, gy = sy + oy;
          if (gx >= 0 && gx < W && gy >= 0 && gy < H && grid[gy * W + gx] === 0) {
            sx = gx; sy = gy; found = true;
          }
        }
      }
    }
    if (!found) return null;
  }

  const queue = new Int32Array(W * H);
  let qh = 0, qt = 0;
  queue[qt++] = sy * W + sx;
  grid[sy * W + sx] = 2;
  while (qh < qt) {
    const idx = queue[qh++];
    const cy0 = (idx / W) | 0, cx0 = idx % W;
    if (cx0 === 0 || cy0 === 0 || cx0 === W - 1 || cy0 === H - 1) return 'open';
    const n1 = idx - 1, n2 = idx + 1, n3 = idx - W, n4 = idx + W;
    if (grid[n1] === 0) { grid[n1] = 2; queue[qt++] = n1; }
    if (grid[n2] === 0) { grid[n2] = 2; queue[qt++] = n2; }
    if (grid[n3] === 0) { grid[n3] = 2; queue[qt++] = n3; }
    if (grid[n4] === 0) { grid[n4] = 2; queue[qt++] = n4; }
  }

  const edges = new Map<number, number[]>();
  const vkey = (x: number, y: number) => y * (W + 1) + x;
  const addEdge = (x1: number, y1: number, x2: number, y2: number) => {
    const k = vkey(x1, y1);
    const list = edges.get(k);
    if (list) list.push(vkey(x2, y2));
    else edges.set(k, [vkey(x2, y2)]);
  };
  const flooded = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H && grid[y * W + x] === 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (grid[y * W + x] !== 2) continue;
      if (!flooded(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!flooded(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
      if (!flooded(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!flooded(x - 1, y)) addEdge(x, y + 1, x, y);
    }
  }
  let best: number[] | null = null;
  let bestSpan = -1;
  while (edges.size > 0) {
    const start: number = edges.keys().next().value as number;
    const loop: number[] = [start];
    let cur = start;
    for (;;) {
      const nexts = edges.get(cur);
      if (!nexts || nexts.length === 0) { edges.delete(cur); break; }
      const nxt = nexts.pop() as number;
      if (nexts.length === 0) edges.delete(cur);
      if (nxt === start) break;
      loop.push(nxt);
      cur = nxt;
    }
    if (loop.length >= 4) {
      let lminx = Infinity, lmaxx = -Infinity, lminy = Infinity, lmaxy = -Infinity;
      for (const v of loop) {
        const vx = v % (W + 1), vy = (v / (W + 1)) | 0;
        if (vx < lminx) lminx = vx;
        if (vx > lmaxx) lmaxx = vx;
        if (vy < lminy) lminy = vy;
        if (vy > lmaxy) lmaxy = vy;
      }
      const spanL = (lmaxx - lminx) + (lmaxy - lminy);
      if (spanL > bestSpan) { bestSpan = spanL; best = loop; }
    }
  }
  if (!best) return null;

  const raw: number[] = [];
  for (const v of best) {
    raw.push((v % (W + 1)) * cell + minX, ((v / (W + 1)) | 0) * cell + minY);
  }
  const merged: number[] = [];
  const n = raw.length / 2;
  for (let i = 0; i < n; i++) {
    const px = raw[((i - 1 + n) % n) * 2], py = raw[((i - 1 + n) % n) * 2 + 1];
    const cx = raw[i * 2], cy = raw[i * 2 + 1];
    const nx = raw[((i + 1) % n) * 2], ny = raw[((i + 1) % n) * 2 + 1];
    if ((cx - px) * (ny - cy) - (cy - py) * (nx - cx) !== 0) merged.push(cx, cy);
  }
  const MAX_PTS = 400;
  const total = merged.length / 2;
  if (total <= MAX_PTS) return merged;
  const out: number[] = [];
  const stride = total / MAX_PTS;
  for (let i = 0; i < total; i += stride) {
    const j = Math.floor(i) * 2;
    out.push(merged[j], merged[j + 1]);
  }
  return out;
};
