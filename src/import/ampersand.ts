import {Alert} from 'react-native';
import type {TFunction} from 'i18next';
import {Member, MemberGroup, SystemInfo, HistoryEntry, JournalEntry, CustomFieldDef, CustomFieldValue, uid} from '../utils';
import {store, KEYS} from '../storage';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import {readFileBytes, readFileText} from '../utils/fileBytes';
import {convertSPSwitches, normHex, mergeForeignMember, finalizeMemberReplace, ImportMode} from './convert';
import {base64FromU8} from '../export/exportUtils';
import {saveAvatar, saveBannerFromBase64} from '../utils/mediaUtils';
import {parallelMap} from '../utils/concurrency';
import {logError} from '../utils/log';
import {applyImportedHistory} from './restore';

export type AmpersandCtx = {
  extPreview: any;
  extSel: Record<string, boolean>;
  importMode: ImportMode;
  system: SystemInfo;
  history: HistoryEntry[];
  t: TFunction;
  setRestoreError: any;
  setExtPreview: any;
  setImportStatus: any;
  setImportMsg: any;
  setImportSource: any;
  setRestoreProgress?: any;
  onDataImported: () => void;
};

/**
 * .ampar reader.
 *
 * Verified against a real 37 MB archive (2026-08-02), not guessed:
 *
 *   "AMPAR\0"            6-byte magic
 *   u16 be               format version (1)
 *   u16 be               reserved, 0
 *   <msgpack stream>     concatenated {table, data} maps, NOT length-prefixed
 *
 * Decoded here rather than via a dependency: it is a small, frozen subset of
 * MessagePack, and the alternative is shipping a decoder into the RN bundle for
 * one importer. Handles exactly what the format uses — maps, arrays, str, bin,
 * ints, floats, bool, nil, and ext -1 timestamps.
 *
 * Ampersand wraps two things in a `_meta` envelope:
 *   { _meta: {type:'file', name, mimeType}, value: <bin> }   member/system image
 *   { _meta: {type:'map'}, value: [[k,v], ...] }             member customFields
 * Both are left as-is — the confirm step below already reads
 * `customFields.value` as [key, value] pairs.
 */
const AMPAR_MAGIC = [0x41, 0x4d, 0x50, 0x41, 0x52, 0x00];

export const isAmparBytes = (b: Uint8Array): boolean =>
  !!b && b.length > 10 && AMPAR_MAGIC.every((c, i) => b[i] === c);

