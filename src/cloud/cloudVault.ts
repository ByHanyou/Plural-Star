import {CloudApi, VaultCreds} from './cloudApi';
import {
  CloudError,
  CloudErrorKind,
  CloudLeftOut,
  CloudLimits,
  CloudLinkState,
  cloudErrorCode,
  cloudErrorKind,
  CloudPhase,
  CloudStatus,
  CloudTransport,
  isCloudKind,
  ManifestEntry,
  VaultManifest,
} from './cloudTypes';
import {
  base64ToBytes,
  decryptBytes,
  deriveVaultCredentials,
  encryptBytes,
  joinDataUri,
  newMasterKey,
  objectIdOf,
  packData,
  splitDataUri,
  unpackData,
  wrapMasterKey,
} from './cloudCrypto';
import {
  CLOUD_FRIENDS_KEY,
  CLOUD_IDENTITY_KEY,
  CLOUD_MEDIA_MISSING,
  CLOUD_MEDIA_REF,
  CLOUD_OBJECT_MAX_MB,
  CLOUD_TOMBSTONES_KEY,
  canonicalRecord,
  isMediaKey,
  kindOf,
  tierOf,
} from './cloudKeys';
import {MANIFEST_V, openManifest, sealManifest} from './cloudManifest';
import {MEDIA_ENCODING, knownAfterSync, planSync} from './cloudPlan';
import {PendingLink, isDeviceGone, newLinkState, peekVault, pendingVaultCreds} from './cloudLinking';
import {SealedCache} from './sealedCache';
import {log, logError} from '../utils/log';

const OBJECT_MAX_BYTES = CLOUD_OBJECT_MAX_MB * 1024 * 1024;
const SEALED_KEEP_MAX_BYTES = 24 * 1024 * 1024;
const HASH_YIELD_CHARS = 64 * 1024;
const BOT_SUB_PREFIX = 'starbot:';
const RETRY_STATUSES = new Set([401, 403, 404, 408, 409, 423, 425, 429]);

export interface CloudPlatform {
  transport: CloudTransport;
  relay(): {relayUrl: string; token: string};
  snapshot(): Promise<Record<string, string>>;
  apply(keys: Record<string, string>): Promise<void>;
  remove(key: string): Promise<void>;
  adoptIdentity(identityRaw: string, friendsRaw: string | null): Promise<void>;
  mergeFriends(friendsRaw: string | null, tombstonesRaw: string | null): Promise<void>;
  reencodeImage(dataUri: string, key: string): Promise<string>;
  localHash(raw: string): Promise<string>;
  loadLink(): Promise<CloudLinkState | null>;
  saveLink(state: CloudLinkState | null): Promise<void>;
  deviceSubId(): Promise<string>;
  deviceLabel(): string;
  now(): number;
  limits(): CloudLimits;
  skipMediaReupload?: boolean;
  argon2id?(password: string, salt: Uint8Array): Promise<Uint8Array>;
  readMedia?(ref: string): Promise<string | null>;
}

const isKeyRouteMissing = (e: unknown): boolean => isCloudKind(e, 'ROUTE_MISSING');

const isKeyIssued = (e: unknown): boolean => isCloudKind(e, 'DEVICE_KEY_ISSUED');

export type LinkOutcome = {kind: 'created'} | {kind: 'existing'; empty: boolean; canClear: boolean};

export type UnlinkOutcome = {deviceRemoved: boolean; errorCode: string | null};

type Listener = (s: CloudStatus) => void;

