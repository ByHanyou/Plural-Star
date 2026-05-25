import ReactNativeBlobUtil from 'react-native-blob-util';
import {Image} from 'react-native';

let ImageEditor: any = null;
try {
  ImageEditor = require('@react-native-community/image-editor').default || require('@react-native-community/image-editor');
} catch {
  ImageEditor = null;
}

const AVATAR_DIR = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/ps_avatars`;
const CHAT_MEDIA_DIR = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/ps_chat_media`;
const BIO_IMAGE_DIR = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/ps_bio_images`;

const BANNER_WIDTH = 900;
const BANNER_HEIGHT = 300;

const ensureDir = async (dir: string) => {
  const exists = await ReactNativeBlobUtil.fs.exists(dir);
  if (!exists) await ReactNativeBlobUtil.fs.mkdir(dir);
};

export const saveAvatar = async (memberId: string, base64: string): Promise<string> => {
  await ensureDir(AVATAR_DIR);
  const raw = base64.includes(',') ? base64.split(',')[1] : base64;
  let ext = 'jpg';
  if (raw.startsWith('iVBOR')) ext = 'png';
  else if (raw.startsWith('R0lGO')) ext = 'gif';
  else if (raw.startsWith('UklGR')) ext = 'webp';
  const path = `${AVATAR_DIR}/${memberId}.${ext}`;
  await ReactNativeBlobUtil.fs.writeFile(path, raw, 'base64');
  return `file://${path}?t=${Date.now()}`;
};

export const saveBannerFromBase64 = async (memberId: string, base64: string): Promise<string> => {
  await ensureDir(BIO_IMAGE_DIR);
  const raw = base64.includes(',') ? base64.split(',')[1] : base64;
  let ext = 'png';
  if (raw.startsWith('/9j/')) ext = 'jpg';
  else if (raw.startsWith('R0lGO')) ext = 'gif';
  else if (raw.startsWith('UklGR')) ext = 'webp';
  const path = `${BIO_IMAGE_DIR}/banner-${memberId}.${ext}`;
  await ReactNativeBlobUtil.fs.writeFile(path, raw, 'base64');
  return `file://${path}?t=${Date.now()}`;
};

const BANNER_DIR = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/ps_banners`;

const downloadImageWithExtSniff = async (
  baseDir: string,
  id: string,
  url: string,
): Promise<string | undefined> => {
  if (!url || !url.startsWith('http')) return undefined;
  try {
    await ensureDir(baseDir);
    const tempPath = `${baseDir}/${id}.tmp`;
    try { if (await ReactNativeBlobUtil.fs.exists(tempPath)) await ReactNativeBlobUtil.fs.unlink(tempPath); } catch {}
    const result = await ReactNativeBlobUtil.config({
      path: tempPath,
      fileCache: false,
      followRedirect: true,
    }).fetch('GET', url, {
      Accept: 'image/png,image/jpeg,image/webp,image/gif,image/*;q=0.8,*/*;q=0.5',
      'User-Agent': 'PluralStar/1.7.3 (avatar-import)',
    });
    const info = result.info() as any;
    const status = info.status;
    if (status < 200 || status >= 300) {
      try { await ReactNativeBlobUtil.fs.unlink(tempPath); } catch {}
      return undefined;
    }
    const headers = info.headers || {};
    const contentType = String(
      headers['Content-Type'] || headers['content-type'] || '',
    ).toLowerCase();
    let ext = '';
    if (contentType.includes('png')) ext = 'png';
    else if (contentType.includes('webp')) ext = 'webp';
    else if (contentType.includes('gif')) ext = 'gif';
    else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
    if (!ext) {
      try {
        const head = await ReactNativeBlobUtil.fs.readFile(tempPath, 'base64');
        if (head.startsWith('iVBOR')) ext = 'png';
        else if (head.startsWith('R0lGO')) ext = 'gif';
        else if (head.startsWith('UklGR')) ext = 'webp';
        else if (head.startsWith('/9j/')) ext = 'jpg';
      } catch {}
    }
    if (!ext) {
      const urlExt = url.split('?')[0].split('.').pop()?.toLowerCase() || '';
      if (urlExt === 'jpeg') ext = 'jpg';
      else if (['png', 'gif', 'webp', 'jpg'].includes(urlExt)) ext = urlExt;
      else ext = 'jpg';
    }
    for (const oldExt of ['jpg', 'png', 'gif', 'webp']) {
      const p = `${baseDir}/${id}.${oldExt}`;
      try { if (await ReactNativeBlobUtil.fs.exists(p)) await ReactNativeBlobUtil.fs.unlink(p); } catch {}
    }
    const finalPath = `${baseDir}/${id}.${ext}`;
    await ReactNativeBlobUtil.fs.cp(tempPath, finalPath);
    try { await ReactNativeBlobUtil.fs.unlink(tempPath); } catch {}
    return `file://${finalPath}?t=${Date.now()}`;
  } catch { return undefined; }
};