const utf8 = (b: Uint8Array, start: number, len: number): string => {
  let out = '';
  let i = start;
  const end = start + len;
  while (i < end) {
    const c = b[i++];
    if (c < 0x80) { out += String.fromCharCode(c); continue; }
    let cp: number;
    if (c < 0xe0) cp = ((c & 0x1f) << 6) | (b[i++] & 0x3f);
    else if (c < 0xf0) { cp = ((c & 0x0f) << 12) | ((b[i++] & 0x3f) << 6); cp |= b[i++] & 0x3f; }
    else {
      cp = ((c & 0x07) << 18) | ((b[i++] & 0x3f) << 12) | ((b[i++] & 0x3f) << 6);
      cp |= b[i++] & 0x3f;
    }
    if (cp > 0xffff) {
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else out += String.fromCharCode(cp);
  }
  return out;
};

export const decodeAmpar = (bytes: Uint8Array): {table: string; data: any}[] => {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 10; // magic + version + reserved

  // ext -1: the standard MessagePack timestamp. Emitted as epoch milliseconds
  // because convertSPSwitches takes a number or a date string, and a number
  // cannot be misparsed by a locale.
  const timestamp = (len: number): number => {
    if (len === 4) { const s = dv.getUint32(p); p += 4; return s * 1000; }
    if (len === 8) {
      const hi = dv.getUint32(p); const lo = dv.getUint32(p + 4); p += 8;
      const ns = hi >>> 2;
      const sec = (hi & 0x3) * 4294967296 + lo;
      return sec * 1000 + Math.floor(ns / 1e6);
    }
    if (len === 12) {
      const ns = dv.getUint32(p); const sec = Number(dv.getBigInt64(p + 4)); p += 12;
      return sec * 1000 + Math.floor(ns / 1e6);
    }
    p += len;
    return 0;
  };

  const read = (): any => {
    const c = bytes[p++];
    if (c <= 0x7f) return c;                       // positive fixint
    if (c >= 0xe0) return c - 256;                 // negative fixint
    if (c >= 0x80 && c <= 0x8f) return map(c & 0x0f);
    if (c >= 0x90 && c <= 0x9f) return arr(c & 0x0f);
    if (c >= 0xa0 && c <= 0xbf) return str(c & 0x1f);
    switch (c) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xc4: return bin(dv.getUint8(p), 1);
      case 0xc5: return bin(dv.getUint16(p), 2);
      case 0xc6: return bin(dv.getUint32(p), 4);
      case 0xc7: { const l = dv.getUint8(p); const t = dv.getInt8(p + 1); p += 2; return ext(t, l); }
      case 0xc8: { const l = dv.getUint16(p); const t = dv.getInt8(p + 2); p += 3; return ext(t, l); }
      case 0xc9: { const l = dv.getUint32(p); const t = dv.getInt8(p + 4); p += 5; return ext(t, l); }
      case 0xca: { const v = dv.getFloat32(p); p += 4; return v; }
      case 0xcb: { const v = dv.getFloat64(p); p += 8; return v; }
      case 0xcc: return dv.getUint8(p++);
      case 0xcd: { const v = dv.getUint16(p); p += 2; return v; }
      case 0xce: { const v = dv.getUint32(p); p += 4; return v; }
      case 0xcf: { const v = Number(dv.getBigUint64(p)); p += 8; return v; }
      case 0xd0: return dv.getInt8(p++);
      case 0xd1: { const v = dv.getInt16(p); p += 2; return v; }
      case 0xd2: { const v = dv.getInt32(p); p += 4; return v; }
      case 0xd3: { const v = Number(dv.getBigInt64(p)); p += 8; return v; }
      case 0xd4: { const t = dv.getInt8(p++); return ext(t, 1); }
      case 0xd5: { const t = dv.getInt8(p++); return ext(t, 2); }
      case 0xd6: { const t = dv.getInt8(p++); return ext(t, 4); }
      case 0xd7: { const t = dv.getInt8(p++); return ext(t, 8); }
      case 0xd8: { const t = dv.getInt8(p++); return ext(t, 16); }
      case 0xd9: { const l = dv.getUint8(p); p += 1; return str(l); }
      case 0xda: { const l = dv.getUint16(p); p += 2; return str(l); }
      case 0xdb: { const l = dv.getUint32(p); p += 4; return str(l); }
      case 0xdc: { const l = dv.getUint16(p); p += 2; return arr(l); }
      case 0xdd: { const l = dv.getUint32(p); p += 4; return arr(l); }
      case 0xde: { const l = dv.getUint16(p); p += 2; return map(l); }
      case 0xdf: { const l = dv.getUint32(p); p += 4; return map(l); }
      default: throw new Error(`ampar: unsupported byte 0x${c.toString(16)} at ${p - 1}`);
    }
  };
  const ext = (type: number, len: number): any => {
    if (type === -1) return timestamp(len);
    const raw = bytes.subarray(p, p + len); p += len;
    return raw;
  };
  const str = (len: number): string => { const s = utf8(bytes, p, len); p += len; return s; };
  const bin = (len: number, skip: number): Uint8Array => { p += skip; const s = bytes.subarray(p, p + len); p += len; return s; };
  const arr = (len: number): any[] => { const o: any[] = []; for (let i = 0; i < len; i++) o.push(read()); return o; };
  const map = (len: number): any => {
    const o: any = {};
    for (let i = 0; i < len; i++) { const k = read(); o[typeof k === 'string' ? k : String(k)] = read(); }
    return o;
  };

  const out: {table: string; data: any}[] = [];
  while (p < bytes.length) {
    const rec = read();
    if (rec && typeof rec === 'object' && typeof rec.table === 'string') out.push(rec);
  }
  return out;
};

