import {create} from 'zustand';
import {SystemInfo, Member, FrontState, HistoryEntry, JournalEntry, JournalTemplate, ShareSettings, AppSettings, MemberGroup, ChatChannel, ChatMessage, MedicalData, DEFAULT_MEDICAL} from '../utils';
import type {CustomPalette} from '../theme';

export const DEFAULT_SETTINGS: AppSettings = {locations: [], customMoods: [], lightMode: false, gpsEnabled: false, filesEnabled: true, language: 'en', notificationsEnabled: true, noteboardNotifications: true, activePaletteId: '__dark__', textScale: 1.0, useDyslexicFont: false};

type AppStore = {
  loaded: boolean;
  setLoaded: (v: boolean) => void;
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
  allChatMessages: ChatMessage[];
  medical: MedicalData;
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
  setAllChatMessages: (v: ChatMessage[]) => void;
  setMedical: (v: MedicalData) => void;
  setLastKnownLocation: (v: string | undefined) => void;
};

export const useAppStore = create<AppStore>()(set => ({
  loaded: false,
  setLoaded: v => set({loaded: v}),
  system: {name: '', description: ''},
  members: [],
  front: null,
  history: [],
  journal: [],
  journalTemplates: [],
  shareSettings: {showFront: true, showMembers: true, showDescriptions: false},
  appSettings: DEFAULT_SETTINGS,
  groups: [],
  palettes: [],
  activePaletteId: '__dark__',
  chatChannels: [],
  allChatMessages: [],
  medical: DEFAULT_MEDICAL,
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
  setAllChatMessages: v => set({allChatMessages: v}),
  setMedical: v => set({medical: v}),
  setLastKnownLocation: v => set({lastKnownLocation: v}),
}));
