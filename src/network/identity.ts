import './secureRandom';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from './bytes';
import { store } from '../storage';
import { base58Encode, base58Decode, peerIdFromEd25519PublicKey } from './peerid';

export const IDENTITY_STORAGE_KEY = 'ps:networkIdentity';

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
