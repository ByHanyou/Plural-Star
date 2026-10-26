import React, {useState} from 'react';
import {View, TouchableOpacity, Alert, ActivityIndicator} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {CheckBox} from '../../components/controls';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {KEYS, listRecoverableBackups, restoreFromBackup, RecoverableEntry} from '../../storage';
import {fmtNum, fmtTime} from '../../utils';
import {errorMessage} from '../../utils/log';
import {reloadAll} from '../../app/startup/loadAll';
import {DoneNote, categoryLabels} from './ShareParts';

const KB = 1024;
const MB = 1024 * 1024;
const RELOAD_DELAY_MS = 600;

export const RecoverySection = ({singlet}: {singlet: boolean}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const labels = categoryLabels(t, singlet);
  const [entries, setEntries] = useState<RecoverableEntry[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState(false);
  const noneSelected = Object.values(sel).every(v => !v);

  const keyName = (key: string): string => {
    switch (key) {
      case KEYS.system: return labels.system;
      case KEYS.members: return labels.members;
      case KEYS.front: return singlet ? t('tabs.status') : t('hub.front');
      case KEYS.history: return labels.front;
      case KEYS.journal: return t('share.journalEntries');
      case KEYS.groups: return t('share.memberGroups');
      case KEYS.chatChannels: return t('share.chatData');
      case KEYS.chatCategories: return t('share.chatData');
      default: return key.replace(/^ps:/, '');
    }
  };

  const sizeLabel = (bytes: number) => bytes > MB ? t('share.sizeMB', {n: fmtNum(bytes / MB, 1, 1)})
    : bytes > KB ? t('share.sizeKB', {n: fmtNum(bytes / KB, 0)})
    : t('share.sizeB', {n: fmtNum(bytes, 0)});

  const previewLabel = (entry: RecoverableEntry) => entry.items !== undefined ? t('share.recoverItems', {count: entry.items})
    : entry.fields !== undefined ? t('share.recoverFields', {count: entry.fields})
    : entry.name !== undefined ? t('share.quoted', {text: entry.name})
    : (entry.text || '');

  const reset = () => {
    setEntries(null);
    setSel({});
    setDone(false);
  };

  const scan = async () => {
    setScanning(true);
    setDone(false);
    try {
      const found = await listRecoverableBackups();
      setEntries(found);
      setSel(Object.fromEntries(found.map((e): [string, boolean] => [e.key, true])));
    } catch (e) {
      Alert.alert(t('share.recoverScanFailed'), errorMessage(e));
      setEntries([]);
    } finally {
      setScanning(false);
    }
  };

  const apply = () => {
    const toRestore = (entries || []).filter(e => sel[e.key]);
    if (toRestore.length === 0) return;
    Alert.alert(t('share.recoverConfirmTitle'), t('share.recoverConfirmMsg', {count: toRestore.length}), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('share.recoverConfirm'), style: 'destructive', onPress: async () => {
        let okCount = 0;
        for (const entry of toRestore) {
          if (await restoreFromBackup(entry.key)) okCount++;
        }
        if (okCount < toRestore.length) Alert.alert(t('share.importFailed'), t('share.recoverPartial', {ok: okCount, total: toRestore.length}));
        if (okCount === 0) return;
        setDone(true);
        setTimeout(reloadAll, RELOAD_DELAY_MS);
      }},
    ]);
  };

  if (!entries) {
    return (
      <TouchableOpacity onPress={scan} disabled={scanning} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('share.scanForBackups')} accessibilityState={{disabled: scanning}} hitSlop={{top: 6, bottom: 6}} style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border, marginBottom: 14, opacity: scanning ? 0.5 : 1}}>
        {scanning ? <ActivityIndicator color={T.accent} size="small" /> : <Text style={{fontSize: fs(14), fontWeight: '500', color: T.text}}>{t('share.scanForBackups')}</Text>}
      </TouchableOpacity>
    );
  }

  if (entries.length === 0) {
    return (
      <View style={{padding: 14, borderRadius: 8, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, marginBottom: 14}}>
        <Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center'}}>{t('share.noBackupsFound')}</Text>
        <TouchableOpacity onPress={() => { setEntries(null); setDone(false); }} activeOpacity={0.7} accessibilityRole="button" hitSlop={{top: 15, bottom: 15}} style={{alignSelf: 'center', marginTop: 8}}>
          <Text style={{fontSize: fs(12), color: T.accent}}>{t('share.scanAgain')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 14}}>
        {entries.map(entry => {
          const checked = !!sel[entry.key];
          const name = keyName(entry.key);
          const dateLabel = entry.mtime ? fmtTime(entry.mtime) : '';
          return (
            <TouchableOpacity key={entry.key} onPress={() => setSel(s => ({...s, [entry.key]: !s[entry.key]}))} activeOpacity={0.7}
              accessibilityRole="checkbox" accessibilityState={{checked}} accessibilityLabel={name}
              style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: T.border, gap: 12}}>
              <CheckBox on={checked} tickColor="#fff" />
              <View style={{flex: 1}}>
                <Text style={{fontSize: fs(14), color: T.text, fontWeight: '500'}}>{name}</Text>
                <Text style={{fontSize: fs(11), color: T.muted, marginTop: 2}}>{previewLabel(entry)} · {sizeLabel(entry.sizeBytes)}{dateLabel ? ` · ${dateLabel}` : ''}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      {done ? (
        <DoneNote text={t('share.recoverComplete')} style={{marginBottom: 14}} />
      ) : (
        <View style={{flexDirection: 'row', gap: 8, marginBottom: 14}}>
          <TouchableOpacity onPress={reset} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')} hitSlop={{top: 6, bottom: 6}} style={{flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
            <Text style={{fontSize: fs(13), fontWeight: '500', color: T.dim}}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={apply} activeOpacity={0.7} disabled={noneSelected} accessibilityRole="button" accessibilityLabel={t('share.recoverSelected')} accessibilityState={{disabled: noneSelected}} hitSlop={{top: 6, bottom: 6}} style={{flex: 2, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, opacity: noneSelected ? 0.4 : 1}}>
            <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>{t('share.recoverSelected')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
};
