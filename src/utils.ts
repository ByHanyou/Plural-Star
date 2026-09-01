import {Platform, Dimensions, PixelRatio} from 'react-native';
import i18n from './i18n/i18n';
import type {SupportedLanguage} from './i18n/i18n';

export interface SystemInfo {
  name: string;
  description: string;
  journalPassword?: string;
  avatar?: string;
  banner?: string;
}

export type GroupNodeKind = 'group' | 'subsystem';

export interface MemberGroup {
  id: string;
  name: string;
  color?: string;
  kind?: GroupNodeKind;
  parentId?: string | null;
  sortOrder?: number;
  sourceId?: string;
  description?: string;
}

export const groupKind = (g: MemberGroup): GroupNodeKind => g.kind || 'group';
export const groupParent = (g: MemberGroup): string | null => g.parentId ?? null;

export const childrenOf = (nodes: MemberGroup[], parentId: string | null): MemberGroup[] =>
  nodes
    .filter(n => groupParent(n) === parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || nameCompare(a.name, b.name));

export const groupDisplayOrder = (nodes: MemberGroup[]): Map<string, number> => {
  const order = new Map<string, number>();
  const walk = (parentId: string | null) => {
    for (const g of childrenOf(nodes, parentId)) {
      if (order.has(g.id)) continue;
      order.set(g.id, order.size);
      walk(g.id);
    }
  };
  walk(null);
  for (const g of nodes) {
    if (!order.has(g.id)) order.set(g.id, order.size);
  }
  return order;
};

export const sortGroupsForDisplay = (list: MemberGroup[], all: MemberGroup[]): MemberGroup[] => {
  const order = groupDisplayOrder(all);
  return [...list].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
};

export const descendantsOf = (nodes: MemberGroup[], id: string): MemberGroup[] => {
  const out: MemberGroup[] = [];
  const seen = new Set<string>([id]);
  const walk = (pid: string) => {
    for (const n of nodes) {
      if (groupParent(n) === pid && !seen.has(n.id)) {
        seen.add(n.id);
        out.push(n);
        walk(n.id);
      }
    }
  };
  walk(id);
  return out;
};

export const ancestorsOf = (nodes: MemberGroup[], id: string): MemberGroup[] => {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const out: MemberGroup[] = [];
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur && groupParent(cur) != null) {
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    const parent = byId.get(groupParent(cur)!);
    if (!parent) break;
    out.unshift(parent);
    cur = parent;
  }
  return out;
};

export const isDescendant =(nodes: MemberGroup[], candidateId: string, ofId: string): boolean => {
  if (candidateId === ofId) return true;
  return descendantsOf(nodes, ofId).some(n => n.id === candidateId);
};

export const nodeDepth = (nodes: MemberGroup[], id: string): number => ancestorsOf(nodes, id).length;

export type CustomFieldType = 'text' | 'markdown' | 'date' | 'dateRange' | 'number' | 'toggle' | 'color' | 'month' | 'year' | 'monthYear' | 'timestamp' | 'monthDay' | 'image';

export interface CustomFieldDef {
  id: string;
  name: string;
  type: CustomFieldType;
  sortOrder?: number;
  markdown?: boolean;
}

export interface CustomFieldValue {
  fieldId: string;
  value: string | number | boolean | null;
}

export interface NoteboardEntry {
  id: string;
  memberId: string;
  authorId: string;
  content: string;
  timestamp: number;
  pinned?: boolean;
  read?: boolean;
}

export interface PollOption {
  id: string;
  label: string;
  votes: string[];
}

export interface MemberPoll {
  id: string;
  targetMemberId: string;
  question: string;
  options: PollOption[];
  createdBy: string;
  createdAt: number;
  closedAt?: number;
  hideVoterNames?: boolean;
}

export type MemberSortMode = 'alphabetical' | 'reverse-alphabetical' | 'age' | 'color' | 'role' | 'manual';

export interface Member {
  id: string;
  name: string;
  pronouns: string;
  role: string;
  color: string;
  description: string;
  tags?: string[];
  groupIds?: string[];
  archived?: boolean;
  deleted?: boolean;
  avatar?: string;
  avatarTransparent?: boolean;
  banner?: string;
  customFields?: CustomFieldValue[];
  sortOrder?: number;
  createdAt?: number;
  sourceId?: string;
  isCustomFront?: boolean;
  isFacet?: boolean;
  // Search-only alias. Shown nowhere in Read views; exists so someone whose
  // NAME is symbols, emoji or a styled font can still be found by typing.
  nickname?: string;
  mailboxPassword?: string;
  pkProxyTags?: {prefix?: string | null; suffix?: string | null}[];
  pkAvatarUrl?: string;
  pkBannerUrl?: string;
  pkKeepProxy?: boolean;
}

// A member that counts toward the system roster: not a custom front, not a facet,
// not deleted. Use this for every member COUNT so new categories can never inflate it.
export const isRosterMember = (m: Member): boolean =>
  !m.isCustomFront && !m.isFacet && !m.deleted;