export const saveAvatarFromUrl = (memberId: string, url: string): Promise<string | undefined> =>
  downloadImageWithExtSniff(AVATAR_DIR, memberId, url);

export const saveBannerFromUrl = (memberId: string, url: string): Promise<string | undefined> =>
  downloadImageWithExtSniff(BANNER_DIR, memberId, url);

export const deleteAvatar = async (memberId: string): Promise<void> => {
  try {
    for (const ext of ['jpg', 'png', 'gif', 'webp']) {
      const path = `${AVATAR_DIR}/${memberId}.${ext}`;
      const exists = await ReactNativeBlobUtil.fs.exists(path);
      if (exists) { await ReactNativeBlobUtil.fs.unlink(path); break; }
    }
  } catch {}
};

export const saveChatMedia = async (messageId: string, base64: string, ext: string = 'jpg'): Promise<string> => {
  await ensureDir(CHAT_MEDIA_DIR);
  const raw = base64.includes(',') ? base64.split(',')[1] : base64;
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '') || 'bin';
  const path = `${CHAT_MEDIA_DIR}/${messageId}.${safeExt}`;
  await ReactNativeBlobUtil.fs.writeFile(path, raw, 'base64');
  return `file://${path}?t=${Date.now()}`;
};

export const getChatMediaFileName = (uri: string): string => {
  if (!uri) return 'Attachment';
  const noProto = uri.replace(/^file:\/\//, '');
  const noQuery = noProto.split('?')[0];
  const basename = noQuery.split('/').pop() || '';
  return basename || 'Attachment';
};

export const saveBioImage = async (
  imageId: string,
  base64: string,
  ext: string = 'png'
): Promise<string> => {
  await ensureDir(BIO_IMAGE_DIR);
  const raw = base64.includes(',') ? base64.split(',')[1] : base64;
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '') || 'bin';
  const path = `${BIO_IMAGE_DIR}/${imageId}.${safeExt}`;
  await ReactNativeBlobUtil.fs.writeFile(path, raw, 'base64');
  return `file://${path}?t=${Date.now()}`;
};

const getImageSize = (uri: string): Promise<{width: number; height: number}> =>
  new Promise((resolve, reject) => {
    Image.getSize(uri, (width: number, height: number) => resolve({width, height}), reject);
  });

export const saveBannerImage = async (
  imageId: string,
  sourceUri: string
): Promise<string> => {
  await ensureDir(BIO_IMAGE_DIR);
  const destPath = `${BIO_IMAGE_DIR}/${imageId}.png`;
  try { await ReactNativeBlobUtil.fs.unlink(destPath); } catch {}
  try {
    if (!ImageEditor || !ImageEditor.cropImage) throw new Error('ImageEditor unavailable');
    const {width: srcW, height: srcH} = await getImageSize(sourceUri);
    const targetAspect = BANNER_WIDTH / BANNER_HEIGHT;
    const srcAspect = srcW / srcH;
    let cropW: number, cropH: number, offsetX: number, offsetY: number;
    if (srcAspect > targetAspect) {
      cropH = srcH;
      cropW = Math.round(srcH * targetAspect);
      offsetX = Math.round((srcW - cropW) / 2);
      offsetY = 0;
    } else {
      cropW = srcW;
      cropH = Math.round(srcW / targetAspect);
      offsetX = 0;
      offsetY = Math.round((srcH - cropH) / 2);
    }
    const cropped = await ImageEditor.cropImage(sourceUri, {
      offset: {x: offsetX, y: offsetY},
      size: {width: cropW, height: cropH},
      displaySize: {width: BANNER_WIDTH, height: BANNER_HEIGHT},
      resizeMode: 'cover',
      format: 'png',
      quality: 0.9,
    });
    const croppedPath = (cropped as any).uri ? (cropped as any).uri.replace('file://', '') : String(cropped).replace('file://', '');
    await ReactNativeBlobUtil.fs.cp(croppedPath, destPath);
    try { await ReactNativeBlobUtil.fs.unlink(croppedPath); } catch {}
    return `file://${destPath}?t=${Date.now()}`;
  } catch {
    const readPath = sourceUri.replace('file://', '');
    const raw = await ReactNativeBlobUtil.fs.readFile(readPath, 'base64');
    await ReactNativeBlobUtil.fs.writeFile(destPath, raw, 'base64');
    return `file://${destPath}?t=${Date.now()}`;
  }
};

