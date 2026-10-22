import type { HistoryEntry, JournalEntry, WhiteboardStroke } from '../utils';
import { CLOUD_LINK_KEY } from '../cloud/cloudTypes';

export interface NetworkDef {
  id: string;
  name: string;
  relayUrl: string;
  token: string;
  isDefault?: boolean;
}

export interface Friend {
  peerId: string;
  edPublicKey: string;
  boxPublicKey: string;
  displayName: string;
  addedAt: number;
  kind: 'friend' | 'device';
  status: 'entered_theirs' | 'entered_mine' | 'accepted';
  initRole?: 'source' | 'target';
  peerRole?: 'source' | 'target';
  initPending?: boolean;
  initStartedAt?: number;
  lastStatus?: FrontShare | null;
  statusUpdatedAt?: number;
  statusAuthoredAt?: number;
  showInNotification?: boolean;
  notifyLevel?: FriendNotifyLevel;
  peerV?: number;
  needsRefriend?: boolean;
  sortOrder?: number;
}

export const PROTO_VERSION = 2;

export type FriendNotifyLevel = 'full' | 'alerts' | 'off';

export interface FrontShare {
  fronters: string;
  primary?: string;
  coFront?: string;
  coConscious?: string;
  mood?: string;
  location?: string;
  note?: string;
  startTime?: number;
}

export const IDENTITY_STORAGE_KEY = 'ps:networkIdentity';
export const IDENTITY_UNREADABLE_KEY = `${IDENTITY_STORAGE_KEY}.unreadable`;
export const IDENTITY_RESET_KEY = 'ps:networkIdentityReset';
export const FRIENDS_STORAGE_KEY = 'ps:networkFriends';
export const NETWORK_SETTINGS_KEY = 'ps:networkSettings';

export interface FriendTombstone {
  peerId: string;
  removedAt: number;
}
export const FRIEND_TOMBSTONES_KEY = 'ps:networkFriendTombstones';
export const FRIEND_TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const FRIEND_TOMBSTONE_CAP = 200;

export interface NetworkSettings {
  enabled: boolean;
  relayUrl?: string;
  token?: string;
}

export interface StoredIdentity {
  v: number;
  edSecretKey: string;
  boxSecretKey: string;
}

export interface SyncValue {
  v: string;
  h: string;
}

export type SyncKeys = Record<string, SyncValue>;

export interface SyncChunk {
  key: string;
  h: string;
  seq: number;
  total: number;
  data: string;
  init?: boolean;
  resolved?: boolean;
}

export const MIRROR_FEATURES = ['members', 'groups', 'medical', 'journal', 'history', 'systemProfile', 'whiteboard', 'planner'] as const;

export type MirrorFeature = (typeof MIRROR_FEATURES)[number];

export interface MirrorPayloadMessage {
  feature: MirrorFeature;
  seq: number;
  total: number;
  data: string;
  none?: boolean;
}

export interface MirrorMediaMessage {
  feature: MirrorFeature;
  memberId: string;
  data: string;
}

export interface MirrorGifMessage {
  feature: MirrorFeature;
  memberId: string;
  h: string;
  seq: number;
  total: number;
  data: string;
}

export type NetMessage =
  | { t: 'connect'; name: string; kind: 'friend' | 'device'; ack?: boolean; role?: 'source' | 'target'; v?: number }
  | { t: 'disconnect' }
  | { t: 'ping'; n?: string }
  | { t: 'front'; status: FrontShare | null; at?: number }
  | { t: 'front_req' }
  | { t: 'device_adopt'; identity: StoredIdentity; friends: Friend[] }
  | { t: 'friends_push'; friends: Friend[]; removed?: FriendTombstone[] }
  | { t: 'not_friends' }
  | { t: 'sync'; keys: SyncKeys; init?: boolean; initDone?: boolean; resolved?: boolean }
  | ({ t: 'sync_chunk' } & SyncChunk)
  | { t: 'sync_req'; hashes: Record<string, string> }
  | { t: 'dm'; body: string; ts: number }
  | { t: 'mirror_req'; feature: MirrorFeature; v?: number }
  | ({ t: 'mirror' } & MirrorPayloadMessage)
  | ({ t: 'mirror_media' } & MirrorMediaMessage)
  | { t: 'mirror_media_req'; feature: MirrorFeature; ids: string[] }
  | { t: 'mirror_media_done'; feature: MirrorFeature }
  | { t: 'mirror_gif_req'; feature: MirrorFeature; items: MirrorGifAsk[] }
  | ({ t: 'mirror_gif' } & MirrorGifMessage);

export interface MirrorGifAsk {
  id: string;
  h: string;
}

