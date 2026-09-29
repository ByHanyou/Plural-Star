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

export type MirrorFeature = 'members' | 'groups' | 'medical' | 'journal' | 'history' | 'systemProfile' | 'whiteboard' | 'planner';

export type NetMessage =
  | { t: 'connect'; name: string; kind: 'friend' | 'device'; ack?: boolean; role?: 'source' | 'target'; v?: number }
  | { t: 'disconnect' }
  | { t: 'ping'; n?: string }
  | { t: 'front'; status: FrontShare | null; at?: number }
  | { t: 'front_req' }
  | { t: 'device_adopt'; identity: {v: number; edSecretKey: string; boxSecretKey: string}; friends: Friend[] }
  | { t: 'friends_push'; friends: Friend[]; removed?: FriendTombstone[] }
  | { t: 'not_friends' }
  | { t: 'sync'; keys: Record<string, {v: string; h: string}>; init?: boolean; initDone?: boolean; resolved?: boolean }
  | { t: 'sync_chunk'; key: string; h: string; seq: number; total: number; data: string; init?: boolean; resolved?: boolean }
  | { t: 'sync_req'; hashes: Record<string, string> }
  | { t: 'dm'; body: string; ts: number }
  | { t: 'mirror_req'; feature: MirrorFeature }
  | { t: 'mirror'; feature: MirrorFeature; seq: number; total: number; data: string; none?: boolean }
  | { t: 'mirror_media'; feature: MirrorFeature; memberId: string; data: string }
  | { t: 'mirror_gif_req'; feature: MirrorFeature; items: MirrorGifAsk[] }
  | { t: 'mirror_gif'; feature: MirrorFeature; memberId: string; h: string; seq: number; total: number; data: string };

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
export const MIRROR_GIF_MAX_PARTS = Math.ceil(MIRROR_GIF_MAX_B64 / MIRROR_GIF_PART);
export const MIRROR_GIF_ASK_MAX = 200;

const MIRROR_GIF_HASH_RE = /^[A-Za-z0-9-]{1,64}$/;

export const isMirrorGifHash = (h: unknown): h is string => typeof h === 'string' && MIRROR_GIF_HASH_RE.test(h);

export const mirrorGifHash = (b64: string): string => {
  const n = b64.length;
  const step = Math.max(1, Math.floor(n / 8192));
  let h = 0x811c9dc5;
  for (let i = 0; i < n; i += step) {
    h ^= b64.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  for (let i = Math.max(0, n - 512); i < n; i++) {
    h ^= b64.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${n.toString(36)}-${(h >>> 0).toString(16)}`;
};

export const isMirrorGifB64 = (b64: string): boolean => {
  const n = b64.length;
  if (n === 0 || n > MIRROR_GIF_MAX_B64 || n % 4 !== 0 || !b64.startsWith('R0lGOD')) return false;
  const valid = (i: number): boolean => {
    const c = b64.charCodeAt(i);
    return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 47 || (c === 61 && i >= n - 2);
  };
  const step = Math.max(1, Math.floor(n / 4096));
  for (let i = 0; i < n; i += step) if (!valid(i)) return false;
  for (let i = Math.max(0, n - 4); i < n; i++) if (!valid(i)) return false;
  return true;
};

export const mirrorGifDataB64 = (src: unknown): string | null => {
  if (typeof src !== 'string' || !src.startsWith('data:')) return null;
  const comma = src.indexOf(',');
  if (comma < 0 || !src.slice(0, comma).endsWith(';base64')) return null;
  const b64 = src.slice(comma + 1);
  return b64.startsWith('R0lGOD') && b64.length <= MIRROR_GIF_MAX_B64 ? b64 : null;
};

export const mirrorGifWants = (feature: MirrorFeature, data: unknown): Map<string, string> => {
  const out = new Map<string, string>();
  if (feature === 'members' && Array.isArray(data)) {
    for (const mm of data as MirrorMember[]) {
      if (!mm || typeof mm.id !== 'string' || !mm.id) continue;
      if (isMirrorGifHash(mm.bannerGif)) out.set(`${mm.id}#banner`, mm.bannerGif);
      for (const cf of Array.isArray(mm.customFields) ? mm.customFields : []) {
        if (cf && cf.type === 'image' && typeof cf.fieldId === 'string' && cf.fieldId && isMirrorGifHash(cf.gif)) out.set(`${mm.id}#cf:${cf.fieldId}`, cf.gif);
      }
    }
  } else if (feature === 'systemProfile' && data && typeof data === 'object') {
    const sp = data as MirrorSystemProfile;
    if (isMirrorGifHash(sp.bannerGif)) out.set(MIRROR_SYSTEM_BANNER_ID, sp.bannerGif);
  }
  return out;
};

export const sanitizeMirrorGifAsk = (v: unknown): MirrorGifAsk[] => {
  if (!Array.isArray(v)) return [];
  const out: MirrorGifAsk[] = [];
  for (const x of v.slice(0, MIRROR_GIF_ASK_MAX)) {
    if (!x || typeof x !== 'object') continue;
    const id = (x as MirrorGifAsk).id;
    const h = (x as MirrorGifAsk).h;
    if (typeof id !== 'string' || !id || id.length > 128 || !isMirrorGifHash(h)) continue;
    out.push({id, h});
  }
  return out;
};

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
  'ps:cloudVault',
];

export const SYNC_STATE_KEY = 'ps:networkSyncState';
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

export const frontVisibilityFor = (buckets: PrivacyBucket[], peerId: string): FrontVisibility => {
  const mine = buckets.filter(b => b && Array.isArray(b.friendPeerIds) && b.friendPeerIds.includes(peerId));
  if (mine.length === 0) return {show: true, mood: true, location: true, note: true};
  const v: FrontVisibility = {show: false, mood: false, location: false, note: false};
  for (const b of mine) {
    if (b.front && b.front.mode === 'none') continue;
    v.show = true;
    if (b.frontMood !== false) v.mood = true;
    if (b.frontLocation !== false) v.location = true;
    if (b.frontNote !== false) v.note = true;
  }
  return v;
};

export const PRIVACY_BUCKETS_KEY = 'ps:privacyBuckets';

export type ConnStatus =
  | 'disabled'
  | 'connecting'
  | 'online'
  | 'reconnecting'
  | 'error';
