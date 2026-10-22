import React, {useState, useEffect, useRef} from 'react';
import {View, TouchableOpacity, Switch, Alert, AccessibilityInfo} from 'react-native';
import {KeyboardAwareScrollView} from 'react-native-keyboard-controller';
import Clipboard from '@react-native-clipboard/clipboard';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {fmtDur, fmtTime, translateMood} from '../utils';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {useAppStore} from '../store/appStore';
import {useMinuteTick} from '../hooks/useMinuteTick';
import {useWhileTabActive} from '../hooks/useTabActive';
import {log, logError, errorMessage} from '../utils/log';
import {reportSaveError} from '../utils/saveError';
import {confirmSteps} from '../utils/confirmSteps';
import {store} from '../storage';
import {useNetwork} from '../network/useNetwork';
import {NetworkManager} from '../network/NetworkManager';
import {Friend, PRIVACY_BUCKETS_KEY, MirrorFeature} from '../network/types';
import {friendNotifyLevel, isAcceptedFriend} from '../network/friendState';
import {Bucket, BUCKET_ROWS, newBucket, normalizeBuckets, copyBucket, splitKinds, featureLabel, scopeSummary} from '../network/buckets';
import {deviceStatusKey, isOfflineError, netStatusColor, netStatusKey} from '../network/status';
import {frontShareDetailLines, frontShareTierLines} from '../network/frontShare';
import {CloudServices} from '../cloud/cloudPlatform';
import {useCloud} from '../cloud/useCloud';
import {MirrorScreen} from './MirrorScreen';
import {NetTab, PairKind, PairingBox, PeerRow, PrimaryButton, TabBtn, netStyles} from './network/NetParts';
import {CloudCard} from './network/CloudCard';
import {BucketEditor} from './network/BucketEditor';
import {MirrorMenu} from './network/MirrorMenu';

const COPY_ANNOUNCE_MS = 400;
const COPY_RESET_MS = 1500;
const ICON_HIT = {top: 8, bottom: 8, left: 8, right: 8};

