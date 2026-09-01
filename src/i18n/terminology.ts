// Terminology Picker engine. Users type their own word for the app's core
// terms (Member, Group, Facet, Front, Fronting, System and plurals) and every
// t() result gets a whole-word, case-preserving swap. The picker's own labels are
// exempt so the defaults stay discoverable for resetting.
//
// TERM_FORMS lists the findable word per language, matching the vocabulary
// the translations actually use; a language with no entry simply never swaps
// (safe no-op, disclosed in the picker hint). Declined forms beyond these are
// deliberately not chased.

export const TERMINOLOGY_TERMS = ['member', 'members', 'group', 'groups', 'facet', 'facets', 'front', 'fronting', 'system'] as const;
export type TerminologyTerm = typeof TERMINOLOGY_TERMS[number];
export type TerminologyMap = Partial<Record<TerminologyTerm, string>>;

/** Findable forms per language: one word or several. The app's own synonyms
 *  count as forms of the term they mean — "Headmate" IS the member term, and
 *  strings using it never picked up the user's word until it was listed. */
type TermFormsMap = Partial<Record<TerminologyTerm, string | string[]>>;

export const TERM_FORMS: Record<string, TermFormsMap> = {
  en: {
    member: ['Member', 'Headmate'],
    members: ['Members', 'Headmates'],
    group: 'Group',
    groups: 'Groups',
    facet: 'Facet',
    facets: 'Facets',
    front: 'Front',
    fronting: 'Fronting',
    system: 'System',
  },
  es: {
    member: ['Miembro', 'Compañero'],
    members: 'Miembros',
    group: 'Grupo',
    groups: 'Grupos',
    facet: 'Faceta',
    facets: 'Facetas',
    front: 'Frente',
    system: 'Sistema',
  },
  fr: {
    member: ['Membre', 'Compagnon'],
    members: 'Membres',
    group: 'Groupe',
    groups: 'Groupes',
    facet: 'Facette',
    facets: 'Facettes',
    front: 'Front',
    system: 'Système',
  },
  de: {
    member: ['Mitglied', 'Kopfbewohner', 'Kopfbewohners'],
    members: 'Mitglieder',
    group: 'Gruppe',
    groups: 'Gruppen',
    facet: 'Facette',
    facets: 'Facetten',
    front: 'Front',
    fronting: 'Fronting',
    system: 'System',
  },
  pt: {
    member: 'Membro',
    members: 'Membros',
    group: 'Grupo',
    groups: 'Grupos',
    facet: 'Faceta',
    facets: 'Facetas',
    front: 'Frente',
    system: 'Sistema',
  },
  fi: {
    member: 'Jäsen',
    members: 'Jäsenet',
    group: 'Ryhmä',
    groups: 'Ryhmät',
    facet: 'Puoli',
    facets: 'Puolet',
    front: 'Edessä',
    system: 'Järjestelmä',
  },
  nb: {
    member: 'Medlem',
    members: 'Medlemmer',
    group: 'Gruppe',
    groups: 'Grupper',
    facet: 'Fasett',
    facets: 'Fasetter',
    front: 'Front',
    system: 'System',
  },
  sv: {
    member: 'Medlem',
    members: 'Medlemmar',
    group: 'Grupp',
    groups: 'Grupper',
    facet: 'Fasett',
    facets: 'Fasetter',
    front: 'Front',
    system: 'System',
  },
  nl: {
    member: ['Lid', 'Headmate'],
    members: 'Leden',
    group: 'Groep',
    groups: 'Groepen',
    facet: 'Facet',
    facets: 'Facetten',
    front: 'Front',
    system: 'Systeem',
  },
  is: {
    member: ['Meðlimur', 'Headmate'],
    members: 'Meðlimir',
    group: 'Hópur',
    groups: 'Hópar',
    facet: 'Hlið',
    facets: 'Hliðar',
    front: 'Front',
    system: 'Kerfi',
  },
  it: {
    member: ['Membro', 'Headmate'],
    members: 'Membri',
    group: 'Gruppo',
    groups: 'Gruppi',
    facet: 'Sfaccettatura',
    facets: 'Sfaccettature',
    front: 'Front',
    system: 'Sistema',
  },
  pl: {
    member: ['Członek', 'Headmate'],
    members: 'Członkowie',
    group: 'Grupa',
    groups: 'Grupy',
    facet: 'Aspekt',
    facets: 'Aspekty',
    front: 'Front',
    system: 'System',
  },
  tr: {
    member: ['Üye', 'Headmate'],
    members: 'Üyeler',
    group: 'Grup',
    groups: 'Gruplar',
    facet: 'Yön',
    facets: 'Yönler',
    front: 'Front',
    system: 'Sistem',
  },
  ms: {
    member: ['Ahli', 'Headmate'],
    group: 'Kumpulan',
    facet: 'Facet',
    front: 'Front',
    system: 'Sistem',
  },
  vi: {
    member: ['Thành viên', 'Headmate'],
    group: 'Nhóm',
    facet: 'Diện',
    front: 'Front',
    system: 'Hệ thống',
  },
  th: {
    member: ['สมาชิก', 'เฮดเมท'],
    group: 'กลุ่ม',
    facet: 'แง่มุม',
    front: 'ฟรอนต์',
    system: 'ระบบ',
  },
  hi: {
    member: ['सदस्य', 'हेडमेट'],
    group: 'समूह',
    facet: 'फ़ेसेट',
    front: 'फ्रंट',
    fronting: 'फ्रंटिंग',
    system: 'सिस्टम',
  },
  af: {
    member: ['Lid', 'Headmate'],
    members: 'Lede',
    group: 'Groep',
    groups: 'Groepe',
    facet: 'Faset',
    facets: 'Fasette',
    front: 'Front',
    fronting: 'Fronting',
    system: 'Sisteem',
  },
  ko: {
    member: ['멤버', '헤드메이트'],
    group: '그룹',
    facet: '패싯',
    front: '프런트',
    fronting: '프런팅',
    system: '시스템',
  },
  ja: {
    member: 'メンバー',
    group: 'グループ',
    facet: '側面',
    front: 'フロント',
    system: 'システム',
  },
  zh: {
    member: ['成员', '伙伴'],
    group: '组',
    facet: '侧面',
    front: '前台',
    system: '系统',
  },
  zhHant: {
    member: ['成員', '腦內夥伴', '夥伴'],
    group: '群組',
    facet: '側面',
    front: '前台',
    system: '系統',
  },
  ru: {
    member: 'Участник',
    members: 'Участники',
    group: 'Группа',
    groups: 'Группы',
    facet: 'Грань',
    facets: 'Грани',
    front: 'Фронт',
    system: 'Система',
  },
  uk: {
    member: 'Учасник',
    members: 'Учасники',
    group: 'Група',
    groups: 'Групи',
    facet: 'Грань',
    facets: 'Грані',
    front: 'Фронт',
    system: 'Система',
  },
};

