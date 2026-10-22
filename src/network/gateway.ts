import nacl from 'tweetnacl';
import { config } from '../config';
import { KEYS } from '../storage';
import { log } from '../utils/log';
import type { HttpResponse, PlatformAdapter, StorageAdapter } from './adapters';
import { decodeUTF8, encodeBase64 } from './bytes';
import { DEFAULT_GATEWAY_URL } from './defaultNetwork';
import type { FriendStore } from './friends';
import { frontVisibilityFor, gatewayFrontToShare } from './frontShare';
import { getDeviceIdentity, Identity } from './identity';
import { trustedAuthoredAt, withinSkew } from './inbound';
import { FrontShare, GW_REGISTERED_KEY, NetworkSettings, PrivacyBucket } from './types';
import { friendNotifyLevel, isAcceptedFriend } from './friendState';

type GatewayFronts = Record<string, {authored_at?: unknown; start_time?: unknown} | undefined>;

export interface GatewayDeps {
  storage: StorageAdapter;
  platform: PlatformAdapter;
  friends: FriendStore;
  identity(): Identity | null;
  settings(): NetworkSettings;
  systemName(): string;
  notify(): void;
  loadPrivacyBuckets(): Promise<PrivacyBucket[]>;
  visibleFront(buckets: PrivacyBucket[]): FrontShare | null;
  currentFront(): FrontShare | null;
}

export class Gateway {
  private announcedSig: string | null = null;
  private lastPull = 0;
  private everRegistered = false;
  private flagLoaded = false;
  private confirmed: string | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 0;
  private friendsActivityLive = false;

  constructor(private readonly deps: GatewayDeps) {}

  reset(): void {
    this.everRegistered = false;
    this.flagLoaded = false;
    this.confirmed = null;
    this.announcedSig = null;
  }

  forgetAnnounce(): void {
    this.announcedSig = null;
  }

