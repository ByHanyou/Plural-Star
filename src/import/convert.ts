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

export const findClaimableByName = (merged: Member[], claimed: Set<string>, name: string): number => {
  const lower = String(name || '').toLowerCase();
  if (!lower) return -1;
  const eligible = (em: Member) => !claimed.has(em.id) && !em.isCustomFront && !em.isFacet && em.name.toLowerCase() === lower;
  const unsourced = merged.findIndex(em => !em.sourceId && eligible(em));
  if (unsourced >= 0) return unsourced;
  return merged.findIndex(em => eligible(em));
};

export const mergeForeignMember = (merged: Member[], idMap: Record<string, string>, extId: string, incoming: Partial<Member>) => {
  const bySource = merged.findIndex(em => em.sourceId === extId);
  if (bySource >= 0) { merged[bySource] = {...merged[bySource], ...incoming, ...reviveIfTombstoned(merged[bySource], incoming), sourceId: extId}; idMap[extId.replace(/^[a-z]+:/, '')] = merged[bySource].id; return; }
  const byName = findClaimableByName(merged, new Set(Object.values(idMap)), String(incoming.name || ''));
  if (byName >= 0) { merged[byName] = {...merged[byName], ...incoming, ...reviveIfTombstoned(merged[byName], incoming), sourceId: extId}; idMap[extId.replace(/^[a-z]+:/, '')] = merged[byName].id; return; }
  const nid = uid();
  merged.push({id: nid, sourceId: extId, tags: [], groupIds: [], customFields: [], ...incoming} as Member);
  idMap[extId.replace(/^[a-z]+:/, '')] = nid;
};

export type ImportMode = 'overwrite' | 'update';

