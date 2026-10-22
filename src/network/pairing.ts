import nacl from 'tweetnacl';
import { config } from '../config';
import { log, logError } from '../utils/log';
import type { PlatformAdapter } from './adapters';
import type { Connection } from './connection';
import type { FriendStore, LinkKind } from './friends';
import type { FriendIdentity, Identity } from './identity';
import { makeRendezvousRecord, openRendezvousRecord, rendezvousNamespace } from './rendezvous';
import { Friend, NetMessage, PROTO_VERSION, RENDEZVOUS_TTL_SECONDS } from './types';
import { isAcceptedDevice, isAcceptedFriend } from './friendState';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const randomCodeGroup = (len: number): string => {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let out = '';
  while (out.length < len) {
    const buf = nacl.randomBytes(len - out.length);
    for (let i = 0; i < buf.length && out.length < len; i++) {
      if (buf[i] < limit) out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
    }
  }
  return out;
};
const generateFriendCode = (): string =>
  `${randomCodeGroup(4)}-${randomCodeGroup(4)}-${randomCodeGroup(4)}`;
const generateSyncCode = (): string =>
  `${randomCodeGroup(5)}-${randomCodeGroup(5)}-${randomCodeGroup(5)}-${randomCodeGroup(5)}`;
const namespaceFor = (code: string, kind: LinkKind): string => rendezvousNamespace(code, kind === 'device' ? 'sync' : 'friend');

export interface ActiveCode {
  code: string;
  namespace: string;
  expiresAt: number;
}

export interface PairingDeps {
  identity(): Identity | null;
  ensureIdentity(): Promise<Identity>;
  conn: Connection;
  friends: FriendStore;
  platform: PlatformAdapter;
  systemName(): string;
  notify(): void;
  sendMyFrontTo(peerId: string): Promise<void>;
  onDeviceLinkAccepted(f: Friend): void;
  restartPendingClones(): void;
  syncBusy(): boolean;
}

export class Pairing {
  private active: { friend: ActiveCode | null; device: ActiveCode | null } = { friend: null, device: null };
  private codeTimers: { friend: ReturnType<typeof setTimeout> | null; device: ReturnType<typeof setTimeout> | null } = { friend: null, device: null };
  private notFriendsSentAt: Map<string, number> = new Map();

  constructor(private readonly deps: PairingDeps) {}

  activeCode(kind: LinkKind): ActiveCode | null {
    return this.active[kind];
  }

  async generateCode(kind: LinkKind = 'friend'): Promise<string> {
    const self = await this.deps.ensureIdentity();
    const code = kind === 'device' ? generateSyncCode() : generateFriendCode();
    const namespace = namespaceFor(code, kind);
    const record = makeRendezvousRecord(self);
    await this.deps.conn.rendezvousRegister(namespace, record, RENDEZVOUS_TTL_SECONDS);
    this.active[kind] = { code, namespace, expiresAt: Date.now() + RENDEZVOUS_TTL_SECONDS * 1000 };
    const prev = this.codeTimers[kind];
    if (prev) clearTimeout(prev);
    this.codeTimers[kind] = setTimeout(() => this.clearActiveCode(kind), RENDEZVOUS_TTL_SECONDS * 1000);
    this.deps.notify();
    return code;
  }

  async republishActiveCode(): Promise<void> {
    const self = this.deps.identity();
    if (!this.deps.conn.hasClient() || !self) return;
    const record = makeRendezvousRecord(self);
    for (const kind of ['friend', 'device'] as const) {
      const a = this.active[kind];
      if (!a) continue;
      if (a.expiresAt <= Date.now()) {
        this.clearActiveCode(kind);
        continue;
      }
      try {
        const remainingSec = Math.max(1, Math.round((a.expiresAt - Date.now()) / 1000));
        await this.deps.conn.rendezvousRegister(a.namespace, record, remainingSec);
      } catch (e) {
        logError('network', e);
      }
    }
  }

  clearActiveCode(kind: LinkKind): void {
    const tm = this.codeTimers[kind];
    if (tm) {
      clearTimeout(tm);
      this.codeTimers[kind] = null;
    }
    this.active[kind] = null;
    this.deps.notify();
  }

