import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import * as RNLocalize from 'react-native-localize';

import en from './en.json';
import es from './es.json';
import fr from './fr.json';
import de from './de.json';
import pt from './pt.json';
import fi from './fi.json';
import nb from './nb.json';
import zh from './zh.json';
import ja from './ja.json';
import ru from './ru.json';
import uk from './uk.json';

export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'pt', 'fi', 'nb', 'zh', 'ja', 'ru', 'uk'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

const getDeviceLanguage = (): SupportedLanguage => {
  const locales = RNLocalize.getLocales();
  if (locales.length > 0) {
    const code = locales[0].languageCode;
    if (SUPPORTED_LANGUAGES.includes(code as SupportedLanguage)) {
      return code as SupportedLanguage;
    }
    if (code === 'no' || code === 'nn') return 'nb';
  }
  return 'en';
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {translation: en},
      es: {translation: es},
      fr: {translation: fr},
      de: {translation: de},
      pt: {translation: pt},
      fi: {translation: fi},
      nb: {translation: nb},
      zh: {translation: zh},
      ja: {translation: ja},
      ru: {translation: ru},
      uk: {translation: uk},
    },
    lng: getDeviceLanguage(),
    fallbackLng: 'en',
    interpolation: {escapeValue: false},
    compatibilityJSON: 'v4',
  });

export const changeLanguage = (lang: SupportedLanguage) => {
  i18n.changeLanguage(lang);
};

export default i18n;
