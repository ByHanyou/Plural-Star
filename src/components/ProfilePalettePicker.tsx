import React, {useState} from 'react';
import {View, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from './AppText';
import {PaletteColorField} from './PaletteColorField';
import {BUILTIN_PALETTES, fontScale, normalizeProfilePalette, sameProfilePalette, profileWindowTheme} from '../theme';
import type {CustomPalette, ProfilePalette, ThemeColors} from '../theme';
import {useAppStore} from '../store/appStore';

interface Props {
  T: ThemeColors;
  value?: ProfilePalette;
  onChange: (palette: ProfilePalette | undefined) => void;
  legacyBackground?: boolean;
}

export const ProfilePalettePicker = ({T, value, onChange, legacyBackground = false}: Props) => {
  const {t} = useTranslation();
  const fs = fontScale(T);
  const saved = useAppStore((s: {palettes: CustomPalette[]}) => s.palettes);
  const [open, setOpen] = useState(false);
  const palette = normalizeProfilePalette(value);
  const choices = [...BUILTIN_PALETTES, ...saved].filter(p => normalizeProfilePalette(p));
  const label = (p: typeof choices[number]) => p.id === '__dark__'
    ? t('modal.paletteObsidian') : p.id === '__light__' ? t('modal.paletteSteel') : p.name;
  const matched = palette ? choices.find(p => sameProfilePalette(p, palette)) : undefined;
  const selectedLabel = matched ? label(matched) : palette ? t('profilePalette.custom')
    : legacyBackground ? t('profilePalette.colorBackground') : t('profilePalette.appTheme');
  const preview = profileWindowTheme(T, palette);
  const swatches = (p: ProfilePalette) => (
    <View style={{flexDirection: 'row', gap: 3}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[p.bg, p.accent, p.text, p.mid].map((color, i) => (
        <View key={i} style={{width: 16, height: 16, borderRadius: 4, backgroundColor: color, borderWidth: 1, borderColor: T.border}} />
      ))}
    </View>
  );

  return (
    <View style={{marginBottom: 14}}>
      <Text accessibilityRole="header" style={{fontSize: fs(12), fontWeight: '600', color: T.text, marginBottom: 6}}>{t('profilePalette.title')}</Text>
      <Text style={{fontSize: fs(11), color: T.muted, marginBottom: 10}}>{t('profilePalette.hint')}</Text>
      <TouchableOpacity onPress={() => setOpen(v => !v)} accessibilityRole="button"
        accessibilityLabel={t('profilePalette.title')} accessibilityValue={{text: selectedLabel}} accessibilityState={{expanded: open}}
        style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface}}>
        {palette ? swatches(palette) : null}
        <Text style={{flex: 1, fontSize: fs(13), color: T.text}}>{selectedLabel}</Text>
        <Text style={{color: T.dim}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open ? (
        <View style={{gap: 8, marginTop: 8}}>
          {[undefined, ...choices].map((p, i) => {
            const selected = p ? !!palette && sameProfilePalette(palette, p) : !palette && !legacyBackground;
            return (
              <TouchableOpacity key={p?.id || `app-${i}`} onPress={() => {onChange(normalizeProfilePalette(p)); setOpen(false);}}
                accessibilityRole="button" accessibilityLabel={p ? label(p) : t('profilePalette.appTheme')} accessibilityState={{selected}}
                style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: selected ? T.accent : T.border, backgroundColor: T.surface}}>
                {p ? swatches(p) : null}
                <Text style={{flex: 1, fontSize: fs(13), color: T.text}}>{p ? label(p) : t('profilePalette.appTheme')}</Text>
                {selected ? <Text style={{color: T.accent}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</Text> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      {palette ? (
        <>
          <View style={{flexDirection: 'row', gap: 12, marginTop: 14}}>
            <PaletteColorField label={t('modal.palBg')} value={palette.bg} onChange={bg => onChange({...palette, bg})} T={T} />
            <PaletteColorField label={t('modal.palAccent')} value={palette.accent} onChange={accent => onChange({...palette, accent})} T={T} />
          </View>
          <View style={{flexDirection: 'row', gap: 12, marginTop: 14}}>
            <PaletteColorField label={t('modal.palText')} value={palette.text} onChange={text => onChange({...palette, text})} T={T} />
            <PaletteColorField label={t('modal.palMid')} value={palette.mid} onChange={mid => onChange({...palette, mid})} T={T} />
          </View>
          <View style={{marginTop: 14, padding: 14, backgroundColor: preview.bg, borderRadius: 10, borderWidth: 1, borderColor: preview.border}}>
            <Text style={{fontSize: fs(14), color: preview.accent, fontWeight: '600'}}>{t('profilePalette.preview')}</Text>
            <Text style={{fontSize: fs(12), color: preview.text, marginTop: 6}}>{t('profilePalette.previewText')}</Text>
          </View>
        </>
      ) : null}
    </View>
  );
};
