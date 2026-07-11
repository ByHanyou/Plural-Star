import {Alert} from 'react-native';
import type {TFunction} from 'i18next';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {Member, MemberGroup, SystemInfo, HistoryEntry, CustomFieldDef, CustomFieldType, CustomFieldValue, uid} from '../utils';
import {store, KEYS} from '../storage';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import {convertSPSwitches, normHex, finalizeMemberReplace} from './convert';
import {spAvatarCandidates, downloadFirstAvatar} from './spApi';
import {applyImportedHistory} from './restore';

export type SPFileCtx = {
  extPreview: any;
  extSel: Record<string, boolean>;
  system: SystemInfo;
  members: Member[];
  history: HistoryEntry[];
  t: TFunction;
  setExtPreview: any;
  setImportSource: any;
  onDataImported: () => void;
};

export const handleSPFileImport = async (ctx: SPFileCtx) => {
  const {t, setExtPreview, setImportSource} = ctx;
    try {
      const [res] = await safePick({type: ['application/json', 'text/plain']});
      if (!res) return;
      const content = await ReactNativeBlobUtil.fs.readFile(getPickedFilePath(res), 'utf8');
      const data = JSON.parse(content);
      if (!data.members && !data.frontHistory && !data.users) {
        Alert.alert(t('share.importFailed'), t('share.notValidSPExport'));
        return;
      }
      const spMembers = Array.isArray(data.members) ? data.members : [];
      const spHistory = Array.isArray(data.frontHistory) ? data.frontHistory : [];
      const spUsers = Array.isArray(data.users) ? data.users : [];
      const spGroups = Array.isArray(data.groups) ? data.groups : [];
      const spCustomFields = Array.isArray(data.customFields) ? data.customFields : [];
      const systemInfo = spUsers[0] || {};
      const sanitized = spMembers.map((m: any) => {
        if (m?.name) m.name = String(m.name).replace(/[-\u001F\u007F]/g, '').trim();
        return m;
      });
      setExtPreview({system: {content: systemInfo}, members: sanitized, switches: spHistory, groups: spGroups, customFields: spCustomFields});
      setImportSource('spfile');
    } catch (e: any) {
      if (!isPickerCancel(e)) Alert.alert(t('share.importFailed'), e.message || '');
    }
  };

