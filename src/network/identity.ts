import './secureRandom';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from './bytes';
import { store } from '../storage';
import { logError } from '../utils/log';
import { peerIdFromEd25519PublicKey } from './peerid';
import { IDENTITY_STORAGE_KEY, IDENTITY_UNREADABLE_KEY, IDENTITY_RESET_KEY, StoredIdentity } from './types';

const DEVICE_SUB_ID_KEY = 'ps.deviceSubId';

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

export interface Identity {
  peerId: string;
  edPublicKey: Uint8Array;
  edSecretKey: Uint8Array;
  boxPublicKey: Uint8Array;
  boxSecretKey: Uint8Array;
}

let cached: Identity | null = null;

export const resetIdentityCache = (): void => {
  cached = null;
};

export const readIdentityReset = async (): Promise<number | null> => {
  const reset = await store.get<{at: number}>(IDENTITY_RESET_KEY, null);
  return reset && typeof reset.at === 'number' ? reset.at : null;
};

export const clearIdentityReset = (): Promise<void> => store.remove(IDENTITY_RESET_KEY);

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

const freshStored = (): StoredIdentity => ({
  v: 1,
  edSecretKey: encodeBase64(nacl.sign.keyPair().secretKey),
  boxSecretKey: encodeBase64(nacl.box.keyPair().secretKey),
});

const DEVICE_IDENTITY_KEY = 'ps.deviceIdentity';

let cachedDevice: Identity | null = null;

export const getDeviceIdentity = async (): Promise<Identity> => {
  if (cachedDevice) return cachedDevice;
  const stored = await store.get<StoredIdentity>(DEVICE_IDENTITY_KEY, null);
  if (stored?.edSecretKey && stored?.boxSecretKey) {
    try {
      cachedDevice = fromStored(stored);
      return cachedDevice;
    } catch (e) {
      logError('network.identity', e);
    }
  }
  let seed: StoredIdentity | null = null;
  const current = await store.get<StoredIdentity>(IDENTITY_STORAGE_KEY, null);
  if (current?.edSecretKey && current?.boxSecretKey) {
    try {
      fromStored(current);
      seed = current;
    } catch (e) {
      logError('network.identity', e);
    }
  }
  if (!seed) seed = freshStored();
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
      store.set(IDENTITY_STORAGE_KEY, stored).catch(e => logError('network.identity', e));
      return cached;
    } catch (e) {
      logError('network.identity', e);
      await store.set(IDENTITY_UNREADABLE_KEY, stored).catch(err => logError('network.identity', err));
      await store.set(IDENTITY_RESET_KEY, {at: Date.now()}).catch(err => logError('network.identity', err));
    }
  }
  const fresh = freshStored();
  await store.set(IDENTITY_STORAGE_KEY, fresh);
  cached = fromStored(fresh);
  return cached;
};

export interface FriendIdentity {
  peerId: string;
  edPublicKey: Uint8Array;
  boxPublicKey: Uint8Array;
}
