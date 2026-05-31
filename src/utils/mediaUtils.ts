import ReactNativeBlobUtil from 'react-native-blob-util';

const AVATAR_DIR = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/ps_avatars`;
const CHAT_MEDIA_DIR = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/ps_chat_media`;
const BIO_IMAGE_DIR = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/ps_bio_images`;

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

const DOWNLOAD_TIMEOUT_MS = 7000;

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
    const downloadTask = ReactNativeBlobUtil.config({
      path: tempPath,
      fileCache: false,
      followRedirect: true,
    }).fetch('GET', url, {
      Accept: 'image/png,image/jpeg,image/webp,image/gif,image/*;q=0.8,*/*;q=0.5',
      'User-Agent': 'PluralStar/1.8.0 (avatar-import)',
    });
    const result = await new Promise<any>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { (downloadTask as any).cancel?.(() => {}); } catch {}
        reject(new Error(`image download timed out after ${DOWNLOAD_TIMEOUT_MS}ms`));
      }, DOWNLOAD_TIMEOUT_MS);
      downloadTask.then(
        (v: any) => { if (settled) return; settled = true; clearTimeout(timer); resolve(v); },
        (e: any) => { if (settled) return; settled = true; clearTimeout(timer); reject(e); },
      );
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

// Persist the picked image as-is — no manual crop. The avatar (circular) and
// banner (3:1) frames crop visually via resizeMode="cover", which the native
// Image component computes correctly for both device pixel-scale and EXIF
// orientation. The old ImageEditor.cropImage path computed crop offsets from
// Image.getSize, which mis-cropped to a tiny region on some devices/photos
// (logical-vs-pixel scale mismatch + Android EXIF orientation swap), so a user
// would only see a small part of their picture. Downscaling now happens at pick
// time via the picker's maxWidth/maxHeight (also EXIF-correct).
const persistImage = async (sourceUri: string, destPath: string): Promise<string> => {
  const readPath = sourceUri.replace('file://', '');
  const raw = await ReactNativeBlobUtil.fs.readFile(readPath, 'base64');
  await ReactNativeBlobUtil.fs.writeFile(destPath, raw, 'base64');
  return `file://${destPath}?t=${Date.now()}`;
};

export const saveBannerImage = async (
  imageId: string,
  sourceUri: string
): Promise<string> => {
  await ensureDir(BIO_IMAGE_DIR);
  const destPath = `${BIO_IMAGE_DIR}/${imageId}.png`;
  try { await ReactNativeBlobUtil.fs.unlink(destPath); } catch {}
  return persistImage(sourceUri, destPath);
};

export const saveAvatarFromUri = async (memberId: string, sourceUri: string): Promise<string> => {
  await ensureDir(AVATAR_DIR);
  for (const ext of ['jpg', 'png', 'gif', 'webp']) {
    const p = `${AVATAR_DIR}/${memberId}.${ext}`;
    try { if (await ReactNativeBlobUtil.fs.exists(p)) await ReactNativeBlobUtil.fs.unlink(p); } catch {}
  }
  return persistImage(sourceUri, `${AVATAR_DIR}/${memberId}.png`);
};

export const saveBioImageFromUri = async (imageId: string, sourceUri: string): Promise<string> => {
  await ensureDir(BIO_IMAGE_DIR);
  const destPath = `${BIO_IMAGE_DIR}/${imageId}.png`;
  try { await ReactNativeBlobUtil.fs.unlink(destPath); } catch {}
  return persistImage(sourceUri, destPath);
};

export const rebaseDocumentUri = (uri?: string | null): string | undefined => {
  if (!uri || typeof uri !== 'string' || !uri.startsWith('file://')) return uri || undefined;
  const docMarker = '/Documents/';
  const idx = uri.indexOf(docMarker);
  if (idx === -1) return uri;
  const tail = uri.slice(idx + docMarker.length);
  const currentBase = ReactNativeBlobUtil.fs.dirs.DocumentDir.replace(/\/+$/, '');
  const rebased = `file://${currentBase}/${tail}`;
  return rebased;
};

export const migrateStaleMediaPaths = async (
  members: any[],
  system: any | null,
): Promise<{members: any[]; system: any | null; changed: boolean}> => {
  let changed = false;
  const fix = (uri?: string): string | undefined => {
    const next = rebaseDocumentUri(uri);
    if (next && next !== uri) changed = true;
    return next;
  };
  const updatedMembers = (members || []).map((m: any) => {
    if (!m) return m;
    const newAvatar = fix(m.avatar);
    const newBanner = fix(m.banner);
    if (newAvatar === m.avatar && newBanner === m.banner) return m;
    return {...m, avatar: newAvatar, banner: newBanner};
  });
  let updatedSystem = system;
  if (system) {
    const newAvatar = fix(system.avatar);
    const newBanner = fix(system.banner);
    if (newAvatar !== system.avatar || newBanner !== system.banner) {
      updatedSystem = {...system, avatar: newAvatar, banner: newBanner};
    }
  }
  return {members: updatedMembers, system: updatedSystem, changed};
};

export const rebaseChatMessageMedia = (messages: any[]): {messages: any[]; changed: boolean} => {
  let changed = false;
  const out = (messages || []).map((msg: any) => {
    if (!msg || (msg.type !== 'image' && msg.type !== 'file')) return msg;
    const next = rebaseDocumentUri(msg.content);
    if (next && next !== msg.content) { changed = true; return {...msg, content: next}; }
    return msg;
  });
  return {messages: out, changed};
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