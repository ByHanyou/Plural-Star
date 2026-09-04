import ReactNativeBlobUtil from 'react-native-blob-util';

const B64C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64INV = (() => {
  const a = new Int16Array(256);
  for (let i = 0; i < 256; i++) a[i] = -1;
  for (let i = 0; i < B64C.length; i++) a[B64C.charCodeAt(i)] = i;
  return a;
})();

export const u8FromBase64 = (b64: string): Uint8Array => {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const full = Math.floor(clean.length / 4);
  const rem = clean.length - full * 4;
  const out = new Uint8Array(full * 3 + (rem >= 2 ? rem - 1 : 0));
  let o = 0;
  let i = 0;
  for (let f = 0; f < full; f++) {
    const n = (B64INV[clean.charCodeAt(i)] << 18) | (B64INV[clean.charCodeAt(i + 1)] << 12) | (B64INV[clean.charCodeAt(i + 2)] << 6) | B64INV[clean.charCodeAt(i + 3)];
    out[o++] = (n >> 16) & 255;
    out[o++] = (n >> 8) & 255;
    out[o++] = n & 255;
    i += 4;
  }
  if (rem >= 2) {
    const c0 = B64INV[clean.charCodeAt(i)];
    const c1 = B64INV[clean.charCodeAt(i + 1)];
    out[o++] = (c0 << 2) | (c1 >> 4);
    if (rem === 3) {
      const c2 = B64INV[clean.charCodeAt(i + 2)];
      out[o++] = ((c1 & 15) << 4) | (c2 >> 2);
    }
  }
  return out;
};

const CHUNK_BYTES = 768 * 1024;

const candidatesFor = (raw: string): string[] => {
  if (!raw) return [];
  const isFileUri = raw.startsWith('file://');
  const bare = isFileUri ? raw.slice('file://'.length).split('#')[0].split('?')[0] : raw;
  if (!isFileUri && !bare.startsWith('/')) return [raw];
  const out: string[] = [];
  const push = (v: string) => { if (v && !out.includes(v)) out.push(v); };
  push(bare);
  try { push(decodeURIComponent(bare)); } catch {}
  if (bare.includes(' ')) push(bare.replace(/ /g, '%20'));
  return out;
};

const expandAll = (paths: (string | undefined)[]): string[] => {
  const out: string[] = [];
  for (const p of paths) {
    if (!p) continue;
    for (const c of candidatesFor(p)) {
      if (!out.includes(c)) out.push(c);
    }
  }
  return out;
};

const streamInto = (path: string, size: number): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const out = new Uint8Array(size);
    let offset = 0;
    let settled = false;
    ReactNativeBlobUtil.fs.readStream(path, 'base64', CHUNK_BYTES).then(stream => {
      stream.open();
      stream.onData(chunk => {
        try {
          const bytes = u8FromBase64(String(chunk));
          if (offset + bytes.length > out.length) {
            throw new Error('file changed during read');
          }
          out.set(bytes, offset);
          offset += bytes.length;
        } catch (e) {
          if (!settled) { settled = true; reject(e); }
        }
      });
      stream.onError(e => { if (!settled) { settled = true; reject(e); } });
      stream.onEnd(() => {
        if (settled) return;
        settled = true;
        if (offset !== out.length) reject(new Error('short read'));
        else resolve(out);
      });
    }).catch(e => { if (!settled) { settled = true; reject(e); } });
  });

export const readFileBytes = async (...paths: (string | undefined)[]): Promise<Uint8Array> => {
  let lastErr: unknown = new Error('no readable path');
  for (const p of expandAll(paths)) {
    try {
      const stat = await ReactNativeBlobUtil.fs.stat(p);
      const size = Number(stat.size);
      if (Number.isFinite(size) && size > 0) return await streamInto(p, size);
    } catch (e) { lastErr = e; }
    try {
      const b64 = await ReactNativeBlobUtil.fs.readFile(p, 'base64');
      return u8FromBase64(b64);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
};

export const readFileText = async (...paths: (string | undefined)[]): Promise<string> => {
  let lastErr: unknown = new Error('no readable path');
  for (const p of expandAll(paths)) {
    try {
      return await ReactNativeBlobUtil.fs.readFile(p, 'utf8');
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
};

export const readFileBase64 = async (...paths: (string | undefined)[]): Promise<string> => {
  let lastErr: unknown = new Error('no readable path');
  for (const p of expandAll(paths)) {
    try {
      return await ReactNativeBlobUtil.fs.readFile(p, 'base64');
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
};
