// Pure-JS libp2p PeerID derivation for Plural Star's network client.
//
// The Plural Star Node routes packets on a libp2p PeerID (it calls peer.Decode
// on both the /send recipient and the /ws?peer_id= query param). The app is not
// a libp2p node, so we derive a compatible PeerID from our own Ed25519 identity
// key by reproducing libp2p's encoding:
//
//   1. Marshal the Ed25519 public key as a libp2p PublicKey protobuf
//        message PublicKey { KeyType Type = 1; bytes Data = 2; }  (Ed25519 = 1)
//   2. Because the marshaled key (36 bytes) is <= 42 (MaxInlineKeyLength),
//      libp2p uses the *identity* multihash (code 0x00) rather than SHA-256.
//   3. Base58btc-encode the multihash. Ed25519 identity-hash IDs render as the
//      familiar "12D3Koo..." string, which is what the node's peer.ID.String()
//      also produces, so the two are interoperable.
//
// No external dependencies: base58 is implemented inline over Uint8Array.

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Precomputed reverse lookup for decode.
const BASE58_MAP: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (let i = 0; i < BASE58_ALPHABET.length; i++) m[BASE58_ALPHABET[i]] = i;
  return m;
})();

export const base58Encode = (bytes: Uint8Array): string => {
  if (bytes.length === 0) return '';
  // Count leading zero bytes -> leading '1's.
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  // Convert base-256 to base-58 via repeated division (big-endian digits).
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
  // leading zeros already accounted; bytes are little-endian here -> reverse.
  for (let i = 0; i < bytes.length; i++) out[zeros + i] = bytes[bytes.length - 1 - i];
  return out;
};

// Marshal an Ed25519 public key (32 raw bytes) into the libp2p PublicKey
// protobuf wire format. KeyType.Ed25519 = 1.
const marshalEd25519PublicKey = (raw: Uint8Array): Uint8Array => {
  if (raw.length !== 32) throw new Error('ed25519 public key must be 32 bytes');
  // field 1 (Type, varint): tag 0x08, value 1
  // field 2 (Data, length-delimited): tag 0x12, length 0x20, then 32 bytes
  const out = new Uint8Array(2 + 2 + 32);
  out[0] = 0x08;
  out[1] = 0x01;
  out[2] = 0x12;
  out[3] = 0x20;
  out.set(raw, 4);
  return out;
};

// MaxInlineKeyLength in go-libp2p; keys whose marshaled form is at or below this
// use the identity multihash instead of being hashed with SHA-256.
const MAX_INLINE_KEY_LENGTH = 42;

// SHA-256 multihash fallback (code 0x12) for completeness, in case a future key
// type exceeds the inline threshold. Identity (0x00) is used for Ed25519.
const IDENTITY_CODE = 0x00;

// Encode a multihash header (code + length) as two single-byte varints. Both the
// identity code and our lengths are < 128, so single-byte varints are exact.
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

// Derive the libp2p PeerID string ("12D3Koo...") from an Ed25519 public key.
export const peerIdFromEd25519PublicKey = (rawPub: Uint8Array): string => {
  const marshaled = marshalEd25519PublicKey(rawPub);
  if (marshaled.length > MAX_INLINE_KEY_LENGTH) {
    // Not expected for Ed25519, but guard rather than silently produce a wrong ID.
    throw new Error('ed25519 marshaled key unexpectedly exceeds inline threshold');
  }
  const mh = multihash(IDENTITY_CODE, marshaled);
  return base58Encode(mh);
};

// Validate that a string is a well-formed Ed25519 PeerID and return the embedded
// raw public key, or null if it does not parse as one. Used to bind a sender's
// claimed identity to the peer_id the relay reports.
export const ed25519PublicKeyFromPeerId = (peerId: string): Uint8Array | null => {
  let mh: Uint8Array;
  try {
    mh = base58Decode(peerId);
  } catch {
    return null;
  }
  // identity multihash: [0x00, len, ...marshaledPubKey]
  if (mh.length < 2 || mh[0] !== IDENTITY_CODE) return null;
  const len = mh[1];
  if (mh.length !== 2 + len) return null;
  const marshaled = mh.subarray(2);
  // expect protobuf [0x08,0x01,0x12,0x20, ...32]
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
