import ReactNativeBlobUtil from 'react-native-blob-util';
import type {FetchBlobResponse} from 'react-native-blob-util';
import i18n from '../i18n/i18n';
import {log, logError} from './log';
import {withTimeout} from './concurrency';
import {fs, AVATAR_DIR, AVATAR_FULL_DIR, BANNER_DIR, BIO_IMAGE_DIR, CHAT_MEDIA_DIR, IMAGE_EXTS, MIME_BY_EXT, downscaleOrCopy, ensureDir, fileUri, filePathOf, rawBase64, removeIfExists, removeVariants, safeExt, sniffImageExt, writeBase64} from './mediaFiles';

const AVATAR_FULL_MAX = 1024;
const DOWNLOAD_TIMEOUT_MS = 7000;
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/*;q=0.8,*/*;q=0.5';

const CHAT_MEDIA_EXT: Record<string, string> = {};
for (const ext of Object.keys(MIME_BY_EXT)) if (ext !== 'jpeg') CHAT_MEDIA_EXT[MIME_BY_EXT[ext]] = ext;

const chatMediaExt = (dataUri: string): string => {
  const mime = /^data:([^;,]+)/.exec(dataUri)?.[1] || 'application/octet-stream';
  return CHAT_MEDIA_EXT[mime] || mime.split('/')[1] || 'bin';
};

const avatarFullPath = (memberId: string): string => `${AVATAR_FULL_DIR}/${memberId}.png`;

export const saveAvatar = async (memberId: string, base64: string): Promise<string> => {
  const raw = rawBase64(base64);
  const ext = sniffImageExt(raw) ?? 'jpg';
  const uri = await writeBase64(AVATAR_DIR, `${memberId}.${ext}`, raw);
  await removeVariants(AVATAR_DIR, memberId, ext);
  return uri;
};

const contentTypeExt = (contentType: string): string => {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  return '';
};

const urlImageExt = (url: string): string => {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || '';
  if (ext === 'jpeg') return 'jpg';
  return IMAGE_EXTS.includes(ext) ? ext : 'jpg';
};

const downloadViaBlobUtil = async (baseDir: string, id: string, url: string): Promise<string | undefined> => {
  try {
    await ensureDir(baseDir);
    const tempPath = `${baseDir}/${id}.tmp`;
    await removeIfExists(tempPath);
    const downloadTask = ReactNativeBlobUtil.config({
      path: tempPath,
      fileCache: false,
      followRedirect: true,
    }).fetch('GET', url, {
      Accept: IMAGE_ACCEPT,
      'User-Agent': 'PluralStar (https://github.com/ByHanyou/Plural-Star) avatar-import',
    });
    const result = await new Promise<FetchBlobResponse>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { downloadTask.cancel(() => {}); } catch {}
        reject(new Error(i18n.t('share.couldNotConnect')));
      }, DOWNLOAD_TIMEOUT_MS);
      downloadTask.then(
        v => { if (settled) return; settled = true; clearTimeout(timer); resolve(v); },
        (e: unknown) => { if (settled) return; settled = true; clearTimeout(timer); reject(e); },
      );
    });
    const info = result.info();
    if (info.status < 200 || info.status >= 300) {
      await removeIfExists(tempPath);
      return undefined;
    }
    const headers: Record<string, unknown> = info.headers || {};
    let ext = contentTypeExt(String(headers['Content-Type'] || headers['content-type'] || '').toLowerCase());
    if (!ext) {
      try { ext = sniffImageExt(await fs.readFile(tempPath, 'base64')) ?? ''; } catch {}
    }
    if (!ext) ext = urlImageExt(url);
    await removeVariants(baseDir, id);
    const finalPath = `${baseDir}/${id}.${ext}`;
    await fs.cp(tempPath, finalPath);
    await removeIfExists(tempPath);
    return fileUri(finalPath);
  } catch (e) {
    log.debug('media', 'avatar download error:', e);
    return undefined;
  }
};

const downloadViaFetchFallback = async (baseDir: string, id: string, url: string): Promise<string | undefined> => {
  try {
    const res = await withTimeout(fetch(url, {headers: {Accept: IMAGE_ACCEPT}}), DOWNLOAD_TIMEOUT_MS, 'image download');
    if (!res.ok) return undefined;
    const blob = await withTimeout(res.blob(), DOWNLOAD_TIMEOUT_MS, 'image download');
    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onloadend = () => resolve(String(fr.result || ''));
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    const comma = dataUrl.indexOf(',');
    if (comma < 0) return undefined;
    const raw = dataUrl.slice(comma + 1);
    if (!raw) return undefined;
    const ext = sniffImageExt(raw) ?? 'jpg';
    await removeVariants(baseDir, id);
    return await writeBase64(baseDir, `${id}.${ext}`, raw);
  } catch (e) {
    log.debug('media', 'avatar fetch fallback error:', e);
    return undefined;
  }
};