export const finalizeMemberReplace = (merged: Member[], idMap: Record<string, string>, mode: ImportMode = 'overwrite'): Member[] => {
  if (mode !== 'overwrite') return merged;
  const kept = new Set(Object.values(idMap));
  return merged.map(m => {
    if (m.isCustomFront || m.isFacet || m.deleted || kept.has(m.id)) return m;
    return {...m, archived: true, deleted: true};
  });
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

export const isOpenPluralSystem = (o: any): boolean =>
  !!o && typeof o === 'object' && typeof o.openplural_version === 'string'
  && Array.isArray(o.members) && Array.isArray(o.front_periods);

export const normalizeOpenPlural = (root: any, mediaPrefix = ''): any | null => {
  if (!isOpenPluralSystem(root)) return null;
  const sys = (Array.isArray(root.systems) ? root.systems : [])[0] || {};
  const assets = new Map<string, any>();
  for (const a of Array.isArray(root.assets) ? root.assets : []) if (a && a.id) assets.set(String(a.id), a);
  const assetPath = (id: any): string => {
    const a = id ? assets.get(String(id)) : null;
    const uri = a && a.uri ? String(a.uri) : '';
    return uri ? `${mediaPrefix}${uri}` : '';
  };

  const terms = new Map<string, any>();
  for (const t of Array.isArray(root.taxonomy_terms) ? root.taxonomy_terms : []) if (t && t.id) terms.set(String(t.id), t);
  const rolesByMember = new Map<string, string[]>();
  for (const a of Array.isArray(root.taxonomy_assignments) ? root.taxonomy_assignments : []) {
    if (!a || a.subject_type !== 'member') continue;
    const term = terms.get(String(a.term_id));
    if (!term || term.kind !== 'role' || !term.name) continue;
    const key = String(a.subject_id);
    rolesByMember.set(key, [...(rolesByMember.get(key) || []), String(term.name)]);
  }

  const fieldNames = new Map<string, string>();
  for (const f of Array.isArray(root.custom_fields) ? root.custom_fields : []) if (f && f.id) fieldNames.set(String(f.id), String(f.name || ''));
  const valuesByMember = new Map<string, {field_name: string; value: any}[]>();
  for (const v of Array.isArray(root.custom_field_values) ? root.custom_field_values : []) {
    if (!v) continue;
    const owner = String(v.member_id || v.subject_id || '');
    const name = fieldNames.get(String(v.custom_field_id || v.field_id)) || String(v.field_name || '');
    if (!owner || !name) continue;
    valuesByMember.set(owner, [...(valuesByMember.get(owner) || []), {field_name: name, value: v.value}]);
  }

  const groupsByMember = new Map<string, string[]>();
  for (const gm of Array.isArray(root.group_memberships) ? root.group_memberships : []) {
    if (!gm) continue;
    const key = String(gm.member_id || '');
    if (!key) continue;
    groupsByMember.set(key, [...(groupsByMember.get(key) || []), String(gm.group_id || '')]);
  }

  const members = (Array.isArray(root.members) ? root.members : []).map((m: any) => ({
    id: m?.id,
    name: m?.name,
    display_name: m?.display_name,
    pronouns: m?.pronouns,
    description: m?.description,
    color: m?.color,
    role: (rolesByMember.get(String(m?.id)) || []).join(', '),
    is_archived: !!m?.archived,
    is_custom_front: !!m?.is_custom_front,
    avatar_media_path: assetPath(m?.avatar_asset_id),
    banner_media_path: assetPath(m?.banner_asset_id),
    groups: groupsByMember.get(String(m?.id)) || [],
    custom_field_values: valuesByMember.get(String(m?.id)) || [],
    created_at: m?.created_at,
  }));

  const periods = Array.isArray(root.front_periods) ? root.front_periods : [];
  const at = (v: any): number => { if (!v) return 0; const ms = new Date(String(v)).getTime(); return isNaN(ms) ? 0 : ms; };

  const LIVE_AT_EXPORT_MS = 5 * 60 * 1000;
  const exportedAt = at(root.exported_at);
  let liveEnd = 0;
  if (exportedAt > 0) {
    for (const p of periods) { const e = at(p?.ended_at); if (e > liveEnd) liveEnd = e; }
    const gap = exportedAt - liveEnd;
    if (!(liveEnd > 0 && gap >= 0 && gap <= LIVE_AT_EXPORT_MS)) liveEnd = 0;
  }

  const fronts: any[] = [];
  for (const p of periods) {
    if (!p) continue;
    const live = !p.ended_at || (liveEnd > 0 && at(p.ended_at) === liveEnd);
    const assignments = Array.isArray(p.assignments) && p.assignments.length ? p.assignments : [{member_id: p.member_id, front_role: 'primary'}];
    for (const a of assignments) {
      if (!a || !a.member_id) continue;
      const role = String(a.front_role || 'primary');
      fronts.push({
        id: p.id,
        member_id: a.member_id,
        type: role === 'co_front' ? 'co_front' : role === 'co_conscious' || role === 'co_con' ? 'co_con' : 'front',
        started_at: p.started_at,
        ended_at: live ? null : p.ended_at,
        comment: a.note || p.note || '',
        is_live: live,
      });
    }
  }

  const messagesByConv = new Map<string, any[]>();
  const chat = root.chat && typeof root.chat === 'object' ? root.chat : {};
  for (const msg of Array.isArray(chat.messages) ? chat.messages : []) {
    if (!msg) continue;
    const key = String(msg.conversation_id || '');
    messagesByConv.set(key, [...(messagesByConv.get(key) || []), msg]);
  }

  return {
    system: {
      id: sys.id,
      name: sys.name,
      description: sys.description,
      color: sys.color,
      avatar_media_path: assetPath(sys.avatar_asset_id),
      banner_media_path: assetPath(sys.banner_asset_id),
    },
    members,
    fronts,
    custom_fields: (Array.isArray(root.custom_fields) ? root.custom_fields : []).map((f: any) => ({
      id: f?.id, name: f?.name, field_type: f?.field_type, is_multiple: false, values: [],
    })),
    member_groups: (Array.isArray(root.groups) ? root.groups : []).map((g: any) => ({
      id: g?.id, name: g?.name, color: g?.color, description: g?.description,
    })),
    journal_entries: (Array.isArray(root.notes) ? root.notes : []).map((n: any) => ({
      id: n?.id,
      title: n?.title,
      body: n?.body,
      created_at: n?.created_at || n?.entry_date,
      member_id: n?.member_id,
      author_member_ids: Array.isArray(n?.author_member_ids) ? n.author_member_ids : [],
    })),
    chat_channels: (Array.isArray(chat.conversations) ? chat.conversations : []).map((c: any) => ({
      id: c?.id,
      name: c?.name || c?.title,
      messages: (messagesByConv.get(String(c?.id)) || []).map((m: any) => ({
        id: m?.id, member_id: m?.member_id || m?.author_member_id, content: m?.body ?? m?.content, created_at: m?.created_at,
      })),
    })),
    polls: Array.isArray(root.polls?.polls) ? root.polls.polls : [],
  };
};

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