let overrides: TerminologyMap = {};

export const setTerminologyOverrides = (map?: TerminologyMap | null): void => {
  const clean: TerminologyMap = {};
  for (const term of TERMINOLOGY_TERMS) {
    const v = map?.[term]?.trim();
    if (v) clean[term] = v;
  }
  overrides = clean;
};

export const hasTerminologyOverrides = (): boolean => Object.keys(overrides).length > 0;

// Fronting level renames ("Primary Front" → whatever the system calls it).
// Unlike the word swaps above these are matched by i18n KEY, not by text, so
// they work in every language: wherever a tier label is rendered it comes from
// one of a small fixed set of keys. The picker's own labels live under
// terminology.* keys and are therefore never intercepted, keeping the
// defaults discoverable for resetting.
export type TierNameKey = 'primary' | 'coFront' | 'coConscious';
export type TierNameMap = Partial<Record<TierNameKey, string>>;

let tierNames: TierNameMap = {};

export const setTierNameOverrides = (map?: TierNameMap | null): void => {
  const clean: TierNameMap = {};
  for (const k of ['primary', 'coFront', 'coConscious'] as TierNameKey[]) {
    const v = map?.[k]?.trim();
    if (v) clean[k] = v;
  }
  tierNames = clean;
};

export const hasTierNameOverrides = (): boolean => Object.keys(tierNames).length > 0;

// Full/short forms both get the custom word: an abbreviation of an arbitrary
// user word is not derivable, and showing the full word beats inventing one.
const TIER_LABEL_KEYS: Record<string, TierNameKey> = {
  'tier.primaryFront': 'primary',
  'tier.primaryShort': 'primary',
  'tier.coFront': 'coFront',
  'tier.coFrontShort': 'coFront',
  'tier.coConscious': 'coConscious',
  'tier.coConShort': 'coConscious',
};
const TIER_BADGE_KEYS: Record<string, TierNameKey> = {
  'tier.primaryBadge': 'primary',
  'tier.coFrontBadge': 'coFront',
  'tier.coConBadge': 'coConscious',
};
// "Label: names" notification lines. The whole line is rebuilt rather than
// word-swapped inside the localized template, because the template's label
// word differs per language and the custom name replaces all of them.
const TIER_LINE_KEYS: Record<string, TierNameKey> = {
  'notification.primary': 'primary',
  'notification.coFront': 'coFront',
  'notification.cfShort': 'coFront',
  'notification.coConscious': 'coConscious',
  'notification.ccShort': 'coConscious',
};