export interface MirrorMember {
  id: string;
  name: string;
  pronouns?: string;
  role?: string;
  color?: string;
  description?: string;
  archived?: boolean;
  hasAvatar?: boolean;
  hasBanner?: boolean;
  bannerGif?: string;
  customFields?: {name: string; value: string | number | boolean | null; type?: string; markdown?: boolean; fieldId?: string; gif?: string}[];
  connections?: {id: string; otherId: string; otherName: string; label: string; labelKey?: string; color?: string; note?: string}[];
}

export interface MirrorSystemProfile {
  name: string;
  description?: string;
  hasAvatar?: boolean;
  hasBanner?: boolean;
  bannerGif?: string;
}

export const MIRROR_SYSTEM_AVATAR_ID = '__systemAvatar__';
export const MIRROR_SYSTEM_BANNER_ID = '__systemBanner__';

export const MIRROR_GIF_MAX_BYTES = 8 * 1024 * 1024;
export const MIRROR_GIF_MAX_B64 = Math.ceil(MIRROR_GIF_MAX_BYTES / 3) * 4;
export const MIRROR_GIF_PART = 384 * 1024;
export const MIRROR_GIF_MIN_PART = 96 * 1024;
export const MIRROR_GIF_MAX_PARTS = Math.ceil(MIRROR_GIF_MAX_B64 / MIRROR_GIF_PART);
export const MIRROR_GIF_ASK_MAX = 200;
export const MIRROR_MEDIA_MAX = 600 * 1024;
export const MIRROR_MEDIA_REQ_MAX = 400;

export const GIF_B64_MAGIC = 'R0lGOD';

export interface MirrorGroup {
  id: string;
  name: string;
  color?: string;
  kind?: string;
  parentId?: string;
  sortOrder?: number;
}

export interface MirrorGroupsPayload {
  groups: MirrorGroup[];
  membership: Record<string, {id: string; name: string}[]>;
}

export interface MirrorAppointment {
  id: string;
  title: string;
  time: number;
  location?: string;
  notes?: string;
  repeat?: string;
  color?: string;
}

export interface MirrorReminder {
  id: string;
  title: string;
  times: string[];
  enabled: boolean;
  notes?: string;
  repeat?: string;
}

export interface MirrorPlannerPayload {
  appointments: MirrorAppointment[];
  reminders: MirrorReminder[];
}

export type MirrorPayload =
  | MirrorMember[]
  | MirrorGroupsPayload
  | HistoryEntry[]
  | JournalEntry[]
  | MirrorSystemProfile
  | WhiteboardStroke[]
  | MirrorPlannerPayload;

export interface MirrorCacheEntry {
  feature: MirrorFeature;
  fetchedAt: number;
  none?: boolean;
  data: MirrorPayload | null;
  media?: Record<string, string>;
}

export const MIRROR_CACHE_PREFIX = 'ps:friendMirror:';

export const MIRROR_SERVED_KEY = 'ps:friendMirror:served';
export const MIRROR_SENT_KEY = 'ps:friendMirror:sent';

export const SYNC_STATE_KEY = 'ps:networkSyncState';

export const SYNC_EXCLUDE_KEYS = [
  IDENTITY_STORAGE_KEY,
  NETWORK_SETTINGS_KEY,
  FRIENDS_STORAGE_KEY,
  SYNC_STATE_KEY,
  IDENTITY_UNREADABLE_KEY,
  IDENTITY_RESET_KEY,
  'ps:medical',
  CLOUD_LINK_KEY,
];

export const PENDING_FRONTS_KEY = 'ps.pendingFronts';
export const GW_REGISTERED_KEY = 'ps.gwRegistered';

export const FRONT_CLEARED_KEY = 'ps.frontClearedAt';

export const RENDEZVOUS_TTL_SECONDS = 30 * 60;

export const MAX_NOTIF_FRIENDS = 5;

export type PrivacyScopeMode = 'all' | 'select' | 'none';

export interface PrivacyScope {
  mode: PrivacyScopeMode;
  ids: string[];
}

export interface PrivacyBucket {
  id: string;
  name: string;
  members: PrivacyScope;
  groups: PrivacyScope;
  journal: PrivacyScope;
  history: PrivacyScope;
  customFields: PrivacyScope;
  medical: PrivacyScope;
  connections: PrivacyScope;
  systemProfile?: PrivacyScope;
  whiteboard?: PrivacyScope;
  planner?: PrivacyScope;
  facets?: PrivacyScope;
  customFronts?: PrivacyScope;
  front?: PrivacyScope;
  frontMood?: boolean;
  frontLocation?: boolean;
  frontNote?: boolean;
  friendPeerIds: string[];
  createdAt: number;
}

export interface FrontVisibility {
  show: boolean;
  mood: boolean;
  location: boolean;
  note: boolean;
}

export const PRIVACY_BUCKETS_KEY = 'ps:privacyBuckets';

export type ConnStatus =
  | 'disabled'
  | 'connecting'
  | 'online'
  | 'reconnecting'
  | 'error';