/**
 * The binary archive already stores exactly the entity model the confirm step
 * wants — including customFields as [key, value] pairs — so grouping the record
 * stream by table IS the preview. No field renaming is needed anywhere.
 */
export const amparToPreview = (bytes: Uint8Array, fallbackSystemName: string) => {
  const byTable: Record<string, any[]> = {};
  for (const r of decodeAmpar(bytes)) (byTable[r.table] = byTable[r.table] || []).push(r.data);
  const systems: any[] = byTable.systems || [];
  const defaultId = String(byTable.__config?.[0]?.appConfig?.defaultSystem || '');
  return {
    system: systems.find((s: any) => String(s?.uuid) === defaultId) || systems[0] || {name: fallbackSystemName},
    systems,
    // Every system is kept, same rule as the JSON path — filtering to
    // defaultSystem silently dropped other systems' members.
    members: byTable.members || [],
    switches: byTable.frontingEntries || [],
    customFields: byTable.customFields || [],
    tags: byTable.tags || [],
    journalPosts: byTable.journalPosts || [],
    boardMessages: byTable.boardMessages || [],
  };
};

/**
 * Ampersand's JSON export (DatabaseJSON) reshaped into the same preview the
 * binary path produces, so the confirm step below stays one code path. Their
 * entity model is identical across both formats — the only difference is that
 * JSON holds custom field values as { fieldUuid: value } where the binary holds
 * [key, value] pairs, so that one field gets adapted here.
 */
export const ampersandJsonToPreview = (d: any, fallbackSystemName: string) => {
  const db = d?.database || {};
  const systems: any[] = Array.isArray(db.systems) ? db.systems : [];
  const defaultId = String(d?.config?.appConfig?.defaultSystem || '');
  const systemRow = systems.find((s: any) => String(s?.uuid) === defaultId) || systems[0] || {name: fallbackSystemName};
  const members = (Array.isArray(db.members) ? db.members : [])
    // ALL systems are kept. We used to filter to defaultSystem, which silently
    // DROPPED every other system's members — real data loss for multi-system
    // users. Each Ampersand system becomes a group instead (confirm step), so
    // nothing merges into an indistinguishable pile and nothing is lost.
    .filter((a: any) => !!a)
    .map((a: any) => ({
      ...a,
      customFields: {value: Object.entries(a.customFields && typeof a.customFields === 'object' ? a.customFields : {})},
    }));
  return {
    system: systemRow,
    systems,
    members,
    switches: Array.isArray(db.frontingEntries) ? db.frontingEntries : [],
    customFields: Array.isArray(db.customFields) ? db.customFields : [],
    tags: Array.isArray(db.tags) ? db.tags : [],
    journalPosts: Array.isArray(db.journalPosts) ? db.journalPosts : [],
    boardMessages: Array.isArray(db.boardMessages) ? db.boardMessages : [],
  };
};

/**
 * Member images ride INSIDE the archive as raw bytes
 * ({_meta:{type:'file'}, value}), so unlike every other importer there is
 * nothing to download — just decode and save. Written after the members land so
 * a failure here costs avatars, never the roster.
 */
