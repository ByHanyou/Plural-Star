import {Member, MemberGroup, HistoryEntry, CustomFieldType, asRecord, blankMember, pushTo, uid} from '../utils';
import {importNameKey} from './importNames';
import {store, KEYS} from '../storage';
import {asArray} from './formats';
import type {SpSwitchDoc, SpSwitchContent, AmFront, OuFront, PxFront, PkSwitch, PsFront, PsExport, PsMember, PsFieldDef, PsGroup, PsJournalEntry, PsChannel, PsRelationship, PsRelationshipType, OpRoot, OpSystem, OpAsset, OpTerm, OpAssignment, OpField, OpFieldValue, OpGroupMembership, OpMember, OpPeriod, OpChatMessage, OpGroup, OpNote, OpConversation} from './formats';

export const msOf = (v: unknown): number => (typeof v === 'number' ? v : (v ? new Date(String(v)).getTime() || 0 : 0));

export const localIds = (idMap: ReadonlyMap<string, string>, extIds: readonly unknown[]): string[] =>
  extIds.flatMap(eid => idMap.get(String(eid)) || []);

const OVERLAP_TOLERANCE = 60 * 1000;

type Span = {startTime: number; endTime: number | null};

const sweepSegments = <E extends Span>(entries: E[], visit: (active: E[], starting: E[], from: number, to: number | null) => void): void => {
  const snap = snapToClusters(entries.flatMap(e => (e.endTime === null ? [e.startTime] : [e.startTime, e.endTime])));
  const startsAt = new Map<number, E[]>();
  const endsAt = new Map<number, E[]>();
  for (const p of entries) {
    const e = {...p, startTime: snap(p.startTime), endTime: p.endTime === null ? null : snap(p.endTime)};
    if (e.endTime !== null && e.endTime <= e.startTime) continue;
    pushTo(startsAt, e.startTime, e);
    if (e.endTime !== null) pushTo(endsAt, e.endTime, e);
  }
  const cuts = [...new Set([...startsAt.keys(), ...endsAt.keys()])].sort((a, b) => a - b);
  const active = new Set<E>();
  for (let i = 0; i < cuts.length; i++) {
    const from = cuts[i];
    for (const e of endsAt.get(from) || []) active.delete(e);
    const starting = startsAt.get(from) || [];
    for (const e of starting) active.add(e);
    visit([...active], starting, from, i + 1 < cuts.length ? cuts[i + 1] : null);
  }
};

const closeOpenEntries = <H extends Span>(built: H[], keepOpen: (h: H) => boolean = () => false): void => {
  built.sort((a, b) => a.startTime - b.startTime);
  for (let i = 0; i < built.length; i++) {
    if (built[i].endTime != null || keepOpen(built[i])) continue;
    for (let j = i + 1; j < built.length; j++) {
      if (built[j].startTime > built[i].startTime) {
        built[i].endTime = built[j].startTime;
        break;
      }
    }
  }
};

type SpEntry = {resolvedIds: string[]; startTime: number; endTime: number | null; live: boolean; note: string};

export const convertSPSwitches = (switches: SpSwitchDoc[], idMap: ReadonlyMap<string, string>): HistoryEntry[] => {
  const parsed: SpEntry[] = switches.map(sw => {
    const c: SpSwitchContent = {...sw, ...(sw.content || {})};
    const externalMemberIds: string[] = Array.isArray(c.members) ? c.members : (c.member ? [c.member] : []);
    const resolvedIds = localIds(idMap, externalMemberIds);
    const startTime = msOf(c.startTime || c.timestamp);
    const endTime = c.endTime ? msOf(c.endTime) || null : null;
    return {resolvedIds, startTime, endTime, live: c.live !== false, note: c.comment || ''};
  }).filter(e => e.startTime > 0 && e.resolvedIds.length > 0);
  const starts = [...new Set(parsed.map(e => e.startTime))].sort((a, b) => a - b);
  for (const e of parsed) {
    if (e.endTime !== null || e.live) continue;
    const next = starts.find(s => s > e.startTime);
    if (next !== undefined) e.endTime = next;
  }
  const built: HistoryEntry[] = [];
  sweepSegments(parsed, (active, starting, from, to) => {
    const ids = [...new Set(active.flatMap(e => e.resolvedIds))];
    if (ids.length === 0) return;
    const notes = [...new Set(starting.map(e => e.note).filter(Boolean))];
    const prev = built[built.length - 1];
    if (prev && prev.endTime === from && notes.length === 0 && sameIds(prev.memberIds, ids)) {
      prev.endTime = to;
      return;
    }
    built.push({memberIds: ids, startTime: from, endTime: to, note: notes.join(' | ')});
  });
  return built;
};

