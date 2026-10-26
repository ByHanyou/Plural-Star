import React from 'react';
import {View, TouchableOpacity, Switch, ActivityIndicator} from 'react-native';
import type {TextStyle, ViewStyle} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text, TextInput} from '../../components/AppText';
import {fontScale, ThemeColors, initialOn} from '../../theme';
import {useTheme} from '../../themeContext';
import {fmtCountdown, fmtPercent} from '../../utils';
import {reportSaveError} from '../../utils/saveError';
import {sectionLabel} from '../../components/controls';
import {NetworkManager} from '../../network/NetworkManager';
import {Friend} from '../../network/types';
import {friendNotifyLevel, isAcceptedFriend} from '../../network/friendState';
import {NOTIFY_GLYPH, NOTIFY_KEY, ONLINE_COLOR, nextNotifyLevel} from '../../network/status';
import {cloudPhaseText, cloudStatusErrorText} from '../../cloud/cloudMessages';
import type {useCloud} from '../../cloud/useCloud';

export type NetTab = 'friends' | 'settings' | 'privacy';
export type PairKind = 'friend' | 'device';

export const netStyles = (T: ThemeColors) => {
  const fs = fontScale(T);
  const label: TextStyle = sectionLabel(T, {marginBottom: 6});
  const card: ViewStyle = {backgroundColor: T.surface, borderColor: T.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 14};
  const input: TextStyle = {backgroundColor: T.bg, borderColor: T.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, color: T.text, fontSize: fs(14)};
  const primaryBtn: ViewStyle = {backgroundColor: T.accent, borderRadius: 8, paddingVertical: 12, alignItems: 'center'};
  return {label, card, input, primaryBtn};
};

export const TabBtn = ({id, label, selected, onSelect}: {id: NetTab; label: string; selected: NetTab; onSelect: (id: NetTab) => void}) => {
  const T = useTheme();
  const fs = fontScale(T);
  return (
    <TouchableOpacity onPress={() => onSelect(id)} activeOpacity={0.8} accessibilityRole="tab" accessibilityState={{selected: selected === id}}
      hitSlop={{top: 6, bottom: 6}} style={{flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: selected === id ? T.accent : 'transparent'}}>
      <Text style={{fontSize: fs(13), fontWeight: '600', color: selected === id ? T.accent : T.dim}}>{label}</Text>
    </TouchableOpacity>
  );
};

export const PrimaryButton = ({label, onPress, disabled = false, fontSize = 13, a11y, style}: {
  label: string; onPress: () => void; disabled?: boolean; fontSize?: number; a11y?: string; style?: ViewStyle;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8} hitSlop={{top: 4, bottom: 4}} style={[netStyles(T).primaryBtn, style]}
      accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{disabled}}>
      <Text style={{color: initialOn(T.accent), fontWeight: '600', fontSize: fs(fontSize)}}>{label}</Text>
    </TouchableOpacity>
  );
};

export const CheckMark = ({checked, square = false}: {checked: boolean; square?: boolean}) => {
  const T = useTheme();
  const fs = fontScale(T);
  return (
    <View style={{width: 20, height: 20, borderRadius: square ? 6 : 10, borderWidth: 2, borderColor: checked || square ? T.accent : T.border, backgroundColor: checked ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}} accessibilityElementsHidden importantForAccessibility="no">
      {checked && <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(11), fontWeight: '700', color: T.bg}}>✓</Text>}
    </View>
  );
};

export const SwitchRow = ({title, desc, value, disabled, onChange}: {title: string; desc: string; value: boolean; disabled: boolean; onChange: (v: boolean) => void}) => {
  const T = useTheme();
  const fs = fontScale(T);
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12}}>
      <View style={{flex: 1, marginRight: 12}}>
        <Text style={{fontSize: fs(13), fontWeight: '600', color: T.text}}>{title}</Text>
        <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}}>{desc}</Text>
      </View>
      <Switch value={value} disabled={disabled} onValueChange={onChange}
        accessibilityRole="switch" accessibilityLabel={title} accessibilityState={{checked: value, disabled}} />
    </View>
  );
};

export const CloudActivity = ({cloud}: {cloud: ReturnType<typeof useCloud>}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const busy = cloud.phase !== 'idle';
  return (
    <>
      {busy && (
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6}}>
          <ActivityIndicator size="small" color={T.accent} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          <Text style={{fontSize: fs(11), color: T.accent, flexShrink: 1}} accessibilityLiveRegion="polite">
            {cloudPhaseText(cloud.phase, t)}{cloud.progress > 0 && cloud.progress < 1 ? ` ${fmtPercent(cloud.progress, 0)}` : ''}
          </Text>
        </View>
      )}
      {cloud.lastError ? (
        <Text accessibilityLiveRegion="polite" style={{fontSize: fs(11), color: T.danger, marginTop: 6}}>{t('network.cloudError', {error: cloudStatusErrorText(cloud, t)})}</Text>
      ) : null}
    </>
  );
};

