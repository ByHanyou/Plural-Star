import React from 'react';
import {View, TouchableOpacity, ActivityIndicator, StyleSheet} from 'react-native';
import type {Insets, TextStyle, ViewStyle} from 'react-native';
import {Text} from '../../components/AppText';
import {ToggleSwitch} from '../../components/ToggleSwitch';
import {fontScale, ThemeColors} from '../../theme';
import {useTheme} from '../../themeContext';
import {Member} from '../../utils';
import {sectionLabel} from '../../components/controls';

export const share = StyleSheet.create({
  content: {padding: 16, paddingBottom: 40},
  para: {fontSize: 13, lineHeight: 19, marginBottom: 14},
  hint: {fontSize: 11, marginBottom: 4, lineHeight: 16},
});

export const HIDDEN = {display: 'none' as const};

export const categoryLabels = (t: (k: string) => string, singlet: boolean) => ({
  system: singlet ? t('share.nameGoals') : t('share.systemNameDesc'),
  members: singlet ? t('tabs.profile') : t('share.memberProfiles'),
  front: singlet ? t('history.statusHistory') : t('share.frontHistory'),
});

export type CategoryKey = 'system' | 'members' | 'avatars' | 'banners' | 'frontHistory' | 'journal' | 'groups' | 'chat' | 'moods' | 'palettes' | 'settings' | 'customFields' | 'noteboards' | 'polls' | 'journalTemplates' | 'relationships';

export const sharedCategoryRows = (t: (k: string) => string, singlet: boolean): [CategoryKey, string][] => {
  const labels = categoryLabels(t, singlet);
  return [
    ['system', labels.system],
    ['members', labels.members],
    ['avatars', t('share.profilePictures')],
    ['banners', t('share.banners')],
    ['frontHistory', labels.front],
    ['journal', t('share.journalEntries')],
    ['groups', t('share.memberGroups')],
    ['chat', t('share.chatData')],
    ['moods', t('share.customMoodsLabel')],
    ['palettes', t('share.themePalettes')],
    ['settings', t('share.appSettings')],
    ['customFields', t('customFields.title')],
    ['noteboards', t('mailbox.title')],
    ['polls', t('polls.title')],
    ['journalTemplates', t('journal.templatesTab')],
    ['relationships', t('systemMap.title')],
  ];
};

export const Para = ({text, color, style}: {text: string; color?: string; style?: TextStyle}) => {
  const T = useTheme();
  const fs = fontScale(T);
  return <Text style={[share.para, {fontSize: fs(13), lineHeight: fs(19), color: color || T.dim}, style]}>{text}</Text>;
};

export const Hint = ({text}: {text: string}) => {
  const T = useTheme();
  const fs = fontScale(T);
  return <Text style={[share.hint, {fontSize: fs(11), lineHeight: fs(16), color: T.muted}]}>{text}</Text>;
};

export const ChoiceBtn = ({label, selected, onPress, style, hitSlop}: {label: string; selected: boolean; onPress: () => void; style: ViewStyle; hitSlop: Insets}) => {
  const T = useTheme();
  const fs = fontScale(T);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      accessibilityRole="tab" accessibilityState={{selected}} accessibilityLabel={label}
      hitSlop={hitSlop} style={[{borderRadius: 7, borderWidth: 1, backgroundColor: selected ? T.accentBg : 'transparent', borderColor: selected ? `${T.accent}40` : T.border}, style]}>
      <Text style={{fontSize: fs(12), color: selected ? T.accent : T.dim, fontWeight: selected ? '600' : '400'}}>{label}</Text>
    </TouchableOpacity>
  );
};

export const Divider = ({label}: {label: string}) => {
  const T = useTheme();
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 18}}>
      <View style={{flex: 1, height: 1, backgroundColor: T.border}} />
      <Text accessibilityRole="header" style={sectionLabel(T, {color: T.muted})}>{label}</Text>
      <View style={{flex: 1, height: 1, backgroundColor: T.border}} />
    </View>
  );
};

export const SectionRow = ({label, sublabel, value, onToggle}: {label: string; sublabel?: string; value: boolean; onToggle: () => void}) => {
  const T = useTheme();
  const fs = fontScale(T);
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: T.border, paddingHorizontal: 14}}>
      <View style={{flex: 1}}>
        <Text style={{fontSize: fs(14), color: T.text, fontWeight: '500'}}>{label}</Text>
        {sublabel && <Text style={{fontSize: fs(11), color: T.muted, marginTop: 2}}>{sublabel}</Text>}
      </View>
      <ToggleSwitch value={value} onToggle={onToggle} label={label} />
    </View>
  );
};

