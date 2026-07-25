import './secureRandom';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from './bytes';
import { store } from '../storage';
import { base58Encode, base58Decode, peerIdFromEd25519PublicKey } from './peerid';

export const IDENTITY_STORAGE_KEY = 'ps:networkIdentity';

/**
 * Per-device sub-id. DOT prefix on purpose: `ps.` keys never match the sync
 * sweep's `startsWith('ps:')`, so this stays unique to this device even when
 * linked devices share one network identity. Generated once, silently.
 */
export const DEVICE_SUB_ID_KEY = 'ps.deviceSubId';

let cachedSubId: string | null = null;

export const getDeviceSubId = async (): Promise<string> => {
  if (cachedSubId) return cachedSubId;
  const existing = await store.get<string>(DEVICE_SUB_ID_KEY, '');
  if (existing) {
    cachedSubId = existing;
    return existing;
  }
  const fresh = encodeBase64(nacl.randomBytes(8)).replace(/[^A-Za-z0-9]/g, '').slice(0, 10);
  cachedSubId = fresh;
  await store.set(DEVICE_SUB_ID_KEY, fresh);
  return fresh;
};

const FRIEND_CODE_PREFIX = 'PS-';
const FRIEND_CODE_VERSION = 0x01;

export interface Identity {
  peerId: string;
  edPublicKey: Uint8Array;
  edSecretKey: Uint8Array;
  boxPublicKey: Uint8Array;
  boxSecretKey: Uint8Array;
}

interface StoredIdentity {
  v: number;
  edSecretKey: string;
  boxSecretKey: string;
}

/** Drop the in-memory identity so the next load re-reads storage (used after adoption). */
export const resetIdentityCache = (): void => {
  cached = null;
};

const fromStored = (s: StoredIdentity): Identity => {
  const edSecretKey = decodeBase64(s.edSecretKey);
  const boxSecretKey = decodeBase64(s.boxSecretKey);
  const edPair = nacl.sign.keyPair.fromSecretKey(edSecretKey);
  const boxPair = nacl.box.keyPair.fromSecretKey(boxSecretKey);
  return {
    peerId: peerIdFromEd25519PublicKey(edPair.publicKey),
    edPublicKey: edPair.publicKey,
    edSecretKey: edPair.secretKey,
    boxPublicKey: boxPair.publicKey,
    boxSecretKey: boxPair.secretKey,
  };
};

const toStored = (id: Identity): StoredIdentity => ({
  v: 1,
  edSecretKey: encodeBase64(id.edSecretKey),
  boxSecretKey: encodeBase64(id.boxSecretKey),
});

let cached: Identity | null = null;

/**
 * Per-device keypair, device-local forever (DOT prefix never syncs or exports).
 *
 * Linked devices share one SYSTEM identity so a friend can reach any of them at
 * a single address. The push gateway is a different story: it keys registrations
 * by peer id and holds ONE device token per key, so registering both devices
 * under the shared identity would make them overwrite each other's token and
 * only the last one to open would get alerts. Registration doesn't need the
 * system identity though — the gateway picks push targets by whose watch list
 * contains the friend that changed, not by who the relay delivers to. So each
 * device registers under this keypair: its own slot, own token, own watch list.
 */
export const DEVICE_IDENTITY_KEY = 'ps.deviceIdentity';

let cachedDevice: Identity | null = null;

export const getDeviceIdentity = async (): Promise<Identity> => {
  if (cachedDevice) return cachedDevice;
  const stored = await store.get<StoredIdentity>(DEVICE_IDENTITY_KEY, null);
  if (stored?.edSecretKey && stored?.boxSecretKey) {
    try {
      cachedDevice = fromStored(stored);
      return cachedDevice;
    } catch (e) {
      console.error('[NETWORK] stored device identity unreadable, reseeding:', e);
    }
  }
  // Seed from whatever identity this device is using right now, so a device that
  // has never adopted keeps the exact peer id it already registered with and its
  // existing gateway registration carries over untouched.
  let seed: StoredIdentity | null = null;
  const current = await store.get<StoredIdentity>(IDENTITY_STORAGE_KEY, null);
  if (current?.edSecretKey && current?.boxSecretKey) {
    try {
      fromStored(current);
      seed = current;
    } catch {}
  }
  if (!seed) {
    const edPair = nacl.sign.keyPair();
    const boxPair = nacl.box.keyPair();
    seed = {
      v: 1,
      edSecretKey: encodeBase64(edPair.secretKey),
      boxSecretKey: encodeBase64(boxPair.secretKey),
    };
  }
  await store.set(DEVICE_IDENTITY_KEY, seed);
  cachedDevice = fromStored(seed);
  return cachedDevice;
};

export const loadOrCreateIdentity = async (): Promise<Identity> => {
  if (cached) return cached;
  const stored = await store.get<StoredIdentity>(IDENTITY_STORAGE_KEY, null);
  if (stored && stored.edSecretKey && stored.boxSecretKey) {
    try {
      cached = fromStored(stored);
      store.set(IDENTITY_STORAGE_KEY, stored).catch(() => {});
      return cached;
    } catch (e) {
      console.error('[NETWORK] stored identity unreadable, regenerating:', e);
    }
  }
  const edPair = nacl.sign.keyPair();
  const boxPair = nacl.box.keyPair();
  const id: Identity = {
    peerId: peerIdFromEd25519PublicKey(edPair.publicKey),
    edPublicKey: edPair.publicKey,
    edSecretKey: edPair.secretKey,
    boxPublicKey: boxPair.publicKey,
    boxSecretKey: boxPair.secretKey,
  };
  await store.set(IDENTITY_STORAGE_KEY, toStored(id));
  cached = id;
  return id;
};

export const _clearIdentityCache = (): void => {
  cached = null;
};

export interface FriendIdentity {
  peerId: string;
  edPublicKey: Uint8Array;
  boxPublicKey: Uint8Array;
}

export const friendCodeFor = (id: Identity): string => {
  const body = new Uint8Array(1 + 32 + 32);
  body[0] = FRIEND_CODE_VERSION;
  body.set(id.edPublicKey, 1);
  body.set(id.boxPublicKey, 33);
  return FRIEND_CODE_PREFIX + base58Encode(body);
};

export const parseFriendCode = (code: string): FriendIdentity | null => {
  const trimmed = (code || '').trim();
  if (!trimmed.startsWith(FRIEND_CODE_PREFIX)) return null;
  let body: Uint8Array;
  try {
    body = base58Decode(trimmed.slice(FRIEND_CODE_PREFIX.length));
  } catch {
    return null;
  }
  if (body.length !== 65 || body[0] !== FRIEND_CODE_VERSION) return null;
  const edPublicKey = body.subarray(1, 33);
  const boxPublicKey = body.subarray(33, 65);
  let peerId: string;
  try {
    peerId = peerIdFromEd25519PublicKey(edPublicKey);
  } catch {
    return null;
  }
  return { peerId, edPublicKey, boxPublicKey };
};
