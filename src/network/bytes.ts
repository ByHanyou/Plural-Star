export {bytesToBase64 as encodeBase64, base64ToBytes as decodeBase64} from '../cloud/cloudCrypto';

const CHUNK = 8190;

const fromCodes = (codes: number[]): string => String.fromCharCode.apply(null, codes);

type Utf8Encoder = {encode: (s: string) => Uint8Array};
type Utf8Decoder = {decode: (b: Uint8Array) => string};
const g = globalThis as {TextEncoder?: new () => Utf8Encoder; TextDecoder?: new () => Utf8Decoder};
const textEncoder: Utf8Encoder | null = typeof g.TextEncoder === 'function' ? new g.TextEncoder() : null;
const textDecoder: Utf8Decoder | null = typeof g.TextDecoder === 'function' ? new g.TextDecoder() : null;

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

export const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
};
