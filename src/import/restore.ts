import {Alert} from 'react-native';
import type {TFunction} from 'i18next';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {Member, MemberGroup, HistoryEntry, JournalEntry, ExportPayload, CustomFieldDef, CustomFieldType, CustomFieldValue, AppSettings, uid, findOpenFrontInHistory} from '../utils';
import {store, KEYS, chatMsgKey} from '../storage';
import {importZipBundle, readZipBundle, zipTextOf, base64FromU8} from '../export/exportUtils';
import {saveAvatar, saveBannerFromBase64, migrateInlineChatMedia} from '../utils/mediaUtils';
import {parallelMap} from '../utils/concurrency';
import {ImportControl, stoppedSummary} from './progress';
import {convertSPSwitches, normHex, mergeForeignMember, finalizeMemberReplace, mergeHistoryEntries, getStoredMembers, mergeMediaIntoMembers, ImportMode} from './convert';
import {spAvatarCandidates, downloadFirstAvatar} from './spApi';

export type RestoreCtx = {
  restorePath: string | null;
  restorePreview: boolean;
  restoreIsBundle: boolean;
  restoreSel: Record<string, boolean>;
  importMode: ImportMode;
  setRestoring: any;
  setRestoreDone: any;
  setRestoreProgress: any;
  setRestoreError: any;
  t: TFunction;
  onDataImported: () => void;
  history: HistoryEntry[];
  /** Drives the wait screen and carries the user's stop request. Optional so
   *  older call sites keep compiling; when absent nothing reports progress. */
  control?: ImportControl;
};

/**
 * Phase helper. Announces the phase, runs it, marks it done — and returns false
 * if the user asked to stop, which the caller uses to bail out BETWEEN phases.
 * Never mid-write: a half-written members list is worse than a partial import.
 */
