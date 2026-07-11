import {Member, HistoryEntry, uid} from '../utils';
import {store, KEYS} from '../storage';

export const convertSPSwitches = (switches: any[], idMap: Record<string, string>): HistoryEntry[] => {
  const parsed = switches.map((sw: any) => {
    const externalMemberIds: string[] = Array.isArray(sw.members) ? sw.members : Array.isArray(sw.content?.members) ? sw.content.members : (sw.content?.member ? [sw.content.member] : []);
    const resolvedIds = externalMemberIds.map((eid: string) => idMap[eid]).filter(Boolean) as string[];
    const rawTs = sw.content?.startTime || sw.content?.timestamp || sw.timestamp;
    const startTime: number = typeof rawTs === 'number' ? rawTs : (rawTs ? new Date(rawTs).getTime() : 0);
    const rawEnd = sw.content?.endTime;
    const endTime: number | null = rawEnd ? (typeof rawEnd === 'number' ? rawEnd : new Date(rawEnd).getTime()) : null;
    return {resolvedIds, startTime, endTime, note: sw.content?.comment || ''};
  }).filter(e => e.startTime > 0 && e.resolvedIds.length > 0);
  parsed.sort((a, b) => a.startTime - b.startTime);
  const OVERLAP_TOLERANCE = 60 * 1000;
  const groups: (typeof parsed)[] = [];
  const used = new Set<number>();
  for (let i = 0; i < parsed.length; i++) {
    if (used.has(i)) continue;
    const group = [parsed[i]]; used.add(i);
    for (let j = i + 1; j < parsed.length; j++) {
      if (used.has(j)) continue;
      const a = parsed[i]; const b = parsed[j];
      const aEnd = a.endTime ?? Date.now(); const bEnd = b.endTime ?? Date.now();
      if (Math.abs(a.startTime - b.startTime) <= OVERLAP_TOLERANCE || (b.startTime < aEnd && a.startTime < bEnd)) { group.push(b); used.add(j); }
    }
    groups.push(group);
  }
  const built = groups.map(group => {
    const allIds = [...new Set(group.flatMap(e => e.resolvedIds))];
    const startTime = Math.min(...group.map(e => e.startTime));
    const endTimes = group.map(e => e.endTime);
    const endTime = endTimes.includes(null) ? null : Math.max(...(endTimes as number[]));
    const notes = group.map(e => e.note).filter(Boolean);
    return {memberIds: allIds, startTime, endTime, note: notes.join(' | '), mood: undefined, location: undefined} as HistoryEntry;
  }).filter(h => h.memberIds.length > 0);
  built.sort((a, b) => a.startTime - b.startTime);
  for (let i = 0; i < built.length; i++) {
    if (built[i].endTime != null) continue;
    for (let j = i + 1; j < built.length; j++) {
      if (built[j].startTime > built[i].startTime) { built[i].endTime = built[j].startTime; break; }
    }
  }
  return built;
};

export const convertPKSwitches = (switches: any[], idMap: Record<string, string>): HistoryEntry[] => {
  return switches.map((sw: any, i: number, arr: any[]) => {
    const next = arr[i - 1];
    const resolvedIds = (Array.isArray(sw.members) ? sw.members : []).map((eid: string) => idMap[eid]).filter(Boolean) as string[];
    return {memberIds: resolvedIds, startTime: new Date(sw.timestamp).getTime(), endTime: next ? new Date(next.timestamp).getTime() : null, note: '', mood: undefined, location: undefined};
  }).filter(h => h.memberIds.length > 0);
};

export const normHex = (c: any): string => { const s = String(c || '').trim(); return s.startsWith('#') ? s : (s ? `#${s}` : '#DAA520'); };

export const reviveIfTombstoned = (em: Member, incoming: Partial<Member>): Partial<Member> =>
  em.deleted ? { deleted: false, archived: incoming.archived ?? false } : {};

export const mergeForeignMember = (merged: Member[], idMap: Record<string, string>, extId: string, incoming: Partial<Member>) => {
  const bySource = merged.findIndex(em => em.sourceId === extId);
  if (bySource >= 0) { merged[bySource] = {...merged[bySource], ...incoming, ...reviveIfTombstoned(merged[bySource], incoming), sourceId: extId}; idMap[extId.replace(/^[a-z]+:/, '')] = merged[bySource].id; return; }
  const lower = String(incoming.name || '').toLowerCase();
  const byName = merged.findIndex(em => !em.sourceId && em.name.toLowerCase() === lower);
  if (byName >= 0) { merged[byName] = {...merged[byName], ...incoming, ...reviveIfTombstoned(merged[byName], incoming), sourceId: extId}; idMap[extId.replace(/^[a-z]+:/, '')] = merged[byName].id; return; }
  const nid = uid();
  merged.push({id: nid, sourceId: extId, tags: [], groupIds: [], customFields: [], ...incoming} as Member);
  idMap[extId.replace(/^[a-z]+:/, '')] = nid;
};