type AmEntry = {mid: string; main: boolean; startTime: number; endTime: number | null; note: string};

export const convertAmpersandFronts = (entries: AmFront[], idMap: ReadonlyMap<string, string>): HistoryEntry[] => {
  const parsed: AmEntry[] = entries.map(f => ({
    mid: idMap.get(String(f?.member ?? '')) || '',
    main: f?.isMainFronter !== false,
    startTime: msOf(f?.startTime),
    endTime: f?.endTime != null ? (msOf(f.endTime) || null) : null,
    note: String(f?.comment ?? f?.summary ?? '').trim(),
  })).filter(e => e.mid && e.startTime > 0);
  const built: HistoryEntry[] = [];
  sweepSegments(parsed, (active, starting, from, to) => {
    let main = [...new Set(active.filter(e => e.main).map(e => e.mid))];
    let co = [...new Set(active.filter(e => !e.main).map(e => e.mid))].filter(id => !main.includes(id));
    if (main.length === 0) {
      main = co;
      co = [];
    }
    if (main.length === 0) return;
    const notes = [...new Set(starting.map(e => e.note).filter(Boolean))];
    const prev = built[built.length - 1];
    if (prev && prev.endTime === from && notes.length === 0 && sameIds(prev.memberIds, main) && sameIds(prev.coFrontIds, co)) {
      prev.endTime = to;
      return;
    }
    built.push({memberIds: main, startTime: from, endTime: to, note: notes.join(' | '), ...(co.length > 0 ? {coFrontIds: co} : {})});
  });
  return built;
};

export const convertOurcanaFronts = (ouFronts: OuFront[], idMap: ReadonlyMap<string, string>): HistoryEntry[] => {
  const rows = ouFronts
    .map(f => ({
      ids: localIds(idMap, asArray(f.memberIds)),
      startTime: msOf(f.startTime),
      endTime: f.isLive ? null : (f.endTime ? msOf(f.endTime) || null : null),
      isLive: !!f.isLive,
    }))
    .filter(r => r.startTime > 0 && r.ids.length > 0)
    .sort((a, b) => a.startTime - b.startTime);
  const merged: {e: HistoryEntry; live: boolean}[] = [];
  for (const r of rows) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(r.startTime - last.e.startTime) <= OVERLAP_TOLERANCE && (last.e.endTime ?? null) === (r.endTime ?? null)) {
      last.e.memberIds = [...new Set([...last.e.memberIds, ...r.ids])];
      last.live = last.live || r.isLive;
      continue;
    }
    merged.push({e: {memberIds: r.ids, startTime: r.startTime, endTime: r.endTime, note: ''}, live: r.isLive});
  }
  const live = new Set(merged.filter(m => m.live).map(m => m.e));
  const out = merged.map(m => m.e);
  closeOpenEntries(out, e => live.has(e));
  return out;
};

export const ocTime = (v: unknown): number | null => {
  if (!v) return null;
  let str = String(v);
  if (!/([zZ]|[+-]\d\d:?\d\d)$/.test(str)) str += 'Z';
  const ms = new Date(str).getTime();
  return isNaN(ms) ? null : ms;
};

export const pxTime = (v: unknown): number => {
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000;
  if (!v) return 0;
  const ms = new Date(String(v)).getTime();
  return isNaN(ms) ? 0 : ms;
};

