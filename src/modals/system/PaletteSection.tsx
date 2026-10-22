import React, {useState} from 'react';
import {View, TouchableOpacity, Alert} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {Text, TextInput} from '../../components/AppText';
import {useTranslation} from 'react-i18next';
import {BUILTIN_PALETTES, DARK_PALETTE, LIGHT_PALETTE, MAX_CUSTOM_PALETTES, fontScale, ensureReadable, textFloor} from '../../theme';
import type {CustomPalette} from '../../theme';
import {useTheme} from '../../themeContext';
import {uid, upsertById, hexOr, isValidHex, normalizeHex} from '../../utils';
import {ColorPickerModal} from '../../components/ColorPickerModal';
import {reportSaveError} from '../../utils/saveError';
import {sectionLabel} from '../../components/controls';

const HexField = ({label, value, onChange}: {label: string; value: string; onChange: (v: string) => void}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const [open, setOpen] = useState(false);
  const valid = isValidHex(normalizeHex(value));
  return (
    <View style={{flex: 1}}>
      <Text style={sectionLabel(T, {fontSize: fs(9), marginBottom: 4})}>{label}</Text>
      <TouchableOpacity onPress={() => setOpen(true)} activeOpacity={0.7}
        accessibilityRole="button" accessibilityLabel={label} accessibilityValue={{text: value}}
        hitSlop={{top: 15, bottom: 15}} style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
        <View style={{width: 20, height: 20, borderRadius: 4, backgroundColor: valid ? normalizeHex(value) : '#333', borderWidth: 1, borderColor: T.border}} />
        <View style={{flex: 1, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5}}>
          <Text style={{fontSize: fs(12), fontFamily: 'monospace', color: T.text}} numberOfLines={1}>{value}</Text>
        </View>
      </TouchableOpacity>
      <ColorPickerModal visible={open} title={label} value={value}
        onSave={hex => { onChange(hex); setOpen(false); }}
        onClose={() => setOpen(false)} />
    </View>
  );
};

