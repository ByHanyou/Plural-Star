import React, {useRef, useState} from 'react';
import {View, Alert, ActivityIndicator, Modal} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text, TextInput} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {useAppStore} from '../../store/appStore';
import {errorMessage} from '../../utils/log';
import {exportJSON, exportPluralKit, exportEmail} from '../../export/exportUtils';
import {exportZipBundle} from '../../export/zipBundle';
import {exportJournal, JournalExportFormat} from '../../export/journalExport';
import {ALL_EXPORT_CATEGORIES, ExportCategories} from '../../export/categories';
import {CategoryCard, Divider, FormatButtons, Hint, Para, SectionRow, WideBtn, sharedCategoryRows} from './ShareParts';

const JOURNAL_FORMATS: {format: JournalExportFormat; variant: 'accent' | 'info' | 'plain'}[] = [
  {format: 'txt', variant: 'accent'},
  {format: 'md', variant: 'info'},
  {format: 'json', variant: 'plain'},
];

export const ExportSection = () => {
  const T = useTheme();
  const system = useAppStore(s => s.system);
  const members = useAppStore(s => s.members);
  const history = useAppStore(s => s.history);
  const journal = useAppStore(s => s.journal);
  const singlet = useAppStore(s => s.appSettings.accountMode === 'singlet');
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [emailAddr, setEmailAddr] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportSel, setExportSel] = useState<ExportCategories>(ALL_EXPORT_CATEGORIES);
  const exportingRef = useRef(false);

  const exportRows: [keyof ExportCategories, string][] = [...sharedCategoryRows(t, singlet), ['whiteboard', t('whiteboard.title')], ['planner', t('planner.title')]];
  const toggle = (k: keyof ExportCategories) => setExportSel(s => ({...s, [k]: !s[k]}));

  const runExport = async (fn: () => Promise<void>) => {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert(t('share.exportFailed'), errorMessage(e));
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  };
  const handleEmail = () => {
    if (!emailAddr.trim() || !emailAddr.includes('@')) { Alert.alert(t('share.invalidEmail'), t('share.invalidEmailMsg')); return; }
    runExport(() => exportEmail(system, members, history, journal, emailAddr));
  };

  return (
    <View>
      <Modal visible={exporting} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: `${T.bg}E6`}}>
          <View accessibilityViewIsModal accessibilityLiveRegion="polite" style={{width: '100%', maxWidth: 420, borderRadius: 16, borderWidth: 1, padding: 22, alignItems: 'center', backgroundColor: T.card, borderColor: T.border}}>
            <ActivityIndicator color={T.accent} size="large" />
            <Text accessibilityRole="header" style={{fontSize: fs(16), fontWeight: '600', color: T.text, marginTop: 12}}>{t('share.exporting')}</Text>
          </View>
        </View>
      </Modal>

      <Divider label={t('share.fullSystemExport')} />
      <Para text={t('share.downloadsDirectly')} />

      <CategoryCard title={t('share.exportCategories')} top={4}>
        {exportRows.map(([k, label]) => (
          <SectionRow key={k} label={label} value={!!exportSel[k]} onToggle={() => toggle(k)} />
        ))}
      </CategoryCard>

      <FormatButtons fontSize={14} options={[
        {label: '↓ ZIP', a11y: t('share.exportAs', {format: 'ZIP'}), variant: 'accent', onPress: () => runExport(() => exportZipBundle(system, members, history, journal, exportSel))},
        {label: '↓ JSON', a11y: t('share.exportAs', {format: 'JSON'}), variant: 'info', onPress: () => runExport(() => exportJSON(system, members, history, journal, exportSel))},
      ]} />
      <Hint text={t('share.jsonHint')} />
      <WideBtn variant="info" style={{marginTop: 4}} onPress={() => runExport(() => exportPluralKit(system, members, exportSel.frontHistory ? history : []))} label={t('share.exportPluralKit')} />
      <Hint text={t('share.pkExportHint')} />
      <Divider label={t('share.journalExport')} />
      <Para text={t('share.exportJournalOnly')} />
      <FormatButtons fontSize={13} options={JOURNAL_FORMATS.map(({format, variant}) => ({
        label: `↓ .${format}`, a11y: t('share.exportAs', {format: `.${format}`}), variant,
        onPress: () => runExport(() => exportJournal(journal, members, system.name, format)),
      }))} />
      <Hint text={t('share.perEntryHint')} />
      <Divider label={t('share.sendEmail')} />
      <TextInput value={emailAddr} onChangeText={setEmailAddr} accessibilityLabel={t('share.sendEmail')} placeholder={t('share.emailPlaceholder')} placeholderTextColor={T.muted} keyboardType="email-address" autoCapitalize="none"
        style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(14), marginBottom: 10}} />
      <WideBtn onPress={handleEmail} label={t('share.openInMail')} />
    </View>
  );
};
