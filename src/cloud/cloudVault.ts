import {CloudApi, VaultCreds} from './cloudApi';
import {
  CLOUD_LINK_KEY,
  CloudError,
  CloudLinkState,
  CloudPhase,
  CloudStatus,
  CloudTransport,
  EntryKind,
  ManifestEntry,
  Tier,
  VaultManifest,
} from './cloudTypes';
import {
  base64ToBytes,
  bytesToBase64,
  decryptBytes,
  deriveVaultCredentials,
  encryptBytes,
  joinDataUri,
  newMasterKey,
  objectIdOf,
  packData,
  splitDataUri,
  unpackData,
  unwrapMasterKey,
  wrapMasterKey,
} from './cloudCrypto';

export const CLOUD_IDENTITY_KEY = 'ps:networkIdentity';
export const CLOUD_FRIENDS_KEY = 'ps:cloud:friends';
export const CLOUD_TOMBSTONES_KEY = 'ps:cloud:friendTombstones';
export const CLOUD_MEDIA_MISSING = 'cloud:missing';

const MANIFEST_V = 1 as const;
const OBJECT_MAX_BYTES = 25 * 1024 * 1024;
const SEALED_KEEP_MAX_BYTES = 64 * 1024 * 1024;
const HASH_YIELD_KEYS = 8;
const PUSH_DEBOUNCE_MS = 4000;
const RETRY_BASE_MS = 5000;
const RETRY_MAX_MS = 5 * 60 * 1000;
const CHECK_MIN_INTERVAL_MS = 20000;

export interface CloudPlatform {
  transport: CloudTransport;
  relay(): {relayUrl: string; token: string};
  snapshot(): Promise<Record<string, string>>;
  apply(keys: Record<string, string>): Promise<void>;
  remove(key: string): Promise<void>;
  adoptIdentity(identityRaw: string, friendsRaw: string | null): Promise<void>;
  mergeFriends(friendsRaw: string | null, tombstonesRaw: string | null): Promise<void>;
  reencodeImage(dataUri: string): Promise<string>;
  localHash(raw: string): string;
  loadLink(): Promise<CloudLinkState | null>;
  saveLink(state: CloudLinkState | null): Promise<void>;
  deviceSubId(): Promise<string>;
  deviceLabel(): string;
  now(): number;
}

const kindOf = (key: string): EntryKind => {
  if (key.startsWith('ps:media:av:') || key === 'ps:media:sysav') return 'avatar';
  if (key.startsWith('ps:media:bn:') || key === 'ps:media:sysbn') return 'banner';
  if (key.startsWith('ps:media:cf:')) return 'cfImage';
  if (key.startsWith('ps:media:chat:')) return 'chatMedia';
  return 'data';
};

const tierOf = (kind: EntryKind): Tier => (kind === 'data' || kind === 'avatar' ? 'base' : 'media');

const isMediaKey = (key: string): boolean => key.startsWith('ps:media:');

const ownerKeyOf = (path: string): string => {
  if (path.startsWith('ps:media:chat:')) return `ps:chat:${path.slice('ps:media:chat:'.length).split(':')[0]}`;
  if (path === 'ps:media:sysav' || path === 'ps:media:sysbn') return 'ps:system';
  return 'ps:members';
};

export type LinkOutcome = {kind: 'created'} | {kind: 'existing'};

type Listener = (s: CloudStatus) => void;

export class CloudService {
  private p: CloudPlatform;
  private link: CloudLinkState | null = null;
  private masterKey: Uint8Array | null = null;
  private available = false;
  private phase: CloudPhase = 'idle';
  private progress = 0;
  private lastError: string | null = null;
  private deviceCount = 0;
  private pendingKeys = 0;
  private listeners: Set<Listener> = new Set();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private syncing: Promise<void> | null = null;
  private queued: Promise<void> | null = null;
  private sealed: Map<string, {hash: string; ct: Uint8Array}> = new Map();
  private sealedBytes = 0;
  private tooLarge: string[] = [];
  private unbackedMedia: string[] = [];
  private lastCheckStartedAt = 0;
  private loaded = false;

