import React, {useEffect, useState} from 'react';
import {View, TouchableOpacity, Alert, ActivityIndicator} from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {useTranslation} from 'react-i18next';
import {Text, TextInput} from '../../components/AppText';
import {ImportWaitOverlay} from '../../components/ImportWaitOverlay';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {useAppStore} from '../../store/appStore';
import {addJournalEntry} from '../../store/actions';
import {reloadAll} from '../../app/startup/loadAll';
import {safePick, isPickerCancel, getPickedFilePath} from '../../utils/safePicker';
import {asRecord, uid} from '../../utils';
import {sectionLabel} from '../../components/controls';
import type {ImportMode} from '../../import/convert';
import type {ExtPreview, ImportSource, ImportStatus} from '../../import/preview';
import {importErrorText} from '../../import/importError';
import {handlePluralKitFetch} from '../../import/pluralkit';
import {handleExtImport} from '../../import/extApply';
import {handlePluralSpacePick, handlePluralSpaceConfirm, handlePluralSpaceAvatarsPick} from '../../import/pluralspace';
import {handleAmpersandPick, handleAmpersandConfirm} from '../../import/ampersand';
import {handleTupperboxPick, handleTupperboxConfirm} from '../../import/tupperbox';
import {handlePluralLogPick, handlePluralLogConfirm} from '../../import/plurallog';
import {handleParallaxPick, handleParallaxConfirm} from '../../import/parallax';
import {handleSPFileImport} from '../../import/spFile';
import {Busy, CategoryCard, ChoiceBtn, Divider, HIDDEN, Para, PreviewHead, SectionRow, StatusBox, WideBtn, categoryLabels} from './ShareParts';
import {BackupSection} from './BackupSection';
import {useImportProgress} from './useImportProgress';

const ALL_EXT_SEL = {system: true, members: true, avatars: true, banners: true, frontHistory: true, customFields: true, groups: true, journal: true, chat: true, polls: true, mailbox: true, displayNames: true, pronouns: true};
type ExtSel = typeof ALL_EXT_SEL;
type ExtRow = {key: keyof ExtSel; label: string; sub?: string};

const SOURCES: {id: ImportSource; key: string}[] = [
  {id: 'journal', key: 'share.journalFile'},
  {id: 'backup', key: 'share.backup'},
  {id: 'pluralkit', key: 'share.pluralKit'},
  {id: 'spfile', key: 'share.spFile'},
  {id: 'ampersand', key: 'share.ampersand'},
  {id: 'tupperbox', key: 'share.tupperbox'},
  {id: 'pluralspace', key: 'share.pluralSpace'},
  {id: 'plurallog', key: 'share.pluralLog'},
  {id: 'parallax', key: 'share.parallax'},
];
const MODES: {mode: ImportMode; key: string; hint: string}[] = [
  {mode: 'overwrite', key: 'share.importModeOverwrite', hint: 'share.importModeOverwriteHint'},
  {mode: 'update', key: 'share.importModeUpdate', hint: 'share.importModeUpdateHint'},
];
const NATIVE_APPS = ['Plural Space', 'Plural Star'];
const TEXT_EXTS = ['txt', 'md', 'markdown'];

