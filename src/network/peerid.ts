const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const base58Encode = (bytes: Uint8Array): string => {
  if (bytes.length === 0) return '';
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  const digits: number[] = [0];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  let out = '';
  for (let i = 0; i < zeros; i++) out += '1';
  for (let i = digits.length - 1; i >= 0; i--) out += BASE58_ALPHABET[digits[i]];
  return out;
};

const marshalEd25519PublicKey = (raw: Uint8Array): Uint8Array => {
  if (raw.length !== 32) throw new Error('ed25519 public key must be 32 bytes');
  const out = new Uint8Array(2 + 2 + 32);
  out[0] = 0x08;
  out[1] = 0x01;
  out[2] = 0x12;
  out[3] = 0x20;
  out.set(raw, 4);
  return out;
};

const MAX_INLINE_KEY_LENGTH = 42;

const IDENTITY_CODE = 0x00;

const multihash = (code: number, digest: Uint8Array): Uint8Array => {
  if (code > 0x7f || digest.length > 0x7f) {
    throw new Error('multihash varint > 1 byte not supported here');
  }
  const out = new Uint8Array(2 + digest.length);
  out[0] = code;
  out[1] = digest.length;
  out.set(digest, 2);
  return out;
};

export const peerIdFromEd25519PublicKey = (rawPub: Uint8Array): string => {
  const marshaled = marshalEd25519PublicKey(rawPub);
  if (marshaled.length > MAX_INLINE_KEY_LENGTH) {
    throw new Error('ed25519 marshaled key unexpectedly exceeds inline threshold');
  }
  const mh = multihash(IDENTITY_CODE, marshaled);
  return base58Encode(mh);
};