export const convertParallaxFronts = (fronts: PxFront[], idMap: ReadonlyMap<string, string>): HistoryEntry[] => {
  const entries: HistoryEntry[] = [];
  [...fronts]
    .sort((a, b) => pxTime(a?.started_at) - pxTime(b?.started_at))
    .forEach(f => {
      const member = f?.part_id ? idMap.get(String(f.part_id)) : undefined;
      const startTime = pxTime(f?.started_at);
      if (!member || !startTime) return;
      const end = pxTime(f?.ended_at);
      entries.push({memberIds: [member], startTime, endTime: end > 0 ? end : null, note: ''});
    });
  return entries;
};

const SP_TYPES = new Map<string, CustomFieldType>(Object.entries<CustomFieldType>({'0': 'text', '1': 'color', '2': 'date', '3': 'month', '4': 'year', '5': 'monthYear', '6': 'timestamp', '7': 'monthDay', 'text': 'text', 'number': 'number', 'color': 'color', 'date': 'date', 'toggle': 'toggle', 'boolean': 'toggle', 'checkbox': 'toggle', 'markdown': 'markdown'}));

export const spFieldType = (type: unknown): CustomFieldType => SP_TYPES.get(String(type)) ?? 'text';

export const spFieldText = (raw: unknown): string | null => {
  let value: unknown = raw;
  const wrapped = asRecord(value);
  if (wrapped) {
    if ('value' in wrapped) value = wrapped.value;
    else {
      const inner = asRecord(wrapped.content);
      if (inner && 'value' in inner) value = inner.value;
    }
  }
  if (value == null) return null;
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text === '' ? null : text;
};

export const normId = (raw: unknown): string => {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number') return String(raw);
  if (typeof raw === 'object') {
    const r = raw as {$oid?: unknown; _id?: unknown; id?: unknown; toString?: unknown};
    if (typeof r.$oid === 'string') return r.$oid;
    if (typeof r._id === 'string') return r._id;
    if (typeof r.id === 'string') return r.id;
    if (typeof r.toString === 'function') { const s = String(raw); if (s && s !== '[object Object]') return s; }
  }
  return '';
};

export const convertPKSwitches = (switches: PkSwitch[], idMap: ReadonlyMap<string, string>): HistoryEntry[] => {
  return switches.map((sw, i, arr) => {
    const next = arr[i - 1];
    const resolvedIds = localIds(idMap, Array.isArray(sw.members) ? sw.members : []);
    return {memberIds: resolvedIds, startTime: new Date(String(sw.timestamp)).getTime(), endTime: next ? new Date(String(next.timestamp)).getTime() : null, note: ''};
  }).filter(h => h.memberIds.length > 0);
};

