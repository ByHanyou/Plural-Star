import {Alert} from 'react-native';
import {log} from '../utils/log';
import {importNameKey} from './importNames';
import {importErrorText} from './importError';
import type {TFunction} from 'i18next';
import {Member, MemberGroup, SystemInfo, HistoryEntry, CustomFieldDef, CustomFieldValue, withFieldValue, blankMember, uid} from '../utils';
import {store, KEYS} from '../storage';
import {saveBannerFromUrl} from '../utils/mediaUtils';
import {parallelMap} from '../utils/concurrency';
import {normalizeSpAvatarUrl, spAvatarCandidates, downloadFirstAvatar} from './spApi';
import {convertSPSwitches, convertPKSwitches, finalizeMemberReplace, mergeForeignMember, mergeMediaIntoMembers, normHex, getStoredList, getStoredMembers, spFieldType, spFieldText, normId, localIds, ImportMode} from './convert';
import {confirmImport} from './confirm';
import {isImportStopped} from './progress';
import {applyImportedHistory} from './restoreCommon';
import type {SpFieldDoc} from './formats';
import type {ExtPreview, PluralKitPreview, SimplyPluralPreview} from './preview';

export type ExtApplyCtx = {
  extPreview: ExtPreview | null;
  extSel: Record<string, boolean>;
  importMode: ImportMode;
  system: SystemInfo;
  members: Member[];
  history: HistoryEntry[];
  t: TFunction;
  setRestoreProgress: (label: string) => void;
  setExtPreview: (p: ExtPreview | null) => void;
  setExtToken: (token: string) => void;
  onDataImported: () => void;
};

interface ExtMemberRow {
  extId: string;
  aliasId: string;
  matchName: string;
  incoming: Partial<Member>;
  avatarUrls: string[];
  bannerUrl: string;
  info: Record<string, unknown> | null;
}

interface ExtGroupRow {
  externalId: string;
  name: string;
  color: string | undefined;
  memberIds: string[];
}

interface ExtSource {
  isPK: boolean;
  systemName: string | undefined;
  systemDescription: string | undefined;
  members: ExtMemberRow[];
  groups: ExtGroupRow[];
  customFields: SpFieldDoc[];
  switchCount: number;
  convertSwitches: (idMap: ReadonlyMap<string, string>) => HistoryEntry[];
}

const pkSource = (p: PluralKitPreview, extSel: Record<string, boolean>, t: TFunction): ExtSource => ({
  isPK: true,
  systemName: p.system.name || undefined,
  systemDescription: p.system.description || undefined,
  members: p.members.map(m => {
    const extId = m.uuid || m.id || '';
    const incoming: Partial<Member> = {
      name: (extSel.displayNames ? (m.display_name || m.name) : (m.name || m.display_name)) || t('common.unknown'),
      pronouns: m.pronouns || '',
      color: normHex(m.color),
      description: m.description || '',
      archived: undefined,
    };
    if (Array.isArray(m.proxy_tags)) incoming.pkProxyTags = m.proxy_tags;
    if (typeof m.avatar_url === 'string' && m.avatar_url) incoming.pkAvatarUrl = m.avatar_url;
    if (typeof m.banner === 'string' && m.banner) incoming.pkBannerUrl = m.banner;
    if (typeof m.keep_proxy === 'boolean') incoming.pkKeepProxy = m.keep_proxy;
    if (extSel.pronouns === false) delete incoming.pronouns;
    const avatar = normalizeSpAvatarUrl(m.avatar_url);
    const banner = m.banner || '';
    return {
      extId,
      aliasId: m.id && m.id !== extId ? m.id : '',
      matchName: m.name || m.display_name || '',
      incoming,
      avatarUrls: avatar ? [avatar] : [],
      bannerUrl: banner.startsWith('http') ? banner : '',
      info: null,
    };
  }),
  groups: p.groups.map((g, i) => ({
    externalId: g.uuid || g.id || '',
    name: g.name || g.display_name || t('share.groupN', {n: i + 1}),
    color: g.color ? normHex(g.color) : undefined,
    memberIds: Array.isArray(g.members) ? g.members : [],
  })),
  customFields: [],
  switchCount: p.switches.length,
  convertSwitches: idMap => convertPKSwitches(p.switches, idMap),
});

