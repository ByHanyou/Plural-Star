const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

export const base64ToBytes = (b64: string): Uint8Array => {
  let pad = 0;
  if (b64.endsWith('==')) pad = 2;
  else if (b64.endsWith('=')) pad = 1;
  const out = new Uint8Array(Math.floor((b64.length * 3) / 4) + 3 - pad);
  let o = 0;
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < b64.length; i++) {
    const v = B64_LOOKUP[b64.charCodeAt(i)];
    if (v < 0) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
};

const utf8Decode = (bytes: Uint8Array, start: number, len: number): string => {
  let out = '';
  let i = start;
  const end = start + len;
  while (i < end) {
    const b = bytes[i++];
    if (b < 0x80) {
      out += String.fromCharCode(b);
    } else if (b < 0xe0) {
      const c = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
      out += String.fromCharCode(c);
    } else if (b < 0xf0) {
      const c = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      out += String.fromCharCode(c);
    } else {
      let c = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      c -= 0x10000;
      out += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff));
    }
  }
  return out;
};

class MsgpackDecoder {
  private bytes: Uint8Array;
  private view: DataView;
  pos: number;

  constructor(bytes: Uint8Array, pos = 0) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = pos;
  }

  eof(): boolean {
    return this.pos >= this.bytes.length;
  }

  private rdU8(): number { return this.bytes[this.pos++]; }
  private rdU16(): number { const v = this.view.getUint16(this.pos); this.pos += 2; return v; }
  private rdU32(): number { const v = this.view.getUint32(this.pos); this.pos += 4; return v; }
  private rdU64(): number { const hi = this.view.getUint32(this.pos); const lo = this.view.getUint32(this.pos + 4); this.pos += 8; return hi * 4294967296 + lo; }
  private rdI64(): number { const hi = this.view.getInt32(this.pos); const lo = this.view.getUint32(this.pos + 4); this.pos += 8; return hi * 4294967296 + lo; }

  private readStr(len: number): string { const s = utf8Decode(this.bytes, this.pos, len); this.pos += len; return s; }
  private readBin(len: number): Uint8Array { const slice = this.bytes.subarray(this.pos, this.pos + len); this.pos += len; return slice; }

  private readArray(len: number): any[] {
    const out = new Array(len);
    for (let i = 0; i < len; i++) out[i] = this.decode();
    return out;
  }

  private readMap(len: number): Record<string, any> {
    const out: Record<string, any> = {};
    for (let i = 0; i < len; i++) {
      const k = this.decode();
      const v = this.decode();
      out[typeof k === 'string' ? k : String(k)] = v;
    }
    return out;
  }

  private readExt(type: number, len: number): any {
    if (type === -1) return this.readTimestamp(len);
    const data = this.bytes.subarray(this.pos, this.pos + len);
    this.pos += len;
    return {__ext: type, data};
  }

  private readTimestamp(len: number): number {
    if (len === 4) {
      const sec = this.view.getUint32(this.pos);
      this.pos += 4;
      return sec * 1000;
    }
    if (len === 8) {
      const hi = this.view.getUint32(this.pos);
      const lo = this.view.getUint32(this.pos + 4);
      this.pos += 8;
      const nsec = hi >>> 2;
      const sec = (hi & 0x3) * 4294967296 + lo;
      return sec * 1000 + Math.floor(nsec / 1e6);
    }
    if (len === 12) {
      const nsec = this.view.getUint32(this.pos);
      const shi = this.view.getInt32(this.pos + 4);
      const slo = this.view.getUint32(this.pos + 8);
      this.pos += 12;
      const sec = shi * 4294967296 + slo;
      return sec * 1000 + Math.floor(nsec / 1e6);
    }
    this.pos += len;
    return 0;
  }

  decode(): any {
    const b = this.rdU8();
    if (b <= 0x7f) return b;
    if (b >= 0xe0) return b - 0x100;
    if (b >= 0x80 && b <= 0x8f) return this.readMap(b & 0x0f);
    if (b >= 0x90 && b <= 0x9f) return this.readArray(b & 0x0f);
    if (b >= 0xa0 && b <= 0xbf) return this.readStr(b & 0x1f);
    switch (b) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xc4: return this.readBin(this.rdU8());
      case 0xc5: return this.readBin(this.rdU16());
      case 0xc6: return this.readBin(this.rdU32());
      case 0xc7: { const len = this.rdU8(); const type = this.view.getInt8(this.pos); this.pos += 1; return this.readExt(type, len); }
      case 0xc8: { const len = this.rdU16(); const type = this.view.getInt8(this.pos); this.pos += 1; return this.readExt(type, len); }
      case 0xc9: { const len = this.rdU32(); const type = this.view.getInt8(this.pos); this.pos += 1; return this.readExt(type, len); }
      case 0xca: { const v = this.view.getFloat32(this.pos); this.pos += 4; return v; }
      case 0xcb: { const v = this.view.getFloat64(this.pos); this.pos += 8; return v; }
      case 0xcc: return this.rdU8();
      case 0xcd: return this.rdU16();
      case 0xce: return this.rdU32();
      case 0xcf: return this.rdU64();
      case 0xd0: { const v = this.view.getInt8(this.pos); this.pos += 1; return v; }
      case 0xd1: { const v = this.view.getInt16(this.pos); this.pos += 2; return v; }
      case 0xd2: { const v = this.view.getInt32(this.pos); this.pos += 4; return v; }
      case 0xd3: return this.rdI64();
      case 0xd4: { const type = this.view.getInt8(this.pos); this.pos += 1; return this.readExt(type, 1); }
      case 0xd5: { const type = this.view.getInt8(this.pos); this.pos += 1; return this.readExt(type, 2); }
      case 0xd6: { const type = this.view.getInt8(this.pos); this.pos += 1; return this.readExt(type, 4); }
      case 0xd7: { const type = this.view.getInt8(this.pos); this.pos += 1; return this.readExt(type, 8); }
      case 0xd8: { const type = this.view.getInt8(this.pos); this.pos += 1; return this.readExt(type, 16); }
      case 0xd9: return this.readStr(this.rdU8());
      case 0xda: return this.readStr(this.rdU16());
      case 0xdb: return this.readStr(this.rdU32());
      case 0xdc: return this.readArray(this.rdU16());
      case 0xdd: return this.readArray(this.rdU32());
      case 0xde: return this.readMap(this.rdU16());
      case 0xdf: return this.readMap(this.rdU32());
      default: throw new Error('msgpack: unknown byte 0x' + b.toString(16));
    }
  }
}

export interface AmparTables {
  [table: string]: any[];
}

export const parseAmpar = (b64: string): AmparTables => {
  const bytes = base64ToBytes(b64);
  if (bytes.length < 6) throw new Error('File is empty or truncated.');
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);
  if (magic !== 'AMPAR') throw new Error('This is not an Ampersand archive (.ampar).');

  let start = 5;
  while (start < bytes.length) {
    const b = bytes[start];
    if ((b >= 0x80 && b <= 0x8f) || b === 0xde || b === 0xdf) break;
    start++;
  }

  const dec = new MsgpackDecoder(bytes, start);
  const tables: AmparTables = {};
  while (!dec.eof()) {
    let rec: any;
    try {
      rec = dec.decode();
    } catch {
      break;
    }
    if (rec && typeof rec === 'object' && !Array.isArray(rec) && 'table' in rec) {
      const name = String(rec.table);
      (tables[name] = tables[name] || []).push(rec.data);
    }
  }
  return tables;
};
