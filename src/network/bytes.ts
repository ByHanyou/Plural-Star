const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const B64_CODES: Uint8Array = (() => {
  const r = new Uint8Array(64);
  for (let i = 0; i < 64; i++) r[i] = B64.charCodeAt(i);
  return r;
})();

const B64_REV: Int16Array = (() => {
  const r = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) r[B64.charCodeAt(i)] = i;
  return r;
})();

const CHUNK = 8190;

const fromCodes = (codes: number[]): string => String.fromCharCode.apply(null, codes as unknown as number[]);

type Utf8Encoder = {encode: (s: string) => Uint8Array};
type Utf8Decoder = {decode: (b: Uint8Array) => string};
const g = globalThis as any;
const textEncoder: Utf8Encoder | null = typeof g.TextEncoder === 'function' ? new g.TextEncoder() : null;
const textDecoder: Utf8Decoder | null = typeof g.TextDecoder === 'function' ? new g.TextDecoder() : null;

export const encodeBase64 = (bytes: Uint8Array): string => {
  const parts: string[] = [];
  const len = bytes.length;
  let codes: number[] = [];
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    codes.push(
      B64_CODES[b0 >> 2],
      B64_CODES[((b0 & 3) << 4) | (b1 >> 4)],
      i + 1 < len ? B64_CODES[((b1 & 15) << 2) | (b2 >> 6)] : 61,
      i + 2 < len ? B64_CODES[b2 & 63] : 61,
    );
    if (codes.length >= CHUNK) {
      parts.push(fromCodes(codes));
      codes = [];
    }
  }
  if (codes.length) parts.push(fromCodes(codes));
  return parts.join('');
};

export const decodeBase64 = (str: string): Uint8Array => {
  const s = str.replace(/[^A-Za-z0-9+/]/g, '');
  const len = s.length;
  const rem = len % 4;
  const outLen = ((len - rem) / 4) * 3 + (rem === 3 ? 2 : rem === 2 ? 1 : 0);
  const out = new Uint8Array(outLen);
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const c0 = B64_REV[s.charCodeAt(i)];
    const c1 = i + 1 < len ? B64_REV[s.charCodeAt(i + 1)] : -1;
    if (c0 < 0 || c1 < 0) break;
    out[o++] = (c0 << 2) | (c1 >> 4);
    if (i + 2 < len) {
      const c2 = B64_REV[s.charCodeAt(i + 2)];
      if (c2 < 0) break;
      out[o++] = ((c1 & 15) << 4) | (c2 >> 2);
      if (i + 3 < len) {
        const c3 = B64_REV[s.charCodeAt(i + 3)];
        if (c3 < 0) break;
        out[o++] = ((c2 & 3) << 6) | c3;
      }
    }
  }
  return o === outLen ? out : out.slice(0, o);
};

export const decodeUTF8 = (str: string): Uint8Array => {
  if (textEncoder) return textEncoder.encode(str);
  const len = str.length;
  let n = 0;
  for (let i = 0; i < len; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < len) { n += 4; i++; }
    else n += 3;
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (let i = 0; i < len; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) {
      out[o++] = c;
    } else if (c < 0x800) {
      out[o++] = 0xc0 | (c >> 6);
      out[o++] = 0x80 | (c & 0x3f);
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < len) {
      const c2 = str.charCodeAt(++i);
      const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
      out[o++] = 0xf0 | (cp >> 18);
      out[o++] = 0x80 | ((cp >> 12) & 0x3f);
      out[o++] = 0x80 | ((cp >> 6) & 0x3f);
      out[o++] = 0x80 | (cp & 0x3f);
    } else {
      out[o++] = 0xe0 | (c >> 12);
      out[o++] = 0x80 | ((c >> 6) & 0x3f);
      out[o++] = 0x80 | (c & 0x3f);
    }
  }
  return out;
};

export const encodeUTF8 = (bytes: Uint8Array): string => {
  if (textDecoder) return textDecoder.decode(bytes);
  const parts: string[] = [];
  let codes: number[] = [];
  let i = 0;
  const len = bytes.length;
  while (i < len) {
    const c = bytes[i++];
    if (c < 0x80) {
      codes.push(c);
    } else if (c < 0xe0) {
      const c2 = bytes[i++];
      codes.push(((c & 0x1f) << 6) | (c2 & 0x3f));
    } else if (c < 0xf0) {
      const c2 = bytes[i++];
      const c3 = bytes[i++];
      codes.push(((c & 0x0f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f));
    } else {
      const c2 = bytes[i++];
      const c3 = bytes[i++];
      const c4 = bytes[i++];
      let cp = ((c & 0x07) << 18) | ((c2 & 0x3f) << 12) | ((c3 & 0x3f) << 6) | (c4 & 0x3f);
      cp -= 0x10000;
      codes.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    }
    if (codes.length >= CHUNK) {
      parts.push(fromCodes(codes));
      codes = [];
    }
  }
  if (codes.length) parts.push(fromCodes(codes));
  return parts.join('');
};
