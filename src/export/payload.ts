import {AppSettings, ChatCategory, ChatChannel, ChatMessage, CustomFieldDef, ExportPayload, FrontState, HistoryEntry, JournalEntry, JournalTemplate, MedicalData, Member, MemberGroup, MemberPoll, NoteboardEntry, PlannerData, Relationship, RelationshipTypeDef, ShareSettings, SystemInfo, WhiteboardStroke} from '../utils';
import type {CustomPalette} from '../theme';
import {store, KEYS, chatMsgKey} from '../storage';
import {parallelMap} from '../utils/concurrency';
import type {ExportCategories} from './categories';

export const buildExportBase = async (
  system: SystemInfo,
  members: Member[],
  history: HistoryEntry[],
  journal: JournalEntry[],
  cat: ExportCategories,
): Promise<ExportPayload> => {
  const [groups, channels, chatCats, settings, front, palettes, customFieldDefs, noteboards, polls, journalTemplates, relationships, relationshipTypes, medical, planner, systemMapMembers, systemMapPositions, whiteboard, customColors, shareSettings] = await Promise.all([
    store.get<MemberGroup[]>(KEYS.groups),
    store.get<ChatChannel[]>(KEYS.chatChannels),
    store.get<ChatCategory[]>(KEYS.chatCategories),
    store.get<AppSettings>(KEYS.settings),
    store.get<FrontState>(KEYS.front),
    store.get<CustomPalette[]>(KEYS.palettes),
    store.get<CustomFieldDef[]>(KEYS.customFieldDefs),
    store.get<NoteboardEntry[]>(KEYS.noteboards),
    store.get<MemberPoll[]>(KEYS.polls),
    store.get<JournalTemplate[]>(KEYS.journalTemplates),
    store.get<Relationship[]>(KEYS.relationships),
    store.get<RelationshipTypeDef[]>(KEYS.relationshipTypes),
    store.get<MedicalData>(KEYS.medical),
    store.get<PlannerData>(KEYS.planner),
    store.get<string[]>(KEYS.systemMapMembers),
    store.get<Record<string, {x: number; y: number}>>(KEYS.systemMapPositions),
    store.get<WhiteboardStroke[]>(KEYS.whiteboard),
    store.get<string[]>(KEYS.customColors),
    store.get<ShareSettings>(KEYS.share),
  ]);

  const chatMessages: Record<string, ChatMessage[]> = {};
  if (cat.chat && channels && channels.length > 0) {
    const fetched = await parallelMap(
      channels,
      async (ch) => ({id: ch.id, msgs: await store.get<ChatMessage[]>(chatMsgKey(ch.id))}),
      6,
    );
    for (const entry of fetched) {
      if (entry && entry.msgs && entry.msgs.length > 0) chatMessages[entry.id] = entry.msgs;
    }
  }

  const membersForExport = members.map(({avatar: _a, banner: _b, ...rest}) => rest);

  return {
    _meta: {
      version: '1.2',
      app: 'Plural Star',
      exportedAt: new Date().toISOString(),
    },
    system: cat.system ? system : undefined,
    members: cat.members ? membersForExport : [],
    frontHistory: cat.frontHistory ? history : [],
    journal: cat.journal ? journal : [],
    groups: cat.groups ? (groups || []) : [],
    chatChannels: cat.chat ? (channels || []) : [],
    chatCategories: cat.chat ? (chatCats || []) : [],
    chatMessages: cat.chat ? chatMessages : {},
    settings: cat.settings ? (settings || undefined) : undefined,
    front: cat.frontHistory ? (front || undefined) : undefined,
    palettes: cat.palettes ? (palettes || []) : [],
    customMoods: cat.moods ? (settings?.customMoods || []) : [],
    customFieldDefs: cat.customFields ? (customFieldDefs || []) : [],
    noteboards: cat.noteboards ? (noteboards || []) : [],
    polls: cat.polls ? (polls || []) : [],
    journalTemplates: cat.journalTemplates ? (journalTemplates || []) : [],
    relationships: cat.relationships ? (relationships || []) : [],
    relationshipTypes: cat.relationships ? (relationshipTypes || []) : [],
    systemMapMembers: cat.relationships ? (systemMapMembers || []) : [],
    systemMapPositions: cat.relationships ? (systemMapPositions || undefined) : undefined,
    medical: cat.medical ? (medical || undefined) : undefined,
    planner: cat.planner ? (planner || undefined) : undefined,
    whiteboard: cat.whiteboard ? (whiteboard || undefined) : undefined,
    customColors: cat.palettes ? (customColors || undefined) : undefined,
    shareSettings: cat.settings ? (shareSettings || undefined) : undefined,
  };
};
