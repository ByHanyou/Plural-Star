import React, {useState} from 'react';
import {View, ScrollView, TouchableOpacity, Alert, StyleSheet, ActivityIndicator} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {exportJSON, exportPluralKit, exportZipBundle, exportEmail, exportAllJournalJSON, exportAllJournalTxt, exportAllJournalMd, ExportCategories, readZipBundle, importZipBundle, base64FromU8} from '../export/exportUtils';
import {store, KEYS, chatMsgKey, listRecoverableBackups, restoreFromBackup, RecoverableEntry} from '../storage';
import {SystemInfo, Member, MemberGroup, FrontState, HistoryEntry, JournalEntry, ShareSettings, AppSettings, ExportPayload, CustomFieldDef, CustomFieldType, CustomFieldValue, ChatChannel, ChatMessage, MemberPoll, uid, allFrontMemberIds, findOpenFrontInHistory} from '../utils';

type Section = 'export' | 'import' | 'shareview';
type ImportSource = 'backup' | 'journal' | 'simplyplural' | 'pluralkit' | 'spfile' | 'ampersand' | 'pluralspace';

import {saveAvatarFromUrl, saveAvatar, saveBannerFromBase64, saveBannerFromUrl, migrateInlineChatMedia} from '../utils/mediaUtils';
import {parallelMap} from '../utils/concurrency';
import {parseAmpar} from '../utils/ampar';
import {fontScale, ThemeColors} from '../theme';
import {ToggleSwitch} from '../components/ToggleSwitch';
import {useAppStore} from '../store/appStore';
import {saveShareSettings} from '../store/actions';
import {normalizeSpAvatarUrl, spAvatarCandidates, downloadFirstAvatar, spGet} from '../import/spApi';
import {convertSPSwitches, convertPKSwitches, normHex, mergeForeignMember, finalizeMemberReplace, mergeHistoryEntries, getStoredMembers, mergeMediaIntoMembers, psTime, convertPluralSpaceFronts} from '../import/convert';
import {handleRestore} from '../import/restore';
import {handleSimplyPluralFetch} from '../import/simplyplural';
import {handlePluralKitFetch} from '../import/pluralkit';
import {handleExtImport} from '../import/extApply';
import {handlePluralSpacePick, handlePluralSpaceConfirm, handlePluralSpaceAvatarsPick} from '../import/pluralspace';
import {handleAmpersandPick, handleAmpersandConfirm} from '../import/ampersand';
import {handleSPFileImport, handleSPFileConfirmImport} from '../import/spFile';

interface Props {
  theme: ThemeColors;
  onDataImported: () => void; onAddJournalEntry: (entry: JournalEntry) => void; onDeleteAccount: () => void;
}