  async enterCode(theirCode: string, kind: LinkKind, role?: 'source' | 'target'): Promise<void> {
    const self = this.deps.identity();
    if (!self || !this.deps.conn.hasClient()) throw new Error('network not connected');
    const code = (theirCode || '').trim();
    if (!code) throw new Error('empty code');

    const namespace = namespaceFor(code, kind);
    const record = await this.deps.conn.rendezvousLookup(namespace);
    if (!record) throw new Error('code not found or expired');
    const id = openRendezvousRecord(record);
    if (!id) throw new Error('invalid record');
    if (id.peerId === self.peerId) {
      const mine = this.active[kind]?.code;
      const isReallyMine = kind !== 'device' || (!!mine && mine.toUpperCase() === code.toUpperCase());
      if (isReallyMine) throw new Error('that is your own code');
    }

    const friends = this.deps.friends;
    const existing = friends.find(id.peerId);
    if (kind !== 'device') friends.clearTombstone(id.peerId);
    const status: Friend['status'] =
      existing?.status === 'accepted' || existing?.status === 'entered_mine' ? 'accepted' : 'entered_theirs';
    const fallbackName = kind === 'device' ? this.deps.platform.unnamedDevice() : this.deps.platform.unnamedFriend();
    friends.upsert({
      ...friends.friendFrom(id, existing?.displayName || fallbackName, status, kind),
      ...(kind === 'device' && role ? { initRole: role, initPending: true, initStartedAt: Date.now() } : {}),
    });
    await friends.persist();
    this.deps.notify();

    const linkOk = kind !== 'device' || role !== 'target' || await this.deps.conn.verifyLink();
    if (linkOk) await this.sendConnectTo(id.peerId, kind, false);
    if (status === 'accepted') {
      if (kind === 'friend') await this.deps.sendMyFrontTo(id.peerId);
      else {
        const merged = friends.find(id.peerId);
        if (merged) this.deps.onDeviceLinkAccepted(merged);
      }
    }
  }

  maybeSendNotFriends(sender: FriendIdentity): void {
    const last = this.notFriendsSentAt.get(sender.peerId) || 0;
    if (Date.now() - last < config().connection.notFriendsGapMs) return;
    this.notFriendsSentAt.set(sender.peerId, Date.now());
    this.deps.conn.sendUnknown(sender, { t: 'not_friends' });
  }

  async sendConnectTo(peerId: string, kind: LinkKind, ack: boolean): Promise<void> {
    const name = kind === 'device' ? this.deps.platform.deviceLabel() : (this.deps.systemName() || this.deps.platform.defaultSystemName());
    const role = kind === 'device' ? this.deps.friends.find(peerId)?.initRole : undefined;
    const msg: NetMessage = {
      t: 'connect',
      name,
      kind,
      v: PROTO_VERSION,
      ...(ack ? { ack: true } : {}),
      ...(role ? { role } : {}),
    };
    await this.deps.conn.sendTo(peerId, msg);
  }

  resendPendingConnects(): void {
    for (const f of this.deps.friends.all()) {
      const pending = f.status === 'entered_theirs' || isAcceptedDevice(f);
      if (pending || isAcceptedFriend(f)) this.sendConnectTo(f.peerId, f.kind, !pending).catch(e => log.debug('network', e));
    }
  }

  resendPendingHandshakes(): void {
    if (this.deps.conn.status !== 'online') return;
    for (const f of this.deps.friends.all()) {
      if (f.status === 'entered_theirs') this.sendHandshake(f);
    }
  }

  sendHandshake(f: Friend): void {
    if (f.kind === 'device' && f.initRole === 'target') {
      this.deps.conn.verifyLink()
        .then(ok => {
          if (ok) this.sendConnectTo(f.peerId, f.kind, false).catch(e => log.debug('network', e));
        })
        .catch(e => log.debug('network', e));
      return;
    }
    this.sendConnectTo(f.peerId, f.kind, false).catch(e => log.debug('network', e));
  }

  keepPendingLinksAlive(): void {
    const now = Date.now();
    const waiting = this.deps.friends.all().some(f =>
      (f.status === 'entered_theirs' || (f.kind === 'device' && f.initPending)) &&
      now - (f.initStartedAt || f.addedAt || 0) < config().connection.pendingLinkWatchMs);
    if (!waiting) return;
    this.deps.conn.probeLink();
    if (!this.deps.syncBusy()) this.deps.restartPendingClones();
  }

  retryPendingLinks(): void {
    for (const f of this.deps.friends.all()) {
      if (f.kind !== 'device' || f.status !== 'entered_theirs') continue;
      if (!this.deps.conn.isReachable(f.peerId)) continue;
      this.sendHandshake(f);
    }
  }
}
