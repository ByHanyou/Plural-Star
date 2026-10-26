import {CloudError, CloudLimits, CloudRequest, CloudResponse, CloudTransport, RemoteDevice, RemoteManifest, Tier, VaultInfo} from './cloudTypes';
import {base64ToBytes, bytesToBase64} from './cloudCrypto';
import {strFromU8, strToU8} from 'fflate';

const HEADER_VAULT_ID = 'X-Vault-Id';
const HEADER_VAULT_AUTH = 'X-Vault-Auth';
const HEADER_TIER = 'X-Ps-Tier';
const HEADER_UPLOAD_OFFSET = 'upload-offset';
const HEADER_DEVICE_ID = 'X-Ps-Device-Id';
const HEADER_DEVICE_KEY = 'X-Ps-Device-Key';

export const UPLOAD_CHUNK_BYTES = 2 * 1024 * 1024;

export interface VaultCreds {
  lookupId: string;
  authSecret: string;
  deviceId?: string;
  deviceKey?: string;
}

const vaultOnly = (creds: VaultCreds): VaultCreds => ({lookupId: creds.lookupId, authSecret: creds.authSecret});

const lower = (h: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const k in h) out[k.toLowerCase()] = h[k];
  return out;
};

type JsonObject = Record<string, unknown>;

const isJsonObject = (v: unknown): v is JsonObject => !!v && typeof v === 'object' && !Array.isArray(v);

const asObject = (v: unknown): JsonObject | null => (isJsonObject(v) ? v : null);

const parseDevices = (v: unknown): RemoteDevice[] => {
  if (!Array.isArray(v)) return [];
  const out: RemoteDevice[] = [];
  for (const raw of v) {
    const d = asObject(raw);
    if (!d || typeof d.sub_id !== 'string') continue;
    out.push({sub_id: d.sub_id, label: String(d.label || ''), last_seen: Number(d.last_seen) || 0});
  }
  return out;
};

const parseObjects = (v: unknown): RemoteManifest['objects'] => {
  if (!Array.isArray(v)) return [];
  const out: RemoteManifest['objects'] = [];
  for (const raw of v) {
    const o = asObject(raw);
    if (!o || typeof o.id !== 'string') continue;
    out.push({id: o.id, tier: o.tier === 'media' ? 'media' : 'base', size: Number(o.size) || 0});
  }
  return out;
};