export const handleSPFileConfirmImport = (ctx: SPFileCtx) => {
  const {extPreview, extSel, system, members, t, setExtPreview, onDataImported} = ctx;
    if (!extPreview) return;
    Alert.alert(t('share.importData'), t('share.importAddDataMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('share.importBtn'), onPress: async () => {
        const spMembers = extPreview.members;
        const spHistory = extPreview.switches;
        const sysData = extPreview.system?.content || extPreview.system || {};
        if (extSel.system && sysData) {
          const name = sysData.username || sysData.name || system.name;
          const desc = sysData.desc || sysData.description || system.description;
          await store.set(KEYS.system, {...system, name: name || system.name, description: desc});
        }
        const idMap: Record<string, string> = {};
        if (extSel.members && spMembers.length > 0) {
          const merged: Member[] = [...members];
          spMembers.forEach((m: any) => {
            const spId: string | undefined = m._id;
            const incoming: Partial<Member> = {
              name: m.name || 'Unknown',
              pronouns: m.pronouns || '',
              role: '',
              color: normHex(m.color),
              description: m.desc || '',
              archived: !!m.archived,
            };
            if (spId) {
              const idx = merged.findIndex(em => em.sourceId === spId);
              if (idx >= 0) {
                merged[idx] = {...merged[idx], ...incoming, sourceId: spId};
                idMap[spId] = merged[idx].id;
                return;
              }
              const lowerName = String(incoming.name).toLowerCase();
              const idx2 = merged.findIndex(em => !em.sourceId && em.name.toLowerCase() === lowerName);
              if (idx2 >= 0) {
                merged[idx2] = {...merged[idx2], ...incoming, sourceId: spId};
                idMap[spId] = merged[idx2].id;
                return;
              }
            }
            const newId = uid();
            merged.push({
              id: newId,
              name: incoming.name as string,
              pronouns: incoming.pronouns as string,
              role: incoming.role as string,
              color: incoming.color as string,
              description: incoming.description as string,
              archived: incoming.archived,
              sourceId: spId,
            });
            if (spId) idMap[spId] = newId;
          });
          await store.set(KEYS.members, finalizeMemberReplace(merged, idMap));
          const avatarUrls: Record<string, string[]> = {};
          if (extSel.avatars) {
            const spFallbackUid = String(spMembers.find((x: any) => x.uid)?.uid || '');
            spMembers.forEach((m: any) => {
              const localId = m._id ? idMap[m._id] : undefined;
              if (!localId) return;
              const cands = spAvatarCandidates(m, spFallbackUid);
              if (cands.length) avatarUrls[localId] = cands;
            });
          }
          const avatarEntries = Object.entries(avatarUrls);
          if (avatarEntries.length > 0) {
            const withAvatars = [...merged];
            for (const [memberId, urls] of avatarEntries) {
              const avatar = await downloadFirstAvatar(memberId, urls as string[]);
              if (avatar) {
                const idx = withAvatars.findIndex(m => m.id === memberId);
                if (idx >= 0) withAvatars[idx] = {...withAvatars[idx], avatar};
              }
            }
            await store.set(KEYS.members, withAvatars);
          }
          if (extSel.customFields && extPreview.customFields && extPreview.customFields.length > 0) {
            const SP_TYPE_MAP: Record<string, CustomFieldType> = {'0': 'text', '1': 'color', '2': 'date', '3': 'month', '4': 'year', '5': 'monthYear', '6': 'timestamp', '7': 'monthDay', 'text': 'text', 'number': 'number', 'checkbox': 'toggle', 'toggle': 'toggle', 'date': 'date', 'markdown': 'markdown'};
            const normId = (raw: any): string => {
              if (raw == null) return '';
              if (typeof raw === 'string') return raw;
              if (typeof raw === 'number') return String(raw);
              if (typeof raw === 'object') {
                if (typeof raw.$oid === 'string') return raw.$oid;
                if (typeof raw._id === 'string') return raw._id;
                if (typeof raw.id === 'string') return raw.id;
              }
              return '';
            };
            const existingDefs = await store.get<CustomFieldDef[]>(KEYS.customFieldDefs, []) || [];
            const fieldIdMap: Record<string, string> = {};
            const newDefs: CustomFieldDef[] = [];
            extPreview.customFields.forEach((cf: any, i: number) => {
              const candidates = [cf.id, cf.uuid, cf._id];
              const spIds = candidates.map(normId).filter(Boolean);
              const spName = cf.name || `Field ${i + 1}`;
              const spType = cf.type;
              const existing = existingDefs.find(d => d.name.toLowerCase() === String(spName).toLowerCase());
              let localId: string;
              if (existing) {
                localId = existing.id;
              } else {
                localId = uid();
                newDefs.push({id: localId, name: String(spName), type: SP_TYPE_MAP[String(spType)] || 'text', sortOrder: cf.order ?? i});
              }
              spIds.forEach(k => { fieldIdMap[k] = localId; });
            });
            if (newDefs.length > 0) {
              await store.set(KEYS.customFieldDefs, [...existingDefs, ...newDefs]);
            }
            const currentMembers = await store.get<Member[]>(KEYS.members, []) || [];
            const updatedMembers = currentMembers.map(lm => {
              const spMember = spMembers.find((sm: any) => sm._id && idMap[sm._id] === lm.id);
              if (!spMember) return lm;
              const info = spMember.info;
              if (!info || typeof info !== 'object') return lm;
              const existingCF: CustomFieldValue[] = lm.customFields || [];
              const newCF: CustomFieldValue[] = [...existingCF];
              Object.entries(info).forEach(([spFieldId, rawValue]) => {
                const localFieldId = fieldIdMap[normId(spFieldId)] || fieldIdMap[spFieldId];
                if (!localFieldId) return;
                let value: any = rawValue;
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                  if ('value' in value) value = (value as any).value;
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
          if (extSel.frontHistory && spHistory.length > 0) {
            const newH = convertSPSwitches(spHistory.map((sh: any) => ({content: sh, ...sh})), idMap);
            await applyImportedHistory(newH, ctx);
          }
          if (extSel.groups && extPreview.groups && extPreview.groups.length > 0) {
            const existingGroups = await store.get<MemberGroup[]>(KEYS.groups, []) || [];
            const newGroups: MemberGroup[] = [];
            const groupMemberMap: Record<string, string[]> = {};
            extPreview.groups.forEach((g: any) => {
              const gName = g.name || 'Group';
              const gColor = g.color || undefined;
              const externalId = g._id || g.id;
              const externalMembers: string[] = Array.isArray(g.members) ? g.members : [];
              if (!gName || !externalId) return;
              const existing = existingGroups.find(eg => eg.name.toLowerCase() === gName.toLowerCase());
              const localId = existing ? existing.id : uid();
              if (!existing) newGroups.push({id: localId, name: gName, color: gColor});
              groupMemberMap[localId] = externalMembers;
            });
            if (newGroups.length > 0) await store.set(KEYS.groups, [...existingGroups, ...newGroups]);
            const memberLocalIdsByGroup: Record<string, Set<string>> = {};
            for (const [localGroupId, externalMemberIds] of Object.entries(groupMemberMap)) {
              memberLocalIdsByGroup[localGroupId] = new Set(
                externalMemberIds.map(eid => idMap[eid]).filter(Boolean) as string[]
              );
            }
            const currentMembers = await store.get<Member[]>(KEYS.members, []) || [];
            const updatedMembers = currentMembers.map(lm => {
              const additions: string[] = [];
              for (const [localGroupId, localMemberSet] of Object.entries(memberLocalIdsByGroup)) {
                if (localMemberSet.has(lm.id) && !(lm.groupIds || []).includes(localGroupId)) {
                  additions.push(localGroupId);
                }
              }
              if (additions.length === 0) return lm;
              return {...lm, groupIds: [...(lm.groupIds || []), ...additions]};
            });
            await store.set(KEYS.members, updatedMembers);
          }
        }
        setExtPreview(null);
        setTimeout(() => onDataImported(), 500);
      }},
    ]);
  };
