export interface SpUserDoc {
  id?: unknown;
  uid?: unknown;
  username?: string;
  name?: string;
  desc?: string;
  description?: string;
  content?: SpUserDoc;
}

export interface SpMemberDoc {
  _id?: string;
  id?: string;
  uid?: string;
  name?: string;
  pronouns?: string;
  role?: string;
  color?: string;
  desc?: string;
  archived?: boolean;
  avatarUrl?: string;
  avatarUuid?: string;
  info?: Record<string, unknown>;
  fields?: Record<string, unknown>;
  customFields?: Record<string, unknown>;
  content?: SpMemberDoc;
}

export interface SpSwitchContent {
  member?: string;
  members?: string[];
  startTime?: number | string | null;
  timestamp?: number | string;
  endTime?: number | string | null;
  live?: boolean;
  comment?: string;
}

export interface SpSwitchDoc extends SpSwitchContent {
  _id?: unknown;
  id?: unknown;
  content?: SpSwitchContent;
}

export interface SpGroupDoc {
  _id?: string;
  id?: string;
  name?: string;
  color?: string;
  members?: string[];
  content?: SpGroupDoc;
}

export interface SpFieldDoc {
  _id?: unknown;
  id?: unknown;
  uuid?: unknown;
  name?: string;
  type?: string | number;
  order?: number;
  content?: SpFieldDoc;
}

export interface SpExportFile {
  uid?: string;
  users?: SpUserDoc[];
  members?: SpMemberDoc[];
  frontHistory?: SpSwitchDoc[];
  groups?: SpGroupDoc[];
  customFields?: SpFieldDoc[];
}

export interface PkSystem {
  id?: string;
  uuid?: string;
  name?: string | null;
  description?: string | null;
}

export interface PkMember {
  id?: string;
  uuid?: string;
  name?: string | null;
  display_name?: string | null;
  pronouns?: string | null;
  color?: string | null;
  description?: string | null;
  avatar_url?: string | null;
  banner?: string | null;
  proxy_tags?: {prefix?: string | null; suffix?: string | null}[];
  keep_proxy?: boolean;
}

export interface PkSwitch {
  id?: string;
  timestamp?: string;
  members?: string[];
}

export interface PkGroup {
  id?: string;
  uuid?: string;
  name?: string | null;
  display_name?: string | null;
  color?: string | null;
  members?: string[];
}

export interface TbTupper {
  id?: number | string;
  name?: string;
  description?: string;
  brackets?: (string | null)[];
  group_id?: number | string | null;
  avatar_url?: string;
  created_at?: string | number;
}

export interface TbGroup {
  id?: number | string;
  name?: string;
  description?: string;
}

export interface TbExport {
  tuppers: TbTupper[];
  groups?: TbGroup[];
}

export interface PxMember {
  id?: number | string;
  sp_id?: string;
  sort_order?: number;
  name?: string;
  pronouns?: string;
  role?: string;
  color_theme?: string;
  description?: string;
  is_active?: boolean;
}

export interface PxFront {
  part_id?: number | string;
  started_at?: number | string;
  ended_at?: number | string | null;
}

export interface PxMessage {
  chat_id?: number | string;
  from_part_id?: number | string;
  body?: string;
  created_at?: number | string;
}

export interface PxExport {
  user_id: string;
  members: PxMember[];
  fronting_log: PxFront[];
  messages?: PxMessage[];
}

export interface PlMember {
  id?: number | string;
  name?: string;
  pronouns?: string;
  role?: string;
  color?: number;
  description?: string;
  profileMarkdown?: string;
  archived?: boolean;
  parentMemberId?: number | string | null;
  profileImagePath?: string;
}

export interface PlSwitch {
  memberId?: number | string;
  startTime?: number;
  endTime?: number | null;
  cofronterIds?: string;
  notes?: string;
}

export interface PlFolder {
  id?: number | string;
  name?: string;
  colorValue?: number;
  sortOrder?: number;
  parentFolderId?: number | string | null;
  memberIds?: string;
}

export interface PlJournal {
  text?: string;
  timestamp?: number;
  authorId?: number | string;
  tags?: string;
  emotion?: string;
}

export interface PlChannel {
  id?: number | string;
  name?: string;
}

export interface PlMessage {
  channelId?: number | string;
  authorId?: number | string;
  text?: string;
  timestamp?: number;
}

export interface PlFrontMessage {
  toMemberId?: number | string;
  fromMemberId?: number | string;
  text?: string;
  createdAt?: number;
  read?: boolean;
}

export interface PlExport {
  config: {systemName?: string};
  members: PlMember[];
  switchEvents: PlSwitch[];
  folders?: PlFolder[];
  journal?: PlJournal[];
  channels?: PlChannel[];
  messages?: PlMessage[];
  frontMessages?: PlFrontMessage[];
}

export interface PlManifest {
  exportJson?: string;
}

export interface PsRef {
  id?: unknown;
  name?: string;
}

