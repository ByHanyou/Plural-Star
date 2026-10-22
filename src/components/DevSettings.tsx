import React from 'react';
import {ScrollView, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from './AppText';
import {ToggleSwitch} from './ToggleSwitch';
import {Btn, Field, sectionLabel} from './controls';
import {config, LOG_LEVELS} from '../config';
import {useDevOverrides} from '../hooks/useDevOverrides';
import {getLocale} from '../utils';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';

export const DevSettings = () => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  const {over, json, setJson, jsonError, set, applyJson, reset, logs} = useDevOverrides();
  const c = config();
  const header = (label: string) => (
    <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 4})}>{label}</Text>
  );
  const row = (label: string, value: boolean, onToggle: () => void) => (
    <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6}}>
      <Text style={{fontSize: fs(13), color: T.text, flex: 1}}>{label}</Text>
      <ToggleSwitch value={value} onToggle={onToggle} label={label} style={{marginLeft: 12}} />
    </View>
  );
  const levelColor = (level: string): string => (level === 'error' ? T.danger : level === 'warn' ? T.accent : T.dim);
  return (
    <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
      {header(t('dev.title'))}
      <Text style={{fontSize: fs(11), color: T.muted, lineHeight: fs(15), marginBottom: 8}}>{t('dev.note')}</Text>
      <Field label={t('dev.relayUrl')} value={over.relayUrl ?? ''} onChange={v => set('relayUrl', v.trim() || undefined)} placeholder={c.relayUrl || t('dev.defaultNetwork')} />
      <Field label={t('dev.gatewayUrl')} value={over.gatewayUrl ?? ''} onChange={v => set('gatewayUrl', v.trim() || undefined)} placeholder={c.gatewayUrl || t('dev.defaultGateway')} />
      {header(t('dev.logLevel'))}
      <View style={{flexDirection: 'row', gap: 7, marginBottom: 8}}>
        {LOG_LEVELS.map(level => {
          const sel = c.logLevel === level;
          return (
            <TouchableOpacity key={level} onPress={() => set('logLevel', level)} activeOpacity={0.7}
              accessibilityRole="radio" accessibilityState={{selected: sel, checked: sel}} accessibilityLabel={level}
              style={{flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: 'center', backgroundColor: sel ? `${T.accent}20` : T.surface, borderColor: sel ? `${T.accent}60` : T.border}}>
              <Text style={{fontSize: fs(12), color: sel ? T.accent : T.dim, fontWeight: sel ? '600' : '400'}}>{level}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {row(t('dev.verboseNetwork'), c.verboseNetwork, () => set('verboseNetwork', !c.verboseNetwork))}
      {row(t('dev.startupTrace'), c.startupTrace, () => set('startupTrace', !c.startupTrace))}
      {row(t('dev.storageTrace'), c.storageTrace, () => set('storageTrace', !c.storageTrace))}
      <Field label={t('dev.overridesJson')} value={json} onChange={setJson} multiline numberOfLines={6} />
      {jsonError ? <Text style={{fontSize: fs(11), color: T.danger, marginBottom: 6}}>{jsonError}</Text> : null}
      <View style={{flexDirection: 'row', gap: 8, marginBottom: 12}}>
        <Btn onPress={applyJson}>{t('dev.applyJson')}</Btn>
        <Btn variant="danger" onPress={reset}>{t('dev.resetAll')}</Btn>
      </View>
      {header(t('dev.recentLog', {count: logs.length}))}
      <ScrollView style={{maxHeight: 220, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8}} nestedScrollEnabled>
        {logs.map((e, i) => (
          <Text key={`${e.at}-${i}`} selectable style={{fontSize: fs(10), color: levelColor(e.level), paddingHorizontal: 8, paddingVertical: 2}}>
            {new Date(e.at).toLocaleTimeString(getLocale())} {e.level} [{e.tag}] {e.message}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
};
