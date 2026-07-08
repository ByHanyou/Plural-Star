import './secureRandom';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from './bytes';
import { Identity, FriendIdentity } from './identity';
import { peerIdFromEd25519PublicKey } from './peerid';
import { NetMessage } from './types';

interface Envelope {
  v: number;
  from: { ed: string; box: string };
  n: string;
  ct: string;
  sig: string;
}

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

export const sealMessage = (
  self: Identity,
  recipientBoxPublicKey: Uint8Array,
  message: NetMessage,
): string => {
  const plaintext = decodeUTF8(JSON.stringify(message));
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ct = nacl.box(plaintext, nonce, recipientBoxPublicKey, self.boxSecretKey);
  const sig = nacl.sign.detached(concat(nonce, ct), self.edSecretKey);
  const envelope: Envelope = {
    v: 1,
    from: { ed: encodeBase64(self.edPublicKey), box: encodeBase64(self.boxPublicKey) },
    n: encodeBase64(nonce),
    ct: encodeBase64(ct),
    sig: encodeBase64(sig),
  };
  return encodeBase64(decodeUTF8(JSON.stringify(envelope)));
};

export interface OpenedMessage {
  sender: FriendIdentity;
  message: NetMessage;
}

export const openMessage = (
  self: Identity,
  senderPeerId: string,
  payloadBase64: string,
): OpenedMessage | null => {
  let envelope: Envelope;
  try {
    envelope = JSON.parse(encodeUTF8(decodeBase64(payloadBase64)));
  } catch {
    return null;
  }
  if (!envelope || envelope.v !== 1 || !envelope.from) return null;

  let edPub: Uint8Array;
  let boxPub: Uint8Array;
  let nonce: Uint8Array;
  let ct: Uint8Array;
  let sig: Uint8Array;
  try {
    edPub = decodeBase64(envelope.from.ed);
    boxPub = decodeBase64(envelope.from.box);
    nonce = decodeBase64(envelope.n);
    ct = decodeBase64(envelope.ct);
    sig = decodeBase64(envelope.sig);
  } catch {
    return null;
  }
  if (edPub.length !== 32 || boxPub.length !== 32) return null;

  let derivedPeerId: string;
  try {
    derivedPeerId = peerIdFromEd25519PublicKey(edPub);
  } catch {
    return null;
  }
  if (derivedPeerId !== senderPeerId) {
    console.warn('[NETWORK] sender peer_id does not match signed identity — dropping');
    return null;
  }

  if (!nacl.sign.detached.verify(concat(nonce, ct), sig, edPub)) {
    console.warn('[NETWORK] envelope signature invalid — dropping');
    return null;
  }

  const plaintext = nacl.box.open(ct, nonce, boxPub, self.boxSecretKey);
  if (!plaintext) {
    console.warn('[NETWORK] box.open failed — dropping');
    return null;
  }

  let message: NetMessage;
  try {
    message = JSON.parse(encodeUTF8(plaintext));
  } catch {
    return null;
  }

  return {
    sender: { peerId: derivedPeerId, edPublicKey: edPub, boxPublicKey: boxPub },
    message,
  };
};
