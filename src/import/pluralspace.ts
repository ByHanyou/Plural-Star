import {Alert} from 'react-native';
import {importNameKey} from './importNames';
import {ImportUserError, importErrorText} from './importError';
import {strFromU8} from 'fflate';
import {Member, MemberGroup, JournalEntry, ChatChannel, ChatMessage, MemberPoll, CustomFieldDef, CustomFieldType, CustomFieldValue, pushTo, withFieldValue, uid} from '../utils';
import {store, KEYS, chatMsgKey} from '../storage';
import {readZipBundle, zipEntry} from './zipBundle';
import {encodeBase64} from '../network/bytes';
import {saveAvatar} from '../utils/mediaUtils';
import {parallelMap} from '../utils/concurrency';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import {readFileText, readFileBase64} from '../utils/fileBytes';
import {mergeForeignMember, normHex, msOf, finalizeMemberReplace, convertPluralSpaceFronts, normalizeOpenPlural, isOpenPluralSystem, isPluralSpaceExport, getStoredList, getStoredMembers, mergeMediaIntoMembers, chatSig, journalSig} from './convert';
import {confirmImport} from './confirm';
import {isImportStopped} from './progress';
import {applyImportedHistory, downloadAvatarsTo} from './restoreCommon';
import {asArray} from './formats';
import type {PsExport, PsRef, PsFieldValue, PsFieldDef, PsGroup, PsJournalEntry, PsChannel, PsMessage, PsPoll, PsPollOption} from './formats';
import type {ExtImportCtx} from './preview';
import {log, logError} from '../utils/log';

const PS_FIELD_TYPE = new Map<string, CustomFieldType>([['text', 'text'], ['number', 'number'], ['boolean', 'toggle'], ['toggle', 'toggle'], ['date', 'date'], ['color', 'color'], ['markdown', 'markdown']]);

const nameKey = (v: unknown): string => String(v || '').trim().toLowerCase();

export type PluralSpaceCtx = Omit<ExtImportCtx, 'setImportSource'> & {
  psZipFiles: Record<string, Uint8Array> | null;
  psAvatarIndex: Map<string, string> | null;
  setPsAvatarIndex: (index: Map<string, string> | null) => void;
  setPsZipFiles: (files: Record<string, Uint8Array> | null) => void;
  setRestoreProgress: (label: string) => void;
};

export const handlePluralSpacePick = async (ctx: PluralSpaceCtx) => {
  const {setRestoreError, setExtPreview, setImportStatus, setImportMsg, setPsAvatarIndex, setPsZipFiles, t} = ctx;
  setRestoreError(''); setExtPreview(null); setImportStatus('idle'); setImportMsg(''); setPsAvatarIndex(null); setPsZipFiles(null);
  try {
    const [res] = await safePick({type: ['application/json', 'application/zip', 'text/plain']});
    if (!res) return;
    const path = getPickedFilePath(res);
    const isZip = /\.zip$/i.test(res.name || '') || /\.zip$/i.test(path);
    let parsed: PsExport | null = null;
    if (isZip) {
      const bundle = await readZipBundle(path, res.uri);
      if (!bundle.data) {
        const entry = Object.keys(bundle.files).find(n => /(^|\/)openplural\.json$/i.test(n));
        if (entry) {
          try {
            const root: unknown = JSON.parse(strFromU8(bundle.files[entry]));
            parsed = normalizeOpenPlural(root, entry.replace(/openplural\.json$/i, ''));
          } catch (e) { log.debug('import', e); parsed = null; }
        }
      } else if (isPluralSpaceExport(bundle.data)) {
        parsed = bundle.data;
      }
      if (!parsed) throw new ImportUserError(t('share.psNotExport'));
      setPsZipFiles(bundle.files);
    } else {
      const raw = await readFileText(path, res.uri);
      let json: unknown;
      try { json = JSON.parse(raw); } catch { throw new ImportUserError(t('share.psNotExport')); }
      if (isOpenPluralSystem(json)) parsed = normalizeOpenPlural(json);
      else if (isPluralSpaceExport(json)) parsed = json;
    }
    if (!parsed) throw new ImportUserError(t('share.psNotExport'));
    setExtPreview({
      source: 'pluralspace',
      system: parsed.system,
      members: parsed.members,
      switches: parsed.fronts,
      customFields: asArray<PsFieldDef>(parsed.custom_fields),
      groups: asArray<PsGroup>(parsed.member_groups),
      journal: asArray<PsJournalEntry>(parsed.journal_entries),
      chat: asArray<PsChannel>(parsed.chat_channels),
      polls: asArray<PsPoll>(parsed.polls),
    });
  } catch (e) { if (!isPickerCancel(e)) Alert.alert(t('share.importFailed'), importErrorText(e, t)); }
};

