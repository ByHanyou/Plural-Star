import {Alert} from 'react-native';
import type {TFunction} from 'i18next';
import {Member, MemberGroup, SystemInfo, HistoryEntry, CustomFieldDef, CustomFieldType, CustomFieldValue, uid} from '../utils';
import {store, KEYS} from '../storage';
import {saveBannerFromUrl} from '../utils/mediaUtils';
import {parallelMap} from '../utils/concurrency';
import {normalizeSpAvatarUrl, spAvatarCandidates, downloadFirstAvatar} from './spApi';
import {convertSPSwitches, convertPKSwitches, finalizeMemberReplace} from './convert';
import {applyImportedHistory} from './restore';

export type ExtApplyCtx = {
  extPreview: any;
  importSource: string;
  extSel: Record<string, boolean>;
  system: SystemInfo;
  members: Member[];
  history: HistoryEntry[];
  t: TFunction;
  setRestoreProgress: any;
  setExtPreview: any;
  setExtToken: any;
  onDataImported: () => void;
};

export const handleExtImport = (ctx: ExtApplyCtx) => {
  const {extPreview, importSource, extSel, system, members, t, setRestoreProgress, setExtPreview, setExtToken, onDataImported} = ctx;
    if (!extPreview) return;
    const isPK = importSource === 'pluralkit';
    Alert.alert(t('share.importData'), t('share.importAddDataMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('share.importBtn'), onPress: async () => {
        try {
        if (extSel.system && extPreview.system) {
          const name = isPK ? extPreview.system.name : (extPreview.system.content?.username || extPreview.system.content?.name || extPreview.system.username || extPreview.system.name || system.name);
          const desc = isPK ? (extPreview.system.description || system.description) : (extPreview.system.content?.desc || extPreview.system.content?.description || extPreview.system.description || system.description);
          await store.set(KEYS.system, {...system, name: name || system.name, description: desc});
        }
        const idMap: Record<string, string> = {};
        if (extSel.members && extPreview.members.length > 0) {
          const merged: Member[] = [...members];
          extPreview.members.forEach((m: any) => {
            const extId: string = isPK ? (m.uuid || m.id) : m._id || m.id;
            const incoming: Partial<Member> = {
              name: isPK ? ((extSel.displayNames ? (m.display_name || m.name) : (m.name || m.display_name)) || 'Unknown') : (m.content?.name || m.name || 'Unknown'),
              pronouns: isPK ? (m.pronouns || '') : (m.content?.pronouns || ''),
              color: isPK ? (m.color ? `#${m.color}` : '#DAA520') : (m.content?.color || '#DAA520'),
              description: isPK ? (m.description || '') : (m.content?.desc || ''),
              archived: !isPK && !!m.content?.archived ? true : undefined,
            };
            if (!isPK) incoming.role = m.content?.role || '';
            if (isPK) {
              if (Array.isArray(m.proxy_tags)) incoming.pkProxyTags = m.proxy_tags;
              if (typeof m.avatar_url === 'string' && m.avatar_url) incoming.pkAvatarUrl = m.avatar_url;
              if (typeof m.banner === 'string' && m.banner) incoming.pkBannerUrl = m.banner;
              if (typeof m.keep_proxy === 'boolean') incoming.pkKeepProxy = m.keep_proxy;
            }
            if (extId) {
              const idx = merged.findIndex(em => em.sourceId === extId);
              if (idx >= 0) {
                merged[idx] = {...merged[idx], ...incoming, sourceId: extId};
                idMap[extId] = merged[idx].id;
                if (isPK && m.id && m.id !== extId) idMap[m.id] = merged[idx].id;
                return;
              }
              const lowerName = String(incoming.name).toLowerCase();
              const idx2 = merged.findIndex(em => !em.sourceId && em.name.toLowerCase() === lowerName);
              if (idx2 >= 0) {
                merged[idx2] = {...merged[idx2], ...incoming, sourceId: extId};
                idMap[extId] = merged[idx2].id;
                if (isPK && m.id && m.id !== extId) idMap[m.id] = merged[idx2].id;
                return;
              }
            }
            const newId = uid();
            merged.push({
              id: newId,
              name: incoming.name as string,
              pronouns: incoming.pronouns as string,
              role: (incoming.role as string) ?? '',
              color: incoming.color as string,
              description: incoming.description as string,
              archived: incoming.archived,
              sourceId: extId,
            });
            if (extId) idMap[extId] = newId;
            if (isPK && m.id && m.id !== extId) idMap[m.id] = newId;
          });
          await store.set(KEYS.members, finalizeMemberReplace(merged, idMap));
          const avatarCandidates: Record<string, string[]> = {};
          if (extSel.avatars) {
            const spFallbackUid = String((extPreview.system && (extPreview.system.id || extPreview.system.uid || extPreview.system.content?.uid)) || extPreview.members.find((x: any) => x.content?.uid || x.uid)?.content?.uid || extPreview.members.find((x: any) => x.uid)?.uid || '');
            extPreview.members.forEach((m: any) => {
              const extId: string = isPK ? (m.uuid || m.id) : m._id || m.id;
              const localId = extId ? idMap[extId] : undefined;
              if (!localId) return;
              if (isPK) {
                const u = normalizeSpAvatarUrl(m.avatar_url);
                if (u) avatarCandidates[localId] = [u];
              } else {
                const cands = spAvatarCandidates(m.content || m, spFallbackUid);
                if (cands.length) avatarCandidates[localId] = cands;
              }
            });
          }
          const avatarEntries = Object.entries(avatarCandidates);
          if (avatarEntries.length > 0) {
            setRestoreProgress(t('share.progressAvatarsDownload'));
            const avatarResults: Record<string, string> = {};
            await parallelMap(avatarEntries, async ([memberId, urls]) => {
              const avatar = await downloadFirstAvatar(memberId, urls as string[]);
              if (avatar) avatarResults[memberId] = avatar;
            }, 4, (done, total) => setRestoreProgress(t('share.progressAvatarsDownloadN', {done, total})));
            const withAvatars = finalizeMemberReplace(merged, idMap).map(m => avatarResults[m.id] ? {...m, avatar: avatarResults[m.id]} : m);
            await store.set(KEYS.members, withAvatars);
            const avOk = Object.keys(avatarResults).length;
            if (avOk < avatarEntries.length) Alert.alert(t('share.profilePictures'), t('share.avatarsDownloaded', {done: avOk, total: avatarEntries.length}));
          }
          if (isPK && extSel.banners) {
            const bannerUrls: Record<string, string> = {};
            extPreview.members.forEach((m: any) => {
              const url = m.banner || '';
              if (!url || !url.startsWith('http')) return;
              const extId: string = m.uuid || m.id;
              const localId = extId ? idMap[extId] : undefined;
              if (localId) bannerUrls[localId] = url;
            });
            const bannerEntries = Object.entries(bannerUrls);
            if (bannerEntries.length > 0) {
              setRestoreProgress(t('share.progressBannersDownload'));
              const bannerResults: Record<string, string> = {};
              await parallelMap(bannerEntries, async ([memberId, url]) => {
                const banner = await saveBannerFromUrl(memberId, url).catch(() => undefined);
                if (banner) bannerResults[memberId] = banner;
              }, 4, (done, total) => setRestoreProgress(t('share.progressBannersDownloadN', {done, total})));
              if (Object.keys(bannerResults).length > 0) {
                const currentMembers = await store.get<Member[]>(KEYS.members) || [];
                const withBanners = currentMembers.map(m => bannerResults[m.id] ? {...m, banner: bannerResults[m.id]} : m);
                await store.set(KEYS.members, withBanners);
              }
            }
          }
          if (!isPK && extSel.customFields && extPreview.customFields && extPreview.customFields.length > 0) {
            const SP_TYPE_MAP: Record<string, CustomFieldType> = {'0': 'text', '1': 'color', '2': 'date', '3': 'month', '4': 'year', '5': 'monthYear', '6': 'timestamp', '7': 'monthDay', 'text': 'text', 'number': 'number', 'checkbox': 'toggle', 'toggle': 'toggle', 'date': 'date', 'markdown': 'markdown'};
            const normId = (raw: any): string => {
              if (raw == null) return '';
              if (typeof raw === 'string') return raw;
              if (typeof raw === 'number') return String(raw);
              if (typeof raw === 'object') {
                if (typeof raw.$oid === 'string') return raw.$oid;
                if (typeof raw._id === 'string') return raw._id;
                if (typeof raw.id === 'string') return raw.id;
                if (typeof raw.toString === 'function') {
                  const s = raw.toString();
                  if (s && s !== '[object Object]') return s;
                }
              }
              return '';
            };
            const existingDefs = await store.get<CustomFieldDef[]>(KEYS.customFieldDefs, []) || [];
            const fieldIdMap: Record<string, string> = {};
            const fieldNameMap: Record<string, string> = {};
            const newDefs: CustomFieldDef[] = [];
            const cfIdDiag: string[] = [];
            extPreview.customFields.forEach((cf: any, i: number) => {
              const candidates = [
                cf.id, cf.uuid, cf._id,
                cf.content?._id, cf.content?.id, cf.content?.uuid,
                cf.content?.order, cf.order,
                String(i),
              ];
              const spIds = candidates.map(normId).filter(Boolean);
              const spName = cf.content?.name || cf.name || `Field ${i + 1}`;
              const spType = cf.content?.type ?? cf.type;
              const existing = existingDefs.find(d => d.name.toLowerCase() === String(spName).toLowerCase());
              let localId: string;
              if (existing) {
                localId = existing.id;
              } else {
                localId = uid();
                newDefs.push({id: localId, name: String(spName), type: SP_TYPE_MAP[String(spType)] || 'text', sortOrder: cf.content?.order ?? i});
              }
              spIds.forEach(k => { fieldIdMap[k] = localId; });
              fieldNameMap[String(spName).toLowerCase().trim()] = localId;
              cfIdDiag.push(`${spName}:[${spIds.join('|')}]`);
            });
            if (newDefs.length > 0) {
              await store.set(KEYS.customFieldDefs, [...existingDefs, ...newDefs]);
            }
            const currentMembers = await store.get<Member[]>(KEYS.members, []) || [];
            let diagLogged = 0;
            let membersMatched = 0;
            let membersWithInfo = 0;
            let totalInfoKeys = 0;
            let matchedKeys = 0;
            const unmatchedKeySamples = new Set<string>();
            const updatedMembers = currentMembers.map(lm => {
              const spMember = extPreview.members.find((sm: any) => {
                const eid = isPK ? (sm.uuid || sm.id) : (sm._id || sm.id);
                return eid && idMap[normId(eid)] === lm.id;
              });
              if (!spMember) return lm;
              membersMatched++;
              const info =
                spMember.content?.info ||
                spMember.info ||
                spMember.content?.fields ||
                spMember.fields ||
                spMember.content?.customFields ||
                spMember.customFields;
              if (!info || typeof info !== 'object') return lm;
              membersWithInfo++;
              const existingCF: CustomFieldValue[] = lm.customFields || [];
              const newCF: CustomFieldValue[] = [...existingCF];
              const entries = Object.entries(info);
              totalInfoKeys += entries.length;
              if (diagLogged < 2) {
                const memberName = spMember.content?.name || spMember.name || '(unknown)';
                const infoKeys = entries.map(([k]) => k);
                const infoShapes = entries.slice(0, 3).map(([k, v]) => `${k}=${typeof v}${v && typeof v === 'object' ? `(keys:${Object.keys(v as any).join(',')})` : ''}`);
                console.log(`[CF-IMPORT] member="${memberName}" infoKeys=[${infoKeys.join(',')}] shapes=[${infoShapes.join(' ')}] cfMap=[${cfIdDiag.join(' ')}]`);
                diagLogged++;
              }
              entries.forEach(([spFieldId, rawValue]) => {
                const norm = normId(spFieldId);
                const localFieldId =
                  fieldIdMap[norm] ||
                  fieldIdMap[spFieldId] ||
                  fieldNameMap[String(spFieldId).toLowerCase().trim()];
                if (!localFieldId) {
                  if (unmatchedKeySamples.size < 6) unmatchedKeySamples.add(spFieldId);
                  return;
                }
                let value: any = rawValue;
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                  if ('value' in value) value = (value as any).value;
                  else if ('content' in value && typeof (value as any).content === 'object' && 'value' in (value as any).content) value = (value as any).content.value;
                }
                if (value == null) return;
                const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
                if (valStr === '') return;
                const existingIdx = newCF.findIndex(cv => cv.fieldId === localFieldId);
                if (existingIdx >= 0) newCF[existingIdx] = {fieldId: localFieldId, value: valStr as any};
                else newCF.push({fieldId: localFieldId, value: valStr as any});
                matchedKeys++;
              });
              return {...lm, customFields: newCF};
            });
            console.log(`[CF-IMPORT] matched=${membersMatched}/${currentMembers.length} withInfo=${membersWithInfo} totalKeys=${totalInfoKeys} written=${matchedKeys} unmatchedSamples=[${[...unmatchedKeySamples].join(',')}]`);
            await store.set(KEYS.members, updatedMembers);

            const suspicious = (membersWithInfo > 0 && matchedKeys === 0) ||
                               (membersMatched > 0 && membersWithInfo === 0);
            if (suspicious) {
              const sampleStr = [...unmatchedKeySamples].slice(0, 5).join(', ');
              const lines = [
                t('share.cfMatched', {matched: membersMatched, total: currentMembers.length}),
                t('share.cfWithInfo', {count: membersWithInfo}),
                t('share.cfKeys', {seen: totalInfoKeys, written: matchedKeys}),
                membersWithInfo === 0
                  ? t('share.cfNoData')
                  : t('share.cfUnmatched', {count: totalInfoKeys - matchedKeys, samples: sampleStr || '—'}),
              ];
              Alert.alert(t('share.cfPartialTitle'), lines.join('\n\n'));
            }
          }
          if (extSel.groups && extPreview.groups && extPreview.groups.length > 0) {
            const existingGroups = await store.get<MemberGroup[]>(KEYS.groups, []) || [];
            const mergedGroups: MemberGroup[] = [...existingGroups];
            let groupsChanged = false;
            const groupIdMap: Record<string, string> = {};
            const groupMemberMap: Record<string, string[]> = {};
            extPreview.groups.forEach((g: any) => {
              const gName = isPK ? (g.name || g.display_name || 'Group') : (g.content?.name || g.name || 'Group');
              const gColor = isPK ? (g.color ? `#${g.color}` : undefined) : (g.content?.color || undefined);
              const externalId = isPK ? (g.uuid || g.id) : (g.id || g._id);
              const externalMembers: string[] = isPK
                ? (Array.isArray(g.members) ? g.members : [])
                : (Array.isArray(g.content?.members) ? g.content.members : (Array.isArray(g.members) ? g.members : []));
              if (!gName || !externalId) return;
              const srcId = `${isPK ? 'pk' : 'ext'}:${externalId}`;
              const bySource = mergedGroups.findIndex(eg => eg.sourceId === srcId);
              const byName = bySource < 0 ? mergedGroups.findIndex(eg => !eg.sourceId && eg.name.toLowerCase() === gName.toLowerCase()) : -1;
              const idx = bySource >= 0 ? bySource : byName;
              let localId: string;
              if (idx >= 0) {
                localId = mergedGroups[idx].id;
                mergedGroups[idx] = {...mergedGroups[idx], name: gName, color: gColor ?? mergedGroups[idx].color, sourceId: srcId};
                groupsChanged = true;
              } else {
                localId = uid();
                mergedGroups.push({id: localId, name: gName, color: gColor, sourceId: srcId});
                groupsChanged = true;
              }
              groupIdMap[externalId] = localId;
              groupMemberMap[localId] = externalMembers;
            });
            if (groupsChanged) await store.set(KEYS.groups, mergedGroups);
            if (Object.keys(groupMemberMap).length > 0) {
              const currentMembers = await store.get<Member[]>(KEYS.members, []) || [];
              const memberLocalIdsByGroup: Record<string, Set<string>> = {};
              for (const [localGroupId, externalMemberIds] of Object.entries(groupMemberMap)) {
                memberLocalIdsByGroup[localGroupId] = new Set(
                  externalMemberIds.map(eid => idMap[eid]).filter(Boolean) as string[]
                );
              }
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
          if (extSel.frontHistory && extPreview.switches.length > 0) {
            const newH = isPK ? convertPKSwitches(extPreview.switches, idMap) : convertSPSwitches(extPreview.switches, idMap);
            await applyImportedHistory(newH, ctx);
          }
        } else if (extSel.frontHistory && extPreview.switches.length > 0) {
          const existingIdMap: Record<string, string> = {};
          extPreview.members.forEach((m: any) => {
            const eid: string = isPK ? (m.uuid || m.id) : (m._id || m.id);
            if (!eid) return;
            const bySource = members.find(l => l.sourceId === eid);
            if (bySource) {
              existingIdMap[eid] = bySource.id;
              if (isPK && m.id && m.id !== eid) existingIdMap[m.id] = bySource.id;
              return;
            }
            const name = isPK ? (m.name || m.display_name || '') : (m.content?.name || m.name || '');
            const lm = members.find(l => l.name.toLowerCase() === String(name).toLowerCase());
            if (lm) {
              existingIdMap[eid] = lm.id;
              if (isPK && m.id && m.id !== eid) existingIdMap[m.id] = lm.id;
            }
          });
          const newH = isPK ? convertPKSwitches(extPreview.switches, existingIdMap) : convertSPSwitches(extPreview.switches, existingIdMap);
          await applyImportedHistory(newH, ctx);
        }
        setRestoreProgress('');
        setExtPreview(null); setExtToken(''); setTimeout(() => onDataImported(), 500);
        } catch (e: any) {
          setRestoreProgress('');
          console.error('[EXT-IMPORT] failed:', e);
          Alert.alert(t('share.importFailed'), t('share.importPartialError', {error: e?.message || String(e)}));
        }
      }},
    ]);
  };
