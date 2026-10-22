import nacl from 'tweetnacl';
import { config } from '../config';
import { log, logError } from '../utils/log';
import { decodeBase64, encodeBase64 } from './bytes';
import { openMessage, sealMessage } from './crypto';
import { resolveNetwork } from './defaultNetwork';
import type { FriendIdentity, Identity } from './identity';
import { HttpFetch, NodeClient, PacketReceived, SendStatus } from './NodeClient';
import { ConnStatus, NetMessage, NetworkSettings } from './types';

export interface ConnectionDeps {
  identity(): Identity | null;
  subId(): string | null;
  settings(): NetworkSettings;
  friendKey(peerId: string): string | null;
  notify(): void;
  onOnline(): void;
  onPeerOnline(peerId: string): void;
  onPeerOffline(peerId: string): void;
  afterPeersRefreshed(): void;
  route(sender: FriendIdentity, msg: unknown): void;
  onResume(): void;
  http: HttpFetch;
}

export class Connection {
  private client: NodeClient | null = null;
  status: ConnStatus = 'disabled';
  private online: Set<string> = new Set();
  private inbound: PacketReceived[] = [];
  private draining = false;
  private linkProbe: {nonce: string; timer: ReturnType<typeof setTimeout>} | null = null;
  private linkWaiters: ((ok: boolean) => void)[] = [];
  private lastInboundAt = 0;
  private lastResumeAt = 0;

  constructor(private readonly deps: ConnectionDeps) {}

  hasClient(): boolean {
    return this.client !== null;
  }

  isReachable(peerId: string): boolean {
    return peerId === this.deps.identity()?.peerId || this.online.has(peerId);
  }

  isOnline(peerId: string): boolean {
    return this.online.has(peerId);
  }

  forgetOnline(peerId: string): void {
    this.online.delete(peerId);
  }

  setStatus(s: ConnStatus): void {
    this.status = s;
    this.deps.notify();
  }

  ensureConnected(): void {
    if (this.deps.settings().enabled && this.client) this.client.ensureConnected();
  }

  async connect(self: Identity): Promise<void> {
    const net = resolveNetwork(this.deps.settings());
    if (!net.relayUrl) {
      this.setStatus('error');
      return;
    }
    if (this.client) this.client.disconnect();

    const client = new NodeClient(net.relayUrl, net.token, self.peerId, this.deps.http);
    this.client = client;

    client.on('status', (s: ConnStatus) => {
      this.setStatus(s);
      if (s === 'online') this.deps.onOnline();
    });
    client.on('packet_received', (p: PacketReceived) => this.enqueuePacket(p));
    client.on('peer_online', e => {
      this.lastInboundAt = Date.now();
      if (e.peer_id && e.peer_id !== this.deps.identity()?.peerId) {
        this.online.add(e.peer_id);
        this.deps.onPeerOnline(e.peer_id);
      }
    });
    client.on('peer_offline', e => {
      this.lastInboundAt = Date.now();
      if (e.peer_id) {
        this.online.delete(e.peer_id);
        this.deps.onPeerOffline(e.peer_id);
      }
    });
    client.on('error', e => logError('network', e));

    client.connect();
  }

  disconnect(): void {
    if (this.client) {
      try {
        this.client.disconnect();
      } catch (e) {
        log.debug('network', e);
      }
    }
    this.client = null;
    this.online.clear();
  }

  reset(): void {
    this.disconnect();
    this.inbound = [];
  }

  async refreshOnlinePeers(): Promise<void> {
    const client = this.client;
    const self = this.deps.identity();
    if (!client) return;
    try {
      const peers = await client.peers();
      if (!peers) return;
      this.online = new Set(peers.map(p => p.peer_id).filter(id => id !== self?.peerId));
      this.deps.notify();
      this.deps.afterPeersRefreshed();
    } catch (e) {
      log.debug('network', e);
    }
  }

  private requireClient(): NodeClient {
    const client = this.client;
    if (!client) throw new Error('network not connected');
    return client;
  }

  rendezvousRegister(namespace: string, record: string, ttlSeconds: number): Promise<void> {
    return this.requireClient().rendezvousRegister(namespace, record, ttlSeconds);
  }

  rendezvousLookup(namespace: string): Promise<string | null> {
    return this.requireClient().rendezvousLookup(namespace);
  }

