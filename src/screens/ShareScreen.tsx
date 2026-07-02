import React, {useState} from 'react';
import {View, ScrollView, TouchableOpacity, Alert, StyleSheet, ActivityIndicator} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {exportJSON, exportZipBundle, exportHTML, exportEmail, exportAllJournalJSON, exportAllJournalTxt, exportAllJournalMd, ExportCategories, readZipBundle, importZipBundle, base64FromU8} from '../export/exportUtils';
import {store, KEYS, chatMsgKey, listRecoverableBackups, restoreFromBackup, RecoverableEntry} from '../storage';
import {SystemInfo, Member, MemberGroup, FrontState, HistoryEntry, JournalEntry, ShareSettings, AppSettings, ExportPayload, CustomFieldDef, CustomFieldType, CustomFieldValue, ChatChannel, ChatMessage, MemberPoll, uid, allFrontMemberIds, findOpenFrontInHistory} from '../utils';

type Section = 'export' | 'import' | 'shareview';
type ImportSource = 'backup' | 'journal' | 'simplyplural' | 'pluralkit' | 'spfile' | 'ampersand' | 'pluralspace';

import {saveAvatarFromUrl, saveAvatar, saveBannerFromBase64, saveBannerFromUrl, migrateInlineChatMedia} from '../utils/mediaUtils';
import {parallelMap} from '../utils/concurrency';
import {parseAmpar} from '../utils/ampar';

const normalizeSpAvatarUrl = (raw: any): string => {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('//')) return 'https:' + s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/avatars/')) return 'https://spaces.apparyllis.com' + s;
  if (/^[\w-]+(\.[\w-]+)+\//.test(s)) return 'https://' + s;
  return '';
};
const spAvatarCandidates = (content: any, fallbackUid: string): string[] => {
  const out: string[] = [];
  const c = content || {};
  const uuid = String(c.avatarUuid || '');
  const uid = String(c.uid || fallbackUid || '');
  if (uuid && uid) out.push(`https://spaces.apparyllis.com/avatars/${uid}/${uuid}`);
  const direct = normalizeSpAvatarUrl(c.avatarUrl);
  if (direct && !out.includes(direct)) out.push(direct);
  return out;
};
const downloadFirstAvatar = async (memberId: string, urls: string[]): Promise<string | undefined> => {
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const u of urls) {
      const r = await saveAvatarFromUrl(memberId, u).catch(() => undefined);
      if (r) return r;
    }
    if (attempt === 0) await new Promise<void>(res => setTimeout(() => res(), 1200));
  }
  return undefined;
};

const spGet = async (url: string, headers: any): Promise<any | null> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {headers});
      if (res.ok) { try { return await res.json(); } catch { return null; } }
      if (res.status === 401 || res.status === 403) return null;
      console.log(`[SP-FETCH] ${url} -> ${res.status} (attempt ${attempt + 1})`);
    } catch (e) {
      console.log(`[SP-FETCH] ${url} network error (attempt ${attempt + 1}):`, e);
    }
    if (attempt < 2) await new Promise<void>(r => setTimeout(() => r(), 700 * (attempt + 1)));
  }
  return null;
};

interface Props {
  theme: any; system: SystemInfo; members: Member[]; front: FrontState | null;
  history: HistoryEntry[]; journal: JournalEntry[]; shareSettings: ShareSettings; appSettings: AppSettings;
  onSettingsChange: (s: ShareSettings) => void; getMember: (id: string) => Member | undefined;
  onDataImported: () => void; onAddJournalEntry: (entry: JournalEntry) => void; onDeleteAccount: () => void;
}

