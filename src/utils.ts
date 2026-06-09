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
}

export const groupKind = (g: MemberGroup): GroupNodeKind => g.kind || 'group';
export const groupParent = (g: MemberGroup): string | null => g.parentId ?? null;

export const childrenOf = (nodes: MemberGroup[], parentId: string | null): MemberGroup[] =>
  nodes
    .filter(n => groupParent(n) === parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));

export const descendantsOf = (nodes: MemberGroup[], id: string): MemberGroup[] => {
  const out: MemberGroup[] = [];
  const walk = (pid: string) => {
    for (const n of nodes) {
      if (groupParent(n) === pid) { out.push(n); walk(n.id); }
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

// True if `candidateId` is `ofId` itself or any descendant of it — used to block
// re-parenting a node into its own subtree (which would create a cycle).
export const isDescendant = (nodes: MemberGroup[], candidateId: string, ofId: string): boolean => {
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
  avatar?: string;
  banner?: string;
  customFields?: CustomFieldValue[];
  sortOrder?: number;
  createdAt?: number;
  sourceId?: string;
  isCustomFront?: boolean;
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

export interface AppSettings {
  locations: string[];
  customMoods: string[];
  lightMode: boolean;
  gpsEnabled: boolean;
  filesEnabled: boolean;
  language: SupportedLanguage;
  notificationsEnabled: boolean;
  activePaletteId: string;
  textScale: TextScale;
  memberSortMode?: MemberSortMode;
  frontCheckInterval?: number;
  noteboardNotifications?: boolean;
  appLockPassword?: string;
  useDyslexicFont?: boolean;
  fontChoice?: import('./theme').FontChoice;
  customFrontsSeeded?: boolean;
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
    case 'manual': return sorted.sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
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
