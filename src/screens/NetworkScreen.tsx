import React, {useState, useEffect, useRef} from 'react';
import {View, ScrollView, TouchableOpacity, Switch, Alert, AccessibilityInfo} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {fmtDur, fmtTime} from '../utils';
import {useNetwork} from '../network/useNetwork';
import {NetworkManager} from '../network/NetworkManager';
import {Friend} from '../network/types';

interface Props {
  theme: any;
}

type NetTab = 'friends' | 'settings';
type Kind = 'friend' | 'device';

export const NetworkScreen = ({theme: T}: Props) => {
  const {t} = useTranslation();
  const fs = (s: number) => Math.round(s * (T.textScale || 1));
  const net = useNetwork();

  const [tab, setTab] = useState<NetTab>('friends');
  const [theirFriend, setTheirFriend] = useState('');
  const [theirDevice, setTheirDevice] = useState('');
  const [relayUrl, setRelayUrl] = useState('');
  const [relayToken, setRelayToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [copiedKind, setCopiedKind] = useState<Kind | null>(null);
  const [, setNowTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNowTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Screen-reader announcements.
  const prevStatus = useRef(net.status);
  useEffect(() => {
    if (prevStatus.current !== net.status) {
      if (net.status === 'online') AccessibilityInfo.announceForAccessibility(t('network.status.online'));
      else if (net.status === 'error') AccessibilityInfo.announceForAccessibility(t('network.status.error'));
      prevStatus.current = net.status;
    }
  }, [net.status, t]);
  const prevAccepted = useRef(0);
  useEffect(() => {
    const accepted = [...net.friends, ...net.devices].filter(f => f.status === 'accepted').length;
    if (accepted > prevAccepted.current) AccessibilityInfo.announceForAccessibility(t('network.connected'));
    prevAccepted.current = accepted;
  }, [net.friends, net.devices, t]);
  // Announce when an initial device copy finishes (event, not state-diffing —
  // a role mismatch also clears the pending flag and must NOT announce success).
  useEffect(() => NetworkManager.onSyncCloneDone(() => {
    AccessibilityInfo.announceForAccessibility(t('network.syncCloneDone'));
  }), [t]);

  const labelStyle = {fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase' as const, color: T.dim, marginBottom: 6, fontWeight: '600' as const};
  const card = {backgroundColor: T.surface, borderColor: T.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 14};
  const inputStyle = {backgroundColor: T.bg, borderColor: T.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, color: T.text, fontSize: fs(14)};
  const primaryBtn = {backgroundColor: T.accent, borderRadius: 8, paddingVertical: 12, alignItems: 'center' as const};

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      Alert.alert(t('network.errorTitle'), String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (): string => {
    switch (net.status) {
      case 'connecting': return t('network.status.connecting');
      case 'online': return t('network.status.online');
      case 'reconnecting': return t('network.status.reconnecting');
      case 'error': return t('network.status.error');
      default: return t('network.status.disabled');
    }
  };
  const statusColor = (): string => {
    switch (net.status) {
      case 'online': return '#2faa55';
      case 'connecting':
      case 'reconnecting': return '#d6a435';
      case 'error': return '#cc4444';
      default: return T.dim;
    }
  };

  // ---- handlers ----
  const onToggle = (v: boolean) => guard(() => NetworkManager.setEnabled(v));
  const onSaveRelay = () => guard(() => NetworkManager.setRelayOverride(relayUrl.trim() || undefined, relayToken.trim() || undefined));
  const onGenerate = (kind: Kind) => guard(async () => {
    try {
      await NetworkManager.generateCode(kind);
    } catch {
      // Registration failed (offline / relay unreachable): no code was shown,
      // so nobody can share a dead one. Tell the user why.
      throw new Error(t('network.publishFailed'));
    }
  });

  const onCopy = (kind: Kind, code: string | null) => {
    if (!code) return;
    Clipboard.setString(code);
    setCopiedKind(kind);
    AccessibilityInfo.announceForAccessibility(t('network.codeCopied'));
    setTimeout(() => setCopiedKind(c => (c === kind ? null : c)), 1500);
  };

  const enterWith = (kind: Kind, value: string, clear: () => void, role?: 'source' | 'target') => {
    guard(async () => {
      try {
        if (kind === 'device') await NetworkManager.enterDeviceCode(value.trim(), role || 'source');
        else await NetworkManager.enterFriendCode(value.trim());
        clear();
      } catch (e: any) {
        const msg = String(e?.message || e).toLowerCase();
        if (msg.includes('own')) throw new Error(t('network.ownCode'));
        if (msg.includes('not found') || msg.includes('expired')) throw new Error(t('network.notFound'));
        throw new Error(t('network.invalidCode'));
      }
    });
  };

  const onEnter = (kind: Kind, value: string, clear: () => void) => {
    if (!value.trim()) return;
    if (kind === 'device') {
      // The initial copy is directed: the user must say which device's data
      // survives. Pick "send" on the device that has your data, "receive" on
      // the one being set up. After that first copy, sync runs both ways.
      Alert.alert(
        t('network.syncDirectionTitle'),
        t('network.syncDirectionMsg'),
        [
          {text: t('common.cancel'), style: 'cancel'},
          {text: t('network.syncSendMine'), onPress: () => enterWith(kind, value, clear, 'source')},
          {text: t('network.syncReceiveTheirs'), onPress: () => enterWith(kind, value, clear, 'target')},
        ],
      );
      return;
    }
    enterWith(kind, value, clear);
  };

  const onRemove = (f: Friend) => {
    Alert.alert(t('network.remove'), f.displayName, [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('network.remove'), style: 'destructive', onPress: () => guard(() => NetworkManager.removeFriend(f.peerId))},
    ]);
  };

  const mmss = (expiresAt: number | null): string => {
    const ms = expiresAt ? Math.max(0, expiresAt - Date.now()) : 0;
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };

  // Shared pairing block: their-code input + (Generate Code button OR your live,
  // tap-to-copy code with countdown).
  const renderPairing = (kind: Kind, code: string | null, expiresAt: number | null, theirVal: string, setTheirVal: (s: string) => void) => (
    <>
      <TextInput
        value={theirVal}
        onChangeText={setTheirVal}
        onSubmitEditing={() => onEnter(kind, theirVal, () => setTheirVal(''))}
        returnKeyType="go"
        placeholder={kind === 'device' ? t('network.deviceCodePlaceholder') : t('network.enterCodePlaceholder')}
        placeholderTextColor={T.muted}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!busy}
        style={[inputStyle, {marginBottom: 12}]}
        accessibilityLabel={kind === 'device' ? t('network.deviceCode') : t('network.enterTheirCode')}
        accessibilityHint={t('network.enterCodeHint')}
      />
      {code ? (
        <TouchableOpacity
          onPress={() => onCopy(kind, code)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${t('network.yourCode')}: ${code}`}
          accessibilityHint={t('network.tapToCopy')}
          style={{backgroundColor: T.bg, borderColor: T.accent, borderWidth: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center'}}>
          <Text style={{fontSize: fs(kind === 'device' ? 17 : 20), fontWeight: '700', letterSpacing: 2, color: T.text}}>{code}</Text>
          <Text style={{fontSize: fs(11), color: T.dim, marginTop: 4}}>
            {copiedKind === kind ? t('network.codeCopied') : `${t('network.tapToCopy')} · ${t('network.expiresIn', {time: mmss(expiresAt)})}`}
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={() => onGenerate(kind)} disabled={busy} activeOpacity={0.8} style={primaryBtn} accessibilityRole="button" accessibilityState={{disabled: busy}}>
          <Text style={{color: '#fff', fontWeight: '600', fontSize: fs(14)}}>{t('network.generateCode')}</Text>
        </TouchableOpacity>
      )}
    </>
  );

  const friendStatusA11y = (f: Friend): string => {
    if (f.status === 'entered_theirs') return t('network.waitingThem');
    if (f.status === 'entered_mine') return t('network.waitingYou');
    const online = net.onlinePeers.includes(f.peerId);
    const s = f.lastStatus;
    if (!s) return online ? t('network.online') : t('network.offline');
    const bits = [s.fronters];
    if (s.mood) bits.push(s.mood);
    if (s.location) bits.push(s.location);
    return `${bits.join(', ')}${online ? '' : '. ' + t('network.offline')}`;
  };

  const renderFriendStatus = (f: Friend) => {
    if (f.status === 'entered_theirs') return <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}}>{t('network.waitingThem')}</Text>;
    if (f.status === 'entered_mine') return <Text style={{fontSize: fs(11), color: T.accent, marginTop: 2}}>{t('network.waitingYou')}</Text>;
    const online = net.onlinePeers.includes(f.peerId);
    const s = f.lastStatus;
    const head = online ? T.text : T.muted;
    const sub = online ? T.dim : T.muted;
    if (!s) return <Text style={{fontSize: fs(11), color: sub, marginTop: 2}}>{online ? t('network.online') : t('network.offline')}</Text>;
    const dur = s.startTime ? fmtDur(s.startTime) : '';
    const line = (txt: string, key: string) => <Text key={key} style={{fontSize: fs(11), color: sub}} numberOfLines={2}>{txt}</Text>;
    return (
      <View style={{marginTop: 2}}>
        <Text style={{fontSize: fs(12), fontWeight: '600', color: head}} numberOfLines={1}>◈ {s.fronters}{dur ? `  ·  ${dur}` : ''}</Text>
        {s.primary ? line(t('notification.primary', {names: s.primary, defaultValue: `Primary: ${s.primary}`}), 'p') : null}
        {s.coFront ? line(t('notification.coFront', {names: s.coFront, defaultValue: `Co-Front: ${s.coFront}`}), 'cf') : null}
        {s.coConscious ? line(t('notification.coConscious', {names: s.coConscious, defaultValue: `Co-Conscious: ${s.coConscious}`}), 'cc') : null}
        {s.mood ? line(t('notification.mood', {mood: s.mood, defaultValue: `Mood: ${s.mood}`}), 'm') : null}
        {s.location ? line(t('notification.at', {location: s.location, defaultValue: `At: ${s.location}`}), 'l') : null}
        {s.note ? line(t('notification.note', {note: s.note, defaultValue: `Note: ${s.note}`}), 'n') : null}
        {s.startTime ? line(t('notification.since', {time: fmtTime(s.startTime), defaultValue: `Since ${fmtTime(s.startTime)}`}), 's') : null}
        {!online ? <Text style={{fontSize: fs(10), color: T.muted, marginTop: 2, fontStyle: 'italic'}}>{t('network.offline')}</Text> : null}
      </View>
    );
  };

  const deviceStatusText = (f: Friend): string => {
    if (f.status === 'entered_theirs') return t('network.waitingThem');
    if (f.status === 'entered_mine') return t('network.waitingYou');
    // Mid initial copy: say so (and which direction) instead of just "online" —
    // the user shouldn't wonder why the target still shows old data.
    if (f.initPending) {
      return f.initRole === 'source' ? t('network.syncCloneSending') : t('network.syncCloneReceiving');
    }
    return net.onlinePeers.includes(f.peerId) ? t('network.online') : t('network.offline');
  };

  const renderRow = (f: Friend, statusNode: React.ReactNode, a11y: string) => {
    const online = f.status === 'accepted' && net.onlinePeers.includes(f.peerId);
    return (
      <View key={f.peerId} style={{flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border}}>
        <View style={{width: 8, height: 8, borderRadius: 4, marginRight: 10, marginTop: 5, backgroundColor: f.status !== 'accepted' ? T.muted : online ? '#2faa55' : T.muted}} importantForAccessibility="no" accessibilityElementsHidden />
        <View style={{flex: 1, marginRight: 8}} accessible accessibilityRole="text" accessibilityLabel={`${f.displayName}. ${a11y}`}>
          <Text style={{fontSize: fs(14), fontWeight: '600', color: online || f.status !== 'accepted' ? T.text : T.muted}} numberOfLines={1} importantForAccessibility="no">{f.displayName}</Text>
          <View importantForAccessibility="no">{statusNode}</View>
        </View>
        <TouchableOpacity onPress={() => onRemove(f)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t('network.remove')}, ${f.displayName}`} style={{padding: 10}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <Text style={{color: T.dim, fontSize: fs(16)}} importantForAccessibility="no">✕</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const TabBtn = ({id, label}: {id: NetTab; label: string}) => (
    <TouchableOpacity onPress={() => setTab(id)} activeOpacity={0.8} accessibilityRole="tab" accessibilityState={{selected: tab === id}}
      style={{flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: tab === id ? T.accent : 'transparent'}}>
      <Text style={{fontSize: fs(13), fontWeight: '600', color: tab === id ? T.accent : T.dim}}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{flex: 1, backgroundColor: T.bg}}>
      <View style={{flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border}} accessibilityRole="tablist">
        <TabBtn id="friends" label={t('network.tabFriends')} />
        <TabBtn id="settings" label={t('network.tabSettings')} />
      </View>

      <ScrollView style={{flex: 1}} contentContainerStyle={{padding: 16}} keyboardShouldPersistTaps="handled">
        {tab === 'friends' ? (
          <>
            <View style={card}>
              <Text accessibilityRole="header" style={labelStyle}>{t('network.addFriend')}</Text>
              <Text style={{fontSize: fs(12), color: T.dim, marginBottom: 12}}>{t('network.howItWorks')}</Text>
              {renderPairing('friend', net.activeFriendCode, net.activeFriendExpiresAt, theirFriend, setTheirFriend)}
            </View>

            <View style={card}>
              <Text accessibilityRole="header" style={[labelStyle, {marginBottom: 12}]}>{t('network.friends')}</Text>
              {net.friends.length === 0 ? (
                <Text style={{fontSize: fs(12), color: T.dim}}>{t('network.noFriends')}</Text>
              ) : (
                net.friends.map(f => renderRow(f, renderFriendStatus(f), friendStatusA11y(f)))
              )}
            </View>
          </>
        ) : (
          <>
            {/* Connection */}
            <View style={card}>
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, flex: 1, marginRight: 12}}>{t('network.enable')}</Text>
                <Switch value={net.enabled} disabled={busy} onValueChange={onToggle} accessibilityRole="switch" accessibilityLabel={t('network.enable')} accessibilityState={{checked: net.enabled, disabled: busy}} />
              </View>
              <Text style={{fontSize: fs(12), color: T.dim, marginTop: 8}}>{t('network.enableDesc')}</Text>
              <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 12}} accessible accessibilityRole="text" accessibilityLabel={`${t('network.enable')} — ${statusLabel()}`}>
                <View style={{width: 9, height: 9, borderRadius: 5, backgroundColor: statusColor(), marginRight: 8}} importantForAccessibility="no" accessibilityElementsHidden />
                <Text style={{fontSize: fs(12), color: T.text}} importantForAccessibility="no">{statusLabel()}</Text>
              </View>
            </View>

            {/* Sync (your own devices) */}
            <View style={card}>
              <Text accessibilityRole="header" style={labelStyle}>{t('network.syncTitle')}</Text>
              <Text style={{fontSize: fs(12), color: T.dim, marginBottom: 12}}>{t('network.syncDesc')}</Text>
              {renderPairing('device', net.activeDeviceCode, net.activeDeviceExpiresAt, theirDevice, setTheirDevice)}
              <View style={{marginTop: 14}}>
                <Text accessibilityRole="header" style={[labelStyle, {marginBottom: 8}]}>{t('network.linkedDevices')}</Text>
                {net.devices.length === 0 ? (
                  <Text style={{fontSize: fs(12), color: T.dim}}>{t('network.noDevices')}</Text>
                ) : (
                  net.devices.map(f => renderRow(f, <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}}>{deviceStatusText(f)}</Text>, deviceStatusText(f)))
                )}
              </View>
            </View>

            {/* Other / custom network — optional. The toggle uses the default network automatically. */}
            <View style={card}>
              <Text accessibilityRole="header" style={labelStyle}>{t('network.customNetwork')}</Text>
              <Text style={{fontSize: fs(12), color: T.dim, marginBottom: 12}}>{t('network.customNetworkDesc')}</Text>
              <Text style={labelStyle} nativeID="lblRelayUrl">{t('network.relayUrl')}</Text>
              <TextInput value={relayUrl} onChangeText={setRelayUrl} placeholder="http://192.168.1.20:7523" placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={inputStyle} accessibilityLabel={t('network.relayUrl')} accessibilityLabelledBy="lblRelayUrl" />
              <Text style={[labelStyle, {marginTop: 12}]} nativeID="lblRelayToken">{t('network.relayToken')}</Text>
              <TextInput value={relayToken} onChangeText={setRelayToken} placeholder="—" placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false} style={inputStyle} accessibilityLabel={t('network.relayToken')} accessibilityLabelledBy="lblRelayToken" />
              <Text style={{fontSize: fs(11), color: T.dim, marginTop: 8, marginBottom: 12}}>{t('network.relayHint')}</Text>
              <TouchableOpacity onPress={onSaveRelay} disabled={busy} activeOpacity={0.8} style={primaryBtn} accessibilityRole="button" accessibilityState={{disabled: busy}}>
                <Text style={{color: '#fff', fontWeight: '600', fontSize: fs(13)}}>{t('network.saveRelay')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};
