import React, {useState, useEffect, useRef} from 'react';
import {View, ScrollView, TouchableOpacity, Switch, Alert, AccessibilityInfo, Modal} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {fmtDur, fmtTime, uid, Member, MemberGroup, JournalEntry, CustomFieldDef, Relationship, RelationshipTypeDef, PRESET_RELATIONSHIP_TYPES} from '../utils';
import {fontScale, ThemeColors} from '../theme';
import {useAppStore} from '../store/appStore';
import {logError} from '../utils/log';
import {store, KEYS} from '../storage';
import {useNetwork} from '../network/useNetwork';
import {NetworkManager} from '../network/NetworkManager';
import {Friend, MAX_NOTIF_FRIENDS, PrivacyBucket, PrivacyScope, PrivacyScopeMode, PRIVACY_BUCKETS_KEY, MirrorFeature} from '../network/types';
import {MirrorScreen} from './MirrorScreen';

interface Props {
  theme: ThemeColors;
}

type NetTab = 'friends' | 'settings' | 'privacy';
type Kind = 'friend' | 'device';
type BucketFeature = 'members' | 'groups' | 'journal' | 'history' | 'customFields' | 'medical' | 'connections';

const emptyScope = (): PrivacyScope => ({mode: 'none', ids: []});
const newBucket = (name: string): PrivacyBucket => ({
  id: uid(),
  name,
  members: emptyScope(),
  groups: emptyScope(),
  journal: emptyScope(),
  history: emptyScope(),
  customFields: emptyScope(),
  medical: emptyScope(),
  connections: emptyScope(),
  friendPeerIds: [],
  createdAt: Date.now(),
});

const normalizeBucket = (b: PrivacyBucket): PrivacyBucket => ({
  ...b,
  members: b.members || emptyScope(),
  groups: b.groups || emptyScope(),
  journal: b.journal || emptyScope(),
  history: b.history || emptyScope(),
  customFields: b.customFields || emptyScope(),
  medical: b.medical || emptyScope(),
  connections: b.connections || emptyScope(),
  friendPeerIds: b.friendPeerIds || [],
});