const spSource = (p: SimplyPluralPreview, t: TFunction): ExtSource => {
  const sys = p.system;
  const spFallbackUid = String((sys.id || sys.uid || sys.content?.uid) || p.members.find(x => x.content?.uid || x.uid)?.content?.uid || p.members.find(x => x.uid)?.uid || '');
  return {
    isPK: false,
    systemName: sys.content?.username || sys.content?.name || sys.username || sys.name || undefined,
    systemDescription: sys.content?.desc || sys.content?.description || sys.description || undefined,
    members: p.members.map(m => {
      const extId = m._id || m.id || '';
      const c = m.content;
      const incoming: Partial<Member> = {
        name: c?.name || m.name || t('common.unknown'),
        pronouns: c?.pronouns || m.pronouns || '',
        color: normHex(c?.color || m.color),
        description: c?.desc || m.desc || '',
        archived: (c?.archived ?? m.archived) ? true : undefined,
        role: c?.role || m.role || '',
      };
      const info = c?.info || m.info || c?.fields || m.fields || c?.customFields || m.customFields;
      return {
        extId,
        aliasId: '',
        matchName: c?.name || m.name || '',
        incoming,
        avatarUrls: spAvatarCandidates(c || m, spFallbackUid),
        bannerUrl: '',
        info: info && typeof info === 'object' ? info : null,
      };
    }),
    groups: p.groups.map((g, i) => {
      const contentMembers = g.content?.members;
      return {
        externalId: g.id || g._id || '',
        name: g.content?.name || g.name || t('share.groupN', {n: i + 1}),
        color: g.content?.color || undefined,
        memberIds: Array.isArray(contentMembers) ? contentMembers : (Array.isArray(g.members) ? g.members : []),
      };
    }),
    customFields: p.customFields,
    switchCount: p.switches.length,
    convertSwitches: idMap => convertSPSwitches(p.switches, idMap),
  };
};

