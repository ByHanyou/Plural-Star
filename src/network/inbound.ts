import {
  Friend,
  FrontShare,
  MirrorGifAsk,
  NetMessage,
  MIRROR_MEDIA_REQ_MAX,
  StoredIdentity,
  SyncKeys,
  SyncValue,
} from './types';
import { isMirrorFeature } from './mirror/payload';
import { sanitizeMirrorGifAsk } from './mirror/gifHash';
import { asRecord, isRecord } from '../utils';

const inboundStr = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' ? (v.length > max ? Array.from(v).slice(0, max).join('') : v) : undefined;

export const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

const sanitizeFrontShare = (o: unknown): FrontShare | null => {
  if (!isRecord(o)) return null;
  const fronters = inboundStr(o.fronters, 400);
  if (fronters === undefined) return null;
  const out: FrontShare = {fronters};
  for (const k of ['primary', 'coFront', 'coConscious', 'mood', 'location'] as const) {
    const v = inboundStr(o[k], 400);
    if (v !== undefined) out[k] = v;
  }
  const note = inboundStr(o.note, 2000);
  if (note !== undefined) out.note = note;
  const startTime = num(o.startTime);
  if (startTime !== undefined) out.startTime = startTime;
  return out;
};

export const sanitizeInboundFriend = (o: unknown): Friend | null => {
  if (!isRecord(o)) return null;
  const peerId = inboundStr(o.peerId, 128);
  const edPublicKey = inboundStr(o.edPublicKey, 128);
  const boxPublicKey = inboundStr(o.boxPublicKey, 128);
  const displayName = inboundStr(o.displayName, 64);
  if (!peerId || !edPublicKey || !boxPublicKey || displayName === undefined) return null;
  const kind: Friend['kind'] = o.kind === 'device' ? 'device' : 'friend';
  const status = o.status === 'entered_theirs' || o.status === 'entered_mine' || o.status === 'accepted' ? o.status : null;
  if (!status) return null;
  const out: Friend = {peerId, edPublicKey, boxPublicKey, displayName, addedAt: num(o.addedAt) ?? Date.now(), kind, status};
  if (o.initRole === 'source' || o.initRole === 'target') out.initRole = o.initRole;
  if (o.peerRole === 'source' || o.peerRole === 'target') out.peerRole = o.peerRole;
  if (typeof o.initPending === 'boolean') out.initPending = o.initPending;
  const initStartedAt = num(o.initStartedAt); if (initStartedAt !== undefined) out.initStartedAt = initStartedAt;
  if (o.lastStatus === null) out.lastStatus = null;
  else if (o.lastStatus !== undefined) out.lastStatus = sanitizeFrontShare(o.lastStatus);
  const statusUpdatedAt = num(o.statusUpdatedAt); if (statusUpdatedAt !== undefined) out.statusUpdatedAt = statusUpdatedAt;
  const statusAuthoredAt = num(o.statusAuthoredAt); if (statusAuthoredAt !== undefined) out.statusAuthoredAt = statusAuthoredAt;
  if (typeof o.showInNotification === 'boolean') out.showInNotification = o.showInNotification;
  if (o.notifyLevel === 'full' || o.notifyLevel === 'alerts' || o.notifyLevel === 'off') out.notifyLevel = o.notifyLevel;
  const peerV = num(o.peerV); if (peerV !== undefined) out.peerV = peerV;
  if (typeof o.needsRefriend === 'boolean') out.needsRefriend = o.needsRefriend;
  const sortOrder = num(o.sortOrder); if (sortOrder !== undefined) out.sortOrder = sortOrder;
  return out;
};

const INBOUND_TEXT_KEYS = new Set(['name', 'pronouns', 'role', 'color', 'description', 'title', 'text', 'note', 'mood', 'location', 'otherName', 'label', 'labelKey', 'nickname', 'kind', 'type', 'question', 'displayName', 'fieldId', 'id', 'otherId', 'parentId']);
const INBOUND_MAX_DEPTH = 12;
const INBOUND_MAX_ITEMS = 20000;
const INBOUND_MAX_KEYS = 400;
const INBOUND_MAX_STR = 400000;