export class CloudService {
  private p: CloudPlatform;
  private link: CloudLinkState | null = null;
  private masterKey: Uint8Array | null = null;
  private available = false;
  private phase: CloudPhase = 'idle';
  private progress = 0;
  private lastError: string | null = null;
  private lastErrorCode: string | null = null;
  private lastErrorKind: CloudErrorKind | null = null;
  private leftOut: CloudLeftOut | null = null;
  private deviceCount = 0;
  private pendingKeys = 0;
  private listeners: Set<Listener> = new Set();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private syncing: Promise<void> | null = null;
  private queued: Promise<void> | null = null;
  private sealed = new SealedCache(SEALED_KEEP_MAX_BYTES);
  private tooLarge: string[] = [];
  private overQuota: string[] = [];
  private unbackedMedia: string[] = [];
  private refused: {key: string; code: string}[] = [];
  private unreadable: {key: string; why: string}[] = [];
  private mediaHashMemo: Map<string, string> = new Map();
  private lastCheckStartedAt = 0;
  private loaded = false;
  private runGen = 0;
  private unlinking = false;
  private removedFromVault = false;
  private unlinkRun: Promise<UnlinkOutcome> | null = null;
  private keying: Promise<void> | null = null;
  private recovering: Promise<boolean> | null = null;
  private pendingCreds: PendingLink | null = null;

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
      lastErrorCode: this.lastErrorCode,
      lastErrorKind: this.lastErrorKind,
      leftOut: this.leftOut,
      mediaTier: !!this.link?.mediaTier,
      deviceCount: this.deviceCount,
      lastSyncAt: this.link?.lastCheckAt || 0,
      pendingKeys: this.pendingKeys,
      unbackedMedia: this.unbackedMedia.length,
      vaultEntries: this.link?.vaultEntries || 0,
      removedFromVault: this.removedFromVault,
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
      } catch (e) {
        logError('cloud', e);
      }
    });
  }

  private setPhase(phase: CloudPhase, progress = 0): void {
    this.phase = phase;
    this.progress = progress;
    this.emit();
  }

  private api(): CloudApi {
    const {relayUrl, token} = this.p.relay();
    return new CloudApi(relayUrl, token, this.p.transport, this.p.limits());
  }

  private async creds(link: CloudLinkState | null = this.link): Promise<VaultCreds> {
    if (!link) throw new CloudError(0, 'not linked');
    return {lookupId: link.lookupId, authSecret: link.authSecret, deviceId: await this.p.deviceSubId(), deviceKey: link.deviceKey};
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
      this.masterKey = base64ToBytes(this.link.masterKeyB64);
      this.pendingKeys = 0;
      const link = this.link;
      const read = async (): Promise<Awaited<ReturnType<CloudApi['info']>>> => this.api().info(await this.creds(link));
      (async () => {
        await this.ensureDeviceKey();
        let info: Awaited<ReturnType<CloudApi['info']>>;
        try {
          info = await read();
        } catch (e) {
          if (this.link !== link || !(await this.recoverDeviceKey(link, e))) throw e;
          info = await read();
        }
        if (this.link !== link) return;
        this.deviceCount = info.devices.length;
        this.emit();
      })()
        .catch(e => (this.link === link && isDeviceGone(e) ? this.dropRemovedDevice() : undefined))
        .catch(e => log.debug('cloud', e));
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
    if (this.pendingCreds) this.pendingCreds.masterKey.fill(0);
    this.pendingCreds = null;
    this.removedFromVault = false;
    this.clearError();
    this.setPhase('deriving', 0);
    let link: CloudLinkState;
    let gen: number;
    try {
      const creds = await deriveVaultCredentials(password, f => this.setPhase('deriving', f), this.p.argon2id?.bind(this.p));
      const api = this.api();
      const exists = await api.lookup(creds.lookupId);
      if (exists) {
        this.setPhase('checking', 0);
        const pending = await peekVault(api, this.p, creds);
        this.pendingCreds = pending;
        this.setPhase('idle', 0);
        return {kind: 'existing', empty: pending.empty, canClear: pending.canClear};
      }
      const mk = newMasterKey();
      const wrapped = wrapMasterKey(mk, creds.kek);
      await api.create({lookupId: creds.lookupId, authSecret: creds.authSecret}, wrapped);
      const reg = await api.linkDevice({lookupId: creds.lookupId, authSecret: creds.authSecret}, await this.p.deviceSubId(), this.p.deviceLabel());
      this.masterKey = mk;
      this.deviceCount = reg.devices.length;
      link = this.link = newLinkState(creds.lookupId, creds.authSecret, mk, mediaTier, reg.deviceKey, 0, this.p.now());
      creds.kek.fill(0);
      gen = this.runGen;
      await this.p.saveLink(link);
      this.emit();
      await this.runSync('uploading');
    } catch (e) {
      this.setPhase('idle', 0);
      this.noteError(e);
      throw e;
    }
    if (gen !== this.runGen || this.link !== link) throw new CloudError(0, 'not linked');
    return {kind: 'created'};
  }

  async importExisting(mediaTier: boolean, allowEmpty = false): Promise<void> {
    if (this.link) throw new CloudError(0, 'already linked');
    const pending = this.pendingCreds;
    if (!pending) throw new CloudError(0, 'no pending credentials');
    if (pending.empty && !allowEmpty) throw new CloudError(0, 'vault empty');
    this.pendingCreds = null;
    this.clearError();
    this.resetLeftOut();
    this.setPhase('importing', 0);
    try {
      const api = this.api();
      const vc = pendingVaultCreds(pending);
      this.masterKey = pending.masterKey;
      this.link = newLinkState(pending.lookupId, pending.authSecret, pending.masterKey, mediaTier, pending.deviceKey, 0, this.p.now());
      this.deviceCount = pending.deviceCount;
      await this.p.saveLink(this.link);
      const remote = await api.getManifest(vc);
      if (remote) {
        const manifest = openManifest(remote.ciphertext, this.key());
        const pulled = await this.pullAll(api, vc, manifest, true);
        this.link.manifestVersion = remote.version;
        this.link.known = {};
        for (const e of manifest.entries) {
          if (pulled[e.path] !== undefined) this.link.known[e.path] = {id: e.id, hash: pulled[e.path], remote: e.hash};
        }
        const held = new Set(manifest.entries.map(e => e.path));
        const local = await this.p.snapshot();
        for (const k of Object.keys(local)) {
          if (isMediaKey(k) || held.has(k)) continue;
          if (k === CLOUD_IDENTITY_KEY || k === CLOUD_FRIENDS_KEY || k === CLOUD_TOMBSTONES_KEY) continue;
          await this.p.remove(k);
        }
        this.link.vaultEntries = manifest.entries.length;
        this.link.lastCheckAt = this.p.now();
        await this.p.saveLink(this.link);
      }
      this.noteLeftOut();
      this.setPhase('idle', 0);
      this.emit();
      this.schedulePush(0);
    } catch (e) {
      this.link = null;
      this.masterKey = null;
      await this.p.saveLink(null).catch(err => logError('cloud', err));
      this.setPhase('idle', 0);
      this.noteError(e);
      throw e;
    }
  }

  async clearAndUpload(mediaTier: boolean): Promise<void> {
    if (this.link) throw new CloudError(0, 'already linked');
    const pending = this.pendingCreds;
    if (!pending) throw new CloudError(0, 'no pending credentials');
    if (!pending.canClear) throw new CloudError(0, 'vault not clearable');
    this.pendingCreds = null;
    this.clearError();
    this.setPhase('uploading', 0);
    let link: CloudLinkState;
    let gen: number;
    try {
      const api = this.api();
      const vc = pendingVaultCreds(pending);
      const info = await api.info(vc);
      let devices = info.devices;
      for (const d of info.devices) {
        if (d.sub_id === pending.subId || d.sub_id.startsWith(BOT_SUB_PREFIX)) continue;
        devices = (await api.unlinkDevice(vc, d.sub_id)).devices;
      }
      const now = this.p.now();
      const cleared: VaultManifest = {
        v: MANIFEST_V,
        version: pending.version + 1,
        created: pending.manifest?.created || now,
        updated: now,
        devices: pending.manifest?.devices || [],
        entries: [],
      };
      const version = await api.putManifest(vc, pending.version, sealManifest(cleared, pending.masterKey), []);
      this.masterKey = pending.masterKey;
      this.deviceCount = devices.length;
      link = this.link = {...newLinkState(pending.lookupId, pending.authSecret, pending.masterKey, mediaTier, pending.deviceKey, version, now), vaultEntries: 0};
      gen = this.runGen;
      await this.p.saveLink(link);
      this.emit();
      await this.runSync('uploading');
    } catch (e) {
      this.setPhase('idle', 0);
      this.noteError(e);
      throw e;
    }
    if (gen !== this.runGen || this.link !== link) throw new CloudError(0, 'not linked');
  }

  cancelPendingLink(): void {
    const pending = this.pendingCreds;
    this.pendingCreds = null;
    if (!pending) return;
    pending.masterKey.fill(0);
    this.api().unlinkDevice(pendingVaultCreds(pending), pending.subId).catch(e => log.debug('cloud', e));
  }

  unlink(): Promise<UnlinkOutcome> {
    if (!this.unlinkRun) {
      this.unlinkRun = this.unlinkOnce().finally(() => {
        this.unlinkRun = null;
      });
    }
    return this.unlinkRun;
  }

  private async unlinkOnce(): Promise<UnlinkOutcome> {
    if (!this.link) return {deviceRemoved: true, errorCode: null};
    this.unlinking = true;
    this.runGen++;
    this.queued = null;
    this.clearTimers();
    try {
      const running = this.syncing;
      if (running) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([running.catch(() => {}), new Promise<void>(r => (timer = setTimeout(r, this.p.limits().unlinkWaitMs)))]);
        if (timer) clearTimeout(timer);
      }
      this.clearTimers();
      this.sealed.clear();
      let errorCode: string | null = null;
      try {
        await this.ensureDeviceKey();
        const sub = await this.p.deviceSubId();
        try {
          await this.api().unlinkDevice(await this.creds(), sub);
        } catch (e) {
          if (!this.link || !(await this.recoverDeviceKey(this.link, e))) throw e;
          await this.api().unlinkDevice(await this.creds(), sub);
        }
      } catch (e) {
        if (!isDeviceGone(e)) {
          errorCode = cloudErrorCode(e);
          this.recordError(e);
        }
      }
      await this.forgetLink();
      return {deviceRemoved: errorCode === null, errorCode};
    } finally {
      this.unlinking = false;
    }
  }

  private async forgetLink(): Promise<void> {
    this.link = null;
    this.masterKey = null;
    this.deviceCount = 0;
    this.pendingKeys = 0;
    this.clearError();
    await this.p.saveLink(null);
    this.setPhase('idle', 0);
  }

  noteRemoved(key: string): void {
    if (!this.link || isMediaKey(key) || !key.startsWith('ps:')) return;
    this.link.removed = {...(this.link.removed || {}), [key]: this.p.now()};
    this.p.saveLink(this.link).catch(e => logError('cloud', e));
  }

  async setMediaTier(on: boolean): Promise<void> {
    if (!this.link || this.link.mediaTier === on) return;
    this.link.mediaTier = on;
    await this.p.saveLink(this.link);
    this.emit();
    this.schedulePush(0);
  }

  private ensureDeviceKey(): Promise<void> {
    const link = this.link;
    if (!link || link.deviceKey) return Promise.resolve();
    if (!this.keying) {
      this.keying = (async () => {
        const sub = await this.p.deviceSubId();
        const vc: VaultCreds = {lookupId: link.lookupId, authSecret: link.authSecret};
        let key: string;
        try {
          key = await this.api().issueDeviceKey(vc, sub);
        } catch (e) {
          if (isKeyRouteMissing(e)) return;
          if (!isKeyIssued(e)) throw e;
          if (this.link !== link) throw new CloudError(0, 'not linked');
          key = (await this.api().linkDevice(vc, sub, this.p.deviceLabel())).deviceKey;
        }
        if (this.link !== link) throw new CloudError(0, 'not linked');
        link.deviceKey = key;
        await this.p.saveLink(link);
      })().finally(() => {
        this.keying = null;
      });
    }
    return this.keying;
  }

  private recoverDeviceKey(link: CloudLinkState, e: unknown): Promise<boolean> {
    if (!(e instanceof CloudError) || e.status !== 401 || this.link !== link) return Promise.resolve(false);
    if (e.kind !== 'DEVICE_KEY_REQUIRED' && (e.kind !== 'DEVICE_UNLINKED' || !link.deviceKey)) return Promise.resolve(false);
    if (!this.recovering) {
      this.recovering = this.recoverDeviceKeyOnce(link).finally(() => {
        this.recovering = null;
      });
    }
    return this.recovering;
  }

  private async recoverDeviceKeyOnce(link: CloudLinkState): Promise<boolean> {
    if (link.deviceKey) {
      try {
        await this.api().info(await this.creds(link));
        return true;
      } catch (probe) {
        if (!(probe instanceof CloudError) || probe.status !== 401) throw probe;
        if (probe.kind === 'DEVICE_KEY_REQUIRED') link.deviceKey = undefined;
      }
    }
    if (this.link !== link) return false;
    if (!link.deviceKey) {
      await this.ensureDeviceKey();
      return this.link === link && !!link.deviceKey;
    }
    const sub = await this.p.deviceSubId();
    const vc: VaultCreds = {lookupId: link.lookupId, authSecret: link.authSecret};
    const reg = await this.api().linkDevice(vc, sub, this.p.deviceLabel());
    if (this.link !== link) return false;
    if (reg.existed && reg.deviceKey) {
      link.deviceKey = reg.deviceKey;
      await this.p.saveLink(link);
      return true;
    }
    await this.api().unlinkDevice({...vc, deviceId: sub, deviceKey: reg.deviceKey}, sub).catch(e => log.debug('cloud', e));
    return false;
  }

  private async dropRemovedDevice(): Promise<void> {
    if (!this.link || this.unlinking) return;
    this.removedFromVault = true;
    this.runGen++;
    this.queued = null;
    this.clearTimers();
    this.sealed.clear();
    await this.forgetLink();
  }

  schedulePush(delayMs = this.p.limits().pushDebounceMs): void {
    if (!this.link) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      this.runSync('checking').catch(e => log.debug('cloud', e));
    }, delayMs);
  }

  wake(): void {
    if (!this.link) return;
    const now = this.p.now();
    if (now - this.lastCheckStartedAt < this.p.limits().checkMinIntervalMs) return;
    this.runSync('checking').catch(e => log.debug('cloud', e));
  }

  isBusy(): boolean {
    return !!(this.queued || this.syncing);
  }

  pending(): Promise<void> | null {
    return this.queued || this.syncing;
  }

  pendingLink(): VaultCreds | null {
    return this.pendingCreds ? pendingVaultCreds(this.pendingCreds) : null;
  }

  hashFor(key: string, raw: string): Promise<string> {
    return this.keyHash(key, raw);
  }

  syncNow(phase: CloudPhase): Promise<void> {
    return this.runSync(phase);
  }

  stop(): void {
    this.clearTimers();
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
    let delay = Math.min(this.p.limits().retryMaxMs, this.p.limits().retryBaseMs * Math.pow(2, this.retryAttempt));
    if (err instanceof CloudError && err.retryAfterSeconds) delay = Math.max(delay, err.retryAfterSeconds * 1000);
    this.retryAttempt++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.runSync('checking').catch(e => log.debug('cloud', e));
    }, delay);
  }

  private recordError(e: unknown): void {
    this.lastError = e instanceof Error ? e.message : String(e);
    this.lastErrorCode = cloudErrorCode(e);
    this.lastErrorKind = cloudErrorKind(e);
    this.leftOut = null;
    this.emit();
  }

  private clearError(): void {
    this.lastError = null;
    this.lastErrorCode = null;
    this.lastErrorKind = null;
    this.leftOut = null;
  }

  private resetLeftOut(): void {
    this.tooLarge = [];
    this.overQuota = [];
    this.refused = [];
    this.unreadable = [];
  }

  private noteLeftOut(): void {
    this.lastError = this.leftOutSummary();
    this.lastErrorCode = null;
    this.lastErrorKind = null;
    this.leftOut = this.leftOutDetail();
  }

  private noteError(e: unknown): void {
    if (isDeviceGone(e)) {
      this.removedFromVault = true;
      this.emit();
    } else {
      this.recordError(e);
    }
  }

  private stopIfStale(gen?: number): void {
    if (gen !== undefined && gen !== this.runGen) throw new CloudError(0, 'run stopped');
  }

  private runSync(phase: CloudPhase): Promise<void> {
    if (this.unlinking) return Promise.resolve();
    const gen = this.runGen;
    if (this.syncing) {
      if (!this.queued) {
        const after = (): Promise<void> => {
          if (gen !== this.runGen) return Promise.resolve();
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
      const link = this.link;
      try {
        this.resetLeftOut();
        this.unbackedMedia = [];
        try {
          await this.syncOnce(gen);
        } catch (e) {
          if (gen !== this.runGen || !link || !(await this.recoverDeviceKey(link, e))) throw e;
          await this.syncOnce(gen);
        }
        if (gen !== this.runGen) return;
        this.retryAttempt = 0;
        this.noteLeftOut();
      } catch (e) {
        if (gen !== this.runGen) return;
        if (isDeviceGone(e)) {
          await this.dropRemovedDevice();
          throw e;
        }
        this.recordError(e);
        this.scheduleRetry(e);
        throw e;
      } finally {
        this.syncing = null;
        if (gen === this.runGen) this.setPhase('idle', 0);
      }
    })();
    this.syncing = run;
    return run;
  }

  private leftOutSummary(): string | null {
    const lines: string[] = [];
    if (this.tooLarge.length) lines.push(`Left out, larger than ${CLOUD_OBJECT_MAX_MB} MB: ${this.tooLarge.join(', ')}`);
    if (this.overQuota.length) lines.push(`Left out, over the vault's space: ${this.overQuota.join(', ')}`);
    if (this.refused.length) lines.push(`Left out, the cloud refused them: ${this.refused.map(r => `${r.key} (${r.code})`).join(', ')}`);
    if (this.unreadable.length) lines.push(`Could not be read from the cloud: ${this.unreadable.map(u => `${u.key} (${u.why})`).join(', ')}`);
    return lines.length ? lines.join('\n') : null;
  }

  private leftOutDetail(): CloudLeftOut | null {
    if (!this.tooLarge.length && !this.overQuota.length && !this.refused.length && !this.unreadable.length) return null;
    return {
      maxObjectMb: CLOUD_OBJECT_MAX_MB,
      tooLarge: [...this.tooLarge],
      overQuota: [...this.overQuota],
      refused: this.refused.map(r => ({...r})),
      unreadable: this.unreadable.map(u => ({...u})),
    };
  }

  private noteUnreadable(key: string, why: string): void {
    if (!this.unreadable.some(u => u.key === key)) this.unreadable.push({key, why});
  }

  private async resolveMedia(raw: string): Promise<string | null> {
    if (!raw.startsWith(CLOUD_MEDIA_REF)) return raw;
    if (!this.p.readMedia) return null;
    return this.p.readMedia(raw.slice(CLOUD_MEDIA_REF.length));
  }

  private async localKeyHash(key: string, raw: string): Promise<string | null> {
    if (!raw.startsWith(CLOUD_MEDIA_REF)) return this.keyHash(key, raw);
    const memo = this.mediaHashMemo.get(raw);
    if (memo !== undefined) return memo;
    const data = await this.resolveMedia(raw);
    if (data === null) return null;
    const h = await this.keyHash(key, data);
    if (this.mediaHashMemo.size >= 4096) this.mediaHashMemo.clear();
    this.mediaHashMemo.set(raw, h);
    return h;
  }

  private keyHash(key: string, raw: string): Promise<string> {
    if (isMediaKey(key)) return this.p.localHash(raw.slice(raw.indexOf(',') + 1));
    return this.p.localHash(canonicalRecord(key, raw));
  }

  private includeKey(key: string): boolean {
    if (!isMediaKey(key)) return true;
    if (tierOf(kindOf(key)) === 'base') return true;
    return !!this.link?.mediaTier;
  }

  private async syncOnce(gen: number): Promise<void> {
    if (!this.link) return;
    await this.ensureDeviceKey();
    this.stopIfStale(gen);
    const api = this.api();
    const vc = await this.creds();
    this.stopIfStale(gen);
    const removedAtStart: Record<string, number> = {...(this.link.removed || {})};
    const local = await this.p.snapshot();
    const localHashes: Record<string, string> = {};
    const missing = new Set<string>();
    let sinceYield = 0;
    for (const k in local) {
      if (!this.includeKey(k)) continue;
      if (local[k] === CLOUD_MEDIA_MISSING) {
        missing.add(k);
        continue;
      }
      const h = await this.localKeyHash(k, local[k]);
      this.stopIfStale(gen);
      if (h === null) {
        missing.add(k);
        continue;
      }
      localHashes[k] = h;
      sinceYield += local[k].startsWith(CLOUD_MEDIA_REF) ? HASH_YIELD_CHARS : local[k].length;
      if (sinceYield >= HASH_YIELD_CHARS) {
        sinceYield = 0;
        await new Promise<void>(r => setTimeout(r, 0));
      }
    }
    const forceUpload = new Set<string>();
    const dropRemote = new Set<string>();

    for (let attempt = 0; attempt < 3; attempt++) {
      this.stopIfStale(gen);
      const remote = await api.getManifest(vc);
      this.stopIfStale(gen);
      const remoteManifest: VaultManifest = remote
        ? openManifest(remote.ciphertext, this.key())
        : {v: MANIFEST_V, version: 0, created: this.p.now(), updated: this.p.now(), devices: [], entries: []};
      const remoteVersion = remote ? remote.version : 0;
      const remoteObjects = new Set((remote?.objects || []).map(o => o.id));
      const R = new Map(remoteManifest.entries.filter(e => !dropRemote.has(e.path)).map(e => [e.path, e]));
      this.unbackedMedia = [...missing].filter(k => !R.has(k));
      const K = this.link.known;
      const {toUpload, toPull, toRemoveLocal, merged} = planSync({
        localHashes,
        known: K,
        remote: R,
        missing,
        removedAtStart,
        forceUpload,
        reupload: !this.p.skipMediaReupload,
        includeKey: k => this.includeKey(k),
      });

      this.pendingKeys = toUpload.length;
      this.emit();

      let done = 0;
      const uploaded: ManifestEntry[] = [];
      const uploadedLocal: Record<string, string> = {};
      const leftOut = new Set<string>();
      let sentSavedAt = this.p.now();
      for (const k of toUpload) {
        const entry = await this.uploadKey(api, vc, k, local[k], localHashes[k], remoteObjects, gen);
        this.stopIfStale(gen);
        if (entry) {
          uploaded.push(entry);
          merged.set(k, entry);
          uploadedLocal[k] = localHashes[k];
          this.link.sent = this.link.sent || {};
          this.link.sent[k] = {hash: localHashes[k], entry};
          if (this.p.now() - sentSavedAt >= this.p.limits().sentSaveMs) {
            sentSavedAt = this.p.now();
            await this.p.saveLink(this.link);
            this.stopIfStale(gen);
          }
        } else {
          leftOut.add(k);
          if (forceUpload.has(k)) merged.delete(k);
        }
        done++;
        this.progress = toUpload.length ? done / toUpload.length : 1;
        this.emit();
      }

      const changedManifest = uploaded.length > 0 || merged.size !== R.size || [...merged.keys()].some(k => !R.has(k));
      let newVersion = remoteVersion;
      if (changedManifest) {
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
          newVersion = await api.putManifest(vc, remoteVersion, sealManifest(next, this.key()), refs);
        } catch (e) {
          if (e instanceof CloudError && e.status === 409) continue;
          const missingIds = e instanceof CloudError && e.status === 400 ? e.extra?.missing : undefined;
          if (Array.isArray(missingIds)) {
            const gone = new Set(missingIds.map(String));
            for (const [path, entry] of merged) {
              if (!gone.has(entry.id)) continue;
              if (path in localHashes) forceUpload.add(path);
              else dropRemote.add(path);
            }
            const sent = this.link.sent;
            if (sent) for (const k of Object.keys(sent)) if (gone.has(sent[k].entry.id)) delete sent[k];
            continue;
          }
          throw e;
        }
        this.stopIfStale(gen);
        delete this.link.sent;
      }

      let pulled: Record<string, string> = {};
      if (toPull.length || toRemoveLocal.length) {
        pulled = await this.pullEntries(api, vc, toPull, false, gen);
        for (const k of toRemoveLocal) {
          this.stopIfStale(gen);
          await this.p.remove(k);
        }
        this.stopIfStale(gen);
      }

      this.link.known = knownAfterSync({
        merged,
        leftOut,
        unreadable: new Set(this.unreadable.map(u => u.key)),
        uploadedLocal,
        pulled,
        localHashes,
        previous: K,
        forceUpload,
      });
      if (this.link.removed) {
        for (const k of Object.keys(removedAtStart)) {
          if (this.link.removed[k] === removedAtStart[k]) delete this.link.removed[k];
        }
        if (Object.keys(this.link.removed).length === 0) delete this.link.removed;
      }
      this.link.manifestVersion = newVersion;
      this.link.lastCheckAt = this.p.now();
      this.link.vaultEntries = merged.size;
      this.pendingKeys = 0;
      await this.p.saveLink(this.link);
      return;
    }
    throw new CloudError(409, 'manifest version conflict', 'Another device kept changing the vault; will retry.', undefined, 'MANIFEST_VERSION_CONFLICT');
  }

  private async uploadKey(api: CloudApi, vc: VaultCreds, key: string, raw: string, hash: string, remoteObjects: Set<string>, gen: number): Promise<ManifestEntry | null> {
    const sent = this.link?.sent?.[key];
    if (sent && sent.hash === hash && (await api.objectStatus(vc, sent.entry.id)).exists) {
      remoteObjects.add(sent.entry.id);
      return sent.entry;
    }
    const kind = kindOf(key);
    const tier = tierOf(kind);
    let plain: Uint8Array;
    let mime: string | undefined;
    let enc: number | undefined;
    let canonical = hash;
    if (isMediaKey(key)) {
      const data = await this.resolveMedia(raw);
      if (data === null) return null;
      const encoded = await this.p.reencodeImage(data, key);
      const parts = splitDataUri(encoded);
      if (!parts) return null;
      plain = parts.bytes;
      mime = parts.mime;
      enc = MEDIA_ENCODING;
      canonical = await this.keyHash(key, encoded);
    } else {
      plain = packData(raw);
    }
    this.stopIfStale(gen);
    const kept = this.sealed.get(key);
    const ct = kept && kept.hash === hash ? kept.ct : encryptBytes(this.key(), plain);
    if (ct.length > OBJECT_MAX_BYTES) {
      if (!this.tooLarge.includes(key)) this.tooLarge.push(key);
      return null;
    }
    const id = objectIdOf(ct);
    this.sealed.keep(key, hash, ct);
    try {
      await api.putObject(vc, id, tier, ct);
    } catch (e) {
      if (e instanceof CloudError && e.status === 413) {
        const list = e.kind === 'QUOTA_EXCEEDED' ? this.overQuota : this.tooLarge;
        if (!list.includes(key)) list.push(key);
        this.sealed.drop(key);
        return null;
      }
      if (e instanceof CloudError && e.status >= 400 && e.status < 500 && !RETRY_STATUSES.has(e.status)) {
        if (!this.refused.some(r => r.key === key)) this.refused.push({key, code: e.code});
        this.sealed.drop(key);
        return null;
      }
      throw e;
    }
    this.sealed.drop(key);
    remoteObjects.add(id);
    return {path: key, id, size: plain.length, kind, tier, hash: canonical, mime, enc};
  }

  private async pullAll(api: CloudApi, vc: VaultCreds, manifest: VaultManifest, importing: boolean): Promise<Record<string, string>> {
    return this.pullEntries(api, vc, manifest.entries.filter(e => this.includeKey(e.path)), importing);
  }

  private async pullEntries(api: CloudApi, vc: VaultCreds, entries: ManifestEntry[], importing: boolean, gen?: number): Promise<Record<string, string>> {
    const landed: Record<string, string> = {};
    if (!entries.length) return landed;
    const values: Record<string, string> = {};
    let identityRaw: string | null = null;
    let friendsRaw: string | null = null;
    let tombstonesRaw: string | null = null;
    let done = 0;
    for (const e of entries) {
      let ct: Uint8Array;
      try {
        ct = await api.getObject(vc, e.id);
      } catch (err) {
        if (!isCloudKind(err, 'NOT_FOUND')) throw err;
        this.noteUnreadable(e.path, 'missing from the cloud');
        done++;
        continue;
      }
      this.stopIfStale(gen);
      if (objectIdOf(ct) !== e.id) {
        this.noteUnreadable(e.path, 'damaged');
        done++;
        continue;
      }
      const plain = decryptBytes(this.key(), ct);
      if (!plain) {
        this.noteUnreadable(e.path, 'cannot be decrypted');
        done++;
        continue;
      }
      let raw: string;
      if (isMediaKey(e.path)) raw = joinDataUri(e.mime || 'image/jpeg', plain);
      else raw = unpackData(plain);
      if (e.path === CLOUD_IDENTITY_KEY) identityRaw = raw;
      else if (e.path === CLOUD_FRIENDS_KEY) friendsRaw = raw;
      else if (e.path === CLOUD_TOMBSTONES_KEY) tombstonesRaw = raw;
      else values[e.path] = raw;
      landed[e.path] = await this.keyHash(e.path, raw);
      done++;
      this.progress = done / entries.length;
      this.emit();
    }
    if (importing && identityRaw) await this.p.adoptIdentity(identityRaw, friendsRaw);
    else if (friendsRaw || tombstonesRaw) await this.p.mergeFriends(friendsRaw, tombstonesRaw);
    this.stopIfStale(gen);
    if (Object.keys(values).length) await this.p.apply(values);
    return landed;
  }
}
