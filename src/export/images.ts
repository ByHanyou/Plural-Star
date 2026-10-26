import ReactNativeBlobUtil from 'react-native-blob-util';
import {Member} from '../utils';
import {log, logError} from '../utils/log';
import {decodeBase64} from '../network/bytes';
import {IMAGE_MIME, filePathOf, rawBase64, sniffImageExt} from '../utils/mediaFiles';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const readImageFile = async (uri: string): Promise<string | null> => {
  const filePath = filePathOf(uri);
  try {
    const stat = await ReactNativeBlobUtil.fs.stat(filePath);
    if (Number(stat.size) > MAX_IMAGE_BYTES) return null;
  } catch (e) {
    log.debug('export', e);
  }
  return ReactNativeBlobUtil.fs.readFile(filePath, 'base64');
};

const readImageBase64 = async (uri: string, defaultMime: string): Promise<string | null> => {
  try {
    const b64 = await readImageFile(uri);
    if (b64 === null) return null;
    const ext = sniffImageExt(b64);
    return `data:${ext ? IMAGE_MIME[ext] : defaultMime};base64,${b64}`;
  } catch (e) {
    logError('export', e);
    return null;
  }
};

export const streamImageMap = async (
  append: (s: string) => Promise<unknown>,
  items: Member[],
  pick: (m: Member) => string,
  defaultMime: string,
): Promise<void> => {
  await append('{');
  let first = true;
  for (const m of items) {
    const src = pick(m);
    const data = src.startsWith('data:') ? src : await readImageBase64(src, defaultMime);
    if (!data) continue;
    await append((first ? '' : ',') + JSON.stringify(m.id) + ':' + JSON.stringify(data));
    first = false;
  }
  await append('}');
};

export const extFromPath = (p: string): string => {
  const m = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(p);
  return m ? m[1].toLowerCase() : 'jpg';
};

export const loadImageBytes = async (src: string): Promise<Uint8Array | null> => {
  try {
    if (src.startsWith('data:')) return src.includes(',') ? decodeBase64(rawBase64(src)) : null;
    const b64 = await readImageFile(src);
    return b64 === null ? null : decodeBase64(b64);
  } catch (e) {
    logError('export', e);
    return null;
  }
};