const AVATAR_SIDE = 256;
const cropToSquarePng = async (sourceUri: string, destPath: string): Promise<string> => {
  try {
    if (!ImageEditor || !ImageEditor.cropImage) throw new Error('ImageEditor unavailable');
    const {width: srcW, height: srcH} = await getImageSize(sourceUri);
    const side = Math.min(srcW, srcH);
    const offsetX = Math.round((srcW - side) / 2);
    const offsetY = Math.round((srcH - side) / 2);
    const cropped = await ImageEditor.cropImage(sourceUri, {
      offset: {x: offsetX, y: offsetY},
      size: {width: side, height: side},
      displaySize: {width: AVATAR_SIDE, height: AVATAR_SIDE},
      resizeMode: 'cover',
      format: 'png',
      quality: 0.9,
    });
    const croppedPath = (cropped as any).uri ? (cropped as any).uri.replace('file://', '') : String(cropped).replace('file://', '');
    await ReactNativeBlobUtil.fs.cp(croppedPath, destPath);
    try { await ReactNativeBlobUtil.fs.unlink(croppedPath); } catch {}
    return `file://${destPath}?t=${Date.now()}`;
  } catch {
    const readPath = sourceUri.replace('file://', '');
    const raw = await ReactNativeBlobUtil.fs.readFile(readPath, 'base64');
    await ReactNativeBlobUtil.fs.writeFile(destPath, raw, 'base64');
    return `file://${destPath}?t=${Date.now()}`;
  }
};

export const saveAvatarFromUri = async (memberId: string, sourceUri: string): Promise<string> => {
  await ensureDir(AVATAR_DIR);
  for (const ext of ['jpg', 'png', 'gif', 'webp']) {
    const p = `${AVATAR_DIR}/${memberId}.${ext}`;
    try { if (await ReactNativeBlobUtil.fs.exists(p)) await ReactNativeBlobUtil.fs.unlink(p); } catch {}
  }
  return cropToSquarePng(sourceUri, `${AVATAR_DIR}/${memberId}.png`);
};

export const saveBioImageFromUri = async (imageId: string, sourceUri: string): Promise<string> => {
  await ensureDir(BIO_IMAGE_DIR);
  const destPath = `${BIO_IMAGE_DIR}/${imageId}.png`;
  try { await ReactNativeBlobUtil.fs.unlink(destPath); } catch {}
  return cropToSquarePng(sourceUri, destPath);
};

export const migrateInlineAvatars = async (members: any[]): Promise<{members: any[]; changed: boolean}> => {
  let changed = false;
  const updated = [];
  await ensureDir(AVATAR_DIR);
  for (const m of members) {
    if (m.avatar && m.avatar.startsWith('data:')) {
      try {
        const uri = await saveAvatar(m.id, m.avatar);
        updated.push({...m, avatar: uri});
        changed = true;
      } catch {
        updated.push({...m, avatar: undefined});
        changed = true;
      }
    } else {
      updated.push(m);
    }
  }
  return {members: updated, changed};
};

export const migrateInlineChatMedia = async (messages: any[]): Promise<{messages: any[]; changed: boolean}> => {
  let changed = false;
  const updated = [];
  await ensureDir(CHAT_MEDIA_DIR);
  for (const msg of messages) {
    if ((msg.type === 'image' || msg.type === 'file') && msg.content && msg.content.startsWith('data:')) {
      try {
        const mimeMatch = msg.content.match(/^data:([^;]+);/);
        const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
        const extMap: Record<string, string> = {
          'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
          'application/pdf': 'pdf', 'text/plain': 'txt', 'application/json': 'json',
        };
        const ext = extMap[mime] || mime.split('/')[1] || 'bin';
        const uri = await saveChatMedia(msg.id, msg.content, ext);
        updated.push({...msg, content: uri});
        changed = true;
      } catch {
        updated.push(msg);
      }
    } else {
      updated.push(msg);
    }
  }
  return {messages: updated, changed};
};

export const clearAllMedia = async (): Promise<void> => {
  try {
    const avatarExists = await ReactNativeBlobUtil.fs.exists(AVATAR_DIR);
    if (avatarExists) await ReactNativeBlobUtil.fs.unlink(AVATAR_DIR);
    const chatExists = await ReactNativeBlobUtil.fs.exists(CHAT_MEDIA_DIR);
    if (chatExists) await ReactNativeBlobUtil.fs.unlink(CHAT_MEDIA_DIR);
    const bioExists = await ReactNativeBlobUtil.fs.exists(BIO_IMAGE_DIR);
    if (bioExists) await ReactNativeBlobUtil.fs.unlink(BIO_IMAGE_DIR);
    const bannerExists = await ReactNativeBlobUtil.fs.exists(BANNER_DIR);
    if (bannerExists) await ReactNativeBlobUtil.fs.unlink(BANNER_DIR);
  } catch {}
};