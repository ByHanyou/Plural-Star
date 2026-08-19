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

// blob-util passes paths to the OS verbatim: it strips the file:// scheme but
// never percent-decodes (github.com/RonRadtke/react-native-blob-util #117), and
// picker libraries disagree about whether the URI they hand back is encoded.
// A file picked as "shaun-export-2026-08-18 (3).zip" can therefore arrive as
// ".../shaun-export-2026-08-18%20(3).zip" (or the reverse, when the on-disk
// name literally contains %20 — common for files downloaded off Discord).
// Reading with the wrong variant fails with "No such file". So every read
// tries the plausible spellings of each path: as given, percent-decoded, and
// spaces re-encoded. content:// and other non-file URIs are passed through
// untouched — they are legitimately percent-encoded and decoding CORRUPTS them.
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

/** Read a whole file as bytes without the base64 whole-string spike. Tries
 *  every plausible encoding of every candidate path in order. */
export const readFileBytes = async (...paths: (string | undefined)[]): Promise<Uint8Array> => {
  let lastErr: unknown = new Error('no readable path');
  for (const p of expandAll(paths)) {
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

/** Whole-file utf8 read with the same encoding-candidate ladder. For the text
 *  imports (JSON exports): small enough to read in one call, but just as
 *  exposed to the %20-vs-space mismatch as the binary paths. */
export const readFileText = async (...paths: (string | undefined)[]): Promise<string> => {
  let lastErr: unknown = new Error('no readable path');
  for (const p of expandAll(paths)) {
    try {
      return await ReactNativeBlobUtil.fs.readFile(p, 'utf8');
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
};

/** Whole-file base64 read with the same ladder, for callers that hand the
 *  base64 straight on (avatar imports, chat attachments). */
export const readFileBase64 = async (...paths: (string | undefined)[]): Promise<string> => {
  let lastErr: unknown = new Error('no readable path');
  for (const p of expandAll(paths)) {
    try {
      return await ReactNativeBlobUtil.fs.readFile(p, 'base64');
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
};
