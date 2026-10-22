import {useEffect, useMemo, useState} from 'react';
import {setAppTextFont} from '../components/AppText';
import {setTerminologyOverrides, setTierNameOverrides} from '../i18n/terminology';
import {BUILTIN_PALETTES, deriveTheme, fontFamilyForChoice} from '../theme';
import type {CustomPalette, ThemeColors} from '../theme';
import {fontChoiceOf} from '../utils';
import type {AppSettings} from '../utils';

export const useAppTheme = (appSettings: AppSettings, palettes: CustomPalette[], activePaletteId: string): ThemeColors => {
  const [overridesTick, setOverridesTick] = useState(0);
  useEffect(() => { setTerminologyOverrides(appSettings.terminology); setOverridesTick(n => n + 1); }, [appSettings.terminology]);
  useEffect(() => { setTierNameOverrides(appSettings.tierNames); setOverridesTick(n => n + 1); }, [appSettings.tierNames]);
  useEffect(() => {
    const choice = fontChoiceOf(appSettings);
    setAppTextFont(fontFamilyForChoice(choice));
    setOverridesTick(n => n + 1);
  }, [appSettings.fontChoice, appSettings.useDyslexicFont]);

  const paletteTheme = useMemo(() => {
    const allPals = [...BUILTIN_PALETTES, ...palettes];
    const pal = allPals.find(p => p.id === activePaletteId) || BUILTIN_PALETTES[0];
    return {...deriveTheme(pal.bg, pal.accent, pal.text, pal.mid), textScale: appSettings.textScale || 1};
  }, [activePaletteId, palettes, appSettings.textScale]);
  return useMemo(() => ({...paletteTheme, overridesTick}), [paletteTheme, overridesTick]);
};
