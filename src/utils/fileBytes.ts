import ReactNativeBlobUtil from 'react-native-blob-util';
import {decodeBase64} from '../network/bytes';

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
          const bytes = decodeBase64(String(chunk));
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
      return decodeBase64(b64);
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
