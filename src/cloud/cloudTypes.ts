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
  enc?: number;
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
  sent?: Record<string, {hash: string; entry: ManifestEntry}>;
  vaultEntries?: number;
  deviceKey?: string;
}

export const CLOUD_LINK_KEY = 'ps:cloudVault';

export type CloudPhase = 'idle' | 'deriving' | 'uploading' | 'checking' | 'importing';

export interface CloudStatus {
  available: boolean;
  linked: boolean;
  phase: CloudPhase;
  progress: number;
  lastError: string | null;
  lastErrorCode: string | null;
  lastErrorKind: CloudErrorKind | null;
  leftOut: CloudLeftOut | null;
  mediaTier: boolean;
  deviceCount: number;
  lastSyncAt: number;
  pendingKeys: number;
  unbackedMedia: number;
  vaultEntries: number;
  removedFromVault: boolean;
}

export interface CloudLeftOut {
  maxObjectMb: number;
  tooLarge: string[];
  overQuota: string[];
  refused: {key: string; code: string}[];
  unreadable: {key: string; why: string}[];
}

export const CLOUD_ERROR_KINDS = [
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'CONFLICT',
  'TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'INTERNAL',
  'UNAVAILABLE',
  'INSUFFICIENT_STORAGE',
  'VAULT_MISSING',
  'BAD_AUTH',
  'DEVICE_KEY_REQUIRED',
  'DEVICE_UNLINKED',
  'DEVICE_KEY_ISSUED',
  'VAULT_EXISTS',
  'MANIFEST_VERSION_CONFLICT',
  'MANIFEST_MISSING_OBJECTS',
  'QUOTA_EXCEEDED',
  'OBJECT_TOO_LARGE',
  'HASH_MISMATCH',
  'UPLOAD_OFFSET_MISMATCH',
  'DISK_AT_WATERMARK',
  'BAD_SIGNATURE',
  'STALE_TIMESTAMP',
  'PUSH_DISABLED',
  'ROUTE_MISSING',
  'NOT_LINKED',
  'ALREADY_LINKED',
  'LINK_BROKEN',
  'LINK_IN_PROGRESS',
  'NOT_LOADED',
  'NO_DATA',
  'NO_MASTER_KEY',
  'NO_PENDING_CREDENTIALS',
  'BAD_PASSWORD',
  'VAULT_EMPTY',
  'VAULT_NOT_CLEARABLE',
  'RUN_STOPPED',
  'MANIFEST_UNDECRYPTABLE',
  'MANIFEST_MALFORMED',
  'OBJECT_HASH_MISMATCH',
  'OBJECT_UNDECRYPTABLE',
  'UNKNOWN',
] as const;

export type CloudErrorKind = (typeof CLOUD_ERROR_KINDS)[number];

const KIND_SET: ReadonlySet<string> = new Set<string>(CLOUD_ERROR_KINDS);

export const isCloudErrorKind = (v: unknown): v is CloudErrorKind => typeof v === 'string' && KIND_SET.has(v);

const KIND_BY_STATUS: Record<number, CloudErrorKind> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
  500: 'INTERNAL',
  503: 'UNAVAILABLE',
  507: 'INSUFFICIENT_STORAGE',
};

