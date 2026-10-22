import {Member, SystemInfo, EMPTY_SYSTEM} from '../utils';
import {store, KEYS} from '../storage';
import {convertSPSwitches, normHex, mergeForeignMember, finalizeMemberReplace, getStoredMembers, mergeMediaIntoMembers} from './convert';
import {asArray} from './formats';
import type {MxExport, MxAlter, MxFront, SpSwitchDoc} from './formats';
import {RestoreCtx, importAvatars, applyImportedHistory, downloadAvatarsTo} from './restoreCommon';

export const importMultiplicity = async (rawData: MxExport, ctx: RestoreCtx) => {
  const {restoreSel, importMode, t} = ctx;
  const sys = rawData.system || {};
  const alters = asArray<MxAlter>(rawData.alters);
  const fronts = asArray<MxFront>(rawData.front_entries);
  if (restoreSel.system) {
    const cur = await store.get<SystemInfo>(KEYS.system) || EMPTY_SYSTEM;
    await store.set(KEYS.system, {...cur, name: sys.name || cur.name, description: sys.description || cur.description || ''});
  }
  const idMap = new Map<string, string>();
  if (restoreSel.members) {
    const existing = await getStoredMembers();
    const merged: Member[] = [...existing];
    alters.forEach(a => {
      mergeForeignMember(merged, idMap, 'mx:' + String(a.alter_id), {
        name: (a.name && String(a.name).trim()) || (a.display_name && String(a.display_name).trim()) || t('share.unnamedMember'),
        pronouns: String(a.pronouns || ''), role: '', color: normHex(a.colour),
        description: String(a.description || ''), archived: !!a.is_archived,
      });
    });
    await store.set(KEYS.members, finalizeMemberReplace(merged, idMap, importMode));
  }
  if (restoreSel.frontHistory && fronts.length > 0) {
    const switches: SpSwitchDoc[] = fronts.map(f => ({content: {member: String(f.alter_id), startTime: f.start_time, endTime: f.end_time ?? null, comment: f.notes || ''}}));
    const newH = convertSPSwitches(switches, idMap);
    await applyImportedHistory(newH, ctx);
  }
  if (restoreSel.avatars) {
    const b64Map = new Map<string, string>();
    const urlMap = new Map<string, string>();
    alters.forEach(a => {
      const localId = idMap.get(String(a.alter_id));
      if (!localId) return;
      if (a.avatar_data) b64Map.set(localId, String(a.avatar_data));
      else if (/^https?:\/\//.test(String(a.avatar_url || ''))) urlMap.set(localId, String(a.avatar_url));
    });
    if (b64Map.size > 0) {
      const map = await importAvatars(b64Map, ctx);
      if (map.size > 0) await store.set(KEYS.members, mergeMediaIntoMembers(await getStoredMembers(), 'avatar', map));
    }
    await downloadAvatarsTo(urlMap, ctx);
  }
};
