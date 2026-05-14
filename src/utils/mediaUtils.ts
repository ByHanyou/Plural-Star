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

export const saveAvatarFromUrl = async (memberId: string, url: string): Promise<string | undefined> => {
  if (!url || !url.startsWith('http')) return undefined;
  try {
    await ensureDir(AVATAR_DIR);
    const urlExt = url.split('?')[0].split('.').pop()?.toLowerCase() || '';
    const ext = ['png', 'gif', 'webp'].includes(urlExt) ? urlExt : 'jpg';
    const path = `${AVATAR_DIR}/${memberId}.${ext}`;
    const result = await ReactNativeBlobUtil.config({path, fileCache: false}).fetch('GET', url);
    if (result.info().status === 200) return `file://${path}?t=${Date.now()}`;
    return undefined;
  } catch { return undefined; }
};

const BANNER_DIR = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/ps_banners`;

export const saveBannerFromUrl = async (memberId: string, url: string): Promise<string | undefined> => {
  if (!url || !url.startsWith('http')) return undefined;
  try {
    await ensureDir(BANNER_DIR);
    const urlExt = url.split('?')[0].split('.').pop()?.toLowerCase() || '';
    const ext = ['png', 'gif', 'webp'].includes(urlExt) ? urlExt : 'jpg';
    const path = `${BANNER_DIR}/${memberId}.${ext}`;
    const result = await ReactNativeBlobUtil.config({path, fileCache: false}).fetch('GET', url);
    if (result.info().status === 200) return `file://${path}?t=${Date.now()}`;
    return undefined;
  } catch { return undefined; }
};

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