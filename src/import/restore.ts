import {Alert} from 'react-native';
import type {TFunction} from 'i18next';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {Member, MemberGroup, HistoryEntry, ExportPayload, CustomFieldDef, CustomFieldType, CustomFieldValue, AppSettings, uid, findOpenFrontInHistory} from '../utils';
import {store, KEYS, chatMsgKey} from '../storage';
import {importZipBundle} from '../export/exportUtils';
import {saveAvatar, saveBannerFromBase64, migrateInlineChatMedia} from '../utils/mediaUtils';
import {parallelMap} from '../utils/concurrency';
import {convertSPSwitches, normHex, mergeForeignMember, finalizeMemberReplace, mergeHistoryEntries, getStoredMembers, mergeMediaIntoMembers} from './convert';
import {spAvatarCandidates, downloadFirstAvatar} from './spApi';

export type RestoreCtx = {
  restorePath: string | null;
  restorePreview: boolean;
  restoreIsBundle: boolean;
  restoreSel: Record<string, boolean>;
  setRestoring: any;
  setRestoreDone: any;
  setRestoreProgress: any;
  setRestoreError: any;
  t: TFunction;
  onDataImported: () => void;
  history: HistoryEntry[];
};

export const importBase64MemberMedia = async (
    field: 'avatar' | 'banner',
    media: Record<string, string>,
    save: (memberId: string, raw: string) => Promise<string | null>,
    progressLabel: string,
    progressCountLabel: string,
    ctx: RestoreCtx,
  ) => {
  const {setRestoreProgress, t} = ctx;
    const entries = Object.entries(media);
    const saved: Record<string, string> = {};
    if (entries.length === 0) return saved;
    setRestoreProgress(progressLabel);
    await parallelMap(entries, async ([memberId, raw]) => {
      if (!raw) return;
      const b64 = raw.startsWith('data:') ? raw.split(',')[1] : raw;
      const fileUri = await save(memberId, b64).catch(() => null);
      if (fileUri) saved[memberId] = fileUri;
    }, 6, (done, total) => setRestoreProgress(t(progressCountLabel, {done, total})));
    return saved;
  };

export const applyImportedHistory = async (newHistory: HistoryEntry[], ctx: Pick<RestoreCtx, 'history'>) => {
  const {history} = ctx;
    if (newHistory.length === 0) return;
    const mergedHistory = mergeHistoryEntries(newHistory, history);
    await store.set(KEYS.history, mergedHistory);
    const importedOpenFront = findOpenFrontInHistory(mergedHistory);
    if (importedOpenFront) await store.set(KEYS.front, importedOpenFront);
  };

export const restoreSharedPayload = async (data: Partial<ExportPayload>, ctx: RestoreCtx) => {
  const {restoreSel, setRestoreProgress, t} = ctx;
    if (restoreSel.journal && data.journal) await store.set(KEYS.journal, data.journal);
    if (restoreSel.frontHistory && data.frontHistory) await store.set(KEYS.history, data.frontHistory);
    if (restoreSel.groups && data.groups) await store.set(KEYS.groups, data.groups);
    if (restoreSel.chat) {
      if (data.chatChannels) await store.set(KEYS.chatChannels, data.chatChannels);
      if (data.chatMessages) {
        setRestoreProgress(t('share.progressChat'));
        const channelIds = Object.keys(data.chatMessages).filter(id => {
          const msgs = data.chatMessages![id];
          return Array.isArray(msgs) && msgs.length > 0;
        });
        await parallelMap(channelIds, async chId => {
          try {
            const msgs = data.chatMessages![chId];
            const {messages: migrated} = await migrateInlineChatMedia(msgs);
            await store.set(chatMsgKey(chId), migrated);
          } catch (chErr) {
            console.error(`[RESTORE] failed channel ${chId}:`, chErr);
          }
        }, 4, (done, total) => setRestoreProgress(t('share.progressChatN', {done, total})));
      }
    }
    if (restoreSel.settings || restoreSel.moods) {
      const currentSettings = await store.get<AppSettings>(KEYS.settings) || {} as AppSettings;
      let newSettings = {...currentSettings};
      if (restoreSel.settings && data.settings) {
        newSettings = {...data.settings};
        if (!restoreSel.moods) newSettings.customMoods = currentSettings.customMoods || [];
      }
      if (restoreSel.moods) newSettings.customMoods = data.customMoods || data.settings?.customMoods || [];
      await store.set(KEYS.settings, newSettings);
    }
    if (restoreSel.palettes && data.palettes) await store.set(KEYS.palettes, data.palettes);
    if (restoreSel.frontHistory && data.front !== undefined) await store.set(KEYS.front, data.front);
    if (restoreSel.customFields && data.customFieldDefs) await store.set(KEYS.customFieldDefs, data.customFieldDefs);
    if (restoreSel.noteboards && data.noteboards) await store.set(KEYS.noteboards, data.noteboards);
    if (restoreSel.polls && data.polls) await store.set(KEYS.polls, data.polls);
    if (restoreSel.journalTemplates && data.journalTemplates) await store.set(KEYS.journalTemplates, data.journalTemplates);
    if (restoreSel.relationships && data.relationships) await store.set(KEYS.relationships, data.relationships);
    if (restoreSel.relationships && data.relationshipTypes) await store.set(KEYS.relationshipTypes, data.relationshipTypes);
    if (restoreSel.relationships && data.systemMapMembers) await store.set(KEYS.systemMapMembers, data.systemMapMembers);
    if (restoreSel.medical && data.medical) await store.set(KEYS.medical, data.medical);
  };