export interface PsSystem {
  id?: unknown;
  name?: string;
  description?: string;
  color?: string;
  avatar_media_path?: string;
  banner_media_path?: string;
}

export interface PsFieldValue {
  field_name?: string;
  value?: unknown;
}

export interface PsMember {
  id?: unknown;
  name?: string;
  display_name?: string;
  pronouns?: string;
  role?: string | string[];
  color?: string;
  description?: string;
  is_archived?: boolean;
  is_custom_front?: boolean;
  avatar_media_path?: string;
  banner_media_path?: string;
  avatar_path?: string;
  groups?: (string | PsRef)[];
  custom_field_values?: PsFieldValue[];
  created_at?: string;
  private?: boolean;
}

export interface PsFront {
  id?: unknown;
  member_id?: unknown;
  type?: string;
  started_at?: string | number;
  ended_at?: string | number | null;
  comment?: string;
  is_live?: boolean;
}

export interface PsFieldDef {
  id?: unknown;
  name?: string;
  field_type?: string;
  is_multiple?: boolean;
  values?: unknown[];
}

export interface PsGroup {
  id?: unknown;
  name?: string;
  color?: string;
  description?: string;
}

export interface PsJournalEntry {
  id?: unknown;
  title?: string;
  content?: string;
  body?: string;
  date?: string;
  created_at?: string;
  members?: PsRef[];
  member_id?: unknown;
  author_member_ids?: unknown[];
}

export interface PsMessage {
  id?: unknown;
  member_id?: unknown;
  member_name?: string;
  content?: string;
  created_at?: string;
}

export interface PsChannel {
  id?: unknown;
  name?: string;
  created_at?: string;
  messages?: PsMessage[];
}

export interface PsPollOption {
  text?: string;
  votes?: {member_id?: unknown; member_name?: string}[];
}

export interface PsPoll {
  title?: string;
  description?: string;
  created_by_member?: PsRef;
  created_by_member_id?: unknown;
  created_at?: string;
  status?: string;
  closed?: boolean;
  closes_at?: string;
  options?: PsPollOption[];
}

export interface PsRelationshipType {
  id?: unknown;
  name?: string;
  inverse_name?: string | null;
  symmetric?: boolean;
  color?: string | null;
}

export interface PsRelationship {
  from_member_id?: unknown;
  to_member_id?: unknown;
  type_id?: unknown;
  note?: string | null;
}

export interface PsExport {
  _meta?: unknown;
  system: PsSystem;
  members: PsMember[];
  fronts: PsFront[];
  custom_fields?: PsFieldDef[];
  member_groups?: PsGroup[];
  journal_entries?: PsJournalEntry[];
  chat_channels?: PsChannel[];
  polls?: PsPoll[];
  relationship_types?: PsRelationshipType[];
  relationships?: PsRelationship[];
}

export interface OpAsset { id?: unknown; uri?: string }
export interface OpSystem { id?: unknown; name?: string; description?: string; color?: string; avatar_asset_id?: unknown; banner_asset_id?: unknown }
export interface OpTerm { id?: unknown; kind?: string; name?: string }
export interface OpAssignment { subject_type?: string; subject_id?: unknown; term_id?: unknown }
export interface OpField { id?: unknown; name?: string; field_type?: string }
export interface OpFieldValue { member_id?: unknown; subject_id?: unknown; custom_field_id?: unknown; field_id?: unknown; field_name?: string; value?: unknown }
export interface OpGroupMembership { member_id?: unknown; group_id?: unknown }
export interface OpMember {
  id?: unknown;
  name?: string;
  display_name?: string;
  pronouns?: string;
  description?: string;
  color?: string;
  archived?: boolean;
  is_custom_front?: boolean;
  avatar_asset_id?: unknown;
  banner_asset_id?: unknown;
  created_at?: string;
  privacy?: {visibility?: unknown};
  extensions?: {profile_visibility?: unknown};
}
export interface OpFrontAssignment { member_id?: unknown; front_role?: string; note?: string }
export interface OpPeriod {
  id?: unknown;
  member_id?: unknown;
  started_at?: string;
  ended_at?: string | null;
  note?: string;
  assignments?: OpFrontAssignment[];
}
export interface OpNote { id?: unknown; title?: string; body?: string; created_at?: string; entry_date?: string; member_id?: unknown; author_member_ids?: unknown[] }
export interface OpConversation { id?: unknown; name?: string; title?: string }
export interface OpChatMessage { id?: unknown; conversation_id?: unknown; member_id?: unknown; author_member_id?: unknown; body?: string; content?: string; created_at?: string }
export interface OpGroup { id?: unknown; name?: string; color?: string; description?: string }
export interface OpRoot {
  openplural_version: string;
  members: OpMember[];
  front_periods: OpPeriod[];
  systems?: OpSystem[];
  assets?: OpAsset[];
  taxonomy_terms?: OpTerm[];
  taxonomy_assignments?: OpAssignment[];
  custom_fields?: OpField[];
  custom_field_values?: OpFieldValue[];
  group_memberships?: OpGroupMembership[];
  groups?: OpGroup[];
  notes?: OpNote[];
  chat?: {conversations?: OpConversation[]; messages?: OpChatMessage[]};
  polls?: {polls?: PsPoll[]};
  relationships?: {types?: PsRelationshipType[]; edges?: PsRelationship[]};
  exported_at?: string;
}

