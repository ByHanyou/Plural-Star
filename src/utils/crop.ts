import {clamp} from './collections';

export const CROP_MIN_SIZE = 40;

export const CROP_CORNERS = ['tl', 'tr', 'bl', 'br'] as const;
export type CropCorner = (typeof CROP_CORNERS)[number];
export type CropMode = 'move' | CropCorner;

export interface CropRect { x: number; y: number; w: number; h: number; }
export type CropSize = {w: number; h: number};

export const isLeftCorner = (c: CropCorner): boolean => c === 'tl' || c === 'bl';
export const isTopCorner = (c: CropCorner): boolean => c === 'tl' || c === 'tr';
export const cornerPoint = (c: CropCorner, r: CropRect) => ({x: isLeftCorner(c) ? r.x : r.x + r.w, y: isTopCorner(c) ? r.y : r.y + r.h});

export const containRect = (natural: CropSize, box: CropSize): CropRect => {
  const scale = Math.min(box.w / natural.w, box.h / natural.h);
  const w = natural.w * scale;
  const h = natural.h * scale;
  return {x: (box.w - w) / 2, y: (box.h - h) / 2, w, h};
};

export const clampCropRect = (r: CropRect, d: CropRect): CropRect => {
  const w = clamp(r.w, CROP_MIN_SIZE, d.w);
  const h = clamp(r.h, CROP_MIN_SIZE, d.h);
  const x = clamp(r.x, d.x, d.x + d.w - w);
  const y = clamp(r.y, d.y, d.y + d.h - h);
  return {x, y, w, h};
};

export const dragCropRect = (mode: CropMode, s: CropRect, dx: number, dy: number, d: CropRect): CropRect => {
  if (mode === 'move') return clampCropRect({...s, x: s.x + dx, y: s.y + dy}, d);
  let {x, y, w, h} = s;
  if (isLeftCorner(mode)) { x = s.x + dx; w = s.w - dx; } else { w = s.w + dx; }
  if (isTopCorner(mode)) { y = s.y + dy; h = s.h - dy; } else { h = s.h + dy; }
  if (w < CROP_MIN_SIZE) { if (isLeftCorner(mode)) x = s.x + s.w - CROP_MIN_SIZE; w = CROP_MIN_SIZE; }
  if (h < CROP_MIN_SIZE) { if (isTopCorner(mode)) y = s.y + s.h - CROP_MIN_SIZE; h = CROP_MIN_SIZE; }
  const x1 = Math.max(d.x, x);
  const y1 = Math.max(d.y, y);
  const x2 = Math.min(d.x + d.w, x + w);
  const y2 = Math.min(d.y + d.h, y + h);
  return {x: x1, y: y1, w: Math.max(CROP_MIN_SIZE, x2 - x1), h: Math.max(CROP_MIN_SIZE, y2 - y1)};
};

export const stepCropArea = (r: CropRect, d: CropRect, step: number, dx: number, dy: number, grow: number): CropRect => {
  const w = clamp(r.w + grow * d.w * step, CROP_MIN_SIZE, d.w);
  const h = clamp(r.h + grow * d.h * step, CROP_MIN_SIZE, d.h);
  return clampCropRect({x: r.x + (r.w - w) / 2 + dx * d.w * step, y: r.y + (r.h - h) / 2 + dy * d.h * step, w, h}, d);
};

export const stepCropCorner = (r: CropRect, d: CropRect, step: number, corner: CropCorner, dx: number, dy: number): CropRect => {
  let left = r.x, top = r.y, right = r.x + r.w, bottom = r.y + r.h;
  if (isLeftCorner(corner)) left = clamp(left + dx * d.w * step, d.x, right - CROP_MIN_SIZE);
  else right = Math.min(d.x + d.w, Math.max(left + CROP_MIN_SIZE, right + dx * d.w * step));
  if (isTopCorner(corner)) top = clamp(top + dy * d.h * step, d.y, bottom - CROP_MIN_SIZE);
  else bottom = Math.min(d.y + d.h, Math.max(top + CROP_MIN_SIZE, bottom + dy * d.h * step));
  return {x: left, y: top, w: right - left, h: bottom - top};
};

export const cropPixels = (r: CropRect, d: CropRect, natural: CropSize) => {
  const sx = natural.w / d.w;
  const sy = natural.h / d.h;
  const x = Math.max(0, Math.round((r.x - d.x) * sx));
  const y = Math.max(0, Math.round((r.y - d.y) * sy));
  return {
    x,
    y,
    width: clamp(Math.round(r.w * sx), 1, natural.w - x),
    height: clamp(Math.round(r.h * sy), 1, natural.h - y),
  };
};