export const runPhase = async (
  ctx: {control?: ImportControl; setRestoreProgress: any},
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

/** Update-mode list merge: incoming rows refresh matches (by id, then by the
 *  optional key) and append; nothing local is removed. */
const mergeById = <T extends {id?: any}>(existing: T[] | null | undefined, incoming: T[], sameKey?: (a: T, b: T) => boolean): T[] => {
  const out = [...(existing || [])];
  incoming.forEach(inc => {
    if (!inc) return;
    const at = out.findIndex(e => !!e && ((inc.id != null && e.id === inc.id) || (sameKey ? sameKey(e, inc) : false)));
    if (at >= 0) out[at] = {...out[at], ...inc, id: out[at].id ?? inc.id};
    else out.push(inc);
  });
  return out;
};

/** Update-mode roster merge for our OWN backups: match by id (same account
 *  lineage), then by claimable name; locals the backup doesn't carry stay
 *  untouched. Restoring a member over their tombstone revives them. */
export const mergeBackupMembers = (existing: Member[], incoming: Member[]): Member[] => {
  const out = [...existing];
  const claimed = new Set<string>();
  incoming.forEach(im => {
    if (!im || !im.id) return;
    let at = out.findIndex(m => m.id === im.id);
    if (at < 0) {
      const nm = String(im.name || '').trim().toLowerCase();
      at = nm ? out.findIndex(m => !claimed.has(m.id) && !m.isCustomFront && !m.isFacet && String(m.name || '').trim().toLowerCase() === nm) : -1;
    }
    if (at >= 0) { out[at] = {...out[at], ...im, id: out[at].id, deleted: im.deleted ?? false}; claimed.add(out[at].id); }
    else { out.push(im); claimed.add(im.id); }
  });
  return out;
};

export const restoreSharedPayload = async (data: Partial<ExportPayload>, ctx: RestoreCtx) => {
  const {restoreSel, importMode, setRestoreProgress, t} = ctx;
    const upd = importMode === 'update';
    // Each of these is a phase boundary: the wait screen advances here, and a
    // stop request is honoured here rather than mid-write.
    if (restoreSel.journal && data.journal) {
      if (!(await runPhase(ctx, t('share.progressJournal', {defaultValue: 'Restoring journal…'}), async () => {
        const next = upd
          ? mergeById(await store.get<JournalEntry[]>(KEYS.journal, []), data.journal!, (a, b) => a.timestamp === b.timestamp && a.title === b.title).sort((a, b) => b.timestamp - a.timestamp)
          : data.journal;
        await store.set(KEYS.journal, next);
      }))) return;
    }
    if (restoreSel.frontHistory && data.frontHistory) {
      if (!(await runPhase(ctx, t('share.progressHistory', {defaultValue: 'Restoring front history…'}), async () => {
        const next = upd
          ? mergeHistoryEntries(data.frontHistory!, await store.get<HistoryEntry[]>(KEYS.history, []) || [])
          : data.frontHistory;
        await store.set(KEYS.history, next);
      }))) return;
    }
    if (restoreSel.groups && data.groups) {
      if (!(await runPhase(ctx, t('share.progressGroups', {defaultValue: 'Restoring groups…'}), async () => {
        const next = upd
          ? mergeById(await store.get<MemberGroup[]>(KEYS.groups, []), data.groups!, (a, b) => String(a.name || '').toLowerCase() === String(b.name || '').toLowerCase())
          : data.groups;
        await store.set(KEYS.groups, next);
      }))) return;
    }
    if (ctx.control?.shouldStop()) return;
    if (restoreSel.chat) {
      if (data.chatChannels) {
        const nextCh = upd
          ? mergeById(await store.get<any[]>(KEYS.chatChannels, []), data.chatChannels as any[], (a, b) => String(a.name || '').toLowerCase() === String(b.name || '').toLowerCase())
          : data.chatChannels;
        await store.set(KEYS.chatChannels, nextCh);
      }
      if (data.chatCategories) {
        const nextCat = upd
          ? mergeById(await store.get<any[]>(KEYS.chatCategories, []), data.chatCategories as any[], (a, b) => String(a.name || '').toLowerCase() === String(b.name || '').toLowerCase())
          : data.chatCategories;
        await store.set(KEYS.chatCategories, nextCat);
      }
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
            const nextMsgs = upd
              ? mergeById(await store.get<any[]>(chatMsgKey(chId), []), migrated as any[], (a, b) => a.timestamp === b.timestamp && a.authorId === b.authorId && a.content === b.content).sort((a: any, b: any) => a.timestamp - b.timestamp)
              : migrated;
            await store.set(chatMsgKey(chId), nextMsgs);
          } catch (chErr) {
            console.error(`[RESTORE] failed channel ${chId}:`, chErr);
          }
        }, 4, (done, total) => setRestoreProgress(t('share.progressChatN', {done, total})));
      }
    }
    if (ctx.control?.shouldStop()) return;
    if (ctx.control) ctx.control.begin(t('share.progressSettings', {defaultValue: 'Restoring settings…'}));
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
    if (restoreSel.palettes && data.palettes) await store.set(KEYS.palettes, upd ? mergeById(await store.get<any[]>(KEYS.palettes, []), data.palettes as any[], (a, b) => String(a.name || '').toLowerCase() === String(b.name || '').toLowerCase()) : data.palettes);
    if (restoreSel.frontHistory && data.front !== undefined) await store.set(KEYS.front, data.front);
    if (restoreSel.customFields && data.customFieldDefs) await store.set(KEYS.customFieldDefs, upd ? mergeById(await store.get<any[]>(KEYS.customFieldDefs, []), data.customFieldDefs as any[], (a, b) => String(a.name || '').toLowerCase() === String(b.name || '').toLowerCase()) : data.customFieldDefs);
    if (restoreSel.noteboards && data.noteboards) await store.set(KEYS.noteboards, upd ? mergeById(await store.get<any[]>(KEYS.noteboards, []), data.noteboards as any[], (a, b) => a.timestamp === b.timestamp && a.authorId === b.authorId && a.content === b.content) : data.noteboards);
    if (restoreSel.polls && data.polls) await store.set(KEYS.polls, upd ? mergeById(await store.get<any[]>(KEYS.polls, []), data.polls as any[]) : data.polls);
    if (restoreSel.journalTemplates && data.journalTemplates) await store.set(KEYS.journalTemplates, upd ? mergeById(await store.get<any[]>(KEYS.journalTemplates, []), data.journalTemplates as any[], (a, b) => String(a.name || '').toLowerCase() === String(b.name || '').toLowerCase()) : data.journalTemplates);
    if (restoreSel.relationships && data.relationships) await store.set(KEYS.relationships, upd ? mergeById(await store.get<any[]>(KEYS.relationships, []), data.relationships as any[]) : data.relationships);
    if (restoreSel.relationships && data.relationshipTypes) await store.set(KEYS.relationshipTypes, upd ? mergeById(await store.get<any[]>(KEYS.relationshipTypes, []), data.relationshipTypes as any[]) : data.relationshipTypes);
    if (restoreSel.relationships && data.systemMapMembers) await store.set(KEYS.systemMapMembers, upd ? [...new Set([...(await store.get<string[]>(KEYS.systemMapMembers, []) || []), ...data.systemMapMembers])] : data.systemMapMembers);
    if (restoreSel.medical && data.medical) {
      if (upd) {
        const cur = (await store.get<any>(KEYS.medical, null)) || {};
        const inc: any = data.medical;
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
        const cur = (await store.get<any>(KEYS.planner, null)) || {};
        const inc: any = data.planner;
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
    if (restoreSel.relationships && data.systemMapPositions) await store.set(KEYS.systemMapPositions, upd ? {...((await store.get<any>(KEYS.systemMapPositions, null)) || {}), ...(data.systemMapPositions as any)} : data.systemMapPositions);
    if (restoreSel.whiteboard !== false && data.whiteboard) await store.set(KEYS.whiteboard, data.whiteboard);
    if (restoreSel.palettes && data.customColors) await store.set(KEYS.customColors, data.customColors);
    if (restoreSel.settings && data.shareSettings) await store.set(KEYS.share, data.shareSettings);
    // The tail above is a batch of single writes — one phase, not fifteen.
    ctx.control?.end();
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

/**
 * Ourcana v3 dropped the flat members/frontHistory arrays for a graph of
 * typed nodes (member | customField | system) plus hasMember edges. Flatten it
 * back into the shape the importer below already understands, so old exports
 * keep working untouched. Unknown node types are ignored on purpose — a future
 * Ourcana release should add data, not break the import.
 */
const normalizeOurcana = (raw: any): any => {
  if (!raw || !raw.graph || !Array.isArray(raw.graph.nodes)) return raw;
  const nodes: any[] = raw.graph.nodes;
  const edges: any[] = Array.isArray(raw.graph.edges) ? raw.graph.edges : [];
  const byType = (t: string) => nodes.filter((n: any) => n && n.type === t);
  const sysNode = byType('system')[0];
  const sysProps = sysNode?.properties || {};
  const fieldDefs = byType('customField')
    .slice()
    .sort((a: any, b: any) => (a.properties?.order ?? 0) - (b.properties?.order ?? 0))
    .map((n: any, i: number) => ({
      id: String(n.id),
      name: String(n.properties?.label || `Field ${i + 1}`).trim() || `Field ${i + 1}`,
      order: n.properties?.order ?? i,
      type: String(n.properties?.type || 'text'),
    }));
  const memberNodes = byType('member');
  const memberIdSet = new Set(memberNodes.map((n: any) => String(n.id)));
  // Ourcana mints a personal tag per member (id tag_default_<memberId>, labelled
  // with the member's own name); importing those would create one junk
  // single-member group per member, so only the real organizational tags survive.
  const tags = byType('tag')
    .filter((n: any) => !String(n.id).startsWith('tag_default_'))
    .map((n: any) => {
      const p = n.properties || {};
      return {
        id: String(n.id),
        label: p.label,
        color: p.color,
        parentId: p.parentId != null ? String(p.parentId) : null,
      };
    });
  const tagIdSet = new Set(tags.map(tg => tg.id));
  const tagIdsByMember: Record<string, string[]> = {};
  edges.forEach((e: any) => {
    if (!e || e.type !== 'taggedWith') return;
    const from = String(e.from);
    const to = String(e.to);
    if (!memberIdSet.has(from) || !tagIdSet.has(to)) return;
    if (!tagIdsByMember[from]) tagIdsByMember[from] = [];
    tagIdsByMember[from].push(to);
  });
  const members = memberNodes.map((n: any) => {
    const p = n.properties || {};
    return {
      id: String(n.id),
      name: p.name,
      displayName: p.displayName,
      showOnlyDisplayName: p.showOnlyDisplayName,
      pronouns: p.pronouns,
      desc: p.desc,
      color: p.color,
      archived: p.archived,
      // localAvatarPath points at a file on THEIR device and cannot travel;
      // the archive's avatars/<memberId> files are attached at import time.
      avatarUrl: p.avatarUrl,
      tagIds: tagIdsByMember[String(n.id)] || [],
      ourcanaFieldValues: p.customFields && typeof p.customFields === 'object' ? p.customFields : {},
    };
  });
  // v3 splits fronting into raw ourcanaSwitchAtom records and the frontEvent
  // rows aggregated from them — read the events only, or every span doubles.
  const frontHistory = byType('frontEvent')
    .concat(byType('front'))
    .concat(byType('frontEntry'))
    .map((n: any) => {
      const p = n.properties || {};
      return {
        memberIds: Array.isArray(p.memberIds) ? p.memberIds : (p.memberId ? [p.memberId] : []),
        startTime: p.startTime,
        endTime: p.endTime,
        isLive: p.isLive,
      };
    });
  return {
    ...raw,
    system: {name: sysProps.username, desc: sysProps.desc, ourcanaId: sysNode ? String(sysNode.id) : ''},
    members,
    tags,
    frontHistory,
    ourcanaFieldDefs: fieldDefs,
  };
};

/** The database json inside an .our archive — never image_assets/index.json. */
export const findOurcanaJsonEntry = (files: Record<string, Uint8Array>): string | undefined => {
  const names = Object.keys(files);
  return names.find(n => /(^|\/)ourcana[^/]*\.json$/i.test(n))
    || names.find(n => !n.includes('/') && n.toLowerCase().endsWith('.json'))
    || names.find(n => n.toLowerCase().endsWith('.json') && !n.toLowerCase().endsWith('index.json'));
};

/** Resolve an image_assets entry by owner + role (system banner etc.). */
const ourAssetFor = (zipFiles: Record<string, Uint8Array>, ownerId: string, role: string): Uint8Array | null => {
  if (!ownerId) return null;
  const idxName = Object.keys(zipFiles).find(n => n.endsWith('image_assets/index.json'));
  if (!idxName) return null;
  try {
    const idx = JSON.parse(zipTextOf(zipFiles[idxName]));
    const assets: any[] = Array.isArray(idx?.assets) ? idx.assets : [];
    const hit = assets
      .filter(a => a && a.role === role && String(a.ownerId) === ownerId && typeof a.localPath === 'string')
      .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))[0];
    if (!hit) return null;
    const entry = Object.keys(zipFiles).find(n => n === hit.localPath || n.endsWith(`/${hit.localPath}`));
    return entry ? zipFiles[entry] : null;
  } catch { return null; }
};