export const NetworkScreen = () => {
  const T = useTheme();
  useMinuteTick();
  const members = useAppStore(s => s.members);
  const {t} = useTranslation();
  const fs = fontScale(T);
  const ns = netStyles(T);
  const net = useNetwork();
  const cloud = useCloud();

  const [tab, setTab] = useState<NetTab>('friends');
  const [theirFriend, setTheirFriend] = useState('');
  const [theirDevice, setTheirDevice] = useState('');
  const [relayUrl, setRelayUrl] = useState(NetworkManager.relaySettings().relayUrl || '');
  const [relayToken, setRelayToken] = useState(NetworkManager.relaySettings().token || '');
  const [busy, setBusy] = useState(false);
  const [copiedKind, setCopiedKind] = useState<PairKind | null>(null);
  const [, setNowTick] = useState(0);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [editBucket, setEditBucket] = useState<Bucket | null>(null);
  const [mirrorMenuFor, setMirrorMenuFor] = useState<Friend | null>(null);
  const [mirror, setMirror] = useState<{peerId: string; name: string; feature: MirrorFeature} | null>(null);

  useEffect(() => {
    const load = () => { store.get<unknown>(PRIVACY_BUCKETS_KEY, []).then(saved => setBuckets(normalizeBuckets(saved))).catch(e => logError('network', e)); };
    load();
    return NetworkManager.onSyncApplied(load);
  }, []);

  const saveBuckets = async (next: Bucket[]) => {
    await store.set(PRIVACY_BUCKETS_KEY, next);
    setBuckets(next);
    NetworkManager.refreshAllMirrors();
  };

  useWhileTabActive(() => {
    const id = setInterval(() => setNowTick(n => n + 1), 1000);
    return () => clearInterval(id);
  });

  const prevStatus = useRef(net.status);
  const prevAccepted = useRef(0);
  useEffect(() => NetworkManager.subscribe(s => {
    if (prevStatus.current !== s.status) {
      if (s.status === 'online') AccessibilityInfo.announceForAccessibility(t('network.status.online'));
      else if (s.status === 'error') AccessibilityInfo.announceForAccessibility(t('network.status.error'));
      prevStatus.current = s.status;
    }
    const accepted = [...s.friends, ...s.devices].filter(f => f.status === 'accepted').length;
    if (accepted > prevAccepted.current) AccessibilityInfo.announceForAccessibility(t('network.connected'));
    prevAccepted.current = accepted;
  }), [t]);
  useEffect(() => NetworkManager.onSyncCloneDone(() => {
    AccessibilityInfo.announceForAccessibility(t('network.syncCloneDone'));
  }), [t]);
  const prevRemovedFromVault = useRef(cloud.removedFromVault);
  useEffect(() => CloudServices.subscribe(c => {
    if (c.removedFromVault && !prevRemovedFromVault.current) AccessibilityInfo.announceForAccessibility(t('network.cloudRemovedHere'));
    prevRemovedFromVault.current = c.removedFromVault;
  }), [t]);

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const raw = errorMessage(e);
      const msg = raw.toLowerCase();
      Alert.alert(t('network.errorTitle'), isOfflineError(msg) ? t('network.status.error') : raw);
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = t(netStatusKey(net.status));
  const statusColor = netStatusColor(net.status, T.dim);
  const isOnline = (f: Friend) => net.onlinePeers.includes(f.peerId);

  const cloudBlocksSync = (kind: PairKind): boolean => {
    if (kind !== 'device' || !cloud.linked) return false;
    Alert.alert(t('network.cloudTitle'), t('network.cloudBlocksSync'));
    return true;
  };

  const onGenerate = (kind: PairKind) => {
    if (cloudBlocksSync(kind)) return;
    guard(async () => {
      try {
        await NetworkManager.generateCode(kind);
      } catch (e) {
        log.debug('network', e);
        throw new Error(t('network.publishFailed'));
      }
    });
  };

  const onCopy = (kind: PairKind, code: string | null) => {
    if (!code) return;
    Clipboard.setString(code);
    setCopiedKind(kind);
    setTimeout(() => {
      const msg = t('network.codeCopied');
      if (AccessibilityInfo.announceForAccessibilityWithOptions) AccessibilityInfo.announceForAccessibilityWithOptions(msg, {queue: true});
      else AccessibilityInfo.announceForAccessibility(msg);
    }, COPY_ANNOUNCE_MS);
    setTimeout(() => setCopiedKind(c => (c === kind ? null : c)), COPY_RESET_MS);
  };

  const enterWith = (kind: PairKind, value: string, clear: () => void, role?: 'source' | 'target') => {
    guard(async () => {
      try {
        if (kind === 'device') await NetworkManager.enterDeviceCode(value.trim(), role || 'source');
        else await NetworkManager.enterFriendCode(value.trim());
        clear();
      } catch (e) {
        const msg = errorMessage(e).toLowerCase();
        const sync = kind === 'device';
        if (msg.includes('own')) throw new Error(t(sync ? 'network.ownSyncCode' : 'network.ownCode'));
        if (msg.includes('not found') || msg.includes('expired')) throw new Error(t('network.notFound'));
        if (msg.includes('timed out') || msg.includes('network request failed') || msg.includes('not connected')) throw new Error(t('network.publishFailed'));
        throw new Error(t(sync ? 'network.invalidSyncCode' : 'network.invalidCode'));
      }
    });
  };

  const onEnter = (kind: PairKind, value: string, clear: () => void) => {
    if (!value.trim()) return;
    if (cloudBlocksSync(kind)) return;
    if (kind === 'device') {
      Alert.alert(t('network.syncDirectionTitle'), t('network.syncDirectionMsg'), [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('network.syncSendMine'), onPress: () => enterWith(kind, value, clear, 'source')},
        {text: t('network.syncReceiveTheirs'), onPress: () => enterWith(kind, value, clear, 'target')},
      ]);
      return;
    }
    enterWith(kind, value, clear);
  };

  const onRemove = (f: Friend) => {
    const title = t('network.remove');
    const warn = t('network.removeFriendWarn', {name: f.displayName});
    const steps = f.kind === 'device'
      ? [{title, message: f.displayName, action: title}]
      : [{title, message: warn, action: title}, {title: t('journal.areYouSure'), message: warn, action: title}];
    confirmSteps(steps, () => { guard(() => NetworkManager.removeFriend(f.peerId)); });
  };

  const pairingFor = (kind: PairKind, code: string | null, expiresAt: number | null, value: string, setValue: (v: string) => void) => (
    <PairingBox kind={kind} code={code} expiresAt={expiresAt} value={value} onChange={setValue}
      onEnter={() => onEnter(kind, value, () => setValue(''))} onGenerate={() => onGenerate(kind)} onCopy={() => onCopy(kind, code)}
      copied={copiedKind === kind} busy={busy} />
  );

  const friendStatusA11y = (f: Friend): string => {
    if (f.status === 'entered_theirs') return t('network.waitingThem');
    if (f.status === 'entered_mine') return t('network.waitingYou');
    const online = isOnline(f);
    const s = f.lastStatus;
    if (!s) return online ? t('network.online') : t('network.offline');
    const bits = [s.fronters];
    if (s.mood) bits.push(translateMood(s.mood, t));
    if (s.location) bits.push(s.location);
    return online ? bits.join(', ') : t('network.friendStatusOffline', {status: bits.join(', ')});
  };

  const renderFriendStatus = (f: Friend) => {
    if (f.status === 'entered_theirs') return <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}}>{t('network.waitingThem')}</Text>;
    if (f.status === 'entered_mine') return <Text style={{fontSize: fs(11), color: T.accent, marginTop: 2}}>{t('network.waitingYou')}</Text>;
    if (f.needsRefriend) return <Text style={{fontSize: fs(11), color: T.danger, marginTop: 2}}>{t('network.needsRefriend')}</Text>;
    const online = isOnline(f);
    const s = f.lastStatus;
    const sub = online ? T.dim : T.muted;
    if (!s) return <Text style={{fontSize: fs(11), color: sub, marginTop: 2}}>{online ? t('network.online') : t('network.offline')}</Text>;
    const dur = s.startTime ? fmtDur(s.startTime) : '';
    const lines = [...frontShareTierLines(s, t), ...frontShareDetailLines(s, t), ...(s.startTime ? [t('notification.since', {time: fmtTime(s.startTime)})] : [])];
    return (
      <View style={{marginTop: 2}}>
        <Text style={{fontSize: fs(12), fontWeight: '600', color: online ? T.text : T.muted}}>◈ {s.fronters}{dur ? `  ·  ${dur}` : ''}</Text>
        {lines.map((txt, i) => <Text key={i} style={{fontSize: fs(11), color: sub}}>{txt}</Text>)}
        {!online ? <Text style={{fontSize: fs(10), color: T.muted, marginTop: 2, fontStyle: 'italic'}}>{t('network.offline')}</Text> : null}
      </View>
    );
  };

  const commitBucket = async () => {
    if (!editBucket) return;
    const name = editBucket.name.trim();
    if (!name) return;
    const saved = {...editBucket, name};
    const next = buckets.some(b => b.id === editBucket.id) ? buckets.map(b => (b.id === editBucket.id ? saved : b)) : [...buckets, saved];
    try {
      await saveBuckets(next);
      setEditBucket(null);
    } catch (e) {
      reportSaveError(e);
    }
  };
  const confirmDeleteBucket = (b: Bucket) => {
    Alert.alert(t('network.deleteBucket'), t('network.deleteBucketMsg', {name: b.name}), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => { saveBuckets(buckets.filter(x => x.id !== b.id)).catch(reportSaveError); }},
    ]);
  };
  const deviceStatusText = (f: Friend): string => t(deviceStatusKey(f, isOnline(f)));
  const fullNotifyCount = net.friends.filter(x => friendNotifyLevel(x) === 'full').length;
  const peerRow = (f: Friend, status: React.ReactNode, a11y: string, order?: {index: number; count: number}) => (
    <PeerRow key={f.peerId} friend={f} online={isOnline(f)} status={status} a11y={a11y} order={order} fullNotifyCount={fullNotifyCount}
      onMirror={setMirrorMenuFor} onRemove={onRemove} />
  );

  const friendsTab = (
    <>
      <View style={ns.card}>
        <Text accessibilityRole="header" style={ns.label}>{t('network.addFriend')}</Text>
        <Text style={{fontSize: fs(12), color: T.dim, marginBottom: 12}}>{t('network.howItWorks')}</Text>
        {pairingFor('friend', net.activeFriendCode, net.activeFriendExpiresAt, theirFriend, setTheirFriend)}
      </View>
      <View style={ns.card}>
        <Text accessibilityRole="header" style={[ns.label, {marginBottom: 12}]}>{t('network.friends')}</Text>
        {net.friends.length === 0 ? (
          <Text style={{fontSize: fs(12), color: T.dim}}>{t('network.noFriends')}</Text>
        ) : net.friends.map((f, i) => peerRow(f, renderFriendStatus(f), friendStatusA11y(f), {index: i, count: net.friends.length}))}
      </View>
    </>
  );

  const privacyTab = (
    <>
      <View style={ns.card}>
        <Text accessibilityRole="header" style={ns.label}>{t('network.tabPrivacy')}</Text>
        <Text style={{fontSize: fs(12), color: T.dim, marginBottom: 12}}>{t('network.privacyDesc')}</Text>
        <PrimaryButton label={t('network.newBucket')} a11y={t('network.newBucket')} onPress={() => setEditBucket(newBucket())} />
      </View>
      <View style={ns.card}>
        <Text accessibilityRole="header" style={[ns.label, {marginBottom: 8}]}>{t('network.buckets')}</Text>
        {buckets.length === 0 ? (
          <Text style={{fontSize: fs(12), color: T.dim}}>{t('network.noBuckets')}</Text>
        ) : buckets.map(b => (
          <View key={b.id} style={{flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border}}>
            <TouchableOpacity hitSlop={{top: 10, bottom: 10}} style={{flex: 1, marginRight: 8}} onPress={() => setEditBucket(splitKinds(b, members))} activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={[b.name, ...BUCKET_ROWS.map(f => t('a11y.labelValue', {label: featureLabel(t, f), value: scopeSummary(t, b[f])}))].join(', ')}>
              <Text style={{fontSize: fs(14), fontWeight: '600', color: T.text}} numberOfLines={1} accessibilityElementsHidden importantForAccessibility="no">{b.name}</Text>
              <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}} numberOfLines={2} accessibilityElementsHidden importantForAccessibility="no">
                {BUCKET_ROWS.map(f => t('a11y.labelValue', {label: featureLabel(t, f), value: scopeSummary(t, b[f], true)})).join('  ·  ')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditBucket(copyBucket(b, t('network.bucketCopyName', {name: b.name})))} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('network.cloneBucketName', {name: b.name})} style={{padding: 10}} hitSlop={ICON_HIT}>
              <Text style={{color: T.dim, fontSize: fs(15)}} accessibilityElementsHidden importantForAccessibility="no">⧉</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => confirmDeleteBucket(b)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.deleteItem', {name: b.name})} style={{padding: 10}} hitSlop={ICON_HIT}>
              <Text style={{color: T.dim, fontSize: fs(16)}} accessibilityElementsHidden importantForAccessibility="no">✕</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </>
  );

  const settingsTab = (
    <>
      {net.identityResetAt !== null && (
        <View style={[ns.card, {borderColor: T.danger}]} accessibilityRole="alert">
          <Text style={{fontSize: fs(12), color: T.text}}>{t('network.identityResetNotice', {date: fmtTime(net.identityResetAt)})}</Text>
          <TouchableOpacity onPress={() => guard(() => NetworkManager.dismissIdentityReset())} disabled={busy} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel={t('common.ok')} hitSlop={{top: 8, bottom: 8}}
            style={{alignSelf: 'flex-end', marginTop: 10, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface}}>
            <Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>{t('common.ok')}</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={ns.card}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
          <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, flex: 1, marginRight: 12}}>{t('network.enable')}</Text>
          <Switch value={net.enabled} disabled={busy} onValueChange={v => guard(() => NetworkManager.setEnabled(v))} accessibilityRole="switch" accessibilityLabel={t('network.enable')} accessibilityState={{checked: net.enabled, disabled: busy}} />
        </View>
        <Text style={{fontSize: fs(12), color: T.dim, marginTop: 8}}>{t('network.enableDesc')}</Text>
        <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 12}} accessible accessibilityRole="text" accessibilityLabel={t('a11y.labelValue', {label: t('network.enable'), value: statusLabel})}>
          <View style={{width: 9, height: 9, borderRadius: 5, backgroundColor: statusColor, marginRight: 8}} importantForAccessibility="no" accessibilityElementsHidden />
          <Text style={{fontSize: fs(12), color: T.text}} accessibilityElementsHidden importantForAccessibility="no">{statusLabel}</Text>
        </View>
      </View>

      <View style={ns.card}>
        <Text accessibilityRole="header" style={ns.label}>{t('network.syncTitle')}</Text>
        <Text style={{fontSize: fs(12), color: T.dim, marginBottom: 12}}>{t('network.syncDesc')}</Text>
        {pairingFor('device', net.activeDeviceCode, net.activeDeviceExpiresAt, theirDevice, setTheirDevice)}
        <View style={{marginTop: 14}}>
          <Text accessibilityRole="header" style={[ns.label, {marginBottom: 8}]}>{t('network.linkedDevices')}</Text>
          {net.devices.length === 0 ? (
            <Text style={{fontSize: fs(12), color: T.dim}}>{t('network.noDevices')}</Text>
          ) : net.devices.map(f => peerRow(f, <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}}>{deviceStatusText(f)}</Text>, deviceStatusText(f)))}
        </View>
      </View>

      <Text style={{fontSize: fs(12), color: T.danger, marginTop: -4, marginBottom: 10, paddingHorizontal: 2}} accessibilityRole="text">
        {t('network.cloudWarning')}
      </Text>

      <CloudCard hasDevices={net.devices.length > 0} />

      <View style={ns.card}>
        <Text accessibilityRole="header" style={ns.label}>{t('network.customNetwork')}</Text>
        <Text style={{fontSize: fs(12), color: T.dim, marginBottom: 12}}>{t('network.customNetworkDesc')}</Text>
        <Text style={ns.label} nativeID="lblRelayUrl">{t('network.relayUrl')}</Text>
        <TextInput value={relayUrl} onChangeText={setRelayUrl} placeholder="http://192.168.1.20:7523" placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={ns.input} accessibilityLabel={t('network.relayUrl')} accessibilityLabelledBy="lblRelayUrl" />
        <Text style={[ns.label, {marginTop: 12}]} nativeID="lblRelayToken">{t('network.relayToken')}</Text>
        <TextInput value={relayToken} onChangeText={setRelayToken} placeholder="-" placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false} style={ns.input} accessibilityLabel={t('network.relayToken')} accessibilityLabelledBy="lblRelayToken" />
        <Text style={{fontSize: fs(11), color: T.dim, marginTop: 8, marginBottom: 12}}>{t('network.relayHint')}</Text>
        <PrimaryButton label={t('network.saveRelay')} disabled={busy}
          onPress={() => guard(() => NetworkManager.setRelayOverride(relayUrl.trim() || undefined, relayToken.trim() || undefined))} />
      </View>
    </>
  );

  return (
    <View style={{flex: 1, backgroundColor: T.bg}}>
      <View style={{flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border}} accessibilityRole="tablist">
        <TabBtn selected={tab} onSelect={setTab} id="friends" label={t('network.tabFriends')} />
        <TabBtn selected={tab} onSelect={setTab} id="privacy" label={t('network.tabPrivacy')} />
        <TabBtn selected={tab} onSelect={setTab} id="settings" label={t('network.tabSettings')} />
      </View>

      <KeyboardAwareScrollView style={{flex: 1}} contentContainerStyle={{padding: 16}} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        {tab === 'friends' ? friendsTab : tab === 'privacy' ? privacyTab : settingsTab}
      </KeyboardAwareScrollView>

      <BucketEditor bucket={editBucket} setBucket={setEditBucket}
        title={editBucket && buckets.some(b => b.id === editBucket.id) ? editBucket.name : t('network.newBucket')}
        friends={net.friends.filter(isAcceptedFriend)} onSave={commitBucket} />

      <MirrorMenu friend={mirrorMenuFor} buckets={buckets} onClose={() => setMirrorMenuFor(null)}
        onPick={(f, feature) => { setMirrorMenuFor(null); setMirror({peerId: f.peerId, name: f.displayName, feature}); }} />

      {mirror && (
        <MirrorScreen
          visible
          peerId={mirror.peerId}
          displayName={mirror.name}
          feature={mirror.feature}
          onClose={() => setMirror(null)}
        />
      )}
    </View>
  );
};
