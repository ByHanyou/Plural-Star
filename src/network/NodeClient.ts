import { ConnStatus } from './types';

type Listener = (payload: any) => void;

export interface SendResult {
  status: string;
  packet_id: string;
}

export interface PacketReceived {
  sender_peer_id: string;
  payload: string;
}

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
// RN fetch has NO default timeout: a request to an unreachable relay can hang
// for minutes, which froze the UI (busy state never cleared — dead Enable
// toggle, "hitting enter does nothing"). Every HTTP call gets a hard cap.
const FETCH_TIMEOUT_MS = 15000;

const fetchWithTimeout = async (url: string, init?: RequestInit): Promise<Response> => {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...(init || {}), signal: ctrl.signal });
  } finally {
    clearTimeout(tm);
  }
};

export class NodeClient {
  private relayUrl: string;
  private token: string;
  private peerId: string;

  private ws: WebSocket | null = null;
  private wantOpen = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Map<string, Set<Listener>> = new Map();

  constructor(relayUrl: string, token: string, peerId: string) {
    this.relayUrl = relayUrl.replace(/\/+$/, '');
    this.token = token;
    this.peerId = peerId;
  }

  on(event: string, fn: Listener): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn);
    return () => set!.delete(fn);
  }

  private emit(event: string, payload?: any): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.forEach(fn => {
      try {
        fn(payload);
      } catch (e) {
        console.error(`[NETWORK] listener for ${event} threw:`, e);
      }
    });
  }

  private authHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  async health(): Promise<any> {
    const res = await fetchWithTimeout(`${this.relayUrl}/health`, { headers: this.authHeaders() });
    if (!res.ok) throw new Error(`health ${res.status}`);
    return res.json();
  }

  async peers(): Promise<any> {
    const res = await fetchWithTimeout(`${this.relayUrl}/peers`, { headers: this.authHeaders() });
    if (!res.ok) throw new Error(`peers ${res.status}`);
    return res.json();
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
    const res = await fetchWithTimeout(`${this.relayUrl}/send`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = JSON.stringify(await res.json());
      } catch {}
      throw new Error(`send ${res.status} ${detail}`);
    }
    return res.json();
  }

  async rendezvousRegister(
    namespace: string,
    recordBase64: string,
    ttlSeconds: number,
  ): Promise<void> {
    const res = await fetchWithTimeout(`${this.relayUrl}/rendezvous/register`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ namespace, record: recordBase64, ttl_seconds: ttlSeconds }),
    });
    if (!res.ok) throw new Error(`rendezvous register ${res.status}`);
  }

  async rendezvousLookup(namespace: string): Promise<string | null> {
    const res = await fetchWithTimeout(
      `${this.relayUrl}/rendezvous/lookup?namespace=${encodeURIComponent(namespace)}`,
      { headers: this.authHeaders() },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`rendezvous lookup ${res.status}`);
    const body = await res.json();
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
    this.emit('status', (this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting') as ConnStatus);
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
      this.reconnectAttempts = 0;
      this.emit('status', 'online' as ConnStatus);
    };

    ws.onmessage = ev => {
      let msg: any;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;
      this.emit(msg.type, msg);
    };

    ws.onerror = e => {
      this.emit('error', e);
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.wantOpen) {
        this.emit('status', 'reconnecting' as ConnStatus);
        this.scheduleReconnect();
      } else {
        this.emit('status', 'disabled' as ConnStatus);
      }
    };
  }

  private scheduleReconnect(): void {
    if (!this.wantOpen || this.reconnectTimer) return;
    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
    );
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.wantOpen) this.openSocket();
    }, delay);
  }

  disconnect(): void {
    this.wantOpen = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.emit('status', 'disabled' as ConnStatus);
  }

  isConnected(): boolean {
    return !!this.ws && this.ws.readyState === 1;
  }
}