  private enqueuePacket(p: PacketReceived): void {
    this.lastInboundAt = Date.now();
    this.inbound.push(p);
    if (this.draining) return;
    this.draining = true;
    const drain = () => {
      const next = this.inbound.shift();
      if (!next) {
        this.draining = false;
        return;
      }
      try {
        this.handlePacket(next);
      } catch (e) {
        logError('network', e);
      }
      setTimeout(drain, 0);
    };
    setTimeout(drain, 0);
  }

  private handlePacket(p: PacketReceived): void {
    this.lastInboundAt = Date.now();
    const self = this.deps.identity();
    if (!self || !p?.sender_peer_id || !p?.payload) return;
    const opened = openMessage(self, p.sender_peer_id, p.payload);
    if (!opened) return;
    if (opened.sender.peerId === self.peerId && opened.message.t === 'ping') {
      const probe = this.linkProbe;
      if (probe && opened.message.n === probe.nonce) {
        clearTimeout(probe.timer);
        this.linkProbe = null;
        this.settleLinkWaiters(true);
      }
      return;
    }
    const subId = this.deps.subId();
    if (opened.dev && subId && opened.dev === subId) return;
    this.deps.route(opened.sender, opened.message);
  }

  async sendTo(recipientPeerId: string, msg: NetMessage): Promise<SendStatus> {
    const self = this.deps.identity();
    const client = this.client;
    if (!self || !client) throw new Error('network not connected');
    const key = this.deps.friendKey(recipientPeerId);
    if (!key) throw new Error('no public key for recipient');
    const payload = sealMessage(self, decodeBase64(key), msg, this.deps.subId() ?? undefined);
    if (config().verboseNetwork) log.debug('network', 'out', msg.t, '->', recipientPeerId);
    return (await client.send(recipientPeerId, payload)).status;
  }

  sendUnknown(peer: FriendIdentity, msg: NetMessage): void {
    const self = this.deps.identity();
    const client = this.client;
    if (!self || !client) return;
    try {
      const payload = sealMessage(self, peer.boxPublicKey, msg, this.deps.subId() ?? undefined);
      if (config().verboseNetwork) log.debug('network', 'out', msg.t, '->', peer.peerId);
      client.send(peer.peerId, payload).catch(e => log.debug('network', e));
    } catch (e) {
      logError('network', e);
    }
  }

  private settleLinkWaiters(ok: boolean): void {
    const waiters = this.linkWaiters;
    this.linkWaiters = [];
    for (const w of waiters) {
      try {
        w(ok);
      } catch (e) {
        logError('network', e);
      }
    }
  }

  verifyLink(): Promise<boolean> {
    if (!this.deps.identity() || !this.client || !this.deps.settings().enabled || this.status !== 'online') return Promise.resolve(false);
    if (Date.now() - this.lastInboundAt < config().connection.linkFreshMs) return Promise.resolve(true);
    return new Promise(resolve => {
      this.linkWaiters.push(resolve);
      this.probeLink();
      if (!this.linkProbe) this.settleLinkWaiters(false);
    });
  }

  resume(): void {
    const now = Date.now();
    if (now - this.lastResumeAt < config().connection.resumeMinGapMs) return;
    this.lastResumeAt = now;
    this.probeLink();
    this.deps.onResume();
  }

  probeLink(): void {
    const self = this.deps.identity();
    const client = this.client;
    if (!self || !client || !this.deps.settings().enabled || this.status !== 'online' || this.linkProbe) return;
    const nonce = encodeBase64(nacl.randomBytes(12));
    let payload: string;
    try {
      payload = sealMessage(self, self.boxPublicKey, {t: 'ping', n: nonce}, this.deps.subId() ?? undefined);
    } catch (e) {
      logError('network', e);
      return;
    }
    const fail = (reconnect: boolean) => {
      if (this.linkProbe) clearTimeout(this.linkProbe.timer);
      this.linkProbe = null;
      this.settleLinkWaiters(false);
      if (reconnect && this.client === client && this.status === 'online') client.reconnect();
    };
    const onTimeout = () => {
      if (this.linkProbe?.nonce !== nonce) return;
      if (this.inbound.length > 0) {
        this.linkProbe = {nonce, timer: setTimeout(onTimeout, config().connection.linkProbeTimeoutMs)};
        return;
      }
      fail(true);
    };
    this.linkProbe = {nonce, timer: setTimeout(onTimeout, config().connection.linkProbeTimeoutMs)};
    client.send(self.peerId, payload).then(res => {
      if (this.linkProbe?.nonce !== nonce || res.status !== 'held') return;
      fail(true);
    }, e => {
      log.debug('network', e);
      if (this.linkProbe?.nonce !== nonce) return;
      fail(false);
    });
  }
}
