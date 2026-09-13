// Cloud Services: the HTTP client for the node's /cloud/vault/* routes.
// Byte-identical between the mobile and Desktop repos; the transport is
// injected. Spec: PluralStarCloudNode/SPEC.md section 13, and the node's
// internal/cloud/handlers.go, which is the contract this file is written to.

import {CloudError, CloudRequest, CloudResponse, CloudTransport, RemoteDevice, RemoteManifest, Tier, VaultInfo} from './cloudTypes';
import {base64ToBytes, bytesToBase64} from './cloudCrypto';
import {strFromU8, strToU8} from 'fflate';

const HEADER_VAULT_ID = 'X-Vault-Id';
const HEADER_VAULT_AUTH = 'X-Vault-Auth';
const HEADER_TIER = 'X-Ps-Tier';
const HEADER_UPLOAD_OFFSET = 'upload-offset';

// 2 MiB per PUT: small enough that a dropped mobile connection loses little,
// and the node resumes from the Upload-Offset it reports on HEAD.
export const UPLOAD_CHUNK_BYTES = 2 * 1024 * 1024;
const JSON_TIMEOUT_MS = 15000;
const OBJECT_TIMEOUT_MS = 120000;

export interface VaultCreds {
  lookupId: string;
  authSecret: string;
}

const lower = (h: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const k in h) out[k.toLowerCase()] = h[k];
  return out;
};

export class CloudApi {
  private base: string;
  private relayToken: string;
  private transport: CloudTransport;

  constructor(relayUrl: string, relayToken: string, transport: CloudTransport) {
    this.base = relayUrl.replace(/\/+$/, '');
    this.relayToken = relayToken || '';
    this.transport = transport;
  }

  private headers(creds?: VaultCreds, extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = {...(extra || {})};
    if (this.relayToken) h.Authorization = `Bearer ${this.relayToken}`;
    if (creds) {
      h[HEADER_VAULT_ID] = creds.lookupId;
      h[HEADER_VAULT_AUTH] = creds.authSecret;
    }
    return h;
  }

  private async send(req: CloudRequest): Promise<CloudResponse> {
    const res = await this.transport.request(req);
    return {...res, headers: lower(res.headers || {})};
  }

  private parseJson(res: CloudResponse): any {
    if (!res.bodyBase64) return null;
    try {
      return JSON.parse(strFromU8(base64ToBytes(res.bodyBase64)));
    } catch {
      return null;
    }
  }

  private fail(res: CloudResponse): never {
    const body = this.parseJson(res) || {};
    const code = typeof body.error === 'string' ? body.error : `http ${res.status}`;
    const err = new CloudError(res.status, code, code, body);
    if (res.status === 429) {
      const ra = Number(body.retry_after_seconds ?? res.headers['retry-after']);
      if (Number.isFinite(ra)) err.retryAfterSeconds = ra;
    }
    throw err;
  }

  private async json(method: CloudRequest['method'], path: string, creds?: VaultCreds, body?: unknown, query?: string): Promise<{status: number; body: any; headers: Record<string, string>}> {
    const req: CloudRequest = {
      method,
      url: `${this.base}${path}${query ? `?${query}` : ''}`,
      headers: this.headers(creds, body !== undefined ? {'Content-Type': 'application/json'} : undefined),
      timeoutMs: JSON_TIMEOUT_MS,
    };
    if (body !== undefined) req.bodyBase64 = bytesToBase64(strToU8(JSON.stringify(body)));
    const res = await this.send(req);
    if (res.status >= 400) this.fail(res);
    return {status: res.status, body: this.parseJson(res), headers: res.headers};
  }

  // ---- discovery -------------------------------------------------------

  // The node advertises cloud support in /health. Nothing about cloud is
  // hardcoded in the apps beyond the relay URL they already have.
  async cloudAvailable(): Promise<boolean> {
    try {
      const {body} = await this.json('GET', '/health');
      const roles = Array.isArray(body?.roles) ? body.roles : [];
      return roles.includes('cloud') || !!body?.cloud;
    } catch {
      return false;
    }
  }

  // ---- vault lifecycle ---------------------------------------------------

  async lookup(lookupId: string): Promise<boolean> {
    const {body} = await this.json('POST', '/cloud/vault/lookup', undefined, {lookup_id: lookupId});
    return !!body?.exists;
  }

  async create(creds: VaultCreds, wrappedMasterKeyB64: string): Promise<void> {
    await this.json('POST', '/cloud/vault/create', creds, {
      lookup_id: creds.lookupId,
      auth_secret: creds.authSecret,
      wrapped_master_key: wrappedMasterKeyB64,
    });
  }

