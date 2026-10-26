import { config } from '../config';
import type { NetMessage, SyncKeys } from '../network/types';
import { sleep } from '../utils/concurrency';
import { log } from '../utils/log';

const SYNC_MSG_BUDGET = 64 * 1024;
export const SYNC_CHUNK_SIZE = 48 * 1024;
export const SYNC_MAX_PARTS = 4096;

export type SyncItem = {k: string; h: string; load: () => Promise<string | null>};
export type SyncFlags = {init?: boolean; resolved?: boolean};
export type SyncSender = (msg: NetMessage) => Promise<boolean>;
export type SentKeys = {k: string; h: string}[];

export const pacedSender = (sendTo: (msg: NetMessage) => Promise<unknown>): SyncSender => async msg => {
  let ok = true;
  try {
    await sendTo(msg);
  } catch (e) {
    log.debug('sync', e);
    await sleep(config().sync.paceMs);
    try {
      await sendTo(msg);
    } catch (err) {
      log.debug('sync', err);
      ok = false;
    }
  }
  await sleep(config().sync.paceMs);
  return ok;
};

export const fanoutSender = (
  peerIds: string[],
  sendTo: (peerId: string, msg: NetMessage) => Promise<unknown>,
  reachable: (peerId: string) => boolean,
): SyncSender => async msg => {
  let delivered = false;
  for (const d of peerIds) {
    try {
      await sendTo(d, msg);
      if (reachable(d)) delivered = true;
    } catch (e) {
      log.debug('sync', e);
    }
  }
  await sleep(config().sync.paceMs);
  return delivered;
};

export const chunkTotal = (len: number, size: number): number => Math.max(1, Math.ceil(len / size));

export const sendChunked = async (
  payload: string,
  size: number,
  send: (seq: number, total: number, data: string) => Promise<boolean>,
  stopOnFail = false,
): Promise<boolean> => {
  const total = chunkTotal(payload.length, size);
  let allOk = true;
  for (let seq = 0; seq < total; seq++) {
    const ok = await send(seq, total, payload.slice(seq * size, (seq + 1) * size));
    if (!ok) {
      if (stopOnFail) return false;
      allOk = false;
    }
  }
  return allOk;
};

export const sendSyncItems = async (
  items: SyncItem[],
  flags: SyncFlags,
  send: SyncSender,
  onSent?: (keys: SentKeys) => void,
): Promise<void> => {
  let batch: SyncKeys = {};
  let batchKeys: SentKeys = [];
  let size = 0;
  const flush = async () => {
    if (Object.keys(batch).length === 0) return;
    const payload = batch;
    const sentKeys = batchKeys;
    batch = {};
    batchKeys = [];
    size = 0;
    const ok = await send({t: 'sync', keys: payload, ...flags});
    if (ok && onSent) onSent(sentKeys);
  };
  for (const c of items) {
    const v = await c.load();
    if (v === null) continue;
    if (v.length > SYNC_MSG_BUDGET) {
      await flush();
      const ok = await sendChunked(v, SYNC_CHUNK_SIZE, (seq, total, data) => send({t: 'sync_chunk', key: c.k, h: c.h, seq, total, data, ...flags}));
      if (ok && onSent) onSent([{k: c.k, h: c.h}]);
    } else {
      if (size + v.length > SYNC_MSG_BUDGET && Object.keys(batch).length) await flush();
      batch[c.k] = {v, h: c.h};
      batchKeys.push({k: c.k, h: c.h});
      size += v.length;
    }
  }
  await flush();
};