export const ImportSection = () => {
  const T = useTheme();
  const system = useAppStore(s => s.system);
  const members = useAppStore(s => s.members);
  const history = useAppStore(s => s.history);
  const filesEnabled = useAppStore(s => s.appSettings.filesEnabled);
  const singlet = useAppStore(s => s.appSettings.accountMode === 'singlet');
  const {t} = useTranslation();
  const fs = fontScale(T);
  const labels = categoryLabels(t, singlet);
  const progress = useImportProgress();
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [importMsg, setImportMsg] = useState('');
  const [importSource, setImportSource] = useState<ImportSource>('backup');
  const [importMode, setImportMode] = useState<ImportMode>('overwrite');
  const [restoreError, setRestoreError] = useState('');
  const [extToken, setExtToken] = useState('');
  const [extLoading, setExtLoading] = useState(false);
  const [extPreview, setExtPreview] = useState<ExtPreview | null>(null);
  const [extSel, setExtSel] = useState<ExtSel>(ALL_EXT_SEL);
  const [psAvatarIndex, setPsAvatarIndex] = useState<Map<string, string> | null>(null);
  const [psZipFiles, setPsZipFiles] = useState<Record<string, Uint8Array> | null>(null);
  const {reset: resetProgress} = progress;

  useEffect(() => {
    if (importStatus !== 'idle') resetProgress();
  }, [importStatus, resetProgress]);

  const ctx = {
    extPreview, extSel, importMode, system, members, history, extToken, psZipFiles, psAvatarIndex, t,
    setRestoreError, setExtPreview, setExtToken, setExtLoading, setImportStatus, setImportMsg, setImportSource, setPsAvatarIndex, setPsZipFiles,
    setRestoreProgress: progress.setRestoreProgress, onDataImported: reloadAll,
  };

  const selectSource = (id: ImportSource) => {
    setImportSource(id);
    setExtPreview(null);
    setExtToken('');
    setImportStatus('idle');
    setImportMsg('');
  };

  const confirmOverwrite = (title: string, run: () => void) => {
    if (importMode !== 'overwrite') { run(); return; }
    Alert.alert(title, t('share.importModeOverwriteHint'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.confirm'), style: 'destructive', onPress: run},
    ]);
  };

  const fail = (msg: string) => {
    setImportStatus('error');
    setImportMsg(msg);
  };

  const importJournalFile = async () => {
    setImportStatus('idle');
    setImportMsg('');
    try {
      const [res] = await safePick({type: ['text/plain', 'text/markdown', 'application/json']});
      if (!res) return;
      const ext = (res.name || '').split('.').pop()?.toLowerCase() || '';
      const title = (res.name || 'Imported Entry').replace(/\.[^.]+$/, '');
      if (!TEXT_EXTS.includes(ext) && ext !== 'json') { fail(t('share.unsupportedFormat', {ext})); return; }
      const raw = await ReactNativeBlobUtil.fs.readFile(getPickedFilePath(res), 'utf8');
      let body = raw;
      if (ext === 'json') {
        try {
          const parsed: unknown = JSON.parse(raw);
          const app = asRecord(asRecord(parsed)?._meta)?.app;
          if (typeof app === 'string' && NATIVE_APPS.includes(app)) { fail(t('share.backupLooksLike')); return; }
          body = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
        } catch {}
      }
      await addJournalEntry({id: uid(), title, body, authorIds: [], hashtags: [], timestamp: Date.now()});
      setImportStatus('success');
      setImportMsg(t('share.importedAsEntry', {title}));
    } catch (e) {
      if (!isPickerCancel(e)) fail(importErrorText(e, t));
    }
  };

  const row = (key: keyof ExtSel, label: string, sub?: string): ExtRow => ({key, label, sub});
  const when = (cond: boolean, r: ExtRow): ExtRow[] => (cond ? [r] : []);
  const membersRow = (n: number) => row('members', labels.members, t('share.membersCount', {count: n}));
  const frontRow = (n: number) => row('frontHistory', labels.front, t('share.frontEntries', {count: n}));
  const groupsRows = (n: number) => when(n > 0, row('groups', t('share.groups'), t('share.groupsCount', {count: n})));
  const countsLine = (memberCount: number, frontCount: number) => `${t('share.membersCount', {count: memberCount})} · ${t('share.frontEntries', {count: frontCount})}`;
  const systemRow = row('system', labels.system);
  const avatarsRow = row('avatars', t('share.profilePictures'));
  const fieldsRow = row('customFields', t('customFields.title'));
  const journalRow = row('journal', t('share.journalEntries'));
  const chatRow = row('chat', t('share.chatData'));

  const extView = (p: ExtPreview): {title: string; sub: string; rows: ExtRow[]; run: () => void} => {
    switch (p.source) {
      case 'pluralkit': return {
        title: p.system.name || t('share.system'), sub: countsLine(p.members.length, p.switches.length),
        rows: [systemRow, membersRow(p.members.length), row('displayNames', t('share.usePkDisplayNames'), t('share.usePkDisplayNamesHint')), row('pronouns', t('share.importPronouns'), t('share.importPronounsHint')),
          avatarsRow, row('banners', t('share.banners')), frontRow(p.switches.length), ...groupsRows(p.groups.length)],
        run: () => handleExtImport(ctx),
      };
      case 'spfile': return {
        title: p.system.content?.username || p.system.username || t('share.system'), sub: countsLine(p.members.length, p.switches.length),
        rows: [systemRow, membersRow(p.members.length), avatarsRow, frontRow(p.switches.length), ...groupsRows(p.groups.length)],
        run: () => handleExtImport(ctx),
      };
      case 'ampersand': return {
        title: p.system.name || t('share.system'), sub: countsLine(p.members.length, p.switches.length),
        rows: [systemRow, membersRow(p.members.length), fieldsRow, frontRow(p.switches.length)],
        run: () => handleAmpersandConfirm(ctx),
      };
      case 'tupperbox': return {
        title: 'Tupperbox', sub: `${t('share.membersCount', {count: p.tuppers.length})}${p.groups.length > 0 ? ` · ${t('share.groupsCount', {count: p.groups.length})}` : ''}`,
        rows: [membersRow(p.tuppers.length), ...groupsRows(p.groups.length)],
        run: () => handleTupperboxConfirm(ctx),
      };
      case 'pluralspace': return {
        title: p.system.name || t('share.system'), sub: countsLine(p.members.length, p.switches.length),
        rows: [systemRow, membersRow(p.members.length), avatarsRow, fieldsRow, frontRow(p.switches.length), ...groupsRows(p.groups.length),
          ...when(p.journal.length > 0, journalRow), ...when(p.chat.length > 0, chatRow), ...when(p.polls.length > 0, row('polls', t('polls.title')))],
        run: () => handlePluralSpaceConfirm(ctx),
      };
      case 'plurallog': {
        const db = p.db;
        const memberCount = (db.members || []).length;
        const switchCount = (db.switchEvents || []).length;
        return {
          title: String(db.config?.systemName || 'PluralLog'), sub: countsLine(memberCount, switchCount),
          rows: [systemRow, membersRow(memberCount), avatarsRow, frontRow(switchCount), ...groupsRows((db.folders || []).length),
            ...when((db.journal || []).length > 0, journalRow), ...when((db.messages || []).length > 0, chatRow), ...when((db.frontMessages || []).length > 0, row('mailbox', t('mailbox.title')))],
          run: () => handlePluralLogConfirm(ctx),
        };
      }
      case 'parallax': {
        const memberCount = (p.db.members || []).length;
        const frontCount = (p.db.fronting_log || []).length;
        return {
          title: 'Parallax', sub: countsLine(memberCount, frontCount),
          rows: [membersRow(memberCount), frontRow(frontCount), ...when((p.db.messages || []).length > 0, chatRow)],
          run: () => handleParallaxConfirm(ctx),
        };
      }
    }
  };

  const extCard = (p: ExtPreview) => {
    const v = extView(p);
    return (
      <View>
        <PreviewHead title={v.title} sub={v.sub} />
        <CategoryCard title={t('share.importCategories')}>
          {v.rows.map(r => <SectionRow key={r.key} label={r.label} sublabel={r.sub} value={extSel[r.key]} onToggle={() => setExtSel(s => ({...s, [r.key]: !s[r.key]}))} />)}
        </CategoryCard>
        <WideBtn style={{marginBottom: 10}} label={t('share.importSelected')} onPress={() => confirmOverwrite(t('share.importSelected'), v.run)} />
      </View>
    );
  };

  const pickSources: Partial<Record<ImportSource, {title: string; hint: string; pick: string; status: boolean; busy: boolean; onPick: () => void}>> = {
    spfile: {title: 'share.spFileImport', hint: 'share.spFileHint', pick: 'share.pickSPFile', status: false, busy: false, onPick: () => handleSPFileImport(ctx)},
    ampersand: {title: 'share.ampersandImport', hint: 'share.ampersandHint', pick: 'share.pickAmparFile', status: true, busy: false, onPick: () => handleAmpersandPick(ctx)},
    tupperbox: {title: 'share.tupperboxImport', hint: 'share.tupperboxHint', pick: 'share.pickTbFile', status: true, busy: false, onPick: () => handleTupperboxPick(ctx)},
    pluralspace: {title: 'share.psImport', hint: 'share.psHint', pick: 'share.pickPsFile', status: true, busy: true, onPick: () => handlePluralSpacePick(ctx)},
    plurallog: {title: 'share.pluralLog', hint: 'share.plurallogHint', pick: 'share.plurallogPick', status: true, busy: true, onPick: () => handlePluralLogPick(ctx)},
    parallax: {title: 'share.parallax', hint: 'share.parallaxHint', pick: 'share.parallaxPick', status: true, busy: true, onPick: () => handleParallaxPick(ctx)},
  };
  const pickSource = pickSources[importSource];
  const statusBox = importStatus !== 'idle' ? <StatusBox kind={importStatus} text={importMsg} /> : null;
  const preview = extPreview && extPreview.source === importSource ? extCard(extPreview) : null;

  if (!filesEnabled) {
    return (
      <View style={{alignItems: 'center', paddingVertical: 48}}>
        <Text style={{fontSize: fs(36), opacity: 0.4, marginBottom: 12}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">↑</Text>
        <Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center'}}>{t('share.filesDisabled')}</Text>
      </View>
    );
  }

  return (
    <View>
      <ImportWaitOverlay
        visible={progress.restoring || !!progress.controlRef.current}
        progress={progress.progress}
        onCancel={progress.controlRef.current ? () => progress.controlRef.current?.requestStop() : undefined}
      />
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, marginBottom: 4}}>
        {SOURCES.map(s => (
          <ChoiceBtn key={s.id} label={t(s.key)} selected={importSource === s.id} onPress={() => selectSource(s.id)}
            hitSlop={{top: 6, bottom: 8}} style={{paddingVertical: 7, paddingHorizontal: 12}} />
        ))}
      </View>
      <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 10, marginBottom: 10}}>
        <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 6})}>{t('share.importMode')}</Text>
        <View style={{flexDirection: 'row', gap: 6}}>
          {MODES.map(({mode, key}) => (
            <TouchableOpacity key={mode} onPress={() => setImportMode(mode)} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{selected: importMode === mode}} accessibilityLabel={t(key)}
              hitSlop={{top: 6, bottom: 6}} style={{flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: importMode === mode ? T.accentBg : 'transparent', borderColor: importMode === mode ? `${T.accent}60` : T.border}}>
              <Text style={{fontSize: fs(13), fontWeight: '500', color: importMode === mode ? T.accent : T.dim}}>{t(key)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={{fontSize: fs(11), color: T.muted, marginTop: 6}}>{t(MODES.find(m => m.mode === importMode)?.hint || '')}</Text>
      </View>

      {importSource === 'journal' && (
        <View>
          <Divider label={t('share.importJournalEntry')} />
          <Para text={t('share.importJournalDesc')} />
          <WideBtn style={{marginBottom: 10}} onPress={importJournalFile} label={t('share.pickFile')} />
          {statusBox}
        </View>
      )}

      <View style={importSource === 'backup' ? undefined : HIDDEN}>
        <BackupSection importMode={importMode} confirmOverwrite={confirmOverwrite} progress={progress} restoreError={restoreError} setRestoreError={setRestoreError} />
      </View>

      {importSource === 'pluralkit' && (
        <View>
          <Divider label={t('share.pkImport')} />
          <Para text={t('share.pkTokenHint')} />
          <TextInput value={extToken} onChangeText={setExtToken} accessibilityLabel={t('share.pkTokenPlaceholder')} placeholder={t('share.pkTokenPlaceholder')} placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false}
            style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(14), marginBottom: 10, fontFamily: 'monospace'}} />
          <WideBtn style={{marginBottom: 10}} onPress={() => handlePluralKitFetch(ctx)} disabled={extLoading} a11y={t('share.fetchData')} label={extLoading ? t('share.fetching') : t('share.fetchData')} />
          {extLoading && <ActivityIndicator color={T.accent} style={{marginTop: 12}} />}
          {preview}
        </View>
      )}

      {pickSource && (
        <View>
          <Divider label={t(pickSource.title)} />
          <Para text={t(pickSource.hint)} />
          <WideBtn style={{marginBottom: 10}} onPress={pickSource.onPick} label={t(pickSource.pick)} />
          {pickSource.status && statusBox}
          {pickSource.busy && progress.progressText ? <Busy text={progress.progressText} /> : null}
          {importSource === 'pluralspace' && psAvatarIndex && !extPreview && (
            <View style={{marginBottom: 10}}>
              <Para text={t('share.psAvatarsHint')} />
              <WideBtn variant="info" onPress={() => handlePluralSpaceAvatarsPick(ctx)} label={t('share.psPickAvatars')} />
            </View>
          )}
          {preview}
        </View>
      )}

    </View>
  );
};