  async info(creds: VaultCreds): Promise<VaultInfo> {
    const {body} = await this.json('GET', '/cloud/vault/info', creds);
    return {
      created: Number(body?.created) || 0,
      updated: Number(body?.updated) || 0,
      version: Number(body?.version) || 0,
      devices: Array.isArray(body?.devices) ? body.devices : [],
      graceStartedAt: body?.grace_started_at ? Number(body.grace_started_at) : undefined,
      wrappedMasterKey: String(body?.wrapped_master_key || ''),
      usage: body?.usage || {},
      quota: body?.quota || {},
    };
  }

  async getManifest(creds: VaultCreds, version?: number): Promise<RemoteManifest | null> {
    let res: {status: number; body: any};
    try {
      res = await this.json('GET', '/cloud/vault/manifest', creds, undefined, version ? `version=${version}` : undefined);
    } catch (e) {
      // A vault that exists but has never had a manifest written yet.
      if (e instanceof CloudError && e.status === 404 && e.code !== 'no vault') return null;
      throw e;
    }
    const b = res.body || {};
    if (!b.ciphertext) return null;
    return {
      version: Number(b.version) || 0,
      ciphertext: base64ToBytes(String(b.ciphertext)),
      objects: Array.isArray(b.objects) ? b.objects : [],
      wrappedMasterKey: String(b.wrapped_master_key || ''),
    };
  }

  // Returns the new version. Throws CloudError 409 with extra.version when the
  // expected version is stale: pull, merge, retry.
  async putManifest(creds: VaultCreds, expectedVersion: number, ciphertext: Uint8Array, objects: {id: string; tier: Tier; size: number}[]): Promise<number> {
    const {body} = await this.json('PUT', '/cloud/vault/manifest', creds, {
      expected_version: expectedVersion,
      ciphertext: bytesToBase64(ciphertext),
      objects,
    });
    return Number(body?.version) || 0;
  }

  // ---- objects ----------------------------------------------------------

  // {exists: true} when the vault already owns a complete copy; otherwise the
  // byte offset a resumed upload should continue from (0 for a fresh one).
  async objectStatus(creds: VaultCreds, id: string): Promise<{exists: boolean; offset: number}> {
    const res = await this.send({
      method: 'HEAD',
      url: `${this.base}/cloud/vault/objects/${id}`,
      headers: this.headers(creds),
      timeoutMs: JSON_TIMEOUT_MS,
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
      timeoutMs: OBJECT_TIMEOUT_MS,
    });
    if (res.status >= 400) this.fail(res);
    return base64ToBytes(res.bodyBase64);
  }

  // Chunked and resumable. Each PUT carries Content-Range; the node answers 202
  // with the bytes it now holds until the last chunk completes it. A 409 with
  // `received` means our idea of the offset was stale, so we adopt the node's
  // and continue from there.
  async putObject(creds: VaultCreds, id: string, tier: Tier, ciphertext: Uint8Array, onProgress?: (sent: number, total: number) => void): Promise<void> {
    const total = ciphertext.length;
    const status = await this.objectStatus(creds, id);
    if (status.exists) {
      // Commit the existing bytes to this vault (dedupe across vaults).
      await this.putChunk(creds, id, tier, ciphertext.subarray(0, Math.min(total, 1)), 0, total);
      onProgress?.(total, total);
      return;
    }
    let offset = status.offset;
    while (offset < total) {
      const end = Math.min(total, offset + UPLOAD_CHUNK_BYTES);
      const r = await this.putChunk(creds, id, tier, ciphertext.subarray(offset, end), offset, total);
      if (r.conflictAt !== undefined) {
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
      timeoutMs: OBJECT_TIMEOUT_MS,
    });
    if (res.status === 409) {
      const body = this.parseJson(res) || {};
      if (typeof body.received === 'number') return {complete: false, conflictAt: body.received};
      this.fail(res);
    }
    if (res.status >= 400) this.fail(res);
    const body = this.parseJson(res) || {};
    return {complete: !!body.complete};
  }

  // ---- devices ----------------------------------------------------------

  async linkDevice(creds: VaultCreds, subId: string, label: string): Promise<RemoteDevice[]> {
    const {body} = await this.json('POST', '/cloud/vault/devices', creds, {
      lookup_id: creds.lookupId,
      auth_secret: creds.authSecret,
      sub_id: subId,
      label,
    });
    return Array.isArray(body?.devices) ? body.devices : [];
  }

  async unlinkDevice(creds: VaultCreds, subId: string): Promise<{devices: RemoteDevice[]; graceDays: number}> {
    const {body} = await this.json('DELETE', `/cloud/vault/devices/${encodeURIComponent(subId)}`, creds);
    return {devices: Array.isArray(body?.devices) ? body.devices : [], graceDays: Number(body?.grace_days) || 0};
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
