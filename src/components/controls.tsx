import React, {useState} from 'react';
import {View, TouchableOpacity, Platform, Alert} from 'react-native';
import type {StyleProp, TextInputProps, TextStyle, ViewStyle} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {TFunction} from 'i18next';
import {Text, TextInput} from './AppText';
import {ToggleSwitch} from './ToggleSwitch';
import {profileHeading} from './headings';
import {tagFromInput, withTag} from '../utils';
import {saveAvatarFromUrl} from '../utils/mediaUtils';
import {errorMessage} from '../utils/log';
import {Fonts, fontScale, initialOn} from '../theme';
import type {ThemeColors} from '../theme';
import {useTheme} from '../themeContext';

export const sectionLabel = (T: ThemeColors, extra?: TextStyle): TextStyle => profileHeading(fontScale(T), T.dim, extra);

export const tileTitle = (T: ThemeColors): TextStyle =>
  ({fontFamily: Fonts.display, fontSize: fontScale(T)(22), fontWeight: '600', fontStyle: 'italic', color: T.text, flex: 1, marginRight: 8});

type BtnVariant = 'primary' | 'ghost' | 'danger' | 'solid' | 'info';

export const Btn = ({children, onPress, variant = 'primary', disabled = false, style, instant = false}: {
  children?: React.ReactNode; onPress?: () => void; variant?: BtnVariant; disabled?: boolean; style?: StyleProp<ViewStyle>; instant?: boolean;
}) => {
  const T = useTheme();
  const variants: Record<BtnVariant, {bg: string; color: string; border: string}> = {primary: {bg: T.accentBg, color: T.accent, border: `${T.accent}40`}, ghost: {bg: 'transparent', color: T.dim, border: T.border}, danger: {bg: T.dangerBg, color: T.danger, border: `${T.danger}40`}, solid: {bg: T.accent, color: initialOn(T.accent), border: T.accent}, info: {bg: T.infoBg, color: T.info, border: `${T.info}40`}};
  const v = variants[variant];
  const useInstant = instant && Platform.OS === 'ios';
  return (<TouchableOpacity onPress={useInstant ? undefined : onPress} onPressIn={useInstant ? onPress : undefined} disabled={disabled} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{disabled}} hitSlop={{top: 6, bottom: 6}} style={[{paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: v.bg, borderColor: v.border, opacity: disabled ? 0.5 : 1}, style]}><Text style={{fontSize: fontScale(T)(14), fontWeight: '500', color: v.color}}>{children}</Text></TouchableOpacity>);
};

export const Field = ({label, value, onChange, placeholder, multiline = false, numberOfLines = 4, readOnly = false}: {
  label?: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; numberOfLines?: number; readOnly?: boolean;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  return (
  <View style={{marginBottom: 14}}>
    {label && <Text style={sectionLabel(T, {marginBottom: 5})}>{label}</Text>}
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={T.muted} multiline={multiline} numberOfLines={multiline ? numberOfLines : 1}
      editable={!readOnly} accessibilityLabel={label || placeholder}
      style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(14), minHeight: multiline ? 100 : undefined, textAlignVertical: multiline ? 'top' : 'center'}} />
  </View>
  );
};

export const SectionDivider = ({label, color, style}: {label: string; color: string; style?: StyleProp<ViewStyle>}) => {
  const T = useTheme();
  const fs = fontScale(T);
  return (
  <View style={[{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 12}, style]}>
    <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: color}} />
    <Text accessibilityRole="header" style={{fontSize: fs(11), letterSpacing: 1, textTransform: 'uppercase', color, fontWeight: '700'}}>{label}</Text>
    <View style={{flex: 1, height: 1, backgroundColor: T.border}} />
  </View>
  );
};

export const confirmRemoveImage = (t: TFunction, title: string, onRemove: () => void): void =>
  Alert.alert(title, t('modal.removeImageMsg'), [
    {text: t('common.cancel'), style: 'cancel'},
    {text: t('common.remove'), style: 'destructive', onPress: onRemove},
  ]);

export const SectionHead = ({label, desc, descColor, style}: {label: string; desc?: string; descColor?: string; style?: StyleProp<ViewStyle>}) => {
  const T = useTheme();
  const fs = fontScale(T);
  return (
    <View style={style}>
      <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 4})}>{label}</Text>
      {desc ? <Text style={{fontSize: fs(11), color: descColor || T.muted, lineHeight: fs(15)}}>{desc}</Text> : null}
    </View>
  );
};

export const ToggleRow = ({label, desc, descColor, value, onToggle, disabled, style}: {
  label: string; desc: string; descColor?: string; value: boolean; onToggle: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) => (
  <View style={[{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, style]}>
    <SectionHead label={label} desc={desc} descColor={descColor} style={{flex: 1}} />
    <ToggleSwitch value={value} onToggle={onToggle} label={label} disabled={disabled} style={{marginLeft: 12}} />
  </View>
);

export const AddRow = ({value, onChange, onAdd, placeholder, label, disabled, inputProps, style}: {
  value: string; onChange: (v: string) => void; onAdd: () => void; placeholder: string; label?: string; disabled?: boolean; inputProps?: TextInputProps; style?: StyleProp<ViewStyle>;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <View style={[{flexDirection: 'row', gap: 8, alignItems: 'center'}, style]}>
      <TextInput value={value} onChangeText={onChange} accessibilityLabel={label || placeholder} placeholder={placeholder} placeholderTextColor={T.muted} {...inputProps}
        style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13)}} onSubmitEditing={onAdd} returnKeyType="done" />
      <Btn disabled={disabled} onPress={onAdd} style={{paddingHorizontal: 12, paddingVertical: 9}}>{t('common.add')}</Btn>
    </View>
  );
};

