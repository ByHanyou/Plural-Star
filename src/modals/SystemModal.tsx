import React, {useState} from 'react';
import {View, TouchableOpacity, Text as RawText} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Sheet} from '../components/Sheet';
import {FONT_OPTIONS, fontScale} from '../theme';
import type {CustomPalette, FontChoice} from '../theme';
import {useTheme} from '../themeContext';
import {SystemInfo, AppSettings, TextScale, TEXT_SCALE_OPTIONS, fontChoiceOf} from '../utils';
import {SUPPORTED_LANGUAGES} from '../i18n/i18n';
import type {SupportedLanguage} from '../i18n/i18n';
import {Btn, Field, PasswordSection, SectionHead, ToggleRow, sectionLabel} from '../components/controls';
import {ChipListEditor, Dropdown} from './system/SettingsControls';
import {PaletteSection} from './system/PaletteSection';
import {DevSettings} from '../components/DevSettings';
import {reportSaveError} from '../utils/saveError';
import {TERMINOLOGY_FIELDS, TIER_NAME_FIELDS} from '../i18n/terminology';

interface SettingsDraft {
  journalPw: string;
  showJournalPw: boolean;
  sysName: string;
  sysDesc: string;
  locs: string[];
  moods: string[];
  lang: SupportedLanguage;
  notifEnabled: boolean;
  persistFront: boolean;
  frontCheckInterval: number;
  notifRefreshMins: number;
  noteboardNotifs: boolean;
  termMap: Record<string, string>;
  tierMap: Record<string, string>;
  appLockPw: string;
  showAppLockPw: boolean;
  filesEnabled: boolean;
  gpsEnabled: boolean;
  singletMode: boolean;
  textScale: TextScale;
  fontChoice: FontChoice;
}

const draftFrom = (system: SystemInfo, settings: AppSettings): SettingsDraft => ({
  journalPw: system.journalPassword || '',
  showJournalPw: !!system.journalPassword,
  sysName: system.name || '',
  sysDesc: system.description || '',
  locs: settings.locations || [],
  moods: settings.customMoods || [],
  lang: settings.language || 'en',
  notifEnabled: settings.notificationsEnabled ?? true,
  persistFront: settings.persistentFrontNotif !== false,
  frontCheckInterval: settings.frontCheckInterval || 0,
  notifRefreshMins: settings.notificationRefreshMinutes || 0,
  noteboardNotifs: settings.noteboardNotifications ?? false,
  termMap: settings.terminology || {},
  tierMap: settings.tierNames || {},
  appLockPw: settings.appLockPassword || '',
  showAppLockPw: !!settings.appLockPassword,
  filesEnabled: settings.filesEnabled ?? true,
  gpsEnabled: !!settings.gpsEnabled,
  singletMode: settings.accountMode === 'singlet',
  textScale: settings.textScale ?? 1.0,
  fontChoice: fontChoiceOf(settings),
});

const FRONT_CHECK_HOURS = [0, 1, 2, 3, 4, 6, 8, 12] as const;
const REFRESH_MINUTES = [0, 15, 30, 60, 240, 480, 720, 1440] as const;