export const downloadAvatarsTo = async (urls: Record<string, string>, ctx: Pick<RestoreCtx, 'setRestoreProgress' | 't'>) => {
  const {setRestoreProgress, t} = ctx;
    const entries = Object.entries(urls);
    if (entries.length === 0) return;
    setRestoreProgress(t('share.progressAvatarsDownload'));
    const downloaded: Record<string, string> = {};
    await parallelMap(entries, async ([memberId, url]) => {
      const fileUri = await downloadFirstAvatar(memberId, [url]);
      if (fileUri) downloaded[memberId] = fileUri;
    }, 4, (done, total) => setRestoreProgress(t('share.progressAvatarsDownloadN', {done, total})));
    if (Object.keys(downloaded).length > 0) {
      await store.set(KEYS.members, mergeMediaIntoMembers(await getStoredMembers(), 'avatar', downloaded));
    }
  };

export const importOurcana = async (rawData: any, ctx: RestoreCtx) => {
  const {restoreSel} = ctx;
    const ouSys = rawData.system || {};
    const ouMembers: any[] = Array.isArray(rawData.members) ? rawData.members : [];
    const ouFronts: any[] = Array.isArray(rawData.frontHistory) ? rawData.frontHistory : [];
    const ouTags: any[] = Array.isArray(rawData.tags) ? rawData.tags : [];
    if (restoreSel.system) {
      const sys = await store.get<any>(KEYS.system, {}) || {};
      await store.set(KEYS.system, {...sys, name: ouSys.name || sys.name, description: ouSys.desc || sys.description || ''});
    }
    const idMap: Record<string, string> = {};
    if (restoreSel.members) {
      const existing = await store.get<Member[]>(KEYS.members, []) || [];
      const merged: Member[] = [...existing];
      ouMembers.forEach((m: any) => {
        const useDisplay = m.showOnlyDisplayName && m.displayName;
        mergeForeignMember(merged, idMap, String(m.id), {
          name: (useDisplay ? String(m.displayName) : String(m.name || '')).trim() || 'Unnamed member',
          pronouns: String(m.pronouns || ''), role: '', color: normHex(m.color),
          description: String(m.desc || ''), archived: !!m.archived,
        });
      });
      await store.set(KEYS.members, finalizeMemberReplace(merged, idMap));
    }
    if (restoreSel.groups && ouTags.length > 0) {
      const existingGroups = await store.get<MemberGroup[]>(KEYS.groups, []) || [];
      const mergedGroups: MemberGroup[] = [...existingGroups];
      const groupIdMap: Record<string, string> = {};
      ouTags.forEach((tg: any) => {
        const name = String(tg.label || tg.name || 'Group');
        const srcId = `ou:${String(tg.id)}`;
        let g = mergedGroups.find(x => x.sourceId === srcId) || mergedGroups.find(x => !x.sourceId && x.name.toLowerCase() === name.toLowerCase());
        if (!g) { g = {id: uid(), name, color: tg.color ? normHex(tg.color) : undefined, sourceId: srcId}; mergedGroups.push(g); }
        else { g.name = name; g.sourceId = srcId; }
        groupIdMap[String(tg.id)] = g.id;
      });
      await store.set(KEYS.groups, mergedGroups);
      const membersForGroups = await store.get<Member[]>(KEYS.members, []) || [];
      const withGroups = membersForGroups.map(lm => {
        const om = ouMembers.find((m: any) => idMap[String(m.id)] === lm.id);
        if (!om || !Array.isArray(om.tagIds)) return lm;
        const gids = om.tagIds.map((tid: any) => groupIdMap[String(tid)]).filter(Boolean) as string[];
        if (gids.length === 0) return lm;
        return {...lm, groupIds: [...new Set([...(lm.groupIds || []), ...gids])]};
      });
      await store.set(KEYS.members, withGroups);
    }
    if (restoreSel.frontHistory && ouFronts.length > 0) {
      const switches = ouFronts.map((f: any) => ({content: {members: Array.isArray(f.memberIds) ? f.memberIds : [], startTime: f.startTime, endTime: f.isLive ? null : (f.endTime ?? null)}}));
      const newH = convertSPSwitches(switches, idMap);
      await applyImportedHistory(newH, ctx);
    }
    if (restoreSel.avatars) {
      const urls: Record<string, string> = {};
      ouMembers.forEach((m: any) => { const localId = idMap[String(m.id)]; const url = String(m.avatarUrl || ''); if (localId && /^https?:\/\//.test(url)) urls[localId] = url; });
      await downloadAvatarsTo(urls, ctx);
    }
  };

export const importMultiplicity = async (rawData: any, ctx: RestoreCtx) => {
  const {restoreSel, setRestoreProgress, t} = ctx;
    const sys = rawData.system || {};
    const alters: any[] = Array.isArray(rawData.alters) ? rawData.alters : [];
    const fronts: any[] = Array.isArray(rawData.front_entries) ? rawData.front_entries : [];
    if (restoreSel.system) {
      const cur = await store.get<any>(KEYS.system, {}) || {};
      await store.set(KEYS.system, {...cur, name: sys.name || cur.name, description: sys.description || cur.description || ''});
    }
    const idMap: Record<string, string> = {};
    if (restoreSel.members) {
      const existing = await store.get<Member[]>(KEYS.members, []) || [];
      const merged: Member[] = [...existing];
      alters.forEach((a: any) => {
        mergeForeignMember(merged, idMap, 'mx:' + String(a.alter_id), {
          name: (a.name && String(a.name).trim()) || (a.display_name && String(a.display_name).trim()) || 'Unnamed member',
          pronouns: String(a.pronouns || ''), role: '', color: normHex(a.colour),
          description: String(a.description || ''), archived: !!a.is_archived,
        });
      });
      await store.set(KEYS.members, finalizeMemberReplace(merged, idMap));
    }
    if (restoreSel.frontHistory && fronts.length > 0) {
      const switches = fronts.map((f: any) => ({content: {member: String(f.alter_id), startTime: f.start_time, endTime: f.end_time ?? null, comment: f.notes || ''}}));
      const newH = convertSPSwitches(switches, idMap);
      await applyImportedHistory(newH, ctx);
    }
    if (restoreSel.avatars) {
      const b64Map: Record<string, string> = {};
      const urlMap: Record<string, string> = {};
      alters.forEach((a: any) => {
        const localId = idMap[String(a.alter_id)];
        if (!localId) return;
        if (a.avatar_data) b64Map[localId] = String(a.avatar_data);
        else if (/^https?:\/\//.test(String(a.avatar_url || ''))) urlMap[localId] = String(a.avatar_url);
      });
      const b64Entries = Object.entries(b64Map);
      if (b64Entries.length > 0) {
        setRestoreProgress(t('share.progressAvatars'));
        const map: Record<string, string> = {};
        await parallelMap(b64Entries, async ([memberId, b64]) => {
          const raw = b64.startsWith('data:') ? b64.split(',')[1] : b64;
          const fileUri = await saveAvatar(memberId, raw).catch(() => null);
          if (fileUri) map[memberId] = fileUri;
        }, 6, (done, total) => setRestoreProgress(t('share.progressAvatarsN', {done, total})));
        if (Object.keys(map).length > 0) {
          const cur = await store.get<Member[]>(KEYS.members, []) || [];
          await store.set(KEYS.members, cur.map(m => map[m.id] ? {...m, avatar: map[m.id]} : m));
        }
      }
      await downloadAvatarsTo(urlMap, ctx);
    }
  };

export const handleRestore = (ctx: RestoreCtx) => {
  const {restorePath, restorePreview, restoreIsBundle, restoreSel, setRestoring, setRestoreDone, setRestoreProgress, setRestoreError, t, onDataImported, history} = ctx;
    if (!restorePath || !restorePreview) return;
    Alert.alert(t('share.restoreData'), t('share.restoreDataMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('share.restore'), style: 'destructive', onPress: async () => {
        setRestoring(true);
        try {
          if (restoreIsBundle) {
            const {data} = await importZipBundle(restorePath);
            if (restoreSel.system && data.system) await store.set(KEYS.system, data.system);
            if (restoreSel.members && Array.isArray(data.members)) {
              let mem: any[] = data.members;
              if (restoreSel.avatars) {
                const avatarMap = await importBase64MemberMedia('avatar', data.avatars || {}, (memberId, raw) => saveAvatar(memberId, raw).catch(() => null), t('share.progressAvatars'), 'share.progressAvatarsN', ctx);
                mem = mem.map(m => avatarMap[m.id] ? {...m, avatar: avatarMap[m.id]} : m);
              }
              if (restoreSel.banners) {
                const bannerMap = await importBase64MemberMedia('banner', data.banners || {}, (memberId, raw) => saveBannerFromBase64(memberId, raw).catch(() => null), t('share.progressBanners'), 'share.progressBannersN', ctx);
                mem = mem.map(m => bannerMap[m.id] ? {...m, banner: bannerMap[m.id]} : m);
              }
              setRestoreProgress(t('share.progressSavingMembers'));
              await store.set(KEYS.members, mem);
            }
            await restoreSharedPayload(data, ctx);
            setRestoreDone(true); setTimeout(() => onDataImported(), 800);
            return;
          }
          const content = await ReactNativeBlobUtil.fs.readFile(restorePath, 'utf8');
          const rawData: any = JSON.parse(content);

          const looksLikeOurcana = (rawData.format === 'ourcana') || (!rawData._meta && Array.isArray(rawData.members) && Array.isArray(rawData.frontHistory) && rawData.members[0]?.id !== undefined);
          if (looksLikeOurcana) {
            await importOurcana(rawData, ctx);
            setRestoreDone(true); setRestoring(false); setTimeout(() => onDataImported(), 800);
            return;
          }
          const looksLikeMultiplicity = (rawData.app === 'multiplicity') || (Array.isArray(rawData.alters) && Array.isArray(rawData.front_entries) && rawData.alters[0]?.alter_id !== undefined);
          if (looksLikeMultiplicity) {
            await importMultiplicity(rawData, ctx);
            setRestoreDone(true); setRestoring(false); setTimeout(() => onDataImported(), 800);
            return;
          }

          const looksLikeSP = !rawData._meta && Array.isArray(rawData.members) && rawData.members.length > 0
            && rawData.members[0]._id !== undefined && Array.isArray(rawData.customFields);
          if (looksLikeSP) {
            console.log(`[SP-JSON] detected SP export: members=${rawData.members.length} customFields=${rawData.customFields.length}`);
            const normId = (raw: any): string => {
              if (raw == null) return '';
              if (typeof raw === 'string') return raw;
              if (typeof raw === 'number') return String(raw);
              if (typeof raw === 'object') {
                if (typeof raw.$oid === 'string') return raw.$oid;
                if (typeof raw._id === 'string') return raw._id;
                if (typeof raw.id === 'string') return raw.id;
                if (typeof raw.toString === 'function') { const s = raw.toString(); if (s && s !== '[object Object]') return s; }
              }
              return '';
            };
            const SP_TYPE_MAP: Record<string, CustomFieldType> = {'0': 'text', '1': 'color', '2': 'date', '3': 'month', '4': 'year', '5': 'monthYear', '6': 'timestamp', '7': 'monthDay', 'text': 'text', 'number': 'number', 'checkbox': 'toggle', 'toggle': 'toggle', 'date': 'date', 'markdown': 'markdown'};
            const existingMembers = await store.get<Member[]>(KEYS.members, []) || [];
            const byNameLower: Record<string, Member> = {};
            existingMembers.forEach(lm => { const n = (lm.name || '').trim().toLowerCase(); if (n) byNameLower[n] = lm; });
            const newMembers: Member[] = rawData.members.map((sp: any) => {
              const spName = String(sp.name || '').trim();
              const nameLower = spName.toLowerCase();
              const existing = byNameLower[nameLower];
              const id = existing ? existing.id : uid();
              return {
                id,
                name: spName || 'Unknown',
                pronouns: String(sp.pronouns || ''),
                role: '',
                color: normHex(sp.color),
                description: String(sp.desc || ''),
                archived: !!sp.archived,
                customFields: existing?.customFields || [],
                groupIds: existing?.groupIds || [],
                tags: existing?.tags || [],
                avatar: existing?.avatar,
              } as Member;
            });
            if (restoreSel.members) await store.set(KEYS.members, newMembers);
            const idMap: Record<string, string> = {};
            rawData.members.forEach((sp: any, i: number) => { const sid = normId(sp._id); if (sid) idMap[sid] = newMembers[i].id; });
            if (restoreSel.members && restoreSel.avatars) {
              const spAvatarUrls: Record<string, string[]> = {};
              const spFallbackUid = String(rawData.members.find((x: any) => x.uid)?.uid || rawData.uid || '');
              rawData.members.forEach((sp: any, i: number) => {
                const localId = newMembers[i].id;
                const cands = spAvatarCandidates(sp, spFallbackUid);
                if (cands.length) spAvatarUrls[localId] = cands;
              });
              const spAvatarEntries = Object.entries(spAvatarUrls);
              if (spAvatarEntries.length > 0) {
                setRestoreProgress(t('share.progressAvatarsDownload'));
                const downloaded: Record<string, string> = {};
                await parallelMap(spAvatarEntries, async ([memberId, urls]) => {
                  const fileUri = await downloadFirstAvatar(memberId, urls as string[]);
                  if (fileUri) downloaded[memberId] = fileUri;
                }, 4, (done, total) => setRestoreProgress(t('share.progressAvatarsDownloadN', {done, total})));
                if (Object.keys(downloaded).length > 0) {
                  const withAvatars = newMembers.map(m => downloaded[m.id] ? {...m, avatar: downloaded[m.id]} : m);
                  await store.set(KEYS.members, withAvatars);
                }
              }
            }
            if (restoreSel.customFields && rawData.customFields.length > 0) {
              const existingDefs = await store.get<CustomFieldDef[]>(KEYS.customFieldDefs, []) || [];
              const fieldIdMap: Record<string, string> = {};
              const newDefs: CustomFieldDef[] = [];
              rawData.customFields.forEach((cf: any, i: number) => {
                const candidates = [cf._id, cf.id, cf.uuid].map(normId).filter(Boolean);
                const spName = String(cf.name || `Field ${i + 1}`);
                const spType = cf.type;
                const existing = existingDefs.find(d => d.name.toLowerCase() === spName.toLowerCase());
                let localId: string;
                if (existing) { localId = existing.id; } else {
                  localId = uid();
                  newDefs.push({id: localId, name: spName, type: SP_TYPE_MAP[String(spType)] || 'text', sortOrder: cf.order ?? i});
                }
                candidates.forEach(k => { fieldIdMap[k] = localId; });
              });
              if (newDefs.length > 0) await store.set(KEYS.customFieldDefs, [...existingDefs, ...newDefs]);
              const membersForUpdate = await store.get<Member[]>(KEYS.members, []) || [];
              const updatedMembers = membersForUpdate.map(lm => {
                const spMember = rawData.members.find((sp: any) => idMap[normId(sp._id)] === lm.id);
                if (!spMember) return lm;
                const info = spMember.info;
                if (!info || typeof info !== 'object') return lm;
                const existingCF: CustomFieldValue[] = lm.customFields || [];
                const newCF: CustomFieldValue[] = [...existingCF];
                Object.entries(info).forEach(([spFieldId, rawValue]: [string, any]) => {
                  const localFieldId = fieldIdMap[normId(spFieldId)] || fieldIdMap[spFieldId];
                  if (!localFieldId) return;
                  let value: any = rawValue;
                  if (value && typeof value === 'object' && !Array.isArray(value)) {
                    if ('value' in value) value = value.value;
                    else if ('content' in value && typeof value.content === 'object' && 'value' in value.content) value = value.content.value;
                  }
                  if (value == null) return;
                  const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
                  if (valStr === '') return;
                  const existingIdx = newCF.findIndex(cv => cv.fieldId === localFieldId);
                  if (existingIdx >= 0) newCF[existingIdx] = {fieldId: localFieldId, value: valStr as any};
                  else newCF.push({fieldId: localFieldId, value: valStr as any});
                });
                return {...lm, customFields: newCF};
              });
              await store.set(KEYS.members, updatedMembers);
            }
            if (restoreSel.frontHistory && Array.isArray(rawData.frontHistory) && rawData.frontHistory.length > 0) {
              const sp_switches = rawData.frontHistory.map((s: any) => ({id: normId(s._id), content: s}));
              const newH = convertSPSwitches(sp_switches, idMap);
              if (newH.length > 0) {
                const merged = mergeHistoryEntries(newH, history);
                await store.set(KEYS.history, merged);
                const importedOpenFront = findOpenFrontInHistory(merged);
                if (importedOpenFront) await store.set(KEYS.front, importedOpenFront);
              }
            }
            setRestoreDone(true); setRestoring(false);
            return;
          }

          const looksLikeOctocon = !rawData._meta && rawData.user && typeof rawData.user === 'object' && Array.isArray(rawData.alters);
          if (looksLikeOctocon) {
            const ocUser = rawData.user || {};
            const alters: any[] = Array.isArray(rawData.alters) ? rawData.alters : [];
            const ocFields: any[] = Array.isArray(ocUser.fields) ? ocUser.fields : [];
            const ocTags: any[] = Array.isArray(rawData.tags) ? rawData.tags : [];
            const ocFronts: any[] = Array.isArray(rawData.fronts) ? rawData.fronts : [];
            const ocTime = (v: any): number | null => {
              if (!v) return null;
              let str = String(v);
              if (!/([zZ]|[+-]\d\d:?\d\d)$/.test(str)) str += 'Z';
              const ms = new Date(str).getTime();
              return isNaN(ms) ? null : ms;
            };
            const ocColor = (c: any): string => {
              if (!c) return '#DAA520';
              const str = String(c).trim();
              return str.startsWith('#') ? str : `#${str}`;
            };
            if (restoreSel.system) {
              const sys = await store.get<any>(KEYS.system, {}) || {};
              await store.set(KEYS.system, {...sys, name: ocUser.username || sys.name, description: ocUser.description || sys.description || ''});
            }
            const idMap: Record<string, string> = {};
            if (restoreSel.members) {
              const existing = await store.get<Member[]>(KEYS.members, []) || [];
              const merged: Member[] = [...existing];
              alters.forEach((a: any) => {
                const extId = String(a.id);
                const incoming = {
                  name: (a.name && String(a.name).trim()) || 'Unnamed member',
                  pronouns: String(a.pronouns || ''),
                  role: '',
                  color: ocColor(a.color),
                  description: String(a.description || ''),
                };
                const bySource = merged.findIndex(em => em.sourceId === extId);
                if (bySource >= 0) { merged[bySource] = {...merged[bySource], ...incoming, sourceId: extId}; idMap[extId] = merged[bySource].id; return; }
                const lower = incoming.name.toLowerCase();
                const byName = merged.findIndex(em => !em.sourceId && em.name.toLowerCase() === lower);
                if (byName >= 0) { merged[byName] = {...merged[byName], ...incoming, sourceId: extId}; idMap[extId] = merged[byName].id; return; }
                const nid = uid();
                merged.push({id: nid, sourceId: extId, tags: [], groupIds: [], customFields: [], ...incoming});
                idMap[extId] = nid;
              });
              await store.set(KEYS.members, finalizeMemberReplace(merged, idMap));
            }
            if (restoreSel.customFields && ocFields.length > 0) {
              const existingDefs = await store.get<CustomFieldDef[]>(KEYS.customFieldDefs, []) || [];
              const fieldIdMap: Record<string, string> = {};
              const newDefs: CustomFieldDef[] = [];
              ocFields.forEach((f: any, i: number) => {
                const name = String(f.name || `Field ${i + 1}`);
                const existing = existingDefs.find(d => d.name.toLowerCase() === name.toLowerCase());
                let localId: string;
                if (existing) { localId = existing.id; } else {
                  const cfType: CustomFieldType = f.type === 'number' ? 'number' : f.type === 'boolean' ? 'toggle' : 'text';
                  localId = uid();
                  newDefs.push({id: localId, name, type: cfType, sortOrder: i});
                }
                fieldIdMap[String(f.id)] = localId;
              });
              if (newDefs.length > 0) await store.set(KEYS.customFieldDefs, [...existingDefs, ...newDefs]);
              const membersForUpdate = await store.get<Member[]>(KEYS.members, []) || [];
              const updatedMembers = membersForUpdate.map(lm => {
                const alter = alters.find((a: any) => idMap[String(a.id)] === lm.id);
                if (!alter || !Array.isArray(alter.fields)) return lm;
                const cf: CustomFieldValue[] = [...(lm.customFields || [])];
                alter.fields.forEach((fv: any) => {
                  const fid = fieldIdMap[String(fv.id)];
                  if (!fid || fv.value == null) return;
                  const valStr = String(fv.value);
                  const idx = cf.findIndex(c => c.fieldId === fid);
                  if (idx >= 0) cf[idx] = {fieldId: fid, value: valStr};
                  else cf.push({fieldId: fid, value: valStr});
                });
                return {...lm, customFields: cf};
              });
              await store.set(KEYS.members, updatedMembers);
            }
            if (restoreSel.groups && ocTags.length > 0) {
              const existingGroups = await store.get<MemberGroup[]>(KEYS.groups, []) || [];
              const mergedGroups: MemberGroup[] = [...existingGroups];
              const groupIdMap: Record<string, string> = {};
              ocTags.forEach((tg: any) => {
                const name = String(tg.name || 'Group');
                const srcId = `oc:${String(tg.id)}`;
                let g = mergedGroups.find(x => x.sourceId === srcId) || mergedGroups.find(x => !x.sourceId && x.name.toLowerCase() === name.toLowerCase());
                if (!g) { g = {id: uid(), name, color: tg.color ? ocColor(tg.color) : undefined, sourceId: srcId}; mergedGroups.push(g); }
                else { g.name = name; g.sourceId = srcId; }
                groupIdMap[String(tg.id)] = g.id;
              });
              await store.set(KEYS.groups, mergedGroups);
              const membersForGroups = await store.get<Member[]>(KEYS.members, []) || [];
              const withGroups = membersForGroups.map(lm => {
                const gids = ocTags.filter((tg: any) => Array.isArray(tg.alters) && tg.alters.some((aid: any) => idMap[String(aid)] === lm.id)).map((tg: any) => groupIdMap[String(tg.id)]).filter(Boolean) as string[];
                if (gids.length === 0) return lm;
                return {...lm, groupIds: [...new Set([...(lm.groupIds || []), ...gids])]};
              });
              await store.set(KEYS.members, withGroups);
            }
            if (restoreSel.frontHistory && ocFronts.length > 0) {
              const ocSwitches = ocFronts.map((f: any) => ({content: {member: String(f.alter_id), startTime: ocTime(f.time_start), endTime: ocTime(f.time_end), comment: f.comment || ''}}));
              const newH = convertSPSwitches(ocSwitches, idMap);
              if (newH.length > 0) {
                const merged = mergeHistoryEntries(newH, history);
                await store.set(KEYS.history, merged);
                const importedOpenFront = findOpenFrontInHistory(merged);
                if (importedOpenFront) await store.set(KEYS.front, importedOpenFront);
              }
            }
            if (restoreSel.avatars) {
              const ocAvatarUrls: Record<string, string> = {};
              alters.forEach((a: any) => {
                const localId = idMap[String(a.id)];
                const url = String(a.avatar_url || '');
                if (localId && (url.startsWith('http://') || url.startsWith('https://'))) ocAvatarUrls[localId] = url;
              });
              const entries = Object.entries(ocAvatarUrls);
              if (entries.length > 0) {
                setRestoreProgress(t('share.progressAvatarsDownload'));
                const downloaded: Record<string, string> = {};
                await parallelMap(entries, async ([memberId, url]) => {
                  const fileUri = await downloadFirstAvatar(memberId, [url]);
                  if (fileUri) downloaded[memberId] = fileUri;
                }, 4, (done, total) => setRestoreProgress(t('share.progressAvatarsDownloadN', {done, total})));
                if (Object.keys(downloaded).length > 0) {
                  const cur = await store.get<Member[]>(KEYS.members, []) || [];
                  const withAv = cur.map(m => downloaded[m.id] ? {...m, avatar: downloaded[m.id]} : m);
                  await store.set(KEYS.members, withAv);
                }
              }
            }
            setRestoreDone(true); setRestoring(false);
            return;
          }
          const data: ExportPayload = rawData;
          if (!data.avatars) data.avatars = {};
          if (data.members) {
            data.members = data.members.map((m: any) => {
              if (m.avatar && !data.avatars![m.id]) data.avatars![m.id] = m.avatar;
              const {avatar, ...rest} = m; return rest;
            });
          }
          if (restoreSel.system && data.system) await store.set(KEYS.system, data.system);
          if (restoreSel.members && data.members) {
            let membersAccum: any[] = [...data.members];
            const wantAvatars = restoreSel.avatars && data.avatars && Object.keys(data.avatars).length > 0;
            const wantBanners = restoreSel.banners && data.banners && Object.keys(data.banners).length > 0;
            if (wantAvatars) {
              const avatarMap = await importBase64MemberMedia('avatar', data.avatars!, (memberId, raw) => saveAvatar(memberId, raw).catch(() => null), t('share.progressAvatars'), 'share.progressAvatarsN', ctx);
              membersAccum = mergeMediaIntoMembers(membersAccum, 'avatar', avatarMap);
              data.avatars = {};
            }
            if (wantBanners) {
              const bannerMap = await importBase64MemberMedia('banner', data.banners!, (memberId, raw) => saveBannerFromBase64(memberId, raw).catch(() => null), t('share.progressBanners'), 'share.progressBannersN', ctx);
              membersAccum = mergeMediaIntoMembers(membersAccum, 'banner', bannerMap);
              data.banners = {};
            }
            setRestoreProgress(t('share.progressSavingMembers'));
            await store.set(KEYS.members, membersAccum);
          } else if (restoreSel.avatars && !restoreSel.members) {
            if (data.avatars && Object.keys(data.avatars).length > 0) {
              const existing = await getStoredMembers();
              const entries = Object.entries(data.avatars);
              const avatarMap = await importBase64MemberMedia('avatar', data.avatars, (memberId, raw) => saveAvatar(memberId, raw).catch(() => null), t('share.progressAvatars'), 'share.progressAvatarsN', ctx);
              const backupHasAvatar = new Set(entries.map(([id]) => id));
              const updated = existing.map(m => {
                if (avatarMap[m.id]) return {...m, avatar: avatarMap[m.id]};
                if (backupHasAvatar.has(m.id)) return m;
                return m.avatar ? {...m, avatar: undefined} : m;
              });
              await store.set(KEYS.members, updated);
              data.avatars = {};
            }
            if (restoreSel.banners && data.banners && Object.keys(data.banners).length > 0) {
              const current = await getStoredMembers();
              const entries = Object.entries(data.banners);
              const bannerMap = await importBase64MemberMedia('banner', data.banners, (memberId, raw) => saveBannerFromBase64(memberId, raw).catch(() => null), t('share.progressBanners'), 'share.progressBannersN', ctx);
              const backupHasBanner = new Set(entries.map(([id]) => id));
              const updated = current.map(m => {
                if (bannerMap[m.id]) return {...m, banner: bannerMap[m.id]};
                if (backupHasBanner.has(m.id)) return m;
                return m.banner ? {...m, banner: undefined} : m;
              });
              await store.set(KEYS.members, updated);
              data.banners = {};
            }
          } else if (restoreSel.banners && data.banners && Object.keys(data.banners).length > 0) {
            const current = await getStoredMembers();
            const entries = Object.entries(data.banners);
            const bannerMap = await importBase64MemberMedia('banner', data.banners, (memberId, raw) => saveBannerFromBase64(memberId, raw).catch(() => null), t('share.progressBanners'), 'share.progressBannersN', ctx);
            const backupHasBanner2 = new Set(entries.map(([id]) => id));
            const updated = current.map(m => {
              if (bannerMap[m.id]) return {...m, banner: bannerMap[m.id]};
              if (backupHasBanner2.has(m.id)) return m;
              return m.banner ? {...m, banner: undefined} : m;
            });
            await store.set(KEYS.members, updated);
            data.banners = {};
          }
          await restoreSharedPayload(data, ctx);
          setRestoreDone(true); setTimeout(() => onDataImported(), 800);
        } catch (e: any) {
          setRestoreError(e.message || t('share.restoreFailedGeneric'));
        } finally {
          setRestoring(false);
          setRestoreProgress('');
          try {
            for (const f of ['ps_restore_pending.json', 'ps_restore_pending.zip']) {
              const p = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${f}`;
              const exists = await ReactNativeBlobUtil.fs.exists(p);
              if (exists) await ReactNativeBlobUtil.fs.unlink(p);
            }
          } catch {}
        }
      }},
    ]);
  };
