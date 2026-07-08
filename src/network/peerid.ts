const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const BASE58_MAP: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (let i = 0; i < BASE58_ALPHABET.length; i++) m[BASE58_ALPHABET[i]] = i;
  return m;
})();

export const base58Encode = (bytes: Uint8Array): string => {
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

export const base58Decode = (str: string): Uint8Array => {
  if (str.length === 0) return new Uint8Array(0);
  let zeros = 0;
  while (zeros < str.length && str[zeros] === '1') zeros++;

  const bytes: number[] = [0];
  for (let i = zeros; i < str.length; i++) {
    const val = BASE58_MAP[str[i]];
    if (val === undefined) throw new Error(`invalid base58 character: ${str[i]}`);
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) out[zeros + i] = bytes[bytes.length - 1 - i];
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

export const ed25519PublicKeyFromPeerId = (peerId: string): Uint8Array | null => {
  let mh: Uint8Array;
  try {
    mh = base58Decode(peerId);
  } catch {
    return null;
  }
  if (mh.length < 2 || mh[0] !== IDENTITY_CODE) return null;
  const len = mh[1];
  if (mh.length !== 2 + len) return null;
  const marshaled = mh.subarray(2);
  if (
    marshaled.length !== 36 ||
    marshaled[0] !== 0x08 ||
    marshaled[1] !== 0x01 ||
    marshaled[2] !== 0x12 ||
    marshaled[3] !== 0x20
  ) {
    return null;
  }
  return marshaled.subarray(4);
};
