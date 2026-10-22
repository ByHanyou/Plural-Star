import PluralRules from 'intl-pluralrules/plural-rules';
import i18n from 'i18next';
import type {ResourceKey} from 'i18next';
import {initReactI18next} from 'react-i18next';
import * as RNLocalize from 'react-native-localize';
import {terminologyPostProcessor} from './terminology';
import {logError} from '../utils/log';

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

type IntlWithPluralRules = {PluralRules?: new (locales?: string | string[], options?: Intl.PluralRulesOptions) => Intl.PluralRules};

const hasWorkingPluralRules = (): boolean => {
  const PR = (Intl as IntlWithPluralRules).PluralRules;
  if (typeof PR !== 'function') return false;
  try {
    return new PR('pl').select(2) === 'few';
  } catch {
    return false;
  }
};
if (!hasWorkingPluralRules()) (Intl as IntlWithPluralRules).PluralRules = PluralRules;

export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'nl', 'pt', 'fi', 'sv', 'nb', 'is', 'it', 'pl', 'tr', 'ms', 'vi', 'th', 'hi', 'af', 'zh', 'zhHant', 'ja', 'ko', 'ru', 'uk'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
export const isSupportedLanguage = (v: unknown): v is SupportedLanguage => SUPPORTED_LANGUAGES.some(l => l === v);
export const i18nCode = (lang: SupportedLanguage): string => (lang === 'zhHant' ? 'zh-Hant' : lang);

const TRANSLATIONS: Record<SupportedLanguage, ResourceKey> = {en, es, fr, de, nl, pt, fi, sv, nb, is, it, pl, tr, ms, vi, th, hi, af, zh, zhHant, ja, ko, ru, uk};

const HANT_REGIONS = new Set(['TW', 'HK', 'MO']);

const getDeviceLanguage = (): SupportedLanguage => {
  const [first] = RNLocalize.getLocales();
  if (!first) return 'en';
  const {languageCode: code, scriptCode: script, countryCode: region} = first;
  if (code === 'zh') return script === 'Hant' || HANT_REGIONS.has(region) ? 'zhHant' : 'zh';
  if (isSupportedLanguage(code)) return code;
  if (code === 'no' || code === 'nn') return 'nb';
  return 'en';
};

i18n
  .use(initReactI18next)
  .use(terminologyPostProcessor)
  .init({
    resources: Object.fromEntries(SUPPORTED_LANGUAGES.map((lang): [string, {translation: ResourceKey}] => [i18nCode(lang), {translation: TRANSLATIONS[lang]}])),
    lng: i18nCode(getDeviceLanguage()),
    fallbackLng: 'en',
    interpolation: {escapeValue: false},
    compatibilityJSON: 'v4',
    postProcess: ['terminology'],
  })
  .catch(e => logError('i18n', e));

export const changeLanguage = (lang: SupportedLanguage): void => {
  i18n.changeLanguage(i18nCode(lang)).catch(e => logError('i18n', e));
};

export default i18n;