export const handlePluralSpaceConfirm = (ctx: PluralSpaceCtx) => {
  const {extPreview, extSel, importMode, system, psZipFiles, t, setRestoreProgress, setPsAvatarIndex, setImportStatus, setImportMsg, setExtPreview, onDataImported} = ctx;
  if (!extPreview || extPreview.source !== 'pluralspace') return;
  confirmImport(t, importMode, async () => {
    try {
      const psMembers = extPreview.members;
      const psFronts = extPreview.switches;
      const psFieldDefs = extPreview.customFields;
      const psGroups = extPreview.groups;
      const psJournal = extPreview.journal;
      const psChat = extPreview.chat;
      const psPolls = extPreview.polls;

      if (extSel.system && extPreview.system?.name) {
        await store.set(KEYS.system, {...system, name: String(extPreview.system.name) || system.name, description: String(extPreview.system.description || '') || system.description});
      }

      const idMap = new Map<string, string>();
      if (extSel.members) {
        const existing = await getStoredMembers();
        const merged: Member[] = [...existing];
        psMembers.forEach(m => {
          mergeForeignMember(merged, idMap, 'ps:' + String(m.id), {
            name: (m.name && String(m.name).trim()) || (m.display_name && String(m.display_name).trim()) || t('share.unnamedMember'),
            pronouns: String(m.pronouns || ''),
            role: Array.isArray(m.role) ? m.role.join(', ') : String(m.role || ''),
            color: normHex(m.color),
            description: String(m.description || ''),
            archived: !!m.is_archived,
            isCustomFront: !!m.is_custom_front,
            createdAt: msOf(m.created_at) || undefined,
          });
        });
        await store.set(KEYS.members, finalizeMemberReplace(merged, idMap, importMode));
      } else {
        const existing = await getStoredMembers();
        psMembers.forEach(m => { const ex = existing.find(em => em.sourceId === 'ps:' + String(m.id)); if (ex) idMap.set(String(m.id), ex.id); });
      }

      const nameToLocal = new Map<string, string>();
      psMembers.forEach(m => {
        const lid = idMap.get(String(m.id));
        if (!lid) return;
        const n = nameKey(m.name);
        if (n) nameToLocal.set(n, lid);
        const dn = nameKey(m.display_name);
        if (dn && !nameToLocal.has(dn)) nameToLocal.set(dn, lid);
      });
      (await getStoredMembers()).forEach(m => { const k = nameKey(m.name); if (k && !nameToLocal.has(k)) nameToLocal.set(k, m.id); });
      const localByName = (name: unknown): string => nameToLocal.get(nameKey(name)) || '';

      if (extSel.customFields) {
        const existingDefs = await getStoredList<CustomFieldDef>(KEYS.customFieldDefs);
        const newDefs: CustomFieldDef[] = [];
        const fieldIdByName = new Map<string, string>();
        const ensureField = (name: string, type: CustomFieldType, sortOrder: number) => {
          const key = importNameKey(name);
          if (fieldIdByName.has(key)) return;
          const existing = existingDefs.find(d => importNameKey(d.name) === key);
          if (existing) { fieldIdByName.set(key, existing.id); return; }
          const localId = uid();
          newDefs.push({id: localId, name, type, sortOrder});
          fieldIdByName.set(key, localId);
        };
        psFieldDefs.forEach((f, i) => ensureField(String(f.name || t('share.fieldN', {n: i + 1})).trim(), PS_FIELD_TYPE.get(String(f.field_type)) ?? 'text', i));
        psMembers.forEach(m => asArray<PsFieldValue>(m.custom_field_values).forEach(cv => {
          const name = String(cv.field_name || '').trim();
          if (name) ensureField(name, 'text', psFieldDefs.length + newDefs.length);
        }));
        if (newDefs.length > 0) await store.set(KEYS.customFieldDefs, [...existingDefs, ...newDefs]);
        const cur = await getStoredMembers();
        await store.set(KEYS.members, cur.map(lm => {
          const ps = psMembers.find(m => idMap.get(String(m.id)) === lm.id);
          if (!ps || !Array.isArray(ps.custom_field_values) || ps.custom_field_values.length === 0) return lm;
          const grouped = new Map<string, string[]>();
          ps.custom_field_values.forEach(cv => {
            const key = importNameKey(String(cv.field_name || '').trim());
            if (key && cv.value != null) pushTo(grouped, key, String(cv.value));
          });
          let cf: CustomFieldValue[] = lm.customFields || [];
          grouped.forEach((vals, key) => {
            const fid = fieldIdByName.get(key);
            if (fid) cf = withFieldValue(cf, fid, vals.join('\n'));
          });
          return {...lm, customFields: cf};
        }));
      }

      if (extSel.groups && psGroups.length > 0) {
        const mergedGroups: MemberGroup[] = [...(await getStoredList<MemberGroup>(KEYS.groups))];
        const groupIdMap = new Map<string, string>();
        psGroups.forEach((g, i) => {
          const name = String(g?.name || t('share.groupN', {n: i + 1}));
          const srcId = g?.id != null ? `sp:${String(g.id)}` : null;
          let lg = (srcId ? mergedGroups.find(x => x.sourceId === srcId) : undefined) || mergedGroups.find(x => !x.sourceId && importNameKey(x.name) === importNameKey(name));
          if (!lg) { lg = {id: uid(), name, color: g?.color ? normHex(g.color) : undefined, sourceId: srcId || undefined}; mergedGroups.push(lg); }
          else if (srcId) { lg.name = name; lg.sourceId = srcId; }
          groupIdMap.set(String(g?.id), lg.id);
          groupIdMap.set(name.toLowerCase(), lg.id);
        });
        await store.set(KEYS.groups, mergedGroups);
        const cur = await getStoredMembers();
        await store.set(KEYS.members, cur.map(lm => {
          const ps = psMembers.find(m => idMap.get(String(m.id)) === lm.id);
          if (!ps || !Array.isArray(ps.groups) || ps.groups.length === 0) return lm;
          const gids = ps.groups.map(g => {
            const k = typeof g === 'object' && g !== null ? String(g.id ?? g.name ?? '') : String(g);
            return groupIdMap.get(k) || groupIdMap.get(k.toLowerCase());
          }).filter((x): x is string => !!x);
          if (gids.length === 0) return lm;
          return {...lm, groupIds: [...new Set([...(lm.groupIds || []), ...gids])]};
        }));
      }

      if (extSel.frontHistory && psFronts.length > 0) {
        const newH = convertPluralSpaceFronts(psFronts, idMap);
        await applyImportedHistory(newH, ctx);
      }

      if (extSel.journal && psJournal.length > 0) {
        const existingJ = await getStoredList<JournalEntry>(KEYS.journal);
        const newJ: JournalEntry[] = psJournal.map(j => ({
          id: uid(),
          title: String(j.title || '').trim(),
          body: String(j.content || ''),
          authorIds: asArray<PsRef>(j.members).map(m => idMap.get(String(m?.id)) || localByName(m?.name)).filter(Boolean),
          hashtags: [],
          timestamp: msOf(j.date) || msOf(j.created_at) || Date.now(),
        }));
        const existingJSigs = new Set(existingJ.map(journalSig));
        const mergedJ = [...newJ.filter(j => !existingJSigs.has(journalSig(j))), ...existingJ].sort((a, b) => b.timestamp - a.timestamp);
        await store.set(KEYS.journal, mergedJ);
      }

      if (extSel.chat && psChat.length > 0) {
        const existingCh = await getStoredList<ChatChannel>(KEYS.chatChannels);
        const mergedCh: ChatChannel[] = [...existingCh];
        for (const [i, ch] of psChat.entries()) {
          const chName = String(ch?.name || '').trim() || t('share.channelN', {n: i + 1});
          let local = mergedCh.find(c => importNameKey(c.name) === importNameKey(chName));
          if (!local) { local = {id: uid(), name: chName, createdAt: msOf(ch?.created_at) || Date.now()}; mergedCh.push(local); }
          const channelId = local.id;
          const msgs = asArray<PsMessage>(ch?.messages);
          if (msgs.length > 0) {
            const existingMsgs = await getStoredList<ChatMessage>(chatMsgKey(channelId));
            const newMsgs: ChatMessage[] = msgs.map(msg => ({
              id: uid(),
              channelId,
              authorId: localByName(msg?.member_name),
              type: 'text' as const,
              content: String(msg?.content || ''),
              timestamp: msOf(msg?.created_at) || Date.now(),
            }));
            const existingMsgSigs = new Set(existingMsgs.map(chatSig));
            const mergedMsgs = [...existingMsgs, ...newMsgs.filter(x => !existingMsgSigs.has(chatSig(x)))].sort((a, b) => a.timestamp - b.timestamp);
            await store.set(chatMsgKey(channelId), mergedMsgs);
          }
        }
        await store.set(KEYS.chatChannels, mergedCh);
      }

      if (extSel.polls && psPolls.length > 0) {
        const existingPolls = await getStoredList<MemberPoll>(KEYS.polls);
        const newPolls: MemberPoll[] = psPolls.map(p => {
          const creator = idMap.get(String(p?.created_by_member?.id)) || localByName(p?.created_by_member?.name);
          const desc = String(p?.description || '').trim();
          return {
            id: uid(),
            targetMemberId: creator,
            question: [String(p?.title || '').trim(), desc].filter(Boolean).join(' - ') || '?',
            options: asArray<PsPollOption>(p?.options).map(o => ({
              id: uid(),
              label: String(o?.text || ''),
              votes: [...new Set(asArray<{member_name?: string}>(o?.votes).map(v => localByName(v?.member_name)).filter(Boolean))],
            })),
            createdBy: creator,
            createdAt: msOf(p?.created_at) || Date.now(),
            closedAt: p?.status && p.status !== 'open' ? (msOf(p?.closes_at) || Date.now()) : undefined,
          };
        });
        const pollSig = (p: MemberPoll) => `${p.createdAt}|${p.question}`;
        const existingPollSigs = new Set(existingPolls.map(pollSig));
        await store.set(KEYS.polls, [...existingPolls, ...newPolls.filter(p => !existingPollSigs.has(pollSig(p)))]);
      }

      const avIndex = new Map<string, string>();
      psMembers.forEach(m => {
        const lid = idMap.get(String(m.id));
        const p = String(m.avatar_media_path || '');
        if (!lid || !p) return;
        const base = (p.split('/').pop() || '').toLowerCase();
        if (base) avIndex.set(base, lid);
      });
      if (extSel.avatars && psZipFiles) {
        setRestoreProgress(t('share.progressAvatars'));
        const saved = new Map<string, string>();
        const withA = psMembers.flatMap(m => {
          const lid = idMap.get(String(m.id));
          const bytes = m.avatar_media_path ? zipEntry(psZipFiles, String(m.avatar_media_path)) : undefined;
          return lid && bytes ? [{lid, bytes}] : [];
        });
        let done = 0;
        for (const {lid, bytes} of withA) {
          const uri = await saveAvatar(lid, encodeBase64(bytes)).catch(e => { logError('import', e); return null; });
          if (uri) saved.set(lid, uri);
          done++; setRestoreProgress(t('share.progressAvatarsN', {done, total: withA.length}));
        }
        if (saved.size > 0) {
          const cur = await getStoredMembers();
          await store.set(KEYS.members, mergeMediaIntoMembers(cur, 'avatar', saved));
        }
        setRestoreProgress('');
        setPsAvatarIndex(null);
      } else {
        setPsAvatarIndex(extSel.avatars && avIndex.size > 0 ? avIndex : null);
      }

      if (extSel.avatars && !psZipFiles) {
        const urls = new Map<string, string>();
        psMembers.forEach(m => { const lid = idMap.get(String(m.id)); const u = String(m.avatar_path || ''); if (lid && /^https?:\/\//.test(u)) urls.set(lid, u); });
        await downloadAvatarsTo(urls, ctx);
      }

      setImportStatus('success'); setImportMsg(t('share.importComplete'));
      setExtPreview(null);
      setTimeout(() => onDataImported(), 800);
    } catch (e) {
      if (isImportStopped(e)) { setRestoreProgress(''); setImportStatus('success'); setImportMsg(t('share.importStopped', {count: e.completedCount ?? 0})); setExtPreview(null); setTimeout(() => onDataImported(), 800); return; }
      setRestoreProgress(''); setImportStatus('error'); setImportMsg(importErrorText(e, t));
    }
  });
};

export const handlePluralSpaceAvatarsPick = async (ctx: PluralSpaceCtx) => {
  const {psAvatarIndex, t, setRestoreProgress, setImportStatus, setImportMsg, setPsAvatarIndex, onDataImported} = ctx;
  if (!psAvatarIndex) return;
  try {
    const results = await safePick({type: ['image/*'], allowMultiSelection: true});
    if (!results || results.length === 0) return;
    setRestoreProgress(t('share.progressAvatars'));
    const saved = new Map<string, string>();
    await parallelMap(results, async res => {
      const path = getPickedFilePath(res);
      const base = String(res.name || path.split('/').pop() || '').trim().toLowerCase();
      const memberId = psAvatarIndex.get(base);
      if (!memberId) return;
      const b64 = await readFileBase64(path, res.uri);
      const fileUri = await saveAvatar(memberId, b64);
      if (fileUri) saved.set(memberId, fileUri);
    }, 4, (done, total) => setRestoreProgress(t('share.progressAvatarsN', {done, total})));
    setRestoreProgress('');
    const count = saved.size;
    if (count > 0) {
      const cur = await getStoredMembers();
      await store.set(KEYS.members, mergeMediaIntoMembers(cur, 'avatar', saved));
      setImportStatus('success'); setImportMsg(t('share.psAvatarsImported', {count}));
      setPsAvatarIndex(null);
      onDataImported();
    } else {
      setImportStatus('error'); setImportMsg(t('share.psAvatarsNoMatch'));
    }
  } catch (e) { if (!isPickerCancel(e)) { setRestoreProgress(''); setImportStatus('error'); setImportMsg(importErrorText(e, t)); } }
};
