// src/i18n/i18n.ts
import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import * as RNLocalize from 'react-native-localize';

import en from './en.json';
import es from './es.json';
import fr from './fr.json';
import de from './de.json';

export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

const getDeviceLanguage = (): SupportedLanguage => {
  const locales = RNLocalize.getLocales();
  if (locales.length > 0) {
    const code = locales[0].languageCode;
    if (SUPPORTED_LANGUAGES.includes(code as SupportedLanguage)) {
      return code as SupportedLanguage;
    }
  }
  return 'en';
};

i18n
  .use(initReactI18next)
  .init({
    resources: {en: {translation: en}, es: {translation: es}, fr: {translation: fr}, de: {translation: de}},
    lng: getDeviceLanguage(),
    fallbackLng: 'en',
    interpolation: {escapeValue: false},
    compatibilityJSON: 'v4',
  });

export const changeLanguage = (lang: SupportedLanguage) => {
  i18n.changeLanguage(lang);
};

export default i18n;
