import {create} from 'zustand';
import {SystemInfo, Member, FrontState, HistoryEntry, JournalEntry, JournalTemplate, ShareSettings, AppSettings, MemberGroup, ChatChannel, ChatCategory, ChatMessage, MedicalData, DEFAULT_MEDICAL, PlannerData, DEFAULT_PLANNER, EMPTY_SYSTEM, DEFAULT_SHARE, DEFAULT_SETTINGS} from '../utils';
import type {CustomPalette} from '../theme';
import {DARK_PALETTE} from '../theme';

type AppData = {
  system: SystemInfo;
  members: Member[];
  front: FrontState | null;
  history: HistoryEntry[];
  journal: JournalEntry[];
  journalTemplates: JournalTemplate[];
  shareSettings: ShareSettings;
  appSettings: AppSettings;
  groups: MemberGroup[];
  palettes: CustomPalette[];
  activePaletteId: string;
  chatChannels: ChatChannel[];
  chatCategories: ChatCategory[];
  allChatMessages: ChatMessage[];
  medical: MedicalData;
  planner: PlannerData;
};

const EMPTY_DATA: AppData = {
  system: EMPTY_SYSTEM,
  members: [],
  front: null,
  history: [],
  journal: [],
  journalTemplates: [],
  shareSettings: DEFAULT_SHARE,
  appSettings: DEFAULT_SETTINGS,
  groups: [],
  palettes: [],
  activePaletteId: DARK_PALETTE.id,
  chatChannels: [],
  chatCategories: [],
  allChatMessages: [],
  medical: DEFAULT_MEDICAL,
  planner: DEFAULT_PLANNER,
};

type AppStore = AppData & {
  loaded: boolean;
  setLoaded: (v: boolean) => void;
  lastKnownLocation: string | undefined;
  setSystem: (v: SystemInfo) => void;
  setMembers: (v: Member[]) => void;
  setFront: (v: FrontState | null) => void;
  setHistory: (v: HistoryEntry[]) => void;
  setJournal: (v: JournalEntry[]) => void;
  setJournalTemplates: (v: JournalTemplate[]) => void;
  setShareSettings: (v: ShareSettings) => void;
  setAppSettings: (v: AppSettings) => void;
  setGroups: (v: MemberGroup[]) => void;
  setPalettes: (v: CustomPalette[]) => void;
  setActivePaletteId: (v: string) => void;
  setChatChannels: (v: ChatChannel[]) => void;
  setChatCategories: (v: ChatCategory[]) => void;
  setAllChatMessages: (v: ChatMessage[]) => void;
  setMedical: (v: MedicalData) => void;
  setPlanner: (v: PlannerData) => void;
  setLastKnownLocation: (v: string | undefined) => void;
  resetData: () => void;
};

export const useAppStore = create<AppStore>()(set => ({
  ...EMPTY_DATA,
  loaded: false,
  setLoaded: v => set({loaded: v}),
  lastKnownLocation: undefined,
  setSystem: v => set({system: v}),
  setMembers: v => set({members: v}),
  setFront: v => set({front: v}),
  setHistory: v => set({history: v}),
  setJournal: v => set({journal: v}),
  setJournalTemplates: v => set({journalTemplates: v}),
  setShareSettings: v => set({shareSettings: v}),
  setAppSettings: v => set({appSettings: v}),
  setGroups: v => set({groups: v}),
  setPalettes: v => set({palettes: v}),
  setActivePaletteId: v => set({activePaletteId: v}),
  setChatChannels: v => set({chatChannels: v}),
  setChatCategories: v => set({chatCategories: v}),
  setAllChatMessages: v => set({allChatMessages: v}),
  setMedical: v => set({medical: v}),
  setPlanner: v => set({planner: v}),
  setLastKnownLocation: v => set({lastKnownLocation: v}),
  resetData: () => set(EMPTY_DATA),
}));