export const normHex = (c: unknown): string => {
  const s = String(c || '').trim().replace(/^#/, '');
  const full = /^[0-9a-f]{3}$/i.test(s) ? s.split('').map(ch => ch + ch).join('') : s.slice(0, 6);
  return /^[0-9a-f]{6}$/i.test(full) ? `#${full.toUpperCase()}` : '#DAA520';
};

export const reviveIfTombstoned = (em: Member, incoming: Partial<Member>): Partial<Member> =>
  em.deleted ? {deleted: false, archived: incoming.archived ?? false} : {};

export const findClaimableByName = (merged: Member[], claimed: Set<string>, name: string): number => {
  const lower = importNameKey(name);
  if (!lower) return -1;
  const eligible = (em: Member) => !claimed.has(em.id) && !em.isCustomFront && !em.isFacet && importNameKey(em.name) === lower;
  const unsourced = merged.findIndex(em => !em.sourceId && eligible(em));
  if (unsourced >= 0) return unsourced;
  return merged.findIndex(em => eligible(em));
};

export const mergeForeignMember = (merged: Member[], idMap: Map<string, string>, extId: string, incoming: Partial<Member>): string => {
  const claim = (localId: string): string => {
    idMap.set(extId.replace(/^[a-z]+:/, ''), localId);
    return localId;
  };
  const bySource = merged.findIndex(em => em.sourceId === extId);
  if (bySource >= 0) {
    merged[bySource] = {...merged[bySource], ...incoming, ...reviveIfTombstoned(merged[bySource], incoming), sourceId: extId};
    return claim(merged[bySource].id);
  }
  const byName = findClaimableByName(merged, new Set(idMap.values()), String(incoming.name || ''));
  if (byName >= 0) {
    merged[byName] = {...merged[byName], ...incoming, ...reviveIfTombstoned(merged[byName], incoming), sourceId: extId};
    return claim(merged[byName].id);
  }
  const nid = uid();
  merged.push(blankMember({id: nid, sourceId: extId, customFields: [], createdAt: undefined, ...incoming}));
  return claim(nid);
};

export type ImportMode = 'overwrite' | 'update';

export const finalizeMemberReplace = (merged: Member[], idMap: ReadonlyMap<string, string>, mode: ImportMode = 'overwrite'): Member[] => {
  if (mode !== 'overwrite') return merged;
  const kept = new Set(idMap.values());
  return merged.map(m => {
    if (m.isCustomFront || m.isFacet || m.deleted || kept.has(m.id)) return m;
    return {...m, archived: true, deleted: true};
  });
};

const historySig = (e: HistoryEntry): string =>
  `${e.startTime}|${[...(e.memberIds || [])].sort().join(',')}|${[...(e.coFrontIds || [])].sort().join(',')}|${[...(e.coConsciousIds || [])].sort().join(',')}|${e.changeType || 'front'}|${e.changeTime || ''}`;

export const mergeHistoryEntries = (incoming: HistoryEntry[], existing: HistoryEntry[]): HistoryEntry[] => {
  const map = new Map<string, HistoryEntry>();
  for (const e of existing) map.set(historySig(e), e);
  for (const e of incoming) map.set(historySig(e), e);
  return [...map.values()].sort((a, b) => b.startTime - a.startTime);
};

export const chatSig = (m: {timestamp: number; authorId: string; content: string}): string => `${m.timestamp}|${m.authorId}|${m.content}`;

export const journalSig = (j: {timestamp: number; title: string}): string => `${j.timestamp}|${j.title}`;

export const getStoredList = async <T>(key: string): Promise<T[]> => await store.get<T[]>(key, []) || [];

export const getStoredMembers = (): Promise<Member[]> => getStoredList<Member>(KEYS.members);

export const claimGroup = (existing: MemberGroup[], created: MemberGroup[], name: string, extra: Partial<MemberGroup> = {}): string => {
  const key = importNameKey(name);
  const found = existing.find(g => importNameKey(g.name) === key) || created.find(g => importNameKey(g.name) === key);
  if (found) return found.id;
  const id = uid();
  created.push({id, name, ...extra});
  return id;
};

export const mergeMediaIntoMembers = <K extends 'avatar' | 'banner'>(list: Member[], field: K, mediaMap: ReadonlyMap<string, string>) =>
  list.map(member => {
    const uri = mediaMap.get(member.id);
    return uri ? {...member, [field]: uri} : member;
  });

export const isOpenPluralSystem = (o: unknown): o is OpRoot => {
  const r = asRecord(o);
  return !!r && typeof r.openplural_version === 'string'
    && Array.isArray(r.members) && Array.isArray(r.front_periods);
};

export const isPluralSpaceExport = (o: unknown): o is PsExport => {
  const r = asRecord(o);
  return !!r && !r._meta && !!r.system && typeof r.system === 'object' && Array.isArray(r.members) && Array.isArray(r.fronts);
};

const STRICT_VISIBILITY = new Set(['private', 'trusted']);

const isPrivateOp = (m: OpMember | undefined): boolean =>
  [m?.extensions?.profile_visibility, m?.privacy?.visibility].some(v => typeof v === 'string' && STRICT_VISIBILITY.has(v.trim().toLowerCase()));

export const normalizeOpenPlural = (root: unknown, mediaPrefix = ''): PsExport | null => {
  if (!isOpenPluralSystem(root)) return null;
  const sys: OpSystem = asArray<OpSystem>(root.systems)[0] || {};
  const assets = new Map<string, OpAsset>();
  for (const a of asArray<OpAsset>(root.assets)) if (a && a.id) assets.set(String(a.id), a);
  const assetPath = (id: unknown): string => {
    const a = id ? assets.get(String(id)) : null;
    const uri = a && a.uri ? String(a.uri) : '';
    return uri ? `${mediaPrefix}${uri}` : '';
  };

  const terms = new Map<string, OpTerm>();
  for (const t of asArray<OpTerm>(root.taxonomy_terms)) if (t && t.id) terms.set(String(t.id), t);
  const rolesByMember = new Map<string, string[]>();
  for (const a of asArray<OpAssignment>(root.taxonomy_assignments)) {
    if (!a || a.subject_type !== 'member') continue;
    const term = terms.get(String(a.term_id));
    if (!term || term.kind !== 'role' || !term.name) continue;
    const key = String(a.subject_id);
    pushTo(rolesByMember, key, String(term.name));
  }

  const fieldNames = new Map<string, string>();
  for (const f of asArray<OpField>(root.custom_fields)) if (f && f.id) fieldNames.set(String(f.id), String(f.name || ''));
  const valuesByMember = new Map<string, {field_name: string; value: unknown}[]>();
  for (const v of asArray<OpFieldValue>(root.custom_field_values)) {
    if (!v) continue;
    const owner = String(v.member_id || v.subject_id || '');
    const name = fieldNames.get(String(v.custom_field_id || v.field_id)) || String(v.field_name || '');
    if (!owner || !name) continue;
    pushTo(valuesByMember, owner, {field_name: name, value: v.value});
  }

  const groupsByMember = new Map<string, string[]>();
  for (const gm of asArray<OpGroupMembership>(root.group_memberships)) {
    if (!gm) continue;
    const key = String(gm.member_id || '');
    if (!key) continue;
    pushTo(groupsByMember, key, String(gm.group_id || ''));
  }

  const members: PsMember[] = asArray<OpMember>(root.members).map(m => ({
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
    private: isPrivateOp(m),
  }));

  const periods = asArray<OpPeriod>(root.front_periods);

  const LIVE_AT_EXPORT_MS = 5 * 60 * 1000;
  const exportedAt = msOf(root.exported_at);
  let liveEnd = 0;
  if (exportedAt > 0) {
    for (const p of periods) { const e = msOf(p?.ended_at); if (e > liveEnd) liveEnd = e; }
    const gap = exportedAt - liveEnd;
    if (!(liveEnd > 0 && gap >= 0 && gap <= LIVE_AT_EXPORT_MS)) liveEnd = 0;
  }

  const fronts: PsFront[] = [];
  for (const p of periods) {
    if (!p) continue;
    const live = !p.ended_at || (liveEnd > 0 && msOf(p.ended_at) === liveEnd);
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

  const messagesByConv = new Map<string, OpChatMessage[]>();
  const chat = root.chat && typeof root.chat === 'object' ? root.chat : {};
  for (const msg of asArray<OpChatMessage>(chat.messages)) {
    if (!msg) continue;
    const key = String(msg.conversation_id || '');
    pushTo(messagesByConv, key, msg);
  }

  const customFields: PsFieldDef[] = asArray<OpField>(root.custom_fields).map(f => ({
    id: f?.id, name: f?.name, field_type: f?.field_type, is_multiple: false, values: [],
  }));
  const memberGroups: PsGroup[] = asArray<OpGroup>(root.groups).map(g => ({
    id: g?.id, name: g?.name, color: g?.color, description: g?.description,
  }));
  const journalEntries: PsJournalEntry[] = asArray<OpNote>(root.notes).map(n => ({
    id: n?.id,
    title: n?.title,
    content: n?.body,
    created_at: n?.created_at || n?.entry_date,
    member_id: n?.member_id,
    author_member_ids: Array.isArray(n?.author_member_ids) ? n.author_member_ids : [],
  }));
  const chatChannels: PsChannel[] = asArray<OpConversation>(chat.conversations).map(c => ({
    id: c?.id,
    name: c?.name || c?.title,
    messages: (messagesByConv.get(String(c?.id)) || []).map(m => ({
      id: m?.id, member_id: m?.member_id || m?.author_member_id, content: m?.body ?? m?.content, created_at: m?.created_at,
    })),
  }));

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
    custom_fields: customFields,
    member_groups: memberGroups,
    journal_entries: journalEntries,
    chat_channels: chatChannels,
    polls: Array.isArray(root.polls?.polls) ? root.polls.polls : [],
    relationship_types: asArray<PsRelationshipType>(root.relationships?.types),
    relationships: asArray<PsRelationship>(root.relationships?.edges),
  };
};

type PsEntry = {mid: string; tier: 'front' | 'co_front' | 'co_con'; startTime: number; endTime: number | null; live: boolean; note: string};

const snapToClusters = (times: number[]): ((t: number) => number) => {
  const snap = new Map<number, number>();
  let anchor = -Infinity;
  for (const t of [...new Set(times)].sort((a, b) => a - b)) {
    if (t - anchor > OVERLAP_TOLERANCE) anchor = t;
    snap.set(t, anchor);
  }
  return t => snap.get(t) ?? t;
};

const tiersOf = (active: PsEntry[]): {main: string[]; coF: string[]; coC: string[]} => {
  let main = [...new Set(active.filter(e => e.tier === 'front').map(e => e.mid))];
  let coF = [...new Set(active.filter(e => e.tier === 'co_front').map(e => e.mid))].filter(id => !main.includes(id));
  const coC = [...new Set(active.filter(e => e.tier === 'co_con').map(e => e.mid))].filter(id => !main.includes(id) && !coF.includes(id));
  if (main.length === 0 && coF.length > 0) {
    main = coF;
    coF = [];
  }
  return {main, coF, coC};
};

const sameIds = (a: readonly string[] | undefined, b: readonly string[]): boolean =>
  (a || []).length === b.length && [...(a || [])].sort().join(',') === [...b].sort().join(',');

export const convertPluralSpaceFronts = (fronts: PsFront[], idMap: ReadonlyMap<string, string>): HistoryEntry[] => {
  const parsed: PsEntry[] = fronts.map(f => {
    const mid = idMap.get(String(f.member_id)) || '';
    const startTime = msOf(f.started_at);
    const live = !!f.is_live;
    const parsedEnd = f.ended_at ? msOf(f.ended_at) : 0;
    const endTime = live ? null : (parsedEnd > 0 ? parsedEnd : null);
    const tier: PsEntry['tier'] = f.type === 'co_front' ? 'co_front' : f.type === 'co_con' ? 'co_con' : 'front';
    return {mid, tier, startTime, endTime, live, note: String(f.comment || '')};
  }).filter(e => e.mid && e.startTime > 0);
  const starts = parsed.map(e => e.startTime);
  for (const e of parsed) {
    if (e.endTime !== null || e.live) continue;
    const next = Math.min(...starts.filter(s => s > e.startTime));
    if (Number.isFinite(next)) e.endTime = next;
  }
  const snap = snapToClusters(parsed.flatMap(e => (e.endTime === null ? [e.startTime] : [e.startTime, e.endTime])));
  const spans = parsed
    .map(e => ({...e, startTime: snap(e.startTime), endTime: e.endTime === null ? null : snap(e.endTime)}))
    .filter(e => e.endTime === null || e.endTime > e.startTime);
  const cuts = [...new Set(spans.flatMap(e => (e.endTime === null ? [e.startTime] : [e.startTime, e.endTime])))].sort((a, b) => a - b);
  const built: HistoryEntry[] = [];
  for (let i = 0; i < cuts.length; i++) {
    const from = cuts[i];
    const to = i + 1 < cuts.length ? cuts[i + 1] : null;
    const active = spans.filter(e => e.startTime <= from && (e.endTime === null || e.endTime > from));
    const {main, coF, coC} = tiersOf(active);
    if (main.length === 0) continue;
    const notes = [...new Set(active.filter(e => e.startTime === from).map(e => e.note).filter(Boolean))];
    const prev = built[built.length - 1];
    if (prev && prev.endTime === from && notes.length === 0 && sameIds(prev.memberIds, main) && sameIds(prev.coFrontIds, coF) && sameIds(prev.coConsciousIds, coC)) {
      prev.endTime = to;
      continue;
    }
    built.push({
      memberIds: main,
      startTime: from,
      endTime: to,
      note: notes.join(' | '),
      coFrontIds: coF.length > 0 ? coF : undefined,
      coConsciousIds: coC.length > 0 ? coC : undefined,
    });
  }
  return built;
};