export const sanitizeInboundJson = (v: unknown, depth = 0): unknown => {
  if (v === null || v === undefined) return v;
  if (typeof v === 'string') return v.length > INBOUND_MAX_STR ? Array.from(v).slice(0, INBOUND_MAX_STR).join('') : v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'boolean') return v;
  if (depth >= INBOUND_MAX_DEPTH) return null;
  if (Array.isArray(v)) return v.slice(0, INBOUND_MAX_ITEMS).map(x => sanitizeInboundJson(x, depth + 1));
  if (isRecord(v)) {
    const out: Record<string, unknown> = {};
    let n = 0;
    for (const k of Object.keys(v)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      if (++n > INBOUND_MAX_KEYS) break;
      let val = v[k];
      if (INBOUND_TEXT_KEYS.has(k) && val !== null && val !== undefined && typeof val !== 'string') {
        if (typeof val === 'number' || typeof val === 'boolean') val = String(val);
        else continue;
      }
      out[k] = sanitizeInboundJson(val, depth + 1);
    }
    return out;
  }
  return null;
};

const FRONT_CLOCK_SKEW_MS = 5 * 60 * 1000;
export const withinSkew = (at: unknown): boolean =>
  typeof at === 'number' && at > 0 && at <= Date.now() + FRONT_CLOCK_SKEW_MS;
export const trustedAuthoredAt = (at: unknown): number => (typeof at === 'number' && withinSkew(at) ? at : 0);

type Of<T extends NetMessage['t']> = Extract<NetMessage, {t: T}>;

export type InboundMessage =
  | Of<'connect'>
  | Of<'disconnect'>
  | Of<'ping'>
  | Of<'front'>
  | Of<'front_req'>
  | {t: 'device_adopt'; identity: StoredIdentity; friends: unknown[]}
  | {t: 'friends_push'; friends: unknown[]; removed?: unknown[]}
  | Of<'not_friends'>
  | Of<'sync'>
  | Of<'sync_chunk'>
  | Of<'sync_req'>
  | Of<'dm'>
  | Of<'mirror_req'>
  | Of<'mirror'>
  | Of<'mirror_media'>
  | Of<'mirror_media_req'>
  | Of<'mirror_media_done'>
  | Of<'mirror_gif_req'>
  | Of<'mirror_gif'>;

export const parseIdentity = (v: unknown): StoredIdentity | null => {
  if (!isRecord(v) || typeof v.edSecretKey !== 'string' || !v.edSecretKey || typeof v.boxSecretKey !== 'string' || !v.boxSecretKey) return null;
  return {v: typeof v.v === 'number' ? v.v : 1, edSecretKey: v.edSecretKey, boxSecretKey: v.boxSecretKey};
};

const parseSyncKeys = (v: unknown): SyncKeys =>
  Object.fromEntries(
    Object.entries(asRecord(v) ?? {}).flatMap(([k, entry]): [string, SyncValue][] =>
      isRecord(entry) && typeof entry.v === 'string' && typeof entry.h === 'string' ? [[k, {v: entry.v, h: entry.h}]] : [],
    ),
  );

const parseHashes = (v: unknown): Record<string, string> | null => {
  if (!isRecord(v)) return null;
  const out: Record<string, string> = {};
  for (const k of Object.keys(v)) {
    const h = v[k];
    if (typeof h === 'string') out[k] = h;
  }
  return out;
};

const parseMediaIds = (v: unknown): string[] =>
  Array.isArray(v)
    ? (v as unknown[]).filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128).slice(0, MIRROR_MEDIA_REQ_MAX)
    : [];