export const rosterMembers = (members: Member[]): Member[] => members.filter(isRosterMember);

export const DEFAULT_CUSTOM_FRONT_NAMES = ['Chatty', 'Non-Verbal', 'IWC', 'DNI', 'Blurry', 'Blendy', 'Rapid Switching', 'Foggy', 'Grounded', 'Dissociated', 'Anxious', 'Depressed', 'Cheerful', 'Happy', 'Sad', 'Crisis', 'Melancholy', 'Stimming', 'Stressed', 'Working', 'Traveling', 'Sleeping', 'Hyperfocus'];

const CUSTOM_FRONT_COLORS = ['#DAA520', '#7B9FE8', '#E87BA8', '#7BE8C4', '#A87BE8', '#E8A87B', '#6EC9A9', '#E87B7B', '#85B4E8', '#C97BE8', '#B4E885', '#E8C97B'];

export const makeDefaultCustomFronts = (): Member[] =>
  DEFAULT_CUSTOM_FRONT_NAMES.map((name, i) => ({
    id: uid(),
    name,
    pronouns: '',
    role: '',
    color: CUSTOM_FRONT_COLORS[i % CUSTOM_FRONT_COLORS.length],
    description: '',
    isCustomFront: true,
    tags: [],
    groupIds: [],
  }));

export interface RelationshipTypeDef {
  id: string;
  name: string;
  inverseName?: string;
  directional: boolean;
  color?: string;
  preset?: boolean;
  overridden?: boolean;
  /** Preset tombstone: a preset cannot be removed from the constant, so its
   *  deletion is stored as an override row with this flag and
   *  allRelationshipTypes drops the preset entirely. */
  deleted?: boolean;
}

export interface Medication {
  id: string;
  name: string;
  dosage?: string;
  times: string[];
  enabled: boolean;
  notes?: string;
  createdAt: number;
}

export interface MedicalAppointment {
  id: string;
  title: string;
  time: number;
  location?: string;
  notes?: string;
  reminderMinutesBefore?: number;
  createdAt: number;
}

export interface MedicalHistoryEntry {
  id: string;
  title: string;
  date?: number;
  notes?: string;
  createdAt: number;
}

export interface EmergencyInfo {
  conditions?: string;
  allergies?: string;
  bloodType?: string;
  notes?: string;
  showOnNotification: boolean;
}

export interface MedicalData {
  medications: Medication[];
  appointments: MedicalAppointment[];
  history: MedicalHistoryEntry[];
  emergency: EmergencyInfo;
}

export const DEFAULT_MEDICAL: MedicalData = {
  medications: [],
  appointments: [],
  history: [],
  emergency: {showOnNotification: false},
};

// Day Planner. Same shapes as the parked Medical machinery on purpose: the
// field names and semantics were already proven there, and the notification
// scheduling mirrors them. Lives in its OWN store (ps:planner) and syncs
// normally; nothing is migrated out of the medical stash, which stays
// local-only and untouched for its eventual reinstatement.
export type PlannerRepeat = 'daily' | 'everyOtherDay' | 'weekly' | 'everyOtherWeek' | 'monthly' | 'everyOtherMonth' | 'annually';
/** Reminders additionally support 'once': fire on one chosen day, then done.
 *  Appointments express one-time as an absent repeat instead. */
export type PlannerReminderRepeat = PlannerRepeat | 'once';

export interface PlannerAppointment {
  id: string;
  title: string;
  time: number;
  location?: string;
  notes?: string;
  reminderMinutesBefore?: number;
  /** Absent = one-time. Set = repeats on this cadence, anchored at `time`. */
  repeat?: PlannerRepeat;
  createdAt: number;
}

export interface PlannerReminder {
  id: string;
  title: string;
  times: string[];
  enabled: boolean;
  notes?: string;
  /** Absent = daily (the original behavior). */
  repeat?: PlannerReminderRepeat;
  /** Cadence anchor day for non-daily repeats and the day a 'once' reminder
   *  fires; absent = createdAt's day. */
  startDate?: number;
  createdAt: number;
}

// --- Planner cadence maths ---------------------------------------------------
// Day arithmetic runs on UTC day numbers so DST transitions can't produce
// off-by-one days; day-of-month cadences clamp (31st -> last day of shorter
// months, Feb 29 -> Feb 28 off leap years) instead of skipping months.
const plannerDayNumber = (d: Date): number => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;

export const daysInMonth = (year: number, monthZeroIndexed: number): number =>
  new Date(year, monthZeroIndexed + 1, 0).getDate();