export const NetworkScreen = ({theme: T}: Props) => {
  const members = useAppStore(s => s.members);
  const groups = useAppStore(s => s.groups);
  const journal = useAppStore(s => s.journal);
  const {t} = useTranslation();
  const fs = fontScale(T);
  const net = useNetwork();

  const [tab, setTab] = useState<NetTab>('friends');
  const [theirFriend, setTheirFriend] = useState('');
  const [theirDevice, setTheirDevice] = useState('');
  const [relayUrl, setRelayUrl] = useState('');
  const [relayToken, setRelayToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [copiedKind, setCopiedKind] = useState<Kind | null>(null);
  const [, setNowTick] = useState(0);
  const [buckets, setBuckets] = useState<PrivacyBucket[]>([]);
  const [editBucket, setEditBucket] = useState<PrivacyBucket | null>(null);
  const [pickerFeature, setPickerFeature] = useState<BucketFeature | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [mirrorMenuFor, setMirrorMenuFor] = useState<Friend | null>(null);
  const [mirror, setMirror] = useState<{peerId: string; name: string; feature: MirrorFeature} | null>(null);
  const [fieldDefs, setFieldDefs] = useState<CustomFieldDef[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [relTypes, setRelTypes] = useState<RelationshipTypeDef[]>([]);

  useEffect(() => {
    store.get<PrivacyBucket[]>(PRIVACY_BUCKETS_KEY, []).then(saved => {
      if (saved && Array.isArray(saved)) setBuckets(saved.map(normalizeBucket));
    }).catch(e => logError('network', e));
    store.get<CustomFieldDef[]>(KEYS.customFieldDefs, []).then(d => setFieldDefs(d || [])).catch(e => logError('network', e));
    store.get<Relationship[]>(KEYS.relationships, []).then(r => setRelationships(r || [])).catch(e => logError('network', e));
    store.get<RelationshipTypeDef[]>(KEYS.relationshipTypes, []).then(rt => setRelTypes(rt || [])).catch(e => logError('network', e));
  }, []);

  const saveBuckets = async (next: PrivacyBucket[]) => {
    setBuckets(next);
    await store.set(PRIVACY_BUCKETS_KEY, next);
    NetworkManager.notifyDataChanged();
  };

  useEffect(() => {
    const id = setInterval(() => setNowTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

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

  const onToggle = (v: boolean) => guard(() => NetworkManager.setEnabled(v));
  const onSaveRelay = () => guard(() => NetworkManager.setRelayOverride(relayUrl.trim() || undefined, relayToken.trim() || undefined));
  const onGenerate = (kind: Kind) => guard(async () => {
    try {
      await NetworkManager.generateCode(kind);
    } catch {
      throw new Error(t('network.publishFailed'));
    }
  });

  const onCopy = (kind: Kind, code: string | null) => {
    if (!code) return;
    Clipboard.setString(code);
    setCopiedKind(kind);
    setTimeout(() => {
      const msg = t('network.codeCopied');
      const AI: any = AccessibilityInfo;
      if (AI.announceForAccessibilityWithOptions) AI.announceForAccessibilityWithOptions(msg, {queue: true});
      else AccessibilityInfo.announceForAccessibility(msg);
    }, 400);
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
        if (msg.includes('timed out') || msg.includes('network request failed') || msg.includes('not connected')) throw new Error(t('network.publishFailed'));
        throw new Error(t('network.invalidCode'));
      }
    });
  };

  const onEnter = (kind: Kind, value: string, clear: () => void) => {
    if (!value.trim()) return;
    if (kind === 'device') {
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

  const featureLabel = (f: BucketFeature): string =>
    f === 'members' ? t('tabs.members') : f === 'groups' ? t('members.fieldGroups') : f === 'journal' ? t('tabs.journal') : f === 'history' ? t('tabs.history') : f === 'customFields' ? t('customFields.title') : t('systemMap.title');
  const scopeSummary = (s: PrivacyScope): string =>
    s.mode === 'all' ? t('network.scopeAll') : s.mode === 'none' ? t('network.scopeNone') : `${s.ids.length}`;
  const setScopeMode = (f: BucketFeature, mode: PrivacyScopeMode) => {
    if (!editBucket) return;
    setEditBucket({...editBucket, [f]: {...editBucket[f], mode}});
    if (mode === 'select') { setPickerSearch(''); setPickerFeature(f); }
  };
  const togglePickId = (id: string) => {
    if (!editBucket || !pickerFeature) return;
    const sc = editBucket[pickerFeature];
    const ids = sc.ids.includes(id) ? sc.ids.filter(x => x !== id) : [...sc.ids, id];
    setEditBucket({...editBucket, [pickerFeature]: {...sc, ids}});
  };
  const commitBucket = async () => {
    if (!editBucket) return;
    const name = editBucket.name.trim();
    if (!name) return;
    const exists = buckets.some(b => b.id === editBucket.id);
    const next = exists ? buckets.map(b => (b.id === editBucket.id ? {...editBucket, name} : b)) : [...buckets, {...editBucket, name}];
    await saveBuckets(next);
    setEditBucket(null);
  };
  const cloneBucket = (b: PrivacyBucket) => {
    setEditBucket({
      id: uid(),
      name: `${b.name} 2`,
      members: {mode: b.members.mode, ids: [...b.members.ids]},
      groups: {mode: b.groups.mode, ids: [...b.groups.ids]},
      journal: {mode: b.journal.mode, ids: [...b.journal.ids]},
      history: {mode: b.history.mode, ids: [...b.history.ids]},
      customFields: {mode: b.customFields.mode, ids: [...b.customFields.ids]},
      medical: {mode: b.medical.mode, ids: [...b.medical.ids]},
      connections: {mode: b.connections.mode, ids: [...b.connections.ids]},
      friendPeerIds: [],
      createdAt: Date.now(),
    });
  };
  const confirmDeleteBucket = (b: PrivacyBucket) => {
    Alert.alert(t('network.deleteBucket'), t('network.deleteBucketMsg', {name: b.name}), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => { saveBuckets(buckets.filter(x => x.id !== b.id)).catch(e => logError('network', e)); }},
    ]);
  };
  const pickableMembers = members.filter(m => !m.deleted && !m.isCustomFront);
  const memberName = (id: string) => members.find(m => m.id === id)?.name || '?';
  const relLabel = (r: Relationship): string => {
    const rt = relTypes.find(x => x.id === r.typeId) || PRESET_RELATIONSHIP_TYPES.find(x => x.id === r.typeId);
    const arrow = rt?.directional ? '→' : '↔';
    return `${memberName(r.fromId)} ${arrow} ${memberName(r.toId)}${rt ? `  ·  ${rt.name}` : ''}`;
  };

  const deviceStatusText = (f: Friend): string => {
    if (f.status === 'entered_theirs') return t('network.waitingThem');
    if (f.status === 'entered_mine') return t('network.waitingYou');
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
        {f.kind !== 'device' && f.status === 'accepted' && (
          <TouchableOpacity onPress={() => setMirrorMenuFor(f)} activeOpacity={0.7} accessibilityRole="button"
            accessibilityLabel={`${t('network.viewShared')}, ${f.displayName}`} style={{padding: 10}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Text style={{color: T.dim, fontSize: fs(16)}} importantForAccessibility="no">⋯</Text>
          </TouchableOpacity>
        )}
        {f.kind !== 'device' && f.status === 'accepted' && (() => {
          const atCap = !f.showInNotification && net.friends.filter(x => x.showInNotification).length >= MAX_NOTIF_FRIENDS;
          return (
            <TouchableOpacity onPress={() => { if (!atCap) NetworkManager.setFriendShowInNotification(f.peerId, !f.showInNotification); }} activeOpacity={0.7}
              accessibilityRole="switch" accessibilityState={{checked: !!f.showInNotification, disabled: atCap}}
              accessibilityLabel={`${t('network.showInNotif')}, ${f.displayName}`}
              style={{padding: 10, opacity: atCap ? 0.35 : 1}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Text style={{color: f.showInNotification ? T.accent : T.dim, fontSize: fs(15)}} importantForAccessibility="no">{f.showInNotification ? '🔔' : '🔕'}</Text>
            </TouchableOpacity>
          );
        })()}
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
        <TabBtn id="privacy" label={t('network.tabPrivacy')} />
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
        ) : tab === 'privacy' ? (
          <>
            <View style={card}>
              <Text accessibilityRole="header" style={labelStyle}>{t('network.tabPrivacy')}</Text>
              <Text style={{fontSize: fs(12), color: T.dim, marginBottom: 12}}>{t('network.privacyDesc')}</Text>
              <TouchableOpacity onPress={() => setEditBucket(newBucket(''))} activeOpacity={0.8} style={primaryBtn} accessibilityRole="button" accessibilityLabel={t('network.newBucket')}>
                <Text style={{color: '#fff', fontWeight: '600', fontSize: fs(13)}}>{t('network.newBucket')}</Text>
              </TouchableOpacity>
            </View>

            <View style={card}>
              <Text accessibilityRole="header" style={[labelStyle, {marginBottom: 8}]}>{t('network.buckets')}</Text>
              {buckets.length === 0 ? (
                <Text style={{fontSize: fs(12), color: T.dim}}>{t('network.noBuckets')}</Text>
              ) : buckets.map(b => (
                <View key={b.id} style={{flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border}}>
                  <TouchableOpacity style={{flex: 1, marginRight: 8}} onPress={() => setEditBucket({...b})} activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${b.name}. ${(['members', 'groups', 'journal', 'history', 'customFields', 'connections'] as BucketFeature[]).map(f => `${featureLabel(f)}: ${scopeSummary(b[f])}`).join(', ')}`}>
                    <Text style={{fontSize: fs(14), fontWeight: '600', color: T.text}} numberOfLines={1} importantForAccessibility="no">{b.name}</Text>
                    <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}} numberOfLines={2} importantForAccessibility="no">
                      {(['members', 'groups', 'journal', 'history', 'customFields', 'connections'] as BucketFeature[]).map(f => `${featureLabel(f)}: ${scopeSummary(b[f])}`).join('  ·  ')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => cloneBucket(b)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t('network.cloneBucket')}, ${b.name}`} style={{padding: 10}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                    <Text style={{color: T.dim, fontSize: fs(15)}} importantForAccessibility="no">⧉</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmDeleteBucket(b)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t('network.deleteBucket')}, ${b.name}`} style={{padding: 10}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                    <Text style={{color: T.dim, fontSize: fs(16)}} importantForAccessibility="no">✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        ) : (
          <>
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

      <Modal visible={!!editBucket && !pickerFeature} transparent animationType="fade" onRequestClose={() => setEditBucket(null)}>
        <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24}}>
          <View style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, overflow: 'hidden'}}>
            <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, padding: 16, paddingBottom: 8}}>
              {editBucket && buckets.some(b => b.id === editBucket.id) ? editBucket.name : t('network.newBucket')}
            </Text>
            <View style={{paddingHorizontal: 16, paddingBottom: 4}}>
              <Text style={labelStyle} nativeID="lblBucketName">{t('network.bucketName')}</Text>
              <TextInput value={editBucket?.name || ''} onChangeText={v => editBucket && setEditBucket({...editBucket, name: v})}
                placeholder={t('network.bucketName')} placeholderTextColor={T.muted} style={inputStyle}
                accessibilityLabel={t('network.bucketName')} accessibilityLabelledBy="lblBucketName" />
            </View>
            {editBucket && (['members', 'groups', 'journal', 'history', 'customFields', 'connections'] as BucketFeature[]).map(f => (
              <View key={f} style={{paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: T.border}}>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <Text style={{flex: 1, fontSize: fs(13), fontWeight: '600', color: T.text}}>{featureLabel(f)}</Text>
                  {((f === 'history' ? ['all', 'none'] : ['all', 'select', 'none']) as PrivacyScopeMode[]).map(mode => {
                    const sel = editBucket[f].mode === mode;
                    const label = mode === 'all' ? t('network.scopeAll') : mode === 'select' ? t('network.scopeSelect') : t('network.scopeNone');
                    return (
                      <TouchableOpacity key={mode} onPress={() => setScopeMode(f, mode)} activeOpacity={0.7}
                        accessibilityRole="button" accessibilityState={{selected: sel}} accessibilityLabel={`${featureLabel(f)}: ${label}`}
                        style={{marginLeft: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
                          backgroundColor: sel ? T.accentBg : 'transparent', borderColor: sel ? T.accent : T.border}}>
                        <Text style={{fontSize: fs(11), color: sel ? T.accent : T.dim}} importantForAccessibility="no">{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {editBucket[f].mode === 'select' && (
                  <TouchableOpacity onPress={() => { setPickerSearch(''); setPickerFeature(f); }} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityLabel={`${featureLabel(f)}: ${t('network.scopeSelect')}, ${editBucket[f].ids.length}`}
                    style={{marginTop: 6, alignSelf: 'flex-start'}}>
                    <Text style={{fontSize: fs(11), color: T.accent}}>{`${editBucket[f].ids.length} ✎`}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {editBucket && (
              <View style={{paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: T.border}}>
                <Text style={{fontSize: fs(13), fontWeight: '600', color: T.text, marginBottom: 6}}>{t('network.friends')}</Text>
                {net.friends.filter(f => f.kind !== 'device' && f.status === 'accepted').length === 0 ? (
                  <Text style={{fontSize: fs(11), color: T.dim}}>{t('network.noFriends')}</Text>
                ) : (
                  <ScrollView style={{maxHeight: 150}}>
                    {net.friends.filter(f => f.kind !== 'device' && f.status === 'accepted').map(f => {
                      const checked = (editBucket.friendPeerIds || []).includes(f.peerId);
                      return (
                        <TouchableOpacity key={f.peerId} activeOpacity={0.7}
                          onPress={() => setEditBucket({
                            ...editBucket,
                            friendPeerIds: checked
                              ? (editBucket.friendPeerIds || []).filter(id => id !== f.peerId)
                              : [...(editBucket.friendPeerIds || []), f.peerId],
                          })}
                          accessibilityRole="checkbox" accessibilityState={{checked}} accessibilityLabel={f.displayName}
                          style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7}}>
                          <View style={{width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: checked ? T.accent : T.border, backgroundColor: checked ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}} importantForAccessibility="no">
                            {checked && <Text style={{fontSize: fs(11), fontWeight: '700', color: T.bg}}>✓</Text>}
                          </View>
                          <Text style={{flex: 1, fontSize: fs(13), color: T.text}} numberOfLines={1} importantForAccessibility="no">{f.displayName}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            )}
            <View style={{flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: T.border}}>
              <TouchableOpacity onPress={() => setEditBucket(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
                style={{flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
                <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={commitBucket} disabled={!editBucket?.name.trim()} activeOpacity={0.7}
                accessibilityRole="button" accessibilityState={{disabled: !editBucket?.name.trim()}} accessibilityLabel={t('common.save')}
                style={{flex: 2, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, opacity: editBucket?.name.trim() ? 1 : 0.4}}>
                <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editBucket && !!pickerFeature} transparent animationType="fade" onRequestClose={() => setPickerFeature(null)}>
        <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24}}>
          <View style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, maxHeight: '75%', overflow: 'hidden'}}>
            <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, padding: 16, paddingBottom: 8}}>
              {pickerFeature ? featureLabel(pickerFeature) : ''} — {t('network.scopeSelect')}
            </Text>
            {pickerFeature !== 'groups' && (
              <View style={{paddingHorizontal: 16, paddingBottom: 8}}>
                <TextInput value={pickerSearch} onChangeText={setPickerSearch} placeholder={t('common.search')} placeholderTextColor={T.muted} style={inputStyle} accessibilityLabel={t('common.search')} />
              </View>
            )}
            <ScrollView style={{maxHeight: 340}}>
              {(pickerFeature === 'groups'
                ? groups.map(g => ({id: g.id, name: g.name}))
                : pickerFeature === 'journal'
                ? journal
                    .filter(e => !pickerSearch.trim() || (e.title || '').toLowerCase().includes(pickerSearch.trim().toLowerCase()))
                    .map(e => ({id: e.id, name: `${e.password ? '🔒 ' : ''}${e.title || fmtTime(e.timestamp)}`}))
                : pickerFeature === 'customFields'
                ? [...fieldDefs]
                    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                    .map(d => ({id: d.id, name: d.name}))
                    .filter(x => !pickerSearch.trim() || (x.name || '').toLowerCase().includes(pickerSearch.trim().toLowerCase()))
                : pickerFeature === 'connections'
                ? relationships
                    .map(r => ({id: r.id, name: relLabel(r)}))
                    .filter(x => !pickerSearch.trim() || (x.name || '').toLowerCase().includes(pickerSearch.trim().toLowerCase()))
                : pickableMembers
                    .filter(m => !pickerSearch.trim() || m.name.toLowerCase().includes(pickerSearch.trim().toLowerCase()))
                    .map(m => ({id: m.id, name: m.name}))
              ).map(item => {
                const checked = !!(editBucket && pickerFeature && editBucket[pickerFeature].ids.includes(item.id));
                return (
                  <TouchableOpacity key={item.id} onPress={() => togglePickId(item.id)} activeOpacity={0.7}
                    accessibilityRole="checkbox" accessibilityState={{checked}} accessibilityLabel={item.name}
                    style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border}}>
                    <View style={{width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: checked ? T.accent : T.border, backgroundColor: checked ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}} importantForAccessibility="no">
                      {checked && <Text style={{fontSize: fs(11), fontWeight: '700', color: T.bg}}>✓</Text>}
                    </View>
                    <Text style={{flex: 1, fontSize: fs(13), color: T.text}} numberOfLines={1} importantForAccessibility="no">{item.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity onPress={() => setPickerFeature(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')}
              style={{alignItems: 'center', paddingVertical: 13, borderTopWidth: 1, borderTopColor: T.border}}>
              <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!mirrorMenuFor} transparent animationType="fade" onRequestClose={() => setMirrorMenuFor(null)}>
        <TouchableOpacity style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24}} activeOpacity={1} onPress={() => setMirrorMenuFor(null)} accessibilityRole="none">
          <View style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, overflow: 'hidden'}}>
            <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, padding: 16, paddingBottom: 8}} numberOfLines={1}>
              {mirrorMenuFor?.displayName} — {t('network.viewShared')}
            </Text>
            {([
              {feature: 'members' as MirrorFeature, label: t('tabs.members')},
              {feature: 'groups' as MirrorFeature, label: t('members.fieldGroups')},
              {feature: 'journal' as MirrorFeature, label: t('tabs.journal')},
            ]).map(opt => (
              <TouchableOpacity key={opt.feature} activeOpacity={0.7}
                onPress={() => {
                  const f = mirrorMenuFor;
                  setMirrorMenuFor(null);
                  if (f) setMirror({peerId: f.peerId, name: f.displayName, feature: opt.feature});
                }}
                accessibilityRole="button" accessibilityLabel={opt.label}
                style={{paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: 1, borderTopColor: T.border}}>
                <Text style={{fontSize: fs(14), color: T.text}}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setMirrorMenuFor(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
              style={{alignItems: 'center', paddingVertical: 13, borderTopWidth: 1, borderTopColor: T.border}}>
              <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {mirror && (
        <MirrorScreen
          theme={T}
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
