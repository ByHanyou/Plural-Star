import {create} from 'zustand';
import type {Member, JournalEntry, FrontTierKey} from '../utils';
import {useAppStore} from './appStore';
import {ensureSelfMember} from './actions';
import {goTab} from '../app/navigation';

export type MemberModalState = {
  visible: boolean;
  session: number;
  member: Member | null;
  readOnly: boolean;
  addCustomFront: boolean;
  addFacet: boolean;
};

type OpenMemberOptions = {readOnly?: boolean; addCustomFront?: boolean; addFacet?: boolean; newSession?: boolean};

type UiStore = {
  memberModal: MemberModalState;
  customFrontModal: {visible: boolean; customFront: Member | null};
  journalModal: {visible: boolean; entry: JournalEntry | null};
  setFrontVisible: boolean;
  editFrontDetail: {visible: boolean; tier: FrontTierKey};
  systemVisible: boolean;
  systemProfileVisible: boolean;
  mapFocus: {id: string; n: number} | null;
  systemMapRelCount: number;
  editHistoryIndex: number | null;
  hubResetKey: number;
  openMember: (member: Member | null, options?: OpenMemberOptions) => void;
  openMemberById: (id: string) => void;
  openNewMember: () => void;
  openNewFacet: () => void;
  viewMemberEntry: (m: Member) => void;
  viewArchivedMember: (m: Member) => void;
  openProfileEditor: () => Promise<void>;
  closeMember: () => void;
  openCustomFront: (customFront: Member | null) => void;
  closeCustomFront: () => void;
  openJournal: (entry: JournalEntry | null) => void;
  closeJournal: () => void;
  openSetFront: () => void;
  openSetStatus: () => Promise<void>;
  closeSetFront: () => void;
  openEditFrontDetail: (tier: FrontTierKey) => void;
  closeEditFrontDetail: () => void;
  openSystem: () => void;
  closeSystem: () => void;
  openSystemProfile: () => void;
  closeSystemProfile: () => void;
  showMemberOnMap: (id: string) => void;
  setSystemMapRelCount: (n: number) => void;
  editHistoryEntry: (index: number) => void;
  clearEditHistory: () => void;
  reselectHub: () => void;
};

export const useUiStore = create<UiStore>()((set, get) => ({
  memberModal: {visible: false, session: 0, member: null, readOnly: false, addCustomFront: false, addFacet: false},
  customFrontModal: {visible: false, customFront: null},
  journalModal: {visible: false, entry: null},
  setFrontVisible: false,
  editFrontDetail: {visible: false, tier: 'primary'},
  systemVisible: false,
  systemProfileVisible: false,
  mapFocus: null,
  systemMapRelCount: 0,
  editHistoryIndex: null,
  hubResetKey: 0,
  openMember: (member, options = {}) => set(s => {
    const prev = s.memberModal;
    const newSession = options.newSession ?? true;
    return {memberModal: {
      visible: true,
      session: newSession ? prev.session + 1 : prev.session,
      member,
      readOnly: options.readOnly ?? prev.readOnly,
      addCustomFront: options.addCustomFront ?? prev.addCustomFront,
      addFacet: options.addFacet ?? prev.addFacet,
    }};
  }),
  openMemberById: id => {
    const m = useAppStore.getState().members.find(mb => mb.id === id);
    if (!m) return;
    get().openMember(m, {readOnly: true, newSession: !get().memberModal.visible});
  },
  openNewMember: () => get().openMember(null, {readOnly: false, addCustomFront: false, addFacet: false}),
  openNewFacet: () => get().openMember(null, {readOnly: false, addCustomFront: false, addFacet: true}),
  viewMemberEntry: m => {
    if (m.isCustomFront) get().openCustomFront(m);
    else get().openMember(m, {readOnly: true});
  },
  viewArchivedMember: m => get().openMember(m, {readOnly: true}),
  openProfileEditor: async () => {
    const self = await ensureSelfMember();
    get().openMember(self, {readOnly: false, addCustomFront: false});
  },
  closeMember: () => set(s => ({memberModal: {...s.memberModal, visible: false, readOnly: false, addCustomFront: false, addFacet: false}})),
  openCustomFront: customFront => set({customFrontModal: {visible: true, customFront}}),
  closeCustomFront: () => set({customFrontModal: {visible: false, customFront: null}}),
  openJournal: entry => set({journalModal: {visible: true, entry}}),
  closeJournal: () => set(s => ({journalModal: {...s.journalModal, visible: false}})),
  openSetFront: () => set({setFrontVisible: true}),
  openSetStatus: async () => {
    await ensureSelfMember();
    set({setFrontVisible: true});
  },
  closeSetFront: () => set({setFrontVisible: false}),
  openEditFrontDetail: tier => set({editFrontDetail: {visible: true, tier}}),
  closeEditFrontDetail: () => set(s => ({editFrontDetail: {...s.editFrontDetail, visible: false}})),
  openSystem: () => set({systemVisible: true}),
  closeSystem: () => set({systemVisible: false}),
  openSystemProfile: () => set({systemProfileVisible: true}),
  closeSystemProfile: () => set({systemProfileVisible: false}),
  showMemberOnMap: id => {
    get().closeMember();
    set({mapFocus: {id, n: Date.now()}});
    goTab('hub');
  },
  setSystemMapRelCount: n => set({systemMapRelCount: n}),
  editHistoryEntry: index => {
    set({editHistoryIndex: index});
    goTab('hub');
  },
  clearEditHistory: () => set({editHistoryIndex: null}),
  reselectHub: () => set(s => ({hubResetKey: s.hubResetKey + 1})),
}));