  private post(path: string, body: Record<string, unknown>): Promise<HttpResponse> {
    return this.deps.platform.http(
      `${config().gatewayUrl || DEFAULT_GATEWAY_URL}${path}`,
      {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)},
      config().gateway.timeoutMs,
    );
  }

  private sign(text: string, key: Uint8Array): string {
    return encodeBase64(nacl.sign.detached(decodeUTF8(text), key));
  }

  async announceFront(): Promise<void> {
    const self = this.deps.identity();
    if (!self || !this.deps.settings().enabled) return;
    const buckets = await this.deps.loadPrivacyBuckets();
    const gwShare = this.deps.visibleFront(buckets);
    const cap = (s: string | undefined) => Array.from(s || '').slice(0, 400).join('');
    const fronters = cap(gwShare?.fronters);
    const primary = cap(gwShare?.primary);
    const coFront = cap(gwShare?.coFront);
    const coConscious = cap(gwShare?.coConscious);
    const startTime = gwShare?.startTime || this.deps.currentFront()?.startTime || 0;
    const name = Array.from(this.deps.systemName() || this.deps.platform.defaultSystemName()).slice(0, 64).join('');
    const accepted = this.deps.friends.all().filter(isAcceptedFriend);
    const readers = accepted
      .filter(f => frontVisibilityFor(buckets, f.peerId).show)
      .map(f => f.peerId)
      .slice(0, 500);
    const anyHidden = readers.length < accepted.length;
    const contentSig = `${fronters}|${startTime}|${name}|${primary}|${coFront}|${coConscious}|${readers.join(',')}`;
    if (contentSig === this.announcedSig) return;
    const ts = Date.now();
    const signed = `psgw-front|${self.peerId}|${ts}|${fronters}|${startTime}|${name}|${primary}|${coFront}|${coConscious}|${readers.join(',')}`;
    const base = {peer_id: self.peerId, ed_pub: encodeBase64(self.edPublicKey), ts, fronters, start_time: startTime, name};
    try {
      const res = await this.post('/gw/front', {...base, sig: this.sign(signed, self.edSecretKey), primary, co_front: coFront, co_conscious: coConscious, readers});
      let ok = res.ok;
      if (!ok && !anyHidden) {
        const legacy = `psgw-front|${self.peerId}|${ts}|${fronters}|${startTime}|${name}`;
        const res2 = await this.post('/gw/front', {...base, sig: this.sign(legacy, self.edSecretKey)});
        ok = res2.ok;
      }
      if (ok) this.announcedSig = contentSig;
    } catch (e) {
      log.debug('network', e);
    }
  }

  pullFronts(): void {
    const now = Date.now();
    if (now - this.lastPull < config().gateway.pullMinGapMs) return;
    this.lastPull = now;
    this.fetchFronts().catch(e => log.debug('network', e));
  }

  private async fetchFronts(): Promise<void> {
    const self = this.deps.identity();
    if (!self || !this.deps.settings().enabled) return;
    const peers = this.deps.friends.all()
      .filter(isAcceptedFriend)
      .map(f => f.peerId)
      .slice(0, 500);
    if (peers.length === 0) return;
    const ts = Date.now();
    const signed = `psgw-fronts|${self.peerId}|${ts}|${peers.join(',')}`;
    let payload: unknown = null;
    try {
      const res = await this.post('/gw/fronts', {
        peer_id: self.peerId,
        ed_pub: encodeBase64(self.edPublicKey),
        sig: this.sign(signed, self.edSecretKey),
        ts,
        peers,
      });
      if (!res.ok) return;
      payload = JSON.parse(res.text);
    } catch (e) {
      log.debug('network', e);
      return;
    }
    const fronts = payload && typeof payload === 'object' ? (payload as {fronts?: unknown}).fronts : undefined;
    if (!fronts || typeof fronts !== 'object') return;
    this.applyFronts(fronts as GatewayFronts);
  }

  private applyFronts(fronts: GatewayFronts): void {
    const friends = this.deps.friends;
    let changed = false;
    for (const f of friends.all()) {
      if (!isAcceptedFriend(f)) continue;
      const entry = fronts[f.peerId];
      if (!entry) continue;
      const authored = typeof entry.authored_at === 'number' ? entry.authored_at : 0;
      const held = trustedAuthoredAt(f.statusAuthoredAt);
      if (authored > 0 && held > 0) {
        if (authored <= held) continue;
      } else if (f.lastStatus) {
        const gwStart = typeof entry.start_time === 'number' ? entry.start_time : 0;
        const heldStart = typeof f.lastStatus.startTime === 'number' ? f.lastStatus.startTime : 0;
        if (gwStart <= heldStart) continue;
      }
      const next = gatewayFrontToShare(entry, f.lastStatus);
      friends.upsert({
        ...f,
        lastStatus: next,
        statusUpdatedAt: Date.now(),
        ...(withinSkew(authored) ? {statusAuthoredAt: authored} : {}),
      });
      changed = true;
    }
    if (changed) {
      friends.persistSoon();
      this.deps.notify();
    }
  }

  async register(): Promise<void> {
    const push = this.deps.platform.push;
    if (!push) return;
    const self = this.deps.identity();
    if (!self || !this.deps.settings().enabled) return;
    const storage = this.deps.storage;
    if (!this.flagLoaded) {
      this.everRegistered = (await storage.get<boolean>(GW_REGISTERED_KEY, false)) === true;
      this.flagLoaded = true;
    }
    const accepted = this.deps.friends.all().filter(
      f => isAcceptedFriend(f) && f.peerId !== self.peerId,
    );
    const watch = accepted.filter(f => friendNotifyLevel(f) !== 'off').map(f => f.peerId).sort();
    const appSettings = await storage.get<{notificationsEnabled?: boolean; persistentFrontNotif?: boolean}>(KEYS.settings, null);
    const liveActivityOk = !appSettings || (appSettings.notificationsEnabled !== false && appSettings.persistentFrontNotif !== false);
    const pinned = liveActivityOk
      ? accepted.filter(f => friendNotifyLevel(f) === 'full').map(f => f.peerId).sort()
      : [];
    if (pinned.length === 0 && this.friendsActivityLive) {
      push.endFriendsActivity().catch(e => log.debug('network', e));
      this.friendsActivityLive = false;
    }
    if (watch.length === 0 && !this.everRegistered) return;
    const token = pinned.length > 0 ? (await push.activityToken()) || '' : '';
    if (token) this.friendsActivityLive = true;
    const deviceToken = watch.length > 0 ? (await push.deviceToken()) || '' : '';
    const env = push.env;
    const ts = Date.now();
    const gw = await getDeviceIdentity();
    const signed = `psgw-register|${gw.peerId}|${ts}|${env}|${token}|${deviceToken}|${watch.join(',')}|${pinned.join(',')}`;
    const state = `${env}|${token}|${deviceToken}|${watch.join(',')}|${pinned.join(',')}`;
    if (state === this.confirmed) return;
    try {
      const res = await this.post('/gw/register', {
        peer_id: gw.peerId,
        ed_pub: encodeBase64(gw.edPublicKey),
        sig: this.sign(signed, gw.edSecretKey),
        ts,
        env,
        activity_token: token,
        device_token: deviceToken,
        watch,
        pinned,
      });
      if (!res.ok) throw new Error(`gateway register ${res.status}`);
      this.confirmed = state;
      this.clearRetry();
      const live = watch.length > 0 && !!(token || deviceToken);
      if (live !== this.everRegistered) {
        this.everRegistered = live;
        await storage.set(GW_REGISTERED_KEY, live);
      }
    } catch (e) {
      log.debug('network', e);
      this.scheduleRetry();
    }
  }

  private clearRetry(): void {
    if (this.retry) {
      clearTimeout(this.retry);
      this.retry = null;
    }
    this.retryDelay = 0;
  }

  private scheduleRetry(): void {
    if (this.retry) return;
    this.retryDelay = this.retryDelay ? Math.min(this.retryDelay * 3, config().gateway.retryMaxMs) : config().gateway.retryBaseMs;
    this.retry = setTimeout(() => {
      this.retry = null;
      this.register().catch(e => log.debug('network', e));
    }, this.retryDelay);
  }
}
