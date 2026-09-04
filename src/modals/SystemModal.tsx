import React, {useState} from 'react';
import {View, TouchableOpacity, Alert, Text as RawText} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Sheet} from '../components/Sheet';
import {BUILTIN_PALETTES, FONT_OPTIONS, fontScale, ensureReadable} from '../theme';
import type {CustomPalette, FontChoice, ThemeColors} from '../theme';
import {uid, isValidHex, normalizeHex, TextScale, TEXT_SCALE_OPTIONS} from '../utils';
import {SUPPORTED_LANGUAGES} from '../i18n/i18n';
import type {SupportedLanguage} from '../i18n/i18n';
import {Btn, Field} from './shared';
import {ToggleSwitch} from '../components/ToggleSwitch';

const HexField = ({label, value, onChange, T}: {label: string; value: string; onChange: (v: string) => void; T: ThemeColors}) => (
  <View style={{flex: 1}}>
    <Text style={{fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 4, fontWeight: '600'}}>{label}</Text>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
      <View style={{width: 20, height: 20, borderRadius: 4, backgroundColor: isValidHex(normalizeHex(value)) ? normalizeHex(value) : '#333', borderWidth: 1, borderColor: T.border}} />
      <TextInput value={value} onChangeText={onChange} accessibilityLabel={label} placeholder="#000000" placeholderTextColor={T.muted} maxLength={7} autoCapitalize="characters"
        style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: isValidHex(normalizeHex(value)) || value.length < 2 ? T.border : T.danger, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, fontSize: 12, fontFamily: 'monospace'}} />
    </View>
  </View>
);

