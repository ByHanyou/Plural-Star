// Rendezvous helpers: turn a short code into a lookup namespace, and build /
// verify the signed identity record stored under it.
//
// The relay only ever sees `namespace = hash("psf:" + code)` and an opaque,
// signed record. It never sees the code, and a tampered record fails signature
// verification, so a hostile relay cannot substitute a different identity.

import './secureRandom';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, decodeUTF8, encodeUTF8 } from './bytes';
import { Identity, FriendIdentity } from './identity';
import { peerIdFromEd25519PublicKey } from './peerid';

const NS_PREFIX_FRIEND = 'psf:';
const NS_PREFIX_SYNC = 'pss:';

const toHex = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
};

const concat = (...parts: Uint8Array[]): Uint8Array => {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
};

// Namespace = first 32 bytes of SHA-512(prefix + code), hex-encoded. The code
// itself never leaves the device.
export const rendezvousNamespace = (code: string, kind: 'friend' | 'sync' = 'friend'): string => {
  const prefix = kind === 'sync' ? NS_PREFIX_SYNC : NS_PREFIX_FRIEND;
  const digest = nacl.hash(decodeUTF8(prefix + code.trim().toUpperCase()));
  return toHex(digest.subarray(0, 32));
};

const recordSigInput = (peerId: string, edPub: Uint8Array, boxPub: Uint8Array): Uint8Array =>
  concat(decodeUTF8(peerId), edPub, boxPub);

// Build the base64 signed record to publish under our namespace.
export const makeRendezvousRecord = (id: Identity): string => {
  const sig = nacl.sign.detached(
    recordSigInput(id.peerId, id.edPublicKey, id.boxPublicKey),
    id.edSecretKey,
  );
  const record = {
    peerId: id.peerId,
    edPublicKey: encodeBase64(id.edPublicKey),
    boxPublicKey: encodeBase64(id.boxPublicKey),
    sig: encodeBase64(sig),
  };
  return encodeBase64(decodeUTF8(JSON.stringify(record)));
};

// Parse + verify a looked-up record. Returns the peer's identity or null.
export const openRendezvousRecord = (recordBase64: string): FriendIdentity | null => {
  let parsed: any;
  try {
    parsed = JSON.parse(encodeUTF8(decodeBase64(recordBase64)));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed.peerId !== 'string') return null;
  let edPub: Uint8Array;
  let boxPub: Uint8Array;
  let sig: Uint8Array;
  try {
    edPub = decodeBase64(parsed.edPublicKey);
    boxPub = decodeBase64(parsed.boxPublicKey);
    sig = decodeBase64(parsed.sig);
  } catch {
    return null;
  }
  if (edPub.length !== 32 || boxPub.length !== 32) return null;
  let derived: string;
  try {
    derived = peerIdFromEd25519PublicKey(edPub);
  } catch {
    return null;
  }
  if (derived !== parsed.peerId) return null;
  if (!nacl.sign.detached.verify(recordSigInput(parsed.peerId, edPub, boxPub), sig, edPub)) {
    return null;
  }
  return { peerId: parsed.peerId, edPublicKey: edPub, boxPublicKey: boxPub };
};