export const applyTierNames = (value: string, key: string, options: unknown): string => {
  if (!hasTierNameOverrides()) return value;
  const label = TIER_LABEL_KEYS[key];
  if (label && tierNames[label]) return tierNames[label]!;
  const badge = TIER_BADGE_KEYS[key];
  if (badge && tierNames[badge]) return tierNames[badge]!.toLocaleUpperCase();
  const line = TIER_LINE_KEYS[key];
  if (line && tierNames[line]) {
    const names = (options as {names?: unknown} | null | undefined)?.names;
    return `${tierNames[line]}: ${typeof names === 'string' ? names : String(names ?? '')}`;
  }
  return value;
};

const isWordChar = (ch: string | undefined): boolean => !!ch && /[\p{L}\p{N}]/u.test(ch);

/** Whole-word, case-preserving replace. Hand-rolled scan instead of regex
 *  lookbehind, which Hermes does not reliably support: boundaries are checked
 *  by inspecting neighbour characters, so "Front" never eats "Fronting". */
export const replaceTerm = (text: string, form: string, replacement: string): string => {
  if (!form || !replacement) return text;
  const lower = text.toLowerCase();
  const needle = form.toLowerCase();
  let out = '';
  let i = 0;
  for (;;) {
    const idx = lower.indexOf(needle, i);
    if (idx === -1) {
      out += text.slice(i);
      return out;
    }
    const before = text[idx - 1];
    const after = text[idx + form.length];
    if (!isWordChar(before) && !isWordChar(after)) {
      const matched = text.slice(idx, idx + form.length);
      const upper = matched[0] !== matched[0].toLowerCase() && matched[0] === matched[0].toUpperCase();
      const swapped = upper
        ? replacement[0].toUpperCase() + replacement.slice(1)
        : replacement[0].toLowerCase() + replacement.slice(1);
      out += text.slice(i, idx) + swapped;
      i = idx + form.length;
    } else {
      out += text.slice(i, idx + 1);
      i = idx + 1;
    }
  }
};

export const applyTerminology = (value: string, language: string): string => {
  if (!hasTerminologyOverrides()) return value;
  const forms = TERM_FORMS[language] || TERM_FORMS[(language || '').split('-')[0]];
  if (!forms) return value;
  // Flatten to (term, form) pairs, longest form first, so in languages where
  // the plural (or a compound synonym) contains a shorter form the long one
  // wins.
  const pairs: [TerminologyTerm, string][] = [];
  for (const [term, f] of Object.entries(forms) as [TerminologyTerm, string | string[]][]) {
    if (!overrides[term]) continue;
    for (const one of Array.isArray(f) ? f : [f]) pairs.push([term, one]);
  }
  pairs.sort((a, b) => b[1].length - a[1].length);
  let out = value;
  for (const [term, form] of pairs) {
    out = replaceTerm(out, form, overrides[term]!);
  }
  return out;
};

// App chrome that must keep its literal wording no matter what the user
// renames "System" to: the System Menu has to stay findable under the name
// every guide and support answer uses, and the file-access hint points AT it,
// so the two must always match.
const EXEMPT_KEYS = new Set(['modal.systemSettings', 'share.filesDisabled']);

export const terminologyPostProcessor = {
  type: 'postProcessor' as const,
  name: 'terminology',
  process(value: unknown, key: string | string[], options: unknown, i18nInstance: {language?: string}): unknown {
    if (typeof value !== 'string') return value;
    const k = Array.isArray(key) ? key[0] : key;
    if (typeof k === 'string' && (k.startsWith('terminology.') || EXEMPT_KEYS.has(k))) return value;
    if (typeof k === 'string') {
      const tiered = applyTierNames(value, k, options);
      // A custom tier name is returned exactly as the user typed it — the
      // word swaps below must not rewrite it.
      if (tiered !== value) return tiered;
    }
    if (!hasTerminologyOverrides()) return value;
    return applyTerminology(value, i18nInstance?.language || 'en');
  },
};
