import type {TFunction} from 'i18next';
import {importNameKey} from './importNames';
import {Member, MemberGroup, HistoryEntry, CustomFieldDef, CustomFieldType, uid, findOpenFrontInHistory} from '../utils';
import {store, KEYS} from '../storage';
import {saveAvatar, saveBannerFromBase64} from '../utils/mediaUtils';
import {parallelMap} from '../utils/concurrency';
import {ImportControl} from './progress';
import {normHex, mergeHistoryEntries, getStoredList, getStoredMembers, mergeMediaIntoMembers, ImportMode} from './convert';
import {downloadFirstAvatar} from './spApi';

export type RestoreCtx = {
  restorePath: string | null;
  restorePreview: boolean;
  restoreIsBundle: boolean;
  restoreSel: Record<string, boolean>;
  importMode: ImportMode;
  setRestoring: (v: boolean) => void;
  setRestoreDone: (v: boolean) => void;
  setRestoreProgress: (label: string) => void;
  setRestoreError: (msg: string) => void;
  t: TFunction;
  onDataImported: () => void;
  history: HistoryEntry[];
  control?: ImportControl;
};

export const optString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
export const optNumber = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

export const runPhase = async (
  ctx: {control?: ImportControl; setRestoreProgress: (label: string) => void},
  label: string,
  work: () => Promise<void>,
): Promise<boolean> => {
  if (ctx.control?.shouldStop()) return false;
  if (ctx.control) ctx.control.begin(label);
  else ctx.setRestoreProgress(label);
  await work();
  ctx.control?.end();
  return true;
};

const importBase64MemberMedia = async (
  media: ReadonlyMap<string, string>,
  save: (memberId: string, raw: string) => Promise<string>,
  progressLabel: string,
  progressCountLabel: string,
  ctx: RestoreCtx,
): Promise<Map<string, string>> => {
  const {setRestoreProgress, t} = ctx;
  const entries = [...media];
  const saved = new Map<string, string>();
  if (entries.length === 0) return saved;
  setRestoreProgress(progressLabel);
  await parallelMap(entries, async ([memberId, raw]) => {
    if (raw) saved.set(memberId, await save(memberId, raw));
  }, 6, (done, total) => setRestoreProgress(t(progressCountLabel, {done, total})));
  return saved;
};

export const importAvatars = (media: ReadonlyMap<string, string>, ctx: RestoreCtx): Promise<Map<string, string>> =>
  importBase64MemberMedia(media, saveAvatar, ctx.t('share.progressAvatars'), 'share.progressAvatarsN', ctx);

export const importBanners = (media: ReadonlyMap<string, string>, ctx: RestoreCtx): Promise<Map<string, string>> =>
  importBase64MemberMedia(media, saveBannerFromBase64, ctx.t('share.progressBanners'), 'share.progressBannersN', ctx);

export const applyImportedHistory = async (newHistory: HistoryEntry[], ctx: Pick<RestoreCtx, 'history'>) => {
  const {history} = ctx;
  if (newHistory.length === 0) return;
  const mergedHistory = mergeHistoryEntries(newHistory, history);
  await store.set(KEYS.history, mergedHistory);
  const importedOpenFront = findOpenFrontInHistory(mergedHistory);
  if (importedOpenFront) await store.set(KEYS.front, importedOpenFront);
};

export const mergeById = <T extends {id?: unknown}>(existing: T[] | null | undefined, incoming: T[], sameKey?: (a: T, b: T) => boolean): T[] => {
  const out = [...(existing || [])];
  incoming.forEach(inc => {
    if (!inc) return;
    const at = out.findIndex(e => !!e && ((inc.id != null && e.id === inc.id) || (sameKey ? sameKey(e, inc) : false)));
    if (at >= 0) out[at] = {...out[at], ...inc, id: out[at].id ?? inc.id};
    else out.push(inc);
  });
  return out;
};

export const sameName = (a: {name?: string}, b: {name?: string}): boolean => importNameKey(a.name) === importNameKey(b.name);

export const samePost = (a: {timestamp: number; authorId: string; content: string}, b: {timestamp: number; authorId: string; content: string}): boolean =>
  a.timestamp === b.timestamp && a.authorId === b.authorId && a.content === b.content;

export const mergedWithStored = async <T extends {id?: unknown}>(upd: boolean, key: string, incoming: T[], sameKey?: (a: T, b: T) => boolean): Promise<T[]> =>
  upd ? mergeById(await store.get<T[]>(key, []), incoming, sameKey) : incoming;

interface SourceTag { id: string; name: string; color?: unknown; parentId?: string | null }

export const mergeSourceGroups = (existing: MemberGroup[], tags: SourceTag[], prefix: string): {groups: MemberGroup[]; idMap: Map<string, string>} => {
  const groups = [...existing];
  const idMap = new Map<string, string>();
  tags.forEach(tg => {
    const srcId = `${prefix}:${tg.id}`;
    let g = groups.find(x => x.sourceId === srcId) || groups.find(x => !x.sourceId && importNameKey(x.name) === importNameKey(tg.name));
    if (!g) { g = {id: uid(), name: tg.name, color: tg.color ? normHex(tg.color) : undefined, sourceId: srcId}; groups.push(g); }
    else { g.name = tg.name; g.sourceId = srcId; }
    idMap.set(tg.id, g.id);
  });
  tags.forEach(tg => {
    if (!tg.parentId) return;
    const childId = idMap.get(tg.id);
    const parentId = idMap.get(tg.parentId);
    if (!childId || !parentId || childId === parentId) return;
    const g = groups.find(x => x.id === childId);
    if (g) g.parentId = parentId;
  });
  return {groups, idMap};
};

export const withGroupIds = (m: Member, gids: string[]): Member => (gids.length === 0 ? m : {...m, groupIds: [...new Set([...(m.groupIds || []), ...gids])]});

interface SourceField { ids: string[]; name: string; type: CustomFieldType; order: number }

export const mergeFieldDefs = async (fields: SourceField[]): Promise<Map<string, string>> => {
  const existingDefs = await getStoredList<CustomFieldDef>(KEYS.customFieldDefs);
  const idMap = new Map<string, string>();
  const newDefs: CustomFieldDef[] = [];
  fields.forEach(f => {
    const existing = existingDefs.find(d => importNameKey(d.name) === importNameKey(f.name));
    const localId = existing?.id ?? uid();
    if (!existing) newDefs.push({id: localId, name: f.name, type: f.type, sortOrder: f.order});
    f.ids.forEach(k => idMap.set(k, localId));
  });
  if (newDefs.length > 0) await store.set(KEYS.customFieldDefs, [...existingDefs, ...newDefs]);
  return idMap;
};

export const downloadAvatarsTo = async (urls: ReadonlyMap<string, string | string[]>, ctx: Pick<RestoreCtx, 'setRestoreProgress' | 't'>) => {
  const {setRestoreProgress, t} = ctx;
  const entries = [...urls];
  if (entries.length === 0) return;
  setRestoreProgress(t('share.progressAvatarsDownload'));
  const downloaded = new Map<string, string>();
  await parallelMap(entries, async ([memberId, url]) => {
    const fileUri = await downloadFirstAvatar(memberId, Array.isArray(url) ? url : [url]);
    if (fileUri) downloaded.set(memberId, fileUri);
  }, 4, (done, total) => setRestoreProgress(t('share.progressAvatarsDownloadN', {done, total})));
  if (downloaded.size > 0) {
    await store.set(KEYS.members, mergeMediaIntoMembers(await getStoredMembers(), 'avatar', downloaded));
  }
};
