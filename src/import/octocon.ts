import {Member, MemberGroup, SystemInfo, CustomFieldType, CustomFieldValue, withFieldValue, EMPTY_SYSTEM} from '../utils';
import {store, KEYS} from '../storage';
import {convertSPSwitches, ocTime, normHex, mergeForeignMember, finalizeMemberReplace, getStoredList, getStoredMembers, localIds} from './convert';
import {asArray} from './formats';
import type {OcExport, OcAlter, OcField, OcTag, OcFront, SpSwitchDoc} from './formats';
import {RestoreCtx, applyImportedHistory, mergeSourceGroups, withGroupIds, mergeFieldDefs, downloadAvatarsTo} from './restoreCommon';

const OCTOCON_FIELD_TYPE = new Map<string, CustomFieldType>([['number', 'number'], ['boolean', 'toggle']]);

export const importOctocon = async (rawData: OcExport, ctx: RestoreCtx) => {
  const {restoreSel, importMode, t} = ctx;
  const ocUser = rawData.user || {};
  const alters = asArray<OcAlter>(rawData.alters);
  const ocFields = asArray<OcField>(ocUser.fields);
  const ocTags = asArray<OcTag>(rawData.tags);
  const ocFronts = asArray<OcFront>(rawData.fronts);
  if (restoreSel.system) {
    const sys = await store.get<SystemInfo>(KEYS.system) || EMPTY_SYSTEM;
    await store.set(KEYS.system, {...sys, name: ocUser.username || sys.name, description: ocUser.description || sys.description || ''});
  }
  const idMap = new Map<string, string>();
  if (restoreSel.members) {
    const merged: Member[] = [...(await getStoredMembers())];
    alters.forEach(a => {
      mergeForeignMember(merged, idMap, String(a.id), {
        name: (a.name && String(a.name).trim()) || t('share.unnamedMember'),
        pronouns: String(a.pronouns || ''),
        role: '',
        color: normHex(a.color),
        description: String(a.description || ''),
      });
    });
    await store.set(KEYS.members, finalizeMemberReplace(merged, idMap, importMode));
  }
  if (restoreSel.customFields && ocFields.length > 0) {
    const fieldIdMap = await mergeFieldDefs(ocFields.map((f, i) => ({
      ids: [String(f.id)],
      name: String(f.name || t('share.fieldN', {n: i + 1})),
      type: OCTOCON_FIELD_TYPE.get(String(f.type)) ?? 'text',
      order: i,
    })));
    const membersForUpdate = await getStoredMembers();
    await store.set(KEYS.members, membersForUpdate.map(lm => {
      const alter = alters.find(a => idMap.get(String(a.id)) === lm.id);
      if (!alter || !Array.isArray(alter.fields)) return lm;
      let cf: CustomFieldValue[] = lm.customFields || [];
      alter.fields.forEach(fv => {
        const fid = fieldIdMap.get(String(fv.id));
        if (fid && fv.value != null) cf = withFieldValue(cf, fid, String(fv.value));
      });
      return {...lm, customFields: cf};
    }));
  }
  if (restoreSel.groups && ocTags.length > 0) {
    const {groups, idMap: groupIdMap} = mergeSourceGroups(await getStoredList<MemberGroup>(KEYS.groups), ocTags.map((tg, i) => ({
      id: String(tg.id),
      name: String(tg.name || t('share.groupN', {n: i + 1})),
      color: tg.color,
    })), 'oc');
    await store.set(KEYS.groups, groups);
    const membersForGroups = await getStoredMembers();
    await store.set(KEYS.members, membersForGroups.map(lm => withGroupIds(lm, localIds(groupIdMap, ocTags
      .filter(tg => Array.isArray(tg.alters) && tg.alters.some(aid => idMap.get(String(aid)) === lm.id))
      .map(tg => tg.id)))));
  }
  if (restoreSel.frontHistory && ocFronts.length > 0) {
    const ocSwitches: SpSwitchDoc[] = ocFronts.map(f => ({content: {member: String(f.alter_id), startTime: ocTime(f.time_start), endTime: ocTime(f.time_end), comment: f.comment || ''}}));
    await applyImportedHistory(convertSPSwitches(ocSwitches, idMap), ctx);
  }
  if (restoreSel.avatars) {
    const ocAvatarUrls = new Map<string, string>();
    alters.forEach(a => {
      const localId = idMap.get(String(a.id));
      const url = String(a.avatar_url || '');
      if (localId && (url.startsWith('http://') || url.startsWith('https://'))) ocAvatarUrls.set(localId, url);
    });
    await downloadAvatarsTo(ocAvatarUrls, ctx);
  }
};
