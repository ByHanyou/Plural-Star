import {Alert} from 'react-native';
import {importNameKey} from './importNames';
import {ImportUserError, importErrorText} from './importError';
import type {TFunction} from 'i18next';
import {Member, MemberGroup, JournalEntry, CustomFieldDef, CustomFieldValue, asRecord, uid} from '../utils';
import {store, KEYS} from '../storage';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import {readFileBytes} from '../utils/fileBytes';
import {convertAmpersandFronts, normHex, mergeForeignMember, finalizeMemberReplace, claimGroup, getStoredList, getStoredMembers, msOf, journalSig, localIds} from './convert';
import {confirmImport} from './confirm';
import {encodeBase64, encodeUTF8} from '../network/bytes';
import {saveAvatar, saveBannerFromBase64} from '../utils/mediaUtils';
import {parallelMap} from '../utils/concurrency';
import {log, logError} from '../utils/log';
import {applyImportedHistory} from './restoreCommon';
import {asArray} from './formats';
import type {AmSystem, AmMember, AmFront, AmField, AmTag, AmPost, AmBoardMessage, AmPollEntry, AmPollVote, AmAppConfig, AmExportJson} from './formats';
import type {ExtImportCtx, AmpersandPreview} from './preview';
import {isAmparBytes, amparTables} from './ampar';
import {isAmpersandJson} from './detect';

export type AmpersandCtx = ExtImportCtx & {setRestoreProgress?: (label: string) => void};

const bytesToText = (b: Uint8Array): string => {
  const text = encodeUTF8(b);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
};

const amparToPreview = async (bytes: Uint8Array, fallbackSystemName: string): Promise<AmpersandPreview> => {
  const byTable = await amparTables(bytes);
  const systems = asArray<AmSystem>(byTable.systems);
  const config = asArray<AmAppConfig>(byTable.__config)[0];
  const defaultId = String(config?.appConfig?.defaultSystem || '');
  return {
    source: 'ampersand',
    system: systems.find(s => String(s?.uuid) === defaultId) || systems[0] || {name: fallbackSystemName},
    systems,
    members: asArray<AmMember>(byTable.members),
    switches: asArray<AmFront>(byTable.frontingEntries),
    customFields: asArray<AmField>(byTable.customFields),
    tags: asArray<AmTag>(byTable.tags),
    journalPosts: asArray<AmPost>(byTable.journalPosts),
    boardMessages: asArray<AmBoardMessage>(byTable.boardMessages),
  };
};

const ampersandJsonToPreview = (d: AmExportJson, fallbackSystemName: string): AmpersandPreview => {
  const db = d.database;
  const systems = asArray<AmSystem>(db.systems);
  const defaultId = String(d.config?.appConfig?.defaultSystem || '');
  const systemRow = systems.find(s => String(s?.uuid) === defaultId) || systems[0] || {name: fallbackSystemName};
  const members = asArray<AmMember>(db.members)
    .filter(a => !!a)
    .map(a => {
      const cfs = a.customFields;
      return {
        ...a,
        customFields: {value: Object.entries(asRecord(cfs) ?? {})},
      };
    });
  return {
    source: 'ampersand',
    system: systemRow,
    systems,
    members,
    switches: asArray<AmFront>(db.frontingEntries),
    customFields: asArray<AmField>(db.customFields),
    tags: asArray<AmTag>(db.tags),
    journalPosts: asArray<AmPost>(db.journalPosts),
    boardMessages: asArray<AmBoardMessage>(db.boardMessages),
  };
};

type Job = {localId: string; b64: string; kind: 'avatar' | 'banner'};