const KIND_BY_LEGACY_CODE: ReadonlyMap<string, CloudErrorKind> = new Map<string, CloudErrorKind>([
  ['no vault', 'VAULT_MISSING'],
  ['bad auth secret', 'BAD_AUTH'],
  ['device key required', 'DEVICE_KEY_REQUIRED'],
  ['device unlinked', 'DEVICE_UNLINKED'],
  ['device key already issued', 'DEVICE_KEY_ISSUED'],
  ['vault already exists', 'VAULT_EXISTS'],
  ['manifest version conflict', 'MANIFEST_VERSION_CONFLICT'],
  ['manifest references missing objects', 'MANIFEST_MISSING_OBJECTS'],
  ['vault quota exceeded', 'QUOTA_EXCEEDED'],
  ['object too large', 'OBJECT_TOO_LARGE'],
  ['object id does not match ciphertext hash', 'HASH_MISMATCH'],
  ['upload offset mismatch', 'UPLOAD_OFFSET_MISMATCH'],
  ['disk at watermark', 'DISK_AT_WATERMARK'],
  ['bad signature', 'BAD_SIGNATURE'],
  ['stale timestamp', 'STALE_TIMESTAMP'],
  ['push relay not configured', 'PUSH_DISABLED'],
  ['rate limited', 'RATE_LIMITED'],
  ['not found', 'NOT_FOUND'],
  ['not linked', 'NOT_LINKED'],
  ['already linked', 'ALREADY_LINKED'],
  ['link broken', 'LINK_BROKEN'],
  ['link in progress', 'LINK_IN_PROGRESS'],
  ['not loaded', 'NOT_LOADED'],
  ['no data', 'NO_DATA'],
  ['no master key', 'NO_MASTER_KEY'],
  ['no pending credentials', 'NO_PENDING_CREDENTIALS'],
  ['bad password', 'BAD_PASSWORD'],
  ['vault empty', 'VAULT_EMPTY'],
  ['vault not clearable', 'VAULT_NOT_CLEARABLE'],
  ['run stopped', 'RUN_STOPPED'],
  ['manifest undecryptable', 'MANIFEST_UNDECRYPTABLE'],
  ['manifest malformed', 'MANIFEST_MALFORMED'],
  ['object hash mismatch', 'OBJECT_HASH_MISMATCH'],
  ['object undecryptable', 'OBJECT_UNDECRYPTABLE'],
]);

export const cloudErrorKindOf = (status: number, code: string, serverCode?: unknown): CloudErrorKind => {
  if (isCloudErrorKind(serverCode)) return serverCode;
  const legacy = KIND_BY_LEGACY_CODE.get(code);
  if (legacy) return legacy;
  if ((status === 404 || status === 405) && code === `http ${status}`) return 'ROUTE_MISSING';
  const byStatus = KIND_BY_STATUS[status];
  if (byStatus) return byStatus;
  if (status >= 500 && status <= 599) return 'UNAVAILABLE';
  return 'UNKNOWN';
};

export class CloudError extends Error {
  status: number;
  code: string;
  kind: CloudErrorKind;
  retryAfterSeconds?: number;
  extra?: Record<string, unknown>;
  constructor(status: number, code: string, message?: string, extra?: Record<string, unknown>, kind?: CloudErrorKind) {
    super(message || code);
    this.name = 'CloudError';
    this.status = status;
    this.code = code;
    this.extra = extra;
    this.kind = kind || cloudErrorKindOf(status, code, extra?.code);
  }
}

export const cloudErrorCode = (e: unknown): string => (e instanceof CloudError ? `CLOUD-${e.status}` : 'CLOUD-APP');

export const cloudErrorKind = (e: unknown): CloudErrorKind => (e instanceof CloudError ? e.kind : 'UNKNOWN');

export const isCloudKind = (e: unknown, ...kinds: CloudErrorKind[]): boolean => e instanceof CloudError && kinds.includes(e.kind);

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

export interface CloudLimits {
  transportTimeoutMs: number;
  jsonTimeoutMs: number;
  objectTimeoutMs: number;
  pushDebounceMs: number;
  retryBaseMs: number;
  retryMaxMs: number;
  checkMinIntervalMs: number;
  unlinkWaitMs: number;
  sentSaveMs: number;
}

export const DEFAULT_CLOUD_LIMITS: CloudLimits = {
  transportTimeoutMs: 30000,
  jsonTimeoutMs: 15000,
  objectTimeoutMs: 120000,
  pushDebounceMs: 4000,
  retryBaseMs: 5000,
  retryMaxMs: 5 * 60 * 1000,
  checkMinIntervalMs: 20000,
  unlinkWaitMs: 20000,
  sentSaveMs: 5000,
};
