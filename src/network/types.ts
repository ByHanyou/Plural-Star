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
  showInNotification?: boolean;
}

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

export interface NetworkSettings {
  enabled: boolean;
  relayUrl?: string;
  token?: string;
}

export type MirrorFeature = 'members' | 'groups' | 'medical' | 'journal';

export type NetMessage =
  | { t: 'connect'; name: string; kind: 'friend' | 'device'; ack?: boolean; role?: 'source' | 'target' }
  | { t: 'disconnect' }
  | { t: 'ping' }
  | { t: 'front'; status: FrontShare | null }
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
  customFields?: {name: string; value: string | number | boolean | null; type?: string; markdown?: boolean}[];
}

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

// Which mirror features we've served to which friend. Lives under the mirror prefix so it
// is excluded from device sync. Needed so a bucket edit can revoke a copy already sent.
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
