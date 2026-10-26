import {Alert} from 'react-native';
import {ImportUserError, importErrorText} from './importError';
import {Member, MemberGroup, uid} from '../utils';
import {store, KEYS} from '../storage';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import {readFileText} from '../utils/fileBytes';
import {log} from '../utils/log';
import {mergeForeignMember, finalizeMemberReplace, claimGroup, getStoredList, getStoredMembers, localIds} from './convert';
import {confirmImport} from './confirm';
import {asArray} from './formats';
import type {TbTupper, TbGroup} from './formats';
import type {ExtImportCtx} from './preview';
import {isTupperboxExport} from './detect';

export type TupperboxCtx = ExtImportCtx;

export const handleTupperboxPick = async (ctx: TupperboxCtx) => {
  const {setRestoreError, setExtPreview, setImportStatus, setImportMsg, t, setImportSource} = ctx;
  setRestoreError(''); setExtPreview(null); setImportStatus('idle'); setImportMsg('');
  try {
    const [res] = await safePick({type: ['*/*']});
    if (!res) return;
    const path = getPickedFilePath(res);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(await readFileText(path, res.uri));
    } catch (e) {
      log.debug('import', e);
    }
    if (!isTupperboxExport(parsed)) {
      throw new ImportUserError(t('share.tupperboxNeedsJson'));
    }
    if (parsed.tuppers.length === 0) throw new ImportUserError(t('share.tupperboxEmpty'));
    setExtPreview({
      source: 'tupperbox',
      tuppers: parsed.tuppers,
      groups: asArray<TbGroup>(parsed.groups),
    });
    setImportSource('tupperbox');
  } catch (e) { if (!isPickerCancel(e)) Alert.alert(t('share.importFailed'), importErrorText(e, t)); }
};

export const handleTupperboxConfirm = (ctx: TupperboxCtx) => {
  const {extPreview, extSel, importMode, t, setImportStatus, setImportMsg, setExtPreview, onDataImported} = ctx;
  if (!extPreview || extPreview.source !== 'tupperbox') return;
  confirmImport(t, importMode, async () => {
    try {
      const tuppers: TbTupper[] = extPreview.tuppers || [];
      const tbGroups: TbGroup[] = extPreview.groups || [];

      const groupIdMap = new Map<string, string>();
      if (extSel.groups && tbGroups.length > 0) {
        const existingGroups = await getStoredList<MemberGroup>(KEYS.groups);
        const newGroups: MemberGroup[] = [];
        tbGroups.forEach(g => {
          const gName = (g?.name && String(g.name).trim()) || '';
          if (!gName || g?.id == null) return;
          groupIdMap.set(String(g.id), claimGroup(existingGroups, newGroups, gName, {description: g.description ? String(g.description) : undefined, sourceId: 'tb:g:' + String(g.id)}));
        });
        if (newGroups.length > 0) await store.set(KEYS.groups, [...existingGroups, ...newGroups]);
      }

      if (extSel.members) {
        const existing = await getStoredMembers();
        const merged: Member[] = [...existing];
        const idMap = new Map<string, string>();
        tuppers.forEach(tp => {
          const rawBr = Array.isArray(tp?.brackets) ? tp.brackets : [];
          const proxyTags: {prefix?: string | null; suffix?: string | null}[] = [];
          if (rawBr.length % 2 === 0) {
            for (let i = 0; i + 1 < rawBr.length; i += 2) {
              proxyTags.push({prefix: rawBr[i] == null ? null : String(rawBr[i]), suffix: rawBr[i + 1] == null ? null : String(rawBr[i + 1])});
            }
          }
          mergeForeignMember(merged, idMap, 'tb:' + String(tp?.id ?? uid()), {
            name: (tp?.name && String(tp.name).trim()) || t('share.unnamedMember'),
            description: String(tp?.description || ''),
            groupIds: tp?.group_id != null ? localIds(groupIdMap, [tp.group_id]) : [],
            ...(proxyTags.length > 0 ? {pkProxyTags: proxyTags} : {}),
            ...(tp?.avatar_url ? {pkAvatarUrl: String(tp.avatar_url)} : {}),
          });
        });
        await store.set(KEYS.members, finalizeMemberReplace(merged, idMap, importMode));
      }

      setImportStatus('success'); setImportMsg(t('share.importComplete'));
      setExtPreview(null);
      setTimeout(() => onDataImported(), 800);
    } catch (e) { setImportStatus('error'); setImportMsg(importErrorText(e, t)); }
  });
};
