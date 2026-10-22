import {Alert} from 'react-native';
import {log} from '../utils/log';
import {ImportUserError, importErrorText} from './importError';
import type {TFunction} from 'i18next';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {Member, HistoryEntry, JournalEntry, ExportPayload, ChatMessage, MedicalData, PlannerData, AppSettings} from '../utils';
import {store, KEYS, chatMsgKey} from '../storage';
import {importZipBundle, readZipBundle, zipTextOf} from './zipBundle';
import {migrateInlineChatMedia} from '../utils/mediaMigrations';
import {parallelMap} from '../utils/concurrency';
import {stoppedSummary} from './progress';
import {mergeHistoryEntries, getStoredList, getStoredMembers, mergeMediaIntoMembers} from './convert';
import {looksLikeOurcana, looksLikeMultiplicity, looksLikeSP, looksLikeOctocon, isNativeBackup, findOurcanaJsonEntry} from './detect';
import {RestoreCtx, runPhase, importAvatars, importBanners, mergeById, sameName, samePost, mergedWithStored} from './restoreCommon';
import {importOurcana} from './ourcana';
import {importMultiplicity} from './multiplicity';
import {importSimplyPlural} from './simplyPlural';
import {importOctocon} from './octocon';

const mediaMapOf = (media: Record<string, string> | undefined): Map<string, string> => new Map(Object.entries(media || {}));

const applyBackupMedia = async (field: 'avatar' | 'banner', media: ReadonlyMap<string, string>, ctx: RestoreCtx): Promise<void> => {
  const current = await getStoredMembers();
  const saved = field === 'avatar' ? await importAvatars(media, ctx) : await importBanners(media, ctx);
  await store.set(KEYS.members, current.map(m => {
    const uri = saved.get(m.id);
    if (uri) return {...m, [field]: uri};
    if (media.has(m.id)) return m;
    return m[field] ? {...m, [field]: undefined} : m;
  }));
};

const mergeBackupMembers = (existing: Member[], incoming: Member[]): Member[] => {
  const out = [...existing];
  const claimed = new Set<string>();
  incoming.forEach(im => {
    if (!im || !im.id) return;
    let at = out.findIndex(m => m.id === im.id);
    if (at < 0) {
      const nm = String(im.name || '').trim().toLowerCase();
      at = nm ? out.findIndex(m => !claimed.has(m.id) && !m.isCustomFront && !m.isFacet && String(m.name || '').trim().toLowerCase() === nm) : -1;
    }
    if (at >= 0) {
      const local = out[at];
      const incDeleted = !!im.deleted;
      const deleted = incDeleted && !!local.deleted;
      const archived = deleted ? true : (incDeleted ? !!local.archived : (im.archived ?? local.archived ?? false));
      out[at] = {...local, ...im, id: local.id, deleted, archived};
      claimed.add(local.id);
    }
    else { out.push(im); claimed.add(im.id); }
  });
  return out;
};