export const plannerOccursOnDay = (anchorTs: number, repeat: PlannerReminderRepeat | undefined, day: Date): boolean => {
  const a = new Date(anchorTs);
  const diff = plannerDayNumber(day) - plannerDayNumber(a);
  if (repeat == null || repeat === 'once') return diff === 0;
  if (diff < 0) return false;
  switch (repeat) {
    case 'daily': return true;
    case 'everyOtherDay': return diff % 2 === 0;
    case 'weekly': return diff % 7 === 0;
    case 'everyOtherWeek': return diff % 14 === 0;
    case 'monthly':
    case 'everyOtherMonth': {
      const months = (day.getFullYear() - a.getFullYear()) * 12 + (day.getMonth() - a.getMonth());
      if (months < 0) return false;
      if (repeat === 'everyOtherMonth' && months % 2 !== 0) return false;
      const dom = Math.min(a.getDate(), daysInMonth(day.getFullYear(), day.getMonth()));
      return day.getDate() === dom;
    }
    case 'annually': {
      if (day.getFullYear() < a.getFullYear()) return false;
      if (day.getMonth() !== a.getMonth()) return false;
      const dom = Math.min(a.getDate(), daysInMonth(day.getFullYear(), day.getMonth()));
      return day.getDate() === dom;
    }
  }
  return false;
};

/** Next occurrence strictly after `after`, carrying the anchor's local
 *  time-of-day. A bounded day-walk beats seven closed forms: 800 days spans
 *  two annual cycles including the leap-clamp edge, and the scan is trivial. */
export const plannerNextOccurrence = (anchorTs: number, repeat: PlannerReminderRepeat | undefined, after: number): number | null => {
  if (repeat == null || repeat === 'once') return anchorTs > after ? anchorTs : null;
  const a = new Date(anchorTs);
  const probe = new Date(after);
  probe.setHours(0, 0, 0, 0);
  for (let i = 0; i < 800; i++) {
    if (plannerOccursOnDay(anchorTs, repeat, probe)) {
      const cand = new Date(probe);
      cand.setHours(a.getHours(), a.getMinutes(), a.getSeconds(), 0);
      if (cand.getTime() > after) return cand.getTime();
    }
    probe.setDate(probe.getDate() + 1);
  }
  return null;
};

export interface PlannerData {
  appointments: PlannerAppointment[];
  reminders: PlannerReminder[];
}

export const DEFAULT_PLANNER: PlannerData = {
  appointments: [],
  reminders: [],
};

export const isValidTimeHHMM = (v: string): boolean =>
  /^([01]?\d|2[0-3]):[0-5]\d$/.test(v.trim());