const attachAmparMedia = async (
  amMembers: AmMember[],
  idMap: ReadonlyMap<string, string>,
  setRestoreProgress: ((label: string) => void) | undefined,
  t: TFunction,
): Promise<void> => {
  const asBase64 = (v: unknown): string | null => {
    if (!v) return null;
    if (typeof v === 'string') return v.startsWith('data:') && v.includes(',') ? v : null;
    const raw = asRecord(v)?.value;
    if (raw instanceof Uint8Array) return raw.length > 0 ? encodeBase64(raw) : null;
    if (Array.isArray(raw)) return raw.length > 0 ? encodeBase64(Uint8Array.from(raw as number[])) : null;
    return null;
  };
  const jobs: Job[] = [];
  amMembers.forEach(a => {
    const localId = idMap.get(String(a?.uuid));
    if (!localId) return;
    const av = asBase64(a?.image);
    if (av) jobs.push({localId, b64: av, kind: 'avatar'});
    const bn = asBase64(a?.cover);
    if (bn) jobs.push({localId, b64: bn, kind: 'banner'});
  });
  if (jobs.length === 0) return;
  setRestoreProgress?.(t('share.progressAvatars'));
  const avatars = new Map<string, string>();
  const banners = new Map<string, string>();
  let done = 0;
  await parallelMap(jobs, async (j: Job) => {
    try {
      const uri = j.kind === 'avatar' ? await saveAvatar(j.localId, j.b64) : await saveBannerFromBase64(j.localId, j.b64);
      if (uri) (j.kind === 'avatar' ? avatars : banners).set(j.localId, uri);
    } catch (e) { logError('import', e); }
    done++;
    setRestoreProgress?.(t('share.progressAvatarsN', {done, total: jobs.length}));
  }, 4);
  if (avatars.size === 0 && banners.size === 0) return;
  const cur = await getStoredMembers();
  await store.set(KEYS.members, cur.map(m => {
    const avatar = avatars.get(m.id);
    const banner = banners.get(m.id);
    return avatar || banner ? {...m, ...(avatar ? {avatar} : {}), ...(banner ? {banner} : {})} : m;
  }));
};

