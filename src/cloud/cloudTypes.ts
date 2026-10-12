export type EntryKind = 'data' | 'avatar' | 'avatarFull' | 'banner' | 'cfImage' | 'chatMedia';
export type Tier = 'base' | 'media';

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

export interface CloudLinkState {
  v: 1;
  lookupId: string;
  authSecret: string;
  masterKeyB64: string;
  mediaTier: boolean;
  manifestVersion: number;
  linkedAt: number;
  lastCheckAt: number;
  known: Record<string, {id: string; hash: string; remote?: string}>;
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
  unbackedMedia: number;
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

export interface CloudTransport {
  request(req: CloudRequest): Promise<CloudResponse>;
}
