import RNFS from 'react-native-fs';

const AVATAR_DIR = `${RNFS.DocumentDirectoryPath}/ps_avatars`;
const CHAT_MEDIA_DIR = `${RNFS.DocumentDirectoryPath}/ps_chat_media`;
const BIO_IMAGE_DIR = `${RNFS.DocumentDirectoryPath}/ps_bio_images`;

const ensureDir = async (dir: string) => {
  const exists = await RNFS.exists(dir);
  if (!exists) await RNFS.mkdir(dir);
};

export const saveAvatar = async (memberId: string, base64: string): Promise<string> => {
  await ensureDir(AVATAR_DIR);
  const raw = base64.includes(',') ? base64.split(',')[1] : base64;
  let ext = 'jpg';
  if (raw.startsWith('iVBOR')) ext = 'png';
  else if (raw.startsWith('R0lGO')) ext = 'gif';
  else if (raw.startsWith('UklGR')) ext = 'webp';
  const path = `${AVATAR_DIR}/${memberId}.${ext}`;
  await RNFS.writeFile(path, raw, 'base64');
  return `file://${path}?t=${Date.now()}`;
};

export const saveAvatarFromUrl = async (memberId: string, url: string): Promise<string | undefined> => {
  if (!url || !url.startsWith('http')) return undefined;
  try {
    await ensureDir(AVATAR_DIR);
    const urlExt = url.split('?')[0].split('.').pop()?.toLowerCase() || '';
    const ext = ['png', 'gif', 'webp'].includes(urlExt) ? urlExt : 'jpg';
    const path = `${AVATAR_DIR}/${memberId}.${ext}`;
    const result = await RNFS.downloadFile({fromUrl: url, toFile: path}).promise;
    if (result.statusCode === 200) return `file://${path}?t=${Date.now()}`;
    return undefined;
  } catch { return undefined; }
};

export const deleteAvatar = async (memberId: string): Promise<void> => {
  try {
    for (const ext of ['jpg', 'png', 'gif', 'webp']) {
      const path = `${AVATAR_DIR}/${memberId}.${ext}`;
      const exists = await RNFS.exists(path);
      if (exists) { await RNFS.unlink(path); break; }
    }
  } catch {}
};

export const saveChatMedia = async (messageId: string, base64: string, ext: string = 'jpg'): Promise<string> => {
  await ensureDir(CHAT_MEDIA_DIR);
  const raw = base64.includes(',') ? base64.split(',')[1] : base64;
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '') || 'bin';
  const path = `${CHAT_MEDIA_DIR}/${messageId}.${safeExt}`;
  await RNFS.writeFile(path, raw, 'base64');
  return `file://${path}?t=${Date.now()}`;
};

export const saveChatFileFromUri = async (messageId: string, sourceUri: string, ext: string = 'bin'): Promise<string> => {
  await ensureDir(CHAT_MEDIA_DIR);
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '') || 'bin';
  const path = `${CHAT_MEDIA_DIR}/${messageId}.${safeExt}`;
  await RNFS.copyFile(sourceUri.replace('file://', ''), path);
  return `file://${path}?t=${Date.now()}`;
};

export const deleteChatMedia = async (messageId: string, ext: string = 'jpg'): Promise<void> => {
  try {
    const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '') || 'bin';
    const path = `${CHAT_MEDIA_DIR}/${messageId}.${safeExt}`;
    const exists = await RNFS.exists(path);
    if (exists) await RNFS.unlink(path);
  } catch {}
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
  await RNFS.writeFile(path, raw, 'base64');
  return `file://${path}?t=${Date.now()}`;
};

export const migrateInlineImagesInDescriptions = async (
  members: any[]
): Promise<{ members: any[]; changed: boolean }> => {
  let changed = false;
  const updated: any[] = [];

  const imageRegex = /!\[([^\]]*)\]\(data:([^;]+);base64,([A-Za-z0-9+/=]+)\)/g;

  for (const m of members) {
    if (typeof m.description !== 'string' || !m.description.includes('data:')) {
      updated.push(m);
      continue;
    }

    let newDesc = m.description;
    let match: RegExpExecArray | null;

    while ((match = imageRegex.exec(m.description)) !== null) {
      const alt = match[1];
      const mime = match[2];
      const b64 = match[3];

      const extMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
      };
      const ext = extMap[mime] || 'bin';

      const bioId = `${m.id}_bio_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      try {
        const fileUri = await saveBioImage(bioId, b64, ext);
        newDesc = newDesc.replace(match[0], `![${alt}](${fileUri})`);
        changed = true;
      } catch (e) {
        console.error('[PS] Failed to migrate bio image for', m.id, e);
      }
    }

    updated.push({ ...m, description: newDesc });
  }

  return { members: updated, changed };
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
    const avatarExists = await RNFS.exists(AVATAR_DIR);
    if (avatarExists) await RNFS.unlink(AVATAR_DIR);
    const chatExists = await RNFS.exists(CHAT_MEDIA_DIR);
    if (chatExists) await RNFS.unlink(CHAT_MEDIA_DIR);
    const bioExists = await RNFS.exists(BIO_IMAGE_DIR);
    if (bioExists) await RNFS.unlink(BIO_IMAGE_DIR);
  } catch {}
};

export const postProcessImportedMembers = async (
  members: any[],
  rawSpPkData: any
): Promise<{ members: any[]; changed: boolean }> => {
  let changed = false;

  for (const m of members) {
    const pfpUrl =
      m.avatar_url ||
      m.avatar ||
      m.pfp ||
      m.image ||
      (rawSpPkData.members?.find((x: any) => x.id === m.id)?.avatar_url);

    if (pfpUrl && typeof pfpUrl === 'string' && pfpUrl.startsWith('http')) {
      const localUri = await saveAvatarFromUrl(m.id, pfpUrl);
      if (localUri) {
        m.avatar = localUri;
        changed = true;
      }
    }
  }

  const { members: migratedAvatars, changed: avatarChanged } =
    await migrateInlineAvatars(members);
  changed = changed || avatarChanged;

  const { members: finalMembers, changed: descChanged } =
    await migrateInlineImagesInDescriptions(migratedAvatars);
  changed = changed || descChanged;

  if (rawSpPkData.custom_fields || rawSpPkData.customFields) {
    const cfDefs: any[] = [];
    const fieldMap = new Map();

    (rawSpPkData.custom_fields || rawSpPkData.customFields || []).forEach((f: any) => {
      const def = {
        id: f.id || `cf_${Date.now()}`,
        name: f.name || f.label,
        type: f.type || 'text',
      };
      cfDefs.push(def);
      fieldMap.set(f.id || f.name, def.id);
    });

    finalMembers.forEach((m: any) => {
      m.customFields = m.customFields || [];
      const sourceMember = rawSpPkData.members?.find((x: any) => x.id === m.id);
      if (sourceMember?.custom_fields) {
        Object.entries(sourceMember.custom_fields).forEach(([key, value]) => {
          const fieldId = fieldMap.get(key);
          if (fieldId) {
            m.customFields!.push({ fieldId, value });
            changed = true;
          }
        });
      }
    });
  }

  return { members: finalMembers, changed };
};