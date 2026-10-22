import {logError, log} from './log';
import {parallelMap} from './concurrency';
import type {ChatMessage, CustomFieldValue, Member, SystemInfo} from '../utils';
import {fs, dataUriImageExt, downscaleOrCopy, fieldImageId, filePathOf, rebaseDocumentUri} from './mediaFiles';
import {saveAvatar, saveAvatarFromUrl, saveBannerFromBase64, saveBannerFromUrl, saveBioImage, saveChatMediaDataUri} from './mediaUtils';

const DOWNSIZE_SKIP_BYTES = 150 * 1024;
const MAX_REFETCH = 12;

const keepFailed = <T>(out: (T | undefined)[], src: T[]): T[] => out.map((v, i) => v ?? src[i]);

type MediaHolder = {avatar?: string; banner?: string; description?: string};

export const migrateStaleMediaPaths = async (
  members: Member[],
  system: SystemInfo | null,
): Promise<{members: Member[]; system: SystemInfo | null; changed: boolean}> => {
  let changed = false;
  const fix = (uri?: string): string | undefined => {
    const next = rebaseDocumentUri(uri);
    if (next && next !== uri) changed = true;
    return next;
  };
  const fixText = (text?: string): string | undefined => {
    if (!text || typeof text !== 'string' || !text.includes('file://')) return text ?? undefined;
    const next = text.replace(/file:\/\/[^\s)"'\]]+/g, u => rebaseDocumentUri(u) || u);
    if (next !== text) changed = true;
    return next;
  };
  const fixHolder = <T extends MediaHolder>(o: T): T => {
    const avatar = fix(o.avatar);
    const banner = fix(o.banner);
    const description = fixText(o.description) ?? o.description;
    return avatar === o.avatar && banner === o.banner && description === o.description ? o : {...o, avatar, banner, description};
  };
  const fixCustomFields = (cfs: CustomFieldValue[] | undefined): CustomFieldValue[] | undefined => {
    if (!Array.isArray(cfs)) return cfs;
    let cfChanged = false;
    const mapped = cfs.map(cv => {
      if (!cv || typeof cv.value !== 'string') return cv;
      const nv = fixText(cv.value) ?? cv.value;
      if (nv === cv.value) return cv;
      cfChanged = true;
      return {...cv, value: nv};
    });
    return cfChanged ? mapped : cfs;
  };
  const updatedMembers = (members || []).map(m => {
    if (!m) return m;
    const next = fixHolder(m);
    const customFields = fixCustomFields(m.customFields);
    return customFields === m.customFields ? next : {...next, customFields};
  });
  return {members: updatedMembers, system: system ? fixHolder(system) : system, changed};
};

const REFETCH = [
  {field: 'avatar', url: 'pkAvatarUrl', save: saveAvatarFromUrl},
  {field: 'banner', url: 'pkBannerUrl', save: saveBannerFromUrl},
] as const;

export const restoreMissingMediaFiles = async (
  members: Member[],
): Promise<{members: Member[]; changed: boolean}> => {
  let changed = false;
  let attempts = 0;
  const fileMissing = async (uri?: string): Promise<boolean> => {
    if (!uri || typeof uri !== 'string' || !uri.startsWith('file://')) return false;
    try { return !(await fs.exists(filePathOf(uri))); } catch (e) { log.debug('media', e); return false; }
  };
  const out: Member[] = [];
  for (const m of members || []) {
    let next = m;
    for (const r of REFETCH) {
      const url = m?.[r.url];
      if (!url || attempts >= MAX_REFETCH || !(await fileMissing(next[r.field]))) continue;
      attempts++;
      try {
        const fresh = await r.save(m.id, url);
        if (fresh) { next = {...next, [r.field]: fresh}; changed = true; }
      } catch (e) {
        logError('media', e);
      }
    }
    out.push(next);
  }
  return {members: out, changed};
};

export const rebaseChatMessageMedia = (messages: ChatMessage[]): {messages: ChatMessage[]; changed: boolean} => {
  let changed = false;
  const out = (messages || []).map(msg => {
    if (!msg || (msg.type !== 'image' && msg.type !== 'file')) return msg;
    const next = rebaseDocumentUri(msg.content);
    if (next && next !== msg.content) { changed = true; return {...msg, content: next}; }
    return msg;
  });
  return {messages: out, changed};
};

const isInlineData = (v: unknown): v is string => typeof v === 'string' && v.startsWith('data:');

const isInlineFieldImage = (c: CustomFieldValue | undefined): c is CustomFieldValue & {value: string} =>
  !!c && !!c.fieldId && typeof c.value === 'string' && c.value.startsWith('data:image/');

const needsInlineMigration = (m: Member): boolean =>
  !!m && (isInlineData(m.avatar) || isInlineData(m.banner) || (Array.isArray(m.customFields) && m.customFields.some(isInlineFieldImage)));

const INLINE_SAVERS = [
  {field: 'avatar', save: saveAvatar},
  {field: 'banner', save: saveBannerFromBase64},
] as const;

export const migrateInlineAvatars = async (members: Member[]): Promise<{members: Member[]; changed: boolean}> => {
  if (!members.some(needsInlineMigration)) return {members, changed: false};
  let changed = false;
  const updated = await parallelMap(members, async m => {
    if (!needsInlineMigration(m)) return m;
    let next = m;
    let moved = false;
    for (const s of INLINE_SAVERS) {
      const v = m[s.field];
      if (!isInlineData(v)) continue;
      try {
        next = {...next, [s.field]: await s.save(m.id, v)};
        moved = true;
      } catch (e) {
        logError('media', e);
      }
    }
    if (Array.isArray(m.customFields)) {
      let fieldMoved = false;
      const fields: CustomFieldValue[] = [];
      for (const c of m.customFields) {
        if (isInlineFieldImage(c)) {
          try {
            fields.push({...c, value: await saveBioImage(fieldImageId(m.id, c.fieldId), c.value, dataUriImageExt(c.value, 'png'))});
            fieldMoved = true;
            continue;
          } catch (e) {
            logError('media', e);
          }
        }
        fields.push(c);
      }
      if (fieldMoved) { next = {...next, customFields: fields}; moved = true; }
    }
    if (moved) changed = true;
    return next;
  }, 4);
  return {members: keepFailed(updated, members), changed};
};

export const downsizeExistingAvatars = async (members: Member[]): Promise<{members: Member[]; changed: boolean}> => {
  let changed = false;
  const updated = await parallelMap(members, async m => {
    const av = m.avatar;
    if (!av || typeof av !== 'string' || !av.startsWith('file://')) return m;
    const path = filePathOf(av);
    try {
      const stat = await fs.stat(path).catch(() => null);
      if (!stat || Number(stat.size) <= DOWNSIZE_SKIP_BYTES) return m;
      const avatar = await downscaleOrCopy(av, path);
      changed = true;
      return {...m, avatar};
    } catch (e) { logError('media', e); }
    return m;
  }, 4);
  return {members: keepFailed(updated, members), changed};
};

const needsChatMediaMigration = (msg: ChatMessage): boolean =>
  !!msg && (msg.type === 'image' || msg.type === 'file')
  && typeof msg.content === 'string' && msg.content.startsWith('data:');

export const migrateInlineChatMedia = async (messages: ChatMessage[]): Promise<{messages: ChatMessage[]; changed: boolean}> => {
  const list = messages || [];
  if (!list.some(needsChatMediaMigration)) return {messages: list, changed: false};
  let changed = false;
  const updated = await parallelMap(list, async msg => {
    if (!needsChatMediaMigration(msg)) return msg;
    try {
      const content = await saveChatMediaDataUri(msg.id, msg.content);
      changed = true;
      return {...msg, content};
    } catch (e) {
      logError('media', e);
      return msg;
    }
  }, 4);
  return {messages: keepFailed(updated, list), changed};
};

