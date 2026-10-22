import React, {useState} from 'react';
import {View, TouchableOpacity} from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {useAppStore} from '../../store/appStore';
import {safePick, isPickerCancel, getPickedFilePath} from '../../utils/safePicker';
import {readFileText} from '../../utils/fileBytes';
import {log} from '../../utils/log';
import {readZipBundle, zipTextOf, isPluralStarBundleData} from '../../import/zipBundle';
import {reloadAll, resetApp} from '../../app/startup/loadAll';
import type {ImportMode} from '../../import/convert';
import {isPluralSpaceExport} from '../../import/convert';
import {importErrorText} from '../../import/importError';
import {ImportControl} from '../../import/progress';
import {handleRestore} from '../../import/restore';
import {findOurcanaJsonEntry, looksLikeOurcana, looksLikeMultiplicity, looksLikeSP, looksLikeOctocon, isNativeBackup} from '../../import/detect';
import {confirmSteps} from '../../utils/confirmSteps';
import {Busy, CategoryCard, Divider, DoneNote, Para, SectionRow, StatusBox, WideBtn, sharedCategoryRows} from './ShareParts';
import {RecoverySection} from './RecoverySection';
import type {ImportProgressState} from './useImportProgress';

const ALL_RESTORE_SEL = {system: true, members: true, avatars: true, banners: true, journal: true, frontHistory: true, groups: true, chat: true, moods: true, palettes: true, settings: true, customFields: true, noteboards: true, polls: true, journalTemplates: true, relationships: true, medical: true, planner: true, whiteboard: true};
type RestoreSel = typeof ALL_RESTORE_SEL;
const MIN_RESTORE_PHASES = 3;

const pendingPath = (ext: string) => `${ReactNativeBlobUtil.fs.dirs.CacheDir}/ps_restore_pending.${ext}`;

const stagePending = async (src: string, ext: string, fallback?: string): Promise<string> => {
  try {
    const dest = pendingPath(ext);
    try { await ReactNativeBlobUtil.fs.unlink(dest); } catch {}
    try { await ReactNativeBlobUtil.fs.cp(src, dest); } catch (e) { if (!fallback) throw e; await ReactNativeBlobUtil.fs.cp(fallback, dest); }
    return dest;
  } catch (e) {
    log.debug('import', e);
    return src;
  }
};

const isRecognizedBackup = (parsed: unknown): boolean =>
  isNativeBackup(parsed) || looksLikeSP(parsed) || looksLikeOctocon(parsed) || looksLikeOurcana(parsed) || looksLikeMultiplicity(parsed);