export const time12to24 = (raw: string, ampm: 'AM' | 'PM'): string | null => {
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec((raw || '').trim());
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (h < 1 || h > 12 || min < 0 || min > 59) return null;
  if (ampm === 'AM') { if (h === 12) h = 0; } else { if (h !== 12) h += 12; }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

export const formatTime12 = (hhmm24: string): string => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm24 || '').trim());
  if (!m) return hhmm24;
  let h = parseInt(m[1], 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m[2]} ${ampm}`;
};

export const emergencyNotificationLine = (e: EmergencyInfo | undefined): string | null => {
  if (!e || !e.showOnNotification) return null;
  const parts = [e.conditions, e.allergies, e.bloodType].map(x => (x || '').trim()).filter(Boolean);
  if (parts.length === 0) return null;
  return `⚕ ${parts.join(' · ')}`;
};

export interface DeviceCodes {
  friendCode: string;
  syncCode: string;
  createdAt: number;
}

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

let codeState = 0;

const seedCodeState = (): number => {
  let h = 2166136261;
  const mix = (n: number) => {
    h = (h ^ (Math.floor(Math.abs(n)) & 0xffffffff)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  };
  const screen = Dimensions.get('screen');
  const perf = (globalThis as any)?.performance?.now?.() ?? 0;
  mix(Date.now());
  mix(perf * 1000);
  mix(Math.random() * 0xffffffff);
  mix(Math.random() * 0xffffffff);
  mix(Math.random() * 0xffffffff);
  mix(screen.width * 10000 + screen.height);
  mix(PixelRatio.get() * 1000);
  mix(new Date().getTimezoneOffset() + 720);
  mix(Platform.OS === 'ios' ? 0x1f3 : 0x2e7);
  mix(typeof Platform.Version === 'number' ? Platform.Version : `${Platform.Version}`.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
  return h >>> 0;
};

const nextCodeChar = (): string => {
  if (codeState === 0) codeState = seedCodeState();
  codeState = (codeState ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  codeState = Math.imul(codeState ^ (codeState >>> 15), 2246822519) >>> 0;
  codeState = Math.imul(codeState ^ (codeState >>> 13), 3266489917) >>> 0;
  codeState = (codeState ^ (codeState >>> 16)) >>> 0;
  return CODE_ALPHABET[codeState % CODE_ALPHABET.length];
};

const randomCodeGroup = (len: number): string => {
  let out = '';
  for (let i = 0; i < len; i++) out += nextCodeChar();
  return out;
};

export const generateFriendCode = (): string =>
  `${randomCodeGroup(4)}-${randomCodeGroup(4)}-${randomCodeGroup(4)}`;

export const generateSyncCode = (): string =>
  `${randomCodeGroup(5)}-${randomCodeGroup(5)}-${randomCodeGroup(5)}-${randomCodeGroup(5)}`;

export const DEFAULT_REL_COLOR = '#8A94A6';

export const RELATIONSHIP_COLOR_CHOICES = ['#E05B5B', '#5BBF7A', '#D9B84A', '#E87BA8'];

export const COLOR_NAMES: Record<string, string> = {
  '#FFFFFF': 'white',
  '#111111': 'black',
  '#E05B5B': 'red',
  '#E8933A': 'orange',
  '#D9B84A': 'yellow',
  '#5BBF7A': 'green',
  '#4AA8D9': 'blue',
  '#7B6BE8': 'indigo',
  '#8B5A2B': 'brown',
  '#9AA5B1': 'gray',
  '#8A94A6': 'slate',
  '#DAA520': 'goldenrod',
  '#7B9FE8': 'periwinkle',
  '#E87BA8': 'pink',
  '#7BE8C4': 'mint',
  '#A87BE8': 'lavender',
  '#E8A87B': 'peach',
  '#6EC9A9': 'seaGreen',
  '#E87B7B': 'coral',
  '#85B4E8': 'skyBlue',
  '#C97BE8': 'orchid',
  '#B4E885': 'lime',
  '#E8C97B': 'sand',
};

export const colorName = (hex: string, t: (k: string) => string): string => {
  if (!hex || typeof hex !== 'string') return '';
  const key = COLOR_NAMES[hex.toUpperCase()];
  return key ? t(`colors.${key}`) : hex;
};

export const BASE_COLORS = Object.keys(COLOR_NAMES);

export type ColorSet = 'default' | 'darker' | 'pastel' | 'neon';
export const COLOR_SETS: ColorSet[] = ['default', 'darker', 'pastel', 'neon'];

const colorClamp01 = (n: number) => Math.max(0, Math.min(1, n));

const colorHexToHsv = (hex: string) => {
  const h6 = hex.replace('#', '');
  const n = parseInt(h6.length === 3 ? h6.split('').map(c => c + c).join('') : h6, 16) || 0;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let hh = 0;
  if (d !== 0) {
    if (max === r) hh = ((g - b) / d) % 6;
    else if (max === g) hh = (b - r) / d + 2;
    else hh = (r - g) / d + 4;
    hh *= 60; if (hh < 0) hh += 360;
  }
  return {h: hh, s: max === 0 ? 0 : d / max, v: max};
};

const colorHsvToHex = (h: number, s: number, v: number) => {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) {r = c; g = x;} else if (h < 120) {r = x; g = c;} else if (h < 180) {g = c; b = x;}
  else if (h < 240) {g = x; b = c;} else if (h < 300) {r = x; b = c;} else {r = c; b = x;}
  const two = (val: number) => Math.max(0, Math.min(255, Math.round((val + m) * 255))).toString(16).padStart(2, '0');
  return ('#' + two(r) + two(g) + two(b)).toUpperCase();
};

const variantHsv = (hex: string, set: ColorSet) => {
  const {h, s, v} = colorHexToHsv(hex);
  if (set === 'default') return {h, s, v};
  if (s < 0.2) {
    if (set === 'darker') return {h, s, v: colorClamp01(v * 0.6)};
    if (set === 'pastel') return {h, s: s * 0.5, v: colorClamp01(v + 0.28)};
    return {h, s, v: colorClamp01(v * 1.25 + 0.02)};
  }
  if (set === 'darker') return {h, s: colorClamp01(s * 1.05), v: colorClamp01(v * 0.58)};
  if (set === 'pastel') return {h, s: s * 0.38, v: Math.max(v, 0.94)};
  return {h, s: 1, v: 1};
};

export interface PresetColor {
  hex: string;
  baseKey: string;
  set: ColorSet;
}

const buildPresetColors = (): PresetColor[] => {
  const out: PresetColor[] = [];
  const used = new Set<string>();
  for (const set of COLOR_SETS) {
    for (const baseHex of BASE_COLORS) {
      const hsv = variantHsv(baseHex, set);
      let hex = colorHsvToHex(hsv.h, hsv.s, hsv.v);
      let v = hsv.v;
      let guard = 0;
      while (used.has(hex) && guard < 24) {
        v = colorClamp01(v - 0.04);
        hex = colorHsvToHex(hsv.h, hsv.s, v);
        guard++;
      }
      used.add(hex);
      out.push({hex, baseKey: COLOR_NAMES[baseHex], set});
    }
  }
  return out;
};

export const PRESET_COLORS: PresetColor[] = buildPresetColors();

export const presetColorName = (p: PresetColor, t: (k: string, o?: any) => string): string => {
  const base = t(`colors.${p.baseKey}`);
  if (p.set === 'default') return base;
  if (p.set === 'darker') return t('colors.setDarker', {name: base});
  if (p.set === 'pastel') return t('colors.setPastel', {name: base});
  return t('colors.setNeon', {name: base});
};

export const MAX_CUSTOM_COLORS = 24;

export const normalizeCustomColors = (raw: unknown): string[] => {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (let i = 0; i < MAX_CUSTOM_COLORS; i++) {
    const v = typeof list[i] === 'string' ? (list[i] as string).toUpperCase() : '';
    out.push(/^#[0-9A-F]{6}$/.test(v) ? v : '');
  }
  return out;
};

export interface Relationship {
  id: string;
  fromId: string;
  toId: string;
  typeId: string;
  note?: string;
  createdAt: number;
}

export const PRESET_RELATIONSHIP_TYPES: RelationshipTypeDef[] = [
  {id: 'love', name: 'Love', directional: false, color: '#E87BA8', preset: true},
  {id: 'friend', name: 'Friend', directional: false, color: '#5BBF7A', preset: true},
  {id: 'ally', name: 'Ally', directional: false, color: '#D9B84A', preset: true},
  {id: 'rival', name: 'Rival', directional: false, color: '#E05B5B', preset: true},
];

export const allRelationshipTypes = (customTypes: RelationshipTypeDef[]): RelationshipTypeDef[] => {
  const overrides = new Map(customTypes.filter(t => t.preset).map(t => [t.id, t]));
  const presets = PRESET_RELATIONSHIP_TYPES
    .filter(p => !overrides.get(p.id)?.deleted)
    .map(p => {
      const o = overrides.get(p.id);
      return o ? {...p, ...o, overridden: true} : p;
    });
  return [...presets, ...customTypes.filter(t => !t.preset && !t.deleted)];
};

export const relationshipDegrees = (memberIds: string[], relationships: Relationship[]): Record<string, number> => {
  const degrees: Record<string, number> = {};
  for (const id of memberIds) degrees[id] = 0;
  for (const r of relationships) {
    if (degrees[r.fromId] !== undefined) degrees[r.fromId] += 1;
    if (degrees[r.toId] !== undefined) degrees[r.toId] += 1;
  }
  return degrees;
};

export type HistoryChangeType = 'front' | 'mood' | 'location' | 'note';
export type FrontTierKey = 'primary' | 'coFront' | 'coConscious';

export interface FrontTier {
  memberIds: string[];
  mood?: string;
  note: string;
  location?: string;
  energyLevel?: number;
}

export interface FrontState {
  primary: FrontTier;
  coFront: FrontTier;
  coConscious: FrontTier;
  startTime: number;
  memberSince?: Record<string, number>;
}

export interface HistoryEntry {
  memberIds: string[];
  startTime: number;
  endTime: number | null;
  note: string;
  mood?: string;
  location?: string;
  energyLevel?: number;
  coFrontIds?: string[];
  coFrontMood?: string;
  coFrontNote?: string;
  coFrontEnergy?: number;
  coFrontLocation?: string;
  coConsciousIds?: string[];
  coConsciousMood?: string;
  coConsciousNote?: string;
  coConsciousEnergy?: number;
  coConsciousLocation?: string;
  changeType?: HistoryChangeType;
  changeTime?: number;
  changeTier?: FrontTierKey;
}

export interface JournalEntry {
  id: string;
  title: string;
  body: string;
  authorIds: string[];
  hashtags: string[];
  password?: string;
  timestamp: number;
  pinned?: boolean;
}

export interface JournalTemplate {
  id: string;
  name: string;
  title: string;
  body: string;
  hashtags: string[];
  createdAt?: number;
}

export interface ShareSettings {
  showFront: boolean;
  showMembers: boolean;
  showDescriptions: boolean;
}

export type TextScale = 1.0 | 1.25 | 1.5;

export type AccountMode = 'system' | 'singlet';

export const SINGLET_HIDDEN_STATUS_NAMES = ['Blurry', 'Blendy', 'Rapid Switching', 'Dissociated'];
export const singletStatuses = (members: Member[]): Member[] =>
  members.filter(m => m.isCustomFront && !m.archived && !SINGLET_HIDDEN_STATUS_NAMES.includes(m.name));

export interface AppSettings {
  accountMode?: AccountMode;
  selfMemberId?: string;
  locations: string[];
  customMoods: string[];
  lightMode: boolean;
  gpsEnabled: boolean;
  filesEnabled: boolean;
  language: SupportedLanguage;
  notificationsEnabled: boolean;
  notificationRefreshMinutes?: number;
  /** Terminology Picker: user's own word per core term ('member', 'members',
   *  'group', 'groups', 'facet', 'facets', 'front', 'system'). Blank/absent =
   *  the app's default word. Swapped at translation time. */
  terminology?: Record<string, string>;
  /** Custom fronting level names ('primary', 'coFront', 'coConscious').
   *  Blank/absent = the app's default label. Applied at translation time to
   *  every tier label, badge and notification line. */
  tierNames?: Record<string, string>;
  // Default true. When false, the always-on front status (Android FGS
  // notification / iOS Live Activity) is suppressed — but friend alerts and
  // front-check reminders still fire. Requested by users whose lock screen
  // the persistent notification crowds (time-blindness, privacy).
  persistentFrontNotif?: boolean;
  activePaletteId: string;
  textScale: TextScale;
  memberSortMode?: MemberSortMode;
  // Sort for member lists inside group browses (System Manager, mirror
  // viewer) — same options as the Members list, remembered separately.
  groupSortMode?: MemberSortMode;
  frontCheckInterval?: number;
  noteboardNotifications?: boolean;
  appLockPassword?: string;
  useDyslexicFont?: boolean;
  fontChoice?: import('./theme').FontChoice;
  customFrontsSeeded?: boolean;
  memberListFields?: {groups?: boolean; descriptions?: boolean; pronouns?: boolean; roles?: boolean; count?: boolean; background?: 'plain' | 'color' | 'banner'};
}

export interface ExportPayload {
  _meta: {version: string; app: string; exportedAt: string;};
  system: SystemInfo;
  members: Member[];
  frontHistory: HistoryEntry[];
  journal: JournalEntry[];
  groups?: MemberGroup[];
  chatChannels?: ChatChannel[];
  chatCategories?: ChatCategory[];
  chatMessages?: Record<string, ChatMessage[]>;
  settings?: AppSettings;
  front?: FrontState | null;
  palettes?: any[];
  avatars?: Record<string, string>;
  banners?: Record<string, string>;
  customMoods?: string[];
  customFieldDefs?: CustomFieldDef[];
  noteboards?: NoteboardEntry[];
  polls?: MemberPoll[];
  journalTemplates?: JournalTemplate[];
  relationships?: Relationship[];
  relationshipTypes?: RelationshipTypeDef[];
  systemMapMembers?: string[];
  systemMapPositions?: Record<string, {x: number; y: number}>;
  medical?: MedicalData;
  planner?: PlannerData;
  whiteboard?: any;
  customColors?: string[];
  shareSettings?: ShareSettings;
}

export type ChatMessageType = 'text' | 'image' | 'file' | 'reply' | 'reaction';

export interface ChatMessage {
  id: string;
  channelId: string;
  authorId: string;
  type: ChatMessageType;
  content: string;
  replyToId?: string;
  reactions?: Record<string, string[]>;
  timestamp: number;
}

export interface ChatChannel {
  id: string;
  name: string;
  /** Undefined, or an id no category owns, means the channel sits above every category. */
  categoryId?: string;
  sortOrder?: number;
  archived?: boolean;
  archivedAt?: number;
  createdAt: number;
}

export interface ChatCategory {
  id: string;
  name: string;
  sortOrder?: number;
  collapsed?: boolean;
  createdAt: number;
}

/**
 * Ordering for both chat lists. sortOrder is optional because every channel
 * that existed before categories has none, and an import can hand us rows with
 * gaps or duplicates; falling back to createdAt keeps those in the order they
 * were made rather than collapsing them all to position zero.
 */
const byOrderThenAge = <T extends {sortOrder?: number; createdAt?: number; name?: string}>(a: T, b: T): number => {
  const ao = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
  const bo = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  const ac = typeof a.createdAt === 'number' ? a.createdAt : 0;
  const bc = typeof b.createdAt === 'number' ? b.createdAt : 0;
  if (ac !== bc) return ac - bc;
  return nameCompare(a.name, b.name);
};

export const sortChatCategories = (cats: ChatCategory[]): ChatCategory[] =>
  [...(cats || [])].sort(byOrderThenAge);

/**
 * Channels of one category, in order. `categoryId` null/undefined asks for the
 * uncategorized ones, which includes channels pointing at a category that has
 * been deleted — an orphan must never become invisible.
 */
export const chatChannelsIn = (
  channels: ChatChannel[],
  categoryId: string | null | undefined,
  categories: ChatCategory[],
): ChatChannel[] => {
  const known = new Set((categories || []).map(c => c.id));
  return [...(channels || [])]
    .filter(c => {
      const own = c.categoryId && known.has(c.categoryId) ? c.categoryId : null;
      return own === (categoryId || null);
    })
    .sort(byOrderThenAge);
};

export const DEFAULT_CHANNELS: {name: string}[] = [
  {name: 'General'},
  {name: 'Venting'},
  {name: 'Planning'},
];

export const DEFAULT_MOODS = [
  'Calm', 'Happy', 'Anxious', 'Tired', 'Energetic',
  'Dissociated', 'Grounded', 'Irritable', 'Sad', 'Focused',
];

export const translateMood = (mood: string, t: (k: string) => string): string => {
  if (!mood) return '';
  const parts = mood.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return '';
  const translateOne = (one: string): string => {
    const canon = DEFAULT_MOODS.find(d => d.toLowerCase() === one.toLowerCase());
    if (canon) {
      const translated = t(`mood.${canon}`);
      return translated && translated !== `mood.${canon}` ? translated : canon;
    }
    return one;
  };
  return parts.map(translateOne).join(', ');
};

export const MOOD_DELIMITER = ', ';
export const parseMoodList = (mood: string | undefined): string[] =>
  (mood || '').split(',').map(s => s.trim()).filter(Boolean);
export const serializeMoodList = (moods: string[]): string =>
  moods.filter(Boolean).map(s => s.trim()).filter(Boolean).join(MOOD_DELIMITER);
export const toggleMoodInList = (current: string | undefined, chip: string): string => {
  const list = parseMoodList(current);
  const i = list.indexOf(chip);
  if (i >= 0) list.splice(i, 1);
  else list.push(chip);
  return serializeMoodList(list);
};

export const EMPTY_TIER: FrontTier = {memberIds: [], note: ''};

export const migrateFrontState = (raw: any): FrontState | null => {
  if (!raw) return null;
  if (raw.primary) return raw as FrontState;
  return {
    primary: {memberIds: raw.memberIds || [], mood: raw.mood, note: raw.note || '', location: raw.location},
    coFront: {memberIds: [], note: ''},
    coConscious: {memberIds: [], note: ''},
    startTime: raw.startTime || Date.now(),
  };
};

export const historyEntryToFrontState = (entry: HistoryEntry): FrontState => ({
  primary: {
    memberIds: entry.memberIds,
    mood: entry.mood,
    note: entry.note || '',
    location: entry.location,
    energyLevel: entry.energyLevel,
  },
  coFront: {
    memberIds: entry.coFrontIds || [],
    mood: entry.coFrontMood,
    note: entry.coFrontNote || '',
    location: entry.coFrontLocation,
    energyLevel: entry.coFrontEnergy,
  },
  coConscious: {
    memberIds: entry.coConsciousIds || [],
    mood: entry.coConsciousMood,
    note: entry.coConsciousNote || '',
    location: entry.coConsciousLocation,
    energyLevel: entry.coConsciousEnergy,
  },
  startTime: entry.startTime,
});

export const findOpenFrontInHistory = (history: HistoryEntry[]): FrontState | null => {
  const openFrontEntry = history.find(entry =>
    entry.endTime === null &&
    entry.memberIds.length > 0 &&
    (!entry.changeType || entry.changeType === 'front')
  );

  return openFrontEntry ? historyEntryToFrontState(openFrontEntry) : null;
};

export const buildEffectiveEnd = (history: HistoryEntry[]): ((e: HistoryEntry) => number | null) => {
  const starts = history
    .filter(e => !e.changeType || e.changeType === 'front')
    .map(e => e.startTime)
    .sort((a, b) => a - b);
  return (e: HistoryEntry): number | null => {
    if (e.endTime != null) return e.endTime;
    let lo = 0; let hi = starts.length - 1; let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] > e.startTime) { ans = mid; hi = mid - 1; } else { lo = mid + 1; }
    }
    return ans === -1 ? null : starts[ans];
  };
};

export const isFrontEmpty = (f: FrontState | null): boolean =>
  !f || (f.primary.memberIds.length === 0 && f.coFront.memberIds.length === 0 && f.coConscious.memberIds.length === 0);

export const allFrontMemberIds = (f: FrontState | null): string[] =>
  f ? [...f.primary.memberIds, ...f.coFront.memberIds, ...f.coConscious.memberIds] : [];

/**
 * Picker ordering: whoever is in front floats to the top, in tier order
 * (primary, then co-front, then co-conscious); everyone else keeps the order
 * the caller already chose. Membership is matched by id against the list it is
 * given, so anyone the caller filtered out (archived, custom fronts) stays out.
 * The tiers are read defensively rather than through allFrontMemberIds because
 * a stored or synced front can be missing one, and this runs inside a render.
 */
export const frontersFirst = <T extends {id: string}>(items: T[], front: FrontState | null): T[] => {
  const tier = (x: any): string[] => (x && Array.isArray(x.memberIds) ? x.memberIds : []);
  const f = front as any;
  const ids = f ? [...tier(f.primary), ...tier(f.coFront), ...tier(f.coConscious)] : [];
  if (ids.length === 0) return items;
  const rank = new Map<string, number>();
  ids.forEach((id, i) => { if (!rank.has(id)) rank.set(id, i); });
  const fronting: T[] = [];
  const rest: T[] = [];
  for (const it of items) (rank.has(it.id) ? fronting : rest).push(it);
  fronting.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...fronting, ...rest];
};

export const withMemberSince = (next: FrontState | null, prev: FrontState | null, now: number): FrontState | null => {
  if (!next) return next;
  const prevSince = prev?.memberSince || {};
  const prevIds = new Set(prev ? allFrontMemberIds(prev) : []);
  const since: Record<string, number> = {};
  for (const id of allFrontMemberIds(next)) {
    since[id] = prevSince[id] ?? (prevIds.has(id) ? (prev?.startTime ?? now) : now);
  }
  return {...next, memberSince: since};
};

export const frontToHistoryEntry = (f: FrontState, endTime: number | null, changeType: HistoryChangeType = 'front', changeTier?: FrontTierKey): HistoryEntry => ({
  memberIds: f.primary.memberIds,
  startTime: f.startTime,
  endTime,
  note: f.primary.note,
  mood: f.primary.mood,
  location: f.primary.location,
  energyLevel: f.primary.energyLevel,
  coFrontIds: f.coFront.memberIds.length > 0 ? f.coFront.memberIds : undefined,
  coFrontMood: f.coFront.mood,
  coFrontNote: f.coFront.note || undefined,
  coFrontEnergy: f.coFront.energyLevel,
  coFrontLocation: f.coFront.location || undefined,
  coConsciousIds: f.coConscious.memberIds.length > 0 ? f.coConscious.memberIds : undefined,
  coConsciousMood: f.coConscious.mood,
  coConsciousNote: f.coConscious.note || undefined,
  coConsciousEnergy: f.coConscious.energyLevel,
  coConsciousLocation: f.coConscious.location || undefined,
  changeType,
  changeTime: changeType !== 'front' ? Date.now() : undefined,
  changeTier,
});

export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2);

const LOCALE_OVERRIDES: Record<string, string> = {en: 'en-US', pt: 'pt-BR', zh: 'zh-Hans', zhHant: 'zh-Hant'};

/**
 * Memoised per language. The validity probe below formats a Date, and this is
 * called once per rendered timestamp and once per comparison in every sorted
 * list — doing that work again for an answer that only changes when the user
 * switches language was pure waste on the hottest paths in the app.
 */
let localeCache: {lang: string; tag: string} | null = null;

export const getLocale = (): string => {
  const lang = i18n.language || 'en';
  if (localeCache && localeCache.lang === lang) return localeCache.tag;
  const candidate = LOCALE_OVERRIDES[lang] || lang;
  let tag = 'en-US';
  try {
    new Date(0).toLocaleDateString(candidate);
    tag = candidate;
  } catch (e) {
    tag = 'en-US';
  }
  localeCache = {lang, tag};
  return tag;
};

/**
 * Sort display text in the APP's language rather than the device's. A Swedish
 * system on an English phone was getting English collation, so å sorted next to
 * a instead of after z. Only for human-readable text: time strings and hex
 * colours are deliberately left on plain comparison, where locale rules would
 * be meaningless at best.
 */
export const nameCompare = (a: unknown, b: unknown): number =>
  String(a ?? '').localeCompare(String(b ?? ''), getLocale());

export const fmtTime = (ts: number): string =>
  new Date(ts).toLocaleString(getLocale(), {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

export const fmtDate = (ts: number): string =>
  new Date(ts).toLocaleDateString(getLocale(), {
    weekday: 'short', month: 'short', day: 'numeric',
  });

export const fmtDur = (start: number, end?: number | null): string => {
  const ms = (end ?? Date.now()) - start;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return m > 0 ? `${m}m` : '<1m';
};

export const getInitials = (name: string): string =>
  name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

export const isValidHex = (hex: string): boolean =>
  /^#[0-9A-Fa-f]{6}$/.test(hex);

export const normalizeHex = (input: string): string =>
  (input.startsWith('#') ? input : `#${input}`).toUpperCase();

