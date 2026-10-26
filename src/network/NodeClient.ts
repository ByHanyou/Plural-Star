import { config } from '../config';
import { asRecord } from '../utils';
import { log } from '../utils/log';
import type { HttpRequest, HttpResponse } from './adapters';
import { ConnStatus } from './types';

export type SendStatus = 'delivered' | 'forwarded' | 'held' | 'duplicate' | 'queued';

export interface SendResult {
  status: SendStatus;
  packet_id: string;
}

export interface PacketReceived {
  sender_peer_id: string;
  payload: string;
  timestamp?: number;
}

export interface PeerOnlineEvent {
  peer_id: string;
  via_node: string;
}

export interface PeerOfflineEvent {
  peer_id: string;
}

export interface NodeConnectedEvent {
  node_peer_id: string;
  rtt_ms: number;
}

export interface NodeDisconnectedEvent {
  node_peer_id: string;
}

export interface NodeErrorEvent {
  code: string;
  message: string;
}

export interface NodePeer {
  peer_id: string;
  via_node: string;
}

export interface NodeClientEvents {
  status: ConnStatus;
  packet_received: PacketReceived;
  peer_online: PeerOnlineEvent;
  peer_offline: PeerOfflineEvent;
  node_connected: NodeConnectedEvent;
  node_disconnected: NodeDisconnectedEvent;
  error: unknown;
}

export type HttpFetch = (url: string, req: HttpRequest, timeoutMs: number) => Promise<HttpResponse>;

type NodeMessage =
  | ({ type: 'packet_received' } & PacketReceived)
  | ({ type: 'peer_online' } & PeerOnlineEvent)
  | ({ type: 'peer_offline' } & PeerOfflineEvent)
  | ({ type: 'node_connected' } & NodeConnectedEvent)
  | ({ type: 'node_disconnected' } & NodeDisconnectedEvent)
  | ({ type: 'error' } & NodeErrorEvent);

type Listener<E extends keyof NodeClientEvents> = (payload: NodeClientEvents[E]) => void;
type NodeClientListeners = { [E in keyof NodeClientEvents]?: Set<Listener<E>> };

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const parseNodeMessage = (raw: unknown): NodeMessage | null => {
  const m = asRecord(raw);
  if (!m) return null;
  switch (m.type) {
    case 'packet_received':
      return { type: 'packet_received', sender_peer_id: str(m.sender_peer_id), payload: str(m.payload), timestamp: num(m.timestamp) };
    case 'peer_online':
      return { type: 'peer_online', peer_id: str(m.peer_id), via_node: str(m.via_node) };
    case 'peer_offline':
      return { type: 'peer_offline', peer_id: str(m.peer_id) };
    case 'node_connected':
      return { type: 'node_connected', node_peer_id: str(m.node_peer_id), rtt_ms: num(m.rtt_ms) };
    case 'node_disconnected':
      return { type: 'node_disconnected', node_peer_id: str(m.node_peer_id) };
    case 'error':
      return { type: 'error', code: str(m.code), message: str(m.message) };
    default:
      return null;
  }
};

const parseSendStatus = (v: unknown): SendStatus =>
  v === 'delivered' || v === 'forwarded' || v === 'held' || v === 'duplicate' ? v : 'queued';

const parseSendResult = (raw: unknown): SendResult => {
  const r = asRecord(raw);
  return { status: parseSendStatus(r?.status), packet_id: str(r?.packet_id) };
};

const parsePeers = (raw: unknown): NodePeer[] | null => {
  if (!Array.isArray(raw)) return null;
  const out: NodePeer[] = [];
  for (const item of raw) {
    const p = asRecord(item);
    if (!p || typeof p.peer_id !== 'string' || !p.peer_id) continue;
    out.push({ peer_id: p.peer_id, via_node: str(p.via_node) });
  }
  return out;
};

export class NodeClient {
  private relayUrl: string;
  private token: string;
  private peerId: string;
  private http: HttpFetch;

  private ws: WebSocket | null = null;
  private wantOpen = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: NodeClientListeners = {};

  constructor(relayUrl: string, token: string, peerId: string, http: HttpFetch) {
    this.relayUrl = relayUrl.replace(/\/+$/, '');
    this.token = token;
    this.peerId = peerId;
    this.http = http;
  }

  on<E extends keyof NodeClientEvents>(event: E, fn: Listener<E>): () => void {
    const set = this.listenerSet(event);
    set.add(fn);
    return () => set.delete(fn);
  }