const numberMap = (v: unknown): Record<string, number> => {
  const o = asObject(v);
  const out: Record<string, number> = {};
  if (!o) return out;
  for (const k in o) {
    const n = Number(o[k]);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
};

export class CloudApi {
  private base: string;
  private relayToken: string;
  private transport: CloudTransport;
  private limits: CloudLimits;

  constructor(relayUrl: string, relayToken: string, transport: CloudTransport, limits: CloudLimits) {
    this.base = relayUrl.replace(/\/+$/, '');
    this.relayToken = relayToken || '';
    this.transport = transport;
    this.limits = limits;
  }

  private headers(creds?: VaultCreds, extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = {...(extra || {})};
    if (this.relayToken) h.Authorization = `Bearer ${this.relayToken}`;
    if (creds) {
      h[HEADER_VAULT_ID] = creds.lookupId;
      h[HEADER_VAULT_AUTH] = creds.authSecret;
      if (creds.deviceId && creds.deviceKey) {
        h[HEADER_DEVICE_ID] = creds.deviceId;
        h[HEADER_DEVICE_KEY] = creds.deviceKey;
      }
    }
    return h;
  }

  private async send(req: CloudRequest): Promise<CloudResponse> {
    const res = await this.transport.request(req);
    return {...res, headers: lower(res.headers || {})};
  }

  private parseJson(res: CloudResponse): JsonObject | null {
    if (!res.bodyBase64) return null;
    try {
      return asObject(JSON.parse(strFromU8(base64ToBytes(res.bodyBase64))));
    } catch {
      return null;
    }
  }

  private fail(res: CloudResponse): never {
    const body: JsonObject = this.parseJson(res) || {};
    const code = typeof body.error === 'string' ? body.error : `http ${res.status}`;
    const err = new CloudError(res.status, code, code, body);
    if (res.status === 429) {
      const ra = Number(body.retry_after_seconds ?? res.headers['retry-after']);
      if (Number.isFinite(ra)) err.retryAfterSeconds = ra;
    }
    throw err;
  }

  private async json(method: CloudRequest['method'], path: string, creds?: VaultCreds, body?: unknown, query?: string): Promise<JsonObject | null> {
    const req: CloudRequest = {
      method,
      url: `${this.base}${path}${query ? `?${query}` : ''}`,
      headers: this.headers(creds, body !== undefined ? {'Content-Type': 'application/json'} : undefined),
      timeoutMs: this.limits.jsonTimeoutMs,
    };
    if (body !== undefined) req.bodyBase64 = bytesToBase64(strToU8(JSON.stringify(body)));
    const res = await this.send(req);
    if (res.status >= 400) this.fail(res);
    return this.parseJson(res);
  }

  async cloudAvailable(): Promise<boolean> {
    try {
      const body = await this.json('GET', '/health');
      const roles = body?.roles;
      return (Array.isArray(roles) && roles.includes('cloud')) || !!body?.cloud;
    } catch {
      return false;
    }
  }

  async lookup(lookupId: string): Promise<boolean> {
    const body = await this.json('POST', '/cloud/vault/lookup', undefined, {lookup_id: lookupId});
    return !!body?.exists;
  }

  async create(creds: VaultCreds, wrappedMasterKeyB64: string): Promise<void> {
    await this.json('POST', '/cloud/vault/create', vaultOnly(creds), {
      lookup_id: creds.lookupId,
      auth_secret: creds.authSecret,
      wrapped_master_key: wrappedMasterKeyB64,
    });
  }

  async info(creds: VaultCreds): Promise<VaultInfo> {
    const body = await this.json('GET', '/cloud/vault/info', creds);
    return {
      created: Number(body?.created) || 0,
      updated: Number(body?.updated) || 0,
      version: Number(body?.version) || 0,
      devices: parseDevices(body?.devices),
      graceStartedAt: body?.grace_started_at ? Number(body.grace_started_at) : undefined,
      wrappedMasterKey: String(body?.wrapped_master_key || ''),
      usage: numberMap(body?.usage),
      quota: numberMap(body?.quota),
    };
  }

  async getManifest(creds: VaultCreds, version?: number): Promise<RemoteManifest | null> {
    let b: JsonObject | null;
    try {
      b = await this.json('GET', '/cloud/vault/manifest', creds, undefined, version ? `version=${version}` : undefined);
    } catch (e) {
      if (e instanceof CloudError && e.status === 404 && e.kind !== 'VAULT_MISSING') return null;
      throw e;
    }
    if (!b?.ciphertext) return null;
    return {
      version: Number(b.version) || 0,
      ciphertext: base64ToBytes(String(b.ciphertext)),
      objects: parseObjects(b.objects),
      wrappedMasterKey: String(b.wrapped_master_key || ''),
    };
  }

  async putManifest(creds: VaultCreds, expectedVersion: number, ciphertext: Uint8Array, objects: {id: string; tier: Tier; size: number}[]): Promise<number> {
    const body = await this.json('PUT', '/cloud/vault/manifest', creds, {
      expected_version: expectedVersion,
      ciphertext: bytesToBase64(ciphertext),
      objects,
    });
    return Number(body?.version) || 0;
  }

  async objectStatus(creds: VaultCreds, id: string): Promise<{exists: boolean; offset: number}> {
    const res = await this.send({
      method: 'HEAD',
      url: `${this.base}/cloud/vault/objects/${id}`,
      headers: this.headers(creds),
      timeoutMs: this.limits.jsonTimeoutMs,
    });
    if (res.status === 200) return {exists: true, offset: 0};
    if (res.status === 404) {
      const off = Number(res.headers[HEADER_UPLOAD_OFFSET]);
      return {exists: false, offset: Number.isFinite(off) && off > 0 ? off : 0};
    }
    this.fail(res);
  }

  async getObject(creds: VaultCreds, id: string): Promise<Uint8Array> {
    const res = await this.send({
      method: 'GET',
      url: `${this.base}/cloud/vault/objects/${id}`,
      headers: this.headers(creds),
      timeoutMs: this.limits.objectTimeoutMs,
    });
    if (res.status >= 400) this.fail(res);
    return base64ToBytes(res.bodyBase64);
  }

  async putObject(creds: VaultCreds, id: string, tier: Tier, ciphertext: Uint8Array, onProgress?: (sent: number, total: number) => void): Promise<void> {
    const total = ciphertext.length;
    const status = await this.objectStatus(creds, id);
    if (status.exists) {
      await this.putChunk(creds, id, tier, ciphertext.subarray(0, Math.min(total, 1)), 0, total);
      onProgress?.(total, total);
      return;
    }
    let offset = status.offset;
    let lastConflict = -1;
    while (offset < total) {
      const end = Math.min(total, offset + UPLOAD_CHUNK_BYTES);
      const r = await this.putChunk(creds, id, tier, ciphertext.subarray(offset, end), offset, total);
      if (r.conflictAt !== undefined) {
        if (r.conflictAt === lastConflict) throw new Error('upload offset did not advance');
        lastConflict = r.conflictAt;
        offset = r.conflictAt;
        continue;
      }
      offset = end;
      onProgress?.(offset, total);
      if (r.complete) return;
    }
  }

  private async putChunk(creds: VaultCreds, id: string, tier: Tier, chunk: Uint8Array, start: number, total: number): Promise<{complete: boolean; conflictAt?: number}> {
    const res = await this.send({
      method: 'PUT',
      url: `${this.base}/cloud/vault/objects/${id}`,
      headers: this.headers(creds, {
        'Content-Type': 'application/octet-stream',
        'Content-Range': `bytes ${start}-${start + chunk.length - 1}/${total}`,
        [HEADER_TIER]: tier,
      }),
      bodyBase64: bytesToBase64(chunk),
      timeoutMs: this.limits.objectTimeoutMs,
    });
    if (res.status === 409) {
      const body = this.parseJson(res) || {};
      if (typeof body.received === 'number') return {complete: false, conflictAt: body.received};
      this.fail(res);
    }
    if (res.status >= 400) this.fail(res);
    const body: JsonObject = this.parseJson(res) || {};
    return {complete: !!body.complete};
  }

  async linkDevice(creds: VaultCreds, subId: string, label: string): Promise<{devices: RemoteDevice[]; deviceKey: string; existed: boolean}> {
    const body = await this.json('POST', '/cloud/vault/devices', vaultOnly(creds), {
      lookup_id: creds.lookupId,
      auth_secret: creds.authSecret,
      sub_id: subId,
      label,
    });
    return {
      devices: parseDevices(body?.devices),
      deviceKey: String(body?.device_key || ''),
      existed: !!body?.existed,
    };
  }

  async issueDeviceKey(creds: VaultCreds, subId: string): Promise<string> {
    const body = await this.json('POST', `/cloud/vault/devices/${encodeURIComponent(subId)}/key`, vaultOnly(creds), {
      lookup_id: creds.lookupId,
      auth_secret: creds.authSecret,
    });
    return String(body?.device_key || '');
  }

  async unlinkDevice(creds: VaultCreds, subId: string): Promise<{devices: RemoteDevice[]; graceDays: number}> {
    const body = await this.json('DELETE', `/cloud/vault/devices/${encodeURIComponent(subId)}`, creds);
    return {devices: parseDevices(body?.devices), graceDays: Number(body?.grace_days) || 0};
  }

  async rewrap(creds: VaultCreds, next: {lookupId?: string; authSecret?: string; wrappedMasterKeyB64: string}): Promise<void> {
    await this.json('POST', '/cloud/vault/rewrap', creds, {
      lookup_id: creds.lookupId,
      auth_secret: creds.authSecret,
      new_lookup_id: next.lookupId || '',
      new_auth_secret: next.authSecret || '',
      wrapped_master_key: next.wrappedMasterKeyB64,
    });
  }
}
