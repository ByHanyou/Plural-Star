import {Alert} from 'react-native';
import type {TFunction} from 'i18next';
import {Member, MemberGroup, SystemInfo, HistoryEntry, uid} from '../utils';
import {store, KEYS} from '../storage';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import {readFileText} from '../utils/fileBytes';
import {normHex} from './convert';

export type TupperboxCtx = {
  extPreview: any;
  extSel: Record<string, boolean>;
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

/**
 * Tupperbox `tul!export` JSON: `{ tuppers: [], groups: [] }`.
 * Field list verified against PluralKit's TupperboxImport.cs and /plu/ral's
 * porting model (both open source), not guessed:
 *   tupper: id, name, brackets (flat array of prefix/suffix PAIRS, even length),
 *           avatar_url, avatar, banner, posts, show_brackets, birthday
 *           (may be a yearless "0000-…" date), tag, nick, created_at,
 *           group_id, last_used
 *   group:  id, name, avatar, description, tag
 * No system meta, no fronting, no custom fields, no colors. We take name,
 * description, group membership, and — matching our PK round-trip policy —
 * preserve brackets as pkProxyTags and avatar_url as pkAvatarUrl so a later
 * PluralKit export keeps them. Discord-proxy concepts (tag, show_brackets,
 * posts, nick) and birthday are deliberately dropped, same as our other
 * importers drop what has no home here.
 */
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
    // PluralKit's own sniffer for these files is simply "has a tuppers array".
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
  const {extPreview, extSel, t, setImportStatus, setImportMsg, setExtPreview, onDataImported} = ctx;
  if (!extPreview) return;
  Alert.alert(t('share.importData'), t('share.importAddDataMsg'), [
    {text: t('common.cancel'), style: 'cancel'},
    {text: t('share.importBtn'), onPress: async () => {
      try {
        const tuppers: any[] = extPreview.tuppers || [];
        const tbGroups: any[] = extPreview.groups || [];

        // Groups first (dedupe by name against existing, spFile-style) so the
        // member rows can point their groupIds at local ids.
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
          const newMembers: Member[] = tuppers.map((tp: any) => {
            // Brackets arrive as a flat even-length array of prefix/suffix
            // pairs; preserved as pkProxyTags for PK round-trips.
            const rawBr: any[] = Array.isArray(tp?.brackets) ? tp.brackets : [];
            const proxyTags: {prefix?: string | null; suffix?: string | null}[] = [];
            if (rawBr.length % 2 === 0) {
              for (let i = 0; i + 1 < rawBr.length; i += 2) {
                proxyTags.push({prefix: rawBr[i] == null ? null : String(rawBr[i]), suffix: rawBr[i + 1] == null ? null : String(rawBr[i + 1])});
              }
            }
            return {
              id: uid(), sourceId: 'tb:' + String(tp?.id ?? uid()),
              name: (tp?.name && String(tp.name).trim()) || 'Unnamed member',
              pronouns: '', role: '', color: normHex(undefined),
              description: String(tp?.description || ''),
              tags: [], customFields: [],
              groupIds: tp?.group_id != null && groupIdMap[String(tp.group_id)] ? [groupIdMap[String(tp.group_id)]] : [],
              ...(proxyTags.length > 0 ? {pkProxyTags: proxyTags} : {}),
              ...(tp?.avatar_url ? {pkAvatarUrl: String(tp.avatar_url)} : {}),
            } as Member;
          });
          await store.set(KEYS.members, newMembers);
        }

        setImportStatus('success'); setImportMsg(t('share.importComplete'));
        setExtPreview(null);
        setTimeout(() => onDataImported(), 800);
      } catch (e: any) { setImportStatus('error'); setImportMsg(e.message || t('share.importFailedGeneric')); }
    }},
  ]);
};
