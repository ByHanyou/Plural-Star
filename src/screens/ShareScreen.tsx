import React, {useState} from 'react';
import {View, Text, ScrollView, TouchableOpacity, TextInput, Alert, StyleSheet, ActivityIndicator} from 'react-native';
import {useTranslation} from 'react-i18next';
import {pick as pickDocument, isCancel as isPickerCancel} from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import {exportJSON, exportHTML, exportEmail, exportAllJournalJSON, exportAllJournalTxt, exportAllJournalMd} from '../export/exportUtils';
import {store, KEYS} from '../storage';
import {SystemInfo, Member, FrontState, HistoryEntry, JournalEntry, ShareSettings, AppSettings, ExportPayload, uid, allFrontMemberIds} from '../utils';

type Section = 'export' | 'import' | 'shareview';
type ImportSource = 'backup' | 'journal' | 'simplyplural' | 'pluralkit';

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

  const primaryFronters = (front?.primary?.memberIds || []).map(getMember).filter(Boolean) as Member[];
  const coFronters = (front?.coFront?.memberIds || []).map(getMember).filter(Boolean) as Member[];
  const coConsciousFronters = (front?.coConscious?.memberIds || []).map(getMember).filter(Boolean) as Member[];

  const tog = (k: keyof ShareSettings) => onSettingsChange({...shareSettings, [k]: !shareSettings[k]});
  const togR = (k: keyof typeof restoreSel) => setRestoreSel(s => ({...s, [k]: !s[k]}));
  const togE = (k: keyof typeof extSel) => setExtSel(s => ({...s, [k]: !s[k]}));

  const handleJSON = async () => {try {await exportJSON(system, members, history, journal);} catch (e) {Alert.alert(t('share.exportFailed'), String(e));}};
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
      const [res] = await pickDocument({type: ['text/plain', 'text/markdown', 'application/json']});
      const ext = (res.name || '').split('.').pop()?.toLowerCase() || '';
      const titleBase = (res.name || 'Imported Entry').replace(/\.[^.]+$/, '');
      let body = '';
      if (['txt', 'md', 'markdown'].includes(ext)) {body = await RNFS.readFile(res.uri, 'utf8');}
      else if (ext === 'json') {
        const raw = await RNFS.readFile(res.uri, 'utf8');
        try { const parsed = JSON.parse(raw); if (parsed._meta?.app === 'Plural Space') {setImportStatus('error'); setImportMsg(t('share.backupLooksLike')); return;} body = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
        } catch {body = raw;}
      } else {setImportStatus('error'); setImportMsg(t('share.unsupportedFormat', {ext})); return;}
      onAddJournalEntry({id: uid(), title: titleBase, body, authorIds: [], hashtags: [], timestamp: Date.now()});
      setImportStatus('success'); setImportMsg(t('share.importedAsEntry', {title: titleBase}));
    } catch (e: any) {if (!isPickerCancel(e)) {setImportStatus('error'); setImportMsg(e.message || 'Could not import file.');}}
  };

  const handlePickBackup = async () => {
    setRestoreError(''); setRestoreData(null); setRestoreFile(null); setRestoreDone(false);
    try {
      const [res] = await pickDocument({type: ['application/json']});
      const content = await RNFS.readFile(res.uri, 'utf8');
      const parsed: ExportPayload = JSON.parse(content);
      if (!parsed._meta || parsed._meta.app !== 'Plural Space') throw new Error(t('share.notValidExport'));
      setRestoreFile(res.name || 'backup.json'); setRestoreData(parsed);
    } catch (e: any) {if (!isPickerCancel(e)) setRestoreError(e.message || 'Could not read file.');}
  };

  const handleRestore = () => {
    if (!restoreData) return;
    Alert.alert(t('share.restoreData'), t('share.restoreDataMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('share.restore'), style: 'destructive', onPress: async () => {
        if (restoreSel.system && restoreData.system) await store.set(KEYS.system, restoreData.system);
        if (restoreSel.members && restoreData.members) await store.set(KEYS.members, restoreData.members);
        if (restoreSel.journal && restoreData.journal) await store.set(KEYS.journal, restoreData.journal);
        if (restoreSel.frontHistory && restoreData.frontHistory) await store.set(KEYS.history, restoreData.frontHistory);
        setRestoreDone(true); setTimeout(() => onDataImported(), 800);
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
          const newM: Member[] = extPreview.members.map((m: any) => ({id: uid(), name: isPK ? m.display_name || m.name : (m.content?.name || m.name || 'Unknown'), pronouns: isPK ? (m.pronouns || '') : (m.content?.pronouns || ''), role: isPK ? '' : (m.content?.role || ''), color: isPK ? (m.color ? `#${m.color}` : '#DAA520') : (m.content?.color || '#DAA520'), description: isPK ? (m.description || '') : (m.content?.desc || '')}));
          const merged = [...members, ...newM.filter(nm => !members.find(em => em.name.toLowerCase() === nm.name.toLowerCase()))];
          await store.set(KEYS.members, merged);
          const idMap: Record<string, string> = {};
          extPreview.members.forEach((m: any, i: number) => { const eid = isPK ? (m.uuid || m.id) : m.id; const lm = merged.find(l => l.name.toLowerCase() === newM[i]?.name.toLowerCase()); if (eid && lm) idMap[eid] = lm.id; if (isPK && m.id && lm) idMap[m.id] = lm.id; });
          if (extSel.frontHistory && extPreview.switches.length > 0) { const newH = isPK ? convertPKSwitches(extPreview.switches, idMap) : convertSPSwitches(extPreview.switches, idMap); if (newH.length > 0) await store.set(KEYS.history, [...newH, ...history].sort((a, b) => b.startTime - a.startTime).slice(0, 1000)); }
        } else if (extSel.frontHistory && extPreview.switches.length > 0) {
          const existingIdMap: Record<string, string> = {};
          extPreview.members.forEach((m: any) => { const eid = isPK ? (m.uuid || m.id) : m.id; const name = isPK ? (m.display_name || m.name || '') : (m.content?.name || m.name || ''); const lm = members.find(l => l.name.toLowerCase() === name.toLowerCase()); if (eid && lm) existingIdMap[eid] = lm.id; if (isPK && m.id && lm) existingIdMap[m.id] = lm.id; });
          const newH = isPK ? convertPKSwitches(extPreview.switches, existingIdMap) : convertSPSwitches(extPreview.switches, existingIdMap);
          if (newH.length > 0) await store.set(KEYS.history, [...newH, ...history].sort((a, b) => b.startTime - a.startTime).slice(0, 1000));
        }
        setExtPreview(null); setExtToken(''); setTimeout(() => onDataImported(), 500);
      }},
    ]);
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
    <TouchableOpacity onPress={onToggle} activeOpacity={0.8} style={{width: 40, height: 22, borderRadius: 11, backgroundColor: value ? T.accent : T.muted, justifyContent: 'center'}}>
      <View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', position: 'absolute', left: value ? 20 : 3}} />
    </TouchableOpacity>
  );

  const SectionRow = ({label, sublabel, value, onToggle, disabled = false}: any) => (
    <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: T.border, paddingHorizontal: 14, opacity: disabled ? 0.4 : 1}}>
      <View style={{flex: 1}}><Text style={{fontSize: 14, color: T.text, fontWeight: '500'}}>{label}</Text>{sublabel && <Text style={{fontSize: 11, color: T.muted, marginTop: 2}}>{sublabel}</Text>}</View>
      <Toggle value={value && !disabled} onToggle={disabled ? () => {} : onToggle} />
    </View>
  );

  const PreviewTier = ({label, fronters, color}: {label: string; fronters: Member[]; color: string}) => {
    if (fronters.length === 0) return null;
    return (
      <View style={{marginTop: 8}}>
        <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color, fontWeight: '600', marginBottom: 5}}>{label}</Text>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
          {fronters.map(m => (
            <View key={m.id} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, backgroundColor: `${m.color}18`, borderColor: `${m.color}30`}}>
              <View style={{width: 7, height: 7, borderRadius: 3.5, backgroundColor: m.color}} /><Text style={{fontSize: 13, color: T.text}}>{m.name}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={[s.heading, {color: T.text}]}>{t('share.title')}</Text>
      <View style={{flexDirection: 'row', gap: 6, marginBottom: 4}}>
        <SectionBtn id="export" label={t('share.export')} />
        <SectionBtn id="import" label={t('share.import')} />
        <SectionBtn id="shareview" label={t('share.shareView')} />
      </View>

      {section === 'export' && (
        <View>
          <Divider label={t('share.fullSystemExport')} />
          <Text style={[s.para, {color: T.dim}]}>{t('share.downloadsDirectly')}</Text>
          <View style={{flexDirection: 'row', gap: 8, marginBottom: 6}}>
            {[['↓ JSON', handleJSON, T.accentBg, T.accent, `${T.accent}40`], ['↓ HTML', handleHTML, T.infoBg, T.info, `${T.info}40`]].map(([label, fn, bg, color, border]: any) => (
              <TouchableOpacity key={label} onPress={fn} activeOpacity={0.7} style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: bg, borderColor: border}}>
                <Text style={{fontSize: 14, fontWeight: '500', color}}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[s.hint, {color: T.muted}]}>{t('share.htmlHint')}</Text>
          <Divider label={t('share.journalExport')} />
          <Text style={[s.para, {color: T.dim}]}>{t('share.exportJournalOnly')}</Text>
          <View style={{flexDirection: 'row', gap: 8, marginBottom: 6}}>
            {[['↓ .txt', 'txt', T.accentBg, T.accent, `${T.accent}40`], ['↓ .md', 'md', T.infoBg, T.info, `${T.info}40`], ['↓ .json', 'json', 'transparent', T.dim, T.border]].map(([label, fmt, bg, color, border]: any) => (
              <TouchableOpacity key={fmt} onPress={() => handleJournalExport(fmt)} activeOpacity={0.7} style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: bg, borderColor: border}}>
                <Text style={{fontSize: 13, fontWeight: '500', color}}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[s.hint, {color: T.muted}]}>{t('share.perEntryHint')}</Text>
          <Divider label={t('share.sendEmail')} />
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
            <SourceBtn id="journal" label={t('share.journalFile')} />
            <SourceBtn id="backup" label={t('share.backup')} />
            <SourceBtn id="simplyplural" label={t('share.simplyPlural')} />
            <SourceBtn id="pluralkit" label={t('share.pluralKit')} />
          </View>
          {importSource === 'journal' && (
            <View>
              <Divider label={t('share.importJournalEntry')} />
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
              <Divider label={t('share.restoreBackup')} />
              <Text style={[s.para, {color: T.dim}]}>{t('share.restoreBackupDesc')}</Text>
              <TouchableOpacity onPress={handlePickBackup} activeOpacity={0.7} style={{borderWidth: 1.5, borderStyle: 'dashed', borderColor: restoreFile ? T.success : T.border, borderRadius: 10, padding: 22, alignItems: 'center', marginBottom: 14, gap: 6, backgroundColor: restoreFile ? T.successBg : 'transparent'}}>
                <Text style={{fontSize: 20, color: T.dim}}>↑</Text>
                <Text style={{fontSize: 13, color: restoreFile ? T.success : T.dim, textAlign: 'center'}}>{restoreFile || t('share.tapToSelect')}</Text>
                {restoreData && <Text style={{fontSize: 11, color: T.muted}}>{t('share.exported', {date: new Date(restoreData._meta.exportedAt).toLocaleString()})}</Text>}
              </TouchableOpacity>
              {restoreError ? <View style={{backgroundColor: T.dangerBg, borderWidth: 1, borderColor: `${T.danger}30`, borderRadius: 7, padding: 10, marginBottom: 12}}><Text style={{fontSize: 13, color: T.danger}}>⚠ {restoreError}</Text></View> : null}
              {restoreData && (
                <>
                  <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{t('share.restoreCategories')}</Text>
                  <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 14}}>
                    {([['system', t('share.systemNameDesc'), !!restoreData.system, null], ['members', t('share.memberProfiles'), !!restoreData.members, restoreData.members?.length], ['journal', t('share.journalEntries'), !!restoreData.journal, restoreData.journal?.length], ['frontHistory', t('share.frontHistory'), !!restoreData.frontHistory, restoreData.frontHistory?.length]] as any[]).map(([k, label, avail, count]) => (
                      <SectionRow key={k} label={label} sublabel={avail && count !== null ? t('common.records', {count}) : avail ? undefined : t('common.notInExport')} value={restoreSel[k as keyof typeof restoreSel]} onToggle={() => togR(k)} disabled={!avail} />
                    ))}
                  </View>
                  {restoreDone ? <View style={{backgroundColor: T.successBg, borderWidth: 1, borderColor: `${T.success}30`, borderRadius: 8, padding: 12, alignItems: 'center'}}><Text style={{fontSize: 13, color: T.success, fontWeight: '500'}}>{t('share.restoreComplete')}</Text></View>
                    : <TouchableOpacity onPress={handleRestore} activeOpacity={0.7} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.dangerBg, borderColor: `${T.danger}40`}}><Text style={{fontSize: 14, fontWeight: '500', color: T.danger}}>{t('share.restoreSelectedData')}</Text></TouchableOpacity>}
                </>
              )}
              <Divider label={t('share.deleteAccount')} />
              <Text style={[s.para, {color: T.dim}]}>{t('share.deleteAccountDesc')}</Text>
              <TouchableOpacity onPress={handleDeleteAccount} activeOpacity={0.7} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.dangerBg, borderColor: `${T.danger}40`}}>
                <Text style={{fontSize: 14, fontWeight: '500', color: T.danger}}>{t('share.deleteAllData')}</Text>
              </TouchableOpacity>
            </View>
          )}
          {(importSource === 'simplyplural' || importSource === 'pluralkit') && (
            <View>
              <Divider label={importSource === 'simplyplural' ? t('share.spImport') : t('share.pkImport')} />
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
                    <SectionRow label={t('share.systemNameDesc')} value={extSel.system} onToggle={() => togE('system')} />
                    <SectionRow label={t('share.memberProfiles')} sublabel={t('share.membersCount', {count: extPreview.members.length})} value={extSel.members} onToggle={() => togE('members')} />
                    <SectionRow label={t('share.frontHistory')} sublabel={t('share.frontEntries', {count: extPreview.switches.length})} value={extSel.frontHistory} onToggle={() => togE('frontHistory')} />
                  </View>
                  <TouchableOpacity onPress={handleExtImport} activeOpacity={0.7} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
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
            <SectionRow label={t('share.showCurrentFront')} value={shareSettings.showFront} onToggle={() => tog('showFront')} />
            <SectionRow label={t('share.showMemberList')} value={shareSettings.showMembers} onToggle={() => tog('showMembers')} />
            <SectionRow label={t('share.showMemberDescriptions')} value={shareSettings.showDescriptions} onToggle={() => tog('showDescriptions')} />
          </View>
          <Divider label={t('share.preview')} />
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
  heading: {fontFamily: 'Georgia', fontSize: 26, fontWeight: '600', fontStyle: 'italic', marginBottom: 16},
  para: {fontSize: 13, lineHeight: 19, marginBottom: 14},
  hint: {fontSize: 11, marginBottom: 4, lineHeight: 16},
});