export const ShareScreen = ({theme: T, system, members, front, history, journal, shareSettings, appSettings, onSettingsChange, getMember, onDataImported, onAddJournalEntry, onDeleteAccount}: Props) => {
  const fs = (s: number) => Math.round(s * (T?.textScale || 1));
  const {t} = useTranslation();
  const [section, setSection] = useState<Section>('export');
  const [emailAddr, setEmailAddr] = useState('');
  const [restoreFile, setRestoreFile] = useState<string | null>(null);
  const [restorePath, setRestorePath] = useState<string | null>(null);
  const [restoreIsBundle, setRestoreIsBundle] = useState<boolean>(false);
  const [restorePreview, setRestorePreview] = useState<boolean>(false);
  const [restoreSel, setRestoreSel] = useState({system: true, members: true, avatars: true, banners: true, journal: true, frontHistory: true, groups: true, chat: true, moods: true, palettes: true, settings: true, customFields: true, noteboards: true, polls: true, journalTemplates: true, relationships: true, medical: true});
  const [restoreError, setRestoreError] = useState('');
  const [restoreDone, setRestoreDone] = useState(false);
  const [recoverEntries, setRecoverEntries] = useState<RecoverableEntry[] | null>(null);
  const [recoverScanning, setRecoverScanning] = useState(false);
  const [recoverSel, setRecoverSel] = useState<Record<string, boolean>>({});
  const [recoverDone, setRecoverDone] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<string>('');
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [importMsg, setImportMsg] = useState('');
  const [importSource, setImportSource] = useState<ImportSource>('backup');
  const [extToken, setExtToken] = useState('');
  const [extLoading, setExtLoading] = useState(false);
  const [extPreview, setExtPreview] = useState<{members: any[]; switches: any[]; system: any; customFields?: any[]; groups?: any[]; journal?: any[]; chat?: any[]; polls?: any[]} | null>(null);
  const [extSel, setExtSel] = useState({system: true, members: true, avatars: true, banners: true, frontHistory: true, customFields: true, groups: true, journal: true, chat: true, polls: true, displayNames: true});
  const [psAvatarIndex, setPsAvatarIndex] = useState<Record<string, string> | null>(null);
  const [psZipFiles, setPsZipFiles] = useState<Record<string, Uint8Array> | null>(null);

  const primaryFronters = (front?.primary?.memberIds || []).map(getMember).filter(Boolean) as Member[];
  const coFronters = (front?.coFront?.memberIds || []).map(getMember).filter(Boolean) as Member[];
  const coConsciousFronters = (front?.coConscious?.memberIds || []).map(getMember).filter(Boolean) as Member[];

  const singlet = appSettings.accountMode === 'singlet';
  const catSystemLabel = singlet ? t('share.nameGoals') : t('share.systemNameDesc');
  const catMembersLabel = singlet ? t('tabs.profile') : t('share.memberProfiles');
  const catFrontLabel = singlet ? t('history.statusHistory') : t('share.frontHistory');

  const tog = (k: keyof ShareSettings) => onSettingsChange({...shareSettings, [k]: !shareSettings[k]});
  const togR = (k: keyof typeof restoreSel) => setRestoreSel(s => ({...s, [k]: !s[k]}));
  const togE = (k: keyof typeof extSel) => setExtSel(s => ({...s, [k]: !s[k]}));

  const [exportSel, setExportSel] = useState<ExportCategories>({
    system: true, members: true, avatars: true, banners: true, frontHistory: true, journal: true,
    groups: true, chat: true, moods: true, palettes: true, settings: true,
    customFields: true, noteboards: true, polls: true, journalTemplates: true, relationships: true,
    medical: true,
  });
  const togExp = (k: keyof ExportCategories) => setExportSel(s => ({...s, [k]: !s[k]}));

  const handleJSON = async () => {try {await exportZipBundle(system, members, history, journal, exportSel);} catch (e) {Alert.alert(t('share.exportFailed'), String(e));}};
  const handleHTML = async () => {try {await exportHTML(system, members, history, journal);} catch (e) {Alert.alert(t('share.exportFailed'), String(e));}};
  const handleEmail = () => {
    if (!emailAddr.trim() || !emailAddr.includes('@')) {Alert.alert(t('share.invalidEmail'), t('share.invalidEmailMsg')); return;}
    exportEmail(system, members, history, journal, emailAddr);
  };
  const handleJournalExport = async (fmt: 'json' | 'txt' | 'md') => {
    try { if (fmt === 'json') await exportAllJournalJSON(journal, system.name); else if (fmt === 'txt') await exportAllJournalTxt(journal, members, system.name); else await exportAllJournalMd(journal, members, system.name);
    } catch (e) {Alert.alert(t('share.exportFailed'), String(e));}
  };

  const handleImportJournalFile = async () => {
    setImportStatus('idle'); setImportMsg('');
    try {
      const [res] = await safePick({type: ['text/plain', 'text/markdown', 'application/json']});
      if (!res) return;
      const ext = (res.name || '').split('.').pop()?.toLowerCase() || '';
      const titleBase = (res.name || 'Imported Entry').replace(/\.[^.]+$/, '');
      let body = '';
      if (['txt', 'md', 'markdown'].includes(ext)) {body = await ReactNativeBlobUtil.fs.readFile(getPickedFilePath(res), 'utf8');}
      else if (ext === 'json') {
        const raw = await ReactNativeBlobUtil.fs.readFile(getPickedFilePath(res), 'utf8');
        try { const parsed = JSON.parse(raw); if (parsed._meta?.app === 'Plural Space' || parsed._meta?.app === 'Plural Star') {setImportStatus('error'); setImportMsg(t('share.backupLooksLike')); return;} body = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
        } catch {body = raw;}
      } else {setImportStatus('error'); setImportMsg(t('share.unsupportedFormat', {ext})); return;}
      onAddJournalEntry({id: uid(), title: titleBase, body, authorIds: [], hashtags: [], timestamp: Date.now()});
      setImportStatus('success'); setImportMsg(t('share.importedAsEntry', {title: titleBase}));
    } catch (e: any) {if (!isPickerCancel(e)) {setImportStatus('error'); setImportMsg(e.message || 'Could not import file.');}}
  };

  const handlePickBackup = async () => {
    setRestoreError(''); setRestorePreview(false); setRestorePath(null); setRestoreFile(null); setRestoreDone(false); setRestoreIsBundle(false);
    try {
      const [res] = await safePick({type: ['application/json', 'application/zip', 'text/plain']});
      if (!res) return;
      const pickedPath = getPickedFilePath(res);
      const isZip = /\.zip$/i.test(res.name || '') || /\.zip$/i.test(pickedPath);
      if (isZip) {
        let bundle: {files: Record<string, Uint8Array>; data: any | null; manifest: any | null} | null = null;
        try { bundle = await readZipBundle(pickedPath); }
        catch { bundle = await readZipBundle(res.uri || pickedPath); }
        const bdata = bundle?.data;
        const manifestApp = bundle?.manifest?.app;
        if (!bdata || !(
          bdata._meta?.app === 'Plural Star'
          || bdata._meta?.app === 'Plural Space'
          || manifestApp === 'Plural Star'
          || manifestApp === 'Plural Space'
        )) {
          setRestoreError(t('share.bundleNotRecognized'));
          return;
        }
        let safeZipPath = pickedPath;
        try {
          const dest = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/ps_restore_pending.zip`;
          try { await ReactNativeBlobUtil.fs.unlink(dest); } catch {}
          await ReactNativeBlobUtil.fs.cp(pickedPath, dest);
          safeZipPath = dest;
        } catch {}
        setRestorePath(safeZipPath);
        setRestoreIsBundle(true);
        setRestoreFile(res.name || 'backup.zip');
        setRestorePreview(true);
        return;
      }
      let content: string;
      try {
        content = await ReactNativeBlobUtil.fs.readFile(pickedPath, 'utf8');
      } catch {
        content = await ReactNativeBlobUtil.fs.readFile(res.uri || pickedPath, 'utf8');
      }
      let parsed: any;
      try { parsed = JSON.parse(content); } catch {
        setRestoreError('File is not valid JSON. Please pick a Plural Star or Simply Plural backup (.json) file.');
        return;
      }
      const isPluralSpaceApp = !parsed._meta && parsed.system && typeof parsed.system === 'object' && Array.isArray(parsed.members) && Array.isArray(parsed.fronts);
      if (isPluralSpaceApp) { setRestoreError(t('share.psUseTab')); return; }
      const isNativePS = parsed._meta && (parsed._meta.app === 'Plural Star' || parsed._meta.app === 'Plural Space');
      const isSPExport = !parsed._meta && Array.isArray(parsed.members) && parsed.members.length > 0
        && parsed.members[0]._id !== undefined && Array.isArray(parsed.customFields);
      const isOctocon = !parsed._meta && parsed.user && typeof parsed.user === 'object' && Array.isArray(parsed.alters);
      const isOurcana = (parsed.format === 'ourcana') || (!parsed._meta && Array.isArray(parsed.members) && Array.isArray(parsed.frontHistory) && parsed.members[0]?.id !== undefined);
      const isMultiplicity = (parsed.app === 'multiplicity') || (Array.isArray(parsed.alters) && Array.isArray(parsed.front_entries));
      if (!isNativePS && !isSPExport && !isOctocon && !isOurcana && !isMultiplicity) {
        setRestoreError('This does not look like a Plural Star, Simply Plural, Octocon, Ourcana, or HiveMind backup. Pick a .json file exported from one of those apps (or use the Ampersand tab for .ampar files).');
        return;
      }
      const safeTempPath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/ps_restore_pending.json`;
      await ReactNativeBlobUtil.fs.writeFile(safeTempPath, content, 'utf8');
      setRestorePath(safeTempPath);
      setRestoreFile(res.name || 'backup.json');
      setRestorePreview(true);
    } catch (e: any) {if (!isPickerCancel(e)) setRestoreError(e.message || 'Could not read file.');}
  };

  // Dedicated .zip (full bundle) import — force EVERY category on, including
  // avatars + banners, so a zip restore always brings the whole system and its
  // media, then reuse the shared pick/validate flow (which routes .zip through
  // readZipBundle and sets restoreIsBundle).
  const handlePickZipBackup = () => {
    setRestoreSel({system: true, members: true, avatars: true, banners: true, journal: true, frontHistory: true, groups: true, chat: true, moods: true, palettes: true, settings: true, customFields: true, noteboards: true, polls: true, journalTemplates: true, relationships: true, medical: true});
    handlePickBackup();
  };

  const handleRestore = () => {
    if (!restorePath || !restorePreview) return;
    Alert.alert(t('share.restoreData'), t('share.restoreDataMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('share.restore'), style: 'destructive', onPress: async () => {
        setRestoring(true);
        try {
          if (restoreIsBundle) {
            const {data} = await importZipBundle(restorePath);
            if (restoreSel.system && data.system) await store.set(KEYS.system, data.system);
            if (restoreSel.members && Array.isArray(data.members)) {
              let mem: any[] = data.members;
              if (restoreSel.avatars) {
                const avatarMap = await importBase64MemberMedia('avatar', data.avatars || {}, (memberId, raw) => saveAvatar(memberId, raw).catch(() => null), t('share.progressAvatars'), 'share.progressAvatarsN');
                mem = mem.map(m => avatarMap[m.id] ? {...m, avatar: avatarMap[m.id]} : m);
              }
              if (restoreSel.banners) {
                const bannerMap = await importBase64MemberMedia('banner', data.banners || {}, (memberId, raw) => saveBannerFromBase64(memberId, raw).catch(() => null), t('share.progressBanners'), 'share.progressBannersN');
                mem = mem.map(m => bannerMap[m.id] ? {...m, banner: bannerMap[m.id]} : m);
              }
              setRestoreProgress(t('share.progressSavingMembers'));
              await store.set(KEYS.members, mem);
            }
            await restoreSharedPayload(data);
            setRestoreDone(true); setTimeout(() => onDataImported(), 800);
            return;
          }
          const content = await ReactNativeBlobUtil.fs.readFile(restorePath, 'utf8');
          const rawData: any = JSON.parse(content);

          const looksLikeOurcana = (rawData.format === 'ourcana') || (!rawData._meta && Array.isArray(rawData.members) && Array.isArray(rawData.frontHistory) && rawData.members[0]?.id !== undefined);
          if (looksLikeOurcana) {
            await importOurcana(rawData);
            setRestoreDone(true); setRestoring(false); setTimeout(() => onDataImported(), 800);
            return;
          }
          const looksLikeMultiplicity = (rawData.app === 'multiplicity') || (Array.isArray(rawData.alters) && Array.isArray(rawData.front_entries) && rawData.alters[0]?.alter_id !== undefined);
          if (looksLikeMultiplicity) {
            await importMultiplicity(rawData);
            setRestoreDone(true); setRestoring(false); setTimeout(() => onDataImported(), 800);
            return;
          }

          const looksLikeSP = !rawData._meta && Array.isArray(rawData.members) && rawData.members.length > 0
            && rawData.members[0]._id !== undefined && Array.isArray(rawData.customFields);
          if (looksLikeSP) {
            console.log(`[SP-JSON] detected SP export: members=${rawData.members.length} customFields=${rawData.customFields.length}`);
            const normId = (raw: any): string => {
              if (raw == null) return '';
              if (typeof raw === 'string') return raw;
              if (typeof raw === 'number') return String(raw);
              if (typeof raw === 'object') {
                if (typeof raw.$oid === 'string') return raw.$oid;
                if (typeof raw._id === 'string') return raw._id;
                if (typeof raw.id === 'string') return raw.id;
                if (typeof raw.toString === 'function') { const s = raw.toString(); if (s && s !== '[object Object]') return s; }
              }
              return '';
            };
            const SP_TYPE_MAP: Record<string, CustomFieldType> = {'0': 'text', '1': 'color', '2': 'date', '3': 'month', '4': 'year', '5': 'monthYear', '6': 'timestamp', '7': 'monthDay', 'text': 'text', 'number': 'number', 'checkbox': 'toggle', 'toggle': 'toggle', 'date': 'date', 'markdown': 'markdown'};
            const existingMembers = await store.get<Member[]>(KEYS.members, []) || [];
            const byNameLower: Record<string, Member> = {};
            existingMembers.forEach(lm => { const n = (lm.name || '').trim().toLowerCase(); if (n) byNameLower[n] = lm; });
            const newMembers: Member[] = rawData.members.map((sp: any) => {
              const spName = String(sp.name || '').trim();
              const nameLower = spName.toLowerCase();
              const existing = byNameLower[nameLower];
              const id = existing ? existing.id : uid();
              return {
                id,
                name: spName || 'Unknown',
                pronouns: String(sp.pronouns || ''),
                role: '',
                color: normHex(sp.color),
                description: String(sp.desc || ''),
                archived: !!sp.archived,
                customFields: existing?.customFields || [],
                groupIds: existing?.groupIds || [],
                tags: existing?.tags || [],
                avatar: existing?.avatar,
              } as Member;
            });
            if (restoreSel.members) await store.set(KEYS.members, newMembers);
            const idMap: Record<string, string> = {};
            rawData.members.forEach((sp: any, i: number) => { const sid = normId(sp._id); if (sid) idMap[sid] = newMembers[i].id; });
            if (restoreSel.members && restoreSel.avatars) {
              const spAvatarUrls: Record<string, string[]> = {};
              const spFallbackUid = String(rawData.members.find((x: any) => x.uid)?.uid || rawData.uid || '');
              rawData.members.forEach((sp: any, i: number) => {
                const localId = newMembers[i].id;
                const cands = spAvatarCandidates(sp, spFallbackUid);
                if (cands.length) spAvatarUrls[localId] = cands;
              });
              const spAvatarEntries = Object.entries(spAvatarUrls);
              if (spAvatarEntries.length > 0) {
                setRestoreProgress(t('share.progressAvatarsDownload'));
                const downloaded: Record<string, string> = {};
                await parallelMap(spAvatarEntries, async ([memberId, urls]) => {
                  const fileUri = await downloadFirstAvatar(memberId, urls as string[]);
                  if (fileUri) downloaded[memberId] = fileUri;
                }, 4, (done, total) => setRestoreProgress(t('share.progressAvatarsDownloadN', {done, total})));
                if (Object.keys(downloaded).length > 0) {
                  const withAvatars = newMembers.map(m => downloaded[m.id] ? {...m, avatar: downloaded[m.id]} : m);
                  await store.set(KEYS.members, withAvatars);
                }
              }
            }
            if (restoreSel.customFields && rawData.customFields.length > 0) {
              const existingDefs = await store.get<CustomFieldDef[]>(KEYS.customFieldDefs, []) || [];
              const fieldIdMap: Record<string, string> = {};
              const newDefs: CustomFieldDef[] = [];
              rawData.customFields.forEach((cf: any, i: number) => {
                const candidates = [cf._id, cf.id, cf.uuid].map(normId).filter(Boolean);
                const spName = String(cf.name || `Field ${i + 1}`);
                const spType = cf.type;
                const existing = existingDefs.find(d => d.name.toLowerCase() === spName.toLowerCase());
                let localId: string;
                if (existing) { localId = existing.id; } else {
                  localId = uid();
                  newDefs.push({id: localId, name: spName, type: SP_TYPE_MAP[String(spType)] || 'text', sortOrder: cf.order ?? i});
                }
                candidates.forEach(k => { fieldIdMap[k] = localId; });
              });
              if (newDefs.length > 0) await store.set(KEYS.customFieldDefs, [...existingDefs, ...newDefs]);
              const membersForUpdate = await store.get<Member[]>(KEYS.members, []) || [];
              const updatedMembers = membersForUpdate.map(lm => {
                const spMember = rawData.members.find((sp: any) => idMap[normId(sp._id)] === lm.id);
                if (!spMember) return lm;
                const info = spMember.info;
                if (!info || typeof info !== 'object') return lm;
                const existingCF: CustomFieldValue[] = lm.customFields || [];
                const newCF: CustomFieldValue[] = [...existingCF];
                Object.entries(info).forEach(([spFieldId, rawValue]: [string, any]) => {
                  const localFieldId = fieldIdMap[normId(spFieldId)] || fieldIdMap[spFieldId];
                  if (!localFieldId) return;
                  let value: any = rawValue;
                  if (value && typeof value === 'object' && !Array.isArray(value)) {
                    if ('value' in value) value = value.value;
                    else if ('content' in value && typeof value.content === 'object' && 'value' in value.content) value = value.content.value;
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
            if (restoreSel.frontHistory && Array.isArray(rawData.frontHistory) && rawData.frontHistory.length > 0) {
              const sp_switches = rawData.frontHistory.map((s: any) => ({id: normId(s._id), content: s}));
              const newH = convertSPSwitches(sp_switches, idMap);
              if (newH.length > 0) {
                const merged = mergeHistoryEntries(newH, history);
                await store.set(KEYS.history, merged);
                const importedOpenFront = findOpenFrontInHistory(merged);
                if (importedOpenFront) await store.set(KEYS.front, importedOpenFront);
              }
            }
            setRestoreDone(true); setRestoring(false);
            return;
          }

          const looksLikeOctocon = !rawData._meta && rawData.user && typeof rawData.user === 'object' && Array.isArray(rawData.alters);
          if (looksLikeOctocon) {
            const ocUser = rawData.user || {};
            const alters: any[] = Array.isArray(rawData.alters) ? rawData.alters : [];
            const ocFields: any[] = Array.isArray(ocUser.fields) ? ocUser.fields : [];
            const ocTags: any[] = Array.isArray(rawData.tags) ? rawData.tags : [];
            const ocFronts: any[] = Array.isArray(rawData.fronts) ? rawData.fronts : [];
            const ocTime = (v: any): number | null => {
              if (!v) return null;
              let str = String(v);
              if (!/([zZ]|[+-]\d\d:?\d\d)$/.test(str)) str += 'Z';
              const ms = new Date(str).getTime();
              return isNaN(ms) ? null : ms;
            };
            const ocColor = (c: any): string => {
              if (!c) return '#DAA520';
              const str = String(c).trim();
              return str.startsWith('#') ? str : `#${str}`;
            };
            if (restoreSel.system) {
              const sys = await store.get<any>(KEYS.system, {}) || {};
              await store.set(KEYS.system, {...sys, name: ocUser.username || sys.name, description: ocUser.description || sys.description || ''});
            }
            const idMap: Record<string, string> = {};
            if (restoreSel.members) {
              const existing = await store.get<Member[]>(KEYS.members, []) || [];
              const merged: Member[] = [...existing];
              alters.forEach((a: any) => {
                const extId = String(a.id);
                const incoming = {
                  name: (a.name && String(a.name).trim()) || 'Unnamed member',
                  pronouns: String(a.pronouns || ''),
                  role: '',
                  color: ocColor(a.color),
                  description: String(a.description || ''),
                };
                const bySource = merged.findIndex(em => em.sourceId === extId);
                if (bySource >= 0) { merged[bySource] = {...merged[bySource], ...incoming, sourceId: extId}; idMap[extId] = merged[bySource].id; return; }
                const lower = incoming.name.toLowerCase();
                const byName = merged.findIndex(em => !em.sourceId && em.name.toLowerCase() === lower);
                if (byName >= 0) { merged[byName] = {...merged[byName], ...incoming, sourceId: extId}; idMap[extId] = merged[byName].id; return; }
                const nid = uid();
                merged.push({id: nid, sourceId: extId, tags: [], groupIds: [], customFields: [], ...incoming});
                idMap[extId] = nid;
              });
              await store.set(KEYS.members, finalizeMemberReplace(merged, idMap));
            }
            if (restoreSel.customFields && ocFields.length > 0) {
              const existingDefs = await store.get<CustomFieldDef[]>(KEYS.customFieldDefs, []) || [];
              const fieldIdMap: Record<string, string> = {};
              const newDefs: CustomFieldDef[] = [];
              ocFields.forEach((f: any, i: number) => {
                const name = String(f.name || `Field ${i + 1}`);
                const existing = existingDefs.find(d => d.name.toLowerCase() === name.toLowerCase());
                let localId: string;
                if (existing) { localId = existing.id; } else {
                  const cfType: CustomFieldType = f.type === 'number' ? 'number' : f.type === 'boolean' ? 'toggle' : 'text';
                  localId = uid();
                  newDefs.push({id: localId, name, type: cfType, sortOrder: i});
                }
                fieldIdMap[String(f.id)] = localId;
              });
              if (newDefs.length > 0) await store.set(KEYS.customFieldDefs, [...existingDefs, ...newDefs]);
              const membersForUpdate = await store.get<Member[]>(KEYS.members, []) || [];
              const updatedMembers = membersForUpdate.map(lm => {
                const alter = alters.find((a: any) => idMap[String(a.id)] === lm.id);
                if (!alter || !Array.isArray(alter.fields)) return lm;
                const cf: CustomFieldValue[] = [...(lm.customFields || [])];
                alter.fields.forEach((fv: any) => {
                  const fid = fieldIdMap[String(fv.id)];
                  if (!fid || fv.value == null) return;
                  const valStr = String(fv.value);
                  const idx = cf.findIndex(c => c.fieldId === fid);
                  if (idx >= 0) cf[idx] = {fieldId: fid, value: valStr};
                  else cf.push({fieldId: fid, value: valStr});
                });
                return {...lm, customFields: cf};
              });
              await store.set(KEYS.members, updatedMembers);
            }
            if (restoreSel.groups && ocTags.length > 0) {
              const existingGroups = await store.get<MemberGroup[]>(KEYS.groups, []) || [];
              const mergedGroups: MemberGroup[] = [...existingGroups];
              const groupIdMap: Record<string, string> = {};
              ocTags.forEach((tg: any) => {
                const name = String(tg.name || 'Group');
                let g = mergedGroups.find(x => x.name.toLowerCase() === name.toLowerCase());
                if (!g) { g = {id: uid(), name, color: tg.color ? ocColor(tg.color) : undefined}; mergedGroups.push(g); }
                groupIdMap[String(tg.id)] = g.id;
              });
              await store.set(KEYS.groups, mergedGroups);
              const membersForGroups = await store.get<Member[]>(KEYS.members, []) || [];
              const withGroups = membersForGroups.map(lm => {
                const gids = ocTags.filter((tg: any) => Array.isArray(tg.alters) && tg.alters.some((aid: any) => idMap[String(aid)] === lm.id)).map((tg: any) => groupIdMap[String(tg.id)]).filter(Boolean) as string[];
                if (gids.length === 0) return lm;
                return {...lm, groupIds: [...new Set([...(lm.groupIds || []), ...gids])]};
              });
              await store.set(KEYS.members, withGroups);
            }
            if (restoreSel.frontHistory && ocFronts.length > 0) {
              const ocSwitches = ocFronts.map((f: any) => ({content: {member: String(f.alter_id), startTime: ocTime(f.time_start), endTime: ocTime(f.time_end), comment: f.comment || ''}}));
              const newH = convertSPSwitches(ocSwitches, idMap);
              if (newH.length > 0) {
                const merged = mergeHistoryEntries(newH, history);
                await store.set(KEYS.history, merged);
                const importedOpenFront = findOpenFrontInHistory(merged);
                if (importedOpenFront) await store.set(KEYS.front, importedOpenFront);
              }
            }
            if (restoreSel.avatars) {
              const ocAvatarUrls: Record<string, string> = {};
              alters.forEach((a: any) => {
                const localId = idMap[String(a.id)];
                const url = String(a.avatar_url || '');
                if (localId && (url.startsWith('http://') || url.startsWith('https://'))) ocAvatarUrls[localId] = url;
              });
              const entries = Object.entries(ocAvatarUrls);
              if (entries.length > 0) {
                setRestoreProgress(t('share.progressAvatarsDownload'));
                const downloaded: Record<string, string> = {};
                await parallelMap(entries, async ([memberId, url]) => {
                  const fileUri = await downloadFirstAvatar(memberId, [url]);
                  if (fileUri) downloaded[memberId] = fileUri;
                }, 4, (done, total) => setRestoreProgress(t('share.progressAvatarsDownloadN', {done, total})));
                if (Object.keys(downloaded).length > 0) {
                  const cur = await store.get<Member[]>(KEYS.members, []) || [];
                  const withAv = cur.map(m => downloaded[m.id] ? {...m, avatar: downloaded[m.id]} : m);
                  await store.set(KEYS.members, withAv);
                }
              }
            }
            setRestoreDone(true); setRestoring(false);
            return;
          }
          const data: ExportPayload = rawData;
          if (!data.avatars) data.avatars = {};
          if (data.members) {
            data.members = data.members.map((m: any) => {
              if (m.avatar && !data.avatars![m.id]) data.avatars![m.id] = m.avatar;
              const {avatar, ...rest} = m; return rest;
            });
          }
          if (restoreSel.system && data.system) await store.set(KEYS.system, data.system);
          if (restoreSel.members && data.members) {
            let membersAccum: any[] = [...data.members];
            const wantAvatars = restoreSel.avatars && data.avatars && Object.keys(data.avatars).length > 0;
            const wantBanners = restoreSel.banners && data.banners && Object.keys(data.banners).length > 0;
            if (wantAvatars) {
              const avatarMap = await importBase64MemberMedia('avatar', data.avatars!, (memberId, raw) => saveAvatar(memberId, raw).catch(() => null), t('share.progressAvatars'), 'share.progressAvatarsN');
              membersAccum = mergeMediaIntoMembers(membersAccum, 'avatar', avatarMap);
              data.avatars = {};
            }
            if (wantBanners) {
              const bannerMap = await importBase64MemberMedia('banner', data.banners!, (memberId, raw) => saveBannerFromBase64(memberId, raw).catch(() => null), t('share.progressBanners'), 'share.progressBannersN');
              membersAccum = mergeMediaIntoMembers(membersAccum, 'banner', bannerMap);
              data.banners = {};
            }
            setRestoreProgress(t('share.progressSavingMembers'));
            await store.set(KEYS.members, membersAccum);
          } else if (restoreSel.avatars && !restoreSel.members) {
            if (data.avatars && Object.keys(data.avatars).length > 0) {
              const existing = await getStoredMembers();
              const entries = Object.entries(data.avatars);
              const avatarMap = await importBase64MemberMedia('avatar', data.avatars, (memberId, raw) => saveAvatar(memberId, raw).catch(() => null), t('share.progressAvatars'), 'share.progressAvatarsN');
              const backupHasAvatar = new Set(entries.map(([id]) => id));
              const updated = existing.map(m => {
                if (avatarMap[m.id]) return {...m, avatar: avatarMap[m.id]};
                if (backupHasAvatar.has(m.id)) return m;
                return m.avatar ? {...m, avatar: undefined} : m;
              });
              await store.set(KEYS.members, updated);
              data.avatars = {};
            }
            if (restoreSel.banners && data.banners && Object.keys(data.banners).length > 0) {
              const current = await getStoredMembers();
              const entries = Object.entries(data.banners);
              const bannerMap = await importBase64MemberMedia('banner', data.banners, (memberId, raw) => saveBannerFromBase64(memberId, raw).catch(() => null), t('share.progressBanners'), 'share.progressBannersN');
              const backupHasBanner = new Set(entries.map(([id]) => id));
              const updated = current.map(m => {
                if (bannerMap[m.id]) return {...m, banner: bannerMap[m.id]};
                if (backupHasBanner.has(m.id)) return m;
                return m.banner ? {...m, banner: undefined} : m;
              });
              await store.set(KEYS.members, updated);
              data.banners = {};
            }
          } else if (restoreSel.banners && data.banners && Object.keys(data.banners).length > 0) {
            const current = await getStoredMembers();
            const entries = Object.entries(data.banners);
            const bannerMap = await importBase64MemberMedia('banner', data.banners, (memberId, raw) => saveBannerFromBase64(memberId, raw).catch(() => null), t('share.progressBanners'), 'share.progressBannersN');
            const backupHasBanner2 = new Set(entries.map(([id]) => id));
            const updated = current.map(m => {
              if (bannerMap[m.id]) return {...m, banner: bannerMap[m.id]};
              if (backupHasBanner2.has(m.id)) return m;
              return m.banner ? {...m, banner: undefined} : m;
            });
            await store.set(KEYS.members, updated);
            data.banners = {};
          }
          await restoreSharedPayload(data);
          setRestoreDone(true); setTimeout(() => onDataImported(), 800);
        } catch (e: any) {
          setRestoreError(e.message || 'Restore failed');
        } finally {
          setRestoring(false);
          setRestoreProgress('');
          try {
            for (const f of ['ps_restore_pending.json', 'ps_restore_pending.zip']) {
              const p = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${f}`;
              const exists = await ReactNativeBlobUtil.fs.exists(p);
              if (exists) await ReactNativeBlobUtil.fs.unlink(p);
            }
          } catch {}
        }
      }},
    ]);
  };

  const handleSimplyPluralFetch = async () => {
    if (!extToken.trim()) {Alert.alert(t('share.tokenRequired'), t('share.tokenRequiredMsg')); return;}
    setExtLoading(true); setExtPreview(null);
    try {
      const headers = {Authorization: extToken.trim(), 'Content-Type': 'application/json'};
      const meRes = await fetch('https://v2.apparyllis.com/v1/me', {headers});
      if (!meRes.ok) throw new Error(t('share.authFailed', {status: meRes.status}));
      const meData = await meRes.json();
      const userId = meData.id || meData.uid;
      const mData = await spGet(`https://v2.apparyllis.com/v1/members/${userId}`, headers);
      const sData = await spGet(`https://v2.apparyllis.com/v1/frontHistory/${userId}?startTime=0&endTime=${Date.now()}`, headers);
      const cfData = await spGet(`https://v2.apparyllis.com/v1/customFields/${userId}`, headers);
      const gData = await spGet(`https://v2.apparyllis.com/v1/groups/${userId}`, headers);
      if (mData == null) throw new Error(t('share.spFetchPartial', {categories: t('share.memberProfiles')}));
      const failedCats: string[] = [];
      if (sData == null) failedCats.push(t('share.frontHistory'));
      if (cfData == null) failedCats.push(t('customFields.title'));
      if (gData == null) failedCats.push(t('share.groups'));
      const memberList = Array.isArray(mData) ? mData : (mData.members || []);
      const switchList = Array.isArray(sData) ? sData : (sData?.switches || sData?.frontHistory || []);
      const customFieldList = Array.isArray(cfData) ? cfData : (cfData?.customFields || []);
      const groupList = Array.isArray(gData) ? gData : (gData?.groups || []);
      if (failedCats.length > 0) Alert.alert(t('share.importFailed'), t('share.spFetchPartial', {categories: failedCats.join(', ')}));
      const sanitized = memberList.map((m: any) => {
        if (m?.content?.name) m.content.name = String(m.content.name).replace(/[-\u001F\u007F]/g, '').trim();
        if (m?.name) m.name = String(m.name).replace(/[-\u001F\u007F]/g, '').trim();
        return m;
      });
      setExtPreview({system: meData, members: sanitized, switches: switchList, customFields: customFieldList, groups: groupList});
    } catch (e: any) {Alert.alert(t('share.importFailed'), e.message || 'Could not connect.');}
    finally {setExtLoading(false);}
  };

  const handlePluralKitFetch = async () => {
    if (!extToken.trim()) {Alert.alert(t('share.tokenRequired'), t('share.pkTokenRequiredMsg')); return;}
    setExtLoading(true); setExtPreview(null);
    try {
      const headers = {Authorization: extToken.trim(), 'Content-Type': 'application/json', 'User-Agent': 'PluralStar/1.9.2'};
      const [sRes, mRes, swRes, gRes] = await Promise.all([
        fetch('https://api.pluralkit.me/v2/systems/@me', {headers}),
        fetch('https://api.pluralkit.me/v2/systems/@me/members', {headers}),
        fetch('https://api.pluralkit.me/v2/systems/@me/switches?limit=500', {headers}),
        fetch('https://api.pluralkit.me/v2/systems/@me/groups?with_members=true', {headers}),
      ]);
      if (!sRes.ok) throw new Error(t('share.authFailed', {status: sRes.status}));
      let sData: any = {}; let mData: any = []; let swData: any = []; let gData: any = [];
      try { sData = await sRes.json(); } catch { sData = {}; }
      try { mData = await mRes.json(); } catch { mData = []; }
      try { swData = await swRes.json(); } catch { swData = []; }
      try { gData = await gRes.json(); } catch { gData = []; }
      const memberList = Array.isArray(mData) ? mData : [];
      const sanitized = memberList.map((m: any) => {
        if (m?.display_name) m.display_name = String(m.display_name).replace(/[-\u001F\u007F]/g, '').trim();
        if (m?.name) m.name = String(m.name).replace(/[-\u001F\u007F]/g, '').trim();
        return m;
      });
      setExtPreview({system: sData, members: sanitized, switches: Array.isArray(swData) ? swData : [], groups: Array.isArray(gData) ? gData : []});
    } catch (e: any) {Alert.alert(t('share.importFailed'), e.message || 'Could not connect.');}
    finally {setExtLoading(false);}
  };

  const convertSPSwitches = (switches: any[], idMap: Record<string, string>): HistoryEntry[] => {
    const parsed = switches.map((sw: any) => {
      const externalMemberIds: string[] = Array.isArray(sw.members) ? sw.members : Array.isArray(sw.content?.members) ? sw.content.members : (sw.content?.member ? [sw.content.member] : []);
      const resolvedIds = externalMemberIds.map((eid: string) => idMap[eid]).filter(Boolean) as string[];
      const rawTs = sw.content?.startTime || sw.content?.timestamp || sw.timestamp;
      const startTime: number = typeof rawTs === 'number' ? rawTs : (rawTs ? new Date(rawTs).getTime() : 0);
      const rawEnd = sw.content?.endTime;
      const endTime: number | null = rawEnd ? (typeof rawEnd === 'number' ? rawEnd : new Date(rawEnd).getTime()) : null;
      return {resolvedIds, startTime, endTime, note: sw.content?.comment || ''};
    }).filter(e => e.startTime > 0 && e.resolvedIds.length > 0);
    parsed.sort((a, b) => a.startTime - b.startTime);
    const OVERLAP_TOLERANCE = 60 * 1000;
    const groups: (typeof parsed)[] = [];
    const used = new Set<number>();
    for (let i = 0; i < parsed.length; i++) {
      if (used.has(i)) continue;
      const group = [parsed[i]]; used.add(i);
      for (let j = i + 1; j < parsed.length; j++) {
        if (used.has(j)) continue;
        const a = parsed[i]; const b = parsed[j];
        const aEnd = a.endTime ?? Date.now(); const bEnd = b.endTime ?? Date.now();
        if (Math.abs(a.startTime - b.startTime) <= OVERLAP_TOLERANCE || (b.startTime < aEnd && a.startTime < bEnd)) { group.push(b); used.add(j); }
      }
      groups.push(group);
    }
    const built = groups.map(group => {
      const allIds = [...new Set(group.flatMap(e => e.resolvedIds))];
      const startTime = Math.min(...group.map(e => e.startTime));
      const endTimes = group.map(e => e.endTime);
      const endTime = endTimes.includes(null) ? null : Math.max(...(endTimes as number[]));
      const notes = group.map(e => e.note).filter(Boolean);
      return {memberIds: allIds, startTime, endTime, note: notes.join(' | '), mood: undefined, location: undefined} as HistoryEntry;
    }).filter(h => h.memberIds.length > 0);
    // Simply Plural exports frequently contain many stale frontHistory entries with no
    // endTime. Importing them all as "open" stacks multiple current fronts, leaves
    // phantom/empty fronts, and breaks the front notification. Close every open entry
    // that has a later switch after it, so only the single most-recent front stays current.
    built.sort((a, b) => a.startTime - b.startTime);
    for (let i = 0; i < built.length; i++) {
      if (built[i].endTime != null) continue;
      for (let j = i + 1; j < built.length; j++) {
        if (built[j].startTime > built[i].startTime) { built[i].endTime = built[j].startTime; break; }
      }
    }
    return built;
  };

  const convertPKSwitches = (switches: any[], idMap: Record<string, string>): HistoryEntry[] => {
    return switches.map((sw: any, i: number, arr: any[]) => {
      const next = arr[i - 1];
      const resolvedIds = (Array.isArray(sw.members) ? sw.members : []).map((eid: string) => idMap[eid]).filter(Boolean) as string[];
      return {memberIds: resolvedIds, startTime: new Date(sw.timestamp).getTime(), endTime: next ? new Date(next.timestamp).getTime() : null, note: '', mood: undefined, location: undefined};
    }).filter(h => h.memberIds.length > 0);
  };

  const normHex = (c: any): string => { const s = String(c || '').trim(); return s.startsWith('#') ? s : (s ? `#${s}` : '#DAA520'); };

  // Re-importing a member is an explicit "I want this member back": if the local
  // match is a soft-delete tombstone (deleted + archived, kept for history/stats),
  // revive it. Without this, deleting members and then re-importing left them
  // invisible forever — the tombstone flags survived every merge, and only a
  // full wipe + reimport appeared to "fix" it.
  const reviveIfTombstoned = (em: Member, incoming: Partial<Member>): Partial<Member> =>
    em.deleted ? { deleted: false, archived: incoming.archived ?? false } : {};

  const mergeForeignMember = (merged: Member[], idMap: Record<string, string>, extId: string, incoming: Partial<Member>) => {
    const bySource = merged.findIndex(em => em.sourceId === extId);
    if (bySource >= 0) { merged[bySource] = {...merged[bySource], ...incoming, ...reviveIfTombstoned(merged[bySource], incoming), sourceId: extId}; idMap[extId.replace(/^[a-z]+:/, '')] = merged[bySource].id; return; }
    const lower = String(incoming.name || '').toLowerCase();
    const byName = merged.findIndex(em => !em.sourceId && em.name.toLowerCase() === lower);
    if (byName >= 0) { merged[byName] = {...merged[byName], ...incoming, ...reviveIfTombstoned(merged[byName], incoming), sourceId: extId}; idMap[extId.replace(/^[a-z]+:/, '')] = merged[byName].id; return; }
    const nid = uid();
    merged.push({id: nid, sourceId: extId, tags: [], groupIds: [], customFields: [], ...incoming} as Member);
    idMap[extId.replace(/^[a-z]+:/, '')] = nid;
  };

  const finalizeMemberReplace = (merged: Member[], idMap: Record<string, string>): Member[] => {
    const kept = new Set(Object.values(idMap));
    return merged.filter(m => m.isCustomFront || kept.has(m.id));
  };

  const historySig = (e: HistoryEntry): string =>
    `${e.startTime}|${[...(e.memberIds || [])].sort().join(',')}|${[...(e.coFrontIds || [])].sort().join(',')}|${[...(e.coConsciousIds || [])].sort().join(',')}|${e.changeType || 'front'}|${e.changeTime ?? ''}`;

  const mergeHistoryEntries = (incoming: HistoryEntry[], existing: HistoryEntry[]): HistoryEntry[] => {
    const map = new Map<string, HistoryEntry>();
    for (const e of existing) map.set(historySig(e), e);
    for (const e of incoming) map.set(historySig(e), e);
    return [...map.values()].sort((a, b) => b.startTime - a.startTime);
  };

  const getStoredMembers = async () => await store.get<Member[]>(KEYS.members, []) || [];

  const mergeMediaIntoMembers = <K extends 'avatar' | 'banner'>(list: Member[], field: K, mediaMap: Record<string, string>) =>
    list.map(member => mediaMap[member.id] ? {...member, [field]: mediaMap[member.id]} : member);

  const importBase64MemberMedia = async (
    field: 'avatar' | 'banner',
    media: Record<string, string>,
    save: (memberId: string, raw: string) => Promise<string | null>,
    progressLabel: string,
    progressCountLabel: string,
  ) => {
    const entries = Object.entries(media);
    const saved: Record<string, string> = {};
    if (entries.length === 0) return saved;
    setRestoreProgress(progressLabel);
    await parallelMap(entries, async ([memberId, raw]) => {
      if (!raw) return;
      const b64 = raw.startsWith('data:') ? raw.split(',')[1] : raw;
      const fileUri = await save(memberId, b64).catch(() => null);
      if (fileUri) saved[memberId] = fileUri;
    }, 6, (done, total) => setRestoreProgress(t(progressCountLabel, {done, total})));
    return saved;
  };

  const applyImportedHistory = async (newHistory: HistoryEntry[]) => {
    if (newHistory.length === 0) return;
    const mergedHistory = mergeHistoryEntries(newHistory, history);
    await store.set(KEYS.history, mergedHistory);
    const importedOpenFront = findOpenFrontInHistory(mergedHistory);
    if (importedOpenFront) await store.set(KEYS.front, importedOpenFront);
  };

  const restoreSharedPayload = async (data: Partial<ExportPayload>) => {
    if (restoreSel.journal && data.journal) await store.set(KEYS.journal, data.journal);
    if (restoreSel.frontHistory && data.frontHistory) await store.set(KEYS.history, data.frontHistory);
    if (restoreSel.groups && data.groups) await store.set(KEYS.groups, data.groups);
    if (restoreSel.chat) {
      if (data.chatChannels) await store.set(KEYS.chatChannels, data.chatChannels);
      if (data.chatMessages) {
        setRestoreProgress(t('share.progressChat'));
        const channelIds = Object.keys(data.chatMessages).filter(id => {
          const msgs = data.chatMessages![id];
          return Array.isArray(msgs) && msgs.length > 0;
        });
        await parallelMap(channelIds, async chId => {
          try {
            const msgs = data.chatMessages![chId];
            const {messages: migrated} = await migrateInlineChatMedia(msgs);
            await store.set(chatMsgKey(chId), migrated);
          } catch (chErr) {
            console.error(`[RESTORE] failed channel ${chId}:`, chErr);
          }
        }, 4, (done, total) => setRestoreProgress(t('share.progressChatN', {done, total})));
      }
    }
    if (restoreSel.settings || restoreSel.moods) {
      const currentSettings = await store.get<AppSettings>(KEYS.settings) || {} as AppSettings;
      let newSettings = {...currentSettings};
      if (restoreSel.settings && data.settings) {
        newSettings = {...data.settings};
        if (!restoreSel.moods) newSettings.customMoods = currentSettings.customMoods || [];
      }
      if (restoreSel.moods) newSettings.customMoods = data.customMoods || data.settings?.customMoods || [];
      await store.set(KEYS.settings, newSettings);
    }
    if (restoreSel.palettes && data.palettes) await store.set(KEYS.palettes, data.palettes);
    if (restoreSel.frontHistory && data.front !== undefined) await store.set(KEYS.front, data.front);
    if (restoreSel.customFields && data.customFieldDefs) await store.set(KEYS.customFieldDefs, data.customFieldDefs);
    if (restoreSel.noteboards && data.noteboards) await store.set(KEYS.noteboards, data.noteboards);
    if (restoreSel.polls && data.polls) await store.set(KEYS.polls, data.polls);
    if (restoreSel.journalTemplates && data.journalTemplates) await store.set(KEYS.journalTemplates, data.journalTemplates);
    if (restoreSel.relationships && data.relationships) await store.set(KEYS.relationships, data.relationships);
    if (restoreSel.relationships && data.relationshipTypes) await store.set(KEYS.relationshipTypes, data.relationshipTypes);
    if (restoreSel.relationships && data.systemMapMembers) await store.set(KEYS.systemMapMembers, data.systemMapMembers);
    if (restoreSel.medical && data.medical) await store.set(KEYS.medical, data.medical);
  };

  const downloadAvatarsTo = async (urls: Record<string, string>) => {
    const entries = Object.entries(urls);
    if (entries.length === 0) return;
    setRestoreProgress(t('share.progressAvatarsDownload'));
    const downloaded: Record<string, string> = {};
    await parallelMap(entries, async ([memberId, url]) => {
      const fileUri = await downloadFirstAvatar(memberId, [url]);
      if (fileUri) downloaded[memberId] = fileUri;
    }, 4, (done, total) => setRestoreProgress(t('share.progressAvatarsDownloadN', {done, total})));
    if (Object.keys(downloaded).length > 0) {
      await store.set(KEYS.members, mergeMediaIntoMembers(await getStoredMembers(), 'avatar', downloaded));
    }
  };

  const importOurcana = async (rawData: any) => {
    const ouSys = rawData.system || {};
    const ouMembers: any[] = Array.isArray(rawData.members) ? rawData.members : [];
    const ouFronts: any[] = Array.isArray(rawData.frontHistory) ? rawData.frontHistory : [];
    const ouTags: any[] = Array.isArray(rawData.tags) ? rawData.tags : [];
    if (restoreSel.system) {
      const sys = await store.get<any>(KEYS.system, {}) || {};
      await store.set(KEYS.system, {...sys, name: ouSys.name || sys.name, description: ouSys.desc || sys.description || ''});
    }
    const idMap: Record<string, string> = {};
    if (restoreSel.members) {
      const existing = await store.get<Member[]>(KEYS.members, []) || [];
      const merged: Member[] = [...existing];
      ouMembers.forEach((m: any) => {
        const useDisplay = m.showOnlyDisplayName && m.displayName;
        mergeForeignMember(merged, idMap, String(m.id), {
          name: (useDisplay ? String(m.displayName) : String(m.name || '')).trim() || 'Unnamed member',
          pronouns: String(m.pronouns || ''), role: '', color: normHex(m.color),
          description: String(m.desc || ''), archived: !!m.archived,
        });
      });
      await store.set(KEYS.members, finalizeMemberReplace(merged, idMap));
    }
    if (restoreSel.groups && ouTags.length > 0) {
      const existingGroups = await store.get<MemberGroup[]>(KEYS.groups, []) || [];
      const mergedGroups: MemberGroup[] = [...existingGroups];
      const groupIdMap: Record<string, string> = {};
      ouTags.forEach((tg: any) => {
        const name = String(tg.label || tg.name || 'Group');
        let g = mergedGroups.find(x => x.name.toLowerCase() === name.toLowerCase());
        if (!g) { g = {id: uid(), name, color: tg.color ? normHex(tg.color) : undefined}; mergedGroups.push(g); }
        groupIdMap[String(tg.id)] = g.id;
      });
      await store.set(KEYS.groups, mergedGroups);
      const membersForGroups = await store.get<Member[]>(KEYS.members, []) || [];
      const withGroups = membersForGroups.map(lm => {
        const om = ouMembers.find((m: any) => idMap[String(m.id)] === lm.id);
        if (!om || !Array.isArray(om.tagIds)) return lm;
        const gids = om.tagIds.map((tid: any) => groupIdMap[String(tid)]).filter(Boolean) as string[];
        if (gids.length === 0) return lm;
        return {...lm, groupIds: [...new Set([...(lm.groupIds || []), ...gids])]};
      });
      await store.set(KEYS.members, withGroups);
    }
    if (restoreSel.frontHistory && ouFronts.length > 0) {
      const switches = ouFronts.map((f: any) => ({content: {members: Array.isArray(f.memberIds) ? f.memberIds : [], startTime: f.startTime, endTime: f.isLive ? null : (f.endTime ?? null)}}));
      const newH = convertSPSwitches(switches, idMap);
      await applyImportedHistory(newH);
    }
    if (restoreSel.avatars) {
      const urls: Record<string, string> = {};
      ouMembers.forEach((m: any) => { const localId = idMap[String(m.id)]; const url = String(m.avatarUrl || ''); if (localId && /^https?:\/\//.test(url)) urls[localId] = url; });
      await downloadAvatarsTo(urls);
    }
  };

  const importMultiplicity = async (rawData: any) => {
    const sys = rawData.system || {};
    const alters: any[] = Array.isArray(rawData.alters) ? rawData.alters : [];
    const fronts: any[] = Array.isArray(rawData.front_entries) ? rawData.front_entries : [];
    if (restoreSel.system) {
      const cur = await store.get<any>(KEYS.system, {}) || {};
      await store.set(KEYS.system, {...cur, name: sys.name || cur.name, description: sys.description || cur.description || ''});
    }
    const idMap: Record<string, string> = {};
    if (restoreSel.members) {
      const existing = await store.get<Member[]>(KEYS.members, []) || [];
      const merged: Member[] = [...existing];
      alters.forEach((a: any) => {
        mergeForeignMember(merged, idMap, 'mx:' + String(a.alter_id), {
          name: (a.name && String(a.name).trim()) || (a.display_name && String(a.display_name).trim()) || 'Unnamed member',
          pronouns: String(a.pronouns || ''), role: '', color: normHex(a.colour),
          description: String(a.description || ''), archived: !!a.is_archived,
        });
      });
      await store.set(KEYS.members, finalizeMemberReplace(merged, idMap));
    }
    if (restoreSel.frontHistory && fronts.length > 0) {
      const switches = fronts.map((f: any) => ({content: {member: String(f.alter_id), startTime: f.start_time, endTime: f.end_time ?? null, comment: f.notes || ''}}));
      const newH = convertSPSwitches(switches, idMap);
      await applyImportedHistory(newH);
    }
    if (restoreSel.avatars) {
      const b64Map: Record<string, string> = {};
      const urlMap: Record<string, string> = {};
      alters.forEach((a: any) => {
        const localId = idMap[String(a.alter_id)];
        if (!localId) return;
        if (a.avatar_data) b64Map[localId] = String(a.avatar_data);
        else if (/^https?:\/\//.test(String(a.avatar_url || ''))) urlMap[localId] = String(a.avatar_url);
      });
      const b64Entries = Object.entries(b64Map);
      if (b64Entries.length > 0) {
        setRestoreProgress(t('share.progressAvatars'));
        const map: Record<string, string> = {};
        await parallelMap(b64Entries, async ([memberId, b64]) => {
          const raw = b64.startsWith('data:') ? b64.split(',')[1] : b64;
          const fileUri = await saveAvatar(memberId, raw).catch(() => null);
          if (fileUri) map[memberId] = fileUri;
        }, 6, (done, total) => setRestoreProgress(t('share.progressAvatarsN', {done, total})));
        if (Object.keys(map).length > 0) {
          const cur = await store.get<Member[]>(KEYS.members, []) || [];
          await store.set(KEYS.members, cur.map(m => map[m.id] ? {...m, avatar: map[m.id]} : m));
        }
      }
      await downloadAvatarsTo(urlMap);
    }
  };

  const psTime = (v: any): number => { if (!v) return 0; const ms = new Date(String(v)).getTime(); return isNaN(ms) ? 0 : ms; };

  const convertPluralSpaceFronts = (fronts: any[], idMap: Record<string, string>): HistoryEntry[] => {
    type PsEntry = {mid: string; tier: 'front' | 'co_front' | 'co_con'; startTime: number; endTime: number | null; live: boolean; note: string};
    const parsed: PsEntry[] = fronts.map((f: any) => {
      const mid = idMap[String(f.member_id)] || '';
      const startTime = psTime(f.started_at);
      const live = !!f.is_live;
      const parsedEnd = f.ended_at ? psTime(f.ended_at) : 0;
      // endTime null = "open": either genuinely live (is_live), or a past front whose
      // ended_at the export omitted (older PluralSpace exports). The latter are closed
      // at the next switch below so they don't all read as the current front.
      const endTime = live ? null : (parsedEnd > 0 ? parsedEnd : null);
      const tier: PsEntry['tier'] = f.type === 'co_front' ? 'co_front' : f.type === 'co_con' ? 'co_con' : 'front';
      return {mid, tier, startTime, endTime, live, note: String(f.comment || '')};
    }).filter(e => e.mid && e.startTime > 0);
    parsed.sort((a, b) => a.startTime - b.startTime);
    const OVERLAP_TOLERANCE = 60 * 1000;
    const groups: PsEntry[][] = [];
    const used = new Set<number>();
    for (let i = 0; i < parsed.length; i++) {
      if (used.has(i)) continue;
      const group = [parsed[i]]; used.add(i);
      for (let j = i + 1; j < parsed.length; j++) {
        if (used.has(j)) continue;
        const a = parsed[i]; const b = parsed[j];
        const aEnd = a.endTime ?? Date.now(); const bEnd = b.endTime ?? Date.now();
        if (Math.abs(a.startTime - b.startTime) <= OVERLAP_TOLERANCE || (b.startTime < aEnd && a.startTime < bEnd)) { group.push(b); used.add(j); }
      }
      groups.push(group);
    }
    const built = groups.map(group => {
      let main = [...new Set(group.filter(e => e.tier === 'front').map(e => e.mid))];
      let coF = [...new Set(group.filter(e => e.tier === 'co_front').map(e => e.mid))].filter(id => !main.includes(id));
      const coC = [...new Set(group.filter(e => e.tier === 'co_con').map(e => e.mid))].filter(id => !main.includes(id) && !coF.includes(id));
      if (main.length === 0 && coF.length > 0) { main = coF; coF = []; }
      const startTime = Math.min(...group.map(e => e.startTime));
      const groupLive = group.some(e => e.live);
      const endVals = group.map(e => e.endTime);
      const endTime = groupLive ? null : (endVals.includes(null) ? null : Math.max(...(endVals as number[])));
      const notes = [...new Set(group.map(e => e.note).filter(Boolean))];
      return {live: groupLive, h: {
        memberIds: main, startTime, endTime, note: notes.join(' | '), mood: undefined, location: undefined,
        coFrontIds: coF.length > 0 ? coF : undefined,
        coConsciousIds: coC.length > 0 ? coC : undefined,
      } as HistoryEntry};
    }).filter(g => g.h.memberIds.length > 0);
    // Close any non-live, still-open entry at the start of the next switch — only
    // genuinely-live fronts (is_live) stay "current", even when the export omits end times.
    built.sort((a, b) => a.h.startTime - b.h.startTime);
    for (let i = 0; i < built.length; i++) {
      if (built[i].h.endTime != null || built[i].live) continue;
      for (let j = i + 1; j < built.length; j++) {
        if (built[j].h.startTime > built[i].h.startTime) { built[i].h.endTime = built[j].h.startTime; break; }
      }
    }
    return built.map(g => g.h);
  };

  const handlePluralSpacePick = async () => {
    setRestoreError(''); setExtPreview(null); setImportStatus('idle'); setImportMsg(''); setPsAvatarIndex(null); setPsZipFiles(null);
    try {
      const [res] = await safePick({type: ['application/json', 'application/zip', 'text/plain']});
      if (!res) return;
      const path = getPickedFilePath(res);
      const isZip = /\.zip$/i.test(res.name || '') || /\.zip$/i.test(path);
      let parsed: any;
      if (isZip) {
        let bundle: {files: Record<string, Uint8Array>; data: any | null} | null = null;
        try { bundle = await readZipBundle(path); }
        catch { bundle = await readZipBundle(res.uri || path); }
        parsed = bundle?.data;
        if (!parsed) throw new Error(t('share.psNotExport'));
        setPsZipFiles(bundle!.files);
      } else {
        let raw: string;
        try { raw = await ReactNativeBlobUtil.fs.readFile(path, 'utf8'); }
        catch { raw = await ReactNativeBlobUtil.fs.readFile(res.uri || path, 'utf8'); }
        try { parsed = JSON.parse(raw); } catch { throw new Error(t('share.psNotExport')); }
      }
      const ok = !parsed._meta && parsed.system && typeof parsed.system === 'object' && Array.isArray(parsed.members) && Array.isArray(parsed.fronts);
      if (!ok) throw new Error(t('share.psNotExport'));
      setExtPreview({
        system: parsed.system,
        members: parsed.members,
        switches: parsed.fronts,
        customFields: Array.isArray(parsed.custom_fields) ? parsed.custom_fields : [],
        groups: Array.isArray(parsed.member_groups) ? parsed.member_groups : [],
        journal: Array.isArray(parsed.journal_entries) ? parsed.journal_entries : [],
        chat: Array.isArray(parsed.chat_channels) ? parsed.chat_channels : [],
        polls: Array.isArray(parsed.polls) ? parsed.polls : [],
      });
    } catch (e: any) { if (!isPickerCancel(e)) Alert.alert(t('share.importFailed'), e.message || 'Could not read file.'); }
  };

  const handlePluralSpaceConfirm = () => {
    if (!extPreview) return;
    Alert.alert(t('share.importData'), t('share.importAddDataMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('share.importBtn'), onPress: async () => {
        try {
          const psMembers: any[] = extPreview.members || [];
          const psFronts: any[] = extPreview.switches || [];
          const psFieldDefs: any[] = extPreview.customFields || [];
          const psGroups: any[] = extPreview.groups || [];
          const psJournal: any[] = extPreview.journal || [];
          const psChat: any[] = extPreview.chat || [];
          const psPolls: any[] = extPreview.polls || [];

          if (extSel.system && extPreview.system?.name) {
            await store.set(KEYS.system, {...system, name: String(extPreview.system.name) || system.name, description: String(extPreview.system.description || '') || system.description});
          }

          const idMap: Record<string, string> = {};
          if (extSel.members) {
            const existing = await store.get<Member[]>(KEYS.members, []) || [];
            const merged: Member[] = [...existing];
            psMembers.forEach((m: any) => {
              mergeForeignMember(merged, idMap, 'ps:' + String(m.id), {
                name: (m.name && String(m.name).trim()) || (m.display_name && String(m.display_name).trim()) || 'Unnamed member',
                pronouns: String(m.pronouns || ''),
                role: Array.isArray(m.role) ? m.role.join(', ') : String(m.role || ''),
                color: normHex(m.color),
                description: String(m.description || ''),
                archived: !!m.is_archived,
                isCustomFront: !!m.is_custom_front,
                createdAt: psTime(m.created_at) || undefined,
              });
            });
            await store.set(KEYS.members, finalizeMemberReplace(merged, idMap));
          } else {
            const existing = await store.get<Member[]>(KEYS.members, []) || [];
            psMembers.forEach((m: any) => { const ex = existing.find(em => em.sourceId === 'ps:' + String(m.id)); if (ex) idMap[String(m.id)] = ex.id; });
          }

          const nameToLocal: Record<string, string> = {};
          psMembers.forEach((m: any) => {
            const lid = idMap[String(m.id)];
            if (!lid) return;
            const n = String(m.name || '').trim().toLowerCase();
            if (n) nameToLocal[n] = lid;
            const dn = String(m.display_name || '').trim().toLowerCase();
            if (dn && !nameToLocal[dn]) nameToLocal[dn] = lid;
          });
          const allLocalMembers = await store.get<Member[]>(KEYS.members, []) || [];
          allLocalMembers.forEach(m => { const k = (m.name || '').trim().toLowerCase(); if (k && !nameToLocal[k]) nameToLocal[k] = m.id; });

          if (extSel.customFields) {
            const existingDefs = await store.get<CustomFieldDef[]>(KEYS.customFieldDefs, []) || [];
            const newDefs: CustomFieldDef[] = [];
            const fieldIdByName: Record<string, string> = {};
            const PS_TYPE_MAP: Record<string, CustomFieldType> = {text: 'text', number: 'number', boolean: 'toggle', toggle: 'toggle', date: 'date', color: 'color', markdown: 'markdown'};
            psFieldDefs.forEach((f: any, i: number) => {
              const name = String(f.name || `Field ${i + 1}`).trim();
              const key = name.toLowerCase();
              if (fieldIdByName[key]) return;
              const existing = existingDefs.find(d => d.name.toLowerCase() === key);
              if (existing) { fieldIdByName[key] = existing.id; return; }
              const localId = uid();
              newDefs.push({id: localId, name, type: PS_TYPE_MAP[String(f.field_type)] || 'text', sortOrder: i});
              fieldIdByName[key] = localId;
            });
            psMembers.forEach((m: any) => (Array.isArray(m.custom_field_values) ? m.custom_field_values : []).forEach((cv: any) => {
              const name = String(cv.field_name || '').trim();
              if (!name) return;
              const key = name.toLowerCase();
              if (fieldIdByName[key]) return;
              const existing = existingDefs.find(d => d.name.toLowerCase() === key);
              if (existing) { fieldIdByName[key] = existing.id; return; }
              const localId = uid();
              newDefs.push({id: localId, name, type: 'text', sortOrder: psFieldDefs.length + newDefs.length});
              fieldIdByName[key] = localId;
            }));
            if (newDefs.length > 0) await store.set(KEYS.customFieldDefs, [...existingDefs, ...newDefs]);
            const cur = await store.get<Member[]>(KEYS.members, []) || [];
            const updated = cur.map(lm => {
              const ps = psMembers.find((m: any) => idMap[String(m.id)] === lm.id);
              if (!ps || !Array.isArray(ps.custom_field_values) || ps.custom_field_values.length === 0) return lm;
              const grouped: Record<string, string[]> = {};
              ps.custom_field_values.forEach((cv: any) => {
                const key = String(cv.field_name || '').trim().toLowerCase();
                if (!key || cv.value == null) return;
                (grouped[key] = grouped[key] || []).push(String(cv.value));
              });
              const cf: CustomFieldValue[] = [...(lm.customFields || [])];
              Object.entries(grouped).forEach(([key, vals]) => {
                const fid = fieldIdByName[key];
                if (!fid) return;
                const valStr = vals.join('\n');
                const idx = cf.findIndex(c => c.fieldId === fid);
                if (idx >= 0) cf[idx] = {fieldId: fid, value: valStr};
                else cf.push({fieldId: fid, value: valStr});
              });
              return {...lm, customFields: cf};
            });
            await store.set(KEYS.members, updated);
          }

          if (extSel.groups && psGroups.length > 0) {
            const existingGroups = await store.get<MemberGroup[]>(KEYS.groups, []) || [];
            const mergedGroups: MemberGroup[] = [...existingGroups];
            const groupIdMap: Record<string, string> = {};
            psGroups.forEach((g: any) => {
              const name = String(g?.name || 'Group');
              let lg = mergedGroups.find(x => x.name.toLowerCase() === name.toLowerCase());
              if (!lg) { lg = {id: uid(), name, color: g?.color ? normHex(g.color) : undefined}; mergedGroups.push(lg); }
              groupIdMap[String(g?.id)] = lg.id;
              groupIdMap[name.toLowerCase()] = lg.id;
            });
            await store.set(KEYS.groups, mergedGroups);
            const cur = await store.get<Member[]>(KEYS.members, []) || [];
            const withGroups = cur.map(lm => {
              const ps = psMembers.find((m: any) => idMap[String(m.id)] === lm.id);
              if (!ps || !Array.isArray(ps.groups) || ps.groups.length === 0) return lm;
              const gids = ps.groups.map((g: any) => {
                const k = typeof g === 'object' && g !== null ? String(g.id ?? g.name ?? '') : String(g);
                return groupIdMap[k] || groupIdMap[k.toLowerCase()];
              }).filter(Boolean) as string[];
              if (gids.length === 0) return lm;
              return {...lm, groupIds: [...new Set([...(lm.groupIds || []), ...gids])]};
            });
            await store.set(KEYS.members, withGroups);
          }

          if (extSel.frontHistory && psFronts.length > 0) {
            const newH = convertPluralSpaceFronts(psFronts, idMap);
            await applyImportedHistory(newH);
          }

          if (extSel.journal && psJournal.length > 0) {
            const existingJ = await store.get<JournalEntry[]>(KEYS.journal, []) || [];
            const newJ: JournalEntry[] = psJournal.map((j: any) => ({
              id: uid(),
              title: String(j.title || '').trim(),
              body: String(j.content || ''),
              authorIds: (Array.isArray(j.members) ? j.members : []).map((m: any) => idMap[String(m?.id)] || nameToLocal[String(m?.name || '').trim().toLowerCase()]).filter(Boolean) as string[],
              hashtags: [],
              timestamp: psTime(j.date) || psTime(j.created_at) || Date.now(),
            }));
            const jSig = (j: JournalEntry) => `${j.timestamp}|${j.title}`;
            const existingJSigs = new Set(existingJ.map(jSig));
            const mergedJ = [...newJ.filter(j => !existingJSigs.has(jSig(j))), ...existingJ].sort((a, b) => b.timestamp - a.timestamp);
            await store.set(KEYS.journal, mergedJ);
          }

          if (extSel.chat && psChat.length > 0) {
            const existingCh = await store.get<ChatChannel[]>(KEYS.chatChannels, []) || [];
            const mergedCh: ChatChannel[] = [...existingCh];
            for (const ch of psChat) {
              const chName = String(ch?.name || '').trim() || 'Imported';
              let local = mergedCh.find(c => c.name.toLowerCase() === chName.toLowerCase());
              if (!local) { local = {id: uid(), name: chName, createdAt: psTime(ch?.created_at) || Date.now()}; mergedCh.push(local); }
              const msgs: any[] = Array.isArray(ch?.messages) ? ch.messages : [];
              if (msgs.length > 0) {
                const existingMsgs = await store.get<ChatMessage[]>(chatMsgKey(local.id), []) || [];
                const newMsgs: ChatMessage[] = msgs.map((msg: any) => ({
                  id: uid(),
                  channelId: local!.id,
                  authorId: nameToLocal[String(msg?.member_name || '').trim().toLowerCase()] || '',
                  type: 'text' as const,
                  content: String(msg?.content || ''),
                  timestamp: psTime(msg?.created_at) || Date.now(),
                }));
                const msgSig = (x: ChatMessage) => `${x.timestamp}|${x.authorId}|${x.content}`;
                const existingMsgSigs = new Set(existingMsgs.map(msgSig));
                const mergedMsgs = [...existingMsgs, ...newMsgs.filter(x => !existingMsgSigs.has(msgSig(x)))].sort((a, b) => a.timestamp - b.timestamp);
                await store.set(chatMsgKey(local.id), mergedMsgs);
              }
            }
            await store.set(KEYS.chatChannels, mergedCh);
          }

          if (extSel.polls && psPolls.length > 0) {
            const existingPolls = await store.get<MemberPoll[]>(KEYS.polls, []) || [];
            const newPolls: MemberPoll[] = psPolls.map((p: any) => {
              const creator = idMap[String(p?.created_by_member?.id)] || nameToLocal[String(p?.created_by_member?.name || '').trim().toLowerCase()] || '';
              const desc = String(p?.description || '').trim();
              return {
                id: uid(),
                targetMemberId: creator,
                question: [String(p?.title || '').trim(), desc].filter(Boolean).join(' — ') || '?',
                options: (Array.isArray(p?.options) ? p.options : []).map((o: any) => ({
                  id: uid(),
                  label: String(o?.text || ''),
                  votes: [...new Set((Array.isArray(o?.votes) ? o.votes : []).map((v: any) => nameToLocal[String(v?.member_name || '').trim().toLowerCase()]).filter(Boolean))] as string[],
                })),
                createdBy: creator,
                createdAt: psTime(p?.created_at) || Date.now(),
                closedAt: p?.status && p.status !== 'open' ? (psTime(p?.closes_at) || Date.now()) : undefined,
              };
            });
            const pollSig = (p: MemberPoll) => `${p.createdAt}|${p.question}`;
            const existingPollSigs = new Set(existingPolls.map(pollSig));
            await store.set(KEYS.polls, [...existingPolls, ...newPolls.filter(p => !existingPollSigs.has(pollSig(p)))]);
          }

          const avIndex: Record<string, string> = {};
          psMembers.forEach((m: any) => {
            const lid = idMap[String(m.id)];
            const p = String(m.avatar_media_path || '');
            if (!lid || !p) return;
            const base = (p.split('/').pop() || '').toLowerCase();
            if (base) avIndex[base] = lid;
          });
          if (extSel.avatars && psZipFiles) {
            setRestoreProgress(t('share.progressAvatars'));
            const saved: Record<string, string> = {};
            const withA = psMembers.filter((m: any) => idMap[String(m.id)] && m.avatar_media_path && psZipFiles[String(m.avatar_media_path)]);
            let done = 0;
            for (const m of withA) {
              const lid = idMap[String(m.id)];
              const uri = await saveAvatar(lid, base64FromU8(psZipFiles[String(m.avatar_media_path)])).catch(() => null);
              if (uri) saved[lid] = uri;
              done++; setRestoreProgress(t('share.progressAvatarsN', {done, total: withA.length}));
            }
            if (Object.keys(saved).length > 0) {
              const cur = await store.get<Member[]>(KEYS.members, []) || [];
              await store.set(KEYS.members, cur.map(m => saved[m.id] ? {...m, avatar: saved[m.id]} : m));
            }
            setRestoreProgress('');
            setPsAvatarIndex(null);
          } else {
            setPsAvatarIndex(extSel.avatars && Object.keys(avIndex).length > 0 ? avIndex : null);
          }

          if (extSel.avatars && !psZipFiles) {
            const urls: Record<string, string> = {};
            psMembers.forEach((m: any) => { const lid = idMap[String(m.id)]; const u = String(m.avatar_path || ''); if (lid && /^https?:\/\//.test(u)) urls[lid] = u; });
            await downloadAvatarsTo(urls);
          }

          setImportStatus('success'); setImportMsg(t('share.importComplete'));
          setExtPreview(null);
          setTimeout(() => onDataImported(), 800);
        } catch (e: any) { setImportStatus('error'); setImportMsg(e.message || 'Import failed.'); }
      }},
    ]);
  };

  const handlePluralSpaceAvatarsPick = async () => {
    if (!psAvatarIndex) return;
    try {
      const results = await safePick({type: ['image/*'], allowMultiSelection: true});
      if (!results || results.length === 0) return;
      setRestoreProgress(t('share.progressAvatars'));
      const saved: Record<string, string> = {};
      await parallelMap(results, async (res: any) => {
        const path = getPickedFilePath(res);
        const base = String(res.name || path.split('/').pop() || '').trim().toLowerCase();
        const memberId = psAvatarIndex[base];
        if (!memberId) return;
        let b64: string;
        try { b64 = await ReactNativeBlobUtil.fs.readFile(path, 'base64'); }
        catch { b64 = await ReactNativeBlobUtil.fs.readFile(res.uri || path, 'base64'); }
        const fileUri = await saveAvatar(memberId, b64).catch(() => null);
        if (fileUri) saved[memberId] = fileUri;
      }, 4, (done, total) => setRestoreProgress(t('share.progressAvatarsN', {done, total})));
      setRestoreProgress('');
      const count = Object.keys(saved).length;
      if (count > 0) {
        const cur = await store.get<Member[]>(KEYS.members, []) || [];
        await store.set(KEYS.members, cur.map(m => saved[m.id] ? {...m, avatar: saved[m.id]} : m));
        setImportStatus('success'); setImportMsg(t('share.psAvatarsImported', {count}));
        setPsAvatarIndex(null);
        onDataImported();
      } else {
        setImportStatus('error'); setImportMsg(t('share.psAvatarsNoMatch'));
      }
    } catch (e: any) { if (!isPickerCancel(e)) { setRestoreProgress(''); setImportStatus('error'); setImportMsg(e.message || 'Could not import avatars.'); } }
  };

  const handleAmpersandPick = async () => {
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
    } catch (e: any) { if (!isPickerCancel(e)) Alert.alert(t('share.importFailed'), e.message || 'Could not read .ampar file.'); }
  };

  const handleAmpersandConfirm = () => {
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
            // Members not being replaced — map archive uuids onto existing amp: members so history still resolves.
            const existing = await store.get<Member[]>(KEYS.members, []) || [];
            amMembers.forEach((a: any) => { const ex = existing.find(m => m.sourceId === 'amp:' + String(a.uuid)); if (ex) idMap[String(a.uuid)] = ex.id; });
          }

          if (extSel.frontHistory) {
            const switches = amFronts.map((f: any) => ({content: {member: String(f.member), startTime: f.startTime, endTime: f.endTime ?? null}}));
            const newH = convertSPSwitches(switches, idMap);
            await applyImportedHistory(newH);
          }

          setImportStatus('success'); setImportMsg(t('share.importComplete'));
          setExtPreview(null);
          setTimeout(() => onDataImported(), 800);
        } catch (e: any) { setImportStatus('error'); setImportMsg(e.message || 'Import failed.'); }
      }},
    ]);
  };

  const handleExtImport = () => {
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
              role: isPK ? '' : (m.content?.role || ''),
              color: isPK ? (m.color ? `#${m.color}` : '#DAA520') : (m.content?.color || '#DAA520'),
              description: isPK ? (m.description || '') : (m.content?.desc || ''),
              archived: !isPK && !!m.content?.archived ? true : undefined,
            };
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
              role: incoming.role as string,
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
                `Members matched by ID: ${membersMatched} / ${currentMembers.length}`,
                `Members with custom-field data attached: ${membersWithInfo}`,
                `Custom-field keys seen: ${totalInfoKeys}, written: ${matchedKeys}`,
                membersWithInfo === 0
                  ? 'SimplyPlural did not return any per-member custom field data. The token may lack read access to member content, or your SP account stores CF data under a shape we do not recognize.'
                  : `${totalInfoKeys - matchedKeys} keys did not match any of our field IDs/names. Sample unmatched keys: ${sampleStr || '(none)'}`,
              ];
              Alert.alert('Custom Fields — partial import', lines.join('\n\n'));
            }
          }
          if (extSel.groups && extPreview.groups && extPreview.groups.length > 0) {
            const existingGroups = await store.get<MemberGroup[]>(KEYS.groups, []) || [];
            const newGroups: MemberGroup[] = [];
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
              const existing = existingGroups.find(eg => eg.name.toLowerCase() === gName.toLowerCase());
              const localId = existing ? existing.id : uid();
              if (!existing) newGroups.push({id: localId, name: gName, color: gColor});
              groupIdMap[externalId] = localId;
              groupMemberMap[localId] = externalMembers;
            });
            if (newGroups.length > 0) await store.set(KEYS.groups, [...existingGroups, ...newGroups]);
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
            await applyImportedHistory(newH);
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
          await applyImportedHistory(newH);
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

  const handleSPFileImport = async () => {
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

  const handleSPFileConfirmImport = () => {
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
            await applyImportedHistory(newH);
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

  const handleScanRecovery = async () => {
    setRecoverScanning(true);
    setRecoverDone(false);
    try {
      const entries = await listRecoverableBackups();
      setRecoverEntries(entries);
      const sel: Record<string, boolean> = {};
      entries.forEach(e => { sel[e.key] = true; });
      setRecoverSel(sel);
    } catch (e) {
      Alert.alert(t('share.recoverScanFailed'), String(e));
      setRecoverEntries([]);
    } finally {
      setRecoverScanning(false);
    }
  };

  const handleApplyRecovery = async () => {
    if (!recoverEntries) return;
    const toRestore = recoverEntries.filter(e => recoverSel[e.key]);
    if (toRestore.length === 0) return;
    Alert.alert(
      t('share.recoverConfirmTitle'),
      t('share.recoverConfirmMsg', {count: toRestore.length}),
      [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('share.recoverConfirm'), style: 'destructive', onPress: async () => {
          let okCount = 0;
          for (const entry of toRestore) {
            const ok = await restoreFromBackup(entry.key);
            if (ok) okCount++;
          }
          setRecoverDone(true);
          setTimeout(() => onDataImported(), 600);
        }},
      ]
    );
  };

  const friendlyKeyName = (key: string): string => {
    switch (key) {
      case KEYS.system: return catSystemLabel;
      case KEYS.members: return catMembersLabel;
      case KEYS.front: return singlet ? t('tabs.status') : t('hub.front');
      case KEYS.history: return catFrontLabel;
      case KEYS.journal: return t('share.journalEntries');
      case KEYS.groups: return t('share.memberGroups');
      case KEYS.chatChannels: return t('share.chatData');
      default: return key.replace(/^ps:/, '');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(t('share.deleteAllDataTitle'), t('share.deleteAllDataMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('share.deleteEverything'), style: 'destructive', onPress: () => {
        Alert.alert(t('share.areYouAbsolutelySure'), t('share.allDataGone'), [
          {text: t('common.cancel'), style: 'cancel'},
          {text: t('share.yesDeleteEverything'), style: 'destructive', onPress: onDeleteAccount},
        ]);
      }},
    ]);
  };

  const SectionBtn = ({id, label}: {id: Section; label: string}) => (
    <TouchableOpacity onPress={() => setSection(id)} activeOpacity={0.7}
      accessibilityRole="tab" accessibilityState={{selected: section === id}} accessibilityLabel={label}
      style={{flex: 1, paddingVertical: 8, borderRadius: 7, borderWidth: 1, alignItems: 'center',
        backgroundColor: section === id ? T.accentBg : 'transparent', borderColor: section === id ? `${T.accent}40` : T.border}}>
      <Text style={{fontSize: fs(12), color: section === id ? T.accent : T.dim, fontWeight: section === id ? '600' : '400'}}>{label}</Text>
    </TouchableOpacity>
  );

  const SourceBtn = ({id, label}: {id: ImportSource; label: string}) => (
    <TouchableOpacity onPress={() => {setImportSource(id); setExtPreview(null); setExtToken('');}} activeOpacity={0.7}
      accessibilityRole="tab" accessibilityState={{selected: importSource === id}} accessibilityLabel={label}
      style={{paddingVertical: 7, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1,
        backgroundColor: importSource === id ? T.accentBg : 'transparent', borderColor: importSource === id ? `${T.accent}40` : T.border}}>
      <Text style={{fontSize: fs(12), color: importSource === id ? T.accent : T.dim, fontWeight: importSource === id ? '600' : '400'}}>{label}</Text>
    </TouchableOpacity>
  );

  const Divider = ({label}: {label: string}) => (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 18}}>
      <View style={{flex: 1, height: 1, backgroundColor: T.border}} />
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.muted, fontWeight: '600'}}>{label}</Text>
      <View style={{flex: 1, height: 1, backgroundColor: T.border}} />
    </View>
  );

  const Toggle = ({value, onToggle, label}: {value: boolean; onToggle: () => void; label?: string}) => (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.8} accessibilityRole="switch" accessibilityState={{checked: value}} accessibilityLabel={label} style={{width: 40, height: 22, borderRadius: 11, backgroundColor: value ? T.accent : T.toggleOff, justifyContent: 'center'}}>
      <View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', position: 'absolute', left: value ? 20 : 3}} />
    </TouchableOpacity>
  );

  const SectionRow = ({label, sublabel, value, onToggle, disabled = false}: any) => (
    <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: T.border, paddingHorizontal: 14, opacity: disabled ? 0.4 : 1}}>
      <View style={{flex: 1}}><Text style={{fontSize: fs(14), color: T.text, fontWeight: '500'}}>{label}</Text>{sublabel && <Text style={{fontSize: fs(11), color: T.muted, marginTop: 2}}>{sublabel}</Text>}</View>
      <Toggle value={value && !disabled} onToggle={disabled ? () => {} : onToggle} label={label} />
    </View>
  );

  const PreviewTier = ({label, fronters, color}: {label: string; fronters: Member[]; color: string}) => {
    if (fronters.length === 0) return null;
    return (
      <View style={{marginTop: 8}}>
        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color, fontWeight: '600', marginBottom: 5}}>{label}</Text>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
          {fronters.map(m => (
            <View key={m.id} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, backgroundColor: `${m.color}18`, borderColor: `${m.color}30`}}>
              <View style={{width: 7, height: 7, borderRadius: 3.5, backgroundColor: m.color}} /><Text style={{fontSize: fs(13), color: T.text}}>{m.name}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={{flexDirection: 'row', gap: 6, marginBottom: 4}}>
        <SectionBtn id="export" label={t('share.export')} />
        <SectionBtn id="import" label={t('share.import')} />
        <SectionBtn id="shareview" label={t('share.shareView')} />
      </View>

      {section === 'export' && (
        <View>
          <Divider label={t('share.fullSystemExport')} />
          <Text style={[s.para, {color: T.dim}]}>{t('share.downloadsDirectly')}</Text>

          <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8, marginTop: 4}}>{t('share.exportCategories')}</Text>
          <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 14}}>
            {([
              ['system', catSystemLabel],
              ['members', catMembersLabel],
              ['avatars', t('share.profilePictures')],
              ['banners', t('share.banners')],
              ['frontHistory', catFrontLabel],
              ['journal', t('share.journalEntries')],
              ['groups', t('share.memberGroups')],
              ['chat', t('share.chatData')],
              ['moods', t('share.customMoodsLabel')],
              ['palettes', t('share.themePalettes')],
              ['settings', t('share.appSettings')],
              ['customFields', t('customFields.title')],
              ['noteboards', t('noteboard.title')],
              ['polls', t('polls.title')],
              ['journalTemplates', t('journal.templatesTab')],
              ['relationships', t('systemMap.title')],
              ['medical', t('medical.title')],
            ] as [keyof ExportCategories, string][]).map(([k, label]) => (
              <SectionRow key={k} label={label} value={!!exportSel[k]} onToggle={() => togExp(k)} />
            ))}
          </View>

          <View style={{flexDirection: 'row', gap: 8, marginBottom: 6}}>
            {[['↓ ZIP', handleJSON, T.accentBg, T.accent, `${T.accent}40`], ['↓ HTML', handleHTML, T.infoBg, T.info, `${T.info}40`]].map(([label, fn, bg, color, border]: any) => (
              <TouchableOpacity key={label} onPress={fn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label} style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: bg, borderColor: border}}>
                <Text style={{fontSize: fs(14), fontWeight: '500', color}}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[s.hint, {color: T.muted}]}>{t('share.htmlHint')}</Text>
          <Divider label={t('share.journalExport')} />
          <Text style={[s.para, {color: T.dim}]}>{t('share.exportJournalOnly')}</Text>
          <View style={{flexDirection: 'row', gap: 8, marginBottom: 6}}>
            {[['↓ .txt', 'txt', T.accentBg, T.accent, `${T.accent}40`], ['↓ .md', 'md', T.infoBg, T.info, `${T.info}40`], ['↓ .json', 'json', 'transparent', T.dim, T.border]].map(([label, fmt, bg, color, border]: any) => (
              <TouchableOpacity key={fmt} onPress={() => handleJournalExport(fmt)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label} style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: bg, borderColor: border}}>
                <Text style={{fontSize: fs(13), fontWeight: '500', color}}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[s.hint, {color: T.muted}]}>{t('share.perEntryHint')}</Text>
          <Divider label={t('share.sendEmail')} />
          <TextInput value={emailAddr} onChangeText={setEmailAddr} placeholder="recipient@email.com" placeholderTextColor={T.muted} keyboardType="email-address" autoCapitalize="none"
            style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(14), marginBottom: 10}} />
          <TouchableOpacity onPress={handleEmail} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.openInMail')} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
            <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>{t('share.openInMail')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {section === 'import' && (
        <View>
          {!appSettings.filesEnabled ? (
            <View style={{alignItems: 'center', paddingVertical: 48}}>
              <Text style={{fontSize: fs(36), opacity: 0.4, marginBottom: 12}}>↑</Text>
              <Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center'}}>{t('share.filesDisabled')}</Text>
            </View>
          ) : (
          <>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, marginBottom: 4}}>
            <SourceBtn id="journal" label={t('share.journalFile')} />
            <SourceBtn id="backup" label={t('share.backup')} />
            <SourceBtn id="simplyplural" label={t('share.simplyPlural')} />
            <SourceBtn id="pluralkit" label={t('share.pluralKit')} />
            <SourceBtn id="spfile" label={t('share.spFile')} />
            <SourceBtn id="ampersand" label={t('share.ampersand')} />
            <SourceBtn id="pluralspace" label={t('share.pluralSpace')} />
          </View>
          {importSource === 'journal' && (
            <View>
              <Divider label={t('share.importJournalEntry')} />
              <Text style={[s.para, {color: T.dim}]}>{t('share.importJournalDesc')}</Text>
              <TouchableOpacity onPress={handleImportJournalFile} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.pickFile')} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
                <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>{t('share.pickFile')}</Text>
              </TouchableOpacity>
              {importStatus === 'success' && <View style={{backgroundColor: T.successBg, borderWidth: 1, borderColor: `${T.success}30`, borderRadius: 8, padding: 12, marginBottom: 12}}><Text style={{fontSize: fs(13), color: T.success}}>✓ {importMsg}</Text></View>}
              {importStatus === 'error' && <View style={{backgroundColor: T.dangerBg, borderWidth: 1, borderColor: `${T.danger}30`, borderRadius: 7, padding: 10, marginBottom: 12}}><Text style={{fontSize: fs(13), color: T.danger}}>⚠ {importMsg}</Text></View>}
            </View>
          )}
          {importSource === 'backup' && (
            <View>
              <Divider label={t('share.restoreBackup')} />
              <Text style={[s.para, {color: T.dim}]}>{t('share.restoreBackupDesc')}</Text>
              <Text style={[s.para, {color: T.muted, fontSize: fs(11)}]}>{t('share.importFormatsNote')}</Text>
              <View style={{flexDirection: 'row', gap: 10, marginBottom: 8}}>
                <TouchableOpacity onPress={handlePickZipBackup} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.importZipBtn')} style={{flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 8, borderWidth: 1.5, backgroundColor: T.accentBg, borderColor: `${T.accent}80`}}>
                  <Text style={{fontSize: fs(16)}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">📦</Text>
                  <Text style={{fontSize: fs(14), fontWeight: '700', color: T.accent}}>{t('share.importZipBtn')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handlePickBackup} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.importJsonBtn')} style={{flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 8, borderWidth: 1, backgroundColor: T.infoBg, borderColor: `${T.info}40`}}>
                  <Text style={{fontSize: fs(16)}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{'{ }'}</Text>
                  <Text style={{fontSize: fs(14), fontWeight: '600', color: T.info}}>{t('share.importJsonBtn')}</Text>
                </TouchableOpacity>
              </View>
              <Text style={[s.para, {color: T.muted, fontSize: fs(11), marginBottom: 12}]}>{t('share.importZipHint')}</Text>
              {restoreFile ? (
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: T.success, backgroundColor: T.successBg, marginBottom: 12}}>
                  <Text style={{fontSize: fs(14), color: T.success}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</Text>
                  <Text style={{fontSize: fs(13), color: T.success, flex: 1}} numberOfLines={1}>{restoreFile}</Text>
                </View>
              ) : null}
              {restoreError ? <View style={{backgroundColor: T.dangerBg, borderWidth: 1, borderColor: `${T.danger}30`, borderRadius: 7, padding: 10, marginBottom: 12}}><Text style={{fontSize: fs(13), color: T.danger}}>⚠ {restoreError}</Text></View> : null}
              {restorePreview && (
                <>
                  <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{t('share.restoreCategories')}</Text>
                  <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 14}}>
                    {([
                      ['system', catSystemLabel],
                      ['members', catMembersLabel],
                      ['avatars', t('share.profilePictures')],
                      ['banners', t('share.banners')],
                      ['frontHistory', catFrontLabel],
                      ['journal', t('share.journalEntries')],
                      ['groups', t('share.memberGroups')],
                      ['chat', t('share.chatData')],
                      ['moods', t('share.customMoodsLabel')],
                      ['palettes', t('share.themePalettes')],
                      ['settings', t('share.appSettings')],
                      ['customFields', t('customFields.title')],
                      ['noteboards', t('noteboard.title')],
                      ['polls', t('polls.title')],
                      ['journalTemplates', t('journal.templatesTab')],
                      ['relationships', t('systemMap.title')],
                      ['medical', t('medical.title')],
                    ] as any[]).map(([k, label]) => (
                      <SectionRow key={k} label={label} value={restoreSel[k as keyof typeof restoreSel]} onToggle={() => togR(k)} />
                    ))}
                  </View>
                  {restoreDone ? <View style={{backgroundColor: T.successBg, borderWidth: 1, borderColor: `${T.success}30`, borderRadius: 8, padding: 12, alignItems: 'center'}}><Text style={{fontSize: fs(13), color: T.success, fontWeight: '500'}}>{t('share.restoreComplete')}</Text></View>
                    : restoring ? <View style={{alignItems: 'center', paddingVertical: 16}}><ActivityIndicator color={T.accent} /><Text style={{fontSize: fs(12), color: T.dim, marginTop: 8}} numberOfLines={2}>{restoreProgress || t('share.importing')}</Text></View>
                    : <TouchableOpacity onPress={handleRestore} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.restoreSelectedData')} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.dangerBg, borderColor: `${T.danger}40`}}><Text style={{fontSize: fs(14), fontWeight: '500', color: T.danger}}>{t('share.restoreSelectedData')}</Text></TouchableOpacity>}
                </>
              )}
              <Divider label={t('share.recoverData')} />
              <Text style={[s.para, {color: T.dim}]}>{t('share.recoverDataDesc')}</Text>
              {!recoverEntries ? (
                <TouchableOpacity onPress={handleScanRecovery} disabled={recoverScanning} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.scanForBackups')} accessibilityState={{disabled: recoverScanning}} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border, marginBottom: 14, opacity: recoverScanning ? 0.5 : 1}}>
                  {recoverScanning ? <ActivityIndicator color={T.accent} size="small" /> : <Text style={{fontSize: fs(14), fontWeight: '500', color: T.text}}>{t('share.scanForBackups')}</Text>}
                </TouchableOpacity>
              ) : recoverEntries.length === 0 ? (
                <View style={{padding: 14, borderRadius: 8, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, marginBottom: 14}}>
                  <Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center'}}>{t('share.noBackupsFound')}</Text>
                  <TouchableOpacity onPress={() => {setRecoverEntries(null); setRecoverDone(false);}} activeOpacity={0.7} accessibilityRole="button" style={{alignSelf: 'center', marginTop: 8}}>
                    <Text style={{fontSize: fs(12), color: T.accent}}>{t('share.scanAgain')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 14}}>
                    {recoverEntries.map(entry => {
                      const sizeLabel = entry.sizeBytes > 1024 * 1024 ? `${(entry.sizeBytes / 1024 / 1024).toFixed(1)} MB` : entry.sizeBytes > 1024 ? `${(entry.sizeBytes / 1024).toFixed(0)} KB` : `${entry.sizeBytes} B`;
                      const dateLabel = entry.mtime ? new Date(entry.mtime).toLocaleString() : '';
                      const checked = !!recoverSel[entry.key];
                      return (
                        <TouchableOpacity key={entry.key} onPress={() => setRecoverSel(s => ({...s, [entry.key]: !s[entry.key]}))} activeOpacity={0.7}
                          accessibilityRole="checkbox" accessibilityState={{checked}} accessibilityLabel={friendlyKeyName(entry.key)}
                          style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: T.border, gap: 12}}>
                          <View style={{width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: checked ? T.accent : T.border, backgroundColor: checked ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
                            {checked ? <Text style={{fontSize: fs(11), color: '#fff', fontWeight: '700'}}>✓</Text> : null}
                          </View>
                          <View style={{flex: 1}}>
                            <Text style={{fontSize: fs(14), color: T.text, fontWeight: '500'}}>{friendlyKeyName(entry.key)}</Text>
                            <Text style={{fontSize: fs(11), color: T.muted, marginTop: 2}}>{entry.preview} · {sizeLabel}{dateLabel ? ` · ${dateLabel}` : ''}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {recoverDone ? (
                    <View style={{backgroundColor: T.successBg, borderWidth: 1, borderColor: `${T.success}30`, borderRadius: 8, padding: 12, alignItems: 'center', marginBottom: 14}}>
                      <Text style={{fontSize: fs(13), color: T.success, fontWeight: '500'}}>{t('share.recoverComplete')}</Text>
                    </View>
                  ) : (
                    <View style={{flexDirection: 'row', gap: 8, marginBottom: 14}}>
                      <TouchableOpacity onPress={() => {setRecoverEntries(null); setRecoverSel({}); setRecoverDone(false);}} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')} style={{flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
                        <Text style={{fontSize: fs(13), fontWeight: '500', color: T.dim}}>{t('common.cancel')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleApplyRecovery} activeOpacity={0.7} disabled={Object.values(recoverSel).every(v => !v)} accessibilityRole="button" accessibilityLabel={t('share.recoverSelected')} style={{flex: 2, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, opacity: Object.values(recoverSel).every(v => !v) ? 0.4 : 1}}>
                        <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>{t('share.recoverSelected')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
              <Divider label={t('share.deleteAccount')} />
              <Text style={[s.para, {color: T.dim}]}>{t('share.deleteAccountDesc')}</Text>
              <TouchableOpacity onPress={handleDeleteAccount} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.deleteAllData')} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.dangerBg, borderColor: `${T.danger}40`}}>
                <Text style={{fontSize: fs(14), fontWeight: '500', color: T.danger}}>{t('share.deleteAllData')}</Text>
              </TouchableOpacity>
            </View>
          )}
          {(importSource === 'simplyplural' || importSource === 'pluralkit') && (
            <View>
              <Divider label={importSource === 'simplyplural' ? t('share.spImport') : t('share.pkImport')} />
              <Text style={[s.para, {color: T.dim}]}>{importSource === 'simplyplural' ? t('share.spTokenHint') : t('share.pkTokenHint')}</Text>
              <TextInput value={extToken} onChangeText={setExtToken} placeholder={importSource === 'simplyplural' ? t('share.spTokenPlaceholder') : t('share.pkTokenPlaceholder')} placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false}
                style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(14), marginBottom: 10, fontFamily: 'monospace'}} />
              <TouchableOpacity onPress={importSource === 'simplyplural' ? handleSimplyPluralFetch : handlePluralKitFetch} disabled={extLoading} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={t('share.fetchData')} accessibilityState={{disabled: extLoading}}
                style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10, opacity: extLoading ? 0.5 : 1}}>
                <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>{extLoading ? t('share.fetching') : t('share.fetchData')}</Text>
              </TouchableOpacity>
              {extLoading && <ActivityIndicator color={T.accent} style={{marginTop: 12}} />}
              {extPreview && (
                <View>
                  <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 14}}>
                    <Text style={{fontSize: fs(16), fontWeight: '600', color: T.accent}}>{extPreview.system?.content?.username || extPreview.system?.name || extPreview.system?.username || t('share.system')}</Text>
                    <Text style={{fontSize: fs(12), color: T.dim, marginTop: 2}}>{t('share.membersCount', {count: extPreview.members.length})} · {t('share.frontEntries', {count: extPreview.switches.length})}</Text>
                  </View>
                  <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{t('share.importCategories')}</Text>
                  <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 14}}>
                    <SectionRow label={catSystemLabel} value={extSel.system} onToggle={() => togE('system')} />
                    <SectionRow label={catMembersLabel} sublabel={t('share.membersCount', {count: extPreview.members.length})} value={extSel.members} onToggle={() => togE('members')} />
                    {importSource === 'pluralkit' && (
                      <SectionRow label={t('share.usePkDisplayNames')} sublabel={t('share.usePkDisplayNamesHint')} value={extSel.displayNames} onToggle={() => togE('displayNames')} />
                    )}
                    <SectionRow label={t('share.profilePictures')} value={extSel.avatars} onToggle={() => togE('avatars')} />
                    {importSource === 'pluralkit' && (
                      <SectionRow label={t('share.banners')} value={extSel.banners} onToggle={() => togE('banners')} />
                    )}
                    <SectionRow label={catFrontLabel} sublabel={t('share.frontEntries', {count: extPreview.switches.length})} value={extSel.frontHistory} onToggle={() => togE('frontHistory')} />
                    {importSource === 'simplyplural' && (
                      <SectionRow label={t('customFields.title')} sublabel={t('share.customFieldsCount', {count: (extPreview.customFields || []).length})} value={extSel.customFields} onToggle={() => togE('customFields')} />
                    )}
                    {(importSource === 'simplyplural' || (extPreview.groups && extPreview.groups.length > 0)) && (
                      <SectionRow label={t('share.groups')} sublabel={t('share.groupsCount', {count: (extPreview.groups || []).length})} value={extSel.groups} onToggle={() => togE('groups')} />
                    )}
                  </View>
                  <TouchableOpacity onPress={handleExtImport} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.importSelected')} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
                    <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>{t('share.importSelected')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          {importSource === 'spfile' && (
            <View>
              <Divider label={t('share.spFileImport')} />
              <Text style={[s.para, {color: T.dim}]}>{t('share.spFileHint')}</Text>
              <TouchableOpacity onPress={handleSPFileImport} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.pickSPFile')}
                style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
                <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>{t('share.pickSPFile')}</Text>
              </TouchableOpacity>
              {extPreview && (
                <View>
                  <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 14}}>
                    <Text style={{fontSize: fs(16), fontWeight: '600', color: T.accent}}>{extPreview.system?.content?.username || extPreview.system?.username || t('share.system')}</Text>
                    <Text style={{fontSize: fs(12), color: T.dim, marginTop: 2}}>{t('share.membersCount', {count: extPreview.members.length})} · {t('share.frontEntries', {count: extPreview.switches.length})}</Text>
                  </View>
                  <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{t('share.importCategories')}</Text>
                  <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 14}}>
                    <SectionRow label={catSystemLabel} value={extSel.system} onToggle={() => togE('system')} />
                    <SectionRow label={catMembersLabel} sublabel={t('share.membersCount', {count: extPreview.members.length})} value={extSel.members} onToggle={() => togE('members')} />
                    <SectionRow label={t('share.profilePictures')} value={extSel.avatars} onToggle={() => togE('avatars')} />
                    <SectionRow label={catFrontLabel} sublabel={t('share.frontEntries', {count: extPreview.switches.length})} value={extSel.frontHistory} onToggle={() => togE('frontHistory')} />
                    {extPreview.groups && extPreview.groups.length > 0 && (
                      <SectionRow label={t('share.groups')} sublabel={t('share.groupsCount', {count: extPreview.groups.length})} value={extSel.groups} onToggle={() => togE('groups')} />
                    )}
                  </View>
                  <TouchableOpacity onPress={handleSPFileConfirmImport} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.importSelected')} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
                    <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>{t('share.importSelected')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          {importSource === 'ampersand' && (
            <View>
              <Divider label={t('share.ampersandImport')} />
              <Text style={[s.para, {color: T.dim}]}>{t('share.ampersandHint')}</Text>
              <TouchableOpacity onPress={handleAmpersandPick} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.pickAmparFile')}
                style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
                <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>{t('share.pickAmparFile')}</Text>
              </TouchableOpacity>
              {importStatus === 'success' && <View style={{backgroundColor: T.successBg, borderWidth: 1, borderColor: `${T.success}30`, borderRadius: 8, padding: 12, marginBottom: 12}}><Text style={{fontSize: fs(13), color: T.success}}>✓ {importMsg}</Text></View>}
              {importStatus === 'error' && <View style={{backgroundColor: T.dangerBg, borderWidth: 1, borderColor: `${T.danger}30`, borderRadius: 7, padding: 10, marginBottom: 12}}><Text style={{fontSize: fs(13), color: T.danger}}>⚠ {importMsg}</Text></View>}
              {extPreview && (
                <View>
                  <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 14}}>
                    <Text style={{fontSize: fs(16), fontWeight: '600', color: T.accent}}>{extPreview.system?.name || t('share.system')}</Text>
                    <Text style={{fontSize: fs(12), color: T.dim, marginTop: 2}}>{t('share.membersCount', {count: extPreview.members.length})} · {t('share.frontEntries', {count: extPreview.switches.length})}</Text>
                  </View>
                  <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{t('share.importCategories')}</Text>
                  <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 14}}>
                    <SectionRow label={catSystemLabel} value={extSel.system} onToggle={() => togE('system')} />
                    <SectionRow label={catMembersLabel} sublabel={t('share.membersCount', {count: extPreview.members.length})} value={extSel.members} onToggle={() => togE('members')} />
                    <SectionRow label={t('customFields.title')} value={extSel.customFields} onToggle={() => togE('customFields')} />
                    <SectionRow label={catFrontLabel} sublabel={t('share.frontEntries', {count: extPreview.switches.length})} value={extSel.frontHistory} onToggle={() => togE('frontHistory')} />
                  </View>
                  <TouchableOpacity onPress={handleAmpersandConfirm} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.importSelected')} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
                    <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>{t('share.importSelected')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          {importSource === 'pluralspace' && (
            <View>
              <Divider label={t('share.psImport')} />
              <Text style={[s.para, {color: T.dim}]}>{t('share.psHint')}</Text>
              <TouchableOpacity onPress={handlePluralSpacePick} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.pickPsFile')}
                style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
                <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>{t('share.pickPsFile')}</Text>
              </TouchableOpacity>
              {importStatus === 'success' && <View style={{backgroundColor: T.successBg, borderWidth: 1, borderColor: `${T.success}30`, borderRadius: 8, padding: 12, marginBottom: 12}}><Text style={{fontSize: fs(13), color: T.success}}>✓ {importMsg}</Text></View>}
              {importStatus === 'error' && <View style={{backgroundColor: T.dangerBg, borderWidth: 1, borderColor: `${T.danger}30`, borderRadius: 7, padding: 10, marginBottom: 12}}><Text style={{fontSize: fs(13), color: T.danger}}>⚠ {importMsg}</Text></View>}
              {restoreProgress ? <View style={{alignItems: 'center', paddingVertical: 12}}><ActivityIndicator color={T.accent} /><Text style={{fontSize: fs(12), color: T.dim, marginTop: 8}} numberOfLines={2}>{restoreProgress}</Text></View> : null}
              {psAvatarIndex && !extPreview && (
                <View style={{marginBottom: 10}}>
                  <Text style={[s.para, {color: T.dim}]}>{t('share.psAvatarsHint')}</Text>
                  <TouchableOpacity onPress={handlePluralSpaceAvatarsPick} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.psPickAvatars')}
                    style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.infoBg, borderColor: `${T.info}40`}}>
                    <Text style={{fontSize: fs(14), fontWeight: '500', color: T.info}}>{t('share.psPickAvatars')}</Text>
                  </TouchableOpacity>
                </View>
              )}
              {extPreview && (
                <View>
                  <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 14}}>
                    <Text style={{fontSize: fs(16), fontWeight: '600', color: T.accent}}>{extPreview.system?.name || t('share.system')}</Text>
                    <Text style={{fontSize: fs(12), color: T.dim, marginTop: 2}}>{t('share.membersCount', {count: extPreview.members.length})} · {t('share.frontEntries', {count: extPreview.switches.length})}</Text>
                  </View>
                  <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{t('share.importCategories')}</Text>
                  <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 14}}>
                    <SectionRow label={catSystemLabel} value={extSel.system} onToggle={() => togE('system')} />
                    <SectionRow label={catMembersLabel} sublabel={t('share.membersCount', {count: extPreview.members.length})} value={extSel.members} onToggle={() => togE('members')} />
                    <SectionRow label={t('share.profilePictures')} value={extSel.avatars} onToggle={() => togE('avatars')} />
                    <SectionRow label={t('customFields.title')} value={extSel.customFields} onToggle={() => togE('customFields')} />
                    <SectionRow label={catFrontLabel} sublabel={t('share.frontEntries', {count: extPreview.switches.length})} value={extSel.frontHistory} onToggle={() => togE('frontHistory')} />
                    {(extPreview.groups || []).length > 0 && (
                      <SectionRow label={t('share.groups')} sublabel={t('share.groupsCount', {count: (extPreview.groups || []).length})} value={extSel.groups} onToggle={() => togE('groups')} />
                    )}
                    {(extPreview.journal || []).length > 0 && (
                      <SectionRow label={t('share.journalEntries')} value={extSel.journal} onToggle={() => togE('journal')} />
                    )}
                    {(extPreview.chat || []).length > 0 && (
                      <SectionRow label={t('share.chatData')} value={extSel.chat} onToggle={() => togE('chat')} />
                    )}
                    {(extPreview.polls || []).length > 0 && (
                      <SectionRow label={t('polls.title')} value={extSel.polls} onToggle={() => togE('polls')} />
                    )}
                  </View>
                  <TouchableOpacity onPress={handlePluralSpaceConfirm} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.importSelected')} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
                    <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>{t('share.importSelected')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          </>
          )}
        </View>
      )}

      {section === 'shareview' && (
        <View>
          <Text style={[s.para, {color: T.dim, marginTop: 8}]}>{t('share.controlVisibility')}</Text>
          <View style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 4}}>
            <SectionRow label={singlet ? t('share.showCurrentStatus') : t('share.showCurrentFront')} value={shareSettings.showFront} onToggle={() => tog('showFront')} />
            {!singlet && <SectionRow label={t('share.showMemberList')} value={shareSettings.showMembers} onToggle={() => tog('showMembers')} />}
            <SectionRow label={t('share.showMemberDescriptions')} value={shareSettings.showDescriptions} onToggle={() => tog('showDescriptions')} />
          </View>
          <Divider label={t('share.preview')} />
          <View style={{backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 16}}>
            <Text style={{fontFamily: 'OpenDyslexic', fontSize: fs(20), color: T.accent, marginBottom: 4, fontStyle: 'italic'}}>{system.name}</Text>
            {system.description ? <Text style={{fontSize: fs(12), color: T.dim, lineHeight: 18, marginBottom: 12}}>{system.description}</Text> : null}
            {shareSettings.showFront && (
              <View>
                {primaryFronters.length === 0 && coFronters.length === 0 && coConsciousFronters.length === 0
                  ? <Text style={{fontSize: fs(12), color: T.muted, marginTop: 8}}>{t('share.nobodySet')}</Text>
                  : singlet
                  ? (<PreviewTier label={t('tabs.status')} fronters={primaryFronters} color={T.accent} />)
                  : (<><PreviewTier label={t('tier.primaryFront')} fronters={primaryFronters} color={T.accent} /><PreviewTier label={t('tier.coFront')} fronters={coFronters} color={T.info} /><PreviewTier label={t('tier.coConscious')} fronters={coConsciousFronters} color={T.success} /></>)}
              </View>
            )}
            {!singlet && shareSettings.showMembers && members.length > 0 && (
              <View style={{marginTop: 10}}>
                <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 6}}>{t('share.membersLabel', {count: members.length})}</Text>
                {members.slice(0, 4).map(m => (
                  <View key={m.id} style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5}}>
                    <View style={{width: 7, height: 7, borderRadius: 3.5, backgroundColor: m.color}} />
                    <Text style={{fontSize: fs(13), color: T.text}}>{m.name}</Text>
                    {m.pronouns ? <Text style={{fontSize: fs(11), color: T.dim}}>({m.pronouns})</Text> : null}
                  </View>
                ))}
                {members.length > 4 && <Text style={{fontSize: fs(11), color: T.muted, marginTop: 2}}>{t('share.more', {count: members.length - 4})}</Text>}
              </View>
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const s = StyleSheet.create({
  content: {padding: 16, paddingBottom: 40},
  heading: {fontFamily: 'OpenDyslexic', fontSize: 22, fontWeight: '600', fontStyle: 'italic', marginBottom: 16},
  para: {fontSize: 13, lineHeight: 19, marginBottom: 14},
  hint: {fontSize: 11, marginBottom: 4, lineHeight: 16},
});