const Swatches = ({colors, size}: {colors: string[]; size: number}) => (
  <View style={{flexDirection: 'row', gap: 3}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {colors.map((c, i) => (<View key={i} style={{width: size, height: size, borderRadius: 4, backgroundColor: c, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)'}} />))}
  </View>
);

export const PaletteSection = ({palettes, activePaletteId, onSavePalettes, onSelectPalette, style}: {
  palettes: CustomPalette[]; activePaletteId: string; onSavePalettes: (p: CustomPalette[]) => Promise<void>; onSelectPalette: (id: string) => Promise<void>; style?: StyleProp<ViewStyle>;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  const [themesOpen, setThemesOpen] = useState(false);
  const [editPalette, setEditPalette] = useState<CustomPalette | null>(null);
  const [paletteName, setPaletteName] = useState('');
  const [palBg, setPalBg] = useState(''); const [palAccent, setPalAccent] = useState('');
  const [palText, setPalText] = useState(''); const [palMid, setPalMid] = useState('');

  const allPalettes: CustomPalette[] = [...BUILTIN_PALETTES, ...palettes];
  const canAdd = palettes.length < MAX_CUSTOM_PALETTES;
  const activePalette = allPalettes.find(p => p.id === activePaletteId) || BUILTIN_PALETTES[0];
  const paletteLabel = (p: {id: string; name: string}): string =>
    p.id === DARK_PALETTE.id ? t('modal.paletteObsidian') : p.id === LIGHT_PALETTE.id ? t('modal.paletteSteel') : p.name;

  const startEditPalette = (p: CustomPalette) => {
    setEditPalette(p); setPaletteName(p.name); setPalBg(p.bg); setPalAccent(p.accent); setPalText(p.text); setPalMid(p.mid);
  };

  const startNewPalette = () => startEditPalette({...DARK_PALETTE, id: uid(), name: ''});

  const savePalette = () => {
    if (!editPalette || !paletteName.trim()) return;
    const updated: CustomPalette = {id: editPalette.id, name: paletteName.trim(), bg: hexOr(palBg, editPalette.bg), accent: hexOr(palAccent, editPalette.accent), text: hexOr(palText, editPalette.text), mid: hexOr(palMid, editPalette.mid)};
    onSavePalettes(upsertById(palettes, updated)).then(() => setEditPalette(null), reportSaveError);
  };

  const deletePalette = (id: string) => {
    Alert.alert(t('common.delete'), t('modal.deletePaletteMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => {
        onSavePalettes(palettes.filter(p => p.id !== id))
          .then(() => (activePaletteId === id ? onSelectPalette(DARK_PALETTE.id) : undefined))
          .catch(reportSaveError);
      }},
    ]);
  };

  const preview = [palBg, palAccent, palText, palMid].map(normalizeHex);
  const [pBg, pAccent, pText, pMid] = preview;

  return (
    <View style={style}>
      <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{t('modal.palette')}</Text>
      <Text style={{fontSize: fs(11), color: T.muted, lineHeight: fs(15), marginBottom: 10}}>{t('modal.paletteDesc')}</Text>
      <TouchableOpacity onPress={() => setThemesOpen(o => !o)} activeOpacity={0.7}
        accessibilityRole="button" accessibilityState={{expanded: themesOpen}} accessibilityLabel={t('modal.palette')} accessibilityValue={{text: paletteLabel(activePalette)}}
        hitSlop={{top: 6, bottom: 6}} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: themesOpen ? `${T.accent}60` : T.border, marginBottom: themesOpen ? 8 : 0}}>
        <Swatches colors={[activePalette.bg, activePalette.accent, activePalette.text, activePalette.mid]} size={14} />
        <Text style={{flex: 1, fontSize: fs(14), color: T.text}} numberOfLines={1}>{paletteLabel(activePalette)}</Text>
        <Text style={{fontSize: fs(12), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{themesOpen ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {themesOpen && (<>
        <View style={{gap: 6, marginBottom: 10}}>
          {allPalettes.map(p => {
            const isActive = activePaletteId === p.id;
            const isBuiltIn = BUILTIN_PALETTES.some(b => b.id === p.id);
            return (
              <View key={p.id}
                style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1,
                  backgroundColor: isActive ? `${p.accent}15` : T.surface, borderColor: isActive ? `${p.accent}50` : T.border}}>
                <TouchableOpacity onPress={() => { onSelectPalette(p.id).catch(reportSaveError); }} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityState={{selected: isActive}} accessibilityLabel={paletteLabel(p)}
                  hitSlop={{top: 14, bottom: 14}} style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10}}>
                  <Swatches colors={[p.bg, p.accent, p.text, p.mid]} size={16} />
                  <Text style={{flex: 1, fontSize: fs(13), color: isActive ? p.accent : T.text, fontWeight: isActive ? '600' : '400'}}>{paletteLabel(p)}</Text>
                  {isActive && <Text style={{fontSize: fs(12), color: p.accent}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</Text>}
                </TouchableOpacity>
                {!isBuiltIn && (
                  <View style={{flexDirection: 'row', gap: 8}}>
                    <TouchableOpacity onPress={() => startEditPalette(p)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.editItem', {name: p.name})} hitSlop={{top: 10, bottom: 10, left: 4, right: 4}} style={{paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}><Text style={{fontSize: fs(11), fontWeight: '500', color: T.accent}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('common.edit')}</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => deletePalette(p.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.deleteItem', {name: p.name})} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}><Text style={{fontSize: fs(12), color: T.danger}} accessibilityElementsHidden importantForAccessibility="no">✕</Text></TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>
        {canAdd && !editPalette && (
          <TouchableOpacity onPress={startNewPalette} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('modal.newPalette')} hitSlop={{top: 6, bottom: 6}} style={{alignItems: 'center', paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: T.border}}>
            <Text style={{fontSize: fs(12), color: T.dim}}>+ {t('modal.newPalette')}</Text>
          </TouchableOpacity>
        )}
        {editPalette && (
          <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12, marginTop: 6}}>
            <TextInput value={paletteName} onChangeText={setPaletteName} accessibilityLabel={t('modal.paletteName')} placeholder={t('modal.paletteName')} placeholderTextColor={T.muted}
              style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), marginBottom: 10}} />
            <View style={{flexDirection: 'row', gap: 8, marginBottom: 10}}>
              <HexField label={t('modal.palBg')} value={palBg} onChange={setPalBg} />
              <HexField label={t('modal.palAccent')} value={palAccent} onChange={setPalAccent} />
            </View>
            <View style={{flexDirection: 'row', gap: 8, marginBottom: 10}}>
              <HexField label={t('modal.palText')} value={palText} onChange={setPalText} />
              <HexField label={t('modal.palMid')} value={palMid} onChange={setPalMid} />
            </View>
            {preview.every(isValidHex) && (
              <View style={{flexDirection: 'row', gap: 3, marginBottom: 10, padding: 8, borderRadius: 8, backgroundColor: pBg}}>
                <View style={{flex: 1, height: 24, borderRadius: 4, backgroundColor: pAccent, alignItems: 'center', justifyContent: 'center'}}>
                  <Text style={{fontSize: fs(10), fontWeight: '600', color: ensureReadable(pBg, pAccent, 4.5)}}>{t('modal.palPreviewAccent')}</Text>
                </View>
                <View style={{flex: 1, height: 24, borderRadius: 4, alignItems: 'center', justifyContent: 'center'}}>
                  <Text style={{fontSize: fs(10), fontWeight: '600', color: ensureReadable(pText, pBg, textFloor(pBg))}}>{t('modal.palPreviewText')}</Text>
                </View>
                <View style={{flex: 1, height: 24, borderRadius: 4, backgroundColor: pMid, alignItems: 'center', justifyContent: 'center'}}>
                  <Text style={{fontSize: fs(10), fontWeight: '600', color: ensureReadable(pBg, pMid, 4.5)}}>{t('modal.palPreviewMid')}</Text>
                </View>
              </View>
            )}
            <View style={{flexDirection: 'row', gap: 8}}>
              <TouchableOpacity onPress={() => setEditPalette(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')} hitSlop={{top: 7, bottom: 7}} style={{flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
                <Text style={{fontSize: fs(12), color: T.dim}}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={savePalette} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.save')} hitSlop={{top: 7, bottom: 7}} style={{flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
                <Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <Text style={{fontSize: fs(10), color: T.muted, marginTop: 6}}>{t('modal.paletteSlots', {used: palettes.length, max: MAX_CUSTOM_PALETTES})}</Text>
      </>)}
    </View>
  );
};