export const SystemModal = ({visible, theme: T, system, settings, palettes, activePaletteId, onSave, onSaveSettings, onSavePalettes, onSelectPalette, onOpenProfile, onClose}: any) => {
  const fs = fontScale(T);
  const {t} = useTranslation();
  const [journalPw, setJournalPw] = useState<string>(system.journalPassword || ''); const [showJournalPw, setShowJournalPw] = useState(!!system.journalPassword);
  const [sysName, setSysName] = useState<string>(system.name || '');
  const [sysDesc, setSysDesc] = useState<string>(system.description || '');
  const [newLocation, setNewLocation] = useState(''); const [newMood, setNewMood] = useState('');
  const [locs, setLocs] = useState<string[]>(settings?.locations || []); const [moods, setMoods] = useState<string[]>(settings?.customMoods || []);
  const [selectedLang, setSelectedLang] = useState<SupportedLanguage>(settings?.language || 'en');
  const [notifEnabled, setNotifEnabled] = useState<boolean>(settings?.notificationsEnabled ?? true);
  const [persistFront, setPersistFront] = useState<boolean>(settings?.persistentFrontNotif !== false);
  const [frontCheckInterval, setFrontCheckInterval] = useState<number>(settings?.frontCheckInterval || 0);
  const [notifRefreshMins, setNotifRefreshMins] = useState<number>(settings?.notificationRefreshMinutes || 0);
  const [showNotifRefreshPicker, setShowNotifRefreshPicker] = useState(false);
  const [noteboardNotifs, setNoteboardNotifs] = useState<boolean>(settings?.noteboardNotifications ?? false);
  const [termMap, setTermMap] = useState<Record<string, string>>(settings?.terminology || {});
  const [tierMap, setTierMap] = useState<Record<string, string>>(settings?.tierNames || {});
  const [appLockPw, setAppLockPw] = useState<string>(settings?.appLockPassword || '');
  const [showAppLockPw, setShowAppLockPw] = useState<boolean>(!!settings?.appLockPassword);
  const [filesEnabled, setFilesEnabled] = useState<boolean>(settings?.filesEnabled ?? true);
  const [singletMode, setSingletMode] = useState<boolean>(settings?.accountMode === 'singlet');
  const [textScale, setTextScale] = useState<TextScale>(settings?.textScale ?? 1.0);
  const [fontChoice, setFontChoice] = useState<FontChoice>(settings?.fontChoice ?? (settings?.useDyslexicFont === true ? 'opendyslexic' : 'default'));
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showFrontCheckPicker, setShowFrontCheckPicker] = useState(false);
  const [editPalette, setEditPalette] = useState<CustomPalette | null>(null);
  const [paletteName, setPaletteName] = useState('');
  const [palBg, setPalBg] = useState(''); const [palAccent, setPalAccent] = useState('');
  const [palText, setPalText] = useState(''); const [palMid, setPalMid] = useState('');
  React.useEffect(() => { if (visible) { setJournalPw(system.journalPassword || ''); setShowJournalPw(!!system.journalPassword); setSysName(system.name || ''); setSysDesc(system.description || ''); setLocs(settings?.locations || []); setMoods(settings?.customMoods || []); setNewLocation(''); setNewMood(''); setSelectedLang(settings?.language || 'en'); setNotifEnabled(settings?.notificationsEnabled ?? true); setPersistFront(settings?.persistentFrontNotif !== false); setFilesEnabled(settings?.filesEnabled ?? true); setSingletMode(settings?.accountMode === 'singlet'); setTextScale(settings?.textScale ?? 1.0); setFontChoice(settings?.fontChoice ?? (settings?.useDyslexicFont === true ? 'opendyslexic' : 'default')); setShowLangPicker(false); setShowFrontCheckPicker(false); setEditPalette(null); setFrontCheckInterval(settings?.frontCheckInterval || 0); setNotifRefreshMins(settings?.notificationRefreshMinutes || 0); setShowNotifRefreshPicker(false); setNoteboardNotifs(settings?.noteboardNotifications ?? false); setTermMap(settings?.terminology || {}); setTierMap(settings?.tierNames || {}); setAppLockPw(settings?.appLockPassword || ''); setShowAppLockPw(!!settings?.appLockPassword); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const addLoc = () => {if (newLocation.trim() && !locs.includes(newLocation.trim())) {setLocs([...locs, newLocation.trim()]); setNewLocation('');}};
  const addMood = () => {if (newMood.trim() && !moods.includes(newMood.trim())) {setMoods([...moods, newMood.trim()]); setNewMood('');}};

  const allPalettes: CustomPalette[] = [...BUILTIN_PALETTES, ...(palettes || [])];
  const userPalettes: CustomPalette[] = palettes || [];
  const canAdd = userPalettes.length < 10;

  const startNewPalette = () => {
    const p: CustomPalette = {id: uid(), name: '', bg: '#0A1F2E', accent: '#DAA520', text: '#C0C0C0', mid: '#7A8A99'};
    setEditPalette(p); setPaletteName(''); setPalBg(p.bg); setPalAccent(p.accent); setPalText(p.text); setPalMid(p.mid);
  };

  const startEditPalette = (p: CustomPalette) => {
    setEditPalette(p); setPaletteName(p.name); setPalBg(p.bg); setPalAccent(p.accent); setPalText(p.text); setPalMid(p.mid);
  };

  const savePalette = () => {
    if (!editPalette || !paletteName.trim()) return;
    const updated: CustomPalette = {id: editPalette.id, name: paletteName.trim(), bg: isValidHex(normalizeHex(palBg)) ? normalizeHex(palBg) : editPalette.bg, accent: isValidHex(normalizeHex(palAccent)) ? normalizeHex(palAccent) : editPalette.accent, text: isValidHex(normalizeHex(palText)) ? normalizeHex(palText) : editPalette.text, mid: isValidHex(normalizeHex(palMid)) ? normalizeHex(palMid) : editPalette.mid};
    const existing = userPalettes.find(p => p.id === updated.id);
    const newList = existing ? userPalettes.map(p => p.id === updated.id ? updated : p) : [...userPalettes, updated];
    onSavePalettes(newList);
    setEditPalette(null);
  };

  const deletePalette = (id: string) => {
    Alert.alert(t('common.delete'), t('modal.deletePaletteMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => {
        onSavePalettes(userPalettes.filter(p => p.id !== id));
        if (activePaletteId === id) onSelectPalette('__dark__');
      }},
    ]);
  };


  return (
    <Sheet visible={visible} title={t('modal.systemSettings')} theme={T} onClose={onClose} footer={<Btn instant T={T} onPress={() => {
      onSave({...system, ...(singletMode ? {name: sysName, description: sysDesc} : {}), journalPassword: showJournalPw && journalPw ? journalPw : undefined});
      onSaveSettings({...settings, accountMode: singletMode ? 'singlet' : 'system', locations: locs, customMoods: moods, language: selectedLang, notificationsEnabled: notifEnabled, persistentFrontNotif: persistFront, filesEnabled, textScale, fontChoice, useDyslexicFont: fontChoice === 'opendyslexic', frontCheckInterval, notificationRefreshMinutes: notifRefreshMins, noteboardNotifications: noteboardNotifs, terminology: termMap, tierNames: tierMap, appLockPassword: showAppLockPw && appLockPw ? appLockPw : undefined});
      onClose();
    }}>{t('common.save')}</Btn>}>
      {singletMode ? (
        <>
          <Field label={t('modal.name')} value={sysName} onChange={setSysName} placeholder={t('setup.yourNamePlaceholder')} T={T} />
          <Field label={t('modal.goals')} value={sysDesc} onChange={setSysDesc} placeholder={t('setup.goalsPlaceholder')} multiline numberOfLines={3} T={T} />
        </>
      ) : (
        <Btn T={T} onPress={onOpenProfile} style={{marginBottom: 14}}>{t('systemProfile.title')}</Btn>
      )}

      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 4}}>
        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.palette')}</Text>
        <Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15, marginBottom: 10}}>{t('modal.paletteDesc')}</Text>
        <View style={{gap: 6, marginBottom: 10}}>
          {allPalettes.map(p => {
            const isActive = activePaletteId === p.id;
            const isBuiltIn = p.id.startsWith('__');
            return (
              <View key={p.id}
                style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1,
                  backgroundColor: isActive ? `${p.accent}15` : T.surface, borderColor: isActive ? `${p.accent}50` : T.border}}>
                <TouchableOpacity onPress={() => onSelectPalette(p.id)} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityState={{selected: isActive}} accessibilityLabel={p.name}
                  style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10}}>
                  <View style={{flexDirection: 'row', gap: 3}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    {[p.bg, p.accent, p.text, p.mid].map((c, i) => (<View key={i} style={{width: 16, height: 16, borderRadius: 4, backgroundColor: c, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)'}} />))}
                  </View>
                  <Text style={{flex: 1, fontSize: fs(13), color: isActive ? p.accent : T.text, fontWeight: isActive ? '600' : '400'}}>{p.name}</Text>
                  {isActive && <Text style={{fontSize: fs(12), color: p.accent}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</Text>}
                </TouchableOpacity>
                {!isBuiltIn && (
                  <View style={{flexDirection: 'row', gap: 8}}>
                    <TouchableOpacity onPress={() => startEditPalette(p)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t('common.edit')} ${p.name}`} style={{paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}><Text style={{fontSize: fs(11), fontWeight: '500', color: T.accent}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('common.edit')}</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => deletePalette(p.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t('common.delete')} ${p.name}`} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}><Text style={{fontSize: fs(12), color: T.danger}} accessibilityElementsHidden importantForAccessibility="no">✕</Text></TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>
        {canAdd && !editPalette && (
          <TouchableOpacity onPress={startNewPalette} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('modal.newPalette')} style={{alignItems: 'center', paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: T.border}}>
            <Text style={{fontSize: fs(12), color: T.dim}}>+ {t('modal.newPalette')}</Text>
          </TouchableOpacity>
        )}
        {editPalette && (
          <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12, marginTop: 6}}>
            <TextInput value={paletteName} onChangeText={setPaletteName} accessibilityLabel={t('modal.paletteName')} placeholder={t('modal.paletteName')} placeholderTextColor={T.muted}
              style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), marginBottom: 10}} />
            <View style={{flexDirection: 'row', gap: 8, marginBottom: 10}}>
              <HexField label={t('modal.palBg')} value={palBg} onChange={setPalBg} T={T} />
              <HexField label={t('modal.palAccent')} value={palAccent} onChange={setPalAccent} T={T} />
            </View>
            <View style={{flexDirection: 'row', gap: 8, marginBottom: 10}}>
              <HexField label={t('modal.palText')} value={palText} onChange={setPalText} T={T} />
              <HexField label={t('modal.palMid')} value={palMid} onChange={setPalMid} T={T} />
            </View>
            {isValidHex(normalizeHex(palBg)) && isValidHex(normalizeHex(palAccent)) && isValidHex(normalizeHex(palText)) && isValidHex(normalizeHex(palMid)) && (
              <View style={{flexDirection: 'row', gap: 3, marginBottom: 10, padding: 8, borderRadius: 8, backgroundColor: normalizeHex(palBg)}}>
                <View style={{flex: 1, height: 24, borderRadius: 4, backgroundColor: normalizeHex(palAccent), alignItems: 'center', justifyContent: 'center'}}>
                  <Text style={{fontSize: fs(10), fontWeight: '600', color: ensureReadable(normalizeHex(palBg), normalizeHex(palAccent), 4.5)}}>{t('modal.palPreviewAccent')}</Text>
                </View>
                <View style={{flex: 1, height: 24, borderRadius: 4, alignItems: 'center', justifyContent: 'center'}}>
                  <Text style={{fontSize: fs(10), fontWeight: '600', color: ensureReadable(normalizeHex(palText), normalizeHex(palBg), 4.5)}}>{t('modal.palPreviewText')}</Text>
                </View>
                <View style={{flex: 1, height: 24, borderRadius: 4, backgroundColor: normalizeHex(palMid), alignItems: 'center', justifyContent: 'center'}}>
                  <Text style={{fontSize: fs(10), fontWeight: '600', color: ensureReadable(normalizeHex(palBg), normalizeHex(palMid), 4.5)}}>{t('modal.palPreviewMid')}</Text>
                </View>
              </View>
            )}
            <View style={{flexDirection: 'row', gap: 8}}>
              <TouchableOpacity onPress={() => setEditPalette(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')} style={{flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
                <Text style={{fontSize: fs(12), color: T.dim}}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={savePalette} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.save')} style={{flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
                <Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <Text style={{fontSize: fs(10), color: T.muted, marginTop: 6}}>{t('modal.paletteSlots', {used: userPalettes.length, max: 10})}</Text>
      </View>

      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}><Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600'}}>{t('modal.globalJournalPassword')}</Text><TouchableOpacity onPress={() => {setShowJournalPw(!showJournalPw); if (showJournalPw) setJournalPw('');}} accessibilityRole="button" accessibilityLabel={`${showJournalPw ? t('common.remove') : t('common.add')} ${t('modal.globalJournalPassword')}`}><Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>{showJournalPw ? t('common.remove') : t('common.add')}</Text></TouchableOpacity></View>
        {showJournalPw && <TextInput value={journalPw} onChangeText={setJournalPw} accessibilityLabel={t('modal.lockJournal')} placeholder={t('modal.lockJournal')} placeholderTextColor={T.muted} secureTextEntry style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(14)}} />}
      </View>
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
          <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600'}}>{t('modal.appLockPassword')}</Text>
          <TouchableOpacity onPress={() => { setShowAppLockPw(!showAppLockPw); if (showAppLockPw) setAppLockPw(''); }} accessibilityRole="button" accessibilityLabel={`${showAppLockPw ? t('common.remove') : t('common.add')} ${t('modal.appLockPassword')}`}>
            <Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>{showAppLockPw ? t('common.remove') : t('common.add')}</Text>
          </TouchableOpacity>
        </View>
        {showAppLockPw && (
          <TextInput value={appLockPw} onChangeText={setAppLockPw} accessibilityLabel={t('modal.appLockPasswordPlaceholder')} placeholder={t('modal.appLockPasswordPlaceholder')} placeholderTextColor={T.muted} secureTextEntry
            style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(14)}} />
        )}
        <Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15, marginTop: 6}}>{t('modal.appLockPasswordDesc')}</Text>
      </View>
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}><View style={{flex: 1}}><Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('modal.gpsLocation')}</Text><Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15}}>{t('modal.gpsDesc')}</Text></View>
          <ToggleSwitch value={!!settings?.gpsEnabled} onToggle={() => {const next = !settings?.gpsEnabled; onSaveSettings({...settings, locations: locs, customMoods: moods, gpsEnabled: next, language: selectedLang, notificationsEnabled: notifEnabled, filesEnabled, textScale, fontChoice, useDyslexicFont: fontChoice === 'opendyslexic', frontCheckInterval, noteboardNotifications: noteboardNotifs});}} label={t('modal.gpsLocation')} T={T} style={{marginLeft: 12}} /></View>
      </View>
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}><View style={{flex: 1}}><Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('modal.fileAccess')}</Text><Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15}}>{t('modal.fileAccessDesc')}</Text></View>
          <ToggleSwitch value={filesEnabled} onToggle={() => setFilesEnabled(!filesEnabled)} label={t('modal.fileAccess')} T={T} style={{marginLeft: 12}} /></View>
      </View>
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}><View style={{flex: 1}}><Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('modal.notifications')}</Text><Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15}}>{t('modal.notificationsDesc')}</Text></View>
          <ToggleSwitch value={notifEnabled} onToggle={() => setNotifEnabled(!notifEnabled)} label={t('modal.notifications')} T={T} style={{marginLeft: 12}} /></View>
        {notifEnabled && (
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10}}><View style={{flex: 1}}><Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('modal.persistentFrontNotif')}</Text><Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15}}>{t('modal.persistentFrontNotifDesc')}</Text></View>
            <ToggleSwitch value={persistFront} onToggle={() => setPersistFront(!persistFront)} label={t('modal.persistentFrontNotif')} T={T} style={{marginLeft: 12}} /></View>
        )}

        <View style={{marginTop: 12}}>
          <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{singletMode ? t('notification.statusCheck') : t('notification.frontCheck')}</Text>
          <Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15, marginBottom: 8}}>{singletMode ? t('notification.statusCheckDesc') : t('notification.frontCheckDesc')}</Text>
          <TouchableOpacity onPress={() => setShowFrontCheckPicker(!showFrontCheckPicker)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityState={{expanded: showFrontCheckPicker}} accessibilityLabel={singletMode ? t('notification.statusCheck') : t('notification.frontCheck')} accessibilityValue={{text: frontCheckInterval === 0 ? t('common.close') : t('notification.everyNHours', {count: frontCheckInterval})}}
            style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: showFrontCheckPicker ? `${T.accent}60` : T.border}}>
            <Text style={{fontSize: fs(14), color: T.text}}>{frontCheckInterval === 0 ? t('common.close') : t('notification.everyNHours', {count: frontCheckInterval})}</Text>
            <Text style={{fontSize: fs(12), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{showFrontCheckPicker ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {showFrontCheckPicker && (
            <View style={{backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.border, marginTop: 4, overflow: 'hidden'}}>
              {[0, 1, 2, 3, 4, 6, 8, 12].map(hours => (
                <TouchableOpacity key={hours} onPress={() => {setFrontCheckInterval(hours); setShowFrontCheckPicker(false);}} activeOpacity={0.7}
                  accessibilityRole="menuitem" accessibilityState={{selected: frontCheckInterval === hours}} accessibilityLabel={hours === 0 ? t('common.close') : t('notification.everyNHours', {count: hours})}
                  style={{paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border,
                    backgroundColor: frontCheckInterval === hours ? `${T.accent}15` : 'transparent'}}>
                  <Text style={{fontSize: fs(14), color: frontCheckInterval === hours ? T.accent : T.text, fontWeight: frontCheckInterval === hours ? '600' : '400'}}>
                    {hours === 0 ? t('common.close') : t('notification.everyNHours', {count: hours})}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={{marginTop: 12}}>
          <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('notification.refreshTitle')}</Text>
          <Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15, marginBottom: 8}}>{t('notification.refreshDesc')}</Text>
          <TouchableOpacity onPress={() => setShowNotifRefreshPicker(!showNotifRefreshPicker)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityState={{expanded: showNotifRefreshPicker}} accessibilityLabel={t('notification.refreshTitle')} accessibilityValue={{text: notifRefreshMins === 0 ? t('notification.refreshAuto') : notifRefreshMins < 60 ? t('notification.everyNMinutes', {count: notifRefreshMins}) : t('notification.everyNHours', {count: notifRefreshMins / 60})}}
            style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: showNotifRefreshPicker ? `${T.accent}60` : T.border}}>
            <Text style={{fontSize: fs(14), color: T.text}}>{notifRefreshMins === 0 ? t('notification.refreshAuto') : notifRefreshMins < 60 ? t('notification.everyNMinutes', {count: notifRefreshMins}) : t('notification.everyNHours', {count: notifRefreshMins / 60})}</Text>
            <Text style={{fontSize: fs(12), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{showNotifRefreshPicker ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {showNotifRefreshPicker && (
            <View style={{backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.border, marginTop: 4, overflow: 'hidden'}}>
              {[0, 15, 30, 60, 240, 480, 720, 1440].map(mins => {
                const label = mins === 0 ? t('notification.refreshAuto') : mins < 60 ? t('notification.everyNMinutes', {count: mins}) : t('notification.everyNHours', {count: mins / 60});
                return (
                  <TouchableOpacity key={mins} onPress={() => {setNotifRefreshMins(mins); setShowNotifRefreshPicker(false);}} activeOpacity={0.7}
                    accessibilityRole="menuitem" accessibilityState={{selected: notifRefreshMins === mins}} accessibilityLabel={label}
                    style={{paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border,
                      backgroundColor: notifRefreshMins === mins ? `${T.accent}15` : 'transparent'}}>
                    <Text style={{fontSize: fs(14), color: notifRefreshMins === mins ? T.accent : T.text, fontWeight: notifRefreshMins === mins ? '600' : '400'}}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {!singletMode && (
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14}}>
          <View style={{flex: 1}}>
            <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('notification.noteboard')}</Text>
            <Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15}}>{t('notification.noteboardDesc')}</Text>
          </View>
          <ToggleSwitch value={noteboardNotifs} onToggle={() => setNoteboardNotifs(!noteboardNotifs)} label={t('notification.noteboard')} T={T} style={{marginLeft: 12}} />
        </View>
        )}
      </View>
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
        <View style={{marginBottom: 8}}>
          <Text accessibilityRole="header" style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('terminology.title')}</Text>
          <Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15}}>{t('terminology.hint')}</Text>
        </View>
        {([['member', 'members'], ['group', 'groups'], ['facet', 'facets'], ['front', 'fronting'], ['system']] as const).map(pair => (
          <View key={pair[0]} style={{flexDirection: 'row', gap: 8, marginBottom: 8}}>
            {pair.map(term => (
              <View key={term} style={{flex: 1}}>
                <Text style={{fontSize: fs(10), color: T.dim, marginBottom: 3}}>{t(`terminology.${term}`)}</Text>
                <TextInput
                  value={termMap[term] || ''}
                  onChangeText={v => setTermMap(m => ({...m, [term]: v}))}
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
        <Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15, marginTop: 6, marginBottom: 8}}>{t('terminology.tierHint')}</Text>
        {([['primary', 'tierPrimary'], ['coFront', 'tierCoFront'], ['coConscious', 'tierCoConscious']] as const).map(([tier, labelKey]) => (
          <View key={tier} style={{marginBottom: 8}}>
            <Text style={{fontSize: fs(10), color: T.dim, marginBottom: 3}}>{t(`terminology.${labelKey}`)}</Text>
            <TextInput
              value={tierMap[tier] || ''}
              onChangeText={v => setTierMap(m => ({...m, [tier]: v}))}
              placeholder={t(`terminology.${labelKey}`)}
              placeholderTextColor={T.muted}
              accessibilityLabel={t(`terminology.${labelKey}`)}
              autoCapitalize="none"
              style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13)}}
            />
          </View>
        ))}
      </View>
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
        <View style={{marginBottom: 8}}><Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('modal.language')}</Text><Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15}}>{t('modal.languageDesc')}</Text></View>
        <TouchableOpacity onPress={() => setShowLangPicker(!showLangPicker)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityState={{expanded: showLangPicker}} accessibilityLabel={t('modal.language')} accessibilityValue={{text: t(`language.${selectedLang}`)}}
          style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: showLangPicker ? `${T.accent}60` : T.border}}>
          <Text style={{fontSize: fs(14), color: T.text}}>{t(`language.${selectedLang}`)}</Text>
          <Text style={{fontSize: fs(12), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{showLangPicker ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {showLangPicker && (
          <View style={{backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.border, marginTop: 4, overflow: 'hidden'}}>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <TouchableOpacity key={lang} onPress={() => {setSelectedLang(lang); setShowLangPicker(false);}} activeOpacity={0.7}
                accessibilityRole="menuitem" accessibilityState={{selected: selectedLang === lang}} accessibilityLabel={t(`language.${lang}`)}
                style={{paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border,
                  backgroundColor: selectedLang === lang ? `${T.accent}15` : 'transparent'}}>
                <Text style={{fontSize: fs(14), color: selectedLang === lang ? T.accent : T.text, fontWeight: selectedLang === lang ? '600' : '400'}}>{t(`language.${lang}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
        <View style={{marginBottom: 8}}><Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('modal.textSize')}</Text><Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15}}>{t('modal.textSizeDesc')}</Text></View>
        <View style={{flexDirection: 'row', gap: 7}}>{TEXT_SCALE_OPTIONS.map((opt) => (
          <TouchableOpacity key={opt.value} onPress={() => setTextScale(opt.value)} activeOpacity={0.7}
            accessibilityRole="radio" accessibilityState={{selected: textScale === opt.value, checked: textScale === opt.value}} accessibilityLabel={t(`modal.textScale${opt.label.replace(/\s/g, '')}`)}
            style={{flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center',
              backgroundColor: textScale === opt.value ? `${T.accent}20` : T.surface, borderColor: textScale === opt.value ? `${T.accent}60` : T.border}}>
            <Text style={{fontSize: fs(13), color: textScale === opt.value ? T.accent : T.dim, fontWeight: textScale === opt.value ? '600' : '400'}}>{t(`modal.textScale${opt.label.replace(/\s/g, '')}`)}</Text>
          </TouchableOpacity>
        ))}</View>
      </View>
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>
          {t('modal.appFont')}
        </Text>
        <Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15, marginBottom: 8}}>
          {t('modal.appFontDesc')}
        </Text>
        <View style={{borderWidth: 1, borderColor: T.border, borderRadius: 10, overflow: 'hidden'}}>
          {FONT_OPTIONS.map((opt, i) => {
            const sel = fontChoice === opt.value;
            return (
              <TouchableOpacity key={opt.value} onPress={() => setFontChoice(opt.value)} activeOpacity={0.7}
                accessibilityRole="radio" accessibilityState={{selected: sel, checked: sel}} accessibilityLabel={opt.label}
                style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 11, backgroundColor: sel ? `${T.accent}18` : T.surface, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: T.border}}>
                <RawText style={{fontSize: fs(14), color: sel ? T.accent : T.text, fontFamily: opt.family || undefined, fontWeight: sel && !opt.family ? '600' : '400'}}>{opt.label}</RawText>
                {sel ? <Text style={{fontSize: fs(14), color: T.accent}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</Text> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      {[[t('modal.locations'), locs, setLocs, newLocation, setNewLocation, addLoc, t('modal.addLocationPlaceholder')], [t('modal.customMoods'), moods, setMoods, newMood, setNewMood, addMood, t('modal.addMoodPlaceholder')]].map(([label, items, setItems, val, setVal, add, placeholder]: any) => (
        <View key={label} style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
          <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{label}</Text>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 8}}>{items.map((l: string) => (<TouchableOpacity key={l} onPress={() => setItems(items.filter((x: string) => x !== l))} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t('common.remove')} ${l}`} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface}}><Text style={{fontSize: fs(12), color: T.dim}}>{l}</Text><Text style={{fontSize: fs(10), color: T.danger}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✕</Text></TouchableOpacity>))}</View>
          <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}><TextInput value={val} onChangeText={setVal} accessibilityLabel={label || placeholder} placeholder={placeholder} placeholderTextColor={T.muted} style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13)}} onSubmitEditing={add} returnKeyType="done" /><Btn T={T} onPress={add} style={{paddingHorizontal: 12, paddingVertical: 9}}>{t('common.add')}</Btn></View>
        </View>))}
      <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}><View style={{flex: 1}}><Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('settings.observatory')}</Text><Text style={{fontSize: fs(11), color: T.muted, lineHeight: 15}}>{t('settings.observatoryDesc')}</Text></View>
          <ToggleSwitch value={singletMode} onToggle={() => setSingletMode(!singletMode)} label={t('settings.observatory')} T={T} style={{marginLeft: 12}} /></View>
      </View>
    </Sheet>
  );
};
