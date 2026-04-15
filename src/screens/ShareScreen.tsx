import React, {useState} from 'react';
import {View, Text, ScrollView, TouchableOpacity, TextInput, Alert, StyleSheet, ActivityIndicator} from 'react-native';
import {useTranslation} from 'react-i18next';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import RNFS from 'react-native-fs';
import {exportJSON, exportHTML, exportEmail, exportAllJournalJSON, exportAllJournalTxt, exportAllJournalMd, ExportCategories} from '../export/exportUtils';
import {store, KEYS, chatMsgKey} from '../storage';
import {SystemInfo, Member, FrontState, HistoryEntry, JournalEntry, ShareSettings, AppSettings, ExportPayload, uid, allFrontMemberIds, findOpenFrontInHistory} from '../utils';
import {postProcessImportedMembers} from '../utils/mediaUtils';

type Section = 'export' | 'import' | 'shareview';
type ImportSource = 'backup' | 'journal' | 'simplyplural' | 'pluralkit' | 'spfile';

interface Props {
  theme: any; system: SystemInfo; members: Member[]; front: FrontState | null;
  history: HistoryEntry[]; journal: JournalEntry[]; shareSettings: ShareSettings; appSettings: AppSettings;
  onSettingsChange: (s: ShareSettings) => void; getMember: (id: string) => Member | undefined;
  onDataImported: () => void; onAddJournalEntry: (entry: JournalEntry) => void; onDeleteAccount: () => void;
}