/**
 * Ourcana frontEvents are already whole switches with real end times, and the
 * spans legitimately overlap (per-member fronting records over days). Feeding
 * them through the SP coalescer fuses every overlapping span into one giant
 * union entry, so they are mapped directly: rows sharing a start instant and
 * an end merge into one switch, everything else stays its own entry, and only
 * a genuinely live row is left open.
 */
export const ourFrontEventsToHistory = (ouFronts: any[], idMap: Record<string, string>): HistoryEntry[] => {
  const rows = ouFronts
    .map((f: any) => ({
      ids: (Array.isArray(f.memberIds) ? f.memberIds : []).map((eid: any) => idMap[String(eid)]).filter(Boolean) as string[],
      startTime: typeof f.startTime === 'number' ? f.startTime : (f.startTime ? new Date(f.startTime).getTime() : 0),
      endTime: f.isLive ? null : (typeof f.endTime === 'number' ? f.endTime : (f.endTime ? new Date(f.endTime).getTime() : null)),
      isLive: !!f.isLive,
    }))
    .filter(r => r.startTime > 0 && r.ids.length > 0)
    .sort((a, b) => a.startTime - b.startTime);
  const TOL = 60 * 1000;
  const merged: {e: HistoryEntry; live: boolean}[] = [];
  for (const r of rows) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(r.startTime - last.e.startTime) <= TOL && (last.e.endTime ?? null) === (r.endTime ?? null)) {
      last.e.memberIds = [...new Set([...last.e.memberIds, ...r.ids])];
      last.live = last.live || r.isLive;
      continue;
    }
    merged.push({e: {memberIds: r.ids, startTime: r.startTime, endTime: r.endTime, note: '', mood: undefined, location: undefined} as HistoryEntry, live: r.isLive});
  }
  for (let i = 0; i < merged.length; i++) {
    if (merged[i].e.endTime != null || merged[i].live) continue;
    for (let j = i + 1; j < merged.length; j++) {
      if (merged[j].e.startTime > merged[i].e.startTime) { merged[i].e.endTime = merged[j].e.startTime; break; }
    }
  }
  return merged.map(m => m.e);
};