  private listenerSet<E extends keyof NodeClientEvents>(event: E): Set<Listener<E>> {
    const existing = this.listeners[event] as Set<Listener<E>> | undefined;
    if (existing) return existing;
    const created = new Set<Listener<E>>();
    this.listeners[event] = created as NodeClientListeners[E];
    return created;
  }

  private emit<E extends keyof NodeClientEvents>(event: E, payload: NodeClientEvents[E]): void {
    const set = this.listeners[event] as Set<Listener<E>> | undefined;
    if (!set) return;
    set.forEach(fn => {
      try {
        fn(payload);
      } catch (e) {
        log.error('network', `listener for ${event} threw:`, e);
      }
    });
  }

  private emitMessage(msg: NodeMessage): void {
    switch (msg.type) {
      case 'packet_received': this.emit('packet_received', msg); break;
      case 'peer_online': this.emit('peer_online', msg); break;
      case 'peer_offline': this.emit('peer_offline', msg); break;
      case 'node_connected': this.emit('node_connected', msg); break;
      case 'node_disconnected': this.emit('node_disconnected', msg); break;
      case 'error': this.emit('error', msg); break;
    }
  }

  private request(path: string, body?: unknown): Promise<HttpResponse> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const req: HttpRequest = body === undefined ? { headers } : { method: 'POST', headers, body: JSON.stringify(body) };
    return this.http(`${this.relayUrl}${path}`, req, config().connection.fetchTimeoutMs);
  }

  async peers(): Promise<NodePeer[] | null> {
    const res = await this.request('/peers');
    if (!res.ok) throw new Error(`peers ${res.status}`);
    return parsePeers(parseJson(res.text));
  }

  async send(
    recipientPeerId: string,
    payloadBase64: string,
    packetId?: string,
  ): Promise<SendResult> {
    const body: Record<string, string> = {
      sender_peer_id: this.peerId,
      recipient_peer_id: recipientPeerId,
      payload: payloadBase64,
    };
    if (packetId) body.packet_id = packetId;
    const res = await this.request('/send', body);
    if (!res.ok) throw new Error(`send ${res.status} ${res.text}`);
    return parseSendResult(parseJson(res.text));
  }

  async rendezvousRegister(
    namespace: string,
    recordBase64: string,
    ttlSeconds: number,
  ): Promise<void> {
    const res = await this.request('/rendezvous/register', { namespace, record: recordBase64, ttl_seconds: ttlSeconds });
    if (!res.ok) throw new Error(`rendezvous register ${res.status}`);
  }

  async rendezvousLookup(namespace: string): Promise<string | null> {
    const res = await this.request(`/rendezvous/lookup?namespace=${encodeURIComponent(namespace)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`rendezvous lookup ${res.status}`);
    const body = asRecord(parseJson(res.text));
    return body && typeof body.record === 'string' ? body.record : null;
  }

  private wsEndpoint(): string {
    const base = this.relayUrl.replace(/^http/, 'ws');
    let q = `peer_id=${encodeURIComponent(this.peerId)}`;
    if (this.token) q += `&token=${encodeURIComponent(this.token)}`;
    return `${base}/ws?${q}`;
  }

  connect(): void {
    this.wantOpen = true;
    this.openSocket();
  }

  private openSocket(): void {
    if (this.ws) return;
    this.emit('status', this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.wsEndpoint());
    } catch (e) {
      this.emit('error', e);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.reconnectAttempts = 0;
      this.emit('status', 'online');
    };

    ws.onmessage = ev => {
      if (this.ws !== ws) return;
      const msg = parseNodeMessage(typeof ev.data === 'string' ? parseJson(ev.data) : null);
      if (msg) this.emitMessage(msg);
    };

    ws.onerror = e => {
      if (this.ws !== ws) return;
      this.emit('error', e);
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.wantOpen) {
        this.emit('status', 'reconnecting');
        this.scheduleReconnect();
      } else {
        this.emit('status', 'disabled');
      }
    };
  }

  private scheduleReconnect(): void {
    if (!this.wantOpen || this.reconnectTimer) return;
    const delay = Math.min(
      config().connection.reconnectMaxMs,
      config().connection.reconnectBaseMs * Math.pow(2, this.reconnectAttempts),
    );
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.wantOpen) this.openSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  ensureConnected(): void {
    if (!this.wantOpen || this.ws) return;
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    this.openSocket();
  }

  reconnect(): void {
    if (!this.wantOpen) return;
    const stale = this.ws;
    this.ws = null;
    if (stale) {
      try {
        stale.close();
      } catch {}
    }
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    this.openSocket();
  }

  disconnect(): void {
    this.wantOpen = false;
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.emit('status', 'disabled');
  }

  isConnected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}
