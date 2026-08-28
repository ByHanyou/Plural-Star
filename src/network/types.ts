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
  /** The AUTHOR's clock when they produced this front, carried on both the
   *  socket message and the gateway cache. Two phones are rarely awake at the
   *  same moment, so a front often arrives by whichever lane wins; comparing
   *  one author's own timestamps is the only skew-free way to tell which copy
   *  is newer. Absent for peers on builds that predate it. */
  statusAuthoredAt?: number;
  showInNotification?: boolean;
  notifyLevel?: FriendNotifyLevel;
  /** Protocol version this peer advertised on connect. Absent = pre-versioning build. */
  peerV?: number;
  /** The peer told us it no longer has this friendship (not_friends bounce).
   *  The row is kept — removing stored data is the user's call — but the UI
   *  shows a re-add prompt instead of presenting stale fronts as current. */
  needsRefriend?: boolean;
}

/**
 * 2 = understands device_adopt / friends_push (shared system identity).
 * A peer that does not advertise at least this stays on the older behaviour:
 * separate identities per device, friends not shared. Never assume support.
 */
export const PROTO_VERSION = 2;

export type FriendNotifyLevel = 'full' | 'alerts' | 'off';

export const friendNotifyLevel = (f: Friend): FriendNotifyLevel =>
  f.notifyLevel ?? (f.showInNotification ? 'full' : 'alerts');

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

export interface RendezvousRecord {
  peerId: string;
  edPublicKey: string;
  boxPublicKey: string;
  sig: string;
}

export const FRIENDS_STORAGE_KEY = 'ps:networkFriends';
export const NETWORK_SETTINGS_KEY = 'ps:networkSettings';

/**
 * Removals, remembered. friends_push only ever adds/updates, so a linked
 * sibling device used to resurrect a friend the user had removed — leaving a
 * ghost one-way friendship where this side shows a frozen "last received copy"
 * forever and the other side silently drops every message. Tombstones ride the
 * same friends_push channel; last write wins against row timestamps.
 */
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

export type MirrorFeature = 'members' | 'groups' | 'medical' | 'journal' | 'history' | 'systemProfile';

export type NetMessage =
  | { t: 'connect'; name: string; kind: 'friend' | 'device'; ack?: boolean; role?: 'source' | 'target'; v?: number }
  | { t: 'disconnect' }
  | { t: 'ping' }
  | { t: 'front'; status: FrontShare | null; at?: number }
  | { t: 'front_req' }
  | { t: 'device_adopt'; identity: {v: number; edSecretKey: string; boxSecretKey: string}; friends: Friend[] }
  // Friend records only (never device records, never the identity). Sent to
  // linked devices on change. Deliberately NOT part of the key sync: the friends
  // store also holds each device's own link records and live front status, so
  // hash-comparing it whole would churn forever between devices and re-push on
  // every incoming friend front update.
  | { t: 'friends_push'; friends: Friend[]; removed?: FriendTombstone[] }
  // Authenticated "I don't have this friendship" bounce, sent (rate-limited)
  // when an accepted-only message arrives from a peer we have no accepted row
  // for. Lets the other side stop presenting stale data as live and prompt a
  // re-add, instead of the eternal "Offline — last received copy". Envelope
  // auth means only the true peer can say this about itself. Older builds
  // ignore the unknown type.
  | { t: 'not_friends' }
  | { t: 'sync'; keys: Record<string, {v: string; h: string}>; init?: boolean; initDone?: boolean }
  | { t: 'sync_chunk'; key: string; h: string; seq: number; total: number; data: string; init?: boolean }
  | { t: 'sync_req'; hashes: Record<string, string> }
  | { t: 'dm'; body: string; ts: number }
  | { t: 'mirror_req'; feature: MirrorFeature }
  | { t: 'mirror'; feature: MirrorFeature; seq: number; total: number; data: string; none?: boolean }
  | { t: 'mirror_media'; feature: MirrorFeature; memberId: string; data: string };

export interface MirrorMember {
  id: string;
  name: string;
  pronouns?: string;
  role?: string;
  color?: string;
  description?: string;
  archived?: boolean;
  customFields?: {name: string; value: string | number | boolean | null; type?: string; markdown?: boolean; fieldId?: string}[];
  connections?: {id: string; otherId: string; otherName: string; label: string; labelKey?: string; color?: string; note?: string}[];
}

/**
 * What a friend receives for the systemProfile mirror. Deliberately just the
 * four fields the profile screen shows: no settings, no palettes, no passwords.
 * Avatar and banner arrive separately as mirror_media under the synthetic ids
 * below, because the payload itself is chunked as text.
 */
export interface MirrorSystemProfile {
  name: string;
  description?: string;
  // Which images this payload is followed by. The receiver keeps exactly these
  // and drops the rest: clearing everything on arrival would race the images,
  // which land ~400ms later on their own path, and keeping everything would
  // leave a banner on screen after it was removed.
  hasAvatar?: boolean;
  hasBanner?: boolean;
}

export const MIRROR_SYSTEM_AVATAR_ID = '__systemAvatar__';
export const MIRROR_SYSTEM_BANNER_ID = '__systemBanner__';

export interface MirrorGroup {
  id: string;
  name: string;
  color?: string;
  kind?: string;
  parentId?: string;
  sortOrder?: number;
}

export interface MirrorCacheEntry {
  feature: MirrorFeature;
  fetchedAt: number;
  none?: boolean;
  data: any;
  media?: Record<string, string>;
}

export const MIRROR_CACHE_PREFIX = 'ps:friendMirror:';

export const MIRROR_SERVED_KEY = 'ps:friendMirror:served';

export const SYNC_EXCLUDE_KEYS = [
  'ps:networkIdentity',
  'ps:networkSettings',
  'ps:networkFriends',
  'ps:networkSyncState',
  'ps:deviceCodes',
  'ps:medical',
];

export const SYNC_STATE_KEY = 'ps:networkSyncState';
export const PENDING_FRONTS_KEY = 'ps.pendingFronts';
/**
 * Whether this device currently has a live push registration at the gateway.
 * DOT prefix: device-local, never syncs or exports — the registration belongs to
 * this device's tokens. Persisted because it decides whether we still owe the
 * gateway a clear-out, and that debt has to survive an app restart.
 */
export const GW_REGISTERED_KEY = 'ps.gwRegistered';

/**
 * When this device last set the front to empty. DOT prefix: device-local, never
 * syncs or exports — each device only needs its own clear time to defend its own
 * state, so this costs nothing on the wire.
 *
 * A cleared front is stored as `null`, which carries no startTime, so the
 * last-write-wins guard on ps:front had nothing to compare against and a peer
 * holding a week-old front would happily overwrite the clear. This timestamp is
 * that missing side of the comparison.
 */
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
  // All-or-nothing: the system profile is one object, so there is nothing to
  // select within it. Absent on buckets saved before this existed, which
  // normalizeBucket reads as 'none' — an old bucket never starts sharing the
  // profile because the app updated.
  systemProfile?: PrivacyScope;
  friendPeerIds: string[];
  createdAt: number;
}

export const PRIVACY_BUCKETS_KEY = 'ps:privacyBuckets';

export type ConnStatus =
  | 'disabled'
  | 'connecting'
  | 'online'
  | 'reconnecting'
  | 'error';
