import {log, logError} from '../utils/log';
import i18n from '../i18n/i18n';
import {Member, MemberGroup, SystemInfo, CustomFieldType, CustomFieldValue, withFieldValue, asRecord, pushTo, EMPTY_SYSTEM} from '../utils';
import {store, KEYS} from '../storage';
import {zipTextOf} from './zipBundle';
import {encodeBase64} from '../network/bytes';
import {saveAvatar, saveBannerFromBase64} from '../utils/mediaUtils';
import {parallelMap} from '../utils/concurrency';
import {convertOurcanaFronts, normHex, mergeForeignMember, finalizeMemberReplace, getStoredList, getStoredMembers, mergeMediaIntoMembers, localIds} from './convert';
import {asArray} from './formats';
import type {OuExport, OuEdge, OuMember, OuFront, OuTag, OuFieldDef, OuAssetIndexEntry} from './formats';
import {RestoreCtx, optString, optNumber, applyImportedHistory, mergeSourceGroups, withGroupIds, mergeFieldDefs, downloadAvatarsTo} from './restoreCommon';

const OURCANA_FIELD_TYPE = new Map<string, CustomFieldType>([['number', 'number'], ['boolean', 'toggle'], ['toggle', 'toggle'], ['date', 'date']]);

const normalizeOurcana = (raw: OuExport): OuExport => {
  if (!raw.graph || !Array.isArray(raw.graph.nodes)) return raw;
  const nodes = raw.graph.nodes;
  const edges = asArray<OuEdge>(raw.graph.edges);
  const byType = (t: string) => nodes.filter(n => n && n.type === t);
  const sysNode = byType('system')[0];
  const sysProps = sysNode?.properties || {};
  const fieldDefs: OuFieldDef[] = byType('customField')
    .slice()
    .sort((a, b) => (optNumber(a.properties?.order) ?? 0) - (optNumber(b.properties?.order) ?? 0))
    .map((n, i) => ({
      id: String(n.id),
      name: String(n.properties?.label || i18n.t('share.fieldN', {n: i + 1})).trim() || i18n.t('share.fieldN', {n: i + 1}),
      order: optNumber(n.properties?.order) ?? i,
      type: String(n.properties?.type || 'text'),
    }));
  const memberNodes = byType('member');
  const memberIdSet = new Set(memberNodes.map(n => String(n.id)));
  const tags: OuTag[] = byType('tag')
    .filter(n => !String(n.id).startsWith('tag_default_'))
    .map(n => {
      const p = n.properties || {};
      return {
        id: String(n.id),
        label: p.label,
        color: p.color,
        parentId: p.parentId != null ? String(p.parentId) : null,
      };
    });
  const tagIdSet = new Set(tags.map(tg => String(tg.id)));
  const tagIdsByMember = new Map<string, string[]>();
  edges.forEach(e => {
    if (!e || e.type !== 'taggedWith') return;
    const from = String(e.from);
    const to = String(e.to);
    if (!memberIdSet.has(from) || !tagIdSet.has(to)) return;
    pushTo(tagIdsByMember, from, to);
  });
  const members: OuMember[] = memberNodes.map(n => {
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
      avatarUrl: p.avatarUrl,
      tagIds: tagIdsByMember.get(String(n.id)) || [],
      ourcanaFieldValues: asRecord(p.customFields) || {},
    };
  });
  const frontHistory: OuFront[] = byType('frontEvent')
    .concat(byType('front'))
    .concat(byType('frontEntry'))
    .map(n => {
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

const ourAssetFor = (zipFiles: Record<string, Uint8Array>, ownerId: string, role: string): Uint8Array | null => {
  if (!ownerId) return null;
  const idxName = Object.keys(zipFiles).find(n => n.endsWith('image_assets/index.json'));
  if (!idxName) return null;
  try {
    const idx: unknown = JSON.parse(zipTextOf(zipFiles[idxName]));
    const assets = asArray<OuAssetIndexEntry>(asRecord(idx)?.assets);
    const hit = assets
      .filter(a => a && a.role === role && String(a.ownerId) === ownerId && typeof a.localPath === 'string')
      .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))[0];
    if (!hit) return null;
    const entry = Object.keys(zipFiles).find(n => n === hit.localPath || n.endsWith(`/${hit.localPath}`));
    return entry ? zipFiles[entry] : null;
  } catch (e) {
    log.debug('import', e);
    return null;
  }
};

const ourZipAvatarFor = (zipFiles: Record<string, Uint8Array>, ownerId: string): Uint8Array | null => {
  if (!ownerId) return null;
  const name = Object.keys(zipFiles).find(n => {
    const parts = n.split('/');
    const file = parts[parts.length - 1];
    return parts[parts.length - 2] === 'avatars' && file.startsWith(`${ownerId}.`);
  });
  return name ? zipFiles[name] : null;
};

