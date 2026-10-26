import { config } from '../config';
import { isMediaKey } from '../network/mediaKey';
import { FNV_OFFSET, fnv, fnvHex } from '../network/mirror/gifHash';
import { sleep } from '../utils/concurrency';

export const canonicalForSync = (s: string): string =>
  s
    .replace(/file:\/\/[^"\\]*\/Documents\//g, 'file:///Documents/')
    .replace(/(file:[^"\\]*?)\?t=\d+/g, '$1');

export const syncHash = (s: string): string => {
  const c = canonicalForSync(s);
  return fnvHex(fnv(FNV_OFFSET, c, 0, c.length));
};

const HASH_YIELD_STEP = 262144;

export const syncHashAsync = async (s: string): Promise<string> => {
  const c = canonicalForSync(s);
  let h = FNV_OFFSET;
  for (let off = 0; off < c.length; off += HASH_YIELD_STEP) {
    const end = Math.min(off + HASH_YIELD_STEP, c.length);
    h = fnv(h, c, off, end);
    if (end < c.length) await sleep(0);
  }
  return fnvHex(h);
};

const mediaHashMemo: Map<string, string> = new Map();
let mediaHashMemoChars = 0;

export const clearMediaHashMemo = (): void => {
  mediaHashMemo.clear();
  mediaHashMemoChars = 0;
};

type MediaResolver = (value: string) => Promise<string | null>;

export const hashAll = async (snap: Record<string, string>, resolve: MediaResolver): Promise<Record<string, string>> => {
  const out: Record<string, string> = {};
  let n = 0;
  for (const k in snap) {
    const v = snap[k];
    if (isMediaKey(k)) {
      const memo = mediaHashMemo.get(v);
      if (memo !== undefined) {
        out[k] = memo;
        continue;
      }
      const data = await resolve(v);
      if (data === null) continue;
      const h = await syncHashAsync(data);
      mediaHashMemo.set(v, h);
      mediaHashMemoChars += v.length;
      while (mediaHashMemoChars > config().sync.mediaHashCacheChars && mediaHashMemo.size > 1) {
        const first = mediaHashMemo.keys().next().value;
        if (first === undefined || first === v) break;
        mediaHashMemo.delete(first);
        mediaHashMemoChars -= first.length;
      }
      out[k] = h;
    } else {
      out[k] = await syncHashAsync(v);
    }
    if (++n % 8 === 0) await sleep(0);
  }
  return out;
};
