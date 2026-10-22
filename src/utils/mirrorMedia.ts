import ImageResizer from '@bam.tech/react-native-image-resizer';
import {log, logError} from './log';
import {GIF_B64_MAGIC, MIRROR_GIF_MAX_BYTES, MIRROR_GIF_MAX_B64} from '../network/types';
import {FNV_OFFSET, fnv, fnvHex, mirrorGifDataB64, mirrorGifHash} from '../network/mirror/gifHash';
import {fs, IMAGE_MIME, MIRROR_GIF_DIR, ensureDir, filePathOf, localPathOf, removeIfExists, tempFilePath} from './mediaFiles';

const MIRROR_THUMB_MAX = 128;
const MIRROR_THUMB_MAX_CHARS = 200 * 1024;
const GIF_PROBE_CACHE_MAX = 2048;

export const mirrorThumbDataUri = async (sourceUri: string, maxDim: number = MIRROR_THUMB_MAX): Promise<string | null> => {
  if (!sourceUri) return null;
  if (sourceUri.startsWith('data:')) return sourceUri.length <= MIRROR_THUMB_MAX_CHARS ? sourceUri : null;
  if (!sourceUri.startsWith('file://')) return null;
  const path = localPathOf(sourceUri);
  try {
    const resized = await ImageResizer.createResizedImage(`file://${path}`, maxDim, maxDim, 'JPEG', 70, 0);
    const resizedPath = filePathOf(resized.uri);
    const b64 = await fs.readFile(resizedPath, 'base64');
    await removeIfExists(resizedPath);
    return `data:image/jpeg;base64,${b64}`;
  } catch (e) {
    logError('media', e);
    try {
      const raw = await fs.readFile(path, 'base64');
      if (raw.length > MIRROR_THUMB_MAX_CHARS) return null;
      return `data:${IMAGE_MIME[(path.split('.').pop() || '').toLowerCase()] || 'image/jpeg'};base64,${raw}`;
    } catch (err) {
      log.debug('media', err);
      return null;
    }
  }
};

const gifProbeCache = new Map<string, {size: number; mtime: number; h: string | null}>();

export const mirrorGifProbe = async (src: string): Promise<string | null> => {
  if (!src || typeof src !== 'string') return null;
  if (src.startsWith('data:')) {
    const b64 = mirrorGifDataB64(src);
    return b64 ? mirrorGifHash(b64) : null;
  }
  if (!src.startsWith('file://')) return null;
  const path = localPathOf(src);
  try {
    const st = await fs.stat(path);
    const size = Number(st.size) || 0;
    const mtime = Number(st.lastModified) || 0;
    if (size < 6 || size > MIRROR_GIF_MAX_BYTES) return null;
    const hit = gifProbeCache.get(path);
    if (hit && hit.size === size && hit.mtime === mtime) return hit.h;
    const head = tempFilePath('ps_gif_head');
    let isGif = false;
    try {
      await fs.slice(path, head, 0, 6);
      isGif = (await fs.readFile(head, 'base64')).startsWith(GIF_B64_MAGIC);
    } finally {
      fs.unlink(head).catch(e => log.debug('media', e));
    }
    const h = isGif ? await fs.hash(path, 'md5') : null;
    if (gifProbeCache.size >= GIF_PROBE_CACHE_MAX) {
      const oldest = gifProbeCache.keys().next().value;
      if (oldest !== undefined) gifProbeCache.delete(oldest);
    }
    gifProbeCache.set(path, {size, mtime, h});
    return h;
  } catch (e) {
    log.debug('media', e);
    return null;
  }
};

export const mirrorGifBase64 = async (src: string): Promise<string | null> => {
  if (!src || typeof src !== 'string') return null;
  if (src.startsWith('data:')) return mirrorGifDataB64(src);
  if (!src.startsWith('file://')) return null;
  try {
    const path = localPathOf(src);
    const st = await fs.stat(path);
    if ((Number(st.size) || 0) > MIRROR_GIF_MAX_BYTES) return null;
    const b64 = await fs.readFile(path, 'base64');
    return b64.startsWith(GIF_B64_MAGIC) && b64.length <= MIRROR_GIF_MAX_B64 ? b64 : null;
  } catch (e) {
    log.debug('media', e);
    return null;
  }
};

const mirrorGifPeerDir = (peerId: string): string => `${MIRROR_GIF_DIR}/${peerId.replace(/[^A-Za-z0-9]/g, '_')}`;

const mirrorGifName = (feature: string, id: string, h: string): string =>
  `${feature}-${fnvHex(fnv(FNV_OFFSET, id, 0, id.length))}-${h}.gif`;

export const mirrorGifFiles = async (peerId: string, feature: string, wants: Map<string, string>): Promise<Record<string, string>> => {
  const out: Record<string, string> = {};
  if (wants.size === 0) return out;
  const dir = mirrorGifPeerDir(peerId);
  try {
    if (!(await fs.exists(dir))) return out;
    const have = new Set(await fs.ls(dir));
    wants.forEach((h, id) => {
      const name = mirrorGifName(feature, id, h);
      if (have.has(name)) out[id] = `file://${dir}/${name}`;
    });
  } catch (e) {
    logError('media', e);
  }
  return out;
};

export const pruneMirrorGifs = async (peerId: string, feature: string, wants: Map<string, string>): Promise<void> => {
  const dir = mirrorGifPeerDir(peerId);
  try {
    if (!(await fs.exists(dir))) return;
    const keep = new Set<string>();
    wants.forEach((h, id) => keep.add(mirrorGifName(feature, id, h)));
    for (const name of await fs.ls(dir)) {
      if (!name.startsWith(`${feature}-`) || keep.has(name)) continue;
      await fs.unlink(`${dir}/${name}`).catch(e => log.debug('media', e));
    }
  } catch (e) {
    logError('media', e);
  }
};

export const saveMirrorGif = async (peerId: string, feature: string, id: string, h: string, b64: string): Promise<boolean> => {
  try {
    await ensureDir(MIRROR_GIF_DIR);
    const dir = mirrorGifPeerDir(peerId);
    await ensureDir(dir);
    const dest = `${dir}/${mirrorGifName(feature, id, h)}`;
    const tmp = `${dest}.part`;
    await fs.writeFile(tmp, b64, 'base64');
    if (await fs.exists(dest)) await fs.unlink(dest);
    await fs.mv(tmp, dest);
    return true;
  } catch (e) {
    logError('media', e);
    return false;
  }
};

export const clearMirrorGifs = (peerId?: string): Promise<void> =>
  removeIfExists(peerId ? mirrorGifPeerDir(peerId) : MIRROR_GIF_DIR);