const restoreSharedPayload = async (data: Partial<ExportPayload>, ctx: RestoreCtx) => {
  const {restoreSel, importMode, setRestoreProgress, t} = ctx;
  const upd = importMode === 'update';
  if (restoreSel.journal && data.journal) {
    const journal = data.journal;
    if (!(await runPhase(ctx, t('share.progressJournal'), async () => {
      const next = upd
        ? mergeById(await store.get<JournalEntry[]>(KEYS.journal, []), journal, (a, b) => a.timestamp === b.timestamp && a.title === b.title).sort((a, b) => b.timestamp - a.timestamp)
        : journal;
      await store.set(KEYS.journal, next);
    }))) return;
  }
  if (restoreSel.frontHistory && data.frontHistory) {
    const frontHistory = data.frontHistory;
    if (!(await runPhase(ctx, t('share.progressHistory'), async () => {
      const next = upd
        ? mergeHistoryEntries(frontHistory, await getStoredList<HistoryEntry>(KEYS.history))
        : frontHistory;
      await store.set(KEYS.history, next);
    }))) return;
  }
  if (restoreSel.groups && data.groups) {
    const groups = data.groups;
    if (!(await runPhase(ctx, t('share.progressGroups'), async () => {
      await store.set(KEYS.groups, await mergedWithStored(upd, KEYS.groups, groups, sameName));
    }))) return;
  }
  if (ctx.control?.shouldStop()) return;
  if (restoreSel.chat) {
    if (data.chatChannels) await store.set(KEYS.chatChannels, await mergedWithStored(upd, KEYS.chatChannels, data.chatChannels, sameName));
    if (data.chatCategories) await store.set(KEYS.chatCategories, await mergedWithStored(upd, KEYS.chatCategories, data.chatCategories, sameName));
    if (data.chatMessages) {
      const chatMessages = data.chatMessages;
      setRestoreProgress(t('share.progressChat'));
      const channelIds = Object.keys(chatMessages).filter(id => {
        const msgs = chatMessages[id];
        return Array.isArray(msgs) && msgs.length > 0;
      });
      await parallelMap(channelIds, async chId => {
        try {
          const msgs = chatMessages[chId];
          const {messages: migrated} = await migrateInlineChatMedia(msgs);
          const nextMsgs = upd
            ? mergeById(await store.get<ChatMessage[]>(chatMsgKey(chId), []), migrated, samePost).sort((a, b) => a.timestamp - b.timestamp)
            : migrated;
          await store.set(chatMsgKey(chId), nextMsgs);
        } catch (chErr) {
          log.warn('restore', `failed channel ${chId}:`, chErr);
        }
      }, 4, (done, total) => setRestoreProgress(t('share.progressChatN', {done, total})));
    }
  }
  if (ctx.control?.shouldStop()) return;
  ctx.control?.begin(t('share.progressSettings'));
  if (restoreSel.settings || restoreSel.moods) {
    const currentSettings: Partial<AppSettings> = await store.get<AppSettings>(KEYS.settings) || {};
    let newSettings: Partial<AppSettings> = {...currentSettings};
    if (restoreSel.settings && data.settings) {
      newSettings = {...data.settings};
      if (!restoreSel.moods) newSettings.customMoods = currentSettings.customMoods || [];
    }
    if (restoreSel.moods) newSettings.customMoods = data.customMoods || data.settings?.customMoods || [];
    await store.set(KEYS.settings, newSettings);
  }
  if (restoreSel.palettes && data.palettes) await store.set(KEYS.palettes, await mergedWithStored(upd, KEYS.palettes, data.palettes, sameName));
  if (restoreSel.frontHistory && data.front !== undefined) await store.set(KEYS.front, data.front);
  if (restoreSel.customFields && data.customFieldDefs) await store.set(KEYS.customFieldDefs, await mergedWithStored(upd, KEYS.customFieldDefs, data.customFieldDefs, sameName));
  if (restoreSel.noteboards && data.noteboards) await store.set(KEYS.noteboards, await mergedWithStored(upd, KEYS.noteboards, data.noteboards, samePost));
  if (restoreSel.polls && data.polls) await store.set(KEYS.polls, await mergedWithStored(upd, KEYS.polls, data.polls));
  if (restoreSel.journalTemplates && data.journalTemplates) await store.set(KEYS.journalTemplates, await mergedWithStored(upd, KEYS.journalTemplates, data.journalTemplates, sameName));
  if (restoreSel.relationships && data.relationships) await store.set(KEYS.relationships, await mergedWithStored(upd, KEYS.relationships, data.relationships));
  if (restoreSel.relationships && data.relationshipTypes) await store.set(KEYS.relationshipTypes, await mergedWithStored(upd, KEYS.relationshipTypes, data.relationshipTypes));
  if (restoreSel.relationships && data.systemMapMembers) await store.set(KEYS.systemMapMembers, upd ? [...new Set([...(await getStoredList<string>(KEYS.systemMapMembers)), ...data.systemMapMembers])] : data.systemMapMembers);
  if (restoreSel.medical && data.medical) {
    if (upd) {
      const cur: Partial<MedicalData> = (await store.get<MedicalData>(KEYS.medical)) || {};
      const inc = data.medical;
      await store.set(KEYS.medical, {
        ...cur,
        ...inc,
        medications: mergeById(cur.medications, Array.isArray(inc.medications) ? inc.medications : []),
        appointments: mergeById(cur.appointments, Array.isArray(inc.appointments) ? inc.appointments : []),
        history: mergeById(cur.history, Array.isArray(inc.history) ? inc.history : []),
      });
    } else {
      await store.set(KEYS.medical, data.medical);
    }
  }
  if (restoreSel.planner !== false && data.planner) {
    if (upd) {
      const cur: Partial<PlannerData> = (await store.get<PlannerData>(KEYS.planner)) || {};
      const inc = data.planner;
      await store.set(KEYS.planner, {
        ...cur,
        ...inc,
        appointments: mergeById(cur.appointments, Array.isArray(inc.appointments) ? inc.appointments : []),
        reminders: mergeById(cur.reminders, Array.isArray(inc.reminders) ? inc.reminders : []),
      });
    } else {
      await store.set(KEYS.planner, data.planner);
    }
  }
  if (restoreSel.relationships && data.systemMapPositions) await store.set(KEYS.systemMapPositions, upd ? {...(await store.get<Record<string, {x: number; y: number}>>(KEYS.systemMapPositions) || {}), ...data.systemMapPositions} : data.systemMapPositions);
  if (restoreSel.whiteboard !== false && data.whiteboard) await store.set(KEYS.whiteboard, data.whiteboard);
  if (restoreSel.palettes && data.customColors) await store.set(KEYS.customColors, data.customColors);
  if (restoreSel.settings && data.shareSettings) await store.set(KEYS.share, data.shareSettings);
  ctx.control?.end();
};