const attachAmparMedia = async (
  amMembers: any[],
  idMap: Record<string, string>,
  setRestoreProgress: any,
  t: TFunction,
): Promise<void> => {
  // Two encodings, because the same field arrives differently per format: the
  // binary archive holds {_meta:{type:'file'}, value:<bytes>}, the JSON export
  // holds a data: URI string. saveAvatar strips a data: prefix itself, so both
  // reduce to one base64 string.
  const asBase64 = (v: any): string | null => {
    if (!v) return null;
    if (typeof v === 'string') return v.startsWith('data:') && v.includes(',') ? v : null;
    const raw = v.value;
    return raw && typeof raw.length === 'number' && raw.length > 0 ? base64FromU8(raw as Uint8Array) : null;
  };
  type Job = {localId: string; b64: string; kind: 'avatar' | 'banner'};
  const jobs: Job[] = [];
  amMembers.forEach((a: any) => {
    const localId = idMap[String(a?.uuid)];
    if (!localId) return;
    const av = asBase64(a?.image);
    if (av) jobs.push({localId, b64: av, kind: 'avatar'});
    const bn = asBase64(a?.cover);
    if (bn) jobs.push({localId, b64: bn, kind: 'banner'});
  });
  if (jobs.length === 0) return;
  setRestoreProgress?.(t('share.progressAvatars'));
  const avatars: Record<string, string> = {};
  const banners: Record<string, string> = {};
  let done = 0;
  await parallelMap(jobs, async (j: Job) => {
    try {
      const uri = j.kind === 'avatar' ? await saveAvatar(j.localId, j.b64) : await saveBannerFromBase64(j.localId, j.b64);
      if (uri) (j.kind === 'avatar' ? avatars : banners)[j.localId] = uri;
    } catch (e) { logError('import', e); }
    done++;
    setRestoreProgress?.(t('share.progressAvatarsN', {done, total: jobs.length}));
  }, 4);
  if (Object.keys(avatars).length === 0 && Object.keys(banners).length === 0) return;
  const cur = await store.get<Member[]>(KEYS.members, []) || [];
  await store.set(KEYS.members, cur.map(m => (avatars[m.id] || banners[m.id])
    ? {...m, ...(avatars[m.id] ? {avatar: avatars[m.id]} : {}), ...(banners[m.id] ? {banner: banners[m.id]} : {})}
    : m));
};

/**
 * Ampersand's journal posts and its system message board both become journal
 * entries: they are the only two things it has that are dated, titled, authored
 * prose. A board message's poll has no equivalent of ours (ours target a single
 * member, theirs are system-wide), so rather than invent a shape the results are
 * rendered into the body — nothing is lost and nothing is faked.
 */
const amparJournalEntries = (
  posts: any[],
  board: any[],
  idMap: Record<string, string>,
  tagNameById: Record<string, string>,
  nameOf: (uuid: any) => string,
): JournalEntry[] => {
  const at = (v: any): number => typeof v === 'number' ? v : (v ? new Date(String(v)).getTime() || 0 : 0);
  const authorIds = (memberUuid: any): string[] => {
    const local = idMap[String(memberUuid)];
    return local ? [local] : [];
  };
  const out: JournalEntry[] = posts.map((p: any) => ({
    id: uid(),
    title: String(p?.title || '').trim(),
    body: String(p?.body || ''),
    authorIds: authorIds(p?.member),
    hashtags: (Array.isArray(p?.tags) ? p.tags : []).map((tid: any) => tagNameById[String(tid)]).filter(Boolean),
    timestamp: at(p?.date),
    pinned: !!p?.isPinned,
  }));
  board.forEach((b: any) => {
    let body = String(b?.body || '');
    const entries = Array.isArray(b?.poll?.entries) ? b.poll.entries : [];
    if (entries.length > 0) {
      const lines = entries.map((e: any) => {
        const votes = Array.isArray(e?.votes) ? e.votes : [];
        const who = votes.map((v: any) => {
          const n = nameOf(v?.member);
          const reason = String(v?.reason || '').trim();
          return reason ? `${n} (${reason})` : n;
        }).filter(Boolean);
        return `- **${String(e?.choice || '')}** — ${votes.length}${who.length ? `: ${who.join(', ')}` : ''}`;
      });
      body = `${body}\n\n${lines.join('\n')}`.trim();
    }
    out.push({
      id: uid(),
      title: String(b?.title || '').trim(),
      body,
      authorIds: authorIds(b?.member),
      hashtags: [],
      timestamp: at(b?.date),
      pinned: !!b?.isPinned,
    });
  });
  return out.filter(e => e.title || e.body).sort((a, b) => b.timestamp - a.timestamp);
};