export const importOurcana = async (rawDataIn: OuExport, ctx: RestoreCtx, zipFiles?: Record<string, Uint8Array> | null) => {
  const {restoreSel, importMode, setRestoreProgress, t} = ctx;
  const rawData = normalizeOurcana(rawDataIn);
  const ouSys = rawData.system || {};
  const ouMembers = asArray<OuMember>(rawData.members);
  const ouFronts = asArray<OuFront>(rawData.frontHistory);
  const ouTags = asArray<OuTag>(rawData.tags);
  if (restoreSel.system) {
    const sys = await store.get<SystemInfo>(KEYS.system) || EMPTY_SYSTEM;
    const next: SystemInfo = {...sys, name: optString(ouSys.name) || sys.name, description: optString(ouSys.desc) || sys.description || ''};
    const sysId = String(ouSys.ourcanaId || '');
    if (zipFiles && sysId) {
      if (restoreSel.avatars) {
        const bytes = ourZipAvatarFor(zipFiles, sysId) || ourAssetFor(zipFiles, sysId, 'avatar');
        if (bytes) {
          const uri = await saveAvatar('system-avatar', encodeBase64(bytes)).catch(e => { logError('import', e); return null; });
          if (uri) next.avatar = uri;
        }
      }
      if (restoreSel.banners) {
        const bytes = ourAssetFor(zipFiles, sysId, 'banner');
        if (bytes) {
          const uri = await saveBannerFromBase64('system-banner', encodeBase64(bytes)).catch(e => { logError('import', e); return null; });
          if (uri) next.banner = uri;
        }
      }
    }
    await store.set(KEYS.system, next);
  }
  const idMap = new Map<string, string>();
  if (restoreSel.members) {
    const existing = await getStoredMembers();
    const merged: Member[] = [...existing];
    ouMembers.forEach(m => {
      const useDisplay = m.showOnlyDisplayName && m.displayName;
      mergeForeignMember(merged, idMap, String(m.id), {
        name: (useDisplay ? String(m.displayName) : String(m.name || '')).trim() || t('share.unnamedMember'),
        pronouns: String(m.pronouns || ''), role: '', color: normHex(m.color),
        description: String(m.desc || ''), archived: !!m.archived,
      });
    });
    await store.set(KEYS.members, finalizeMemberReplace(merged, idMap, importMode));
  }
  if (restoreSel.groups && ouTags.length > 0) {
    const {groups, idMap: groupIdMap} = mergeSourceGroups(await getStoredList<MemberGroup>(KEYS.groups), ouTags.map((tg, i) => ({
      id: String(tg.id),
      name: String(tg.label || tg.name || t('share.groupN', {n: i + 1})),
      color: tg.color,
      parentId: tg.parentId ? String(tg.parentId) : null,
    })), 'ou');
    await store.set(KEYS.groups, groups);
    const membersForGroups = await getStoredMembers();
    await store.set(KEYS.members, membersForGroups.map(lm => {
      const om = ouMembers.find(m => idMap.get(String(m.id)) === lm.id);
      if (!om || !Array.isArray(om.tagIds)) return lm;
      return withGroupIds(lm, localIds(groupIdMap, om.tagIds));
    }));
  }
  if (restoreSel.frontHistory && ouFronts.length > 0) {
    await applyImportedHistory(convertOurcanaFronts(ouFronts, idMap), ctx);
  }
  const ouFieldDefs = asArray<OuFieldDef>(rawData.ourcanaFieldDefs);
  if (restoreSel.customFields && restoreSel.members && ouFieldDefs.length > 0) {
    const fieldIdMap = await mergeFieldDefs(ouFieldDefs.map((f, i) => ({
      ids: [String(f.id)],
      name: String(f.name || t('share.fieldN', {n: i + 1})),
      type: OURCANA_FIELD_TYPE.get(String(f.type || 'text').toLowerCase()) ?? 'text',
      order: f.order ?? i,
    })));
    const membersForCF = await getStoredMembers();
    await store.set(KEYS.members, membersForCF.map(lm => {
      const om = ouMembers.find(m => idMap.get(String(m.id)) === lm.id);
      const vals = om?.ourcanaFieldValues;
      if (!vals || typeof vals !== 'object') return lm;
      let merged: CustomFieldValue[] = lm.customFields || [];
      for (const k in vals) {
        const fieldId = fieldIdMap.get(String(k));
        const v = vals[k];
        if (!fieldId || v === null || v === undefined || v === '') continue;
        merged = withFieldValue(merged, fieldId, typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : String(v));
      }
      return merged.length > 0 ? {...lm, customFields: merged} : lm;
    }));
  }
  if (restoreSel.avatars) {
    const zipDone = new Set<string>();
    if (zipFiles) {
      const jobs = ouMembers.flatMap(m => {
        const extId = String(m.id);
        const localId = idMap.get(extId);
        const bytes = localId ? ourZipAvatarFor(zipFiles, extId) : null;
        return localId && bytes ? [{extId, localId, bytes}] : [];
      });
      if (jobs.length > 0) {
        setRestoreProgress(t('share.progressAvatars'));
        const saved = new Map<string, string>();
        await parallelMap(jobs, async ({extId, localId, bytes}) => {
          const uri = await saveAvatar(localId, encodeBase64(bytes));
          if (uri) { saved.set(localId, uri); zipDone.add(extId); }
        }, 4, (done, total) => setRestoreProgress(t('share.progressAvatarsN', {done, total})));
        if (saved.size > 0) {
          await store.set(KEYS.members, mergeMediaIntoMembers(await getStoredMembers(), 'avatar', saved));
        }
      }
    }
    const urls = new Map<string, string>();
    ouMembers.forEach(m => { if (zipDone.has(String(m.id))) return; const localId = idMap.get(String(m.id)); const url = String(m.avatarUrl || ''); if (localId && /^https?:\/\//.test(url)) urls.set(localId, url); });
    await downloadAvatarsTo(urls, ctx);
  }
};