export const BackupSection = ({importMode, confirmOverwrite, progress, restoreError, setRestoreError}: {
  importMode: ImportMode; confirmOverwrite: (title: string, run: () => void) => void; progress: ImportProgressState;
  restoreError: string; setRestoreError: (msg: string) => void;
}) => {
  const T = useTheme();
  const history = useAppStore(s => s.history);
  const singlet = useAppStore(s => s.appSettings.accountMode === 'singlet');
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [restoreFile, setRestoreFile] = useState<string | null>(null);
  const [restorePath, setRestorePath] = useState<string | null>(null);
  const [restoreIsBundle, setRestoreIsBundle] = useState(false);
  const [restorePreview, setRestorePreview] = useState(false);
  const [restoreSel, setRestoreSel] = useState<RestoreSel>(ALL_RESTORE_SEL);
  const [restoreDone, setRestoreDone] = useState(false);

  const restoreRows: [keyof RestoreSel, string][] = [...sharedCategoryRows(t, singlet), ['planner', t('planner.title')], ['whiteboard', t('whiteboard.title')]];

  const showPicked = (path: string, name: string, bundle: boolean) => {
    setRestorePath(path);
    setRestoreIsBundle(bundle);
    setRestoreFile(name);
    setRestorePreview(true);
  };

  const pickBackup = async () => {
    setRestoreError(''); setRestorePreview(false); setRestorePath(null); setRestoreFile(null); setRestoreDone(false); setRestoreIsBundle(false);
    try {
      const [res] = await safePick({type: ['application/json', 'application/zip', 'text/plain']});
      if (!res) return;
      const pickedPath = getPickedFilePath(res);
      const showBundle = async () => showPicked(await stagePending(pickedPath, 'zip'), res.name || 'backup.zip', true);
      const isZip = /\.zip$/i.test(res.name || '') || /\.zip$/i.test(pickedPath) || (res.type || '').toLowerCase().includes('zip');
      if (isZip) {
        const bundle = await readZipBundle(pickedPath, res.uri);
        if (!isPluralStarBundleData(bundle.data, bundle.manifest)) {
          setRestoreError(t('share.bundleNotRecognized'));
          return;
        }
        await showBundle();
        return;
      }
      let content = '';
      try { content = await readFileText(pickedPath, res.uri); } catch (e) { log.debug('import', e); }
      let pickedZip = false;
      let parsed: unknown;
      try { parsed = JSON.parse(content); } catch {
        let zb: Awaited<ReturnType<typeof readZipBundle>> | null = null;
        try { zb = await readZipBundle(pickedPath, res.uri); } catch {}
        if (zb && isPluralStarBundleData(zb.data, zb.manifest)) {
          await showBundle();
          return;
        }
        const inner = zb ? findOurcanaJsonEntry(zb.files) : undefined;
        if (zb && inner) {
          try { parsed = JSON.parse(zipTextOf(zb.files[inner])); } catch {}
          if (parsed) pickedZip = true;
        }
        if (!parsed) {
          setRestoreError(t(content ? 'share.invalidJsonBackup' : 'share.couldNotReadFile'));
          return;
        }
      }
      if (isPluralSpaceExport(parsed)) { setRestoreError(t('share.psUseTab')); return; }
      if (!isRecognizedBackup(parsed)) {
        setRestoreError(t('share.unrecognizedBackup'));
        return;
      }
      if (pickedZip) {
        showPicked(await stagePending(pickedPath, 'our', res.uri || pickedPath), res.name || 'backup.json', false);
      } else {
        const safeTempPath = pendingPath('json');
        await ReactNativeBlobUtil.fs.writeFile(safeTempPath, content, 'utf8');
        showPicked(safeTempPath, res.name || 'backup.json', false);
      }
    } catch (e) {
      if (!isPickerCancel(e)) setRestoreError(importErrorText(e, t));
    }
  };

  const runRestore = () => confirmOverwrite(t('share.restoreSelectedData'), () => {
    const control = new ImportControl(progress.setRestoreProgress);
    const phases = Math.max(MIN_RESTORE_PHASES, Object.values(restoreSel).filter(Boolean).length);
    control.plan(phases);
    handleRestore({
      restorePath, restorePreview, restoreIsBundle, restoreSel, importMode, setRestoring: progress.arm(control, phases), setRestoreDone,
      setRestoreProgress: progress.setRestoreProgress, setRestoreError, t, onDataImported: reloadAll, history, control,
    });
  });

  const deleteAccount = () => confirmSteps([
    {title: t('share.deleteAllDataTitle'), message: t('share.deleteAllDataMsg'), action: t('share.deleteEverything')},
    {title: t('share.areYouAbsolutelySure'), message: t('share.allDataGone'), action: t('share.yesDeleteEverything')},
  ], resetApp);

  const pickBtn = (label: string, glyph: string, onPress: () => void, primary: boolean) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label}
      style={{flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 8,
        borderWidth: primary ? 1.5 : 1, backgroundColor: primary ? T.accentBg : T.infoBg, borderColor: primary ? `${T.accent}80` : `${T.info}40`}}>
      <Text style={{fontSize: fs(16)}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{glyph}</Text>
      <Text style={{fontSize: fs(14), fontWeight: primary ? '700' : '600', color: primary ? T.accent : T.info}}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View>
      <Divider label={t('share.restoreBackup')} />
      <Para text={t('share.restoreBackupDesc')} />
      <Para text={t('share.importFormatsNote')} color={T.muted} style={{fontSize: fs(11)}} />
      <View style={{flexDirection: 'row', gap: 10, marginBottom: 8}}>
        {pickBtn(t('share.importZipBtn'), '📦', () => { setRestoreSel(ALL_RESTORE_SEL); pickBackup(); }, true)}
        {pickBtn(t('share.importJsonBtn'), '{ }', pickBackup, false)}
      </View>
      <Para text={t('share.importZipHint')} color={T.muted} style={{fontSize: fs(11), marginBottom: 12}} />
      {restoreFile ? (
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: T.success, backgroundColor: T.successBg, marginBottom: 12}}>
          <Text style={{fontSize: fs(14), color: T.success}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</Text>
          <Text style={{fontSize: fs(13), color: T.success, flex: 1}} numberOfLines={1}>{restoreFile}</Text>
        </View>
      ) : null}
      {restoreError ? <StatusBox kind="error" text={restoreError} /> : null}
      {restorePreview && (
        <>
          <CategoryCard title={t('share.restoreCategories')}>
            {restoreRows.map(([k, label]) => (
              <SectionRow key={k} label={label} value={restoreSel[k]} onToggle={() => setRestoreSel(s => ({...s, [k]: !s[k]}))} />
            ))}
          </CategoryCard>
          {restoreDone ? <DoneNote text={t('share.restoreComplete')} />
            : progress.restoring ? <Busy pad={16} text={progress.progressText || t('share.importing')} />
            : <WideBtn variant="danger" label={t('share.restoreSelectedData')} onPress={runRestore} />}
        </>
      )}
      <Divider label={t('share.recoverData')} />
      <Para text={t('share.recoverDataDesc')} />
      <RecoverySection singlet={singlet} />
      <Divider label={t('share.deleteAccount')} />
      <Para text={t('share.deleteAccountDesc')} />
      <WideBtn variant="danger" onPress={deleteAccount} label={t('share.deleteAllData')} />
    </View>
  );
};