export const handleAmpersandPick = async (ctx: AmpersandCtx) => {
  const {setRestoreError, setExtPreview, setImportStatus, setImportMsg, t, setImportSource} = ctx;
    setRestoreError(''); setExtPreview(null); setImportStatus('idle'); setImportMsg('');
    try {
      const [res] = await safePick({type: ['*/*']});
      if (!res) return;
      const path = getPickedFilePath(res);
      // Ampersand's JSON export is the format their dev recommends — the binary
      // one changes shape every few releases. Try text first; a binary file just
      // fails JSON.parse and falls through to the old decoder.
      let jsonDb: any = null;
      try {
        const txt: string = await readFileText(path, res.uri);
        const parsed = JSON.parse(txt);
        if (parsed && parsed.database && Array.isArray(parsed.database.members)) jsonDb = parsed;
      } catch {}
      if (jsonDb) {
        const prev = ampersandJsonToPreview(jsonDb, t('share.system'));
        if (prev.members.length === 0 && prev.switches.length === 0) throw new Error(t('share.amparEmpty'));
        setExtPreview(prev);
        setImportSource('ampersand');
        return;
      }
      // Not JSON — try the binary archive. Streamed read: a whole-file base64
      // readFile of a 37MB .ampar OOM-crashed low-RAM devices (Play Console
      // ReactNativeBlobUtilFS.readFile OutOfMemoryError cluster).
      let bytes: Uint8Array | null = null;
      try {
        bytes = await readFileBytes(path, res.uri);
      } catch {}
      if (bytes && isAmparBytes(bytes)) {
        const prev = amparToPreview(bytes, t('share.system'));
        if (prev.members.length === 0 && prev.switches.length === 0) throw new Error(t('share.amparEmpty'));
        setExtPreview(prev);
        setImportSource('ampersand');
        return;
      }
      throw new Error(t('share.ampersandNeedsJson', {
        defaultValue: "That isn't an Ampersand JSON export. In Ampersand, use Export your data and pick the JSON file.",
      }));
    } catch (e: any) { if (!isPickerCancel(e)) Alert.alert(t('share.importFailed'), e.message || t('share.couldNotReadAmpar')); }
  };

