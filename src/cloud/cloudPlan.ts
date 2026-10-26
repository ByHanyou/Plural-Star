import type {CloudLinkState, ManifestEntry} from './cloudTypes';
import {isMediaKey, ownerKeyOf} from './cloudKeys';

export const MEDIA_ENCODING = 2;

type Known = CloudLinkState['known'];

export interface SyncPlanInput {
  localHashes: Record<string, string>;
  known: Known;
  remote: Map<string, ManifestEntry>;
  missing: Set<string>;
  removedAtStart: Record<string, number>;
  forceUpload: Set<string>;
  reupload: boolean;
  includeKey(key: string): boolean;
}

export interface SyncPlan {
  toUpload: string[];
  toPull: ManifestEntry[];
  toRemoveLocal: string[];
  merged: Map<string, ManifestEntry>;
}

export const planSync = ({localHashes, known: K, remote: R, missing, removedAtStart, forceUpload, reupload, includeKey}: SyncPlanInput): SyncPlan => {
  const toUpload: string[] = [];
  const toPull: ManifestEntry[] = [];
  const toRemoveLocal: string[] = [];
  const merged = new Map<string, ManifestEntry>();
  for (const [path, e] of R) merged.set(path, e);

  for (const k in localHashes) {
    if (forceUpload.has(k)) {
      toUpload.push(k);
      continue;
    }
    const h = localHashes[k];
    const known = K[k];
    const knownRemote = known ? (known.remote ?? known.hash) : undefined;
    const r = R.get(k);
    if (known && known.hash === h) {
      if (!r) {
        toRemoveLocal.push(k);
      } else if (r.hash !== knownRemote) {
        toPull.push(r);
      } else if (reupload && isMediaKey(k) && (r.enc || 0) < MEDIA_ENCODING) {
        toUpload.push(k);
      }
      continue;
    }
    if (!r && known) {
      toRemoveLocal.push(k);
      continue;
    }
    if (r && r.hash === h) {
      merged.set(k, r);
      continue;
    }
    if (!r || (known && r.hash === knownRemote)) toUpload.push(k);
    else toPull.push(r);
  }
  for (const [path, e] of R) {
    if (path in localHashes) continue;
    if (!includeKey(path)) continue;
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
  return {toUpload, toPull, toRemoveLocal, merged};
};

export interface KnownAfterSyncInput {
  merged: Map<string, ManifestEntry>;
  leftOut: Set<string>;
  unreadable: Set<string>;
  uploadedLocal: Record<string, string>;
  pulled: Record<string, string>;
  localHashes: Record<string, string>;
  previous: Known;
  forceUpload: Set<string>;
}

export const knownAfterSync = ({merged, leftOut, unreadable, uploadedLocal, pulled, localHashes, previous: K, forceUpload}: KnownAfterSyncInput): Known => {
  const known: Known = {};
  for (const e of merged.values()) {
    if (leftOut.has(e.path)) continue;
    if (unreadable.has(e.path)) {
      if (localHashes[e.path] !== undefined) known[e.path] = {id: e.id, hash: '', remote: e.hash};
      continue;
    }
    const localNow = uploadedLocal[e.path] ?? pulled[e.path] ?? localHashes[e.path];
    if (localNow === undefined) continue;
    known[e.path] = {id: e.id, hash: localNow, remote: e.hash};
  }
  for (const k of leftOut) {
    if (K[k] && !forceUpload.has(k)) known[k] = K[k];
  }
  return known;
};