const restoreBundle = async (path: string, ctx: RestoreCtx) => {
  const {restoreSel, importMode, setRestoreProgress, t} = ctx;
  const {data} = await importZipBundle(path);
  if (restoreSel.system && data.system) await store.set(KEYS.system, data.system);
  if (restoreSel.members && Array.isArray(data.members)) {
    let mem: Member[] = data.members;
    if (restoreSel.avatars) mem = mergeMediaIntoMembers(mem, 'avatar', await importAvatars(mediaMapOf(data.avatars), ctx));
    if (restoreSel.banners) mem = mergeMediaIntoMembers(mem, 'banner', await importBanners(mediaMapOf(data.banners), ctx));
    setRestoreProgress(t('share.progressSavingMembers'));
    await store.set(KEYS.members, importMode === 'update'
      ? mergeBackupMembers(await getStoredMembers(), mem)
      : mem);
  }
  await restoreSharedPayload(data, ctx);
};

const restoreNativeBackup = async (data: ExportPayload, ctx: RestoreCtx) => {
  const {restoreSel, importMode, setRestoreProgress, t} = ctx;
  const avatars = mediaMapOf(data.avatars);
  const banners = mediaMapOf(data.banners);
  if (data.members) {
    data.members = data.members.map(({avatar, ...rest}) => {
      if (avatar && !avatars.get(rest.id)) avatars.set(rest.id, avatar);
      return rest;
    });
  }
  if (restoreSel.system && data.system) await store.set(KEYS.system, data.system);
  if (restoreSel.members && data.members) {
    let membersAccum: Member[] = [...data.members];
    if (restoreSel.avatars && avatars.size > 0) membersAccum = mergeMediaIntoMembers(membersAccum, 'avatar', await importAvatars(avatars, ctx));
    if (restoreSel.banners && banners.size > 0) membersAccum = mergeMediaIntoMembers(membersAccum, 'banner', await importBanners(banners, ctx));
    setRestoreProgress(t('share.progressSavingMembers'));
    await store.set(KEYS.members, importMode === 'update'
      ? mergeBackupMembers(await getStoredMembers(), membersAccum)
      : membersAccum);
  } else if (restoreSel.avatars && !restoreSel.members) {
    if (avatars.size > 0) await applyBackupMedia('avatar', avatars, ctx);
    if (restoreSel.banners && banners.size > 0) await applyBackupMedia('banner', banners, ctx);
  } else if (restoreSel.banners && banners.size > 0) {
    await applyBackupMedia('banner', banners, ctx);
  }
  await restoreSharedPayload(data, ctx);
};