/** Pick the bytes of `avatars/<ownerId>.<ext>` out of an .our archive. */
const ourZipAvatarFor = (zipFiles: Record<string, Uint8Array>, ownerId: string): Uint8Array | null => {
  if (!ownerId) return null;
  const name = Object.keys(zipFiles).find(n => {
    const parts = n.split('/');
    const file = parts[parts.length - 1];
    return parts[parts.length - 2] === 'avatars' && file.startsWith(`${ownerId}.`);
  });
  return name ? zipFiles[name] : null;
};

export const importOurcana = async (rawDataIn: any, ctx: RestoreCtx, zipFiles?: Record<string, Uint8Array> | null) => {
  const {restoreSel, importMode, setRestoreProgress, t} = ctx;
    const rawData = normalizeOurcana(rawDataIn);
    const ouSys = rawData.system || {};
    const ouMembers: any[] = Array.isArray(rawData.members) ? rawData.members : [];
    const ouFronts: any[] = Array.isArray(rawData.frontHistory) ? rawData.frontHistory : [];
    const ouTags: any[] = Array.isArray(rawData.tags) ? rawData.tags : [];
    if (restoreSel.system) {
      const sys = await store.get<any>(KEYS.system, {}) || {};
      const next: any = {...sys, name: ouSys.name || sys.name, description: ouSys.desc || sys.description || ''};
      const sysId = String(ouSys.ourcanaId || '');
      if (zipFiles && sysId) {
        if (restoreSel.avatars) {
          const bytes = ourZipAvatarFor(zipFiles, sysId) || ourAssetFor(zipFiles, sysId, 'avatar');
          if (bytes) {
            const uri = await saveAvatar('system-avatar', base64FromU8(bytes)).catch(() => null);
            if (uri) next.avatar = uri;
          }
        }
        if (restoreSel.banners) {
          const bytes = ourAssetFor(zipFiles, sysId, 'banner');
          if (bytes) {
            const uri = await saveBannerFromBase64('system-banner', base64FromU8(bytes)).catch(() => null);
            if (uri) next.banner = uri;
          }
        }
      }
      await store.set(KEYS.system, next);
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
      await store.set(KEYS.members, finalizeMemberReplace(merged, idMap, importMode));
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
      ouTags.forEach((tg: any) => {
        if (!tg.parentId) return;
        const childId = groupIdMap[String(tg.id)];
        const parentId = groupIdMap[String(tg.parentId)];
        if (!childId || !parentId || childId === parentId) return;
        const g = mergedGroups.find(x => x.id === childId);
        if (g) g.parentId = parentId;
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
      await applyImportedHistory(ourFrontEventsToHistory(ouFronts, idMap), ctx);
    }
    const ouFieldDefs: any[] = Array.isArray(rawData.ourcanaFieldDefs) ? rawData.ourcanaFieldDefs : [];
    if (restoreSel.customFields && restoreSel.members && ouFieldDefs.length > 0) {
      // Their fields are global definitions; each member holds a
      // { fieldNodeId: value } map against them. Match ours by name so a repeat
      // import reuses the same column instead of duplicating it.
      const existingDefs = await store.get<CustomFieldDef[]>(KEYS.customFieldDefs, []) || [];
      const fieldIdMap: Record<string, string> = {};
      const newDefs: CustomFieldDef[] = [];
      ouFieldDefs.forEach((f: any, i: number) => {
        const name = String(f.name || `Field ${i + 1}`);
        const existing = existingDefs.find(d => d.name.toLowerCase() === name.toLowerCase());
        let localId: string;
        if (existing) { localId = existing.id; } else {
          localId = uid();
          const raw = String(f.type || 'text').toLowerCase();
          const type: CustomFieldDef['type'] = raw === 'number' ? 'number' : raw === 'boolean' || raw === 'toggle' ? 'toggle' : raw === 'date' ? 'date' : 'text';
          newDefs.push({id: localId, name, type, sortOrder: f.order ?? i});
        }
        fieldIdMap[String(f.id)] = localId;
      });
      if (newDefs.length > 0) await store.set(KEYS.customFieldDefs, [...existingDefs, ...newDefs]);
      const membersForCF = await store.get<Member[]>(KEYS.members, []) || [];
      const withCF = membersForCF.map(lm => {
        const om = ouMembers.find((m: any) => idMap[String(m.id)] === lm.id);
        const vals = om?.ourcanaFieldValues;
        if (!vals || typeof vals !== 'object') return lm;
        const merged: CustomFieldValue[] = [...(lm.customFields || [])];
        for (const k in vals) {
          const fieldId = fieldIdMap[String(k)];
          const v = vals[k];
          if (!fieldId || v === null || v === undefined || v === '') continue;
          const value = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : String(v);
          const at = merged.findIndex(c => c.fieldId === fieldId);
          if (at >= 0) merged[at] = {...merged[at], value};
          else merged.push({fieldId, value});
        }
        return merged.length > 0 ? {...lm, customFields: merged} : lm;
      });
      await store.set(KEYS.members, withCF);
    }
    if (restoreSel.avatars) {
      // The .our archive carries the pictures as avatars/<memberId>.<ext>;
      // members without one fall back to their remote avatarUrl.
      const zipDone = new Set<string>();
      if (zipFiles) {
        const jobs = ouMembers.filter((m: any) => idMap[String(m.id)] && ourZipAvatarFor(zipFiles, String(m.id)));
        if (jobs.length > 0) {
          setRestoreProgress(t('share.progressAvatars'));
          const saved: Record<string, string> = {};
          await parallelMap(jobs, async (m: any) => {
            const bytes = ourZipAvatarFor(zipFiles, String(m.id));
            if (!bytes) return;
            const uri = await saveAvatar(idMap[String(m.id)], base64FromU8(bytes)).catch(() => null);
            if (uri) { saved[idMap[String(m.id)]] = uri; zipDone.add(String(m.id)); }
          }, 4, (done, total) => setRestoreProgress(t('share.progressAvatarsN', {done, total})));
          if (Object.keys(saved).length > 0) {
            await store.set(KEYS.members, mergeMediaIntoMembers(await getStoredMembers(), 'avatar', saved));
          }
        }
      }
      const urls: Record<string, string> = {};
      ouMembers.forEach((m: any) => { if (zipDone.has(String(m.id))) return; const localId = idMap[String(m.id)]; const url = String(m.avatarUrl || ''); if (localId && /^https?:\/\//.test(url)) urls[localId] = url; });
      await downloadAvatarsTo(urls, ctx);
    }
  };

export const importMultiplicity = async (rawData: any, ctx: RestoreCtx) => {
  const {restoreSel, importMode, setRestoreProgress, t} = ctx;
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
      await store.set(KEYS.members, finalizeMemberReplace(merged, idMap, importMode));
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
  const {restorePath, restorePreview, restoreIsBundle, restoreSel, importMode, setRestoring, setRestoreDone, setRestoreProgress, setRestoreError, t, onDataImported, history} = ctx;
    if (!restorePath || !restorePreview) return;
    Alert.alert(t('share.restoreData'), t(importMode === 'update' ? 'share.importUpdateDataMsg' : 'share.restoreDataMsg'), [
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
              await store.set(KEYS.members, importMode === 'update'
                ? mergeBackupMembers(await store.get<Member[]>(KEYS.members, []) || [], mem as Member[])
                : mem);
            }
            await restoreSharedPayload(data, ctx);
            // A stop is not a failure and not a clean success — say which steps
            // actually landed instead of claiming the import finished.
            if (ctx.control?.stopped) setRestoreError(stoppedSummary(ctx.control, t));
            setRestoreDone(true); setTimeout(() => onDataImported(), 800);
            return;
          }
          let content = '';
          try { content = await ReactNativeBlobUtil.fs.readFile(restorePath, 'utf8'); } catch {}
          let ourZipFiles: Record<string, Uint8Array> | null = null;
          let rawData: any;
          try { rawData = JSON.parse(content); } catch {
            // An .our archive keeps the whole zip as the pending file so the
            // member avatars can be pulled from it below; the database json
            // sits inside the archive.
            const zb = await readZipBundle(restorePath);
            const inner = findOurcanaJsonEntry(zb.files);
            if (!inner) throw new Error(t('share.invalidJsonBackup'));
            rawData = JSON.parse(zipTextOf(zb.files[inner]));
            ourZipFiles = zb.files;
          }

          const looksLikeOurcana = (rawData.format === 'ourcana') || (rawData.graph && Array.isArray(rawData.graph.nodes)) || (!rawData._meta && Array.isArray(rawData.members) && Array.isArray(rawData.frontHistory) && rawData.members[0]?.id !== undefined);
          if (looksLikeOurcana) {
            await importOurcana(rawData, ctx, ourZipFiles);
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
                banner: existing?.banner,
                isCustomFront: existing?.isCustomFront,
                isFacet: existing?.isFacet,
                sortOrder: existing?.sortOrder,
              } as Member;
            });
            // The old wholesale store.set(newMembers) hard-dropped every local
            // member the file didn't carry, custom fronts and facets included.
            // Unmatched locals now follow the standard replace semantics:
            // tombstoned in Overwrite, kept untouched in Update.
            const spMatched = new Set(newMembers.map(m => m.id));
            const spKeptLocals = existingMembers
              .filter(lm => !spMatched.has(lm.id))
              .map(lm => (importMode === 'update' || lm.isCustomFront || lm.isFacet || lm.deleted) ? lm : {...lm, archived: true, deleted: true});
            if (restoreSel.members) await store.set(KEYS.members, [...newMembers, ...spKeptLocals]);
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
              await store.set(KEYS.members, finalizeMemberReplace(merged, idMap, importMode));
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
            await store.set(KEYS.members, importMode === 'update'
              ? mergeBackupMembers(await store.get<Member[]>(KEYS.members, []) || [], membersAccum as Member[])
              : membersAccum);
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