export const ShareScreen = ({theme: T, onDataImported, onAddJournalEntry, onDeleteAccount}: Props) => {
  const system = useAppStore(s => s.system);
  const members = useAppStore(s => s.members);
  const front = useAppStore(s => s.front);
  const history = useAppStore(s => s.history);
  const journal = useAppStore(s => s.journal);
  const shareSettings = useAppStore(s => s.shareSettings);
  const appSettings = useAppStore(s => s.appSettings);
  const onSettingsChange = saveShareSettings;
  const getMember = (id: string) => members.find(m => m.id === id);
  const fs = fontScale(T);
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
  const handleJSONFile = async () => {try {await exportJSON(system, members, history, journal, exportSel);} catch (e) {Alert.alert(t('share.exportFailed'), String(e));}};
  const handlePluralKitExport = async () => {try {await exportPluralKit(system, members, exportSel.frontHistory ? history : []);} catch (e) {Alert.alert(t('share.exportFailed'), String(e));}};
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
    } catch (e: any) {if (!isPickerCancel(e)) {setImportStatus('error'); setImportMsg(e.message || t('share.couldNotImportFile'));}}
  };

  const handlePickBackup = async () => {
    setRestoreError(''); setRestorePreview(false); setRestorePath(null); setRestoreFile(null); setRestoreDone(false); setRestoreIsBundle(false);
    try {
      const [res] = await safePick({type: ['application/json', 'application/zip', 'text/plain']});
      if (!res) return;
      const pickedPath = getPickedFilePath(res);
      const isZip = /\.zip$/i.test(res.name || '') || /\.zip$/i.test(pickedPath) || ((res as any).type || '').toLowerCase().includes('zip');
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
        let zb: {files: Record<string, Uint8Array>; data: any | null; manifest: any | null} | null = null;
        try { zb = await readZipBundle(pickedPath); } catch { try { zb = await readZipBundle(res.uri || pickedPath); } catch {} }
        const zapp = zb?.data?._meta?.app || zb?.manifest?.app;
        if (zb && (zapp === 'Plural Star' || zapp === 'Plural Space')) {
          let safeZipPath = pickedPath;
          try {
            const dest = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/ps_restore_pending.zip`;
            try { await ReactNativeBlobUtil.fs.unlink(dest); } catch {}
            await ReactNativeBlobUtil.fs.cp(pickedPath, dest);
            safeZipPath = dest;
          } catch {}
          setRestorePath(safeZipPath); setRestoreIsBundle(true); setRestoreFile(res.name || 'backup.zip'); setRestorePreview(true);
          return;
        }
        setRestoreError(t('share.invalidJsonBackup'));
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
        setRestoreError(t('share.unrecognizedBackup'));
        return;
      }
      const safeTempPath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/ps_restore_pending.json`;
      await ReactNativeBlobUtil.fs.writeFile(safeTempPath, content, 'utf8');
      setRestorePath(safeTempPath);
      setRestoreFile(res.name || 'backup.json');
      setRestorePreview(true);
    } catch (e: any) {if (!isPickerCancel(e)) setRestoreError(e.message || t('share.couldNotReadFile'));}
  };

  const handlePickZipBackup = () => {
    setRestoreSel({system: true, members: true, avatars: true, banners: true, journal: true, frontHistory: true, groups: true, chat: true, moods: true, palettes: true, settings: true, customFields: true, noteboards: true, polls: true, journalTemplates: true, relationships: true, medical: true});
    handlePickBackup();
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
    <ToggleSwitch value={value} onToggle={onToggle} label={label} T={T} />
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
            ] as [keyof ExportCategories, string][]).map(([k, label]) => (
              <SectionRow key={k} label={label} value={!!exportSel[k]} onToggle={() => togExp(k)} />
            ))}
          </View>

          <View style={{flexDirection: 'row', gap: 8, marginBottom: 6}}>
            {[['↓ ZIP', handleJSON, T.accentBg, T.accent, `${T.accent}40`], ['↓ JSON', handleJSONFile, T.infoBg, T.info, `${T.info}40`]].map(([label, fn, bg, color, border]: any) => (
              <TouchableOpacity key={label} onPress={fn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label} style={{flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: bg, borderColor: border}}>
                <Text style={{fontSize: fs(14), fontWeight: '500', color}}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[s.hint, {color: T.muted}]}>{t('share.jsonHint')}</Text>
          <TouchableOpacity onPress={handlePluralKitExport} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.exportPluralKit')} style={{alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: T.infoBg, borderColor: `${T.info}40`, marginTop: 4}}>
            <Text style={{fontSize: fs(14), fontWeight: '500', color: T.info}}>{t('share.exportPluralKit')}</Text>
          </TouchableOpacity>
          <Text style={[s.hint, {color: T.muted}]}>{t('share.pkExportHint')}</Text>
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
          <TextInput value={emailAddr} onChangeText={setEmailAddr} placeholder={t('share.emailPlaceholder')} placeholderTextColor={T.muted} keyboardType="email-address" autoCapitalize="none"
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
                    ] as any[]).map(([k, label]) => (
                      <SectionRow key={k} label={label} value={restoreSel[k as keyof typeof restoreSel]} onToggle={() => togR(k)} />
                    ))}
                  </View>
                  {restoreDone ? <View style={{backgroundColor: T.successBg, borderWidth: 1, borderColor: `${T.success}30`, borderRadius: 8, padding: 12, alignItems: 'center'}}><Text style={{fontSize: fs(13), color: T.success, fontWeight: '500'}}>{t('share.restoreComplete')}</Text></View>
                    : restoring ? <View style={{alignItems: 'center', paddingVertical: 16}}><ActivityIndicator color={T.accent} /><Text style={{fontSize: fs(12), color: T.dim, marginTop: 8}} numberOfLines={2}>{restoreProgress || t('share.importing')}</Text></View>
                    : <TouchableOpacity onPress={() => handleRestore({restorePath, restorePreview, restoreIsBundle, restoreSel, setRestoring, setRestoreDone, setRestoreProgress, setRestoreError, t, onDataImported, history})} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.restoreSelectedData')} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.dangerBg, borderColor: `${T.danger}40`}}><Text style={{fontSize: fs(14), fontWeight: '500', color: T.danger}}>{t('share.restoreSelectedData')}</Text></TouchableOpacity>}
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
              <TouchableOpacity onPress={importSource === 'simplyplural' ? () => handleSimplyPluralFetch({extToken, t, setExtLoading, setExtPreview}) : () => handlePluralKitFetch({extToken, t, setExtLoading, setExtPreview})} disabled={extLoading} activeOpacity={0.7}
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
                  <TouchableOpacity onPress={() => handleExtImport({extPreview, importSource, extSel, system, members, history, t, setRestoreProgress, setExtPreview, setExtToken, onDataImported})} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.importSelected')} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
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
              <TouchableOpacity onPress={() => handleSPFileImport({extPreview, extSel, system, members, history, t, setExtPreview, setImportSource, onDataImported})} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.pickSPFile')}
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
                  <TouchableOpacity onPress={() => handleSPFileConfirmImport({extPreview, extSel, system, members, history, t, setExtPreview, setImportSource, onDataImported})} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.importSelected')} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
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
              <TouchableOpacity onPress={() => handleAmpersandPick({extPreview, extSel, system, history, t, setRestoreError, setExtPreview, setImportStatus, setImportMsg, setImportSource, onDataImported})} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.pickAmparFile')}
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
                  <TouchableOpacity onPress={() => handleAmpersandConfirm({extPreview, extSel, system, history, t, setRestoreError, setExtPreview, setImportStatus, setImportMsg, setImportSource, onDataImported})} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.importSelected')} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
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
              <TouchableOpacity onPress={() => handlePluralSpacePick({extPreview, extSel, system, history, psZipFiles, psAvatarIndex, t, setRestoreError, setExtPreview, setImportStatus, setImportMsg, setPsAvatarIndex, setPsZipFiles, setRestoreProgress, onDataImported})} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.pickPsFile')}
                style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
                <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>{t('share.pickPsFile')}</Text>
              </TouchableOpacity>
              {importStatus === 'success' && <View style={{backgroundColor: T.successBg, borderWidth: 1, borderColor: `${T.success}30`, borderRadius: 8, padding: 12, marginBottom: 12}}><Text style={{fontSize: fs(13), color: T.success}}>✓ {importMsg}</Text></View>}
              {importStatus === 'error' && <View style={{backgroundColor: T.dangerBg, borderWidth: 1, borderColor: `${T.danger}30`, borderRadius: 7, padding: 10, marginBottom: 12}}><Text style={{fontSize: fs(13), color: T.danger}}>⚠ {importMsg}</Text></View>}
              {restoreProgress ? <View style={{alignItems: 'center', paddingVertical: 12}}><ActivityIndicator color={T.accent} /><Text style={{fontSize: fs(12), color: T.dim, marginTop: 8}} numberOfLines={2}>{restoreProgress}</Text></View> : null}
              {psAvatarIndex && !extPreview && (
                <View style={{marginBottom: 10}}>
                  <Text style={[s.para, {color: T.dim}]}>{t('share.psAvatarsHint')}</Text>
                  <TouchableOpacity onPress={() => handlePluralSpaceAvatarsPick({extPreview, extSel, system, history, psZipFiles, psAvatarIndex, t, setRestoreError, setExtPreview, setImportStatus, setImportMsg, setPsAvatarIndex, setPsZipFiles, setRestoreProgress, onDataImported})} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.psPickAvatars')}
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
                  <TouchableOpacity onPress={() => handlePluralSpaceConfirm({extPreview, extSel, system, history, psZipFiles, psAvatarIndex, t, setRestoreError, setExtPreview, setImportStatus, setImportMsg, setPsAvatarIndex, setPsZipFiles, setRestoreProgress, onDataImported})} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.importSelected')} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginBottom: 10}}>
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