const amparJournalEntries = (
  posts: AmPost[],
  board: AmBoardMessage[],
  idMap: ReadonlyMap<string, string>,
  tagNameById: ReadonlyMap<string, string>,
  nameOf: (uuid: unknown) => string,
): JournalEntry[] => {
  const authorIds = (who: unknown): string[] => {
    const list: unknown[] = Array.isArray(who) ? who : who != null ? [who] : [];
    return [...new Set(localIds(idMap, list))];
  };
  const out: JournalEntry[] = posts.map(p => ({
    id: uid(),
    title: String(p?.title || '').trim(),
    body: String(p?.body || ''),
    authorIds: authorIds(p?.members ?? p?.member),
    hashtags: asArray(p?.tags).flatMap(tid => tagNameById.get(String(tid)) || []),
    timestamp: msOf(p?.date),
    pinned: !!p?.isPinned,
  }));
  board.forEach(b => {
    let body = String(b?.body || '');
    const entries = asArray<AmPollEntry>(b?.poll?.entries);
    if (entries.length > 0) {
      const lines = entries.map(e => {
        const votes = asArray<AmPollVote>(e?.votes);
        const who = votes.map(v => {
          const n = nameOf(v?.member);
          const reason = String(v?.reason || '').trim();
          return reason ? `${n} (${reason})` : n;
        }).filter(Boolean);
        return `- **${String(e?.choice || '')}** - ${votes.length}${who.length ? `: ${who.join(', ')}` : ''}`;
      });
      body = `${body}\n\n${lines.join('\n')}`.trim();
    }
    out.push({
      id: uid(),
      title: String(b?.title || '').trim(),
      body,
      authorIds: authorIds(b?.members ?? b?.member),
      hashtags: [],
      timestamp: msOf(b?.date),
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
    let bytes: Uint8Array | null = null;
    try {
      bytes = await readFileBytes(path, res.uri);
    } catch (e) {
      log.debug('import', e);
    }
    if (bytes && isAmparBytes(bytes)) {
      let prev: AmpersandPreview;
      try {
        prev = await amparToPreview(bytes, t('share.system'));
      } catch (e) {
        log.debug('import', e);
        throw new ImportUserError(t('share.couldNotReadAmpar'));
      }
      bytes = null;
      if (prev.members.length === 0 && prev.switches.length === 0) throw new ImportUserError(t('share.amparEmpty'));
      setExtPreview(prev);
      setImportSource('ampersand');
      return;
    }
    let jsonDb: AmExportJson | null = null;
    if (bytes) {
      try {
        const parsed: unknown = JSON.parse(bytesToText(bytes));
        if (isAmpersandJson(parsed)) jsonDb = parsed;
      } catch (e) {
        log.debug('import', e);
      }
      bytes = null;
    }
    if (jsonDb) {
      const prev = ampersandJsonToPreview(jsonDb, t('share.system'));
      if (prev.members.length === 0 && prev.switches.length === 0) throw new ImportUserError(t('share.amparEmpty'));
      setExtPreview(prev);
      setImportSource('ampersand');
      return;
    }
    throw new ImportUserError(t('share.ampersandNeedsJson'));
  } catch (e) { if (!isPickerCancel(e)) Alert.alert(t('share.importFailed'), importErrorText(e, t)); }
};

export const handleAmpersandConfirm = (ctx: AmpersandCtx) => {
  const {extPreview, extSel, importMode, system, t, setImportStatus, setImportMsg, setExtPreview, onDataImported, setRestoreProgress} = ctx;
  if (!extPreview || extPreview.source !== 'ampersand') return;
  confirmImport(t, importMode, async () => {
    try {
      const amMembers = extPreview.members;
      const amFronts = extPreview.switches;
      const amFields = extPreview.customFields;
      const idMap = new Map<string, string>();

      if (extSel.system && extPreview.system?.name) {
        await store.set(KEYS.system, {...system, name: String(extPreview.system.name) || system.name});
      }

      const fieldIdMap = new Map<string, string>();
      let ageFieldId = '';
      if (extSel.customFields) {
        const existingDefs = await getStoredList<CustomFieldDef>(KEYS.customFieldDefs);
        const newDefs: CustomFieldDef[] = [];
        const findDef = (name: string) => [...existingDefs, ...newDefs].find(d => importNameKey(d.name) === importNameKey(name));
        amFields.forEach((f, i) => {
          const name = String(f.name || t('share.fieldN', {n: i + 1}));
          const existing = findDef(name);
          const localId = existing ? existing.id : uid();
          fieldIdMap.set(String(f.uuid), localId);
          if (!existing) newDefs.push({id: localId, name, type: 'text', sortOrder: f.priority ?? existingDefs.length + i});
        });
        const hasAge = amMembers.some(a => a?.age != null && String(a.age).trim() !== '');
        if (hasAge && !amFields.some(f => String(f.name || '').toLowerCase() === 'age')) {
          const ageDef = findDef(t('share.ageField'));
          if (ageDef) ageFieldId = ageDef.id;
          else {
            ageFieldId = uid();
            newDefs.push({id: ageFieldId, name: t('share.ageField'), type: 'text', sortOrder: existingDefs.length + newDefs.length});
          }
        }
        if (newDefs.length > 0) await store.set(KEYS.customFieldDefs, [...existingDefs, ...newDefs]);
      }

      const amSystems = extPreview.systems;
      const amTags = extPreview.tags;
      const sysGroupMap = new Map<string, string>();
      const tagGroupMap = new Map<string, string>();
      const tagNameById = new Map<string, string>();
      amTags.forEach(tg => { if (tg?.uuid != null) tagNameById.set(String(tg.uuid), String(tg.name || '')); });
      if (extSel.members) {
        const existingGroups = await getStoredList<MemberGroup>(KEYS.groups);
        const newGroups: MemberGroup[] = [];
        const claim = (name: string, sourceId: string, color?: string): string => claimGroup(existingGroups, newGroups, name.trim(), {sourceId, ...(color ? {color: normHex(color)} : {})});
        if (amSystems.length > 1) {
          amSystems.forEach((sy, i) => {
            const sName = (sy?.name && String(sy.name).trim()) || t('share.systemN', {n: i + 1});
            if (sy?.uuid != null) sysGroupMap.set(String(sy.uuid), claim(sName, 'amp:sys:' + String(sy?.uuid || i)));
          });
        }
        const usedTags = new Set<string>();
        amMembers.forEach(a => asArray(a?.tags).forEach(tid => usedTags.add(String(tid))));
        amTags.forEach(tg => {
          const tid = String(tg?.uuid ?? '');
          const name = String(tg?.name || '').trim();
          if (!tid || !name || tg?.isArchived || !usedTags.has(tid)) return;
          if (tg?.type != null && String(tg.type) !== 'member') return;
          tagGroupMap.set(tid, claim(name, 'amp:tag:' + tid, tg?.color));
        });
        if (newGroups.length > 0) await store.set(KEYS.groups, [...existingGroups, ...newGroups]);
      }

      if (extSel.members) {
        const existing = await getStoredMembers();
        const merged: Member[] = [...existing];
        amMembers.forEach(a => {
          const cf: CustomFieldValue[] = [];
          const pairs = asRecord(a.customFields)?.value;
          if (extSel.customFields && Array.isArray(pairs)) {
            pairs.forEach((pair: unknown) => {
              if (!Array.isArray(pair) || pair.length < 2) return;
              const fid = fieldIdMap.get(String(pair[0]));
              if (!fid || pair[1] == null || pair[1] === '') return;
              cf.push({fieldId: fid, value: typeof pair[1] === 'object' ? JSON.stringify(pair[1]) : String(pair[1])});
            });
          }
          if (ageFieldId && a.age != null && String(a.age).trim() !== '') {
            cf.push({fieldId: ageFieldId, value: String(a.age)});
          }
          mergeForeignMember(merged, idMap, 'amp:' + String(a.uuid), {
            name: (a.name && String(a.name).trim()) || t('share.unnamedMember'),
            pronouns: String(a.pronouns || ''), role: String(a.role || ''), color: normHex(a.color),
            description: String(a.description || ''), archived: !!a.isArchived, isCustomFront: !!(a.isCustomFront || a.isDissociativeState),
            customFields: cf,
            groupIds: [
              ...(a.system != null ? localIds(sysGroupMap, [a.system]) : []),
              ...localIds(tagGroupMap, asArray(a.tags)),
            ],
          });
        });
        await store.set(KEYS.members, finalizeMemberReplace(merged, idMap, importMode));
        await attachAmparMedia(amMembers, idMap, setRestoreProgress, t);
      } else {
        const existing = await getStoredMembers();
        amMembers.forEach(a => { const ex = existing.find(m => m.sourceId === 'amp:' + String(a.uuid)); if (ex) idMap.set(String(a.uuid), ex.id); });
      }

      if (extSel.frontHistory) {
        const newH = convertAmpersandFronts(amFronts, idMap);
        await applyImportedHistory(newH, ctx);
      }

      if (extSel.journal !== false) {
        const posts = extPreview.journalPosts;
        const board = extPreview.boardMessages;
        if (posts.length > 0 || board.length > 0) {
          const nameByUuid = new Map(amMembers.map(a => [String(a?.uuid), String(a?.name || '').trim()]));
          const nameOf = (u: unknown) => nameByUuid.get(String(u)) || '';
          const entries = amparJournalEntries(posts, board, idMap, tagNameById, nameOf);
          if (entries.length > 0) {
            const existing = await getStoredList<JournalEntry>(KEYS.journal);
            const seen = new Set(existing.map(journalSig));
            const add = entries.filter(e => !seen.has(journalSig(e)));
            if (add.length > 0) await store.set(KEYS.journal, [...add, ...existing].sort((a, b) => b.timestamp - a.timestamp));
          }
        }
      }

      setImportStatus('success'); setImportMsg(t('share.importComplete'));
      setExtPreview(null);
      setTimeout(() => onDataImported(), 800);
    } catch (e) { setImportStatus('error'); setImportMsg(importErrorText(e, t)); }
  });
};