export const parseInbound = (msg: unknown): InboundMessage | null => {
  if (!isRecord(msg) || typeof msg.t !== 'string') return null;
  const o = msg;
  switch (o.t) {
    case 'connect':
      return {
        t: 'connect',
        name: inboundStr(o.name, 64) || '',
        kind: o.kind === 'device' ? 'device' : 'friend',
        role: o.role === 'source' || o.role === 'target' ? o.role : undefined,
        v: num(o.v),
        ack: !!o.ack,
      };
    case 'disconnect':
      return {t: 'disconnect'};
    case 'ping':
      return {t: 'ping', n: typeof o.n === 'string' ? o.n : undefined};
    case 'front':
      return {t: 'front', status: sanitizeFrontShare(o.status), at: num(o.at)};
    case 'front_req':
      return {t: 'front_req'};
    case 'device_adopt': {
      const identity = parseIdentity(o.identity);
      if (!identity) return null;
      return {t: 'device_adopt', identity, friends: Array.isArray(o.friends) ? o.friends : []};
    }
    case 'friends_push':
      if (!Array.isArray(o.friends)) return null;
      return {t: 'friends_push', friends: o.friends, removed: Array.isArray(o.removed) ? o.removed : undefined};
    case 'not_friends':
      return {t: 'not_friends'};
    case 'sync':
      return {t: 'sync', keys: parseSyncKeys(o.keys), init: !!o.init, initDone: !!o.initDone, resolved: !!o.resolved};
    case 'sync_chunk': {
      const seq = num(o.seq);
      const total = num(o.total);
      if (typeof o.key !== 'string' || typeof o.h !== 'string' || seq === undefined || total === undefined || typeof o.data !== 'string') return null;
      return {t: 'sync_chunk', key: o.key, h: o.h, seq, total, data: o.data, init: !!o.init, resolved: !!o.resolved};
    }
    case 'sync_req': {
      const hashes = parseHashes(o.hashes);
      if (!hashes) return null;
      return {t: 'sync_req', hashes};
    }
    case 'dm': {
      const body = inboundStr(o.body, 4000);
      if (body === undefined) return null;
      return {t: 'dm', body, ts: num(o.ts) ?? Date.now()};
    }
    case 'mirror_req':
      if (!isMirrorFeature(o.feature)) return null;
      return {t: 'mirror_req', feature: o.feature, v: num(o.v)};
    case 'mirror': {
      const seq = num(o.seq);
      const total = num(o.total);
      if (!isMirrorFeature(o.feature) || seq === undefined || total === undefined || typeof o.data !== 'string') return null;
      return {t: 'mirror', feature: o.feature, seq, total, data: o.data, none: !!o.none};
    }
    case 'mirror_media':
      if (!isMirrorFeature(o.feature) || typeof o.memberId !== 'string' || typeof o.data !== 'string') return null;
      return {t: 'mirror_media', feature: o.feature, memberId: o.memberId, data: o.data};
    case 'mirror_media_req':
      if (!isMirrorFeature(o.feature)) return null;
      return {t: 'mirror_media_req', feature: o.feature, ids: parseMediaIds(o.ids)};
    case 'mirror_media_done':
      if (!isMirrorFeature(o.feature)) return null;
      return {t: 'mirror_media_done', feature: o.feature};
    case 'mirror_gif_req': {
      if (!isMirrorFeature(o.feature)) return null;
      const items: MirrorGifAsk[] = sanitizeMirrorGifAsk(o.items);
      return {t: 'mirror_gif_req', feature: o.feature, items};
    }
    case 'mirror_gif': {
      const seq = num(o.seq);
      const total = num(o.total);
      if (!isMirrorFeature(o.feature) || typeof o.memberId !== 'string' || typeof o.h !== 'string' || seq === undefined || total === undefined || typeof o.data !== 'string') return null;
      return {t: 'mirror_gif', feature: o.feature, memberId: o.memberId, h: o.h, seq, total, data: o.data};
    }
    default:
      return null;
  }
};
