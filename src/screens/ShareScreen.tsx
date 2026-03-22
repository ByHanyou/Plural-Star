// src/screens/ShareScreen.tsx
import React, {useState} from 'react';
import {View, Text, ScrollView, TouchableOpacity, TextInput, Alert, StyleSheet, ActivityIndicator} from 'react-native';
import DocumentPicker from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import {exportJSON, exportHTML, exportEmail, exportAllJournalJSON, exportAllJournalTxt, exportAllJournalMd} from '../export/exportUtils';
import {store, KEYS} from '../storage';
import {SystemInfo, Member, FrontState, HistoryEntry, JournalEntry, ShareSettings, ExportPayload, uid} from '../utils';

type Section = 'export' | 'import' | 'shareview';
type ImportSource = 'backup' | 'journal' | 'simplyplural' | 'pluralkit';

interface Props {
  theme: any;
  system: SystemInfo;
  members: Member[];
  front: FrontState | null;
  history: HistoryEntry[];
  journal: JournalEntry[];
  shareSettings: ShareSettings;
  onSettingsChange: (s: ShareSettings) => void;
  getMember: (id: string) => Member | undefined;
  onDataImported: () => void;
  onAddJournalEntry: (entry: JournalEntry) => void;
  onDeleteAccount: () => void;
}