export const handleAmpersandConfirm = (ctx: AmpersandCtx) => {
  const {extPreview, extSel, importMode, system, t, setImportStatus, setImportMsg, setExtPreview, onDataImported, setRestoreProgress} = ctx;
    if (!extPreview) return;
    Alert.alert(t('share.importData'), t(importMode === 'update' ? 'share.importUpdateDataMsg' : 'share.importAddDataMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('share.importBtn'), onPress: async () => {
        try {
          const amMembers = extPreview.members || [];
          const amFronts = extPreview.switches || [];
          const amFields = extPreview.customFields || [];
          const idMap: Record<string, string> = {};

          if (extSel.system && extPreview.system?.name) {
            await store.set(KEYS.system, {...system, name: String(extPreview.system.name) || system.name});
          }

          const fieldIdMap: Record<string, string> = {};
          // Ampersand keeps `age` on the member itself; we have no native age,
          // so it becomes an "Age" custom field instead of being dropped. The
          // name is deliberately NOT localized: customFieldDefs sync across
          // devices/platforms, and Desktop dedupes defs by name — a translated
          // name here and a plain one there would double the field.
          let ageFieldId = '';
          if (extSel.customFields) {
            const defs: CustomFieldDef[] = amFields.map((f: any, i: number) => {
              const localId = uid();
              fieldIdMap[String(f.uuid)] = localId;
              return {id: localId, name: String(f.name || `Field ${i + 1}`), type: 'text', sortOrder: f.priority ?? i};
            });
            const hasAge = amMembers.some((a: any) => a?.age != null && String(a.age).trim() !== '');
            if (hasAge && !defs.some(d => d.name.toLowerCase() === 'age')) {
              ageFieldId = uid();
              defs.push({id: ageFieldId, name: 'Age', type: 'text', sortOrder: defs.length});
            }
            await store.set(KEYS.customFieldDefs, defs);
          }

          // Every Ampersand system becomes a group when the export holds more
          // than one, so multi-system rosters stay tellable-apart. A single
          // system needs no group — that is just the roster.
          const amSystems: any[] = Array.isArray(extPreview.systems) ? extPreview.systems : [];
          const amTags: any[] = Array.isArray(extPreview.tags) ? extPreview.tags : [];
          const sysGroupMap: Record<string, string> = {};
          const tagGroupMap: Record<string, string> = {};
          const tagNameById: Record<string, string> = {};
          amTags.forEach((tg: any) => { if (tg?.uuid != null) tagNameById[String(tg.uuid)] = String(tg.name || ''); });
          if (extSel.members) {
            const existingGroups = await store.get<MemberGroup[]>(KEYS.groups, []) || [];
            const newGroups: MemberGroup[] = [];
            const claimGroup = (name: string, sourceId: string, color?: string): string => {
              const clean = name.trim();
              const existing = existingGroups.find(eg => eg.name.toLowerCase() === clean.toLowerCase())
                || newGroups.find(ng => ng.name.toLowerCase() === clean.toLowerCase());
              if (existing) return existing.id;
              const localId = uid();
              newGroups.push({id: localId, name: clean, sourceId, ...(color ? {color: normHex(color)} : {})});
              return localId;
            };
            if (amSystems.length > 1) {
              amSystems.forEach((sy: any, i: number) => {
                const sName = (sy?.name && String(sy.name).trim()) || `System ${i + 1}`;
                if (sy?.uuid != null) sysGroupMap[String(sy.uuid)] = claimGroup(sName, 'amp:sys:' + String(sy?.uuid || i));
              });
            }
            // Ampersand has no groups — it organises members with member-type
            // TAGS, so those are the thing that has to become groups or the
            // whole roster arrives as one undifferentiated pile. Archived tags
            // and blank names are skipped; a tag nobody carries is skipped too,
            // since an empty group is just clutter.
            const usedTags = new Set<string>();
            amMembers.forEach((a: any) => (Array.isArray(a?.tags) ? a.tags : []).forEach((tid: any) => usedTags.add(String(tid))));
            amTags.forEach((tg: any) => {
              const tid = String(tg?.uuid ?? '');
              const name = String(tg?.name || '').trim();
              if (!tid || !name || tg?.isArchived || !usedTags.has(tid)) return;
              if (tg?.type != null && String(tg.type) !== 'member') return;
              tagGroupMap[tid] = claimGroup(name, 'amp:tag:' + tid, tg?.color);
            });
            if (newGroups.length > 0) await store.set(KEYS.groups, [...existingGroups, ...newGroups]);
          }

          if (extSel.members) {
            // Through the shared merge pipeline — the old wholesale
            // store.set(newMembers) REPLACED the entire roster with only the
            // archive's members, hard-deleting custom fronts, facets, and any
            // local member the file didn't carry.
            const existing = await store.get<Member[]>(KEYS.members, []) || [];
            const merged: Member[] = [...existing];
            amMembers.forEach((a: any) => {
              const cf: CustomFieldValue[] = [];
              const pairs = a.customFields?.value;
              if (extSel.customFields && Array.isArray(pairs)) {
                pairs.forEach((pair: any) => {
                  if (!Array.isArray(pair) || pair.length < 2) return;
                  const fid = fieldIdMap[String(pair[0])];
                  if (!fid || pair[1] == null || pair[1] === '') return;
                  cf.push({fieldId: fid, value: (typeof pair[1] === 'object' ? JSON.stringify(pair[1]) : String(pair[1])) as any});
                });
              }
              if (ageFieldId && a.age != null && String(a.age).trim() !== '') {
                cf.push({fieldId: ageFieldId, value: String(a.age) as any});
              }
              mergeForeignMember(merged, idMap, 'amp:' + String(a.uuid), {
                name: (a.name && String(a.name).trim()) || 'Unnamed member',
                // role only exists in the JSON export; the binary path leaves it blank.
                pronouns: String(a.pronouns || ''), role: String(a.role || ''), color: normHex(a.color),
                // Ampersand 0.3.0 (AMPAR v2 / current JSON) renamed
                // isCustomFront → isDissociativeState; read both so old and
                // new exports import identically.
                description: String(a.description || ''), archived: !!a.isArchived, isCustomFront: !!(a.isCustomFront || a.isDissociativeState),
                customFields: cf,
                groupIds: [
                  ...(a.system != null && sysGroupMap[String(a.system)] ? [sysGroupMap[String(a.system)]] : []),
                  ...(Array.isArray(a.tags) ? a.tags.map((tid: any) => tagGroupMap[String(tid)]).filter(Boolean) : []),
                ],
              });
            });
            await store.set(KEYS.members, finalizeMemberReplace(merged, idMap, importMode));
            await attachAmparMedia(amMembers, idMap, setRestoreProgress, t);
          } else {
            const existing = await store.get<Member[]>(KEYS.members, []) || [];
            amMembers.forEach((a: any) => { const ex = existing.find(m => m.sourceId === 'amp:' + String(a.uuid)); if (ex) idMap[String(a.uuid)] = ex.id; });
          }

          if (extSel.frontHistory) {
            // 0.3.0 renamed the fronting `comment` to `summary`; read both.
            const switches = amFronts.map((f: any) => ({content: {member: String(f.member), startTime: f.startTime, endTime: f.endTime ?? null, comment: f.comment ?? f.summary}}));
            const newH = convertSPSwitches(switches, idMap);
            await applyImportedHistory(newH, ctx);
          }

          if (extSel.journal !== false) {
            const posts = Array.isArray(extPreview.journalPosts) ? extPreview.journalPosts : [];
            const board = Array.isArray(extPreview.boardMessages) ? extPreview.boardMessages : [];
            if (posts.length > 0 || board.length > 0) {
              const nameByUuid: Record<string, string> = {};
              amMembers.forEach((a: any) => { nameByUuid[String(a?.uuid)] = String(a?.name || '').trim(); });
              const nameOf = (u: any) => nameByUuid[String(u)] || '';
              const entries = amparJournalEntries(posts, board, idMap, tagNameById, nameOf);
              if (entries.length > 0) {
                const existing = await store.get<JournalEntry[]>(KEYS.journal, []) || [];
                // Dedupe on title+timestamp so re-importing the same archive
                // does not stack duplicate entries.
                const sig = (e: JournalEntry) => `${e.timestamp}|${e.title}`;
                const seen = new Set(existing.map(sig));
                const add = entries.filter(e => !seen.has(sig(e)));
                if (add.length > 0) await store.set(KEYS.journal, [...add, ...existing].sort((a, b) => b.timestamp - a.timestamp));
              }
            }
          }

          setImportStatus('success'); setImportMsg(t('share.importComplete'));
          setExtPreview(null);
          setTimeout(() => onDataImported(), 800);
        } catch (e: any) { setImportStatus('error'); setImportMsg(e.message || t('share.importFailedGeneric')); }
      }},
    ]);
  };