export const handleExtImport = (ctx: ExtApplyCtx) => {
  const {extPreview, extSel, importMode, system, members, t, setRestoreProgress, setExtPreview, setExtToken, onDataImported} = ctx;
  if (!extPreview) return;
  if (extPreview.source !== 'pluralkit' && extPreview.source !== 'spfile') return;
  const src = extPreview.source === 'pluralkit' ? pkSource(extPreview, extSel, t) : spSource(extPreview, t);
  const isPK = src.isPK;
  confirmImport(t, importMode, async () => {
    try {
      if (extSel.system) {
        await store.set(KEYS.system, {...system, name: src.systemName || system.name, description: src.systemDescription || system.description});
      }
      const idMap = new Map<string, string>();
      if (extSel.members && src.members.length > 0) {
        const merged: Member[] = [...members];
        src.members.forEach(row => {
          const {extId, aliasId, incoming} = row;
          if (extId) {
            const localId = mergeForeignMember(merged, idMap, extId, incoming);
            if (aliasId) idMap.set(aliasId, localId);
            return;
          }
          const created = blankMember(incoming);
          merged.push(created);
          if (aliasId) idMap.set(aliasId, created.id);
        });
        await store.set(KEYS.members, finalizeMemberReplace(merged, idMap, importMode));
        const avatarCandidates = new Map<string, string[]>();
        if (extSel.avatars) {
          src.members.forEach(row => {
            const localId = row.extId ? idMap.get(row.extId) : undefined;
            if (!localId || row.avatarUrls.length === 0) return;
            avatarCandidates.set(localId, row.avatarUrls);
          });
        }
        const avatarEntries = [...avatarCandidates];
        if (avatarEntries.length > 0) {
          setRestoreProgress(t('share.progressAvatarsDownload'));
          const avatarResults = new Map<string, string>();
          await parallelMap(avatarEntries, async ([memberId, urls]) => {
            const avatar = await downloadFirstAvatar(memberId, urls);
            if (avatar) avatarResults.set(memberId, avatar);
          }, 4, (done, total) => setRestoreProgress(t('share.progressAvatarsDownloadN', {done, total})));
          const withAvatars = mergeMediaIntoMembers(finalizeMemberReplace(merged, idMap, importMode), 'avatar', avatarResults);
          await store.set(KEYS.members, withAvatars);
          const avOk = avatarResults.size;
          if (avOk < avatarEntries.length) Alert.alert(t('share.profilePictures'), t('share.avatarsDownloaded', {done: avOk, total: avatarEntries.length}));
        }
        if (isPK && extSel.banners) {
          const bannerUrls = new Map<string, string>();
          src.members.forEach(row => {
            if (!row.bannerUrl) return;
            const localId = row.extId ? idMap.get(row.extId) : undefined;
            if (localId) bannerUrls.set(localId, row.bannerUrl);
          });
          const bannerEntries = [...bannerUrls];
          if (bannerEntries.length > 0) {
            setRestoreProgress(t('share.progressBannersDownload'));
            const bannerResults = new Map<string, string>();
            await parallelMap(bannerEntries, async ([memberId, url]) => {
              const banner = await saveBannerFromUrl(memberId, url);
              if (banner) bannerResults.set(memberId, banner);
            }, 4, (done, total) => setRestoreProgress(t('share.progressBannersDownloadN', {done, total})));
            if (bannerResults.size > 0) {
              await store.set(KEYS.members, mergeMediaIntoMembers(await getStoredMembers(), 'banner', bannerResults));
            }
          }
        }
        if (!isPK && extSel.customFields && src.customFields.length > 0) {
          const existingDefs = await getStoredList<CustomFieldDef>(KEYS.customFieldDefs);
          const fieldIdMap = new Map<string, string>();
          const fieldNameMap = new Map<string, string>();
          const newDefs: CustomFieldDef[] = [];
          src.customFields.forEach((cf, i) => {
            const candidates = [
              cf.id, cf.uuid, cf._id,
              cf.content?._id, cf.content?.id, cf.content?.uuid,
              cf.content?.order, cf.order,
              String(i),
            ];
            const spIds = candidates.map(normId).filter(Boolean);
            const spName = cf.content?.name || cf.name || t('share.fieldN', {n: i + 1});
            const spType = cf.content?.type ?? cf.type;
            const existing = existingDefs.find(d => importNameKey(d.name) === importNameKey(spName));
            const localId = existing?.id ?? uid();
            if (!existing) newDefs.push({id: localId, name: String(spName), type: spFieldType(spType), sortOrder: cf.content?.order ?? i});
            spIds.forEach(k => fieldIdMap.set(k, localId));
            fieldNameMap.set(String(spName).toLowerCase().trim(), localId);
          });
          if (newDefs.length > 0) {
            await store.set(KEYS.customFieldDefs, [...existingDefs, ...newDefs]);
          }
          const currentMembers = await getStoredMembers();
          let membersMatched = 0;
          let membersWithInfo = 0;
          let totalInfoKeys = 0;
          let matchedKeys = 0;
          const unmatchedKeySamples = new Set<string>();
          const updatedMembers = currentMembers.map(lm => {
            const row = src.members.find(r => r.extId && idMap.get(normId(r.extId)) === lm.id);
            if (!row) return lm;
            membersMatched++;
            const info = row.info;
            if (!info) return lm;
            membersWithInfo++;
            let newCF: CustomFieldValue[] = lm.customFields || [];
            const entries = Object.entries(info);
            totalInfoKeys += entries.length;
            entries.forEach(([spFieldId, rawValue]) => {
              const localFieldId =
                fieldIdMap.get(normId(spFieldId)) ||
                fieldIdMap.get(spFieldId) ||
                fieldNameMap.get(String(spFieldId).toLowerCase().trim());
              if (!localFieldId) {
                if (unmatchedKeySamples.size < 6) unmatchedKeySamples.add(spFieldId);
                return;
              }
              const text = spFieldText(rawValue);
              if (text === null) return;
              newCF = withFieldValue(newCF, localFieldId, text);
              matchedKeys++;
            });
            return {...lm, customFields: newCF};
          });
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
                : t('share.cfUnmatched', {count: totalInfoKeys - matchedKeys, samples: sampleStr || '-'}),
            ];
            Alert.alert(t('share.cfPartialTitle'), lines.join('\n\n'));
          }
        }
        if (extSel.groups && src.groups.length > 0) {
          const existingGroups = await getStoredList<MemberGroup>(KEYS.groups);
          const mergedGroups: MemberGroup[] = [...existingGroups];
          let groupsChanged = false;
          const groupMemberMap = new Map<string, string[]>();
          src.groups.forEach(g => {
            const {externalId, name: gName, color: gColor, memberIds: externalMembers} = g;
            if (!gName || !externalId) return;
            const srcId = `${isPK ? 'pk' : 'ext'}:${externalId}`;
            const bySource = mergedGroups.findIndex(eg => eg.sourceId === srcId);
            const byName = bySource < 0 ? mergedGroups.findIndex(eg => !eg.sourceId && importNameKey(eg.name) === importNameKey(gName)) : -1;
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
            groupMemberMap.set(localId, externalMembers);
          });
          if (groupsChanged) await store.set(KEYS.groups, mergedGroups);
          if (groupMemberMap.size > 0) {
            const currentMembers = await getStoredMembers();
            const memberLocalIdsByGroup = new Map<string, Set<string>>();
            for (const [localGroupId, externalMemberIds] of groupMemberMap) {
              memberLocalIdsByGroup.set(localGroupId, new Set(localIds(idMap, externalMemberIds)));
            }
            const updatedMembers = currentMembers.map(lm => {
              const additions: string[] = [];
              for (const [localGroupId, localMemberSet] of memberLocalIdsByGroup) {
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
        if (extSel.frontHistory && src.switchCount > 0) {
          await applyImportedHistory(src.convertSwitches(idMap), ctx);
        }
      } else if (extSel.frontHistory && src.switchCount > 0) {
        const existingIdMap = new Map<string, string>();
        src.members.forEach(row => {
          const {extId: eid, aliasId} = row;
          if (!eid) return;
          const local = members.find(l => l.sourceId === eid) || members.find(l => importNameKey(l.name) === importNameKey(row.matchName));
          if (!local) return;
          existingIdMap.set(eid, local.id);
          if (aliasId) existingIdMap.set(aliasId, local.id);
        });
        await applyImportedHistory(src.convertSwitches(existingIdMap), ctx);
      }
      setRestoreProgress('');
      setExtPreview(null); setExtToken(''); setTimeout(() => onDataImported(), 500);
    } catch (e) {
      setRestoreProgress('');
      if (isImportStopped(e)) {
        setExtPreview(null); setExtToken(''); setTimeout(() => onDataImported(), 500);
        Alert.alert(t('share.importStopped', {count: e.completedCount ?? 0}));
        return;
      }
      log.debug('ext-import', 'failed:', e);
      Alert.alert(t('share.importFailed'), t('share.importPartialError', {error: importErrorText(e, t)}));
    }
  });
};