const TAG_INPUT: TextInputProps = {autoCapitalize: 'none', autoCorrect: false};

export const TagEditor = ({tags, onChange, input, setInput, placeholder, style}: {
  tags: string[]; onChange: (tags: string[]) => void; input: string; setInput: (v: string) => void; placeholder: string; style?: StyleProp<ViewStyle>;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const add = () => {
    const next = tagFromInput(input);
    if (!next) return;
    onChange(withTag(tags, next));
    setInput('');
  };
  return (
    <>
      {tags.length > 0 && (
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8}}>
          {tags.map(tag => (
            <TouchableOpacity key={tag} onPress={() => onChange(tags.filter(x => x !== tag))} activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel={t('common.removeItem', {name: tag})}
              hitSlop={{top: 6, bottom: 6}} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: `${T.info}18`, borderWidth: 1, borderColor: `${T.info}40`}}>
              <Text style={{fontSize: fs(12), color: T.info}}>{tag}</Text>
              <Text style={{fontSize: fs(10), color: T.danger}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✕</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <AddRow value={input} onChange={setInput} onAdd={add} placeholder={placeholder} inputProps={TAG_INPUT} style={style} />
    </>
  );
};

const URL_INPUT: TextInputProps = {autoCapitalize: 'none', autoCorrect: false, keyboardType: 'url'};

export const AvatarLink = ({ownerId, onLinked, toggleStyle, rowStyle}: {
  ownerId: string; onLinked: (uri: string) => void; toggleStyle?: StyleProp<ViewStyle>; rowStyle?: StyleProp<ViewStyle>;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [linking, setLinking] = useState(false);
  const apply = async () => {
    const url = input.trim();
    if (!/^https?:\/\//i.test(url)) { Alert.alert(t('modal.pfpFailed')); return; }
    setLinking(true);
    try {
      const uri = await saveAvatarFromUrl(ownerId, url);
      if (uri) { onLinked(uri); setOpen(false); setInput(''); }
      else Alert.alert(t('modal.pfpFailed'));
    } catch (e) {
      Alert.alert(t('modal.pfpFailed'), errorMessage(e));
    } finally {
      setLinking(false);
    }
  };
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(!open)} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{expanded: open}} accessibilityLabel={t('modal.linkPfp')}
        hitSlop={{top: 6, bottom: 8, left: 8, right: 8}} style={toggleStyle}>
        <Text style={{fontSize: fs(11), color: T.accent}}>🔗 {t('modal.linkPfp')}</Text>
      </TouchableOpacity>
      {open && <AddRow value={input} onChange={setInput} onAdd={apply} disabled={linking || !input.trim()} placeholder="https://…" label={t('modal.linkPfp')} inputProps={URL_INPUT} style={rowStyle} />}
    </>
  );
};

export const PasswordSection = ({label, on, setOn, value, onChange, placeholder, addLabel, removeLabel, desc, style}: {
  label: string; on: boolean; setOn: (on: boolean) => void; value: string; onChange: (v: string) => void; placeholder: string; addLabel: string; removeLabel: string; desc?: string; style?: StyleProp<ViewStyle>;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <View style={style}>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
        <Text accessibilityRole="header" style={sectionLabel(T)}>{label}</Text>
        <TouchableOpacity onPress={() => setOn(!on)} accessibilityRole="button" accessibilityLabel={on ? removeLabel : addLabel} hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
          <Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>{on ? t('common.remove') : t('common.add')}</Text>
        </TouchableOpacity>
      </View>
      {on && (
        <TextInput value={value} onChangeText={onChange} accessibilityLabel={placeholder} placeholder={placeholder} placeholderTextColor={T.muted} secureTextEntry
          style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(14)}} />
      )}
      {desc ? <Text style={{fontSize: fs(11), color: T.muted, lineHeight: fs(15), marginTop: 6}}>{desc}</Text> : null}
    </View>
  );
};

export const CancelConfirmRow = ({label, onConfirm, onCancel, disabled = false, style}: {
  label: string; onConfirm: () => void; onCancel: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <View style={[{flexDirection: 'row', gap: 10}, style]}>
      <TouchableOpacity onPress={onCancel} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
        hitSlop={{top: 6, bottom: 6}} style={{flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
        <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onConfirm} disabled={disabled} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{disabled}} accessibilityLabel={label}
        hitSlop={{top: 6, bottom: 6}} style={{flex: 2, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, opacity: disabled ? 0.4 : 1}}>
        <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
};

export const CheckBox = ({on, color, tickColor}: {on: boolean; color?: string; tickColor?: string}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const c = color || T.accent;
  return (
    <View style={{width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: on ? c : T.border, backgroundColor: on ? c : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
      {on ? <Text style={{fontSize: fs(11), color: tickColor || T.bg, fontWeight: '700'}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</Text> : null}
    </View>
  );
};