export const ShareScreen = ({theme: T, system, members, front, history, journal, shareSettings, onSettingsChange, getMember, onDataImported, onAddJournalEntry, onDeleteAccount}: Props) => {
  const [section, setSection] = useState<Section>('export');
  const [emailAddr, setEmailAddr] = useState('');
  const [restoreFile, setRestoreFile] = useState<string | null>(null);
  const [restoreData, setRestoreData] = useState<ExportPayload | null>(null);
  const [restoreSel, setRestoreSel] = useState({system: true, members: true, journal: true, frontHistory: true});
  const [restoreError, setRestoreError] = useState('');
  const [restoreDone, setRestoreDone] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [importMsg, setImportMsg] = useState('');
  const [importSource, setImportSource] = useState<ImportSource>('backup');
  const [extToken, setExtToken] = useState('');
  const [extLoading, setExtLoading] = useState(false);
  const [extPreview, setExtPreview] = useState<{members: any[]; switches: any[]; system: any} | null>(null);
  const [extSel, setExtSel] = useState({system: true, members: true, frontHistory: true});

  const fronters = (front?.memberIds || []).map(getMember).filter(Boolean) as Member[];
  const tog = (k: keyof ShareSettings) => onSettingsChange({...shareSettings, [k]: !shareSettings[k]});
  const togR = (k: keyof typeof restoreSel) => setRestoreSel(s => ({...s, [k]: !s[k]}));
  const togE = (k: keyof typeof extSel) => setExtSel(s => ({...s, [k]: !s[k]}));

  const handleJSON = async () => {try {await exportJSON(system, members, history, journal);} catch (e) {Alert.alert('Export Failed', String(e));}};
  const handleHTML = async () => {try {await exportHTML(system, members, history, journal);} catch (e) {Alert.alert('Export Failed', String(e));}};
  const handleEmail = () => {
    if (!emailAddr.trim() || !emailAddr.includes('@')) {Alert.alert('Invalid Email', 'Enter a valid email address first.'); return;}
    exportEmail(system, members, history, journal, emailAddr);
  };
  const handleJournalExport = async (fmt: 'json' | 'txt' | 'md') => {
    try {
      if (fmt === 'json') await exportAllJournalJSON(journal, system.name);
      else if (fmt === 'txt') await exportAllJournalTxt(journal, members, system.name);
      else await exportAllJournalMd(journal, members, system.name);
    } catch (e) {Alert.alert('Export Failed', String(e));}
  };

  const handleImportJournalFile = async () => {
    setImportStatus('idle'); setImportMsg('');
    try {
      const [res] = await DocumentPicker.pick({type: ['public.text', 'public.plain-text', 'text/plain', 'text/markdown', 'application/json', 'public.json']});
      const ext = (res.name || '').split('.').pop()?.toLowerCase() || '';
      const titleBase = (res.name || 'Imported Entry').replace(/\.[^.]+$/, '');
      let body = '';
      if (['txt', 'md', 'markdown'].includes(ext)) {body = await RNFS.readFile(res.uri, 'utf8');}
      else if (ext === 'json') {
        const raw = await RNFS.readFile(res.uri, 'utf8');
        try {
          const parsed = JSON.parse(raw);
          if (parsed._meta?.app === 'Plural Space') {setImportStatus('error'); setImportMsg('That looks like a backup file. Use Restore Backup instead.'); return;}
          body = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
        } catch {body = raw;}
      } else {setImportStatus('error'); setImportMsg(`Unsupported format ".${ext}". Supported: .txt, .md, .json`); return;}
      onAddJournalEntry({id: uid(), title: titleBase, body, authorIds: [], hashtags: [], timestamp: Date.now()});
      setImportStatus('success'); setImportMsg(`"${titleBase}" imported as a new journal entry.`);
    } catch (e: any) {if (!DocumentPicker.isCancel(e)) {setImportStatus('error'); setImportMsg(e.message || 'Could not import file.');}}
  };

  const handlePickBackup = async () => {
    setRestoreError(''); setRestoreData(null); setRestoreFile(null); setRestoreDone(false);
    try {
      const [res] = await DocumentPicker.pick({type: ['application/json', 'public.json']});
      const content = await RNFS.readFile(res.uri, 'utf8');
      const parsed: ExportPayload = JSON.parse(content);
      if (!parsed._meta || parsed._meta.app !== 'Plural Space') throw new Error('Not a valid Plural Space export file.');
      setRestoreFile(res.name || 'backup.json'); setRestoreData(parsed);
    } catch (e: any) {if (!DocumentPicker.isCancel(e)) setRestoreError(e.message || 'Could not read file.');}
  };

  const handleRestore = () => {
    if (!restoreData) return;
    Alert.alert('Restore Data', 'This will overwrite the selected categories. Continue?', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Restore', style: 'destructive', onPress: async () => {
        if (restoreSel.system && restoreData.system) await store.set(KEYS.system, restoreData.system);
        if (restoreSel.members && restoreData.members) await store.set(KEYS.members, restoreData.members);
        if (restoreSel.journal && restoreData.journal) await store.set(KEYS.journal, restoreData.journal);
        if (restoreSel.frontHistory && restoreData.frontHistory) await store.set(KEYS.history, restoreData.frontHistory);
        setRestoreDone(true); setTimeout(() => onDataImported(), 800);
      }},
    ]);
  };

  const handleSimplyPluralFetch = async () => {
    if (!extToken.trim()) {Alert.alert('Token Required', 'Enter your Simply Plural API token.'); return;}
    setExtLoading(true); setExtPreview(null);
    try {
      const headers = {Authorization: extToken.trim(), 'Content-Type': 'application/json'};
      const meRes = await fetch('https://v2.apparyllis.com/v1/me', {headers});
      if (!meRes.ok) throw new Error(`Auth failed (${meRes.status}). Check your token.`);
      const meData = await meRes.json();
      const userId = meData.id || meData.uid;
      const [mRes, sRes] = await Promise.all([
        fetch(`https://v2.apparyllis.com/v1/members/${userId}`, {headers}),
        fetch(`https://v2.apparyllis.com/v1/switches/${userId}?limit=500`, {headers}),
      ]);
      let mData: any = []; let sData: any = [];
      try { mData = await mRes.json(); } catch { mData = []; }
      try { sData = await sRes.json(); } catch { sData = []; }
      const memberList = Array.isArray(mData) ? mData : (mData.members || []);
      const switchList = Array.isArray(sData) ? sData : (sData.switches || []);
      const sanitized = memberList.map((m: any) => {
        if (m?.content?.name) m.content.name = String(m.content.name).replace(/[\u0000-\u001F\u007F]/g, '').trim();
        if (m?.name) m.name = String(m.name).replace(/[\u0000-\u001F\u007F]/g, '').trim();
        return m;
      });
      setExtPreview({system: meData, members: sanitized, switches: switchList});
    } catch (e: any) {Alert.alert('Import Failed', e.message || 'Could not connect to Simply Plural.');}
    finally {setExtLoading(false);}
  };

  const handlePluralKitFetch = async () => {
    if (!extToken.trim()) {Alert.alert('Token Required', 'Enter your PluralKit token.'); return;}
    setExtLoading(true); setExtPreview(null);
    try {
      const headers = {Authorization: extToken.trim(), 'Content-Type': 'application/json', 'User-Agent': 'PluralSpace/1.0'};
      const [sRes, mRes, swRes] = await Promise.all([
        fetch('https://api.pluralkit.me/v2/systems/@me', {headers}),
        fetch('https://api.pluralkit.me/v2/systems/@me/members', {headers}),
        fetch('https://api.pluralkit.me/v2/systems/@me/switches?limit=500', {headers}),
      ]);
      if (!sRes.ok) throw new Error(`Auth failed (${sRes.status}). Check your token.`);
      let sData: any = {}; let mData: any = []; let swData: any = [];
      try { sData = await sRes.json(); } catch { sData = {}; }
      try { mData = await mRes.json(); } catch { mData = []; }
      try { swData = await swRes.json(); } catch { swData = []; }
      const memberList = Array.isArray(mData) ? mData : [];
      const sanitized = memberList.map((m: any) => {
        if (m?.display_name) m.display_name = String(m.display_name).replace(/[\u0000-\u001F\u007F]/g, '').trim();
        if (m?.name) m.name = String(m.name).replace(/[\u0000-\u001F\u007F]/g, '').trim();
        return m;
      });
      setExtPreview({system: sData, members: sanitized, switches: Array.isArray(swData) ? swData : []});
    } catch (e: any) {Alert.alert('Import Failed', e.message || 'Could not connect to PluralKit.');}
    finally {setExtLoading(false);}
  };

  const handleExtImport = () => {
    if (!extPreview) return;
    const isPK = importSource === 'pluralkit';
    Alert.alert('Import Data', 'This will add data to your existing records. Continue?', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Import', onPress: async () => {
        if (extSel.system && extPreview.system) {
          const name = isPK ? extPreview.system.name : (extPreview.system.username || extPreview.system.name || system.name);
          await store.set(KEYS.system, {...system, name: name || system.name, description: extPreview.system.description || system.description});
        }
        if (extSel.members && extPreview.members.length > 0) {
          const newM: Member[] = extPreview.members.map((m: any) => ({
            id: uid(), name: isPK ? m.display_name || m.name : (m.content?.name || m.name || 'Unknown'),
            pronouns: isPK ? (m.pronouns || '') : (m.content?.pronouns || ''),
            role: isPK ? '' : (m.content?.role || ''),
            color: isPK ? (m.color ? `#${m.color}` : '#DAA520') : (m.content?.color || '#DAA520'),
            description: isPK ? (m.description || '') : (m.content?.desc || ''),
          }));
          const merged = [...members, ...newM.filter(nm => !members.find(em => em.name.toLowerCase() === nm.name.toLowerCase()))];
          await store.set(KEYS.members, merged);
        }
        if (extSel.frontHistory && extPreview.switches.length > 0) {
          const newH: HistoryEntry[] = extPreview.switches.map((sw: any, i: number, arr: any[]) => {
            const next = arr[i - 1];
            return {memberIds: [], startTime: isPK ? new Date(sw.timestamp).getTime() : (sw.content?.startTime || Date.now()),
              endTime: isPK ? (next ? new Date(next.timestamp).getTime() : null) : (sw.content?.endTime || null),
              note: isPK ? '' : (sw.content?.comment || ''), mood: undefined, location: undefined};
          });
          await store.set(KEYS.history, [...newH, ...history].sort((a, b) => b.startTime - a.startTime).slice(0, 1000));
        }
        setExtPreview(null); setExtToken(''); setTimeout(() => onDataImported(), 500);
      }},
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert('Delete All Data', 'This will permanently erase everything. This cannot be undone.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete Everything', style: 'destructive', onPress: () => {
        Alert.alert('Are you absolutely sure?', 'All your data will be gone forever.', [
          {text: 'Cancel', style: 'cancel'},
          {text: 'Yes, Delete Everything', style: 'destructive', onPress: onDeleteAccount},
        ]);
      }},
    ]);
  };

  const SectionBtn = ({id, label}: {id: Section; label: string}) => (
    <TouchableOpacity onPress={() => setSection(id)} activeOpacity={0.7}
      style={{flex: 1, paddingVertical: 8, borderRadius: 7, borderWidth: 1, alignItems: 'center',
        backgroundColor: section === id ? T.accentBg : 'transparent', borderColor: section === id ? `${T.accent}40` : T.border}}>
      <Text style={{fontSize: 12, color: section === id ? T.accent : T.dim, fontWeight: section === id ? '600' : '400'}}>{label}</Text>
    </TouchableOpacity>
  );

  const SourceBtn = ({id, label}: {id: ImportSource; label: string}) => (
    <TouchableOpacity onPress={() => {setImportSource(id); setExtPreview(null); setExtToken('');}} activeOpacity={0.7}
      style={{paddingVertical: 7, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1,
        backgroundColor: importSource === id ? T.accentBg : 'transparent', borderColor: importSource === id ? `${T.accent}40` : T.border}}>
      <Text style={{fontSize: 12, color: importSource === id ? T.accent : T.dim, fontWeight: importSource === id ? '600' : '400'}}>{label}</Text>
    </TouchableOpacity>
  );

  const Divider = ({label}: {label: string}) => (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 18}}>
      <View style={{flex: 1, height: 1, backgroundColor: T.border}} />
      <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.muted, fontWeight: '600'}}>{label}</Text>
      <View style={{flex: 1, height: 1, backgroundColor: T.border}} />
    </View>
  );

  const Toggle = ({value, onToggle}: {value: boolean; onToggle: () => void}) => (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.8}
      style={{width: 40, height: 22, borderRadius: 11, backgroundColor: value ? T.accent : T.muted, justifyContent: 'center'}}>
      <View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', position: 'absolute', left: value ? 20 : 3}} />
    </TouchableOpacity>
  );

  const SectionRow = ({label, sublabel, value, onToggle, disabled = false}: any) => (
    <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13,
      borderBottomWidth: 1, borderBottomColor: T.border, paddingHorizontal: 14, opacity: disabled ? 0.4 : 1}}>
      <View style={{flex: 1}}>
        <Text style={{fontSize: 14, color: T.text, fontWeight: '500'}}>{label}</Text>
        {sublabel && <Text style={{fontSize: 11, color: T.muted, marginTop: 2}}>{sublabel}</Text>}
      </View>
      <Toggle value={value && !disabled} onToggle={disabled ? () => {} : onToggle} />
    </View>
  );

  return (
    <ScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled">
      <Text style={[s.heading, {color: T.text}]}>Share & Export</Text>

      <View style={{flexDirection: 'row', gap: 6, marginBottom: 4}}>
        <SectionBtn id="export" label="Export" />
        <SectionBtn id="import" label="Import" />
        <SectionBtn id="shareview" label="Share View" />
      </View>

      {section === 'export' && (
        <View>
          <Divider label="Full System Export" />
          <Text style={[s.para, {color: T.dim}]}>Downloads directly to your Downloads folder.</Text>
          <View style={{flexDirection: 'row', gap: 8, marginBottom: 6}}>
            {[['↓ JSON', handleJSON, T.accentBg, T.accent, `${T.accent}40`], ['↓ HTML', handleHTML, T.infoBg, T.info, `${T.info}40`]].map(([label, fn, bg, color, border]: any) => (
              <TouchableOpacity key={label} onPress={fn} activeOpacity={0.7}
                style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: bg, borderColor: border}}>
                <Text style={{fontSize: 14, fontWeight: '500', color}}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[s.hint, {color: T.muted}]}>HTML opens natively in Google Docs when uploaded to Drive.</Text>

          <Divider label="Journal Export" />
          <Text style={[s.para, {color: T.dim}]}>Export only your journal entries.</Text>
          <View style={{flexDirection: 'row', gap: 8, marginBottom: 6}}>
            {[['↓ .txt', 'txt', T.accentBg, T.accent, `${T.accent}40`], ['↓ .md', 'md', T.infoBg, T.info, `${T.info}40`], ['↓ .json', 'json', 'transparent', T.dim, T.border]].map(([label, fmt, bg, color, border]: any) => (
              <TouchableOpacity key={fmt} onPress={() => handleJournalExport(fmt)} activeOpacity={0.7}
                style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: bg, borderColor: border}}>
                <Text style={{fontSize: 13, fontWeight: '500', color}}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[s.hint, {color: T.muted}]}>Per-entry export: tap the ↑ icon on any journal card.</Text>

          <Divider label="Send via Email" />
          <TextInput value={emailAddr} onChangeText={setEmailAddr} placeholder="recipient@email.com"
            placeholderTextColor={T.muted} keyboardType="email-address" autoCapitalize="none"
            style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10}} />
          <TouchableOpacity onPress={handleEmail} activeOpacity={0.7}
            style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
            <Text style={{fontSize: 14, fontWeight: '500', color: T.accent}}>✉ Open in Mail App</Text>
          </TouchableOpacity>
        </View>
      )}

      {section === 'import' && (
        <View>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, marginBottom: 4}}>
            <SourceBtn id="journal" label="Journal File" />
            <SourceBtn id="backup" label="Backup" />
            <SourceBtn id="simplyplural" label="Simply Plural" />
            <SourceBtn id="pluralkit" label="PluralKit" />
          </View>

          {importSource === 'journal' && (
            <View>
              <Divider label="Import Journal Entry" />
              <Text style={[s.para, {color: T.dim}]}>Import a .txt, .md, or .json file as a new journal entry.</Text>
              <TouchableOpacity onPress={handleImportJournalFile} activeOpacity={0.7}
                style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
                <Text style={{fontSize: 14, fontWeight: '500', color: T.accent}}>↑ Pick File to Import</Text>
              </TouchableOpacity>
              {importStatus === 'success' && <View style={{backgroundColor: T.successBg, borderWidth: 1, borderColor: `${T.success}30`, borderRadius: 8, padding: 12, marginBottom: 12}}><Text style={{fontSize: 13, color: T.success}}>✓ {importMsg}</Text></View>}
              {importStatus === 'error' && <View style={{backgroundColor: T.dangerBg, borderWidth: 1, borderColor: `${T.danger}30`, borderRadius: 7, padding: 10, marginBottom: 12}}><Text style={{fontSize: 13, color: T.danger}}>⚠ {importMsg}</Text></View>}
            </View>
          )}

          {importSource === 'backup' && (
            <View>
              <Divider label="Restore Backup" />
              <Text style={[s.para, {color: T.dim}]}>Load a previously exported JSON backup.</Text>
              <TouchableOpacity onPress={handlePickBackup} activeOpacity={0.7}
                style={{borderWidth: 1.5, borderStyle: 'dashed', borderColor: restoreFile ? T.success : T.border, borderRadius: 10, padding: 22, alignItems: 'center', marginBottom: 14, gap: 6,
                  backgroundColor: restoreFile ? T.successBg : 'transparent'}}>
                <Text style={{fontSize: 20, color: T.dim}}>↑</Text>
                <Text style={{fontSize: 13, color: restoreFile ? T.success : T.dim, textAlign: 'center'}}>{restoreFile || 'Tap to select a .json backup file'}</Text>
                {restoreData && <Text style={{fontSize: 11, color: T.muted}}>Exported {new Date(restoreData._meta.exportedAt).toLocaleString()}</Text>}
              </TouchableOpacity>
              {restoreError ? <View style={{backgroundColor: T.dangerBg, borderWidth: 1, borderColor: `${T.danger}30`, borderRadius: 7, padding: 10, marginBottom: 12}}><Text style={{fontSize: 13, color: T.danger}}>⚠ {restoreError}</Text></View> : null}
              {restoreData && (
                <>
                  <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>Restore these categories</Text>
                  <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 14}}>
                    {([['system', 'System Name & Description', !!restoreData.system, null], ['members', 'Member Profiles', !!restoreData.members, restoreData.members?.length], ['journal', 'Journal Entries', !!restoreData.journal, restoreData.journal?.length], ['frontHistory', 'Front History', !!restoreData.frontHistory, restoreData.frontHistory?.length]] as any[]).map(([k, label, avail, count]) => (
                      <SectionRow key={k} label={label} sublabel={avail && count !== null ? `${count} records` : avail ? undefined : 'Not in export'}
                        value={restoreSel[k as keyof typeof restoreSel]} onToggle={() => togR(k)} disabled={!avail} />
                    ))}
                  </View>
                  {restoreDone
                    ? <View style={{backgroundColor: T.successBg, borderWidth: 1, borderColor: `${T.success}30`, borderRadius: 8, padding: 12, alignItems: 'center'}}><Text style={{fontSize: 13, color: T.success, fontWeight: '500'}}>✓ Restore complete. Reloading…</Text></View>
                    : <TouchableOpacity onPress={handleRestore} activeOpacity={0.7} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.dangerBg, borderColor: `${T.danger}40`}}>
                        <Text style={{fontSize: 14, fontWeight: '500', color: T.danger}}>⚠ Restore Selected Data</Text>
                      </TouchableOpacity>}
                </>
              )}
              <Divider label="Delete Account" />
              <Text style={[s.para, {color: T.dim}]}>Permanently erase all data and return to setup.</Text>
              <TouchableOpacity onPress={handleDeleteAccount} activeOpacity={0.7}
                style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.dangerBg, borderColor: `${T.danger}40`}}>
                <Text style={{fontSize: 14, fontWeight: '500', color: T.danger}}>✕ Delete All Data</Text>
              </TouchableOpacity>
            </View>
          )}

          {(importSource === 'simplyplural' || importSource === 'pluralkit') && (
            <View>
              <Divider label={importSource === 'simplyplural' ? 'Simply Plural Import' : 'PluralKit Import'} />
              <Text style={[s.para, {color: T.dim}]}>
                {importSource === 'simplyplural'
                  ? 'Generate a Read token in Simply Plural under Settings → Account → Tokens.'
                  : "Get your token by DMing the PluralKit bot: pk;token"}
              </Text>
              <TextInput value={extToken} onChangeText={setExtToken}
                placeholder={importSource === 'simplyplural' ? 'Paste your Simply Plural token' : 'Paste your PluralKit token'}
                placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false}
                style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10, fontFamily: 'monospace'}} />
              <TouchableOpacity onPress={importSource === 'simplyplural' ? handleSimplyPluralFetch : handlePluralKitFetch}
                disabled={extLoading} activeOpacity={0.7}
                style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10, opacity: extLoading ? 0.5 : 1}}>
                <Text style={{fontSize: 14, fontWeight: '500', color: T.accent}}>{extLoading ? 'Fetching…' : 'Fetch Data'}</Text>
              </TouchableOpacity>
              {extLoading && <ActivityIndicator color={T.accent} style={{marginTop: 12}} />}
              {extPreview && (
                <View>
                  <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 14}}>
                    <Text style={{fontSize: 16, fontWeight: '600', color: T.accent}}>{extPreview.system?.name || extPreview.system?.username || 'System'}</Text>
                    <Text style={{fontSize: 12, color: T.dim, marginTop: 2}}>{extPreview.members.length} members · {extPreview.switches.length} switches</Text>
                  </View>
                  <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>Import these categories</Text>
                  <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 14}}>
                    <SectionRow label="System Name & Description" value={extSel.system} onToggle={() => togE('system')} />
                    <SectionRow label="Member Profiles" sublabel={`${extPreview.members.length} members`} value={extSel.members} onToggle={() => togE('members')} />
                    <SectionRow label="Front History" sublabel={`${extPreview.switches.length} switches`} value={extSel.frontHistory} onToggle={() => togE('frontHistory')} />
                  </View>
                  <TouchableOpacity onPress={handleExtImport} activeOpacity={0.7}
                    style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
                    <Text style={{fontSize: 14, fontWeight: '500', color: T.accent}}>Import Selected</Text>
                  </TouchableOpacity>
                  {importSource === 'pluralkit' && <Text style={[s.hint, {color: T.muted}]}>Octocon users: use this tab — Octocon imports from PluralKit.</Text>}
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {section === 'shareview' && (
        <View>
          <Text style={[s.para, {color: T.dim, marginTop: 8}]}>Control what's visible in shared exports and email summaries.</Text>
          <View style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 4}}>
            <SectionRow label="Show current front" value={shareSettings.showFront} onToggle={() => tog('showFront')} />
            <SectionRow label="Show member list" value={shareSettings.showMembers} onToggle={() => tog('showMembers')} />
            <SectionRow label="Show member descriptions" value={shareSettings.showDescriptions} onToggle={() => tog('showDescriptions')} />
          </View>
          <Divider label="Preview" />
          <View style={{backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 16}}>
            <Text style={{fontFamily: 'Georgia', fontSize: 20, color: T.accent, marginBottom: 4, fontStyle: 'italic'}}>{system.name}</Text>
            {system.description ? <Text style={{fontSize: 12, color: T.dim, lineHeight: 18, marginBottom: 12}}>{system.description}</Text> : null}
            {shareSettings.showFront && (
              <View style={{marginTop: 10}}>
                <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 6}}>Currently Fronting</Text>
                {fronters.length > 0 ? (
                  <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
                    {fronters.map(m => (
                      <View key={m.id} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, backgroundColor: `${m.color}18`, borderColor: `${m.color}30`}}>
                        <View style={{width: 7, height: 7, borderRadius: 3.5, backgroundColor: m.color}} />
                        <Text style={{fontSize: 13, color: T.text}}>{m.name}</Text>
                      </View>
                    ))}
                  </View>
                ) : <Text style={{fontSize: 12, color: T.muted}}>Nobody set</Text>}
              </View>
            )}
            {shareSettings.showMembers && members.length > 0 && (
              <View style={{marginTop: 10}}>
                <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 6}}>Members ({members.length})</Text>
                {members.slice(0, 4).map(m => (
                  <View key={m.id} style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5}}>
                    <View style={{width: 7, height: 7, borderRadius: 3.5, backgroundColor: m.color}} />
                    <Text style={{fontSize: 13, color: T.text}}>{m.name}</Text>
                    {m.pronouns ? <Text style={{fontSize: 11, color: T.dim}}>({m.pronouns})</Text> : null}
                  </View>
                ))}
                {members.length > 4 && <Text style={{fontSize: 11, color: T.muted, marginTop: 2}}>+{members.length - 4} more</Text>}
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
  heading: {fontFamily: 'Georgia', fontSize: 26, fontWeight: '600', fontStyle: 'italic', marginBottom: 16},
  para: {fontSize: 13, lineHeight: 19, marginBottom: 14},
  hint: {fontSize: 11, marginBottom: 4, lineHeight: 16},
});