const readRestoreSource = async (path: string, t: TFunction): Promise<{rawData: unknown; zipFiles: Record<string, Uint8Array> | null}> => {
  let content = '';
  try { content = await ReactNativeBlobUtil.fs.readFile(path, 'utf8'); } catch (e) { log.debug('import', e); }
  try {
    return {rawData: JSON.parse(content), zipFiles: null};
  } catch {
    const zb = await readZipBundle(path);
    const inner = findOurcanaJsonEntry(zb.files);
    if (!inner) throw new ImportUserError(t('share.invalidJsonBackup'));
    return {rawData: JSON.parse(zipTextOf(zb.files[inner])), zipFiles: zb.files};
  }
};

const restoreFrom = async (path: string, ctx: RestoreCtx) => {
  const {rawData, zipFiles} = await readRestoreSource(path, ctx.t);
  if (looksLikeOurcana(rawData)) await importOurcana(rawData, ctx, zipFiles);
  else if (looksLikeMultiplicity(rawData)) await importMultiplicity(rawData, ctx);
  else if (looksLikeSP(rawData)) await importSimplyPlural(rawData, ctx);
  else if (looksLikeOctocon(rawData)) await importOctocon(rawData, ctx);
  else if (isNativeBackup(rawData)) await restoreNativeBackup(rawData, ctx);
  else throw new ImportUserError(ctx.t('share.unrecognizedBackup'));
};

const RESTORE_REFRESH_DELAY_MS = 800;
const RESTORE_TEMP_FILES = ['ps_restore_pending.json', 'ps_restore_pending.zip'];

const clearRestoreTemp = async () => {
  try {
    for (const f of RESTORE_TEMP_FILES) {
      const p = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${f}`;
      if (await ReactNativeBlobUtil.fs.exists(p)) await ReactNativeBlobUtil.fs.unlink(p);
    }
  } catch {}
};

export const handleRestore = (ctx: RestoreCtx) => {
  const {restorePath, restorePreview, restoreIsBundle, importMode, setRestoring, setRestoreDone, setRestoreProgress, setRestoreError, t, onDataImported} = ctx;
  if (!restorePath || !restorePreview) return;
  Alert.alert(t('share.restoreData'), t(importMode === 'update' ? 'share.importUpdateDataMsg' : 'share.restoreDataMsg'), [
    {text: t('common.cancel'), style: 'cancel'},
    {text: t('share.restore'), style: 'destructive', onPress: async () => {
      setRestoring(true);
      try {
        if (restoreIsBundle) {
          await restoreBundle(restorePath, ctx);
          if (ctx.control?.shouldStop()) setRestoreError(stoppedSummary(ctx.control, t));
        } else {
          await restoreFrom(restorePath, ctx);
        }
        setRestoreDone(true);
        setTimeout(onDataImported, RESTORE_REFRESH_DELAY_MS);
      } catch (e) {
        setRestoreError(importErrorText(e, t));
      } finally {
        setRestoring(false);
        setRestoreProgress('');
        await clearRestoreTemp();
      }
    }},
  ]);
};
