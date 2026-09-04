import {Alert} from 'react-native';
import type {TFunction} from 'i18next';
import {Member, MemberGroup, SystemInfo, HistoryEntry, uid} from '../utils';
import {store, KEYS} from '../storage';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import {readFileText} from '../utils/fileBytes';
import {normHex, mergeForeignMember, finalizeMemberReplace, ImportMode} from './convert';

export type TupperboxCtx = {
  extPreview: any;
  extSel: Record<string, boolean>;
  importMode: ImportMode;
  system: SystemInfo;
  history: HistoryEntry[];
  t: TFunction;
  setRestoreError: any;
  setExtPreview: any;
  setImportStatus: any;
  setImportMsg: any;
  setImportSource: any;
  onDataImported: () => void;
};

export const handleTupperboxPick = async (ctx: TupperboxCtx) => {
  const {setRestoreError, setExtPreview, setImportStatus, setImportMsg, t, setImportSource} = ctx;
  setRestoreError(''); setExtPreview(null); setImportStatus('idle'); setImportMsg('');
  try {
    const [res] = await safePick({type: ['*/*']});
    if (!res) return;
    const path = getPickedFilePath(res);
    let parsed: any = null;
    try {
      const txt: string = await readFileText(path, res.uri);
      parsed = JSON.parse(txt);
    } catch {}
    if (!parsed || !Array.isArray(parsed.tuppers)) {
      throw new Error(t('share.tupperboxNeedsJson'));
    }
    if (parsed.tuppers.length === 0) throw new Error(t('share.tupperboxEmpty'));
    setExtPreview({
      tuppers: parsed.tuppers,
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    });
    setImportSource('tupperbox');
  } catch (e: any) { if (!isPickerCancel(e)) Alert.alert(t('share.importFailed'), e.message || String(e)); }
};

export const handleTupperboxConfirm = (ctx: TupperboxCtx) => {
  const {extPreview, extSel, importMode, t, setImportStatus, setImportMsg, setExtPreview, onDataImported} = ctx;
  if (!extPreview) return;
  Alert.alert(t('share.importData'), t(importMode === 'update' ? 'share.importUpdateDataMsg' : 'share.importAddDataMsg'), [
    {text: t('common.cancel'), style: 'cancel'},
    {text: t('share.importBtn'), onPress: async () => {
      try {
        const tuppers: any[] = extPreview.tuppers || [];
        const tbGroups: any[] = extPreview.groups || [];

        const groupIdMap: Record<string, string> = {};
        if (extSel.groups && tbGroups.length > 0) {
          const existingGroups = await store.get<MemberGroup[]>(KEYS.groups, []) || [];
          const newGroups: MemberGroup[] = [];
          tbGroups.forEach((g: any) => {
            const gName = (g?.name && String(g.name).trim()) || '';
            if (!gName || g?.id == null) return;
            const existing = existingGroups.find(eg => eg.name.toLowerCase() === gName.toLowerCase());
            const localId = existing ? existing.id : uid();
            if (!existing) newGroups.push({id: localId, name: gName, description: g.description ? String(g.description) : undefined, sourceId: 'tb:g:' + String(g.id)});
            groupIdMap[String(g.id)] = localId;
          });
          if (newGroups.length > 0) await store.set(KEYS.groups, [...existingGroups, ...newGroups]);
        }

        if (extSel.members) {
          const existing = await store.get<Member[]>(KEYS.members, []) || [];
          const merged: Member[] = [...existing];
          const idMap: Record<string, string> = {};
          tuppers.forEach((tp: any) => {
            const rawBr: any[] = Array.isArray(tp?.brackets) ? tp.brackets : [];
            const proxyTags: {prefix?: string | null; suffix?: string | null}[] = [];
            if (rawBr.length % 2 === 0) {
              for (let i = 0; i + 1 < rawBr.length; i += 2) {
                proxyTags.push({prefix: rawBr[i] == null ? null : String(rawBr[i]), suffix: rawBr[i + 1] == null ? null : String(rawBr[i + 1])});
              }
            }
            mergeForeignMember(merged, idMap, 'tb:' + String(tp?.id ?? uid()), {
              name: (tp?.name && String(tp.name).trim()) || 'Unnamed member',
              description: String(tp?.description || ''),
              groupIds: tp?.group_id != null && groupIdMap[String(tp.group_id)] ? [groupIdMap[String(tp.group_id)]] : [],
              ...(proxyTags.length > 0 ? {pkProxyTags: proxyTags} : {}),
              ...(tp?.avatar_url ? {pkAvatarUrl: String(tp.avatar_url)} : {}),
            });
          });
          const preexisting = new Set(existing.map(m => m.id));
          await store.set(KEYS.members, finalizeMemberReplace(merged, idMap, importMode).map(m =>
            preexisting.has(m.id) ? m : {...m, pronouns: m.pronouns ?? '', role: m.role ?? '', color: m.color ?? normHex(undefined)}));
        }

        setImportStatus('success'); setImportMsg(t('share.importComplete'));
        setExtPreview(null);
        setTimeout(() => onDataImported(), 800);
      } catch (e: any) { setImportStatus('error'); setImportMsg(e.message || t('share.importFailedGeneric')); }
    }},
  ]);
};
