import { config } from '../config';
import { log, logError } from '../utils/log';
import type { CloneService } from '../sync/clone';
import type { SyncService } from '../sync/service';
import type { PlatformAdapter } from './adapters';
import { encodeBase64 } from './bytes';
import type { Connection } from './connection';
import type { FriendStore } from './friends';
import type { FrontShareService } from './fronts';
import type { Gateway } from './gateway';
import type { FriendIdentity, Identity } from './identity';
import { parseInbound, trustedAuthoredAt, withinSkew } from './inbound';
import type { MirrorGifs } from './mirror/gif';
import type { MirrorInbound } from './mirror/request';
import type { MirrorServe } from './mirror/serve';
import type { Pairing } from './pairing';
import { Friend } from './types';
import { isAcceptedDevice, isAcceptedFriend } from './friendState';

export interface IncomingDM {
  peerId: string;
  body: string;
  ts: number;
}

export interface RouterDeps {
  identity(): Identity | null;
  platform: PlatformAdapter;
  friends: FriendStore;
  conn: Connection;
  pairing: Pairing;
  fronts: FrontShareService;
  gateway: Gateway;
  sync: SyncService;
  clone: CloneService;
  mirrorServe: MirrorServe;
  mirrorInbound: MirrorInbound;
  mirrorGifs: MirrorGifs;
  notify(): void;
  clearMirrorCaches(peerId: string): void;
  onDM(dm: IncomingDM): void;
}

export class Router {
  constructor(private readonly deps: RouterDeps) {}

