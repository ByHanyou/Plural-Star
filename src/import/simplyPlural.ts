import {Member, CustomFieldValue, withFieldValue, uid} from '../utils';
import {store, KEYS} from '../storage';
import {convertSPSwitches, normHex, getStoredMembers, spFieldType, spFieldText, normId} from './convert';
import {spAvatarCandidates} from './spApi';
import {asArray} from './formats';
import type {SpExportFile, SpMemberDoc, SpFieldDoc, SpSwitchDoc} from './formats';
import {RestoreCtx, applyImportedHistory, mergeFieldDefs, downloadAvatarsTo} from './restoreCommon';

export const importSimplyPlural = async (rawData: SpExportFile, ctx: RestoreCtx) => {
  const {restoreSel, importMode, t} = ctx;
  const spMembers = asArray<SpMemberDoc>(rawData.members);
  const spFields = asArray<SpFieldDoc>(rawData.customFields);
  const spHistory = asArray<SpSwitchDoc>(rawData.frontHistory);
  const spFileUid = rawData.uid;
  const existingMembers = await getStoredMembers();
  const byNameLower = new Map<string, Member>();
  existingMembers.forEach(lm => { const n = (lm.name || '').trim().toLowerCase(); if (n) byNameLower.set(n, lm); });
  const newMembers: Member[] = spMembers.map(sp => {
    const spName = String(sp.name || '').trim();
    const existing = byNameLower.get(spName.toLowerCase());
    return {
      id: existing ? existing.id : uid(),
      name: spName || t('common.unknown'),
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
    };
  });
  const spMatched = new Set(newMembers.map(m => m.id));
  const spKeptLocals = existingMembers
    .filter(lm => !spMatched.has(lm.id))
    .map(lm => (importMode === 'update' || lm.isCustomFront || lm.isFacet || lm.deleted) ? lm : {...lm, archived: true, deleted: true});
  if (restoreSel.members) await store.set(KEYS.members, [...newMembers, ...spKeptLocals]);
  const idMap = new Map<string, string>();
  spMembers.forEach((sp, i) => { const sid = normId(sp._id); if (sid) idMap.set(sid, newMembers[i].id); });
  if (restoreSel.members && restoreSel.avatars) {
    const spAvatarUrls = new Map<string, string[]>();
    const spFallbackUid = String(spMembers.find(x => x.uid)?.uid || spFileUid || '');
    spMembers.forEach((sp, i) => {
      const cands = spAvatarCandidates(sp, spFallbackUid);
      if (cands.length) spAvatarUrls.set(newMembers[i].id, cands);
    });
    await downloadAvatarsTo(spAvatarUrls, ctx);
  }
  if (restoreSel.customFields && spFields.length > 0) {
    const fieldIdMap = await mergeFieldDefs(spFields.map((cf, i) => ({
      ids: [cf._id, cf.id, cf.uuid].map(normId).filter(Boolean),
      name: String(cf.name || t('share.fieldN', {n: i + 1})),
      type: spFieldType(cf.type),
      order: cf.order ?? i,
    })));
    const membersForUpdate = await getStoredMembers();
    await store.set(KEYS.members, membersForUpdate.map(lm => {
      const spMember = spMembers.find(sp => idMap.get(normId(sp._id)) === lm.id);
      const info = spMember?.info;
      if (!info || typeof info !== 'object') return lm;
      let newCF: CustomFieldValue[] = lm.customFields || [];
      Object.entries(info).forEach(([spFieldId, rawValue]) => {
        const localFieldId = fieldIdMap.get(normId(spFieldId)) || fieldIdMap.get(spFieldId);
        const text = spFieldText(rawValue);
        if (localFieldId && text !== null) newCF = withFieldValue(newCF, localFieldId, text);
      });
      return {...lm, customFields: newCF};
    }));
  }
  if (restoreSel.frontHistory && spHistory.length > 0) {
    await applyImportedHistory(convertSPSwitches(spHistory.map(s => ({id: normId(s._id), content: s})), idMap), ctx);
  }
};