export const PreviewTier = ({label, fronters, color}: {label: string; fronters: Member[]; color: string}) => {
  const T = useTheme();
  const fs = fontScale(T);
  if (fronters.length === 0) return null;
  return (
    <View style={{marginTop: 8}}>
      <Text accessibilityRole="header" style={sectionLabel(T, {color, marginBottom: 5})}>{label}</Text>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
        {fronters.map(m => (
          <View key={m.id} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, backgroundColor: `${m.color}18`, borderColor: `${m.color}30`}}>
            <View style={{width: 7, height: 7, borderRadius: 3.5, backgroundColor: m.color}} />
            <Text style={{fontSize: fs(13), color: T.text}}>{m.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

export type BtnVariant = 'accent' | 'info' | 'danger' | 'plain';

export const variantColors = (T: ThemeColors, variant: BtnVariant) => ({
  accent: {bg: T.accentBg, color: T.accent, border: `${T.accent}40`},
  info: {bg: T.infoBg, color: T.info, border: `${T.info}40`},
  danger: {bg: T.dangerBg, color: T.danger, border: `${T.danger}40`},
  plain: {bg: 'transparent', color: T.dim, border: T.border},
}[variant]);

export const WideBtn = ({label, onPress, variant = 'accent', disabled = false, a11y, fontSize = 14, style}: {
  label: string; onPress: () => void; variant?: BtnVariant; disabled?: boolean; a11y?: string; fontSize?: number; style?: ViewStyle;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const v = variantColors(T, variant);
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={a11y ?? label} accessibilityState={{disabled}}
      hitSlop={{top: 6, bottom: 6}} style={[{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: v.bg, borderColor: v.border, opacity: disabled ? 0.5 : 1}, style]}>
      <Text style={{fontSize: fs(fontSize), fontWeight: '500', color: v.color}}>{label}</Text>
    </TouchableOpacity>
  );
};

export const StatusBox = ({kind, text}: {kind: 'success' | 'error'; text: string}) => {
  const T = useTheme();
  const fs = fontScale(T);
  if (kind === 'error') {
    return (
      <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={{backgroundColor: T.dangerBg, borderWidth: 1, borderColor: `${T.danger}30`, borderRadius: 7, padding: 10, marginBottom: 12}}>
        <Text style={{fontSize: fs(13), color: T.danger}} accessibilityLabel={text}>⚠ {text}</Text>
      </View>
    );
  }
  return (
    <View accessibilityLiveRegion="polite" style={{backgroundColor: T.successBg, borderWidth: 1, borderColor: `${T.success}30`, borderRadius: 8, padding: 12, marginBottom: 12}}>
      <Text style={{fontSize: fs(13), color: T.success}} accessibilityLabel={text}>✓ {text}</Text>
    </View>
  );
};

export const DoneNote = ({text, style}: {text: string; style?: ViewStyle}) => {
  const T = useTheme();
  const fs = fontScale(T);
  return (
    <View accessibilityLiveRegion="polite" style={[{backgroundColor: T.successBg, borderWidth: 1, borderColor: `${T.success}30`, borderRadius: 8, padding: 12, alignItems: 'center'}, style]}>
      <Text style={{fontSize: fs(13), color: T.success, fontWeight: '500'}}>{text}</Text>
    </View>
  );
};

export const Busy = ({text, pad = 12}: {text: string; pad?: number}) => {
  const T = useTheme();
  const fs = fontScale(T);
  return (
    <View style={{alignItems: 'center', paddingVertical: pad}}>
      <ActivityIndicator color={T.accent} />
      <Text style={{fontSize: fs(12), color: T.dim, marginTop: 8}} numberOfLines={2}>{text}</Text>
    </View>
  );
};

export const PreviewHead = ({title, sub}: {title: string; sub: string}) => {
  const T = useTheme();
  const fs = fontScale(T);
  return (
    <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 14}}>
      <Text style={{fontSize: fs(16), fontWeight: '600', color: T.accent}}>{title}</Text>
      <Text style={{fontSize: fs(12), color: T.dim, marginTop: 2}}>{sub}</Text>
    </View>
  );
};

export const CategoryCard = ({title, top, children}: {title: string; top?: number; children: React.ReactNode}) => {
  const T = useTheme();
  return (
    <>
      <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8, marginTop: top})}>{title}</Text>
      <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 14}}>{children}</View>
    </>
  );
};

export const FormatButtons = ({options, fontSize}: {
  options: {label: string; a11y: string; variant: BtnVariant; onPress: () => void}[]; fontSize: number;
}) => (
  <View style={{flexDirection: 'row', gap: 8, marginBottom: 6}}>
    {options.map(o => (
      <WideBtn key={o.label} label={o.label} a11y={o.a11y} onPress={o.onPress} variant={o.variant} fontSize={fontSize} style={{flex: 1, paddingVertical: 10}} />
    ))}
  </View>
);