export const finalizeMemberReplace = (merged: Member[], idMap: Record<string, string>): Member[] => {
  const kept = new Set(Object.values(idMap));
  return merged.filter(m => m.isCustomFront || kept.has(m.id));
};

export const historySig = (e: HistoryEntry): string =>
  `${e.startTime}|${[...(e.memberIds || [])].sort().join(',')}|${[...(e.coFrontIds || [])].sort().join(',')}|${[...(e.coConsciousIds || [])].sort().join(',')}|${e.changeType || 'front'}|${e.changeTime ?? ''}`;

export const mergeHistoryEntries = (incoming: HistoryEntry[], existing: HistoryEntry[]): HistoryEntry[] => {
  const map = new Map<string, HistoryEntry>();
  for (const e of existing) map.set(historySig(e), e);
  for (const e of incoming) map.set(historySig(e), e);
  return [...map.values()].sort((a, b) => b.startTime - a.startTime);
};

export const getStoredMembers = async () => await store.get<Member[]>(KEYS.members, []) || [];

export const mergeMediaIntoMembers = <K extends 'avatar' | 'banner'>(list: Member[], field: K, mediaMap: Record<string, string>) =>
  list.map(member => mediaMap[member.id] ? {...member, [field]: mediaMap[member.id]} : member);

export const psTime = (v: any): number => { if (!v) return 0; const ms = new Date(String(v)).getTime(); return isNaN(ms) ? 0 : ms; };

export const convertPluralSpaceFronts = (fronts: any[], idMap: Record<string, string>): HistoryEntry[] => {
  type PsEntry = {mid: string; tier: 'front' | 'co_front' | 'co_con'; startTime: number; endTime: number | null; live: boolean; note: string};
  const parsed: PsEntry[] = fronts.map((f: any) => {
    const mid = idMap[String(f.member_id)] || '';
    const startTime = psTime(f.started_at);
    const live = !!f.is_live;
    const parsedEnd = f.ended_at ? psTime(f.ended_at) : 0;
    const endTime = live ? null : (parsedEnd > 0 ? parsedEnd : null);
    const tier: PsEntry['tier'] = f.type === 'co_front' ? 'co_front' : f.type === 'co_con' ? 'co_con' : 'front';
    return {mid, tier, startTime, endTime, live, note: String(f.comment || '')};
  }).filter(e => e.mid && e.startTime > 0);
  parsed.sort((a, b) => a.startTime - b.startTime);
  const OVERLAP_TOLERANCE = 60 * 1000;
  const groups: PsEntry[][] = [];
  const used = new Set<number>();
  for (let i = 0; i < parsed.length; i++) {
    if (used.has(i)) continue;
    const group = [parsed[i]]; used.add(i);
    for (let j = i + 1; j < parsed.length; j++) {
      if (used.has(j)) continue;
      const a = parsed[i]; const b = parsed[j];
      const aEnd = a.endTime ?? Date.now(); const bEnd = b.endTime ?? Date.now();
      if (Math.abs(a.startTime - b.startTime) <= OVERLAP_TOLERANCE || (b.startTime < aEnd && a.startTime < bEnd)) { group.push(b); used.add(j); }
    }
    groups.push(group);
  }
  const built = groups.map(group => {
    let main = [...new Set(group.filter(e => e.tier === 'front').map(e => e.mid))];
    let coF = [...new Set(group.filter(e => e.tier === 'co_front').map(e => e.mid))].filter(id => !main.includes(id));
    const coC = [...new Set(group.filter(e => e.tier === 'co_con').map(e => e.mid))].filter(id => !main.includes(id) && !coF.includes(id));
    if (main.length === 0 && coF.length > 0) { main = coF; coF = []; }
    const startTime = Math.min(...group.map(e => e.startTime));
    const groupLive = group.some(e => e.live);
    const endVals = group.map(e => e.endTime);
    const endTime = groupLive ? null : (endVals.includes(null) ? null : Math.max(...(endVals as number[])));
    const notes = [...new Set(group.map(e => e.note).filter(Boolean))];
    return {live: groupLive, h: {
      memberIds: main, startTime, endTime, note: notes.join(' | '), mood: undefined, location: undefined,
      coFrontIds: coF.length > 0 ? coF : undefined,
      coConsciousIds: coC.length > 0 ? coC : undefined,
    } as HistoryEntry};
  }).filter(g => g.h.memberIds.length > 0);
  built.sort((a, b) => a.h.startTime - b.h.startTime);
  for (let i = 0; i < built.length; i++) {
    if (built[i].h.endTime != null || built[i].live) continue;
    for (let j = i + 1; j < built.length; j++) {
      if (built[j].h.startTime > built[i].h.startTime) { built[i].h.endTime = built[j].h.startTime; break; }
    }
  }
  return built.map(g => g.h);
};