export interface AmSystem { uuid?: unknown; name?: string; description?: string }
export interface AmMember {
  uuid?: unknown;
  name?: string;
  pronouns?: string;
  role?: string;
  color?: string;
  description?: string;
  isArchived?: boolean;
  isCustomFront?: boolean;
  isDissociativeState?: boolean;
  age?: string | number | null;
  system?: unknown;
  tags?: unknown[];
  image?: unknown;
  cover?: unknown;
  customFields?: unknown;
  dateCreated?: string | number;
}
export interface AmFront { member?: unknown; isMainFronter?: boolean; startTime?: string | number; endTime?: string | number | null; comment?: string; summary?: string }
export interface AmField { uuid?: unknown; name?: string; priority?: number }
export interface AmTag { uuid?: unknown; name?: string; color?: string; type?: string; isArchived?: boolean }
export interface AmPost { title?: string; body?: string; member?: unknown; members?: unknown; tags?: unknown[]; date?: string | number; isPinned?: boolean }
export interface AmPollVote { member?: unknown; reason?: string }
export interface AmPollEntry { choice?: string; votes?: AmPollVote[] }
export interface AmBoardMessage extends AmPost { poll?: {entries?: AmPollEntry[]} }
export interface AmDatabase {
  systems?: AmSystem[];
  members?: AmMember[];
  frontingEntries?: AmFront[];
  customFields?: AmField[];
  tags?: AmTag[];
  journalPosts?: AmPost[];
  boardMessages?: AmBoardMessage[];
}
export interface AmAppConfig { appConfig?: {defaultSystem?: unknown} }
export interface AmExportJson {
  database: AmDatabase;
  config?: AmAppConfig;
}

export interface OuNode { id: unknown; type?: string; properties?: Record<string, unknown> }
export interface OuEdge { type?: string; from?: unknown; to?: unknown }
export interface OuSystem { name?: unknown; desc?: unknown; ourcanaId?: string }
export interface OuMember {
  id?: unknown;
  name?: unknown;
  displayName?: unknown;
  showOnlyDisplayName?: unknown;
  pronouns?: unknown;
  desc?: unknown;
  color?: unknown;
  archived?: unknown;
  avatarUrl?: unknown;
  tagIds?: unknown[];
  ourcanaFieldValues?: Record<string, unknown>;
}
export interface OuFront { memberIds?: unknown[]; memberId?: unknown; startTime?: unknown; endTime?: unknown; isLive?: unknown }
export interface OuTag { id?: unknown; label?: unknown; name?: unknown; color?: unknown; parentId?: unknown }
export interface OuFieldDef { id?: unknown; name?: string; order?: number; type?: string }
export interface OuExport {
  format?: string;
  graph?: {nodes: OuNode[]; edges?: OuEdge[]};
  system?: OuSystem;
  members?: OuMember[];
  frontHistory?: OuFront[];
  tags?: OuTag[];
  ourcanaFieldDefs?: OuFieldDef[];
}
export interface OuAssetIndexEntry { role?: string; ownerId?: unknown; localPath?: string; isPrimary?: boolean }

export interface MxAlter {
  alter_id?: unknown;
  name?: string;
  display_name?: string;
  pronouns?: string;
  colour?: string;
  description?: string;
  is_archived?: boolean;
  avatar_data?: string;
  avatar_url?: string;
}
export interface MxFront { alter_id?: unknown; start_time?: number | string; end_time?: number | string | null; notes?: string }
export interface MxExport { app?: string; system?: {name?: string; description?: string}; alters?: MxAlter[]; front_entries?: MxFront[] }

export interface OcField { id?: unknown; name?: string; type?: string }
export interface OcUser { username?: string; description?: string; fields?: OcField[] }
export interface OcAlter { id?: unknown; name?: string; pronouns?: string; color?: string; description?: string; avatar_url?: string; fields?: {id?: unknown; value?: unknown}[] }
export interface OcTag { id?: unknown; name?: string; color?: string; alters?: unknown[] }
export interface OcFront { alter_id?: unknown; time_start?: unknown; time_end?: unknown; comment?: string }
export interface OcExport { user: OcUser; alters: OcAlter[]; tags?: OcTag[]; fronts?: OcFront[] }

export interface ZipManifest {
  app?: string;
  format_version?: string;
  system_name?: string;
  export_date?: string;
  exportJson?: string;
}

export const asArray = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : []);

export const cleanImportedName = (v: unknown): string => String(v).replace(/[\u0000-\u001F\u007F]/g, '').trim();
