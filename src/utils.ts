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
}

export const groupKind = (g: MemberGroup): GroupNodeKind => g.kind || 'group';
export const groupParent = (g: MemberGroup): string | null => g.parentId ?? null;

export const childrenOf = (nodes: MemberGroup[], parentId: string | null): MemberGroup[] =>
  nodes
    .filter(n => groupParent(n) === parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));

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
  mailboxPassword?: string;
}

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
  const presets = PRESET_RELATIONSHIP_TYPES.map(p => {
    const o = overrides.get(p.id);
    return o ? {...p, ...o, overridden: true} : p;
  });
  return [...presets, ...customTypes.filter(t => !t.preset)];
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
  coConsciousIds?: string[];
  coConsciousMood?: string;
  coConsciousNote?: string;
  coConsciousEnergy?: number;
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
  activePaletteId: string;
  textScale: TextScale;
  memberSortMode?: MemberSortMode;
  frontCheckInterval?: number;
  noteboardNotifications?: boolean;
  appLockPassword?: string;
  useDyslexicFont?: boolean;
  fontChoice?: import('./theme').FontChoice;
  customFrontsSeeded?: boolean;
  memberListFields?: {groups?: boolean; descriptions?: boolean; pronouns?: boolean; roles?: boolean};
}

export interface ExportPayload {
  _meta: {version: string; app: string; exportedAt: string;};
  system: SystemInfo;
  members: Member[];
  frontHistory: HistoryEntry[];
  journal: JournalEntry[];
  groups?: MemberGroup[];
  chatChannels?: ChatChannel[];
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
  medical?: MedicalData;
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
  archived?: boolean;
  archivedAt?: number;
  createdAt: number;
}

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
  },
  coFront: {
    memberIds: entry.coFrontIds || [],
    mood: entry.coFrontMood,
    note: entry.coFrontNote || '',
  },
  coConscious: {
    memberIds: entry.coConsciousIds || [],
    mood: entry.coConsciousMood,
    note: entry.coConsciousNote || '',
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
  coConsciousIds: f.coConscious.memberIds.length > 0 ? f.coConscious.memberIds : undefined,
  coConsciousMood: f.coConscious.mood,
  coConsciousNote: f.coConscious.note || undefined,
  coConsciousEnergy: f.coConscious.energyLevel,
  changeType,
  changeTime: changeType !== 'front' ? Date.now() : undefined,
  changeTier,
});

export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2);

const getLocale = (): string => {
  const lang = i18n.language || 'en';
  const localeMap: Record<string, string> = {en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR', fi: 'fi-FI', nb: 'nb-NO', zh: 'zh-CN', ja: 'ja-JP'};
  return localeMap[lang] || 'en-US';
};

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

export const sortMembersBySearch = <T extends {name: string}>(items: T[], search: string): T[] => {
  if (!search) return [...items].sort((a, b) => a.name.localeCompare(b.name));
  const q = search.toLowerCase();
  return [...items].sort((a, b) => {
    const an = a.name.toLowerCase();
    const bn = b.name.toLowerCase();
    const aStarts = an.startsWith(q);
    const bStarts = bn.startsWith(q);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return an.localeCompare(bn);
  });
};

export const sortMembers = (members: Member[], mode: MemberSortMode = 'alphabetical'): Member[] => {
  const sorted = [...members];
  switch (mode) {
    case 'alphabetical': return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'reverse-alphabetical': return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case 'age': return sorted.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    case 'color': return sorted.sort((a, b) => a.color.localeCompare(b.color));
    case 'role': return sorted.sort((a, b) => (a.role || '').localeCompare(b.role || ''));
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
