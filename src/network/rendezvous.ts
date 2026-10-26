import './secureRandom';
import nacl from 'tweetnacl';
import { concatBytes, encodeBase64, decodeBase64, decodeUTF8, encodeUTF8 } from './bytes';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Identity, FriendIdentity } from './identity';
import { peerIdFromEd25519PublicKey } from './peerid';
import { asRecord } from '../utils';

const NS_PREFIX_FRIEND = 'psf:';
const NS_PREFIX_SYNC = 'pss:';

export const rendezvousNamespace = (code: string, kind: 'friend' | 'sync' = 'friend'): string => {
  const prefix = kind === 'sync' ? NS_PREFIX_SYNC : NS_PREFIX_FRIEND;
  const digest = nacl.hash(decodeUTF8(prefix + code.trim().toUpperCase()));
  return bytesToHex(digest.subarray(0, 32));
};

const recordSigInput = (peerId: string, edPub: Uint8Array, boxPub: Uint8Array): Uint8Array =>
  concatBytes(decodeUTF8(peerId), edPub, boxPub);

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

export const openRendezvousRecord = (recordBase64: string): FriendIdentity | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(encodeUTF8(decodeBase64(recordBase64)));
  } catch {
    return null;
  }
  const record = asRecord(parsed);
  if (!record || typeof record.peerId !== 'string') return null;
  if (typeof record.edPublicKey !== 'string' || typeof record.boxPublicKey !== 'string' || typeof record.sig !== 'string') return null;
  const peerId = record.peerId;
  const edPub = decodeBase64(record.edPublicKey);
  const boxPub = decodeBase64(record.boxPublicKey);
  const sig = decodeBase64(record.sig);
  if (edPub.length !== 32 || boxPub.length !== 32 || sig.length !== nacl.sign.signatureLength) return null;
  if (peerIdFromEd25519PublicKey(edPub) !== peerId) return null;
  if (!nacl.sign.detached.verify(recordSigInput(peerId, edPub, boxPub), sig, edPub)) {
    return null;
  }
  return { peerId, edPublicKey: edPub, boxPublicKey: boxPub };
};