export const SystemModal = ({visible, system, settings, palettes, activePaletteId, onSave, onSaveSettings, onSavePalettes, onSelectPalette, onOpenProfile, onClose}: {
  visible: boolean; system: SystemInfo; settings: AppSettings; palettes: CustomPalette[]; activePaletteId: string;
  onSave: (s: SystemInfo) => Promise<void>; onSaveSettings: (s: AppSettings) => Promise<void>; onSavePalettes: (p: CustomPalette[]) => Promise<void>; onSelectPalette: (id: string) => Promise<void>; onOpenProfile: () => void; onClose: () => void;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  const [d, setD] = useState<SettingsDraft>(() => draftFrom(system, settings));
  const put = <K extends keyof SettingsDraft>(k: K, v: SettingsDraft[K]) => setD(x => ({...x, [k]: v}));
  const [termOpen, setTermOpen] = useState(false);
  const openRef = React.useRef({system, settings});
  openRef.current = {system, settings};
  React.useEffect(() => { if (visible) setD(draftFrom(openRef.current.system, openRef.current.settings)); }, [visible]);

  const frontCheckLabel = (hours: number) => (hours === 0 ? t('notification.frontCheckOff') : t('notification.everyNHours', {count: hours}));
  const refreshLabel = (mins: number) =>
    mins === 0 ? t('notification.refreshAuto') : mins < 60 ? t('notification.everyNMinutes', {count: mins}) : t('notification.everyNHours', {count: mins / 60});
  const checkTitle = d.singletMode ? t('notification.statusCheck') : t('notification.frontCheck');
  const sectionBox = {borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14};

  const save = async () => {
    try {
      await onSave({...system, ...(d.singletMode ? {name: d.sysName, description: d.sysDesc} : {}), journalPassword: d.showJournalPw && d.journalPw ? d.journalPw : undefined});
      await onSaveSettings({...settings, accountMode: d.singletMode ? 'singlet' : 'system', locations: d.locs, customMoods: d.moods, language: d.lang, notificationsEnabled: d.notifEnabled, persistentFrontNotif: d.persistFront, filesEnabled: d.filesEnabled, gpsEnabled: d.gpsEnabled, textScale: d.textScale, fontChoice: d.fontChoice, useDyslexicFont: d.fontChoice === 'opendyslexic', frontCheckInterval: d.frontCheckInterval, notificationRefreshMinutes: d.notifRefreshMins, noteboardNotifications: d.noteboardNotifs, terminology: d.termMap, tierNames: d.tierMap, appLockPassword: d.showAppLockPw && d.appLockPw ? d.appLockPw : undefined});
      onClose();
    } catch (e) {
      reportSaveError(e);
    }
  };

  return (
    <Sheet visible={visible} title={t('modal.systemSettings')} onClose={onClose} footer={<Btn instant onPress={save}>{t('common.save')}</Btn>}>
      {d.singletMode ? (
        <>
          <Field label={t('modal.name')} value={d.sysName} onChange={v => put('sysName', v)} placeholder={t('setup.yourNamePlaceholder')} />
          <Field label={t('modal.goals')} value={d.sysDesc} onChange={v => put('sysDesc', v)} placeholder={t('setup.goalsPlaceholder')} multiline numberOfLines={3} />
        </>
      ) : (
        <Btn onPress={onOpenProfile} style={{marginBottom: 14}}>{t('systemProfile.title')}</Btn>
      )}

      <PaletteSection palettes={palettes} activePaletteId={activePaletteId} onSavePalettes={onSavePalettes} onSelectPalette={onSelectPalette}
        style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 4}} />

      <PasswordSection label={t('modal.globalJournalPassword')} on={d.showJournalPw} setOn={on => setD(x => ({...x, showJournalPw: on, journalPw: on ? x.journalPw : ''}))}
        value={d.journalPw} onChange={v => put('journalPw', v)} placeholder={t('modal.lockJournal')}
        addLabel={t('modal.addJournalPassword')} removeLabel={t('modal.removeJournalPassword')} style={sectionBox} />
      <PasswordSection label={t('modal.appLockPassword')} on={d.showAppLockPw} setOn={on => setD(x => ({...x, showAppLockPw: on, appLockPw: on ? x.appLockPw : ''}))}
        value={d.appLockPw} onChange={v => put('appLockPw', v)} placeholder={t('modal.appLockPasswordPlaceholder')}
        addLabel={t('modal.addAppLockPassword')} removeLabel={t('modal.removeAppLockPassword')} desc={t('modal.appLockPasswordDesc')} style={sectionBox} />
      <ToggleRow label={t('modal.gpsLocation')} desc={t('modal.gpsDesc')} value={d.gpsEnabled} onToggle={() => put('gpsEnabled', !d.gpsEnabled)} style={sectionBox} />
      <ToggleRow label={t('modal.fileAccess')} desc={t('modal.fileAccessDesc')} value={d.filesEnabled} onToggle={() => put('filesEnabled', !d.filesEnabled)} style={sectionBox} />
      <View style={sectionBox}>
        <ToggleRow label={t('modal.notifications')} desc={t('modal.notificationsDesc')} value={d.notifEnabled} onToggle={() => put('notifEnabled', !d.notifEnabled)} />
        {d.notifEnabled && (
          <ToggleRow label={t('modal.persistentFrontNotif')} desc={t('modal.persistentFrontNotifDesc')} value={d.persistFront} onToggle={() => put('persistFront', !d.persistFront)} style={{marginTop: 10}} />
        )}

        <View style={{marginTop: 12}}>
          <SectionHead label={checkTitle} desc={d.singletMode ? t('notification.statusCheckDesc') : t('notification.frontCheckDesc')} style={{marginBottom: 8}} />
          <Dropdown label={checkTitle} value={d.frontCheckInterval} options={FRONT_CHECK_HOURS} optionLabel={frontCheckLabel} onPick={hours => put('frontCheckInterval', hours)} />
        </View>

        <View style={{marginTop: 12}}>
          <SectionHead label={t('notification.refreshTitle')} desc={t('notification.refreshDesc')} style={{marginBottom: 8}} />
          <Dropdown label={t('notification.refreshTitle')} value={d.notifRefreshMins} options={REFRESH_MINUTES} optionLabel={refreshLabel} onPick={mins => put('notifRefreshMins', mins)} />
        </View>

        {!d.singletMode && (
          <ToggleRow label={t('notification.noteboard')} desc={t('notification.noteboardDesc')} value={d.noteboardNotifs} onToggle={() => put('noteboardNotifs', !d.noteboardNotifs)} style={{marginTop: 14}} />
        )}
      </View>
      <View style={sectionBox}>
        <TouchableOpacity onPress={() => setTermOpen(o => !o)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityState={{expanded: termOpen}} accessibilityLabel={t('terminology.title')}
          hitSlop={{top: 10, bottom: 10}} style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
          <Text style={sectionLabel(T, {marginBottom: 4})}>{t('terminology.title')}</Text>
          <Text style={{fontSize: fs(12), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{termOpen ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        <Text style={{fontSize: fs(11), color: T.muted, lineHeight: fs(15), marginBottom: termOpen ? 8 : 0}}>{t('terminology.hint')}</Text>
        {termOpen && (<>
          {TERMINOLOGY_FIELDS.map(pair => (
            <View key={pair[0]} style={{flexDirection: 'row', gap: 8, marginBottom: 8}}>
              {pair.map(term => (
                <View key={term} style={{flex: 1}}>
                  <Text style={{fontSize: fs(10), color: T.dim, marginBottom: 3}}>{t(`terminology.${term}`)}</Text>
                  <TextInput
                    value={d.termMap[term] || ''}
                    onChangeText={v => setD(x => ({...x, termMap: {...x.termMap, [term]: v}}))}
                    placeholder={t(`terminology.${term}`)}
                    placeholderTextColor={T.muted}
                    accessibilityLabel={t(`terminology.${term}`)}
                    autoCapitalize="none"
                    style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13)}}
                  />
                </View>
              ))}
            </View>
          ))}
          <Text style={{fontSize: fs(11), color: T.muted, lineHeight: fs(15), marginTop: 6, marginBottom: 8}}>{t('terminology.tierHint')}</Text>
          {TIER_NAME_FIELDS.map(([tier, labelKey]) => (
            <View key={tier} style={{marginBottom: 8}}>
              <Text style={{fontSize: fs(10), color: T.dim, marginBottom: 3}}>{t(`terminology.${labelKey}`)}</Text>
              <TextInput
                value={d.tierMap[tier] || ''}
                onChangeText={v => setD(x => ({...x, tierMap: {...x.tierMap, [tier]: v}}))}
                placeholder={t(`terminology.${labelKey}`)}
                placeholderTextColor={T.muted}
                accessibilityLabel={t(`terminology.${labelKey}`)}
                autoCapitalize="none"
                style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13)}}
              />
            </View>
          ))}
        </>)}
      </View>
      <View style={sectionBox}>
        <SectionHead label={t('modal.language')} desc={t('modal.languageDesc')} style={{marginBottom: 8}} />
        <Dropdown label={t('modal.language')} value={d.lang} options={SUPPORTED_LANGUAGES} optionLabel={lang => t(`language.${lang}`)} onPick={lang => put('lang', lang)} />
      </View>
      <View style={sectionBox}>
        <SectionHead label={t('modal.textSize')} desc={t('modal.textSizeDesc')} style={{marginBottom: 8}} />
        <View style={{flexDirection: 'row', gap: 7}}>{TEXT_SCALE_OPTIONS.map(opt => {
          const sel = d.textScale === opt.value;
          return (
            <TouchableOpacity key={opt.value} onPress={() => put('textScale', opt.value)} activeOpacity={0.7}
              accessibilityRole="radio" accessibilityState={{selected: sel, checked: sel}} accessibilityLabel={t(opt.labelKey)}
              hitSlop={{top: 6, bottom: 6}} style={{flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center',
                backgroundColor: sel ? `${T.accent}20` : T.surface, borderColor: sel ? `${T.accent}60` : T.border}}>
              <Text style={{fontSize: fs(13), color: sel ? T.accent : T.dim, fontWeight: sel ? '600' : '400'}}>{t(opt.labelKey)}</Text>
            </TouchableOpacity>
          );
        })}</View>
      </View>
      <View style={sectionBox}>
        <SectionHead label={t('modal.appFont')} desc={t('modal.appFontDesc')} style={{marginBottom: 8}} />
        <View style={{borderWidth: 1, borderColor: T.border, borderRadius: 10, overflow: 'hidden'}}>
          {FONT_OPTIONS.map((opt, i) => {
            const sel = d.fontChoice === opt.value;
            const label = opt.value === 'default' ? t('modal.fontDefault') : opt.label;
            return (
              <TouchableOpacity key={opt.value} onPress={() => put('fontChoice', opt.value)} activeOpacity={0.7}
                accessibilityRole="radio" accessibilityState={{selected: sel, checked: sel}} accessibilityLabel={label}
                style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 11, backgroundColor: sel ? `${T.accent}18` : T.surface, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: T.border}}>
                <RawText style={{fontSize: fs(14), color: sel ? T.accent : T.text, fontFamily: opt.family || undefined, fontWeight: sel && !opt.family ? '600' : '400'}}>{label}</RawText>
                {sel ? <Text style={{fontSize: fs(14), color: T.accent}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</Text> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <ChipListEditor label={t('modal.locations')} items={d.locs} onChange={locs => put('locs', locs)} placeholder={t('modal.addLocationPlaceholder')} style={sectionBox} />
      <ChipListEditor label={t('modal.customMoods')} items={d.moods} onChange={moods => put('moods', moods)} placeholder={t('modal.addMoodPlaceholder')} style={sectionBox} />
      <ToggleRow label={t('settings.observatory')} desc={t('settings.observatoryDesc')} value={d.singletMode} onToggle={() => put('singletMode', !d.singletMode)} style={sectionBox} />
      {__DEV__ ? <DevSettings /> : null}
    </Sheet>
  );
};
