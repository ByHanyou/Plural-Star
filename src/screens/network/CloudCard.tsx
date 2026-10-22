import React, {useState} from 'react';
import {View, TouchableOpacity, Switch, Alert, ActivityIndicator} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text, TextInput} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {fmtTime} from '../../utils';
import {confirmSteps} from '../../utils/confirmSteps';
import {CloudServices} from '../../cloud/cloudPlatform';
import {cloudRuleText, cloudExceptionText} from '../../cloud/cloudMessages';
import {useCloud} from '../../cloud/useCloud';
import {passwordRuleFailing} from '../../cloud/cloudCrypto';
import {CloudActivity, PrimaryButton, SwitchRow, netStyles} from './NetParts';

const cancelPendingLink = () => CloudServices.cancelPendingLink();

export const CloudCard = ({hasDevices}: {hasDevices: boolean}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const ns = netStyles(T);
  const cloud = useCloud();
  const [cloudOn, setCloudOn] = useState(false);
  const [cloudPw, setCloudPw] = useState('');
  const [cloudMedia, setCloudMedia] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const rule = passwordRuleFailing(cloudPw);
  const busy = cloud.phase !== 'idle';

  const cloudAlert = (e: unknown) => Alert.alert(t('network.errorTitle'), cloudExceptionText(e, t));

  const onToggle = (v: boolean) => {
    if (v && hasDevices) {
      Alert.alert(t('network.cloudTitle'), t('network.cloudWarning'));
      return;
    }
    setCloudOn(v);
    if (!v) { setCloudPw(''); cancelPendingLink(); }
  };

  const onClear = () => {
    const action = t('network.cloudClear');
    confirmSteps([
      {title: t('network.cloudClearTitle'), message: t('network.cloudClearMsg'), action},
      {title: t('network.cloudClearConfirm2Title'), message: t('network.cloudClearConfirm2'), action},
    ], () => { CloudServices.clearAndUpload(cloudMedia).then(() => setCloudPw('')).catch(cloudAlert); }, cancelPendingLink);
  };

  const onImport = () => {
    confirmSteps([
      {title: t('network.cloudImportConfirmTitle'), message: t('network.cloudImportConfirmMsg'), action: t('network.cloudImport')},
    ], () => { CloudServices.importExisting(cloudMedia).then(() => setCloudPw('')).catch(cloudAlert); }, cancelPendingLink);
  };

  const onSubmit = async () => {
    if (rule || busy) return;
    try {
      const outcome = await CloudServices.linkWithPassword(cloudPw, cloudMedia);
      if (outcome.kind === 'created') { setCloudPw(''); return; }
      const cancel = {text: t('common.cancel'), style: 'cancel' as const, onPress: cancelPendingLink};
      const clear = {text: t('network.cloudClear'), style: 'destructive' as const, onPress: onClear};
      if (outcome.empty) {
        Alert.alert(t('network.cloudExistsTitle'), t('network.cloudEmptyMsg'), [cancel, clear]);
        return;
      }
      Alert.alert(t('network.cloudExistsTitle'), t('network.cloudExistsMsg'), [
        cancel,
        {text: t('network.cloudImport'), style: 'destructive', onPress: onImport},
        ...(outcome.canClear ? [clear] : []),
      ]);
    } catch (e) {
      cloudAlert(e);
    }
  };

  const onUnlink = () => {
    const title = t('network.cloudUnlink');
    confirmSteps([
      {title, message: t('network.cloudUnlinkMsg'), action: title},
      {title, message: t('network.cloudUnlinkConfirm2'), action: title},
    ], () => {
      setUnlinking(true);
      CloudServices.unlink().then(r => {
        setCloudOn(false);
        if (!r.deviceRemoved) Alert.alert(t('network.errorTitle'), t('network.cloudUnlinkUnreached', {code: r.errorCode || 'CLOUD-APP'}));
      }).catch(cloudAlert)
        .finally(() => setUnlinking(false));
    });
  };

  return (
    <View style={ns.card}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6}}>
        <Text accessibilityRole="header" style={[ns.label, {marginBottom: 0}]}>{t('network.cloudTitle')}</Text>
        <View style={{paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: `${T.info}60`, backgroundColor: `${T.info}18`}}>
          <Text style={{fontSize: fs(9), letterSpacing: 0.8, textTransform: 'uppercase', color: T.info, fontWeight: '700'}}>{t('network.cloudExperimental')}</Text>
        </View>
      </View>
      <Text style={{fontSize: fs(12), color: T.dim, marginBottom: 12}}>{t('network.cloudDesc')}</Text>

      {cloud.linked ? (
        <>
          <Text style={{fontSize: fs(12), color: T.text}}>{t('network.cloudLinkedDevices', {n: cloud.deviceCount})}</Text>
          {cloud.lastSyncAt > 0 && (
            <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}}>{t('network.cloudLastSync', {time: fmtTime(cloud.lastSyncAt)})}</Text>
          )}
          {cloud.pendingKeys > 0 && (
            <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}}>{t('network.cloudPending', {n: cloud.pendingKeys})}</Text>
          )}
          <CloudActivity cloud={cloud} />
          <SwitchRow title={t('network.cloudMediaTier')} desc={t('network.cloudMediaTierDesc')} value={cloud.mediaTier} disabled={busy}
            onChange={v => { CloudServices.setMediaTier(v).catch(cloudAlert); }} />
          <TouchableOpacity onPress={onUnlink} activeOpacity={0.8}
            hitSlop={{top: 6, bottom: 6}} style={{marginTop: 14, borderRadius: 8, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: `${T.danger}60`, backgroundColor: `${T.danger}12`}}
            accessibilityRole="button" accessibilityLabel={unlinking ? t('network.cloudUnlinking') : t('network.cloudUnlink')} accessibilityState={{busy: unlinking}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
              {unlinking && <ActivityIndicator size="small" color={T.accent} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />}
              {unlinking && <Text style={{fontSize: fs(11), color: T.accent}}>{t('network.cloudUnlinking')}</Text>}
              <Text style={{color: T.danger, fontWeight: '600', fontSize: fs(13)}}>{t('network.cloudUnlink')}</Text>
            </View>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
            <Text style={{fontSize: fs(15), fontWeight: '600', color: T.text, flex: 1, marginRight: 12}}>{t('network.cloudEnable')}</Text>
            <Switch value={cloudOn} disabled={busy || !cloud.available} onValueChange={onToggle}
              accessibilityRole="switch" accessibilityLabel={t('network.cloudEnable')} accessibilityState={{checked: cloudOn, disabled: busy || !cloud.available}} />
          </View>
          {!cloud.available && (
            <Text style={{fontSize: fs(11), color: T.muted, marginTop: 8}}>{t('network.cloudUnavailable')}</Text>
          )}
          {cloud.removedFromVault && (
            <Text accessibilityLiveRegion="polite" style={{fontSize: fs(11), color: T.danger, marginTop: 8}}>{t('network.cloudRemovedHere')}</Text>
          )}
          {cloudOn && (
            <View style={{marginTop: 12}}>
              <Text style={ns.label} nativeID="lblCloudPw">{t('network.cloudPassword')}</Text>
              <TextInput value={cloudPw} onChangeText={setCloudPw} secureTextEntry autoCapitalize="none" autoCorrect={false}
                textContentType="password" placeholder={t('network.cloudPassword')} placeholderTextColor={T.muted}
                style={ns.input} editable={!busy}
                accessibilityLabel={t('network.cloudPassword')} accessibilityLabelledBy="lblCloudPw" />
              <Text style={{fontSize: fs(11), color: cloudPw && rule ? T.danger : T.dim, marginTop: 6}} accessibilityLiveRegion="polite">
                {cloudPw && rule ? cloudRuleText(rule, t) : t('network.cloudPasswordHint')}
              </Text>
              <SwitchRow title={t('network.cloudMediaTier')} desc={t('network.cloudMediaTierDesc')} value={cloudMedia} disabled={busy} onChange={setCloudMedia} />
              <PrimaryButton label={t('network.cloudSubmit')} a11y={t('network.cloudSubmit')} onPress={onSubmit} disabled={!!rule || busy}
                style={{marginTop: 12, opacity: !!rule || busy ? 0.45 : 1}} />
              <CloudActivity cloud={cloud} />
            </View>
          )}
        </>
      )}
    </View>
  );
};
