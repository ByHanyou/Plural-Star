import React, {useState} from 'react';
import {View, ScrollView, TouchableOpacity, Alert, StyleSheet, ActivityIndicator} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {exportJSON, exportHTML, exportEmail, exportAllJournalJSON, exportAllJournalTxt, exportAllJournalMd, ExportCategories} from '../export/exportUtils';
import {store, KEYS, chatMsgKey, listRecoverableBackups, restoreFromBackup, RecoverableEntry} from '../storage';
import {SystemInfo, Member, MemberGroup, FrontState, HistoryEntry, JournalEntry, ShareSettings, AppSettings, ExportPayload, CustomFieldDef, CustomFieldType, CustomFieldValue, uid, allFrontMemberIds, findOpenFrontInHistory} from '../utils';

type Section = 'export' | 'import' | 'shareview';
type ImportSource = 'backup' | 'journal' | 'simplyplural' | 'pluralkit' | 'spfile';

import {saveAvatarFromUrl, saveAvatar, saveBannerFromBase64, saveBannerFromUrl, migrateInlineChatMedia} from '../utils/mediaUtils';
import {parallelMap} from '../utils/concurrency';

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
  const [restorePreview, setRestorePreview] = useState<boolean>(false);
  const [restoreSel, setRestoreSel] = useState({system: true, members: true, avatars: true, banners: true, journal: true, frontHistory: true, groups: true, chat: true, moods: true, palettes: true, settings: true, customFields: true, noteboards: true, polls: true, journalTemplates: true});
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
  const [extPreview, setExtPreview] = useState<{members: any[]; switches: any[]; system: any; customFields?: any[]; groups?: any[]} | null>(null);
  const [extSel, setExtSel] = useState({system: true, members: true, avatars: true, banners: true, frontHistory: true, customFields: true, groups: true});

  const primaryFronters = (front?.primary?.memberIds || []).map(getMember).filter(Boolean) as Member[];
  const coFronters = (front?.coFront?.memberIds || []).map(getMember).filter(Boolean) as Member[];
  const coConsciousFronters = (front?.coConscious?.memberIds || []).map(getMember).filter(Boolean) as Member[];

  const tog = (k: keyof ShareSettings) => onSettingsChange({...shareSettings, [k]: !shareSettings[k]});
  const togR = (k: keyof typeof restoreSel) => setRestoreSel(s => ({...s, [k]: !s[k]}));
  const togE = (k: keyof typeof extSel) => setExtSel(s => ({...s, [k]: !s[k]}));

  const [exportSel, setExportSel] = useState<ExportCategories>({
    system: true, members: true, avatars: true, banners: true, frontHistory: true, journal: true,
    groups: true, chat: true, moods: true, palettes: true, settings: true,
    customFields: true, noteboards: true, polls: true, journalTemplates: true,
  });
  const togExp = (k: keyof ExportCategories) => setExportSel(s => ({...s, [k]: !s[k]}));

  const handleJSON = async () => {try {await exportJSON(system, members, history, journal, exportSel);} catch (e) {Alert.alert(t('share.exportFailed'), String(e));}};
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
    setRestoreError(''); setRestorePreview(false); setRestorePath(null); setRestoreFile(null); setRestoreDone(false);
    try {
      const [res] = await safePick({type: ['application/json', 'text/plain']});
      const pickedPath = getPickedFilePath(res);
      let content: string;
      try {
        content = await ReactNativeBlobUtil.fs.readFile(pickedPath, 'utf8');
      } catch {
        content = await ReactNativeBlobUtil.fs.readFile(res.uri || res.fileCopyUri || pickedPath, 'utf8');
      }
      let parsed: any;
      try { parsed = JSON.parse(content); } catch {
        setRestoreError('File is not valid JSON. Please pick a Plural Star or Simply Plural backup (.json) file.');
        return;
      }
      const isNativePS = parsed._meta && (parsed._meta.app === 'Plural Star' || parsed._meta.app === 'Plural Space');
      const isSPExport = !parsed._meta && Array.isArray(parsed.members) && parsed.members.length > 0
        && parsed.members[0]._id !== undefined && Array.isArray(parsed.customFields);
      if (!isNativePS && !isSPExport) {
        setRestoreError('This does not look like a Plural Star or Simply Plural backup. Pick a .json file exported from either app.');
        return;
      }
      const safeTempPath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/ps_restore_pending.json`;
      await ReactNativeBlobUtil.fs.writeFile(safeTempPath, content, 'utf8');
      setRestorePath(safeTempPath);
      setRestoreFile(res.name || 'backup.json');
      setRestorePreview(true);
    } catch (e: any) {if (!isPickerCancel(e)) setRestoreError(e.message || 'Could not read file.');}
  };

  const handleRestore = () => {
    if (!restorePath || !restorePreview) return;
    Alert.alert(t('share.restoreData'), t('share.restoreDataMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('share.restore'), style: 'destructive', onPress: async () => {
        setRestoring(true);
        try {
          const content = await ReactNativeBlobUtil.fs.readFile(restorePath, 'utf8');
          const rawData: any = JSON.parse(content);

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
            const SP_TYPE_MAP: Record<string, CustomFieldType> = {'0': 'text', '1': 'number', '2': 'toggle', '3': 'date', '4': 'monthYear', '5': 'month', '6': 'year', 'text': 'text', 'number': 'number', 'checkbox': 'toggle', 'toggle': 'toggle', 'date': 'date', 'markdown': 'markdown'};
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
                color: String(sp.color || '#DAA520'),
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
              const spAvatarUrls: Record<string, string> = {};
              rawData.members.forEach((sp: any, i: number) => {
                const localId = newMembers[i].id;
                const directUrl = String(sp.avatarUrl || '');
                if (directUrl.startsWith('http://') || directUrl.startsWith('https://')) {
                  spAvatarUrls[localId] = directUrl;
                  return;
                }
                const avatarUuid = String(sp.avatarUuid || '');
                const ownerUid = String(sp.uid || '');
                if (avatarUuid && ownerUid) {
                  spAvatarUrls[localId] = `https://spaces.apparyllis.com/avatars/${ownerUid}/${avatarUuid}`;
                }
              });
              const spAvatarEntries = Object.entries(spAvatarUrls);
              if (spAvatarEntries.length > 0) {
                setRestoreProgress(t('share.progressAvatarsDownload', {defaultValue: 'Downloading avatars…'}));
                const downloaded: Record<string, string> = {};
                await parallelMap(spAvatarEntries, async ([memberId, url]) => {
                  const fileUri = await saveAvatarFromUrl(memberId, url).catch(() => undefined);
                  if (fileUri) downloaded[memberId] = fileUri;
                }, 4, (done, total) => setRestoreProgress(t('share.progressAvatarsDownloadN', {done, total, defaultValue: `Downloading avatars… ${done}/${total}`})));
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
                const merged = [...newH, ...history].sort((a, b) => b.startTime - a.startTime);
                await store.set(KEYS.history, merged);
                const importedOpenFront = findOpenFrontInHistory(merged);
                if (importedOpenFront) await store.set(KEYS.front, importedOpenFront);
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
              setRestoreProgress(t('share.progressAvatars', {defaultValue: 'Restoring avatars…'}));
              const entries = Object.entries(data.avatars!);
              const avatarMap: Record<string, string> = {};
              await parallelMap(entries, async ([memberId, raw]) => {
                if (!raw) return;
                const b64 = (raw as string).startsWith('data:') ? (raw as string).split(',')[1] : (raw as string);
                const fileUri = await saveAvatar(memberId, b64).catch(() => null);
                if (fileUri) avatarMap[memberId] = fileUri;
              }, 6, (done, total) => setRestoreProgress(t('share.progressAvatarsN', {done, total, defaultValue: `Restoring avatars… ${done}/${total}`})));
              membersAccum = membersAccum.map(m => avatarMap[m.id] ? {...m, avatar: avatarMap[m.id]} : m);
              data.avatars = {};
            }
            if (wantBanners) {
              setRestoreProgress(t('share.progressBanners', {defaultValue: 'Restoring banners…'}));
              const entries = Object.entries(data.banners!);
              const bannerMap: Record<string, string> = {};
              await parallelMap(entries, async ([memberId, raw]) => {
                if (!raw) return;
                const b64 = (raw as string).startsWith('data:') ? (raw as string).split(',')[1] : (raw as string);
                const fileUri = await saveBannerFromBase64(memberId, b64).catch(() => null);
                if (fileUri) bannerMap[memberId] = fileUri;
              }, 6, (done, total) => setRestoreProgress(t('share.progressBannersN', {done, total, defaultValue: `Restoring banners… ${done}/${total}`})));
              membersAccum = membersAccum.map(m => bannerMap[m.id] ? {...m, banner: bannerMap[m.id]} : m);
              data.banners = {};
            }
            setRestoreProgress(t('share.progressSavingMembers', {defaultValue: 'Saving members…'}));
            await store.set(KEYS.members, membersAccum);
          } else if (restoreSel.avatars && !restoreSel.members) {
            if (data.avatars && Object.keys(data.avatars).length > 0) {
              setRestoreProgress(t('share.progressAvatars', {defaultValue: 'Restoring avatars…'}));
              const existing = await store.get<Member[]>(KEYS.members) || [];
              const avatarMap: Record<string, string> = {};
              const entries = Object.entries(data.avatars);
              await parallelMap(entries, async ([memberId, raw]) => {
                if (!raw) return;
                const b64 = (raw as string).startsWith('data:') ? (raw as string).split(',')[1] : (raw as string);
                const fileUri = await saveAvatar(memberId, b64).catch(() => null);
                if (fileUri) avatarMap[memberId] = fileUri;
              }, 6, (done, total) => setRestoreProgress(t('share.progressAvatarsN', {done, total, defaultValue: `Restoring avatars… ${done}/${total}`})));
              const updated = existing.map(m => avatarMap[m.id] ? {...m, avatar: avatarMap[m.id]} : m);
              await store.set(KEYS.members, updated);
              data.avatars = {};
            }
            if (restoreSel.banners && data.banners && Object.keys(data.banners).length > 0) {
              setRestoreProgress(t('share.progressBanners', {defaultValue: 'Restoring banners…'}));
              const current = await store.get<Member[]>(KEYS.members) || [];
              const bannerMap: Record<string, string> = {};
              const entries = Object.entries(data.banners);
              await parallelMap(entries, async ([memberId, raw]) => {
                if (!raw) return;
                const b64 = (raw as string).startsWith('data:') ? (raw as string).split(',')[1] : (raw as string);
                const fileUri = await saveBannerFromBase64(memberId, b64).catch(() => null);
                if (fileUri) bannerMap[memberId] = fileUri;
              }, 6, (done, total) => setRestoreProgress(t('share.progressBannersN', {done, total, defaultValue: `Restoring banners… ${done}/${total}`})));
              const updated = current.map(m => bannerMap[m.id] ? {...m, banner: bannerMap[m.id]} : m);
              await store.set(KEYS.members, updated);
              data.banners = {};
            }
          } else if (restoreSel.banners && data.banners && Object.keys(data.banners).length > 0) {
            setRestoreProgress(t('share.progressBanners', {defaultValue: 'Restoring banners…'}));
            const current = await store.get<Member[]>(KEYS.members) || [];
            const bannerMap: Record<string, string> = {};
            const entries = Object.entries(data.banners);
            await parallelMap(entries, async ([memberId, raw]) => {
              if (!raw) return;
              const b64 = (raw as string).startsWith('data:') ? (raw as string).split(',')[1] : (raw as string);
              const fileUri = await saveBannerFromBase64(memberId, b64).catch(() => null);
              if (fileUri) bannerMap[memberId] = fileUri;
            }, 6, (done, total) => setRestoreProgress(t('share.progressBannersN', {done, total, defaultValue: `Restoring banners… ${done}/${total}`})));
            const updated = current.map(m => bannerMap[m.id] ? {...m, banner: bannerMap[m.id]} : m);
            await store.set(KEYS.members, updated);
            data.banners = {};
          }
          if (restoreSel.journal && data.journal) await store.set(KEYS.journal, data.journal);
          if (restoreSel.frontHistory && data.frontHistory) {
            await store.set(KEYS.history, data.frontHistory);
          }
          if (restoreSel.groups && data.groups) await store.set(KEYS.groups, data.groups);
          if (restoreSel.chat) {
            if (data.chatChannels) await store.set(KEYS.chatChannels, data.chatChannels);
            if (data.chatMessages) {
              setRestoreProgress(t('share.progressChat', {defaultValue: 'Restoring chat…'}));
              const channelIds = Object.keys(data.chatMessages).filter(id => {
                const msgs = data.chatMessages![id];
                return Array.isArray(msgs) && msgs.length > 0;
              });
              await parallelMap(channelIds, async (chId) => {
                try {
                  const msgs = data.chatMessages![chId];
                  const {messages: migrated} = await migrateInlineChatMedia(msgs);
                  await store.set(chatMsgKey(chId), migrated);
                } catch (chErr) {
                  console.error(`[RESTORE] failed channel ${chId}:`, chErr);
                }
              }, 4, (done, total) => setRestoreProgress(t('share.progressChatN', {done, total, defaultValue: `Restoring chat… ${done}/${total}`})));
              data.chatMessages = {};
            }
          }
          if (restoreSel.settings || restoreSel.moods) {
            const currentSettings = await store.get<AppSettings>(KEYS.settings) || {} as AppSettings;
            let newSettings = {...currentSettings};
            if (restoreSel.settings && data.settings) {
              newSettings = {...data.settings};
              if (!restoreSel.moods) newSettings.customMoods = currentSettings.customMoods || [];
            }
            if (restoreSel.moods) {
              newSettings.customMoods = data.customMoods || data.settings?.customMoods || [];
            }
            await store.set(KEYS.settings, newSettings);
          }
          if (restoreSel.palettes && data.palettes) await store.set(KEYS.palettes, data.palettes);
          if (restoreSel.frontHistory && data.front !== undefined) await store.set(KEYS.front, data.front);
          if (restoreSel.customFields && data.customFieldDefs) await store.set(KEYS.customFieldDefs, data.customFieldDefs);
          if (restoreSel.noteboards && data.noteboards) await store.set(KEYS.noteboards, data.noteboards);
          if (restoreSel.polls && data.polls) await store.set(KEYS.polls, data.polls);
          if (restoreSel.journalTemplates && data.journalTemplates) await store.set(KEYS.journalTemplates, data.journalTemplates);
          setRestoreDone(true); setTimeout(() => onDataImported(), 800);
        } catch (e: any) {
          setRestoreError(e.message || 'Restore failed');
        } finally {
          setRestoring(false);
          setRestoreProgress('');
          try {
            const safeTempPath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/ps_restore_pending.json`;
            const exists = await ReactNativeBlobUtil.fs.exists(safeTempPath);
            if (exists) await ReactNativeBlobUtil.fs.unlink(safeTempPath);
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
      const [mRes, sRes, cfRes, gRes] = await Promise.all([
        fetch(`https://v2.apparyllis.com/v1/members/${userId}`, {headers}),
        fetch(`https://v2.apparyllis.com/v1/frontHistory/${userId}?startTime=0&endTime=${Date.now()}`, {headers}),
        fetch(`https://v2.apparyllis.com/v1/customFields/${userId}`, {headers}),
        fetch(`https://v2.apparyllis.com/v1/groups/${userId}`, {headers}),
      ]);
      let mData: any = []; let sData: any = []; let cfData: any = []; let gData: any = [];
      try { mData = await mRes.json(); } catch { mData = []; }
      try { sData = await sRes.json(); } catch { sData = []; }
      try { cfData = await cfRes.json(); } catch { cfData = []; }
      try { gData = await gRes.json(); } catch { gData = []; }
      const memberList = Array.isArray(mData) ? mData : (mData.members || []);
      const switchList = Array.isArray(sData) ? sData : (sData.switches || sData.frontHistory || []);
      const customFieldList = Array.isArray(cfData) ? cfData : (cfData.customFields || []);
      const groupList = Array.isArray(gData) ? gData : (gData.groups || []);
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
      const headers = {Authorization: extToken.trim(), 'Content-Type': 'application/json', 'User-Agent': 'PluralStar/1.7.5'};
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
    return groups.map(group => {
      const allIds = [...new Set(group.flatMap(e => e.resolvedIds))];
      const startTime = Math.min(...group.map(e => e.startTime));
      const endTimes = group.map(e => e.endTime);
      const endTime = endTimes.includes(null) ? null : Math.max(...(endTimes as number[]));
      const notes = group.map(e => e.note).filter(Boolean);
      return {memberIds: allIds, startTime, endTime, note: notes.join(' | '), mood: undefined, location: undefined} as HistoryEntry;
    }).filter(h => h.memberIds.length > 0);
  };

  const convertPKSwitches = (switches: any[], idMap: Record<string, string>): HistoryEntry[] => {
    return switches.map((sw: any, i: number, arr: any[]) => {
      const next = arr[i - 1];
      const resolvedIds = (Array.isArray(sw.members) ? sw.members : []).map((eid: string) => idMap[eid]).filter(Boolean) as string[];
      return {memberIds: resolvedIds, startTime: new Date(sw.timestamp).getTime(), endTime: next ? new Date(next.timestamp).getTime() : null, note: '', mood: undefined, location: undefined};
    }).filter(h => h.memberIds.length > 0);
  };

  const handleExtImport = () => {
    if (!extPreview) return;
    const isPK = importSource === 'pluralkit';
    Alert.alert(t('share.importData'), t('share.importAddDataMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('share.importBtn'), onPress: async () => {
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
              name: isPK ? (m.display_name || m.name || 'Unknown') : (m.content?.name || m.name || 'Unknown'),
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
          await store.set(KEYS.members, merged);
          const avatarUrls: Record<string, string> = {};
          if (extSel.avatars) {
            const isHttpUrl = (s: any): boolean =>
              typeof s === 'string' && (s.startsWith('http://') || s.startsWith('https://'));
            extPreview.members.forEach((m: any) => {
              const extId: string = isPK ? (m.uuid || m.id) : m._id || m.id;
              const localId = extId ? idMap[extId] : undefined;
              if (!localId) return;
              let avatarUrl = '';
              if (isPK) {
                if (isHttpUrl(m.avatar_url)) avatarUrl = m.avatar_url;
              } else {
                const direct = m.content?.avatarUrl || m.avatarUrl;
                const avatarUuid = m.content?.avatarUuid || m.avatarUuid;
                const ownerUid = m.content?.uid || m.uid;
                if (isHttpUrl(direct)) {
                  avatarUrl = direct;
                } else if (avatarUuid && ownerUid) {
                  avatarUrl = `https://spaces.apparyllis.com/avatars/${ownerUid}/${avatarUuid}`;
                }
              }
              if (avatarUrl) avatarUrls[localId] = avatarUrl;
            });
          }
          const avatarEntries = Object.entries(avatarUrls);
          if (avatarEntries.length > 0) {
            setRestoreProgress(t('share.progressAvatarsDownload', {defaultValue: 'Downloading avatars…'}));
            const avatarResults: Record<string, string> = {};
            await parallelMap(avatarEntries, async ([memberId, url]) => {
              const avatar = await saveAvatarFromUrl(memberId, url).catch(() => undefined);
              if (avatar) avatarResults[memberId] = avatar;
            }, 4, (done, total) => setRestoreProgress(t('share.progressAvatarsDownloadN', {done, total, defaultValue: `Downloading avatars… ${done}/${total}`})));
            const withAvatars = merged.map(m => avatarResults[m.id] ? {...m, avatar: avatarResults[m.id]} : m);
            await store.set(KEYS.members, withAvatars);
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
              setRestoreProgress(t('share.progressBannersDownload', {defaultValue: 'Downloading banners…'}));
              const bannerResults: Record<string, string> = {};
              await parallelMap(bannerEntries, async ([memberId, url]) => {
                const banner = await saveBannerFromUrl(memberId, url).catch(() => undefined);
                if (banner) bannerResults[memberId] = banner;
              }, 4, (done, total) => setRestoreProgress(t('share.progressBannersDownloadN', {done, total, defaultValue: `Downloading banners… ${done}/${total}`})));
              if (Object.keys(bannerResults).length > 0) {
                const currentMembers = await store.get<Member[]>(KEYS.members) || [];
                const withBanners = currentMembers.map(m => bannerResults[m.id] ? {...m, banner: bannerResults[m.id]} : m);
                await store.set(KEYS.members, withBanners);
              }
            }
          }
          if (!isPK && extSel.customFields && extPreview.customFields && extPreview.customFields.length > 0) {
            const SP_TYPE_MAP: Record<string, CustomFieldType> = {'0': 'text', '1': 'number', '2': 'toggle', '3': 'date', '4': 'monthYear', '5': 'month', '6': 'year', 'text': 'text', 'number': 'number', 'checkbox': 'toggle', 'toggle': 'toggle', 'date': 'date', 'markdown': 'markdown'};
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
              const gName = isPK ? (g.display_name || g.name || 'Group') : (g.content?.name || g.name || 'Group');
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
            if (newH.length > 0) {
              const mergedHistory = [...newH, ...history].sort((a, b) => b.startTime - a.startTime);
              await store.set(KEYS.history, mergedHistory);
              const importedOpenFront = findOpenFrontInHistory(mergedHistory);
              if (importedOpenFront) await store.set(KEYS.front, importedOpenFront);
            }
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
            const name = isPK ? (m.display_name || m.name || '') : (m.content?.name || m.name || '');
            const lm = members.find(l => l.name.toLowerCase() === String(name).toLowerCase());
            if (lm) {
              existingIdMap[eid] = lm.id;
              if (isPK && m.id && m.id !== eid) existingIdMap[m.id] = lm.id;
            }
          });
          const newH = isPK ? convertPKSwitches(extPreview.switches, existingIdMap) : convertSPSwitches(extPreview.switches, existingIdMap);
          if (newH.length > 0) {
            const mergedHistory = [...newH, ...history].sort((a, b) => b.startTime - a.startTime);
            await store.set(KEYS.history, mergedHistory);
            const importedOpenFront = findOpenFrontInHistory(mergedHistory);
            if (importedOpenFront) await store.set(KEYS.front, importedOpenFront);
          }
        }
        setExtPreview(null); setExtToken(''); setTimeout(() => onDataImported(), 500);
      }},
    ]);
  };

  const handleSPFileImport = async () => {
    try {
      const [res] = await safePick({type: ['application/json', 'text/plain']});
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
              color: m.color || '#DAA520',
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
          await store.set(KEYS.members, merged);
          const avatarUrls: Record<string, string> = {};
          if (extSel.avatars) {
            spMembers.forEach((m: any) => {
              const localId = m._id ? idMap[m._id] : undefined;
              if (!localId) return;
              let avatarUrl = m.avatarUrl || '';
              if (!avatarUrl && m.avatarUuid) {
                const ownerUid = m.uid;
                avatarUrl = ownerUid
                  ? `https://spaces.apparyllis.com/avatars/${ownerUid}/${m.avatarUuid}`
                  : `https://spaces.apparyllis.com/avatars/${m.avatarUuid}`;
              }
              if (avatarUrl) avatarUrls[localId] = avatarUrl;
            });
          }
          const avatarEntries = Object.entries(avatarUrls);
          if (avatarEntries.length > 0) {
            const withAvatars = [...merged];
            for (const [memberId, url] of avatarEntries) {
              const avatar = await saveAvatarFromUrl(memberId, url);
              if (avatar) {
                const idx = withAvatars.findIndex(m => m.id === memberId);
                if (idx >= 0) withAvatars[idx] = {...withAvatars[idx], avatar};
              }
            }
            await store.set(KEYS.members, withAvatars);
          }
          if (extSel.customFields && extPreview.customFields && extPreview.customFields.length > 0) {
            const SP_TYPE_MAP: Record<string, CustomFieldType> = {'0': 'text', '1': 'number', '2': 'toggle', '3': 'date', '4': 'monthYear', '5': 'month', '6': 'year', 'text': 'text', 'number': 'number', 'checkbox': 'toggle', 'toggle': 'toggle', 'date': 'date', 'markdown': 'markdown'};
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
            if (newH.length > 0) {
              const mergedHistory = [...newH, ...history].sort((a, b) => b.startTime - a.startTime);
              await store.set(KEYS.history, mergedHistory);
              const importedOpenFront = findOpenFrontInHistory(mergedHistory);
              if (importedOpenFront) await store.set(KEYS.front, importedOpenFront);
            }
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
      Alert.alert(t('share.recoverScanFailed', {defaultValue: 'Recovery scan failed'}), String(e));
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
      t('share.recoverConfirmTitle', {defaultValue: 'Recover data?'}),
      t('share.recoverConfirmMsg', {count: toRestore.length, defaultValue: `Restore ${toRestore.length} backup item${toRestore.length === 1 ? '' : 's'} into the app? This will overwrite current data for those categories.`}),
      [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('share.recoverConfirm', {defaultValue: 'Recover'}), style: 'destructive', onPress: async () => {
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
      case KEYS.system: return t('share.systemNameDesc');
      case KEYS.members: return t('share.memberProfiles');
      case KEYS.front: return t('hub.front', {defaultValue: 'Front'});
      case KEYS.history: return t('share.frontHistory');
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
      style={{flex: 1, paddingVertical: 8, borderRadius: 7, borderWidth: 1, alignItems: 'center',
        backgroundColor: section === id ? T.accentBg : 'transparent', borderColor: section === id ? `${T.accent}40` : T.border}}>
      <Text style={{fontSize: fs(12), color: section === id ? T.accent : T.dim, fontWeight: section === id ? '600' : '400'}}>{label}</Text>
    </TouchableOpacity>
  );

  const SourceBtn = ({id, label}: {id: ImportSource; label: string}) => (
    <TouchableOpacity onPress={() => {setImportSource(id); setExtPreview(null); setExtToken('');}} activeOpacity={0.7}
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

  const Toggle = ({value, onToggle}: {value: boolean; onToggle: () => void}) => (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.8} style={{width: 40, height: 22, borderRadius: 11, backgroundColor: value ? T.accent : T.toggleOff, justifyContent: 'center'}}>
      <View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', position: 'absolute', left: value ? 20 : 3}} />
    </TouchableOpacity>
  );

  const SectionRow = ({label, sublabel, value, onToggle, disabled = false}: any) => (
    <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: T.border, paddingHorizontal: 14, opacity: disabled ? 0.4 : 1}}>
      <View style={{flex: 1}}><Text style={{fontSize: fs(14), color: T.text, fontWeight: '500'}}>{label}</Text>{sublabel && <Text style={{fontSize: fs(11), color: T.muted, marginTop: 2}}>{sublabel}</Text>}</View>
      <Toggle value={value && !disabled} onToggle={disabled ? () => {} : onToggle} />
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

          <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8, marginTop: 4}}>{t('share.exportCategories', {defaultValue: 'Export Categories'})}</Text>
          <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 14}}>
            {([
              ['system', t('share.systemNameDesc')],
              ['members', t('share.memberProfiles')],
              ['avatars', t('share.profilePictures')],
              ['banners', t('share.banners', {defaultValue: 'Banners'})],
              ['frontHistory', t('share.frontHistory')],
              ['journal', t('share.journalEntries')],
              ['groups', t('share.memberGroups')],
              ['chat', t('share.chatData')],
              ['moods', t('share.customMoodsLabel')],
              ['palettes', t('share.themePalettes')],
              ['settings', t('share.appSettings')],
              ['customFields', t('customFields.title')],
              ['noteboards', t('noteboard.title')],
              ['polls', t('polls.title')],
              ['journalTemplates', t('journal.templatesTab', {defaultValue: 'Templates'})],
            ] as [keyof ExportCategories, string][]).map(([k, label]) => (
              <SectionRow key={k} label={label} value={!!exportSel[k]} onToggle={() => togExp(k)} />
            ))}
          </View>

          <View style={{flexDirection: 'row', gap: 8, marginBottom: 6}}>
            {[['↓ JSON', handleJSON, T.accentBg, T.accent, `${T.accent}40`], ['↓ HTML', handleHTML, T.infoBg, T.info, `${T.info}40`]].map(([label, fn, bg, color, border]: any) => (
              <TouchableOpacity key={label} onPress={fn} activeOpacity={0.7} style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: bg, borderColor: border}}>
                <Text style={{fontSize: fs(14), fontWeight: '500', color}}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[s.hint, {color: T.muted}]}>{t('share.htmlHint')}</Text>
          <Divider label={t('share.journalExport')} />
          <Text style={[s.para, {color: T.dim}]}>{t('share.exportJournalOnly')}</Text>
          <View style={{flexDirection: 'row', gap: 8, marginBottom: 6}}>
            {[['↓ .txt', 'txt', T.accentBg, T.accent, `${T.accent}40`], ['↓ .md', 'md', T.infoBg, T.info, `${T.info}40`], ['↓ .json', 'json', 'transparent', T.dim, T.border]].map(([label, fmt, bg, color, border]: any) => (
              <TouchableOpacity key={fmt} onPress={() => handleJournalExport(fmt)} activeOpacity={0.7} style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: bg, borderColor: border}}>
                <Text style={{fontSize: fs(13), fontWeight: '500', color}}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[s.hint, {color: T.muted}]}>{t('share.perEntryHint')}</Text>
          <Divider label={t('share.sendEmail')} />
          <TextInput value={emailAddr} onChangeText={setEmailAddr} placeholder="recipient@email.com" placeholderTextColor={T.muted} keyboardType="email-address" autoCapitalize="none"
            style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(14), marginBottom: 10}} />
          <TouchableOpacity onPress={handleEmail} activeOpacity={0.7} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
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
          </View>
          {importSource === 'journal' && (
            <View>
              <Divider label={t('share.importJournalEntry')} />
              <Text style={[s.para, {color: T.dim}]}>{t('share.importJournalDesc')}</Text>
              <TouchableOpacity onPress={handleImportJournalFile} activeOpacity={0.7} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
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
              <TouchableOpacity onPress={handlePickBackup} activeOpacity={0.7} style={{borderWidth: 1.5, borderStyle: 'dashed', borderColor: restoreFile ? T.success : T.border, borderRadius: 10, padding: 22, alignItems: 'center', marginBottom: 14, gap: 6, backgroundColor: restoreFile ? T.successBg : 'transparent'}}>
                <Text style={{fontSize: fs(20), color: T.dim}}>↑</Text>
                <Text style={{fontSize: fs(13), color: restoreFile ? T.success : T.dim, textAlign: 'center'}}>{restoreFile || t('share.tapToSelect')}</Text>
              </TouchableOpacity>
              {restoreError ? <View style={{backgroundColor: T.dangerBg, borderWidth: 1, borderColor: `${T.danger}30`, borderRadius: 7, padding: 10, marginBottom: 12}}><Text style={{fontSize: fs(13), color: T.danger}}>⚠ {restoreError}</Text></View> : null}
              {restorePreview && (
                <>
                  <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{t('share.restoreCategories')}</Text>
                  <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 14}}>
                    {([
                      ['system', t('share.systemNameDesc')],
                      ['members', t('share.memberProfiles')],
                      ['avatars', t('share.profilePictures')],
                      ['banners', t('share.banners', {defaultValue: 'Banners'})],
                      ['frontHistory', t('share.frontHistory')],
                      ['journal', t('share.journalEntries')],
                      ['groups', t('share.memberGroups')],
                      ['chat', t('share.chatData')],
                      ['moods', t('share.customMoodsLabel')],
                      ['palettes', t('share.themePalettes')],
                      ['settings', t('share.appSettings')],
                      ['customFields', t('customFields.title')],
                      ['noteboards', t('noteboard.title')],
                      ['polls', t('polls.title')],
                      ['journalTemplates', t('journal.templatesTab', {defaultValue: 'Templates'})],
                    ] as any[]).map(([k, label]) => (
                      <SectionRow key={k} label={label} value={restoreSel[k as keyof typeof restoreSel]} onToggle={() => togR(k)} />
                    ))}
                  </View>
                  {restoreDone ? <View style={{backgroundColor: T.successBg, borderWidth: 1, borderColor: `${T.success}30`, borderRadius: 8, padding: 12, alignItems: 'center'}}><Text style={{fontSize: fs(13), color: T.success, fontWeight: '500'}}>{t('share.restoreComplete')}</Text></View>
                    : restoring ? <View style={{alignItems: 'center', paddingVertical: 16}}><ActivityIndicator color={T.accent} /><Text style={{fontSize: fs(12), color: T.dim, marginTop: 8}} numberOfLines={2}>{restoreProgress || t('share.importing')}</Text></View>
                    : <TouchableOpacity onPress={handleRestore} activeOpacity={0.7} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.dangerBg, borderColor: `${T.danger}40`}}><Text style={{fontSize: fs(14), fontWeight: '500', color: T.danger}}>{t('share.restoreSelectedData')}</Text></TouchableOpacity>}
                </>
              )}
              <Divider label={t('share.recoverData', {defaultValue: 'Recover Data'})} />
              <Text style={[s.para, {color: T.dim}]}>{t('share.recoverDataDesc', {defaultValue: "If your data disappeared after a restart (welcome screen returns, members or groups gone, etc.), Plural Star may still have on-disk backups separate from the app's main storage. Scan to see what can be recovered."})}</Text>
              {!recoverEntries ? (
                <TouchableOpacity onPress={handleScanRecovery} disabled={recoverScanning} activeOpacity={0.7} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border, marginBottom: 14, opacity: recoverScanning ? 0.5 : 1}}>
                  {recoverScanning ? <ActivityIndicator color={T.accent} size="small" /> : <Text style={{fontSize: fs(14), fontWeight: '500', color: T.text}}>{t('share.scanForBackups', {defaultValue: 'Scan for recoverable backups'})}</Text>}
                </TouchableOpacity>
              ) : recoverEntries.length === 0 ? (
                <View style={{padding: 14, borderRadius: 8, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, marginBottom: 14}}>
                  <Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center'}}>{t('share.noBackupsFound', {defaultValue: 'No recoverable backups found on disk.'})}</Text>
                  <TouchableOpacity onPress={() => {setRecoverEntries(null); setRecoverDone(false);}} activeOpacity={0.7} style={{alignSelf: 'center', marginTop: 8}}>
                    <Text style={{fontSize: fs(12), color: T.accent}}>{t('share.scanAgain', {defaultValue: 'Scan again'})}</Text>
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
                      <Text style={{fontSize: fs(13), color: T.success, fontWeight: '500'}}>{t('share.recoverComplete', {defaultValue: '✓ Recovery complete — reloading…'})}</Text>
                    </View>
                  ) : (
                    <View style={{flexDirection: 'row', gap: 8, marginBottom: 14}}>
                      <TouchableOpacity onPress={() => {setRecoverEntries(null); setRecoverSel({}); setRecoverDone(false);}} activeOpacity={0.7} style={{flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
                        <Text style={{fontSize: fs(13), fontWeight: '500', color: T.dim}}>{t('common.cancel')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleApplyRecovery} activeOpacity={0.7} disabled={Object.values(recoverSel).every(v => !v)} style={{flex: 2, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, opacity: Object.values(recoverSel).every(v => !v) ? 0.4 : 1}}>
                        <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>{t('share.recoverSelected', {defaultValue: 'Recover selected'})}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
              <Divider label={t('share.deleteAccount')} />
              <Text style={[s.para, {color: T.dim}]}>{t('share.deleteAccountDesc')}</Text>
              <TouchableOpacity onPress={handleDeleteAccount} activeOpacity={0.7} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.dangerBg, borderColor: `${T.danger}40`}}>
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
                    <SectionRow label={t('share.systemNameDesc')} value={extSel.system} onToggle={() => togE('system')} />
                    <SectionRow label={t('share.memberProfiles')} sublabel={t('share.membersCount', {count: extPreview.members.length})} value={extSel.members} onToggle={() => togE('members')} />
                    <SectionRow label={t('share.profilePictures')} value={extSel.avatars} onToggle={() => togE('avatars')} />
                    {importSource === 'pluralkit' && (
                      <SectionRow label={t('share.banners', {defaultValue: 'Banners'})} value={extSel.banners} onToggle={() => togE('banners')} />
                    )}
                    <SectionRow label={t('share.frontHistory')} sublabel={t('share.frontEntries', {count: extPreview.switches.length})} value={extSel.frontHistory} onToggle={() => togE('frontHistory')} />
                    {extPreview.groups && extPreview.groups.length > 0 && (
                      <SectionRow label={t('share.groups', {defaultValue: 'Groups'})} sublabel={t('share.groupsCount', {count: extPreview.groups.length, defaultValue: `${extPreview.groups.length} group${extPreview.groups.length === 1 ? '' : 's'}`})} value={extSel.groups} onToggle={() => togE('groups')} />
                    )}
                  </View>
                  <TouchableOpacity onPress={handleExtImport} activeOpacity={0.7} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
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
              <TouchableOpacity onPress={handleSPFileImport} activeOpacity={0.7}
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
                    <SectionRow label={t('share.systemNameDesc')} value={extSel.system} onToggle={() => togE('system')} />
                    <SectionRow label={t('share.memberProfiles')} sublabel={t('share.membersCount', {count: extPreview.members.length})} value={extSel.members} onToggle={() => togE('members')} />
                    <SectionRow label={t('share.profilePictures')} value={extSel.avatars} onToggle={() => togE('avatars')} />
                    <SectionRow label={t('share.frontHistory')} sublabel={t('share.frontEntries', {count: extPreview.switches.length})} value={extSel.frontHistory} onToggle={() => togE('frontHistory')} />
                    {extPreview.groups && extPreview.groups.length > 0 && (
                      <SectionRow label={t('share.groups', {defaultValue: 'Groups'})} sublabel={t('share.groupsCount', {count: extPreview.groups.length, defaultValue: `${extPreview.groups.length} group${extPreview.groups.length === 1 ? '' : 's'}`})} value={extSel.groups} onToggle={() => togE('groups')} />
                    )}
                  </View>
                  <TouchableOpacity onPress={handleSPFileConfirmImport} activeOpacity={0.7} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
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
            <SectionRow label={t('share.showCurrentFront')} value={shareSettings.showFront} onToggle={() => tog('showFront')} />
            <SectionRow label={t('share.showMemberList')} value={shareSettings.showMembers} onToggle={() => tog('showMembers')} />
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
                  : (<><PreviewTier label={t('tier.primaryFront')} fronters={primaryFronters} color={T.accent} /><PreviewTier label={t('tier.coFront')} fronters={coFronters} color={T.info} /><PreviewTier label={t('tier.coConscious')} fronters={coConsciousFronters} color={T.success} /></>)}
              </View>
            )}
            {shareSettings.showMembers && members.length > 0 && (
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
