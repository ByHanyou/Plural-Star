export const TERMINOLOGY_TERMS = ['member', 'members', 'fronter', 'fronters', 'group', 'groups', 'facet', 'facets', 'front', 'fronting', 'system', 'journal', 'hub', 'history', 'archive'] as const;
export type TerminologyTerm = typeof TERMINOLOGY_TERMS[number];
export type TerminologyMap = Partial<Record<TerminologyTerm, string>>;

type TermFormsMap = Partial<Record<TerminologyTerm, string | string[]>>;

export const TERM_FORMS: Record<string, TermFormsMap> = {
  en: {
    journal: 'Journal', hub: 'Hub', history: 'History', archive: 'Archive',
    member: ['Member', 'Headmate'],
    members: ['Members', 'Headmates'],
    fronter: 'Fronter',
    fronters: 'Fronters',
    group: 'Group',
    groups: 'Groups',
    facet: 'Facet',
    facets: 'Facets',
    front: 'Front',
    fronting: 'Fronting',
    system: 'System',
  },
  es: {
    journal: 'Diario', hub: 'Centro', history: 'Historial', archive: 'Archivo',
    member: ['Miembro', 'Compañero'],
    members: 'Miembros',
    fronter: 'Fronter',
    fronters: 'Fronters',
    group: 'Grupo',
    groups: 'Grupos',
    facet: 'Faceta',
    facets: 'Facetas',
    front: 'Frente',
    system: 'Sistema',
  },
  fr: {
    journal: 'Journal', hub: 'Centre', history: 'Historique', archive: 'Archives',
    member: ['Membre', 'Compagnon'],
    members: 'Membres',
    fronter: 'Fronter',
    fronters: 'Fronters',
    group: 'Groupe',
    groups: 'Groupes',
    facet: 'Facette',
    facets: 'Facettes',
    front: 'Front',
    system: 'Système',
  },
  de: {
    journal: 'Tagebuch', hub: 'Zentrum', history: 'Verlauf', archive: 'Archiv',
    member: ['Mitglied', 'Kopfbewohner', 'Kopfbewohners'],
    members: 'Mitglieder',
    fronter: 'Fronter',
    group: 'Gruppe',
    groups: 'Gruppen',
    facet: 'Facette',
    facets: 'Facetten',
    front: 'Front',
    fronting: 'Fronting',
    system: 'System',
  },
  pt: {
    journal: 'Diário', hub: 'Central', history: 'Histórico', archive: 'Arquivo',
    member: 'Membro',
    members: 'Membros',
    fronter: 'Fronter',
    fronters: 'Fronters',
    group: 'Grupo',
    groups: 'Grupos',
    facet: 'Faceta',
    facets: 'Facetas',
    front: 'Frente',
    system: 'Sistema',
  },
  fi: {
    journal: 'Päiväkirja', hub: 'Keskus', history: 'Historia', archive: 'Arkisto',
    member: 'Jäsen',
    members: 'Jäsenet',
    fronter: 'Edessä oleva',
    fronters: 'Edessä olevat',
    group: 'Ryhmä',
    groups: 'Ryhmät',
    facet: 'Puoli',
    facets: 'Puolet',
    front: 'Edessä',
    system: 'Järjestelmä',
  },
  nb: {
    journal: 'Dagbok', hub: 'Hub', history: 'Historikk', archive: 'Arkiv',
    member: 'Medlem',
    members: 'Medlemmer',
    fronter: 'Fronter',
    fronters: 'Frontere',
    group: 'Gruppe',
    groups: 'Grupper',
    facet: 'Fasett',
    facets: 'Fasetter',
    front: 'Front',
    system: 'System',
  },
  sv: {
    journal: 'Dagbok', hub: 'Hub', history: 'Historik', archive: 'Arkiv',
    member: 'Medlem',
    members: 'Medlemmar',
    fronter: 'Frontare',
    group: 'Grupp',
    groups: 'Grupper',
    facet: 'Fasett',
    facets: 'Fasetter',
    front: 'Front',
    system: 'System',
  },
  nl: {
    journal: 'Dagboek', hub: 'Hub', history: 'Geschiedenis', archive: 'Archief',
    member: ['Lid', 'Headmate'],
    members: 'Leden',
    fronter: 'Fronter',
    fronters: 'Fronters',
    group: 'Groep',
    groups: 'Groepen',
    facet: 'Facet',
    facets: 'Facetten',
    front: 'Front',
    system: 'Systeem',
  },
  is: {
    journal: 'Dagbók', hub: 'Miðstöð', history: 'Saga', archive: 'Safn',
    member: ['Meðlimur', 'Headmate'],
    members: 'Meðlimir',
    fronter: 'Frontari',
    fronters: 'Frontarar',
    group: 'Hópur',
    groups: 'Hópar',
    facet: 'Hlið',
    facets: 'Hliðar',
    front: 'Front',
    system: 'Kerfi',
  },
  it: {
    journal: 'Diario', hub: 'Hub', history: 'Cronologia', archive: 'Archivio',
    member: ['Membro', 'Headmate'],
    members: 'Membri',
    fronter: 'Fronter',
    group: 'Gruppo',
    groups: 'Gruppi',
    facet: 'Sfaccettatura',
    facets: 'Sfaccettature',
    front: 'Front',
    system: 'Sistema',
  },
  pl: {
    journal: 'Dziennik', hub: 'Centrum', history: 'Historia', archive: 'Archiwum',
    member: ['Członek', 'Headmate'],
    members: 'Członkowie',
    fronter: 'Frontujący',
    group: 'Grupa',
    groups: 'Grupy',
    facet: 'Aspekt',
    facets: 'Aspekty',
    front: 'Front',
    system: 'System',
  },
  tr: {
    journal: 'Günlük', hub: 'Merkez', history: 'Geçmiş', archive: 'Arşiv',
    member: ['Üye', 'Headmate'],
    members: 'Üyeler',
    fronter: 'Frontta Olan',
    fronters: 'Frontta Olanlar',
    group: 'Grup',
    groups: 'Gruplar',
    facet: 'Yön',
    facets: 'Yönler',
    front: 'Front',
    system: 'Sistem',
  },
  ms: {
    journal: 'Jurnal', hub: 'Hab', history: 'Sejarah', archive: 'Arkib',
    member: ['Ahli', 'Headmate'],
    fronter: 'Fronter',
    group: 'Kumpulan',
    facet: 'Facet',
    front: 'Front',
    system: 'Sistem',
  },
  vi: {
    journal: 'Nhật ký', hub: 'Trung tâm', history: 'Lịch sử', archive: 'Lưu trữ',
    member: ['Thành viên', 'Headmate'],
    fronter: 'Người front',
    group: 'Nhóm',
    facet: 'Diện',
    front: 'Front',
    system: 'Hệ thống',
  },
  th: {
    journal: 'บันทึก', hub: 'ศูนย์กลาง', history: 'ประวัติ', archive: 'เก็บถาวร',
    member: ['สมาชิก', 'เฮดเมท'],
    fronter: 'ผู้ฟรอนต์',
    group: 'กลุ่ม',
    facet: 'แง่มุม',
    front: 'ฟรอนต์',
    system: 'ระบบ',
  },
  hi: {
    journal: 'जर्नल', hub: 'हब', history: 'इतिहास', archive: 'आर्काइव',
    member: ['सदस्य', 'हेडमेट'],
    fronter: 'फ्रंटर',
    fronters: 'फ्रंटर्स',
    group: 'समूह',
    facet: 'फ़ेसेट',
    front: 'फ्रंट',
    fronting: 'फ्रंटिंग',
    system: 'सिस्टम',
  },
  af: {
    journal: 'Joernaal', hub: 'Hub', history: 'Geskiedenis', archive: 'Argief',
    member: ['Lid', 'Headmate'],
    members: 'Lede',
    fronter: 'Fronter',
    fronters: 'Fronters',
    group: 'Groep',
    groups: 'Groepe',
    facet: 'Faset',
    facets: 'Fasette',
    front: 'Front',
    fronting: 'Fronting',
    system: 'Sisteem',
  },
  ko: {
    journal: '일지', hub: '허브', history: '기록', archive: '보관함',
    member: ['멤버', '헤드메이트'],
    fronter: '프런터',
    group: '그룹',
    facet: '패싯',
    front: '프런트',
    fronting: '프런팅',
    system: '시스템',
  },
  ja: {
    journal: 'ジャーナル', hub: 'ハブ', history: '履歴', archive: 'アーカイブ',
    member: 'メンバー',
    fronter: 'フロンター',
    group: 'グループ',
    facet: '側面',
    front: 'フロント',
    system: 'システム',
  },
  zh: {
    journal: '日记', hub: '中心', history: '历史', archive: '归档',
    member: ['成员', '伙伴'],
    fronter: '前台者',
    group: '组',
    facet: '侧面',
    front: '前台',
    system: '系统',
  },
  zhHant: {
    journal: '日誌', hub: '中心', history: '歷史', archive: '封存',
    member: ['成員', '腦內夥伴', '夥伴'],
    fronter: '前台者',
    group: '群組',
    facet: '側面',
    front: '前台',
    system: '系統',
  },
  ru: {
    journal: 'Журнал', hub: 'Хаб', history: 'История', archive: 'Архив',
    member: 'Участник',
    members: 'Участники',
    fronter: 'Фронтер',
    fronters: 'Фронтеры',
    group: 'Группа',
    groups: 'Группы',
    facet: 'Грань',
    facets: 'Грани',
    front: 'Фронт',
    system: 'Система',
  },
  uk: {
    journal: 'Щоденник', hub: 'Хаб', history: 'Історія', archive: 'Архів',
    member: 'Учасник',
    members: 'Учасники',
    fronter: 'Фронтер',
    fronters: 'Фронтери',
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

const caseFirst = (s: string, upper: boolean): string => {
  const runes = Array.from(s);
  const r0 = runes[0] ?? '';
  const changed = upper ? r0.toUpperCase() : r0.toLowerCase();
  const cp = changed.codePointAt(0) ?? 0;
  const badBlock = upper ? (cp >= 0x1c90 && cp <= 0x1cbf) : (cp >= 0xab70 && cp <= 0xabbf);
  const safe = Array.from(changed).length === 1 && !badBlock;
  return (safe ? changed : r0) + runes.slice(1).join('');
};

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
      const first = matched[0];
      const cased = first.toLowerCase() !== first.toUpperCase();
      const swapped = !cased ? replacement : caseFirst(replacement, first === first.toUpperCase());
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
