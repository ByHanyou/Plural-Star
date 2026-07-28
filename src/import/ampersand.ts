import {Alert} from 'react-native';
import type {TFunction} from 'i18next';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {Member, MemberGroup, SystemInfo, HistoryEntry, CustomFieldDef, CustomFieldValue, uid} from '../utils';
import {store, KEYS} from '../storage';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
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

/**
 * Ampersand's JSON export (DatabaseJSON) reshaped into the same preview the
 * binary path produces, so the confirm step below stays one code path. Their
 * entity model is identical across both formats — the only difference is that
 * JSON holds custom field values as { fieldUuid: value } where the binary holds
 * [key, value] pairs, so that one field gets adapted here.
 */
export const ampersandJsonToPreview = (d: any, fallbackSystemName: string) => {
  const db = d?.database || {};
  const systems: any[] = Array.isArray(db.systems) ? db.systems : [];
  const defaultId = String(d?.config?.appConfig?.defaultSystem || '');
  const systemRow = systems.find((s: any) => String(s?.uuid) === defaultId) || systems[0] || {name: fallbackSystemName};
  const members = (Array.isArray(db.members) ? db.members : [])
    // ALL systems are kept. We used to filter to defaultSystem, which silently
    // DROPPED every other system's members — real data loss for multi-system
    // users. Each Ampersand system becomes a group instead (confirm step), so
    // nothing merges into an indistinguishable pile and nothing is lost.
    .filter((a: any) => !!a)
    .map((a: any) => ({
      ...a,
      customFields: {value: Object.entries(a.customFields && typeof a.customFields === 'object' ? a.customFields : {})},
    }));
  return {
    system: systemRow,
    systems,
    members,
    switches: Array.isArray(db.frontingEntries) ? db.frontingEntries : [],
    customFields: Array.isArray(db.customFields) ? db.customFields : [],
  };
};

export const handleAmpersandPick = async (ctx: AmpersandCtx) => {
  const {setRestoreError, setExtPreview, setImportStatus, setImportMsg, t, setImportSource} = ctx;
    setRestoreError(''); setExtPreview(null); setImportStatus('idle'); setImportMsg('');
    try {
      const [res] = await safePick({type: ['*/*']});
      if (!res) return;
      const path = getPickedFilePath(res);
      // Ampersand's JSON export is the format their dev recommends — the binary
      // one changes shape every few releases. Try text first; a binary file just
      // fails JSON.parse and falls through to the old decoder.
      let jsonDb: any = null;
      try {
        let txt: string;
        try { txt = await ReactNativeBlobUtil.fs.readFile(path, 'utf8'); }
        catch { txt = await ReactNativeBlobUtil.fs.readFile(res.uri || path, 'utf8'); }
        const parsed = JSON.parse(txt);
        if (parsed && parsed.database && Array.isArray(parsed.database.members)) jsonDb = parsed;
      } catch {}
      if (jsonDb) {
        const prev = ampersandJsonToPreview(jsonDb, t('share.system'));
        if (prev.members.length === 0 && prev.switches.length === 0) throw new Error(t('share.amparEmpty'));
        setExtPreview(prev);
        setImportSource('ampersand');
        return;
      }
      // The binary .ampar/.ampdb format is DEFUNCT here: Ampersand's developer
      // reshapes it every few releases, so parsing it was a standing liability.
      // Their JSON export is the supported path and the only one we accept.
      throw new Error(t('share.ampersandNeedsJson', {
        defaultValue: "That isn't an Ampersand JSON export. In Ampersand, use Export your data and pick the JSON file.",
      }));
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
          // Ampersand keeps `age` on the member itself; we have no native age,
          // so it becomes an "Age" custom field instead of being dropped. The
          // name is deliberately NOT localized: customFieldDefs sync across
          // devices/platforms, and Desktop dedupes defs by name — a translated
          // name here and a plain one there would double the field.
          let ageFieldId = '';
          if (extSel.customFields) {
            const defs: CustomFieldDef[] = amFields.map((f: any, i: number) => {
              const localId = uid();
              fieldIdMap[String(f.uuid)] = localId;
              return {id: localId, name: String(f.name || `Field ${i + 1}`), type: 'text', sortOrder: f.priority ?? i};
            });
            const hasAge = amMembers.some((a: any) => a?.age != null && String(a.age).trim() !== '');
            if (hasAge && !defs.some(d => d.name.toLowerCase() === 'age')) {
              ageFieldId = uid();
              defs.push({id: ageFieldId, name: 'Age', type: 'text', sortOrder: defs.length});
            }
            await store.set(KEYS.customFieldDefs, defs);
          }

          // Every Ampersand system becomes a group when the export holds more
          // than one, so multi-system rosters stay tellable-apart. A single
          // system needs no group — that is just the roster.
          const amSystems: any[] = Array.isArray(extPreview.systems) ? extPreview.systems : [];
          const sysGroupMap: Record<string, string> = {};
          if (extSel.members && amSystems.length > 1) {
            const existingGroups = await store.get<MemberGroup[]>(KEYS.groups, []) || [];
            const newGroups: MemberGroup[] = [];
            amSystems.forEach((sy: any, i: number) => {
              const sName = (sy?.name && String(sy.name).trim()) || `System ${i + 1}`;
              const existing = existingGroups.find(eg => eg.name.toLowerCase() === sName.toLowerCase());
              const localId = existing ? existing.id : uid();
              if (!existing) newGroups.push({id: localId, name: sName, sourceId: 'amp:sys:' + String(sy?.uuid || i)});
              if (sy?.uuid != null) sysGroupMap[String(sy.uuid)] = localId;
            });
            if (newGroups.length > 0) await store.set(KEYS.groups, [...existingGroups, ...newGroups]);
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
                  if (!fid || pair[1] == null || pair[1] === '') return;
                  cf.push({fieldId: fid, value: (typeof pair[1] === 'object' ? JSON.stringify(pair[1]) : String(pair[1])) as any});
                });
              }
              if (ageFieldId && a.age != null && String(a.age).trim() !== '') {
                cf.push({fieldId: ageFieldId, value: String(a.age) as any});
              }
              return {
                id: localId, sourceId: 'amp:' + String(a.uuid),
                name: (a.name && String(a.name).trim()) || 'Unnamed member',
                // role only exists in the JSON export; the binary path leaves it blank.
                pronouns: String(a.pronouns || ''), role: String(a.role || ''), color: normHex(a.color),
                description: String(a.description || ''), archived: !!a.isArchived, isCustomFront: !!a.isCustomFront,
                tags: [], customFields: cf,
                groupIds: a.system != null && sysGroupMap[String(a.system)] ? [sysGroupMap[String(a.system)]] : [],
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