  constructor(platform: CloudPlatform) {
    this.p = platform;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.status());
    return () => this.listeners.delete(fn);
  }

  status(): CloudStatus {
    return {
      available: this.available,
      linked: !!this.link,
      phase: this.phase,
      progress: this.progress,
      lastError: this.lastError,
      mediaTier: !!this.link?.mediaTier,
      deviceCount: this.deviceCount,
      lastSyncAt: this.link?.lastCheckAt || 0,
      pendingKeys: this.pendingKeys,
      unbackedMedia: this.unbackedMedia.length,
    };
  }

  isLinked(): boolean {
    return !!this.link;
  }

  private emit(): void {
    const s = this.status();
    this.listeners.forEach(fn => {
      try {
        fn(s);
      } catch {}
    });
  }

  private setPhase(phase: CloudPhase, progress = 0): void {
    this.phase = phase;
    this.progress = progress;
    this.emit();
  }

  private api(): CloudApi {
    const {relayUrl, token} = this.p.relay();
    return new CloudApi(relayUrl, token, this.p.transport);
  }

  private creds(): VaultCreds {
    if (!this.link) throw new CloudError(0, 'not linked');
    return {lookupId: this.link.lookupId, authSecret: this.link.authSecret};
  }

  private key(): Uint8Array {
    if (!this.masterKey) throw new CloudError(0, 'no master key');
    return this.masterKey;
  }

  async init(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    this.link = await this.p.loadLink();
    if (this.link) {
      try {
        this.masterKey = base64ToBytes(this.link.masterKeyB64);
      } catch {
        this.masterKey = null;
      }
      this.pendingKeys = 0;
    }
    this.emit();
  }

  async refreshAvailability(): Promise<boolean> {
    const was = this.available;
    this.available = await this.api().cloudAvailable();
    if (was !== this.available) this.emit();
    return this.available;
  }

  async linkWithPassword(password: string, mediaTier: boolean): Promise<LinkOutcome> {
    if (this.link) throw new CloudError(0, 'already linked');
    this.lastError = null;
    this.setPhase('deriving', 0);
    try {
      const creds = await deriveVaultCredentials(password, f => this.setPhase('deriving', f));
      const api = this.api();
      const exists = await api.lookup(creds.lookupId);
      if (exists) {
        this.pendingCreds = creds;
        this.setPhase('idle', 0);
        return {kind: 'existing'};
      }
      const mk = newMasterKey();
      const wrapped = wrapMasterKey(mk, creds.kek);
      await api.create({lookupId: creds.lookupId, authSecret: creds.authSecret}, wrapped);
      this.masterKey = mk;
      this.link = {
        v: 1,
        lookupId: creds.lookupId,
        authSecret: creds.authSecret,
        masterKeyB64: bytesToBase64(mk),
        mediaTier,
        manifestVersion: 0,
        linkedAt: this.p.now(),
        lastCheckAt: 0,
        known: {},
      };
      creds.kek.fill(0);
      await this.p.saveLink(this.link);
      await this.registerDevice();
      this.emit();
      await this.runSync('uploading');
      return {kind: 'created'};
    } catch (e) {
      this.setPhase('idle', 0);
      this.recordError(e);
      throw e;
    }
  }

  private pendingCreds: {lookupId: string; authSecret: string; kek: Uint8Array} | null = null;

  async importExisting(mediaTier: boolean): Promise<void> {
    if (this.link) throw new CloudError(0, 'already linked');
    const creds = this.pendingCreds;
    if (!creds) throw new CloudError(0, 'no pending credentials');
    this.pendingCreds = null;
    this.lastError = null;
    this.setPhase('importing', 0);
    try {
      const api = this.api();
      const vc = {lookupId: creds.lookupId, authSecret: creds.authSecret};
      const info = await api.info(vc);
      const mk = unwrapMasterKey(info.wrappedMasterKey, creds.kek);
      creds.kek.fill(0);
      if (!mk) throw new CloudError(0, 'bad password', 'The vault exists but this password does not open it.');
      this.masterKey = mk;
      this.link = {
        v: 1,
        lookupId: creds.lookupId,
        authSecret: creds.authSecret,
        masterKeyB64: bytesToBase64(mk),
        mediaTier,
        manifestVersion: 0,
        linkedAt: this.p.now(),
        lastCheckAt: 0,
        known: {},
      };
      await this.p.saveLink(this.link);
      await this.registerDevice();
      const remote = await api.getManifest(vc);
      if (remote) {
        const manifest = this.openManifest(remote.ciphertext);
        const pulled = await this.pullAll(api, vc, manifest, true);
        this.link.manifestVersion = remote.version;
        this.link.known = {};
        for (const e of manifest.entries) {
          if (pulled[e.path] !== undefined) this.link.known[e.path] = {id: e.id, hash: pulled[e.path], remote: e.hash};
        }
        const held = new Set(manifest.entries.map(e => e.path));
        const local = await this.p.snapshot();
        for (const k of Object.keys(local)) {
          if (isMediaKey(k) || !this.includeKey(k) || held.has(k)) continue;
          if (k === CLOUD_IDENTITY_KEY || k === CLOUD_FRIENDS_KEY || k === CLOUD_TOMBSTONES_KEY) continue;
          await this.p.remove(k);
        }
        this.link.lastCheckAt = this.p.now();
        await this.p.saveLink(this.link);
      }
      this.setPhase('idle', 0);
      this.emit();
      this.schedulePush(0);
    } catch (e) {
      this.link = null;
      this.masterKey = null;
      await this.p.saveLink(null).catch(() => {});
      this.setPhase('idle', 0);
      this.recordError(e);
      throw e;
    }
  }

  cancelPendingLink(): void {
    if (this.pendingCreds) this.pendingCreds.kek.fill(0);
    this.pendingCreds = null;
  }

  async unlink(): Promise<void> {
    if (!this.link) return;
    this.clearTimers();
    this.sealed.clear();
    this.sealedBytes = 0;
    try {
      const sub = await this.p.deviceSubId();
      await this.api().unlinkDevice(this.creds(), sub);
    } catch (e) {
      this.recordError(e);
    }
    this.link = null;
    this.masterKey = null;
    this.deviceCount = 0;
    this.pendingKeys = 0;
    await this.p.saveLink(null);
    this.setPhase('idle', 0);
  }

  noteRemoved(key: string): void {
    if (!this.link || isMediaKey(key) || !key.startsWith('ps:')) return;
    this.link.removed = {...(this.link.removed || {}), [key]: this.p.now()};
    this.p.saveLink(this.link).catch(() => {});
  }

  async setMediaTier(on: boolean): Promise<void> {
    if (!this.link || this.link.mediaTier === on) return;
    this.link.mediaTier = on;
    await this.p.saveLink(this.link);
    this.emit();
    this.schedulePush(0);
  }

  private async registerDevice(): Promise<void> {
    const sub = await this.p.deviceSubId();
    const devices = await this.api().linkDevice(this.creds(), sub, this.p.deviceLabel());
    this.deviceCount = devices.length;
  }

  schedulePush(delayMs = PUSH_DEBOUNCE_MS): void {
    if (!this.link) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      this.runSync('checking').catch(() => {});
    }, delayMs);
  }

  wake(): void {
    if (!this.link) return;
    const now = this.p.now();
    if (now - this.lastCheckStartedAt < CHECK_MIN_INTERVAL_MS) return;
    this.runSync('checking').catch(() => {});
  }

  private clearTimers(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.pushTimer = null;
    this.retryTimer = null;
    this.retryAttempt = 0;
  }

  private scheduleRetry(err: unknown): void {
    if (!this.link || this.retryTimer) return;
    let delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, this.retryAttempt));
    if (err instanceof CloudError && err.retryAfterSeconds) delay = Math.max(delay, err.retryAfterSeconds * 1000);
    this.retryAttempt++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.runSync('checking').catch(() => {});
    }, delay);
  }

  private recordError(e: unknown): void {
    this.lastError = e instanceof Error ? e.message : String(e);
    this.emit();
  }

  private runSync(phase: CloudPhase): Promise<void> {
    if (this.syncing) {
      if (!this.queued) {
        const after = (): Promise<void> => {
          this.queued = null;
          return this.link ? this.runSync(phase) : Promise.resolve();
        };
        this.queued = this.syncing.then(after, after);
      }
      return this.queued;
    }
    this.lastCheckStartedAt = this.p.now();
    const run = (async () => {
      this.setPhase(phase, 0);
      try {
        this.tooLarge = [];
        this.unbackedMedia = [];
        await this.syncOnce();
        this.retryAttempt = 0;
        this.lastError = this.tooLarge.length
          ? `Left out, larger than ${Math.round(OBJECT_MAX_BYTES / (1024 * 1024))} MB: ${this.tooLarge.join(', ')}`
          : null;
      } catch (e) {
        this.recordError(e);
        this.scheduleRetry(e);
        throw e;
      } finally {
        this.syncing = null;
        this.setPhase('idle', 0);
      }
    })();
    this.syncing = run;
    return run;
  }

  private openManifest(ciphertext: Uint8Array): VaultManifest {
    const plain = decryptBytes(this.key(), ciphertext);
    if (!plain) throw new CloudError(0, 'manifest undecryptable');
    const m = JSON.parse(unpackData(plain)) as VaultManifest;
    if (!m || m.v !== MANIFEST_V || !Array.isArray(m.entries)) throw new CloudError(0, 'manifest malformed');
    return m;
  }

  private sealManifest(m: VaultManifest): Uint8Array {
    return encryptBytes(this.key(), packData(JSON.stringify(m)));
  }

  private keyHash(key: string, raw: string): string {
    return isMediaKey(key) ? this.p.localHash(raw.slice(raw.indexOf(',') + 1)) : this.p.localHash(raw);
  }

  private includeKey(key: string): boolean {
    if (!isMediaKey(key)) return true;
    if (tierOf(kindOf(key)) === 'base') return true;
    return !!this.link?.mediaTier;
  }

  private async syncOnce(): Promise<void> {
    if (!this.link) return;
    const api = this.api();
    const vc = this.creds();
    const removedAtStart: Record<string, number> = {...(this.link.removed || {})};
    const local = await this.p.snapshot();
    const localHashes: Record<string, string> = {};
    const missing = new Set<string>();
    let hashed = 0;
    for (const k in local) {
      if (!this.includeKey(k)) continue;
      if (local[k] === CLOUD_MEDIA_MISSING) {
        missing.add(k);
        continue;
      }
      localHashes[k] = this.keyHash(k, local[k]);
      if (++hashed % HASH_YIELD_KEYS === 0) await new Promise<void>(r => setTimeout(r, 0));
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await api.getManifest(vc);
      const remoteManifest: VaultManifest = remote
        ? this.openManifest(remote.ciphertext)
        : {v: MANIFEST_V, version: 0, created: this.p.now(), updated: this.p.now(), devices: [], entries: []};
      const remoteVersion = remote ? remote.version : 0;
      const remoteObjects = new Set((remote?.objects || []).map(o => o.id));
      const R = new Map(remoteManifest.entries.map(e => [e.path, e]));
      this.unbackedMedia = [...missing].filter(k => !R.has(k));
      const K = this.link.known;

      const toUpload: string[] = [];
      const toPull: ManifestEntry[] = [];
      const toRemoveLocal: string[] = [];
      const merged = new Map<string, ManifestEntry>();
      for (const [path, e] of R) merged.set(path, e);

      for (const k in localHashes) {
        const h = localHashes[k];
        const known = K[k];
        const knownRemote = known ? (known.remote ?? known.hash) : undefined;
        const r = R.get(k);
        if (known && known.hash === h) {
          if (!r) {
            toRemoveLocal.push(k);
          } else if (r.hash !== knownRemote) {
            toPull.push(r);
          }
          continue;
        }
        const cloudUnchanged = (!r && !known) || (!!r && !!known && r.hash === knownRemote) || (!!r && r.hash === h);
        if (!r && known) {
          toRemoveLocal.push(k);
          continue;
        }
        if (r && r.hash === h) {
          merged.set(k, r);
          continue;
        }
        if (cloudUnchanged) toUpload.push(k);
        else if (r) toPull.push(r);
      }
      for (const [path, e] of R) {
        if (path in localHashes) continue;
        if (!this.includeKey(path)) continue;
        if (missing.has(path)) {
          toPull.push(e);
          continue;
        }
        const known = K[path];
        const explicit = isMediaKey(path) ? ownerKeyOf(path) in localHashes : !!removedAtStart[path];
        if (known && explicit && (known.remote ?? known.hash) === e.hash) {
          merged.delete(path);
        } else {
          toPull.push(e);
        }
      }

      this.pendingKeys = toUpload.length;
      this.emit();

      let done = 0;
      const uploaded: ManifestEntry[] = [];
      const uploadedLocal: Record<string, string> = {};
      for (const k of toUpload) {
        const entry = await this.uploadKey(api, vc, k, local[k], localHashes[k], remoteObjects);
        if (entry) {
          uploaded.push(entry);
          merged.set(k, entry);
          uploadedLocal[k] = localHashes[k];
        }
        done++;
        this.progress = toUpload.length ? done / toUpload.length : 1;
        this.emit();
      }

      const changedManifest = uploaded.length > 0 || merged.size !== R.size || [...merged.keys()].some(k => !R.has(k));
      let newVersion = remoteVersion;
      if (changedManifest || !remote) {
        const next: VaultManifest = {
          v: MANIFEST_V,
          version: remoteVersion + 1,
          created: remoteManifest.created || this.p.now(),
          updated: this.p.now(),
          devices: remoteManifest.devices || [],
          entries: [...merged.values()],
        };
        const refs = next.entries.map(e => ({id: e.id, tier: e.tier, size: e.size}));
        try {
          newVersion = await api.putManifest(vc, remoteVersion, this.sealManifest(next), refs);
        } catch (e) {
          if (e instanceof CloudError && e.status === 409) continue;
          throw e;
        }
      }

      let pulled: Record<string, string> = {};
      if (toPull.length || toRemoveLocal.length) {
        pulled = await this.pullEntries(api, vc, toPull, false);
        for (const k of toRemoveLocal) await this.p.remove(k);
      }

      const known: Record<string, {id: string; hash: string; remote?: string}> = {};
      for (const e of merged.values()) {
        const localNow = uploadedLocal[e.path] ?? pulled[e.path] ?? localHashes[e.path];
        if (localNow === undefined) continue;
        known[e.path] = {id: e.id, hash: localNow, remote: e.hash};
      }
      this.link.known = known;
      if (this.link.removed) {
        for (const k of Object.keys(removedAtStart)) {
          if (this.link.removed[k] === removedAtStart[k]) delete this.link.removed[k];
        }
        if (Object.keys(this.link.removed).length === 0) delete this.link.removed;
      }
      this.link.manifestVersion = newVersion;
      this.link.lastCheckAt = this.p.now();
      this.pendingKeys = 0;
      await this.p.saveLink(this.link);
      return;
    }
    throw new CloudError(409, 'manifest version conflict', 'Another device kept changing the vault; will retry.');
  }

  private async uploadKey(api: CloudApi, vc: VaultCreds, key: string, raw: string, hash: string, remoteObjects: Set<string>): Promise<ManifestEntry | null> {
    const kind = kindOf(key);
    const tier = tierOf(kind);
    let plain: Uint8Array;
    let mime: string | undefined;
    let canonical = hash;
    if (isMediaKey(key)) {
      const encoded = await this.p.reencodeImage(raw);
      const parts = splitDataUri(encoded);
      if (!parts) return null;
      plain = parts.bytes;
      mime = parts.mime;
      canonical = this.keyHash(key, encoded);
    } else {
      plain = packData(raw);
    }
    const kept = this.sealed.get(key);
    const ct = kept && kept.hash === hash ? kept.ct : encryptBytes(this.key(), plain);
    if (ct.length > OBJECT_MAX_BYTES) {
      if (!this.tooLarge.includes(key)) this.tooLarge.push(key);
      return null;
    }
    const id = objectIdOf(ct);
    this.keepSealed(key, hash, ct);
    await api.putObject(vc, id, tier, ct);
    this.dropSealed(key);
    remoteObjects.add(id);
    return {path: key, id, size: plain.length, kind, tier, hash: canonical, mime};
  }

  private keepSealed(key: string, hash: string, ct: Uint8Array): void {
    const had = this.sealed.get(key);
    if (had && had.ct === ct) return;
    if (had) this.sealedBytes -= had.ct.length;
    while (this.sealedBytes + ct.length > SEALED_KEEP_MAX_BYTES && this.sealed.size) {
      const oldest = this.sealed.keys().next().value as string;
      this.sealedBytes -= this.sealed.get(oldest)!.ct.length;
      this.sealed.delete(oldest);
    }
    this.sealed.set(key, {hash, ct});
    this.sealedBytes += ct.length;
  }

  private dropSealed(key: string): void {
    const had = this.sealed.get(key);
    if (!had) return;
    this.sealedBytes -= had.ct.length;
    this.sealed.delete(key);
  }

  private async pullAll(api: CloudApi, vc: VaultCreds, manifest: VaultManifest, importing: boolean): Promise<Record<string, string>> {
    const entries = manifest.entries.filter(e => this.includeKey(e.path));
    return this.pullEntries(api, vc, entries, importing);
  }

  private async pullEntries(api: CloudApi, vc: VaultCreds, entries: ManifestEntry[], importing: boolean): Promise<Record<string, string>> {
    const landed: Record<string, string> = {};
    if (!entries.length) return landed;
    const values: Record<string, string> = {};
    let identityRaw: string | null = null;
    let friendsRaw: string | null = null;
    let tombstonesRaw: string | null = null;
    let done = 0;
    for (const e of entries) {
      const ct = await api.getObject(vc, e.id);
      if (objectIdOf(ct) !== e.id) throw new CloudError(0, 'object hash mismatch', `Downloaded object ${e.id} did not match its ID.`);
      const plain = decryptBytes(this.key(), ct);
      if (!plain) throw new CloudError(0, 'object undecryptable', `Object ${e.id} could not be decrypted.`);
      let raw: string;
      if (isMediaKey(e.path)) raw = joinDataUri(e.mime || 'image/jpeg', plain);
      else raw = unpackData(plain);
      if (e.path === CLOUD_IDENTITY_KEY) identityRaw = raw;
      else if (e.path === CLOUD_FRIENDS_KEY) friendsRaw = raw;
      else if (e.path === CLOUD_TOMBSTONES_KEY) tombstonesRaw = raw;
      else values[e.path] = raw;
      landed[e.path] = this.keyHash(e.path, raw);
      done++;
      this.progress = done / entries.length;
      this.emit();
    }
    if (importing && identityRaw) await this.p.adoptIdentity(identityRaw, friendsRaw);
    else if (friendsRaw || tombstonesRaw) await this.p.mergeFriends(friendsRaw, tombstonesRaw);
    if (Object.keys(values).length) await this.p.apply(values);
    return landed;
  }
}
