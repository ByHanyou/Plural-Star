import { CLOUD_MEDIA_MARK, CLOUD_MEDIA_MISSING } from '../cloud/cloudKeys';
import { CHAT_KEY_PREFIX, KEYS, chatMsgKey } from '../storage';
import type { ChatMessage } from '../utils';
import type { MediaAdapter, StorageAdapter } from '../network/adapters';
import { chatMediaKey, fieldMediaKey, memberMediaKey, parseMediaKey, SYSTEM_AVATAR_MEDIA_KEY, SYSTEM_BANNER_MEDIA_KEY } from '../network/mediaKey';
import { logError } from '../utils/log';
import { syncHash } from './hash';
import { parseMembers, parseSystem } from './snapshot';

export interface SyncIO {
  storage: StorageAdapter;
  media: MediaAdapter;
  setHash(key: string, hash: string): void;
}

export const writeJson = async (io: SyncIO, key: string, value: unknown): Promise<void> => {
  const v = JSON.stringify(value);
  await io.storage.setRaw(key, v);
  io.setHash(key, syncHash(v));
};

const parseChat = (raw: string | null | undefined): (ChatMessage | null)[] | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as (ChatMessage | null)[]) : null;
  } catch {
    return null;
  }
};

export const applyMedia = async (io: SyncIO, key: string, dataUri: string): Promise<boolean> => {
  const mk = parseMediaKey(key);
  if (!mk || mk.kind === 'chat') return false;
  try {
    if (mk.kind === 'sysav' || mk.kind === 'sysbn') {
      const isAv = mk.kind === 'sysav';
      const uri = await io.media.saveSystemImage(isAv ? 'avatar' : 'banner', dataUri);
      const sys = parseSystem(await io.storage.getRaw(KEYS.system));
      if (!sys) return false;
      sys[isAv ? 'avatar' : 'banner'] = uri;
      await writeJson(io, KEYS.system, sys);
      return true;
    }
    const list = parseMembers(await io.storage.getRaw(KEYS.members));
    if (!list) return false;
    const member = list.find(x => x && x.id === mk.memberId);
    if (!member) return false;
    if (mk.kind === 'cf') {
      const fields = Array.isArray(member.customFields) ? member.customFields : [];
      const fi = fields.findIndex(c => c && c.fieldId === mk.fieldId);
      if (fi < 0) return false;
      fields[fi] = {...fields[fi], value: await io.media.saveFieldImage(mk.memberId, mk.fieldId, dataUri)};
      member.customFields = fields;
    } else {
      member[mk.kind === 'av' ? 'avatar' : 'banner'] = await io.media.saveMemberImage(mk.kind === 'av' ? 'avatar' : 'banner', mk.memberId, dataUri);
    }
    await writeJson(io, KEYS.members, list);
    return true;
  } catch (e) {
    logError('sync', e);
    return false;
  }
};

export const applyChatMedia = async (io: SyncIO, key: string, dataUri: string): Promise<boolean> => {
  const mk = parseMediaKey(key);
  if (!mk || mk.kind !== 'chat') return false;
  const storeKey = chatMsgKey(mk.channelId);
  try {
    const list = parseChat(await io.storage.getRaw(storeKey));
    if (!list) return false;
    const idx = list.findIndex(x => x && x.id === mk.msgId);
    const msg = list[idx];
    if (!msg) return false;
    list[idx] = {...msg, content: await io.media.saveChatMedia(mk.msgId, dataUri)};
    await writeJson(io, storeKey, list);
    return true;
  } catch (e) {
    logError('sync', e);
    return false;
  }
};

export const clearMediaField = async (io: SyncIO, key: string): Promise<boolean> => {
  const mk = parseMediaKey(key);
  if (!mk || mk.kind === 'chat') return false;
  if (mk.kind === 'sysav' || mk.kind === 'sysbn') {
    const sys = parseSystem(await io.storage.getRaw(KEYS.system));
    if (!sys) return false;
    delete sys[mk.kind === 'sysav' ? 'avatar' : 'banner'];
    await writeJson(io, KEYS.system, sys);
    return true;
  }
  const list = parseMembers(await io.storage.getRaw(KEYS.members));
  if (!list) return false;
  const m = list.find(x => x && x.id === mk.memberId);
  let changed = false;
  if (mk.kind === 'cf') {
    const fields = m && Array.isArray(m.customFields) ? m.customFields : [];
    const fi = fields.findIndex(c => c && c.fieldId === mk.fieldId);
    if (fi >= 0) {
      fields[fi] = {...fields[fi], value: ''};
      changed = true;
    }
  } else if (m) {
    delete m[mk.kind === 'av' ? 'avatar' : 'banner'];
    changed = true;
  }
  if (!changed) return false;
  await writeJson(io, KEYS.members, list);
  return true;
};

export const preserveLocalSystemMedia = (incomingRaw: string, localRaw: string | null): string => {
  const inc = parseSystem(incomingRaw);
  if (!inc) return incomingRaw;
  const loc = parseSystem(localRaw);
  inc.avatar = loc ? loc.avatar : undefined;
  inc.banner = loc ? loc.banner : undefined;
  return JSON.stringify(inc);
};