export const NotifyLevelButton = ({friend, fullCount}: {friend: Friend; fullCount: number}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const level = friendNotifyLevel(friend);
  const levelLabel = t(NOTIFY_KEY[level]);
  return (
    <TouchableOpacity onPress={() => NetworkManager.setFriendNotifyLevel(friend.peerId, nextNotifyLevel(level, fullCount)).catch(reportSaveError)} activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${levelLabel}, ${friend.displayName}`}
      accessibilityValue={{text: levelLabel}}
      style={{padding: 10}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
      <Text style={{color: level === 'full' ? T.accent : T.dim, fontSize: fs(15), opacity: level === 'off' ? 0.45 : 1}} accessibilityElementsHidden importantForAccessibility="no">{NOTIFY_GLYPH[level]}</Text>
    </TouchableOpacity>
  );
};

const ROW_HIT = {top: 8, bottom: 8, left: 8, right: 8};

export const PeerRow = ({friend: f, online, status, a11y, order, fullNotifyCount, onMirror, onRemove}: {
  friend: Friend; online: boolean; status: React.ReactNode; a11y: string; order?: {index: number; count: number}; fullNotifyCount: number;
  onMirror: (f: Friend) => void; onRemove: (f: Friend) => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const live = f.status === 'accepted' && online;
  const accepted = isAcceptedFriend(f);
  const moves: {dir: -1 | 1; atEnd: boolean; glyph: string; label: string}[] = order && order.count > 1 ? [
    {dir: -1, atEnd: order.index === 0, glyph: '▲', label: t('members.moveUp')},
    {dir: 1, atEnd: order.index === order.count - 1, glyph: '▼', label: t('members.moveDown')},
  ] : [];
  return (
    <View style={{flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border}}>
      <View style={{width: 8, height: 8, borderRadius: 4, marginRight: 10, marginTop: 5, backgroundColor: live ? ONLINE_COLOR : T.muted}} importantForAccessibility="no" accessibilityElementsHidden />
      <View style={{flex: 1, marginRight: 8}} accessible accessibilityRole="text" accessibilityLabel={`${f.displayName}. ${a11y}`}>
        <Text style={{fontSize: fs(14), fontWeight: '600', color: live || f.status !== 'accepted' ? T.text : T.muted}} numberOfLines={1} accessibilityElementsHidden importantForAccessibility="no">{f.displayName}</Text>
        <View accessibilityElementsHidden importantForAccessibility="no">{status}</View>
      </View>
      {moves.map(({dir, atEnd, glyph, label}) => (
        <TouchableOpacity key={glyph} onPress={() => { if (!atEnd) NetworkManager.moveFriend(f.peerId, dir).catch(reportSaveError); }}
          activeOpacity={0.7} accessibilityRole="button" accessibilityState={{disabled: atEnd}}
          accessibilityLabel={`${label}, ${f.displayName}`}
          style={{padding: 10, opacity: atEnd ? 0.3 : 1}} hitSlop={{top: 8, bottom: 8, left: 2, right: 2}}>
          <Text style={{color: T.dim, fontSize: fs(13)}} accessibilityElementsHidden importantForAccessibility="no">{glyph}</Text>
        </TouchableOpacity>
      ))}
      {accepted && (
        <TouchableOpacity onPress={() => onMirror(f)} activeOpacity={0.7} accessibilityRole="button"
          accessibilityLabel={t('network.viewSharedTitle', {name: f.displayName})} style={{padding: 10}} hitSlop={ROW_HIT}>
          <Text style={{color: T.dim, fontSize: fs(16)}} accessibilityElementsHidden importantForAccessibility="no">⋯</Text>
        </TouchableOpacity>
      )}
      {accepted && <NotifyLevelButton friend={f} fullCount={fullNotifyCount} />}
      <TouchableOpacity onPress={() => onRemove(f)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.removeItem', {name: f.displayName})} style={{padding: 10}} hitSlop={ROW_HIT}>
        <Text style={{color: T.dim, fontSize: fs(16)}} accessibilityElementsHidden importantForAccessibility="no">✕</Text>
      </TouchableOpacity>
    </View>
  );
};

export const PairingBox = ({kind, code, expiresAt, value, onChange, onEnter, onGenerate, onCopy, copied, busy}: {
  kind: PairKind; code: string | null; expiresAt: number | null; value: string; onChange: (v: string) => void;
  onEnter: () => void; onGenerate: () => void; onCopy: () => void; copied: boolean; busy: boolean;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const device = kind === 'device';
  return (
    <>
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onEnter}
        returnKeyType="go"
        placeholder={device ? t('network.deviceCodePlaceholder') : t('network.enterCodePlaceholder')}
        placeholderTextColor={T.muted}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!busy}
        style={[netStyles(T).input, {marginBottom: 12}]}
        accessibilityLabel={device ? t('network.deviceCode') : t('network.enterTheirCode')}
        accessibilityHint={t('network.enterCodeHint')}
      />
      {code ? (
        <TouchableOpacity
          onPress={onCopy}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.labelValue', {label: t('network.yourCode'), value: code})}
          accessibilityHint={t('network.tapToCopy')}
          style={{backgroundColor: T.bg, borderColor: T.accent, borderWidth: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center'}}>
          <Text style={{fontSize: fs(device ? 17 : 20), fontWeight: '700', letterSpacing: 2, color: T.text}}>{code}</Text>
          <Text style={{fontSize: fs(11), color: T.dim, marginTop: 4}}>
            {copied ? t('network.codeCopied') : `${t('network.tapToCopy')} · ${t('network.expiresIn', {time: fmtCountdown(expiresAt)})}`}
          </Text>
        </TouchableOpacity>
      ) : (
        <PrimaryButton label={t('network.generateCode')} onPress={onGenerate} disabled={busy} fontSize={14} />
      )}
    </>
  );
};