// String() everywhere: imported or synced records can carry a non-string name
// or a missing color, and (42).localeCompare is "undefined is not a function"
// at render time — the whole Members tab dies on one bad record.
const asStr = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

/**
 * One predicate for every member search box: matches the visible name OR the
 * nickname. The nickname exists exactly for this — a member named "🕷" or in
 * a fancy font is unfindable by typing otherwise.
 */
export const memberMatchesSearch = (m: {name: string; nickname?: string}, search: string): boolean => {
  const q = asStr(search).trim().toLowerCase();
  if (!q) return true;
  return asStr(m.name).toLowerCase().includes(q) || asStr(m.nickname || '').toLowerCase().includes(q);
};

export const sortMembersBySearch = <T extends {name: string; nickname?: string}>(items: T[], search: string): T[] => {
  if (!search) return [...items].sort((a, b) => nameCompare(a.name, b.name));
  const q = search.toLowerCase();
  // Rank on the better of name/nickname, so a nickname hit surfaces the
  // member just like a name hit would.
  const starts = (x: T) => asStr(x.name).toLowerCase().startsWith(q) || asStr(x.nickname || '').toLowerCase().startsWith(q);
  return [...items].sort((a, b) => {
    const aStarts = starts(a);
    const bStarts = starts(b);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return nameCompare(asStr(a.name).toLowerCase(), asStr(b.name).toLowerCase());
  });
};

export const sortMembers = (members: Member[], mode: MemberSortMode = 'alphabetical'): Member[] => {
  const sorted = [...members];
  switch (mode) {
    case 'alphabetical': return sorted.sort((a, b) => nameCompare(a.name, b.name));
    case 'reverse-alphabetical': return sorted.sort((a, b) => nameCompare(b.name, a.name));
    case 'age': return sorted.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    // Colours stay on plain comparison: these are hex codes, not language.
    case 'color': return sorted.sort((a, b) => asStr(a.color).localeCompare(asStr(b.color)));
    case 'role': return sorted.sort((a, b) => nameCompare(a.role, b.role));
    case 'manual': return sorted.sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER));
    default: return sorted;
  }
};

export const TIER_LABELS: Record<FrontTierKey, string> = {
  primary: 'Primary Front',
  coFront: 'Co-Front',
  coConscious: 'Co-Conscious',
};

export const TEXT_SCALE_OPTIONS: {label: string; value: TextScale}[] = [
  {label: 'Normal', value: 1.0},
  {label: 'Large', value: 1.25},
  {label: 'Extra Large', value: 1.5},
];
