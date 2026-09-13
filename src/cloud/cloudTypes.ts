// Cloud Services: shared types. Byte-identical between the mobile and Desktop
// repos. Spec: PluralStarCloudNode/SPEC.md sections 7, 8 and 13.

export type EntryKind = 'data' | 'avatar' | 'avatarFull' | 'banner' | 'cfImage' | 'chatMedia';
export type Tier = 'base' | 'media';

// One row of the encrypted manifest. `path` is the storage key the object
// restores to (`ps:*`, or `ps:media:*` for images). `hash` is the local
// content hash of the plaintext, kept here so a wake check can tell what
// changed without downloading anything.
export interface ManifestEntry {
  path: string;
  id: string;
  size: number;
  kind: EntryKind;
  tier: Tier;
  hash: string;
  mime?: string;
}

export interface ManifestDevice {
  subId: string;
  label: string;
  lastSeen: number;
}

export interface VaultManifest {
  v: 1;
  version: number;
  created: number;
  updated: number;
  devices: ManifestDevice[];
  entries: ManifestEntry[];
}

// What the node returns alongside a manifest; the ciphertext is opaque to it.
export interface RemoteManifest {
  version: number;
  ciphertext: Uint8Array;
  objects: {id: string; tier: Tier; size: number}[];
  wrappedMasterKey: string;
}

export interface RemoteDevice {
  sub_id: string;
  label: string;
  last_seen: number;
}

export interface VaultInfo {
  created: number;
  updated: number;
  version: number;
  devices: RemoteDevice[];
  graceStartedAt?: number;
  wrappedMasterKey: string;
  usage: Record<string, number>;
  quota: Record<string, number>;
}

// Persisted on the device once linked. The master key stays here so wake
// checks and saves never need the password again; the password itself is never
// stored. Same sensitivity class as the network identity keys, same store.
export interface CloudLinkState {
  v: 1;
  lookupId: string;
  authSecret: string;
  masterKeyB64: string;
  mediaTier: boolean;
  manifestVersion: number;
  linkedAt: number;
  lastCheckAt: number;
  // path -> {id, hash} of what the cloud held the last time this device was in
  // agreement with it. A local key whose hash differs is the outbox.
  // `hash` is the local hash of what this device holds, `remote` the hash the
  // manifest carries (they differ for media the uploader re-encoded).
  known: Record<string, {id: string; hash: string; remote?: string}>;
  // path -> when the user removed that key here (store.remove). The only way a
  // data key leaves the vault: a key the vault holds and this device does not
  // is otherwise a difference to download (spec 8.2), never a deletion.
  removed?: Record<string, number>;
}

export const CLOUD_LINK_KEY = 'ps:cloudVault';

export type CloudPhase = 'idle' | 'deriving' | 'uploading' | 'checking' | 'importing';

export interface CloudStatus {
  available: boolean;
  linked: boolean;
  phase: CloudPhase;
  progress: number;
  lastError: string | null;
  mediaTier: boolean;
  deviceCount: number;
  lastSyncAt: number;
  pendingKeys: number;
}

export class CloudError extends Error {
  status: number;
  code: string;
  retryAfterSeconds?: number;
  extra?: Record<string, unknown>;
  constructor(status: number, code: string, message?: string, extra?: Record<string, unknown>) {
    super(message || code);
    this.name = 'CloudError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export interface CloudRequest {
  method: 'GET' | 'POST' | 'PUT' | 'HEAD' | 'DELETE';
  url: string;
  headers: Record<string, string>;
  bodyBase64?: string;
  timeoutMs?: number;
}

export interface CloudResponse {
  status: number;
  headers: Record<string, string>;
  bodyBase64: string;
}

// The one platform-specific piece of the HTTP client: how bytes get on and off
// the wire. Mobile goes through react-native-blob-util (base64 bodies), Desktop
// through an Electron main-process fetch, since the renderer's IPC fetch is
// text-only and ciphertext is not text.
export interface CloudTransport {
  request(req: CloudRequest): Promise<CloudResponse>;
}
