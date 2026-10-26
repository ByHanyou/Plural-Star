import {encodeUTF8} from '../network/bytes';
import {sleep} from '../utils/concurrency';
import {asRecord} from '../utils';

const AMPAR_MAGIC = [0x41, 0x4d, 0x50, 0x41, 0x52, 0x00];

export const isAmparBytes = (b: Uint8Array): boolean =>
  !!b && b.length > 10 && AMPAR_MAGIC.every((c, i) => b[i] === c);

const DECODE_YIELD_EVERY = 200;

const AMPAR_KEEP_TABLES = new Set(['__config', 'systems', 'members', 'frontingEntries', 'customFields', 'tags', 'journalPosts', 'boardMessages']);

const detachBuffers = (v: unknown, depth = 0): unknown => {
  if (depth > 12 || v === null || typeof v !== 'object') return v;
  if (v instanceof Uint8Array) return Uint8Array.from(v);
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) v[i] = detachBuffers(v[i], depth + 1);
    return v;
  }
  const o = asRecord(v);
  if (o) for (const k of Object.keys(o)) o[k] = detachBuffers(o[k], depth + 1);
  return v;
};

const decodeAmpar = async (bytes: Uint8Array): Promise<{table: string; data: unknown}[]> => {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 10;

  const timestamp = (len: number): number => {
    if (len === 4) { const s = dv.getUint32(p); p += 4; return s * 1000; }
    if (len === 8) {
      const hi = dv.getUint32(p); const lo = dv.getUint32(p + 4); p += 8;
      const ns = hi >>> 2;
      const sec = (hi & 0x3) * 4294967296 + lo;
      return sec * 1000 + Math.floor(ns / 1e6);
    }
    if (len === 12) {
      const ns = dv.getUint32(p); const sec = Number(dv.getBigInt64(p + 4)); p += 12;
      return sec * 1000 + Math.floor(ns / 1e6);
    }
    p += len;
    return 0;
  };

  const read = (): unknown => {
    const c = bytes[p++];
    if (c <= 0x7f) return c;
    if (c >= 0xe0) return c - 256;
    if (c >= 0x80 && c <= 0x8f) return map(c & 0x0f);
    if (c >= 0x90 && c <= 0x9f) return arr(c & 0x0f);
    if (c >= 0xa0 && c <= 0xbf) return str(c & 0x1f);
    switch (c) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xc4: return bin(dv.getUint8(p), 1);
      case 0xc5: return bin(dv.getUint16(p), 2);
      case 0xc6: return bin(dv.getUint32(p), 4);
      case 0xc7: { const l = dv.getUint8(p); const t = dv.getInt8(p + 1); p += 2; return ext(t, l); }
      case 0xc8: { const l = dv.getUint16(p); const t = dv.getInt8(p + 2); p += 3; return ext(t, l); }
      case 0xc9: { const l = dv.getUint32(p); const t = dv.getInt8(p + 4); p += 5; return ext(t, l); }
      case 0xca: { const v = dv.getFloat32(p); p += 4; return v; }
      case 0xcb: { const v = dv.getFloat64(p); p += 8; return v; }
      case 0xcc: return dv.getUint8(p++);
      case 0xcd: { const v = dv.getUint16(p); p += 2; return v; }
      case 0xce: { const v = dv.getUint32(p); p += 4; return v; }
      case 0xcf: { const v = Number(dv.getBigUint64(p)); p += 8; return v; }
      case 0xd0: return dv.getInt8(p++);
      case 0xd1: { const v = dv.getInt16(p); p += 2; return v; }
      case 0xd2: { const v = dv.getInt32(p); p += 4; return v; }
      case 0xd3: { const v = Number(dv.getBigInt64(p)); p += 8; return v; }
      case 0xd4: { const t = dv.getInt8(p++); return ext(t, 1); }
      case 0xd5: { const t = dv.getInt8(p++); return ext(t, 2); }
      case 0xd6: { const t = dv.getInt8(p++); return ext(t, 4); }
      case 0xd7: { const t = dv.getInt8(p++); return ext(t, 8); }
      case 0xd8: { const t = dv.getInt8(p++); return ext(t, 16); }
      case 0xd9: { const l = dv.getUint8(p); p += 1; return str(l); }
      case 0xda: { const l = dv.getUint16(p); p += 2; return str(l); }
      case 0xdb: { const l = dv.getUint32(p); p += 4; return str(l); }
      case 0xdc: { const l = dv.getUint16(p); p += 2; return arr(l); }
      case 0xdd: { const l = dv.getUint32(p); p += 4; return arr(l); }
      case 0xde: { const l = dv.getUint16(p); p += 2; return map(l); }
      case 0xdf: { const l = dv.getUint32(p); p += 4; return map(l); }
      default: throw new Error(`ampar: unsupported byte 0x${c.toString(16)} at ${p - 1}`);
    }
  };
  const ext = (type: number, len: number): number | Uint8Array => {
    if (type === -1) return timestamp(len);
    const raw = bytes.subarray(p, p + len); p += len;
    return raw;
  };
  const str = (len: number): string => { const s = encodeUTF8(bytes.subarray(p, p + len)); p += len; return s; };
  const bin = (len: number, skip: number): Uint8Array => { p += skip; const s = bytes.subarray(p, p + len); p += len; return s; };
  const arr = (len: number): unknown[] => { const o: unknown[] = []; for (let i = 0; i < len; i++) o.push(read()); return o; };
  const map = (len: number): Record<string, unknown> => {
    const o: Record<string, unknown> = {};
    for (let i = 0; i < len; i++) {
      const k = read();
      const v = read();
      const key = typeof k === 'string' ? k : String(k);
      if (key !== '__proto__') o[key] = v;
    }
    return o;
  };

  const out: {table: string; data: unknown}[] = [];
  let n = 0;
  while (p < bytes.length) {
    const rec = asRecord(read());
    if (rec && typeof rec.table === 'string' && AMPAR_KEEP_TABLES.has(rec.table)) {
      detachBuffers(rec);
      out.push({table: rec.table, data: rec.data});
    }
    if (++n % DECODE_YIELD_EVERY === 0) await sleep(0);
  }
  return out;
};

export const amparTables = async (bytes: Uint8Array): Promise<Record<string, unknown[]>> => {
  const byTable: Record<string, unknown[]> = {};
  for (const r of await decodeAmpar(bytes)) (byTable[r.table] = byTable[r.table] || []).push(r.data);
  return byTable;
};
