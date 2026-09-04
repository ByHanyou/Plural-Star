import PluralRules from 'intl-pluralrules/plural-rules';
import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import * as RNLocalize from 'react-native-localize';
import {terminologyPostProcessor} from './terminology';

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
import it from './it.json';
import tr from './tr.json';
import vi from './vi.json';
import th from './th.json';
import ms from './ms.json';
import zhHant from './zhHant.json';
import nl from './nl.json';
import is from './is.json';
import hi from './hi.json';
import af from './af.json';
import ko from './ko.json';
import sv from './sv.json';
import pl from './pl.json';

const hasWorkingPluralRules = (): boolean => {
  const PR = (Intl as any).PluralRules;
  if (typeof PR !== 'function') return false;
  try {
    return new PR('pl').select(2) === 'few';
  } catch {
    return false;
  }
};
if (!hasWorkingPluralRules()) (Intl as any).PluralRules = PluralRules;

export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'nl', 'pt', 'fi', 'sv', 'nb', 'is', 'it', 'pl', 'tr', 'ms', 'vi', 'th', 'hi', 'af', 'zh', 'zhHant', 'ja', 'ko', 'ru', 'uk'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

const getDeviceLanguage = (): SupportedLanguage => {
  const locales = RNLocalize.getLocales();
  if (locales.length > 0) {
    const code = locales[0].languageCode;
    const script = locales[0].scriptCode;
    const region = locales[0].countryCode;
    if (code === 'zh') {
      if (script === 'Hant' || region === 'TW' || region === 'HK' || region === 'MO') return 'zhHant';
      return 'zh';
    }
    if (SUPPORTED_LANGUAGES.includes(code as SupportedLanguage)) {
      return code as SupportedLanguage;
    }
    if (code === 'no' || code === 'nn') return 'nb';
  }
  return 'en';
};

i18n
  .use(initReactI18next)
  .use(terminologyPostProcessor)
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
      zhHant: {translation: zhHant},
      ja: {translation: ja},
      ru: {translation: ru},
      uk: {translation: uk},
      it: {translation: it},
      tr: {translation: tr},
      vi: {translation: vi},
      th: {translation: th},
      ms: {translation: ms},
      nl: {translation: nl},
      is: {translation: is},
      hi: {translation: hi},
      af: {translation: af},
      ko: {translation: ko},
      sv: {translation: sv},
      pl: {translation: pl},
    },
    lng: getDeviceLanguage(),
    fallbackLng: 'en',
    interpolation: {escapeValue: false},
    compatibilityJSON: 'v4',
    postProcess: ['terminology'],
  });

export const changeLanguage = (lang: SupportedLanguage) => {
  i18n.changeLanguage(lang);
};

export default i18n;
