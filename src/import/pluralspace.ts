import {Alert} from 'react-native';
import type {TFunction} from 'i18next';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {Member, MemberGroup, SystemInfo, HistoryEntry, JournalEntry, ChatChannel, ChatMessage, MemberPoll, CustomFieldDef, CustomFieldType, CustomFieldValue, uid} from '../utils';
import {store, KEYS, chatMsgKey} from '../storage';
import {readZipBundle, base64FromU8} from '../export/exportUtils';
import {saveAvatar} from '../utils/mediaUtils';
import {parallelMap} from '../utils/concurrency';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import {mergeForeignMember, normHex, psTime, finalizeMemberReplace, convertPluralSpaceFronts} from './convert';
import {applyImportedHistory, downloadAvatarsTo} from './restore';

export type PluralSpaceCtx = {
  extPreview: any;
  extSel: Record<string, boolean>;
  system: SystemInfo;
  history: HistoryEntry[];
  psZipFiles: Record<string, Uint8Array> | null;
  psAvatarIndex: Record<string, string> | null;
  t: TFunction;
  setRestoreError: any;
  setExtPreview: any;
  setImportStatus: any;
  setImportMsg: any;
  setPsAvatarIndex: any;
  setPsZipFiles: any;
  setRestoreProgress: any;
  onDataImported: () => void;
};

export const handlePluralSpacePick = async (ctx: PluralSpaceCtx) => {
  const {setRestoreError, setExtPreview, setImportStatus, setImportMsg, setPsAvatarIndex, setPsZipFiles, t} = ctx;
    setRestoreError(''); setExtPreview(null); setImportStatus('idle'); setImportMsg(''); setPsAvatarIndex(null); setPsZipFiles(null);
    try {
      const [res] = await safePick({type: ['application/json', 'application/zip', 'text/plain']});
      if (!res) return;
      const path = getPickedFilePath(res);
      const isZip = /\.zip$/i.test(res.name || '') || /\.zip$/i.test(path);
      let parsed: any;
      if (isZip) {
        let bundle: {files: Record<string, Uint8Array>; data: any | null} | null = null;
        try { bundle = await readZipBundle(path); }
        catch { bundle = await readZipBundle(res.uri || path); }
        parsed = bundle?.data;
        if (!parsed) throw new Error(t('share.psNotExport'));
        setPsZipFiles(bundle!.files);
      } else {
        let raw: string;
        try { raw = await ReactNativeBlobUtil.fs.readFile(path, 'utf8'); }
        catch { raw = await ReactNativeBlobUtil.fs.readFile(res.uri || path, 'utf8'); }
        try { parsed = JSON.parse(raw); } catch { throw new Error(t('share.psNotExport')); }
      }
      const ok = !parsed._meta && parsed.system && typeof parsed.system === 'object' && Array.isArray(parsed.members) && Array.isArray(parsed.fronts);
      if (!ok) throw new Error(t('share.psNotExport'));
      setExtPreview({
        system: parsed.system,
        members: parsed.members,
        switches: parsed.fronts,
        customFields: Array.isArray(parsed.custom_fields) ? parsed.custom_fields : [],
        groups: Array.isArray(parsed.member_groups) ? parsed.member_groups : [],
        journal: Array.isArray(parsed.journal_entries) ? parsed.journal_entries : [],
        chat: Array.isArray(parsed.chat_channels) ? parsed.chat_channels : [],
        polls: Array.isArray(parsed.polls) ? parsed.polls : [],
      });
    } catch (e: any) { if (!isPickerCancel(e)) Alert.alert(t('share.importFailed'), e.message || t('share.couldNotReadFile')); }
  };

