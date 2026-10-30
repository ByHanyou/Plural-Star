import type {TFunction} from 'i18next';
import type {HistoryEntry, SystemInfo} from '../utils';
import type {ImportMode} from './convert';
import type {
  PkSystem, PkMember, PkSwitch, PkGroup,
  SpUserDoc, SpMemberDoc, SpSwitchDoc, SpGroupDoc, SpFieldDoc,
  TbTupper, TbGroup,
  PsSystem, PsMember, PsFront, PsFieldDef, PsGroup, PsJournalEntry, PsChannel, PsPoll, PsRelationship, PsRelationshipType,
  PlExport, PxExport,
  AmSystem, AmMember, AmFront, AmField, AmTag, AmPost, AmBoardMessage,
} from './formats';

export interface PluralKitPreview {
  source: 'pluralkit';
  system: PkSystem;
  members: PkMember[];
  switches: PkSwitch[];
  groups: PkGroup[];
}

export interface SimplyPluralPreview {
  source: 'spfile';
  system: SpUserDoc;
  members: SpMemberDoc[];
  switches: SpSwitchDoc[];
  groups: SpGroupDoc[];
  customFields: SpFieldDoc[];
}

export interface TupperboxPreview {
  source: 'tupperbox';
  tuppers: TbTupper[];
  groups: TbGroup[];
}

export interface PluralSpacePreview {
  source: 'pluralspace';
  system: PsSystem;
  members: PsMember[];
  switches: PsFront[];
  customFields: PsFieldDef[];
  groups: PsGroup[];
  journal: PsJournalEntry[];
  chat: PsChannel[];
  polls: PsPoll[];
  relationshipTypes: PsRelationshipType[];
  relationships: PsRelationship[];
}

export interface PluralLogPreview {
  source: 'plurallog';
  db: PlExport;
  files: Record<string, Uint8Array>;
}

export interface ParallaxPreview {
  source: 'parallax';
  db: PxExport;
}

export interface AmpersandPreview {
  source: 'ampersand';
  system: AmSystem;
  systems: AmSystem[];
  members: AmMember[];
  switches: AmFront[];
  customFields: AmField[];
  tags: AmTag[];
  journalPosts: AmPost[];
  boardMessages: AmBoardMessage[];
}

export type ExtPreview =
  | PluralKitPreview
  | SimplyPluralPreview
  | TupperboxPreview
  | PluralSpacePreview
  | PluralLogPreview
  | ParallaxPreview
  | AmpersandPreview;

export type ImportSource =
  | 'backup'
  | 'journal'
  | 'pluralkit'
  | 'spfile'
  | 'ampersand'
  | 'tupperbox'
  | 'pluralspace'
  | 'plurallog'
  | 'parallax';

export type ImportStatus = 'idle' | 'success' | 'error';

export interface ExtImportCtx {
  extPreview: ExtPreview | null;
  extSel: Record<string, boolean>;
  importMode: ImportMode;
  system: SystemInfo;
  history: HistoryEntry[];
  t: TFunction;
  setRestoreError: (msg: string) => void;
  setExtPreview: (p: ExtPreview | null) => void;
  setImportStatus: (s: ImportStatus) => void;
  setImportMsg: (msg: string) => void;
  setImportSource: (s: ImportSource) => void;
  onDataImported: () => void;
}
