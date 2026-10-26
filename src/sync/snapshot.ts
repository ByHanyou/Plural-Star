import { config } from '../config';
import { KEYS } from '../storage';
import type { Member, SystemInfo } from '../utils';
import type { MediaAdapter, StorageAdapter } from '../network/adapters';
import { fieldMediaKey, memberMediaKey, SYSTEM_AVATAR_MEDIA_KEY, SYSTEM_BANNER_MEDIA_KEY } from '../network/mediaKey';
import { MIRROR_CACHE_PREFIX, SYNC_EXCLUDE_KEYS } from '../network/types';

export const SYNC_EXCLUDE = new Set(SYNC_EXCLUDE_KEYS);

export const parseMembers = (raw: string | null | undefined): (Member | null)[] | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as (Member | null)[]) : null;
  } catch {
    return null;
  }
};

export const parseSystem = (raw: string | null | undefined): SystemInfo | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as SystemInfo) : null;
  } catch {
    return null;
  }
};

const mediaEntries = async (media: MediaAdapter, membersRaw: string | undefined, systemRaw?: string): Promise<Record<string, string>> => {
  const out: Record<string, string> = {};
  const put = async (key: string, val: unknown, imageOnly = false): Promise<void> => {
    if (typeof val !== 'string' || !val) return;
    if (val.startsWith('data:')) {
      if (!imageOnly || val.startsWith('data:image')) out[key] = val;
      return;
    }
    if (!val.startsWith('file://')) return;
    const uri = await media.ref(val);
    if (uri) out[key] = uri;
  };
  const list = parseMembers(membersRaw);
  if (list) {
    for (const m of list) {
      if (!m) continue;
      await put(memberMediaKey('av', m.id), m.avatar);
      await put(memberMediaKey('bn', m.id), m.banner);
      if (!Array.isArray(m.customFields)) continue;
      for (const c of m.customFields) {
        if (c && c.fieldId) await put(fieldMediaKey(m.id, c.fieldId), c.value, true);
      }
    }
  }
  const sys = parseSystem(systemRaw);
  if (sys) {
    await put(SYSTEM_AVATAR_MEDIA_KEY, sys.avatar);
    await put(SYSTEM_BANNER_MEDIA_KEY, sys.banner);
  }
  return out;
};

export const buildSnapshot = async (storage: StorageAdapter, media: MediaAdapter): Promise<Record<string, string>> => {
  const keys = (await storage.allKeys()).filter(
    k => k.startsWith('ps:') && !SYNC_EXCLUDE.has(k) && !k.startsWith(MIRROR_CACHE_PREFIX),
  );
  const got = await storage.getMany(keys);
  const out: Record<string, string> = {};
  for (const k in got) {
    const v = got[k];
    if (v != null) out[k] = v;
  }
  Object.assign(out, await mediaEntries(media, out[KEYS.members], out[KEYS.system]));
  return out;
};

export class SnapshotMemo {
  private memo: {p: Promise<Record<string, string>>; at: number} | null = null;

  constructor(private readonly storage: StorageAdapter, private readonly media: MediaAdapter) {}

  get(): Promise<Record<string, string>> {
    if (this.memo && Date.now() - this.memo.at < config().sync.snapshotMemoMs) return this.memo.p;
    const memo = {p: buildSnapshot(this.storage, this.media), at: Date.now()};
    this.memo = memo;
    memo.p.catch(() => {
      if (this.memo === memo) this.memo = null;
    });
    return memo.p;
  }

  clear(): void {
    this.memo = null;
  }
}