export const handlePluralSpaceConfirm = (ctx: PluralSpaceCtx) => {
  const {extPreview, extSel, system, psZipFiles, t, setRestoreProgress, setPsAvatarIndex, setImportStatus, setImportMsg, setExtPreview, onDataImported} = ctx;
    if (!extPreview) return;
    Alert.alert(t('share.importData'), t('share.importAddDataMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('share.importBtn'), onPress: async () => {
        try {
          const psMembers: any[] = extPreview.members || [];
          const psFronts: any[] = extPreview.switches || [];
          const psFieldDefs: any[] = extPreview.customFields || [];
          const psGroups: any[] = extPreview.groups || [];
          const psJournal: any[] = extPreview.journal || [];
          const psChat: any[] = extPreview.chat || [];
          const psPolls: any[] = extPreview.polls || [];

          if (extSel.system && extPreview.system?.name) {
            await store.set(KEYS.system, {...system, name: String(extPreview.system.name) || system.name, description: String(extPreview.system.description || '') || system.description});
          }

          const idMap: Record<string, string> = {};
          if (extSel.members) {
            const existing = await store.get<Member[]>(KEYS.members, []) || [];
            const merged: Member[] = [...existing];
            psMembers.forEach((m: any) => {
              mergeForeignMember(merged, idMap, 'ps:' + String(m.id), {
                name: (m.name && String(m.name).trim()) || (m.display_name && String(m.display_name).trim()) || 'Unnamed member',
                pronouns: String(m.pronouns || ''),
                role: Array.isArray(m.role) ? m.role.join(', ') : String(m.role || ''),
                color: normHex(m.color),
                description: String(m.description || ''),
                archived: !!m.is_archived,
                isCustomFront: !!m.is_custom_front,
                createdAt: psTime(m.created_at) || undefined,
              });
            });
            await store.set(KEYS.members, finalizeMemberReplace(merged, idMap));
          } else {
            const existing = await store.get<Member[]>(KEYS.members, []) || [];
            psMembers.forEach((m: any) => { const ex = existing.find(em => em.sourceId === 'ps:' + String(m.id)); if (ex) idMap[String(m.id)] = ex.id; });
          }

          const nameToLocal: Record<string, string> = {};
          psMembers.forEach((m: any) => {
            const lid = idMap[String(m.id)];
            if (!lid) return;
            const n = String(m.name || '').trim().toLowerCase();
            if (n) nameToLocal[n] = lid;
            const dn = String(m.display_name || '').trim().toLowerCase();
            if (dn && !nameToLocal[dn]) nameToLocal[dn] = lid;
          });
          const allLocalMembers = await store.get<Member[]>(KEYS.members, []) || [];
          allLocalMembers.forEach(m => { const k = (m.name || '').trim().toLowerCase(); if (k && !nameToLocal[k]) nameToLocal[k] = m.id; });

          if (extSel.customFields) {
            const existingDefs = await store.get<CustomFieldDef[]>(KEYS.customFieldDefs, []) || [];
            const newDefs: CustomFieldDef[] = [];
            const fieldIdByName: Record<string, string> = {};
            const PS_TYPE_MAP: Record<string, CustomFieldType> = {text: 'text', number: 'number', boolean: 'toggle', toggle: 'toggle', date: 'date', color: 'color', markdown: 'markdown'};
            psFieldDefs.forEach((f: any, i: number) => {
              const name = String(f.name || `Field ${i + 1}`).trim();
              const key = name.toLowerCase();
              if (fieldIdByName[key]) return;
              const existing = existingDefs.find(d => d.name.toLowerCase() === key);
              if (existing) { fieldIdByName[key] = existing.id; return; }
              const localId = uid();
              newDefs.push({id: localId, name, type: PS_TYPE_MAP[String(f.field_type)] || 'text', sortOrder: i});
              fieldIdByName[key] = localId;
            });
            psMembers.forEach((m: any) => (Array.isArray(m.custom_field_values) ? m.custom_field_values : []).forEach((cv: any) => {
              const name = String(cv.field_name || '').trim();
              if (!name) return;
              const key = name.toLowerCase();
              if (fieldIdByName[key]) return;
              const existing = existingDefs.find(d => d.name.toLowerCase() === key);
              if (existing) { fieldIdByName[key] = existing.id; return; }
              const localId = uid();
              newDefs.push({id: localId, name, type: 'text', sortOrder: psFieldDefs.length + newDefs.length});
              fieldIdByName[key] = localId;
            }));
            if (newDefs.length > 0) await store.set(KEYS.customFieldDefs, [...existingDefs, ...newDefs]);
            const cur = await store.get<Member[]>(KEYS.members, []) || [];
            const updated = cur.map(lm => {
              const ps = psMembers.find((m: any) => idMap[String(m.id)] === lm.id);
              if (!ps || !Array.isArray(ps.custom_field_values) || ps.custom_field_values.length === 0) return lm;
              const grouped: Record<string, string[]> = {};
              ps.custom_field_values.forEach((cv: any) => {
                const key = String(cv.field_name || '').trim().toLowerCase();
                if (!key || cv.value == null) return;
                (grouped[key] = grouped[key] || []).push(String(cv.value));
              });
              const cf: CustomFieldValue[] = [...(lm.customFields || [])];
              Object.entries(grouped).forEach(([key, vals]) => {
                const fid = fieldIdByName[key];
                if (!fid) return;
                const valStr = vals.join('\n');
                const idx = cf.findIndex(c => c.fieldId === fid);
                if (idx >= 0) cf[idx] = {fieldId: fid, value: valStr};
                else cf.push({fieldId: fid, value: valStr});
              });
              return {...lm, customFields: cf};
            });
            await store.set(KEYS.members, updated);
          }

          if (extSel.groups && psGroups.length > 0) {
            const existingGroups = await store.get<MemberGroup[]>(KEYS.groups, []) || [];
            const mergedGroups: MemberGroup[] = [...existingGroups];
            const groupIdMap: Record<string, string> = {};
            psGroups.forEach((g: any) => {
              const name = String(g?.name || 'Group');
              const srcId = g?.id != null ? `sp:${String(g.id)}` : null;
              let lg = (srcId ? mergedGroups.find(x => x.sourceId === srcId) : undefined) || mergedGroups.find(x => !x.sourceId && x.name.toLowerCase() === name.toLowerCase());
              if (!lg) { lg = {id: uid(), name, color: g?.color ? normHex(g.color) : undefined, sourceId: srcId || undefined}; mergedGroups.push(lg); }
              else if (srcId) { lg.name = name; lg.sourceId = srcId; }
              groupIdMap[String(g?.id)] = lg.id;
              groupIdMap[name.toLowerCase()] = lg.id;
            });
            await store.set(KEYS.groups, mergedGroups);
            const cur = await store.get<Member[]>(KEYS.members, []) || [];
            const withGroups = cur.map(lm => {
              const ps = psMembers.find((m: any) => idMap[String(m.id)] === lm.id);
              if (!ps || !Array.isArray(ps.groups) || ps.groups.length === 0) return lm;
              const gids = ps.groups.map((g: any) => {
                const k = typeof g === 'object' && g !== null ? String(g.id ?? g.name ?? '') : String(g);
                return groupIdMap[k] || groupIdMap[k.toLowerCase()];
              }).filter(Boolean) as string[];
              if (gids.length === 0) return lm;
              return {...lm, groupIds: [...new Set([...(lm.groupIds || []), ...gids])]};
            });
            await store.set(KEYS.members, withGroups);
          }

          if (extSel.frontHistory && psFronts.length > 0) {
            const newH = convertPluralSpaceFronts(psFronts, idMap);
            await applyImportedHistory(newH, ctx);
          }

          if (extSel.journal && psJournal.length > 0) {
            const existingJ = await store.get<JournalEntry[]>(KEYS.journal, []) || [];
            const newJ: JournalEntry[] = psJournal.map((j: any) => ({
              id: uid(),
              title: String(j.title || '').trim(),
              body: String(j.content || ''),
              authorIds: (Array.isArray(j.members) ? j.members : []).map((m: any) => idMap[String(m?.id)] || nameToLocal[String(m?.name || '').trim().toLowerCase()]).filter(Boolean) as string[],
              hashtags: [],
              timestamp: psTime(j.date) || psTime(j.created_at) || Date.now(),
            }));
            const jSig = (j: JournalEntry) => `${j.timestamp}|${j.title}`;
            const existingJSigs = new Set(existingJ.map(jSig));
            const mergedJ = [...newJ.filter(j => !existingJSigs.has(jSig(j))), ...existingJ].sort((a, b) => b.timestamp - a.timestamp);
            await store.set(KEYS.journal, mergedJ);
          }

          if (extSel.chat && psChat.length > 0) {
            const existingCh = await store.get<ChatChannel[]>(KEYS.chatChannels, []) || [];
            const mergedCh: ChatChannel[] = [...existingCh];
            for (const ch of psChat) {
              const chName = String(ch?.name || '').trim() || 'Imported';
              let local = mergedCh.find(c => c.name.toLowerCase() === chName.toLowerCase());
              if (!local) { local = {id: uid(), name: chName, createdAt: psTime(ch?.created_at) || Date.now()}; mergedCh.push(local); }
              const msgs: any[] = Array.isArray(ch?.messages) ? ch.messages : [];
              if (msgs.length > 0) {
                const existingMsgs = await store.get<ChatMessage[]>(chatMsgKey(local.id), []) || [];
                const newMsgs: ChatMessage[] = msgs.map((msg: any) => ({
                  id: uid(),
                  channelId: local!.id,
                  authorId: nameToLocal[String(msg?.member_name || '').trim().toLowerCase()] || '',
                  type: 'text' as const,
                  content: String(msg?.content || ''),
                  timestamp: psTime(msg?.created_at) || Date.now(),
                }));
                const msgSig = (x: ChatMessage) => `${x.timestamp}|${x.authorId}|${x.content}`;
                const existingMsgSigs = new Set(existingMsgs.map(msgSig));
                const mergedMsgs = [...existingMsgs, ...newMsgs.filter(x => !existingMsgSigs.has(msgSig(x)))].sort((a, b) => a.timestamp - b.timestamp);
                await store.set(chatMsgKey(local.id), mergedMsgs);
              }
            }
            await store.set(KEYS.chatChannels, mergedCh);
          }

          if (extSel.polls && psPolls.length > 0) {
            const existingPolls = await store.get<MemberPoll[]>(KEYS.polls, []) || [];
            const newPolls: MemberPoll[] = psPolls.map((p: any) => {
              const creator = idMap[String(p?.created_by_member?.id)] || nameToLocal[String(p?.created_by_member?.name || '').trim().toLowerCase()] || '';
              const desc = String(p?.description || '').trim();
              return {
                id: uid(),
                targetMemberId: creator,
                question: [String(p?.title || '').trim(), desc].filter(Boolean).join(' — ') || '?',
                options: (Array.isArray(p?.options) ? p.options : []).map((o: any) => ({
                  id: uid(),
                  label: String(o?.text || ''),
                  votes: [...new Set((Array.isArray(o?.votes) ? o.votes : []).map((v: any) => nameToLocal[String(v?.member_name || '').trim().toLowerCase()]).filter(Boolean))] as string[],
                })),
                createdBy: creator,
                createdAt: psTime(p?.created_at) || Date.now(),
                closedAt: p?.status && p.status !== 'open' ? (psTime(p?.closes_at) || Date.now()) : undefined,
              };
            });
            const pollSig = (p: MemberPoll) => `${p.createdAt}|${p.question}`;
            const existingPollSigs = new Set(existingPolls.map(pollSig));
            await store.set(KEYS.polls, [...existingPolls, ...newPolls.filter(p => !existingPollSigs.has(pollSig(p)))]);
          }

          const avIndex: Record<string, string> = {};
          psMembers.forEach((m: any) => {
            const lid = idMap[String(m.id)];
            const p = String(m.avatar_media_path || '');
            if (!lid || !p) return;
            const base = (p.split('/').pop() || '').toLowerCase();
            if (base) avIndex[base] = lid;
          });
          if (extSel.avatars && psZipFiles) {
            setRestoreProgress(t('share.progressAvatars'));
            const saved: Record<string, string> = {};
            const withA = psMembers.filter((m: any) => idMap[String(m.id)] && m.avatar_media_path && psZipFiles[String(m.avatar_media_path)]);
            let done = 0;
            for (const m of withA) {
              const lid = idMap[String(m.id)];
              const uri = await saveAvatar(lid, base64FromU8(psZipFiles[String(m.avatar_media_path)])).catch(() => null);
              if (uri) saved[lid] = uri;
              done++; setRestoreProgress(t('share.progressAvatarsN', {done, total: withA.length}));
            }
            if (Object.keys(saved).length > 0) {
              const cur = await store.get<Member[]>(KEYS.members, []) || [];
              await store.set(KEYS.members, cur.map(m => saved[m.id] ? {...m, avatar: saved[m.id]} : m));
            }
            setRestoreProgress('');
            setPsAvatarIndex(null);
          } else {
            setPsAvatarIndex(extSel.avatars && Object.keys(avIndex).length > 0 ? avIndex : null);
          }

          if (extSel.avatars && !psZipFiles) {
            const urls: Record<string, string> = {};
            psMembers.forEach((m: any) => { const lid = idMap[String(m.id)]; const u = String(m.avatar_path || ''); if (lid && /^https?:\/\//.test(u)) urls[lid] = u; });
            await downloadAvatarsTo(urls, ctx);
          }

          setImportStatus('success'); setImportMsg(t('share.importComplete'));
          setExtPreview(null);
          setTimeout(() => onDataImported(), 800);
        } catch (e: any) { setImportStatus('error'); setImportMsg(e.message || t('share.importFailedGeneric')); }
      }},
    ]);
  };

export const handlePluralSpaceAvatarsPick = async (ctx: PluralSpaceCtx) => {
  const {psAvatarIndex, t, setRestoreProgress, setImportStatus, setImportMsg, setPsAvatarIndex, onDataImported} = ctx;
    if (!psAvatarIndex) return;
    try {
      const results = await safePick({type: ['image/*'], allowMultiSelection: true});
      if (!results || results.length === 0) return;
      setRestoreProgress(t('share.progressAvatars'));
      const saved: Record<string, string> = {};
      await parallelMap(results, async (res: any) => {
        const path = getPickedFilePath(res);
        const base = String(res.name || path.split('/').pop() || '').trim().toLowerCase();
        const memberId = psAvatarIndex[base];
        if (!memberId) return;
        let b64: string;
        try { b64 = await ReactNativeBlobUtil.fs.readFile(path, 'base64'); }
        catch { b64 = await ReactNativeBlobUtil.fs.readFile(res.uri || path, 'base64'); }
        const fileUri = await saveAvatar(memberId, b64).catch(() => null);
        if (fileUri) saved[memberId] = fileUri;
      }, 4, (done, total) => setRestoreProgress(t('share.progressAvatarsN', {done, total})));
      setRestoreProgress('');
      const count = Object.keys(saved).length;
      if (count > 0) {
        const cur = await store.get<Member[]>(KEYS.members, []) || [];
        await store.set(KEYS.members, cur.map(m => saved[m.id] ? {...m, avatar: saved[m.id]} : m));
        setImportStatus('success'); setImportMsg(t('share.psAvatarsImported', {count}));
        setPsAvatarIndex(null);
        onDataImported();
      } else {
        setImportStatus('error'); setImportMsg(t('share.psAvatarsNoMatch'));
      }
    } catch (e: any) { if (!isPickerCancel(e)) { setRestoreProgress(''); setImportStatus('error'); setImportMsg(e.message || t('share.couldNotImportAvatars')); } }
  };