export const preserveLocalMedia = (media: MediaAdapter, incomingRaw: string, localRaw: string | null): string => {
  const native = media.localPrefix;
  const foreign = native === 'file://' ? 'data:' : 'file://';
  try {
    const inc = parseMembers(incomingRaw);
    if (!inc) return incomingRaw;
    const loc = parseMembers(localRaw) || [];
    const byId = new Map(loc.map(x => [x?.id, x]));
    for (const mm of inc) {
      if (!mm) continue;
      const lm = byId.get(mm.id);
      mm.avatar = lm?.avatar;
      mm.banner = lm?.banner;
      if (!lm || !Array.isArray(mm.customFields) || !Array.isArray(lm.customFields)) continue;
      for (const c of mm.customFields) {
        if (!c || typeof c.value !== 'string') continue;
        const mark = c.value === CLOUD_MEDIA_MARK;
        if (!mark && !c.value.startsWith(foreign)) continue;
        const lc = lm.customFields.find(x => x && x.fieldId === c.fieldId);
        if (!lc || typeof lc.value !== 'string') continue;
        if (lc.value.startsWith(native) || (mark && lc.value.startsWith(foreign))) c.value = lc.value;
      }
    }
    return JSON.stringify(inc);
  } catch {
    return incomingRaw;
  }
};

export const preserveLocalChatMedia = (incomingRaw: string, localRaw: string | null): string => {
  try {
    const inc = parseChat(incomingRaw);
    if (!inc) return incomingRaw;
    const loc = parseChat(localRaw) || [];
    const byId = new Map(loc.map(x => [x?.id, x]));
    let changed = false;
    for (const m of inc) {
      if (!m || m.content !== CLOUD_MEDIA_MARK) continue;
      const lm = byId.get(m.id);
      const lc = lm && typeof lm.content === 'string' ? lm.content : '';
      if (lc && (lc.startsWith('file://') || lc.startsWith('data:'))) {
        m.content = lc;
        changed = true;
      }
    }
    return changed ? JSON.stringify(inc) : incomingRaw;
  } catch {
    return incomingRaw;
  }
};

export const neutralizeInlineMedia = (snap: Record<string, string>): void => {
  const isInline = (v: unknown): v is string => typeof v === 'string' && v.startsWith('data:');
  const list = parseMembers(snap[KEYS.members] || '[]');
  if (list) {
    let changed = false;
    for (const m of list) {
      if (!m || !m.id) continue;
      if (isInline(m.avatar) && snap[memberMediaKey('av', m.id)]) {
        m.avatar = CLOUD_MEDIA_MARK;
        changed = true;
      }
      if (isInline(m.banner) && snap[memberMediaKey('bn', m.id)]) {
        m.banner = CLOUD_MEDIA_MARK;
        changed = true;
      }
      if (!Array.isArray(m.customFields)) continue;
      for (const c of m.customFields) {
        if (!c || !c.fieldId || typeof c.value !== 'string' || !c.value.startsWith('data:image')) continue;
        if (!snap[fieldMediaKey(m.id, c.fieldId)]) continue;
        c.value = CLOUD_MEDIA_MARK;
        changed = true;
      }
    }
    if (changed) snap[KEYS.members] = JSON.stringify(list);
  }
  const sys = parseSystem(snap[KEYS.system] || 'null');
  if (sys) {
    let changed = false;
    if (isInline(sys.avatar) && snap[SYSTEM_AVATAR_MEDIA_KEY]) {
      sys.avatar = CLOUD_MEDIA_MARK;
      changed = true;
    }
    if (isInline(sys.banner) && snap[SYSTEM_BANNER_MEDIA_KEY]) {
      sys.banner = CLOUD_MEDIA_MARK;
      changed = true;
    }
    if (changed) snap[KEYS.system] = JSON.stringify(sys);
  }
};

export const markUnreadableMedia = (snap: Record<string, string>): void => {
  const isFile = (v: unknown): v is string => typeof v === 'string' && v.startsWith('file://');
  const expect = (key: string) => {
    if (!(key in snap)) snap[key] = CLOUD_MEDIA_MISSING;
  };
  const list = parseMembers(snap[KEYS.members] || '[]');
  if (list) {
    for (const m of list) {
      if (!m || !m.id) continue;
      if (isFile(m.avatar)) expect(memberMediaKey('av', m.id));
      if (isFile(m.banner)) expect(memberMediaKey('bn', m.id));
      if (Array.isArray(m.customFields)) {
        for (const c of m.customFields) if (c && c.fieldId && isFile(c.value)) expect(fieldMediaKey(m.id, c.fieldId));
      }
    }
  }
  const sys = parseSystem(snap[KEYS.system] || 'null');
  if (sys) {
    if (isFile(sys.avatar)) expect(SYSTEM_AVATAR_MEDIA_KEY);
    if (isFile(sys.banner)) expect(SYSTEM_BANNER_MEDIA_KEY);
  }
};

export const addChatMediaToSnapshot = async (media: MediaAdapter, snap: Record<string, string>): Promise<void> => {
  for (const k of Object.keys(snap)) {
    if (!k.startsWith(CHAT_KEY_PREFIX)) continue;
    const channelId = k.slice(CHAT_KEY_PREFIX.length);
    const msgs = parseChat(snap[k]);
    if (!msgs) continue;
    let changed = false;
    const neutral: (ChatMessage | null)[] = [];
    for (const m of msgs) {
      const c = m && (m.type === 'image' || m.type === 'file') && typeof m.content === 'string' ? m.content : '';
      if (m && c && media.isSource(c) && m.id) {
        const uri = await media.ref(c, true);
        snap[chatMediaKey(channelId, m.id)] = uri || CLOUD_MEDIA_MISSING;
        neutral.push({...m, content: CLOUD_MEDIA_MARK});
        changed = true;
      } else {
        neutral.push(m);
      }
    }
    if (changed) snap[k] = JSON.stringify(neutral);
  }
};
