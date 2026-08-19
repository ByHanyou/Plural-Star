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

export const TERM_FORMS: Record<string, TerminologyMap> = {
  en: {
    member: 'Member',
    members: 'Members',
    group: 'Group',
    groups: 'Groups',
    facet: 'Facet',
    facets: 'Facets',
    front: 'Front',
    fronting: 'Fronting',
    system: 'System',
  },
  es: {
    member: 'Miembro',
    members: 'Miembros',
    group: 'Grupo',
    groups: 'Grupos',
    facet: 'Faceta',
    facets: 'Facetas',
    front: 'Frente',
    system: 'Sistema',
  },
  fr: {
    member: 'Membre',
    members: 'Membres',
    group: 'Groupe',
    groups: 'Groupes',
    facet: 'Facette',
    facets: 'Facettes',
    front: 'Front',
    system: 'Système',
  },
  de: {
    member: 'Mitglied',
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
    member: 'Lid',
    members: 'Leden',
    group: 'Groep',
    groups: 'Groepen',
    facet: 'Facet',
    facets: 'Facetten',
    front: 'Front',
    system: 'Systeem',
  },
  is: {
    member: 'Meðlimur',
    members: 'Meðlimir',
    group: 'Hópur',
    groups: 'Hópar',
    facet: 'Hlið',
    facets: 'Hliðar',
    front: 'Front',
    system: 'Kerfi',
  },
  it: {
    member: 'Membro',
    members: 'Membri',
    group: 'Gruppo',
    groups: 'Gruppi',
    facet: 'Sfaccettatura',
    facets: 'Sfaccettature',
    front: 'Front',
    system: 'Sistema',
  },
  pl: {
    member: 'Członek',
    members: 'Członkowie',
    group: 'Grupa',
    groups: 'Grupy',
    facet: 'Aspekt',
    facets: 'Aspekty',
    front: 'Front',
    system: 'System',
  },
  tr: {
    member: 'Üye',
    members: 'Üyeler',
    group: 'Grup',
    groups: 'Gruplar',
    facet: 'Yön',
    facets: 'Yönler',
    front: 'Front',
    system: 'Sistem',
  },
  ms: {
    member: 'Ahli',
    group: 'Kumpulan',
    facet: 'Facet',
    front: 'Front',
    system: 'Sistem',
  },
  vi: {
    member: 'Thành viên',
    group: 'Nhóm',
    facet: 'Diện',
    front: 'Front',
    system: 'Hệ thống',
  },
  th: {
    member: 'สมาชิก',
    group: 'กลุ่ม',
    facet: 'แง่มุม',
    front: 'ฟรอนต์',
    system: 'ระบบ',
  },
  hi: {
    member: 'सदस्य',
    group: 'समूह',
    facet: 'फ़ेसेट',
    front: 'फ्रंट',
    fronting: 'फ्रंटिंग',
    system: 'सिस्टम',
  },
  af: {
    member: 'Lid',
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
    member: '멤버',
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
    member: '成员',
    group: '组',
    facet: '侧面',
    front: '前台',
    system: '系统',
  },
  zhHant: {
    member: '成員',
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
  // Longest form first, so in languages where the plural contains the
  // singular without a word boundary (CJK) the plural wins.
  const entries = (Object.entries(forms) as [TerminologyTerm, string][])
    .filter(([term]) => overrides[term])
    .sort((a, b) => b[1].length - a[1].length);
  let out = value;
  for (const [term, form] of entries) {
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
  process(value: unknown, key: string | string[], _options: unknown, i18nInstance: {language?: string}): unknown {
    if (typeof value !== 'string' || !hasTerminologyOverrides()) return value;
    const k = Array.isArray(key) ? key[0] : key;
    if (typeof k === 'string' && (k.startsWith('terminology.') || EXEMPT_KEYS.has(k))) return value;
    return applyTerminology(value, i18nInstance?.language || 'en');
  },
};
