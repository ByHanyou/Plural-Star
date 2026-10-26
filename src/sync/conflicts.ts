import { KEYS } from '../storage';
import { countUp, isRosterMember } from '../utils';
import type { CustomFieldDef, CustomFieldValue, Member } from '../utils';
import { logError } from '../utils/log';
import { SyncIO, writeJson } from './media';
import { parseMembers } from './snapshot';

export const realMemberCount = (raw: string): number => {
  const list = parseMembers(raw);
  return list ? list.filter(m => m && isRosterMember(m)).length : 0;
};

export const emptyListOverPopulated = (localRaw: string, incomingRaw: string): boolean => {
  try {
    const inc: unknown = JSON.parse(incomingRaw);
    if (!Array.isArray(inc) || inc.length > 0) return false;
    const loc: unknown = JSON.parse(localRaw);
    return Array.isArray(loc) && loc.length > 0;
  } catch {
    return false;
  }
};

export const rosterDropsLiveMembers = (localRaw: string, incomingRaw: string): boolean => {
  const loc = parseMembers(localRaw);
  const inc = parseMembers(incomingRaw);
  if (!loc || !inc) return false;
  const incIds = new Set(inc.filter((m): m is Member => !!m && !!m.id).map(m => m.id));
  for (const m of loc) {
    if (m && m.id && !m.deleted && !incIds.has(m.id)) return true;
  }
  return false;
};

export const frontStartTime = (raw: string | null | undefined): number | null => {
  if (!raw) return null;
  try {
    const f = JSON.parse(raw) as {startTime?: unknown} | null;
    return f && typeof f.startTime === 'number' ? f.startTime : null;
  } catch {
    return null;
  }
};

export interface FieldDefMerge {
  merged: string;
  remap: Record<string, string>;
}

export const mergeCustomFieldDefs = (localRaw: string | null, incomingRaw: string): FieldDefMerge | null => {
  try {
    const localList = (localRaw ? JSON.parse(localRaw) : []) as (CustomFieldDef | null)[];
    const incomingList = JSON.parse(incomingRaw) as (CustomFieldDef | null)[];
    if (!Array.isArray(localList) || !Array.isArray(incomingList)) return null;
    const nameKey = (d: CustomFieldDef | null) => String(d?.name || '').trim().toLowerCase();
    const remap: Record<string, string> = {};
    const merged: CustomFieldDef[] = [];
    const seenIds = new Set<string>();
    for (const d of localList) {
      if (!d || !d.id || seenIds.has(String(d.id))) continue;
      seenIds.add(String(d.id));
      merged.push(d);
    }
    const nameCounts = (list: (CustomFieldDef | null)[]) => {
      const counts = new Map<string, number>();
      for (const d of list) {
        if (!d || !d.id) continue;
        const k = nameKey(d);
        if (!k) continue;
        countUp(counts, k);
      }
      return counts;
    };
    const localCounts = nameCounts(merged);
    const incomingCounts = nameCounts(incomingList);
    const byName = new Map<string, CustomFieldDef>();
    for (const d of merged) {
      const k = nameKey(d);
      if (k && localCounts.get(k) === 1) byName.set(k, d);
    }
    for (const d of incomingList) {
      if (!d || !d.id || seenIds.has(String(d.id))) continue;
      const k = nameKey(d);
      const ex = k && incomingCounts.get(k) === 1 ? byName.get(k) : undefined;
      if (!ex) {
        seenIds.add(String(d.id));
        merged.push(d);
        continue;
      }
      if (String(d.id) < String(ex.id)) {
        remap[String(ex.id)] = String(d.id);
        const idx = merged.findIndex(x => String(x.id) === String(ex.id));
        if (idx >= 0) merged[idx] = d;
        seenIds.delete(String(ex.id));
        seenIds.add(String(d.id));
        byName.set(k, d);
      } else {
        remap[String(d.id)] = String(ex.id);
      }
    }
    const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
    merged.sort((a, b) =>
      ((a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)) ||
      cmp(String(a.name || ''), String(b.name || '')) ||
      cmp(String(a.id), String(b.id)));
    return {merged: JSON.stringify(merged), remap};
  } catch {
    return null;
  }
};

export const remapMemberFieldIds = async (io: SyncIO, remap: Record<string, string>): Promise<void> => {
  if (Object.keys(remap).length === 0) return;
  try {
    const list = parseMembers(await io.storage.getRaw(KEYS.members));
    if (!list) return;
    let changed = false;
    for (const m of list) {
      if (!m || !Array.isArray(m.customFields) || m.customFields.length === 0) continue;
      const kept = new Set(m.customFields.filter(c => c && !remap[c.fieldId]).map(c => c.fieldId));
      const next: CustomFieldValue[] = [];
      let mChanged = false;
      for (const c of m.customFields) {
        if (!c) continue;
        const target = remap[c.fieldId];
        if (!target) { next.push(c); continue; }
        mChanged = true;
        if (kept.has(target)) continue;
        next.push({...c, fieldId: target});
        kept.add(target);
      }
      if (mChanged) {
        m.customFields = next;
        changed = true;
      }
    }
    if (changed) {
      await writeJson(io, KEYS.members, list);
    }
  } catch (e) {
    logError('network', e);
  }
};
