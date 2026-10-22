import type {SupportedLanguage} from '../i18n/i18n';
import type {CustomPalette} from '../themeColors';
import type {FontChoice} from '../theme';

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
  linkedMemberId?: string;
}

export type CustomFieldType = 'text' | 'markdown' | 'date' | 'dateRange' | 'number' | 'toggle' | 'color' | 'month' | 'year' | 'monthYear' | 'timestamp' | 'monthDay' | 'image';

export interface WhiteboardStroke {
  id: string;
  c: string;
  w: number;
  pts: number[];
}

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

interface PollOption {
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
  multipleChoice?: boolean;
}

export type MemberSortMode = 'alphabetical' | 'reverse-alphabetical' | 'age' | 'color' | 'role' | 'manual';
export type FrontSortMode = 'added' | 'az' | 'za' | 'custom';

export interface Member {
  id: string;
  name: string;
  pronouns: string;
  role: string;
  color: string;
  emoji?: string;
  description: string;
  tags?: string[];
  groupIds?: string[];
  archived?: boolean;
  deleted?: boolean;
  avatar?: string;
  avatarTransparent?: boolean;
  profileBg?: boolean;
  private?: boolean;
  banner?: string;
  customFields?: CustomFieldValue[];
  sortOrder?: number;
  createdAt?: number;
  sourceId?: string;
  isCustomFront?: boolean;
  seedKey?: string;
  isFacet?: boolean;
  nickname?: string;
  mailboxPassword?: string;
  pkProxyTags?: {prefix?: string | null; suffix?: string | null}[];
  pkAvatarUrl?: string;
  pkBannerUrl?: string;
  pkKeepProxy?: boolean;
}

export interface RelationshipTypeDef {
  id: string;
  name: string;
  inverseName?: string;
  directional: boolean;
  color?: string;
  preset?: boolean;
  overridden?: boolean;
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

export type PlannerRepeat = 'daily' | 'everyOtherDay' | 'weekly' | 'everyOtherWeek' | 'monthly' | 'everyOtherMonth' | 'annually';
export type PlannerReminderRepeat = PlannerRepeat | 'once';

export interface PlannerAppointment {
  id: string;
  title: string;
  time: number;
  location?: string;
  notes?: string;
  reminderMinutesBefore?: number;
  repeat?: PlannerRepeat;
  color?: string;
  createdAt: number;
}

export interface PlannerReminder {
  id: string;
  title: string;
  times: string[];
  enabled: boolean;
  notes?: string;
  repeat?: PlannerReminderRepeat;
  startDate?: number;
  createdAt: number;
}

export interface PlannerData {
  appointments: PlannerAppointment[];
  reminders: PlannerReminder[];
  markColor?: string;
}

export interface Relationship {
  id: string;
  fromId: string;
  toId: string;
  typeId: string;
  note?: string;
  createdAt: number;
}

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

type AccountMode = 'system' | 'singlet';

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
  terminology?: Record<string, string>;
  tierNames?: Record<string, string>;
  persistentFrontNotif?: boolean;
  activePaletteId: string;
  textScale: TextScale;
  memberSortMode?: MemberSortMode;
  groupSortMode?: MemberSortMode;
  frontSortMode?: FrontSortMode;
  frontCustomOrder?: string[];
  frontCheckInterval?: number;
  noteboardNotifications?: boolean;
  appLockPassword?: string;
  useDyslexicFont?: boolean;
  fontChoice?: FontChoice;
  customFrontsSeeded?: boolean;
  memberListFields?: {groups?: boolean; descriptions?: boolean; pronouns?: boolean; roles?: boolean; count?: boolean; background?: 'plain' | 'color' | 'banner'; browse?: boolean};
}

export interface ExportPayload {
  _meta: {version: string; app: string; exportedAt: string;};
  system?: SystemInfo;
  members: Member[];
  frontHistory: HistoryEntry[];
  journal: JournalEntry[];
  groups?: MemberGroup[];
  chatChannels?: ChatChannel[];
  chatCategories?: ChatCategory[];
  chatMessages?: Record<string, ChatMessage[]>;
  settings?: AppSettings;
  front?: FrontState | null;
  palettes?: CustomPalette[];
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
  whiteboard?: WhiteboardStroke[];
  customColors?: string[];
  shareSettings?: ShareSettings;
}

type ChatMessageType = 'text' | 'image' | 'file' | 'reply' | 'reaction';

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
