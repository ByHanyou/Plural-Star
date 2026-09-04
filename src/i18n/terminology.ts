export const TERMINOLOGY_TERMS = ['member', 'members', 'group', 'groups', 'facet', 'facets', 'front', 'fronting', 'system'] as const;
export type TerminologyTerm = typeof TERMINOLOGY_TERMS[number];
export type TerminologyMap = Partial<Record<TerminologyTerm, string>>;

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

let pairCache: Map<string, [TerminologyTerm, string, string][]> = new Map();

export const setTerminologyOverrides = (map?: TerminologyMap | null): void => {
  const clean: TerminologyMap = {};
  for (const term of TERMINOLOGY_TERMS) {
    const v = map?.[term]?.trim();
    if (v) clean[term] = v;
  }
  overrides = clean;
  pairCache = new Map();
};

export const hasTerminologyOverrides = (): boolean => Object.keys(overrides).length > 0;

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
export const getTierNameOverride = (k: TierNameKey): string | undefined => tierNames[k];

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

export const replaceTerm = (text: string, form: string, replacement: string, fixArticles = false): string => {
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
      let combined = out + text.slice(i, idx);
      if (fixArticles) {
        const m = combined.match(/(^|[^\p{L}\p{N}])([Aa])(n?) $/u);
        if (m) {
          const vowel = /^[aeiouAEIOU]/.test(swapped);
          const article = m[2] + (vowel ? 'n' : '');
          combined = combined.slice(0, combined.length - (m[2].length + m[3].length + 1)) + article + ' ';
        }
      }
      out = combined + swapped;
      i = idx + form.length;
    } else {
      out += text.slice(i, idx + 1);
      i = idx + 1;
    }
  }
};

const pairsFor = (language: string): [TerminologyTerm, string, string][] => {
  const cached = pairCache.get(language);
  if (cached) return cached;
  const forms = TERM_FORMS[language] || TERM_FORMS[(language || '').split('-')[0]];
  const pairs: [TerminologyTerm, string, string][] = [];
  if (forms) {
    for (const [term, f] of Object.entries(forms) as [TerminologyTerm, string | string[]][]) {
      if (!overrides[term]) continue;
      for (const one of Array.isArray(f) ? f : [f]) pairs.push([term, one, one.toLowerCase()]);
    }
    pairs.sort((a, b) => b[1].length - a[1].length);
  }
  pairCache.set(language, pairs);
  return pairs;
};

export const applyTerminology = (value: string, language: string): string => {
  if (!hasTerminologyOverrides()) return value;
  const pairs = pairsFor(language);
  if (pairs.length === 0) return value;
  const fixArticles = (language || '').split('-')[0] === 'en';
  let out = value;
  let lower = value.toLowerCase();
  for (const [term, form, needle] of pairs) {
    if (lower.indexOf(needle) === -1) continue;
    const next = replaceTerm(out, form, overrides[term]!, fixArticles);
    if (next !== out) {
      out = next;
      lower = out.toLowerCase();
    }
  }
  return out;
};

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
      if (tiered !== value) return tiered;
    }
    if (!hasTerminologyOverrides()) return value;
    return applyTerminology(value, i18nInstance?.language || 'en');
  },
};
