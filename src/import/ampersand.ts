import {Alert} from 'react-native';
import type {TFunction} from 'i18next';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {Member, SystemInfo, HistoryEntry, CustomFieldDef, CustomFieldValue, uid} from '../utils';
import {store, KEYS} from '../storage';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import {parseAmpar} from '../utils/ampar';
import {convertSPSwitches, normHex} from './convert';
import {applyImportedHistory} from './restore';

export type AmpersandCtx = {
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

export const handleAmpersandPick = async (ctx: AmpersandCtx) => {
  const {setRestoreError, setExtPreview, setImportStatus, setImportMsg, t, setImportSource} = ctx;
    setRestoreError(''); setExtPreview(null); setImportStatus('idle'); setImportMsg('');
    try {
      const [res] = await safePick({type: ['*/*']});
      if (!res) return;
      const path = getPickedFilePath(res);
      let b64: string;
      try { b64 = await ReactNativeBlobUtil.fs.readFile(path, 'base64'); }
      catch { b64 = await ReactNativeBlobUtil.fs.readFile(res.uri || path, 'base64'); }
      const tables = parseAmpar(b64);
      const amMembers = tables.members || [];
      const fronting = tables.frontingEntries || [];
      const systemRow = (tables.systems || [])[0] || {name: t('share.system')};
      const fieldDefs = tables.customFields || [];
      if (amMembers.length === 0 && fronting.length === 0) {
        throw new Error(t('share.amparEmpty'));
      }
      setExtPreview({system: systemRow, members: amMembers, switches: fronting, customFields: fieldDefs});
      setImportSource('ampersand');
    } catch (e: any) { if (!isPickerCancel(e)) Alert.alert(t('share.importFailed'), e.message || t('share.couldNotReadAmpar')); }
  };

export const handleAmpersandConfirm = (ctx: AmpersandCtx) => {
  const {extPreview, extSel, system, t, setImportStatus, setImportMsg, setExtPreview, onDataImported} = ctx;
    if (!extPreview) return;
    Alert.alert(t('share.importData'), t('share.importAddDataMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('share.importBtn'), onPress: async () => {
        try {
          const amMembers = extPreview.members || [];
          const amFronts = extPreview.switches || [];
          const amFields = extPreview.customFields || [];
          const idMap: Record<string, string> = {};

          if (extSel.system && extPreview.system?.name) {
            await store.set(KEYS.system, {...system, name: String(extPreview.system.name) || system.name});
          }

          const fieldIdMap: Record<string, string> = {};
          if (extSel.customFields) {
            const defs: CustomFieldDef[] = amFields.map((f: any, i: number) => {
              const localId = uid();
              fieldIdMap[String(f.uuid)] = localId;
              return {id: localId, name: String(f.name || `Field ${i + 1}`), type: 'text', sortOrder: f.priority ?? i};
            });
            await store.set(KEYS.customFieldDefs, defs);
          }

          if (extSel.members) {
            const newMembers: Member[] = amMembers.map((a: any) => {
              const localId = uid();
              idMap[String(a.uuid)] = localId;
              const cf: CustomFieldValue[] = [];
              const pairs = a.customFields?.value;
              if (extSel.customFields && Array.isArray(pairs)) {
                pairs.forEach((pair: any) => {
                  if (!Array.isArray(pair) || pair.length < 2) return;
                  const fid = fieldIdMap[String(pair[0])];
                  if (!fid || pair[1] == null) return;
                  cf.push({fieldId: fid, value: (typeof pair[1] === 'object' ? JSON.stringify(pair[1]) : String(pair[1])) as any});
                });
              }
              return {
                id: localId, sourceId: 'amp:' + String(a.uuid),
                name: (a.name && String(a.name).trim()) || 'Unnamed member',
                pronouns: String(a.pronouns || ''), role: '', color: normHex(a.color),
                description: String(a.description || ''), archived: !!a.isArchived, isCustomFront: !!a.isCustomFront,
                tags: [], groupIds: [], customFields: cf,
              } as Member;
            });
            await store.set(KEYS.members, newMembers);
          } else {
            const existing = await store.get<Member[]>(KEYS.members, []) || [];
            amMembers.forEach((a: any) => { const ex = existing.find(m => m.sourceId === 'amp:' + String(a.uuid)); if (ex) idMap[String(a.uuid)] = ex.id; });
          }

          if (extSel.frontHistory) {
            const switches = amFronts.map((f: any) => ({content: {member: String(f.member), startTime: f.startTime, endTime: f.endTime ?? null}}));
            const newH = convertSPSwitches(switches, idMap);
            await applyImportedHistory(newH, ctx);
          }

          setImportStatus('success'); setImportMsg(t('share.importComplete'));
          setExtPreview(null);
          setTimeout(() => onDataImported(), 800);
        } catch (e: any) { setImportStatus('error'); setImportMsg(e.message || t('share.importFailedGeneric')); }
      }},
    ]);
  };