const downloadImageWithExtSniff = async (baseDir: string, id: string, url: string): Promise<string | undefined> => {
  if (!url || !url.startsWith('http')) return undefined;
  return (await downloadViaBlobUtil(baseDir, id, url)) || downloadViaFetchFallback(baseDir, id, url);
};

export const saveAvatarFromUrl = async (memberId: string, url: string): Promise<string | undefined> => {
  const uri = await downloadImageWithExtSniff(AVATAR_DIR, memberId, url);
  if (!uri) return uri;
  try { return await downscaleOrCopy(uri, filePathOf(uri)); } catch (e) { log.debug('media', e); return uri; }
};

export const saveBannerFromUrl = (memberId: string, url: string): Promise<string | undefined> =>
  downloadImageWithExtSniff(BANNER_DIR, memberId, url);

export const deleteAvatar = async (memberId: string): Promise<void> => {
  await removeVariants(AVATAR_DIR, memberId);
  await removeIfExists(avatarFullPath(memberId));
};

export const saveChatMedia = (messageId: string, base64: string, ext: string = 'jpg'): Promise<string> =>
  writeBase64(CHAT_MEDIA_DIR, `${messageId}.${safeExt(ext)}`, base64);

export const saveChatMediaDataUri = (messageId: string, dataUri: string): Promise<string> =>
  saveChatMedia(messageId, dataUri, chatMediaExt(dataUri));

export const deleteChatMediaFile = async (uri: string): Promise<void> => {
  if (!uri || !uri.startsWith('file://')) return;
  const path = filePathOf(uri);
  if (path.startsWith(CHAT_MEDIA_DIR)) await removeIfExists(path);
};

export const deleteChatMediaFor = async (messageId: string): Promise<void> => {
  try {
    for (const f of await fs.ls(CHAT_MEDIA_DIR)) if (f.startsWith(`${messageId}.`)) await fs.unlink(`${CHAT_MEDIA_DIR}/${f}`);
  } catch (e) {
    log.debug('media', e);
  }
};

export const getChatMediaFileName = (uri: string): string =>
  (uri && filePathOf(uri).split('/').pop()) || i18n.t('chat.attachment');

export const saveBioImage = async (imageId: string, base64: string, ext: string = 'png'): Promise<string> => {
  const safe = safeExt(ext);
  const uri = await writeBase64(BIO_IMAGE_DIR, `${imageId}.${safe}`, base64);
  await removeVariants(BIO_IMAGE_DIR, imageId, safe);
  return uri;
};

export const saveBannerFromBase64 = (memberId: string, base64: string): Promise<string> =>
  saveBioImage(`banner-${memberId}`, base64, sniffImageExt(rawBase64(base64)) ?? 'png');

export const saveBioImageFromUri = async (imageId: string, sourceUri: string): Promise<string> => {
  await ensureDir(BIO_IMAGE_DIR);
  const destPath = `${BIO_IMAGE_DIR}/${imageId}.png`;
  await removeVariants(BIO_IMAGE_DIR, imageId);
  await fs.writeFile(destPath, await fs.readFile(filePathOf(sourceUri), 'base64'), 'base64');
  return fileUri(destPath);
};

export const avatarFullUri = async (memberId: string): Promise<string | null> => {
  if (!memberId) return null;
  try {
    const p = avatarFullPath(memberId);
    return (await fs.exists(p)) ? fileUri(p) : null;
  } catch (e) {
    log.debug('media', e);
    return null;
  }
};

export const saveAvatarFromUri = async (memberId: string, sourceUri: string): Promise<string> => {
  await ensureDir(AVATAR_DIR);
  await removeVariants(AVATAR_DIR, memberId);
  try {
    await ensureDir(AVATAR_FULL_DIR);
    await downscaleOrCopy(sourceUri, avatarFullPath(memberId), AVATAR_FULL_MAX);
  } catch (e) {
    logError('media', e);
  }
  return downscaleOrCopy(sourceUri, `${AVATAR_DIR}/${memberId}.png`);
};

