export interface ExportCategories {
  system?: boolean;
  members?: boolean;
  avatars?: boolean;
  banners?: boolean;
  frontHistory?: boolean;
  journal?: boolean;
  groups?: boolean;
  chat?: boolean;
  moods?: boolean;
  palettes?: boolean;
  settings?: boolean;
  customFields?: boolean;
  noteboards?: boolean;
  polls?: boolean;
  journalTemplates?: boolean;
  relationships?: boolean;
  medical?: boolean;
  whiteboard?: boolean;
  planner?: boolean;
}

export const ALL_EXPORT_CATEGORIES: ExportCategories = {
  system: true, members: true, avatars: true, banners: true, frontHistory: true, journal: true,
  groups: true, chat: true, moods: true, palettes: true, settings: true,
  customFields: true, noteboards: true, polls: true, journalTemplates: true, relationships: true,
  medical: true, whiteboard: true, planner: true,
};
