// Shared types for the Plural Star network client.

// A network the app can join. For the public/default network the relay endpoint
// is a reachable Plural Star Node's local API (a mobile client has no node of
// its own, so it connects to one over LAN or the internet). `token` is the
// node's bearer token; public relays may expose a shared/empty token.
export interface NetworkDef {
  id: string;
  name: string;
  relayUrl: string; // e.g. http://192.168.1.20:7523  (no trailing slash)
  token: string; // bearer token for the node API ('' if the relay is open)
  isDefault?: boolean;
}

// A saved friend: their public identity plus local metadata.
//
// The link is mutual by construction: it only becomes 'accepted' once BOTH sides
// have entered each other's codes.
//   'entered_theirs' -> I entered their code; waiting for them to enter mine
//   'entered_mine'   -> they entered my code; waiting for me to enter theirs
//   'accepted'       -> both entered -> connected
export interface Friend {
  peerId: string;
  edPublicKey: string; // base64
  boxPublicKey: string; // base64
  displayName: string;
  addedAt: number;
  // 'friend' = another person; 'device' = one of your own devices (for Sync).
  kind: 'friend' | 'device';
  status: 'entered_theirs' | 'entered_mine' | 'accepted';
  // Device links only — the directed initial copy ("clone"):
  //   initRole    = MY role, chosen when I entered their code. 'source' = this
  //                 device's data is cloned to the other; 'target' = mine gets
  //                 replaced by theirs. After the clone, sync is bidirectional.
  //   peerRole    = the role THEY claimed in their connect (mismatch detection).
  //   initPending = the initial clone hasn't completed yet. On a source: clone
  //                 still owed (retried on reconnect). On a target: outbound
  //                 sync is suppressed until the clone lands.
  initRole?: 'source' | 'target';
  peerRole?: 'source' | 'target';
  initPending?: boolean;
  // Last front/status this friend shared (notification parity). Shown greyed
  // when the friend is offline.
  lastStatus?: FrontShare | null;
  statusUpdatedAt?: number;
}

// A friend's shared front/status, mirroring the on-device notification content.
// Names are already resolved by the sender. Duration is derived from startTime
// on display so it stays live.
export interface FrontShare {
  fronters: string; // headline names (primary || coFront || coConscious)
  primary?: string;
  coFront?: string;
  coConscious?: string;
  mood?: string;
  location?: string;
  note?: string;
  startTime?: number;
}

// A signed identity record published to the rendezvous under hash(code).
export interface RendezvousRecord {
  peerId: string;
  edPublicKey: string; // base64
  boxPublicKey: string; // base64
  sig: string; // base64 Ed25519 over peerId|edPublicKey|boxPublicKey
}

export const FRIENDS_STORAGE_KEY = 'ps:networkFriends';
export const NETWORK_SETTINGS_KEY = 'ps:networkSettings';

export interface NetworkSettings {
  enabled: boolean;
  // Override for the relay endpoint; when unset the compiled default is used.
  relayUrl?: string;
  token?: string;
}

// ---- Wire messages (the decrypted contents of an envelope) ----

export type NetMessage =
  // sent when I enter your code: asserts mutual intent. Carries my display name
  // (for device links: a device label, so you can tell your devices apart) and
  // which kind of link this is. `ack: true` marks a confirmation reply — it
  // tells the other side their connect landed and must never be replied to
  // (that's what terminates the exchange).
  // `role` (device links): which side of the initial clone the sender chose.
  | { t: 'connect'; name: string; kind: 'friend' | 'device'; ack?: boolean; role?: 'source' | 'target' }
  | { t: 'disconnect' }
  | { t: 'ping' }
  | { t: 'front'; status: FrontShare | null }
  // device sync: a diff of changed storage keys (value + content hash).
  // `init: true` marks messages of the initial clone — the target applies them
  // unconditionally (no conflict prompts). `initDone: true` on the final message
  // ends the clone and lifts the target's outbound-sync suppression.
  | { t: 'sync'; keys: Record<string, {v: string; h: string}>; init?: boolean; initDone?: boolean }
  // one part of a single oversized key, streamed and reassembled by the receiver.
  | { t: 'sync_chunk'; key: string; h: string; seq: number; total: number; data: string; init?: boolean }
  | { t: 'dm'; body: string; ts: number };

// Keys that must NEVER sync between devices (each device keeps its own).
export const SYNC_EXCLUDE_KEYS = [
  'ps:networkIdentity',
  'ps:networkSettings',
  'ps:networkFriends',
  'ps:networkSyncState',
  'ps:deviceCodes',
];

export const SYNC_STATE_KEY = 'ps:networkSyncState';

export const RENDEZVOUS_TTL_SECONDS = 30 * 60; // codes live 30 minutes

// Connection status surfaced to the UI.
export type ConnStatus =
  | 'disabled'
  | 'connecting'
  | 'online'
  | 'reconnecting'
  | 'error';