export const ShareScreen = ({theme: T, system, members, front, history, journal, shareSettings, appSettings, onSettingsChange, getMember, onDataImported, onAddJournalEntry, onDeleteAccount}: Props) => {
  const {t} = useTranslation();
  const [section, setSection] = useState<Section>('export');
  const [emailAddr, setEmailAddr] = useState('');
  const [restoreFile, setRestoreFile] = useState<string | null>(null);
  const [restorePath, setRestorePath] = useState<string | null>(null);
  const [restorePreview, setRestorePreview] = useState<boolean>(false);
  const [restoreSel, setRestoreSel] = useState({system: true, members: true, avatars: true, journal: true, frontHistory: true, groups: true, chat: true, moods: true, palettes: true, settings: true, customFields: true, noteboards: true, polls: true});
  const [restoreError, setRestoreError] = useState('');
  const [restoreDone, setRestoreDone] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [importMsg, setImportMsg] = useState('');
  const [importSource, setImportSource] = useState<ImportSource>('backup');
  const [extToken, setExtToken] = useState('');
  const [extLoading, setExtLoading] = useState(false);
  const [extPreview, setExtPreview] = useState<{members: any[]; switches: any[]; system: any} | null>(null);
  const [extSel, setExtSel] = useState({system: true, members: true, avatars: true, frontHistory: true});

  const primaryFronters = (front?.primary?.memberIds || []).map(getMember).filter(Boolean) as Member[];
  const coFronters = (front?.coFront?.memberIds || []).map(getMember).filter(Boolean) as Member[];
  const coConsciousFronters = (front?.coConscious?.memberIds || []).map(getMember).filter(Boolean) as Member[];

  const tog = (k: keyof ShareSettings) => onSettingsChange({...shareSettings, [k]: !shareSettings[k]});
  const togR = (k: keyof typeof restoreSel) => setRestoreSel(s => ({...s, [k]: !s[k]}));
  const togE = (k: keyof typeof extSel) => setExtSel(s => ({...s, [k]: !s[k]}));

  const [exportSel, setExportSel] = useState<ExportCategories>({
    system: true, members: true, avatars: true, frontHistory: true, journal: true,
    groups: true, chat: true, moods: true, palettes: true, settings: true,
    customFields: true, noteboards: true, polls: true,
  });
  const togExp = (k: keyof ExportCategories) => setExportSel(s => ({...s, [k]: !s[k]}));
  const [showExportOptions, setShowExportOptions] = useState(false);

  const handleJSON = async () => {try {await exportJSON(system, members, history, journal, showExportOptions ? exportSel : undefined);} catch (e) {Alert.alert(t('share.exportFailed'), String(e));}};
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
      if (['txt', 'md', 'markdown'].includes(ext)) {body = await RNFS.readFile(getPickedFilePath(res), 'utf8');}
      else if (ext === 'json') {
        const raw = await RNFS.readFile(getPickedFilePath(res), 'utf8');
        try { const parsed = JSON.parse(raw); if (parsed._meta?.app === 'Plural Space') {setImportStatus('error'); setImportMsg(t('share.backupLooksLike')); return;} body = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
        } catch {body = raw;}
      } else {setImportStatus('error'); setImportMsg(t('share.unsupportedFormat', {ext})); return;}
      onAddJournalEntry({id: uid(), title: titleBase, body, authorIds: [], hashtags: [], timestamp: Date.now()});
      setImportStatus('success'); setImportMsg(t('share.importedAsEntry', {title: titleBase}));
    } catch (e: any) {if (!isPickerCancel(e)) {setImportStatus('error'); setImportMsg(e.message || 'Could not import file.');}}
  };

  const handlePickBackup = async () => {
    setRestoreError(''); setRestorePreview(false); setRestorePath(null); setRestoreFile(null); setRestoreDone(false);
    try {
      const [res] = await safePick({type: ['application/json']});
      setRestorePath(getPickedFilePath(res));
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
          const content = await RNFS.readFile(restorePath, 'utf8');
          const data: ExportPayload = JSON.parse(content);
          if (!data.avatars) data.avatars = {};
          if (data.members) {
            data.members = data.members.map((m: any) => {
              if (m.avatar && !data.avatars![m.id]) data.avatars![m.id] = m.avatar;
              const {avatar, ...rest} = m; return rest;
            });
          }
          if (restoreSel.system && data.system) await store.set(KEYS.system, data.system);
          if (restoreSel.members && data.members) {
            await store.set(KEYS.members, data.members);
            if (restoreSel.avatars && data.avatars && Object.keys(data.avatars).length > 0) {
              const withAvatars: any[] = [...data.members];
              let changed = false;
              for (let i = 0; i < withAvatars.length; i++) {
                const memberId = withAvatars[i].id;
                const raw = data.avatars[memberId];
                if (!raw) continue;
                delete data.avatars[memberId];
                try {
                  const b64 = raw.startsWith('data:') ? raw.split(',')[1] : raw;
                  const fileUri = await saveAvatar(memberId, b64).catch(() => null);
                  if (fileUri) { withAvatars[i] = {...withAvatars[i], avatar: fileUri}; changed = true; }
                } catch {}
              }
              if (changed) await store.set(KEYS.members, withAvatars);
            }
          } else if (restoreSel.avatars && !restoreSel.members) {
            if (data.avatars && Object.keys(data.avatars).length > 0) {
              const existing = await store.get<Member[]>(KEYS.members) || [];
              const updated: Member[] = [];
              for (const m of existing) {
                const raw = data.avatars[m.id];
                if (!raw) { updated.push(m); continue; }
                delete data.avatars[m.id];
                try {
                  const b64 = raw.startsWith('data:') ? raw.split(',')[1] : raw;
                  const fileUri = await saveAvatar(m.id, b64).catch(() => null);
                  updated.push(fileUri ? {...m, avatar: fileUri} : m);
                } catch { updated.push(m); }
              }
              await store.set(KEYS.members, updated);
            }
          }
          if (restoreSel.journal && data.journal) await store.set(KEYS.journal, data.journal);
          if (restoreSel.frontHistory && data.frontHistory) {
            await store.set(KEYS.history, data.frontHistory);
          }
          if (restoreSel.groups && data.groups) await store.set(KEYS.groups, data.groups);
          if (restoreSel.chat) {
            if (data.chatChannels) await store.set(KEYS.chatChannels, data.chatChannels);
            if (data.chatMessages) {
              for (const [chId, msgs] of Object.entries(data.chatMessages)) {
                await store.set(chatMsgKey(chId), msgs);
              }
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
          setRestoreDone(true); setTimeout(() => onDataImported(), 800);
        } catch (e: any) {
          setRestoreError(e.message || 'Restore failed');
        } finally {
          setRestoring(false);
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
      const [mRes, sRes] = await Promise.all([
        fetch(`https://v2.apparyllis.com/v1/members/${userId}`, {headers}),
        fetch(`https://v2.apparyllis.com/v1/frontHistory/${userId}?startTime=0&endTime=${Date.now()}`, {headers}),
      ]);
      let mData: any = []; let sData: any = [];
      try { mData = await mRes.json(); } catch { mData = []; }
      try { sData = await sRes.json(); } catch { sData = []; }
      const memberList = Array.isArray(mData) ? mData : (mData.members || []);
      const switchList = Array.isArray(sData) ? sData : (sData.switches || sData.frontHistory || []);
      const sanitized = memberList.map((m: any) => {
        if (m?.content?.name) m.content.name = String(m.content.name).replace(/[-\u001F\u007F]/g, '').trim();
        if (m?.name) m.name = String(m.name).replace(/[-\u001F\u007F]/g, '').trim();
        return m;
      });
      setExtPreview({system: meData, members: sanitized, switches: switchList});
    } catch (e: any) {Alert.alert(t('share.importFailed'), e.message || 'Could not connect.');}
    finally {setExtLoading(false);}
  };

  const handlePluralKitFetch = async () => {
    if (!extToken.trim()) {Alert.alert(t('share.tokenRequired'), t('share.pkTokenRequiredMsg')); return;}
    setExtLoading(true); setExtPreview(null);
    try {
      const headers = {Authorization: extToken.trim(), 'Content-Type': 'application/json', 'User-Agent': 'PluralSpace/1.0'};
      const [sRes, mRes, swRes] = await Promise.all([
        fetch('https://api.pluralkit.me/v2/systems/@me', {headers}),
        fetch('https://api.pluralkit.me/v2/systems/@me/members', {headers}),
        fetch('https://api.pluralkit.me/v2/systems/@me/switches?limit=500', {headers}),
      ]);
      if (!sRes.ok) throw new Error(t('share.authFailed', {status: sRes.status}));
      let sData: any = {}; let mData: any = []; let swData: any = [];
      try { sData = await sRes.json(); } catch { sData = {}; }
      try { mData = await mRes.json(); } catch { mData = []; }
      try { swData = await swRes.json(); } catch { swData = []; }
      const memberList = Array.isArray(mData) ? mData : [];
      const sanitized = memberList.map((m: any) => {
        if (m?.display_name) m.display_name = String(m.display_name).replace(/[-\u001F\u007F]/g, '').trim();
        if (m?.name) m.name = String(m.name).replace(/[-\u001F\u007F]/g, '').trim();
        return m;
      });
      setExtPreview({system: sData, members: sanitized, switches: Array.isArray(swData) ? swData : []});
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
        if (extSel.members && extPreview.members.length > 0) {
          let importedMembers = extPreview.members.map((m: any) => ({
            id: m.id || uid(),
            name: m.content?.name || m.name || m.display_name || 'Unnamed',
            pronouns: m.content?.pronouns || m.pronouns || '',
            role: m.content?.role || m.role || '',
            color: m.content?.color || m.color || '#DAA520',
            description: m.content?.description || m.description || '',
            tags: m.content?.tags || m.tags || [],
            groupIds: m.content?.groupIds || m.groupIds || [],
            archived: false,
            customFields: [],
            createdAt: Date.now(),
          }));
          const { members: processedMembers } = await postProcessImportedMembers(importedMembers, extPreview);
          await store.set(KEYS.members, processedMembers);
        }
        if (extSel.frontHistory && extPreview.switches) {
          const idMap: Record<string, string> = {};
          extPreview.members.forEach((m: any) => { idMap[m.id] = m.id; });
          const historyEntries = isPK 
            ? convertPKSwitches(extPreview.switches, idMap)
            : convertSPSwitches(extPreview.switches, idMap);
          await store.set(KEYS.history, historyEntries);
        }
        setExtPreview(null);
        setExtToken('');
        onDataImported();
      }},
    ]);
  };

  const handleSPFileConfirmImport = () => {
    // identical logic to handleExtImport for file-based SP import
    if (!extPreview) return;
    Alert.alert(t('share.importData'), t('share.importAddDataMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('share.importBtn'), onPress: async () => {
        if (extSel.members && extPreview.members.length > 0) {
          let importedMembers = extPreview.members.map((m: any) => ({
            id: m.id || uid(),
            name: m.content?.name || m.name || m.display_name || 'Unnamed',
            pronouns: m.content?.pronouns || m.pronouns || '',
            role: m.content?.role || m.role || '',
            color: m.content?.color || m.color || '#DAA520',
            description: m.content?.description || m.description || '',
            tags: m.content?.tags || m.tags || [],
            groupIds: m.content?.groupIds || m.groupIds || [],
            archived: false,
            customFields: [],
            createdAt: Date.now(),
          }));
          const { members: processedMembers } = await postProcessImportedMembers(importedMembers, extPreview);
          await store.set(KEYS.members, processedMembers);
        }
        if (extSel.frontHistory && extPreview.switches) {
          const idMap: Record<string, string> = {};
          extPreview.members.forEach((m: any) => { idMap[m.id] = m.id; });
          const historyEntries = convertSPSwitches(extPreview.switches, idMap);
          await store.set(KEYS.history, historyEntries);
        }
        setExtPreview(null);
        onDataImported();
      }},
    ]);
  };

  return (
    <ScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: T.border}}>
        <TouchableOpacity onPress={() => setSection('export')} activeOpacity={0.7} style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: section === 'export' ? T.accentBg : T.surface, borderWidth: 1, borderColor: section === 'export' ? `${T.accent}40` : T.border}}>
          <Text style={{fontSize: 13, color: section === 'export' ? T.accent : T.dim, fontWeight: '600'}}>{t('share.export')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSection('import')} activeOpacity={0.7} style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: section === 'import' ? T.accentBg : T.surface, borderWidth: 1, borderColor: section === 'import' ? `${T.accent}40` : T.border, marginLeft: 8}}>
          <Text style={{fontSize: 13, color: section === 'import' ? T.accent : T.dim, fontWeight: '600'}}>{t('share.import')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSection('shareview')} activeOpacity={0.7} style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: section === 'shareview' ? T.accentBg : T.surface, borderWidth: 1, borderColor: section === 'shareview' ? `${T.accent}40` : T.border, marginLeft: 8}}>
          <Text style={{fontSize: 13, color: section === 'shareview' ? T.accent : T.dim, fontWeight: '600'}}>{t('share.shareView')}</Text>
        </TouchableOpacity>
      </View>

      {section === 'export' && (
        <View>
          <Text style={[s.para, {color: T.dim}]}>{t('share.exportDesc')}</Text>
          <TouchableOpacity onPress={() => setShowExportOptions(!showExportOptions)} activeOpacity={0.7}
            style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, marginBottom: 8}}>
            <Text style={{fontSize: 12, color: T.accent, fontWeight: '500'}}>{showExportOptions ? '▾' : '▸'} {t('share.customizeExport')}</Text>
          </TouchableOpacity>

          {showExportOptions && (
            <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 12}}>
              {([
                ['system', t('share.systemNameDesc')],
                ['members', t('share.memberProfiles')],
                ['avatars', t('share.profilePictures')],
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
              ] as [keyof ExportCategories, string][]).map(([k, label]) => (
                <View key={k} style={{flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: T.border}}>
                  <Text style={{flex: 1, fontSize: 13, color: T.text}}>{label}</Text>
                  <TouchableOpacity onPress={() => togExp(k)} activeOpacity={0.7} style={{width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: exportSel[k] ? T.accent : T.border, backgroundColor: exportSel[k] ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
                    {exportSel[k] && <Text style={{fontSize: 14, color: '#fff', fontWeight: '700'}}>✓</Text>}
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={{flexDirection: 'row', gap: 8, marginBottom: 6}}>
            {[['↓ JSON', handleJSON, T.accentBg, T.accent, `${T.accent}40`], ['↓ HTML', handleHTML, T.infoBg, T.info, `${T.info}40`]].map(([label, fn, bg, color, border]: any) => (
              <TouchableOpacity key={label} onPress={fn} activeOpacity={0.7} style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: bg, borderColor: border}}>
                <Text style={{fontSize: 14, fontWeight: '500', color}}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[s.hint, {color: T.muted}]}>{t('share.htmlHint')}</Text>
          <View style={{height: 1, backgroundColor: T.border, marginVertical: 20}} />
          <Text style={[s.para, {color: T.dim}]}>{t('share.exportJournalOnly')}</Text>
          <View style={{flexDirection: 'row', gap: 8, marginBottom: 6}}>
            {[['↓ .txt', 'txt', T.accentBg, T.accent, `${T.accent}40`], ['↓ .md', 'md', T.infoBg, T.info, `${T.info}40`], ['↓ .json', 'json', 'transparent', T.dim, T.border]].map(([label, fmt, bg, color, border]: any) => (
              <TouchableOpacity key={fmt} onPress={() => handleJournalExport(fmt)} activeOpacity={0.7} style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: bg, borderColor: border}}>
                <Text style={{fontSize: 13, fontWeight: '500', color}}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[s.hint, {color: T.muted}]}>{t('share.perEntryHint')}</Text>
          <View style={{height: 1, backgroundColor: T.border, marginVertical: 20}} />
          <Text style={[s.para, {color: T.dim}]}>{t('share.sendEmail')}</Text>
          <TextInput value={emailAddr} onChangeText={setEmailAddr} placeholder="recipient@email.com" placeholderTextColor={T.muted} keyboardType="email-address" autoCapitalize="none"
            style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10}} />
          <TouchableOpacity onPress={handleEmail} activeOpacity={0.7} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
            <Text style={{fontSize: 14, fontWeight: '500', color: T.accent}}>{t('share.openInMail')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {section === 'import' && (
        <View>
          {!appSettings.filesEnabled ? (
            <View style={{alignItems: 'center', paddingVertical: 48}}>
              <Text style={{fontSize: 36, opacity: 0.4, marginBottom: 12}}>↑</Text>
              <Text style={{fontSize: 13, color: T.dim, textAlign: 'center'}}>{t('share.filesDisabled')}</Text>
            </View>
          ) : (
            <>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, marginBottom: 4}}>
                <TouchableOpacity onPress={() => setImportSource('journal')} activeOpacity={0.7} style={{paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, backgroundColor: importSource === 'journal' ? T.accentBg : T.surface, borderColor: importSource === 'journal' ? `${T.accent}40` : T.border}}>
                  <Text style={{fontSize: 13, color: importSource === 'journal' ? T.accent : T.dim}}>Journal File</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setImportSource('backup')} activeOpacity={0.7} style={{paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, backgroundColor: importSource === 'backup' ? T.accentBg : T.surface, borderColor: importSource === 'backup' ? `${T.accent}40` : T.border}}>
                  <Text style={{fontSize: 13, color: importSource === 'backup' ? T.accent : T.dim}}>Backup</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setImportSource('simplyplural')} activeOpacity={0.7} style={{paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, backgroundColor: importSource === 'simplyplural' ? T.accentBg : T.surface, borderColor: importSource === 'simplyplural' ? `${T.accent}40` : T.border}}>
                  <Text style={{fontSize: 13, color: importSource === 'simplyplural' ? T.accent : T.dim}}>Simply Plural</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setImportSource('pluralkit')} activeOpacity={0.7} style={{paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, backgroundColor: importSource === 'pluralkit' ? T.accentBg : T.surface, borderColor: importSource === 'pluralkit' ? `${T.accent}40` : T.border}}>
                  <Text style={{fontSize: 13, color: importSource === 'pluralkit' ? T.accent : T.dim}}>PluralKit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setImportSource('spfile')} activeOpacity={0.7} style={{paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, backgroundColor: importSource === 'spfile' ? T.accentBg : T.surface, borderColor: importSource === 'spfile' ? `${T.accent}40` : T.border}}>
                  <Text style={{fontSize: 13, color: importSource === 'spfile' ? T.accent : T.dim}}>SP File</Text>
                </TouchableOpacity>
              </View>

              {importSource === 'journal' && (
                <View>
                  <Text style={[s.para, {color: T.dim}]}>{t('share.importJournalDesc')}</Text>
                  <TouchableOpacity onPress={handleImportJournalFile} activeOpacity={0.7} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
                    <Text style={{fontSize: 14, fontWeight: '500', color: T.accent}}>{t('share.pickFile')}</Text>
                  </TouchableOpacity>
                  {importStatus === 'success' && <View style={{backgroundColor: T.successBg, borderWidth: 1, borderColor: `${T.success}30`, borderRadius: 8, padding: 12, marginBottom: 12}}><Text style={{fontSize: 13, color: T.success}}>✓ {importMsg}</Text></View>}
                  {importStatus === 'error' && <View style={{backgroundColor: T.dangerBg, borderWidth: 1, borderColor: `${T.danger}30`, borderRadius: 7, padding: 10, marginBottom: 12}}><Text style={{fontSize: 13, color: T.danger}}>⚠ {importMsg}</Text></View>}
                </View>
              )}

              {importSource === 'backup' && (
                <View>
                  <Text style={[s.para, {color: T.dim}]}>{t('share.restoreBackupDesc')}</Text>
                  <TouchableOpacity onPress={handlePickBackup} activeOpacity={0.7} style={{borderWidth: 1.5, borderStyle: 'dashed', borderColor: restoreFile ? T.success : T.border, borderRadius: 10, padding: 22, alignItems: 'center', marginBottom: 14, gap: 6, backgroundColor: restoreFile ? T.successBg : 'transparent'}}>
                    <Text style={{fontSize: 20, color: T.dim}}>↑</Text>
                    <Text style={{fontSize: 13, color: restoreFile ? T.success : T.dim, textAlign: 'center'}}>{restoreFile || t('share.tapToSelect')}</Text>
                  </TouchableOpacity>
                  {restoreError ? <View style={{backgroundColor: T.dangerBg, borderWidth: 1, borderColor: `${T.danger}30`, borderRadius: 7, padding: 10, marginBottom: 12}}><Text style={{fontSize: 13, color: T.danger}}>⚠ {restoreError}</Text></View> : null}
                  {restorePreview && (
                    <>
                      <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{t('share.restoreCategories')}</Text>
                      <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 14}}>
                        {([
                          ['system', t('share.systemNameDesc')],
                          ['members', t('share.memberProfiles')],
                          ['avatars', t('share.profilePictures')],
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
                        ] as any[]).map(([k, label]) => (
                          <View key={k} style={{flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: T.border}}>
                            <Text style={{flex: 1, fontSize: 13, color: T.text}}>{label}</Text>
                            <TouchableOpacity onPress={() => togR(k)} activeOpacity={0.7} style={{width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: restoreSel[k as keyof typeof restoreSel] ? T.accent : T.border, backgroundColor: restoreSel[k as keyof typeof restoreSel] ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
                              {restoreSel[k as keyof typeof restoreSel] && <Text style={{fontSize: 14, color: '#fff', fontWeight: '700'}}>✓</Text>}
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                      {restoreDone ? <View style={{backgroundColor: T.successBg, borderWidth: 1, borderColor: `${T.success}30`, borderRadius: 8, padding: 12, alignItems: 'center'}}><Text style={{fontSize: 13, color: T.success, fontWeight: '500'}}>{t('share.restoreComplete')}</Text></View>
                        : restoring ? <View style={{alignItems: 'center', paddingVertical: 16}}><ActivityIndicator color={T.accent} /><Text style={{fontSize: 12, color: T.dim, marginTop: 8}}>{t('share.importing')}</Text></View>
                        : <TouchableOpacity onPress={handleRestore} activeOpacity={0.7} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.dangerBg, borderColor: `${T.danger}40`}}><Text style={{fontSize: 14, fontWeight: '500', color: T.danger}}>{t('share.restoreSelectedData')}</Text></TouchableOpacity>}
                    </>
                  )}
                  <View style={{height: 1, backgroundColor: T.border, marginVertical: 20}} />
                  <Text style={[s.para, {color: T.dim}]}>{t('share.deleteAccountDesc')}</Text>
                  <TouchableOpacity onPress={onDeleteAccount} activeOpacity={0.7} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.dangerBg, borderColor: `${T.danger}40`}}>
                    <Text style={{fontSize: 14, fontWeight: '500', color: T.danger}}>{t('share.deleteAllData')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {(importSource === 'simplyplural' || importSource === 'pluralkit') && (
                <View>
                  <Text style={[s.para, {color: T.dim}]}>{importSource === 'simplyplural' ? t('share.spTokenHint') : t('share.pkTokenHint')}</Text>
                  <TextInput value={extToken} onChangeText={setExtToken} placeholder={importSource === 'simplyplural' ? t('share.spTokenPlaceholder') : t('share.pkTokenPlaceholder')} placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false}
                    style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10, fontFamily: 'monospace'}} />
                  <TouchableOpacity onPress={importSource === 'simplyplural' ? handleSimplyPluralFetch : handlePluralKitFetch} disabled={extLoading} activeOpacity={0.7}
                    style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10, opacity: extLoading ? 0.5 : 1}}>
                    <Text style={{fontSize: 14, fontWeight: '500', color: T.accent}}>{extLoading ? t('share.fetching') : t('share.fetchData')}</Text>
                  </TouchableOpacity>
                  {extLoading && <ActivityIndicator color={T.accent} style={{marginTop: 12}} />}
                  {extPreview && (
                    <View>
                      <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 14}}>
                        <Text style={{fontSize: 16, fontWeight: '600', color: T.accent}}>{extPreview.system?.content?.username || extPreview.system?.name || extPreview.system?.username || t('share.system')}</Text>
                        <Text style={{fontSize: 12, color: T.dim, marginTop: 2}}>{t('share.membersCount', {count: extPreview.members.length})} · {t('share.frontEntries', {count: extPreview.switches.length})}</Text>
                      </View>
                      <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{t('share.importCategories')}</Text>
                      <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 14}}>
                        <View style={{flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: T.border}}>
                          <Text style={{flex: 1, fontSize: 13, color: T.text}}>System &amp; Description</Text>
                          <TouchableOpacity onPress={() => togE('system')} activeOpacity={0.7} style={{width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: extSel.system ? T.accent : T.border, backgroundColor: extSel.system ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
                            {extSel.system && <Text style={{fontSize: 14, color: '#fff', fontWeight: '700'}}>✓</Text>}
                          </TouchableOpacity>
                        </View>
                        <View style={{flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: T.border}}>
                          <Text style={{flex: 1, fontSize: 13, color: T.text}}>Member Profiles</Text>
                          <TouchableOpacity onPress={() => togE('members')} activeOpacity={0.7} style={{width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: extSel.members ? T.accent : T.border, backgroundColor: extSel.members ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
                            {extSel.members && <Text style={{fontSize: 14, color: '#fff', fontWeight: '700'}}>✓</Text>}
                          </TouchableOpacity>
                        </View>
                        <View style={{flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: T.border}}>
                          <Text style={{flex: 1, fontSize: 13, color: T.text}}>Profile Pictures</Text>
                          <TouchableOpacity onPress={() => togE('avatars')} activeOpacity={0.7} style={{width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: extSel.avatars ? T.accent : T.border, backgroundColor: extSel.avatars ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
                            {extSel.avatars && <Text style={{fontSize: 14, color: '#fff', fontWeight: '700'}}>✓</Text>}
                          </TouchableOpacity>
                        </View>
                        <View style={{flexDirection: 'row', alignItems: 'center', padding: 12}}>
                          <Text style={{flex: 1, fontSize: 13, color: T.text}}>Front History</Text>
                          <TouchableOpacity onPress={() => togE('frontHistory')} activeOpacity={0.7} style={{width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: extSel.frontHistory ? T.accent : T.border, backgroundColor: extSel.frontHistory ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
                            {extSel.frontHistory && <Text style={{fontSize: 14, color: '#fff', fontWeight: '700'}}>✓</Text>}
                          </TouchableOpacity>
                        </View>
                      </View>
                      <TouchableOpacity onPress={handleExtImport} activeOpacity={0.7} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
                        <Text style={{fontSize: 14, fontWeight: '500', color: T.accent}}>{t('share.importSelected')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {importSource === 'spfile' && (
                <View>
                  <Text style={[s.para, {color: T.dim}]}>{t('share.spFileHint')}</Text>
                  <TouchableOpacity onPress={handleSPFileImport} activeOpacity={0.7}
                    style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
                    <Text style={{fontSize: 14, fontWeight: '500', color: T.accent}}>{t('share.pickSPFile')}</Text>
                  </TouchableOpacity>
                  {extPreview && (
                    <View>
                      <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 14}}>
                        <Text style={{fontSize: 16, fontWeight: '600', color: T.accent}}>{extPreview.system?.content?.username || extPreview.system?.username || t('share.system')}</Text>
                        <Text style={{fontSize: 12, color: T.dim, marginTop: 2}}>{t('share.membersCount', {count: extPreview.members.length})} · {t('share.frontEntries', {count: extPreview.switches.length})}</Text>
                      </View>
                      <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{t('share.importCategories')}</Text>
                      <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 14}}>
                        <View style={{flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: T.border}}>
                          <Text style={{flex: 1, fontSize: 13, color: T.text}}>System &amp; Description</Text>
                          <TouchableOpacity onPress={() => togE('system')} activeOpacity={0.7} style={{width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: extSel.system ? T.accent : T.border, backgroundColor: extSel.system ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
                            {extSel.system && <Text style={{fontSize: 14, color: '#fff', fontWeight: '700'}}>✓</Text>}
                          </TouchableOpacity>
                        </View>
                        <View style={{flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: T.border}}>
                          <Text style={{flex: 1, fontSize: 13, color: T.text}}>Member Profiles</Text>
                          <TouchableOpacity onPress={() => togE('members')} activeOpacity={0.7} style={{width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: extSel.members ? T.accent : T.border, backgroundColor: extSel.members ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
                            {extSel.members && <Text style={{fontSize: 14, color: '#fff', fontWeight: '700'}}>✓</Text>}
                          </TouchableOpacity>
                        </View>
                        <View style={{flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: T.border}}>
                          <Text style={{flex: 1, fontSize: 13, color: T.text}}>Profile Pictures</Text>
                          <TouchableOpacity onPress={() => togE('avatars')} activeOpacity={0.7} style={{width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: extSel.avatars ? T.accent : T.border, backgroundColor: extSel.avatars ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
                            {extSel.avatars && <Text style={{fontSize: 14, color: '#fff', fontWeight: '700'}}>✓</Text>}
                          </TouchableOpacity>
                        </View>
                        <View style={{flexDirection: 'row', alignItems: 'center', padding: 12}}>
                          <Text style={{flex: 1, fontSize: 13, color: T.text}}>Front History</Text>
                          <TouchableOpacity onPress={() => togE('frontHistory')} activeOpacity={0.7} style={{width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: extSel.frontHistory ? T.accent : T.border, backgroundColor: extSel.frontHistory ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
                            {extSel.frontHistory && <Text style={{fontSize: 14, color: '#fff', fontWeight: '700'}}>✓</Text>}
                          </TouchableOpacity>
                        </View>
                      </View>
                      <TouchableOpacity onPress={handleSPFileConfirmImport} activeOpacity={0.7} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
                        <Text style={{fontSize: 14, fontWeight: '500', color: T.accent}}>{t('share.importSelected')}</Text>
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
            <View style={{flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: T.border}}>
              <Text style={{flex: 1, fontSize: 13, color: T.text}}>Show Current Front</Text>
              <TouchableOpacity onPress={() => tog('showFront')} activeOpacity={0.7} style={{width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: shareSettings.showFront ? T.accent : T.border, backgroundColor: shareSettings.showFront ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
                {shareSettings.showFront && <Text style={{fontSize: 14, color: '#fff', fontWeight: '700'}}>✓</Text>}
              </TouchableOpacity>
            </View>
            <View style={{flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: T.border}}>
              <Text style={{flex: 1, fontSize: 13, color: T.text}}>Show Member List</Text>
              <TouchableOpacity onPress={() => tog('showMembers')} activeOpacity={0.7} style={{width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: shareSettings.showMembers ? T.accent : T.border, backgroundColor: shareSettings.showMembers ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
                {shareSettings.showMembers && <Text style={{fontSize: 14, color: '#fff', fontWeight: '700'}}>✓</Text>}
              </TouchableOpacity>
            </View>
            <View style={{flexDirection: 'row', alignItems: 'center', padding: 12}}>
              <Text style={{flex: 1, fontSize: 13, color: T.text}}>Show Member Descriptions</Text>
              <TouchableOpacity onPress={() => tog('showDescriptions')} activeOpacity={0.7} style={{width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: shareSettings.showDescriptions ? T.accent : T.border, backgroundColor: shareSettings.showDescriptions ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
                {shareSettings.showDescriptions && <Text style={{fontSize: 14, color: '#fff', fontWeight: '700'}}>✓</Text>}
              </TouchableOpacity>
            </View>
          </View>
          <View style={{height: 1, backgroundColor: T.border, marginVertical: 20}} />
          <Text style={[s.para, {color: T.dim}]}>{t('share.preview')}</Text>
          <View style={{backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 16}}>
            <Text style={{fontFamily: 'Georgia', fontSize: 20, color: T.accent, marginBottom: 4, fontStyle: 'italic'}}>{system.name}</Text>
            {system.description ? <Text style={{fontSize: 12, color: T.dim, lineHeight: 18, marginBottom: 12}}>{system.description}</Text> : null}
            {shareSettings.showFront && (
              <View>
                {primaryFronters.length === 0 && coFronters.length === 0 && coConsciousFronters.length === 0
                  ? <Text style={{fontSize: 12, color: T.muted, marginTop: 8}}>{t('share.nobodySet')}</Text>
                  : (<><PreviewTier label={t('tier.primaryFront')} fronters={primaryFronters} color={T.accent} /><PreviewTier label={t('tier.coFront')} fronters={coFronters} color={T.info} /><PreviewTier label={t('tier.coConscious')} fronters={coConsciousFronters} color={T.success} /></>)}
              </View>
            )}
            {shareSettings.showMembers && members.length > 0 && (
              <View style={{marginTop: 10}}>
                <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 6}}>{t('share.membersLabel', {count: members.length})}</Text>
                {members.slice(0, 4).map(m => (
                  <View key={m.id} style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5}}>
                    <View style={{width: 7, height: 7, borderRadius: 3.5, backgroundColor: m.color}} />
                    <Text style={{fontSize: 13, color: T.text}}>{m.name}</Text>
                    {m.pronouns ? <Text style={{fontSize: 11, color: T.dim}}>({m.pronouns})</Text> : null}
                  </View>
                ))}
                {members.length > 4 && <Text style={{fontSize: 11, color: T.muted, marginTop: 2}}>{t('share.more', {count: members.length - 4})}</Text>}
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
  para: {fontSize: 13, lineHeight: 19, marginBottom: 14},
  hint: {fontSize: 11, marginBottom: 4, lineHeight: 16},
});