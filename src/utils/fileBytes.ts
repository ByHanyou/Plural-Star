import ReactNativeBlobUtil from 'react-native-blob-util';
import {u8FromBase64} from '../export/exportUtils';

// Play Console: java.lang.OutOfMemoryError in ReactNativeBlobUtilFS.readFile /
// readBytesWithLimit on low-RAM devices importing large archives. A single
// readFile(path, 'base64') of a 37MB .ampar materialises a ~50MB base64 string
// (UTF-16 doubles it again in JS) BEFORE decoding, spiking peak memory to 3-4x
// the file size. Streaming base64 chunks into one preallocated buffer keeps the
// peak at roughly file size + one chunk.
//
// bufferSize MUST be a multiple of 3: blob-util base64-encodes each chunk
// independently, and only a 3-byte-aligned chunk produces padding-free base64
// that decodes cleanly on concatenation.
const CHUNK_BYTES = 768 * 1024; // multiple of 3

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
            // File grew between stat and read; extremely unlikely, fail safe.
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
        resolve(offset === out.length ? out : out.slice(0, offset));
      });
    }).catch(e => { if (!settled) { settled = true; reject(e); } });
  });

/** Read a whole file as bytes without the base64 whole-string spike. Tries each
 *  candidate path in order (SAF content:// fallbacks mirror the readFile
 *  call sites this replaces). */
export const readFileBytes = async (...paths: (string | undefined)[]): Promise<Uint8Array> => {
  let lastErr: unknown = new Error('no readable path');
  for (const p of paths) {
    if (!p) continue;
    try {
      const stat = await ReactNativeBlobUtil.fs.stat(p);
      const size = Number(stat.size);
      if (Number.isFinite(size) && size > 0) return await streamInto(p, size);
    } catch (e) { lastErr = e; }
    try {
      // stat can fail on content:// URIs where readFile still works; fall back
      // to the old single read for those (typically small picker files).
      const b64 = await ReactNativeBlobUtil.fs.readFile(p, 'base64');
      return u8FromBase64(b64);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
};
