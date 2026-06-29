// Plural Star network identity.
//
// Each install has two keypairs:
//   - an Ed25519 "identity" keypair  -> derives the libp2p PeerID the relay
//     routes on, and signs outgoing envelopes so peers can authenticate us.
//   - an X25519 "box" keypair        -> used by nacl.box for the actual E2E
//     encryption of message contents.
//
// Both secret keys are persisted locally via the app's `store` (AsyncStorage +
// the app's encrypted filesystem backup). This matches how the rest of the app
// stores data — offline-first, on-device only. The secret never leaves the
// device and is never sent to a relay.
//
// A "friend code" is the shareable public half of an identity: version byte +
// Ed25519 public key + X25519 public key, base58-encoded. From it a peer can
// derive our PeerID (to route to us) and our box public key (to encrypt to us).

// Install the CSPRNG-backed PRNG before any key generation runs (see
// secureRandom.ts). Must precede the nacl import-use below.
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
  edPublicKey: Uint8Array; // 32
  edSecretKey: Uint8Array; // 64
  boxPublicKey: Uint8Array; // 32
  boxSecretKey: Uint8Array; // 32
}

interface StoredIdentity {
  v: number;
  edSecretKey: string; // base64, 64 bytes
  boxSecretKey: string; // base64, 32 bytes
}

const fromStored = (s: StoredIdentity): Identity => {
  const edSecretKey = decodeBase64(s.edSecretKey);
  const boxSecretKey = decodeBase64(s.boxSecretKey);
  // Ed25519 secret key (64 bytes) embeds the public key as its last 32 bytes;
  // reconstruct via the keypair-from-secret helper to be explicit.
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

// Load the persisted identity, generating and saving a fresh one on first use.
export const loadOrCreateIdentity = async (): Promise<Identity> => {
  if (cached) return cached;
  const stored = await store.get<StoredIdentity>(IDENTITY_STORAGE_KEY, null);
  if (stored && stored.edSecretKey && stored.boxSecretKey) {
    try {
      cached = fromStored(stored);
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

// For tests / sign-out. Clears the in-memory cache only; storage is untouched.
export const _clearIdentityCache = (): void => {
  cached = null;
};

export interface FriendIdentity {
  peerId: string;
  edPublicKey: Uint8Array; // 32
  boxPublicKey: Uint8Array; // 32
}

export const friendCodeFor = (id: Identity): string => {
  const body = new Uint8Array(1 + 32 + 32);
  body[0] = FRIEND_CODE_VERSION;
  body.set(id.edPublicKey, 1);
  body.set(id.boxPublicKey, 33);
  return FRIEND_CODE_PREFIX + base58Encode(body);
};

// Parse a friend code into the peer's public identity, or null if malformed.
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