  route(sender: FriendIdentity, raw: unknown): void {
    if (!raw || typeof raw !== 'object' || typeof (raw as {t?: unknown}).t !== 'string') return;
    const t = (raw as {t: string}).t;
    if (config().verboseNetwork) log.debug('network', 'in', t, '<-', sender.peerId);
    const d = this.deps;
    const friends = d.friends;
    const known = friends.find(sender.peerId);
    if (known) {
      const ed = encodeBase64(sender.edPublicKey);
      const box = encodeBase64(sender.boxPublicKey);
      const clearFlag = !!known.needsRefriend && t !== 'not_friends';
      if (known.edPublicKey !== ed || known.boxPublicKey !== box || clearFlag) {
        friends.upsert({ ...known, edPublicKey: ed, boxPublicKey: box, ...(clearFlag ? { needsRefriend: false } : {}) });
        friends.persistSoon();
        if (clearFlag) d.notify();
      }
    }
    const msg = parseInbound(raw);
    if (!msg) return;
    const acceptedFriend = (): boolean => {
      const f = friends.find(sender.peerId);
      return !!f && isAcceptedFriend(f);
    };
    const settle = (register: boolean) => {
      friends.persistSoon();
      d.notify();
      if (register) d.gateway.register().catch(e => log.debug('network', e));
    };
    switch (msg.t) {
      case 'connect': {
        const existing = friends.find(sender.peerId);
        if (existing && existing.kind !== 'device') friends.clearTombstone(sender.peerId);
        if (existing && existing.status === 'entered_theirs') {
          const accepted: Friend = {
            ...existing,
            status: 'accepted',
            displayName: msg.name || existing.displayName,
            peerRole: msg.role ?? existing.peerRole,
            peerV: msg.v ?? existing.peerV,
            ...(existing.kind === 'device' && existing.initPending ? { initStartedAt: Date.now() } : {}),
          };
          friends.upsert(accepted);
          if (!msg.ack) d.pairing.sendConnectTo(sender.peerId, existing.kind, true).catch(e => log.debug('network', e));
          if (existing.kind === 'device') d.clone.onDeviceLinkAccepted(accepted);
          else d.fronts.sendMyFrontTo(sender.peerId);
        } else if (existing && existing.status === 'accepted') {
          const updated: Friend = { ...existing, displayName: msg.name || existing.displayName, peerRole: msg.role ?? existing.peerRole, peerV: msg.v ?? existing.peerV };
          friends.upsert(updated);
          if (!msg.ack) d.pairing.sendConnectTo(sender.peerId, existing.kind, true).catch(e => log.debug('network', e));
          if (updated.kind === 'device' && updated.initPending && msg.role != null &&
              ((updated.initRole === 'source' && updated.peerRole === 'source') ||
               (updated.initRole === 'target' && updated.peerRole !== 'source'))) {
            d.clone.failRolePairing(updated);
          }
        } else if (msg.ack) {
          break;
        } else {
          const kind = msg.kind || 'friend';
          friends.upsert({
            ...friends.friendFrom(sender, msg.name || (kind === 'device' ? d.platform.unnamedDevice() : d.platform.unnamedFriend()), 'entered_mine', kind),
            peerRole: msg.role,
            peerV: msg.v,
          });
        }
        settle(true);
        if (msg.kind !== 'device') d.mirrorServe.refreshIfStale(sender.peerId, true);
        break;
      }
      case 'disconnect': {
        const gone = friends.remove(sender.peerId);
        if (!gone) break;
        if (gone.kind !== 'device') {
          friends.setTombstone(sender.peerId, Date.now());
          friends.persistTombstones().catch(e => logError('network', e));
        }
        d.clearMirrorCaches(sender.peerId);
        settle(true);
        break;
      }
      case 'dm': {
        const existing = friends.find(sender.peerId);
        if (existing && existing.status === 'accepted') d.onDM({ peerId: sender.peerId, body: msg.body, ts: msg.ts });
        break;
      }
      case 'front': {
        const existing = friends.find(sender.peerId);
        const authoredAt = msg.at ?? 0;
        if (existing && existing.status === 'entered_theirs') {
          friends.upsert({
            ...existing, status: 'accepted', lastStatus: msg.status, statusUpdatedAt: Date.now(),
            ...(authoredAt > 0 ? {statusAuthoredAt: authoredAt} : {}),
          });
          settle(true);
          d.fronts.sendMyFrontTo(sender.peerId);
        } else if (existing && existing.status === 'accepted') {
          const held = trustedAuthoredAt(existing.statusAuthoredAt);
          if (authoredAt > 0 && held > 0 && authoredAt < held) break;
          friends.upsert({
            ...existing, lastStatus: msg.status, statusUpdatedAt: Date.now(),
            ...(withinSkew(authoredAt) ? {statusAuthoredAt: authoredAt} : {}),
          });
          settle(false);
        } else {
          d.pairing.maybeSendNotFriends(sender);
        }
        break;
      }
      case 'sync': {
        d.sync.applySync(sender, msg.keys, !!msg.init, !!msg.initDone, !!msg.resolved).catch(e => logError('network', e));
        break;
      }
      case 'sync_req': {
        d.sync.handleSyncReq(sender, msg.hashes).catch(e => logError('network', e));
        break;
      }
      case 'sync_chunk': {
        const dev = friends.find(sender.peerId);
        if (dev && dev.kind === 'device' && (dev.status === 'accepted' || dev.status === 'entered_theirs')) d.sync.handleSyncChunk(sender, msg);
        break;
      }
      case 'device_adopt': {
        const dev = friends.find(sender.peerId);
        if (!dev || !isAcceptedDevice(dev) || dev.initRole !== 'target') break;
        d.clone.adoptSystemIdentity(msg.identity, msg.friends).catch(e => logError('network', e));
        break;
      }
      case 'front_req': {
        if (acceptedFriend()) d.fronts.onFrontRequested(sender.peerId);
        else d.pairing.maybeSendNotFriends(sender);
        break;
      }
      case 'friends_push': {
        const self = d.identity();
        if (!self || sender.peerId !== self.peerId) break;
        friends.mergeSiblingFriends(msg.friends, msg.removed).catch(e => logError('network', e));
        break;
      }
      case 'not_friends': {
        const f = friends.find(sender.peerId);
        if (f && isAcceptedFriend(f) && !f.needsRefriend) {
          friends.upsert({ ...f, needsRefriend: true });
          settle(false);
        }
        break;
      }
      case 'mirror_req': {
        if (!acceptedFriend()) {
          d.pairing.maybeSendNotFriends(sender);
          break;
        }
        d.mirrorServe.handleMirrorReq(sender.peerId, msg.feature, false, {requested: true, fullMedia: !(Number(msg.v) >= 2)}).catch(e => logError('network', e));
        break;
      }
      case 'mirror': {
        if (acceptedFriend()) d.mirrorInbound.handleMirror(sender, msg).catch(e => logError('network', e));
        break;
      }
      case 'mirror_media': {
        if (acceptedFriend()) d.mirrorInbound.handleMirrorMedia(sender, msg);
        break;
      }
      case 'mirror_media_req': {
        if (!acceptedFriend() || (msg.feature !== 'members' && msg.feature !== 'systemProfile')) break;
        if (msg.ids.length === 0) break;
        d.mirrorServe.handleMirrorReq(sender.peerId, msg.feature, false, {mediaOnly: new Set(msg.ids), requested: true}).catch(e => logError('network', e));
        break;
      }
      case 'mirror_media_done': {
        if (acceptedFriend() && (msg.feature === 'members' || msg.feature === 'systemProfile')) d.mirrorInbound.scheduleMissingMediaAsk(sender.peerId, msg.feature);
        break;
      }
      case 'mirror_gif_req': {
        if (!acceptedFriend() || (msg.feature !== 'members' && msg.feature !== 'systemProfile') || msg.items.length === 0) break;
        d.mirrorServe.handleMirrorReq(sender.peerId, msg.feature, false, {gifAsk: msg.items, requested: true}).catch(e => logError('network', e));
        break;
      }
      case 'mirror_gif': {
        if (acceptedFriend()) d.mirrorGifs.handleGif(sender, msg);
        break;
      }
      case 'ping':
        break;
    }
  }
}
