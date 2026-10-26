import ReactNativeBlobUtil from 'react-native-blob-util';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import {log, logError} from './log';
import {GIF_B64_MAGIC} from '../network/types';

export const fs = ReactNativeBlobUtil.fs;
const DOCUMENT_DIR = fs.dirs.DocumentDir;
export const AVATAR_DIR = `${DOCUMENT_DIR}/ps_avatars`;
export const AVATAR_FULL_DIR = `${DOCUMENT_DIR}/ps_avatars_full`;
export const BANNER_DIR = `${DOCUMENT_DIR}/ps_banners`;
export const BIO_IMAGE_DIR = `${DOCUMENT_DIR}/ps_bio_images`;
export const CHAT_MEDIA_DIR = `${DOCUMENT_DIR}/ps_chat_media`;
export const MIRROR_GIF_DIR = `${DOCUMENT_DIR}/ps_mirror_gifs`;

export const AVATAR_MAX = 256;

type ImageExt = 'jpg' | 'png' | 'gif' | 'webp';
export const IMAGE_EXTS: readonly string[] = ['jpg', 'png', 'gif', 'webp'];
const B64_MAGIC: [string, ImageExt][] = [['iVBOR', 'png'], [GIF_B64_MAGIC, 'gif'], ['UklGR', 'webp'], ['/9j/', 'jpg']];

export const IMAGE_MIME: Record<string, string> = {jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp'};

export const MIME_BY_EXT: Record<string, string> = {
  ...IMAGE_MIME,
  pdf: 'application/pdf', txt: 'text/plain', json: 'application/json', mp4: 'video/mp4', mp3: 'audio/mpeg',
};

export const sniffImageExt = (b64: string): ImageExt | null => B64_MAGIC.find(([magic]) => b64.startsWith(magic))?.[1] ?? null;

export const rawBase64 = (data: string): string => data.slice(data.indexOf(',') + 1);

export const dataUriImageExt = (uri: string, fallback: string): string => {
  const t = (/^data:image\/([a-z0-9+]+)/i.exec(uri)?.[1] || fallback).toLowerCase();
  return t === 'jpeg' ? 'jpg' : t === 'svg+xml' ? 'svg' : t;
};

export const fieldImageId = (memberId: string, fieldId: string): string => `cf-${memberId}-${fieldId}`;

export const fileUri = (path: string): string => `file://${path}?t=${Date.now()}`;

export const filePathOf = (uri: string): string => uri.replace(/^file:\/\//, '').split('#')[0].split('?')[0];

export const rebaseDocumentUri = (uri?: string | null): string | undefined => {
  if (!uri || typeof uri !== 'string' || !uri.startsWith('file://')) return uri || undefined;
  const docMarker = '/Documents/';
  const idx = uri.indexOf(docMarker);
  if (idx === -1) return uri;
  return `file://${DOCUMENT_DIR.replace(/\/+$/, '')}/${uri.slice(idx + docMarker.length)}`;
};

export const localPathOf = (uri: string): string => filePathOf(rebaseDocumentUri(uri) || uri);

export const tempFilePath = (name: string): string =>
  `${fs.dirs.CacheDir}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${name}`;

export const ensureDir = async (dir: string): Promise<void> => {
  if (await fs.exists(dir)) return;
  try {
    await fs.mkdir(dir);
  } catch (e) {
    if (!(await fs.exists(dir))) throw e;
  }
};

export const removeIfExists = async (path: string): Promise<void> => {
  try {
    if (await fs.exists(path)) await fs.unlink(path);
  } catch (e) {
    logError('media', e);
  }
};

export const removeVariants = async (dir: string, id: string, keep?: string): Promise<void> => {
  for (const ext of IMAGE_EXTS) if (ext !== keep) await removeIfExists(`${dir}/${id}.${ext}`);
};

export const writeBase64 = async (dir: string, name: string, data: string): Promise<string> => {
  await ensureDir(dir);
  const path = `${dir}/${name}`;
  await fs.writeFile(path, rawBase64(data), 'base64');
  return fileUri(path);
};

export const safeExt = (ext: string): string => ext.replace(/[^a-zA-Z0-9]/g, '') || 'bin';

export const downscaleOrCopy = async (sourceUri: string, destPath: string, max = AVATAR_MAX): Promise<string> => {
  const readPath = filePathOf(sourceUri);
  let bytes = await fs.readFile(readPath, 'base64');
  if (sniffImageExt(bytes) !== 'gif') {
    try {
      const resized = await ImageResizer.createResizedImage(`file://${readPath}`, max, max, 'PNG', 100, 0);
      const resizedPath = filePathOf(resized.uri);
      bytes = await fs.readFile(resizedPath, 'base64');
      await removeIfExists(resizedPath);
    } catch (e) {
      log.debug('media', e);
    }
  }
  await fs.writeFile(destPath, bytes, 'base64');
  return fileUri(destPath);
};

export const clearAllMedia = async (): Promise<void> => {
  for (const dir of [AVATAR_DIR, AVATAR_FULL_DIR, CHAT_MEDIA_DIR, BIO_IMAGE_DIR, BANNER_DIR, MIRROR_GIF_DIR]) await removeIfExists(dir);
};
