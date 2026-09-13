// Cloud Services: credentials and envelope cryptography.
//
// This file is shared byte-for-byte between the mobile and Desktop repos. It
// imports nothing platform-specific so both apps derive the same vault from
// the same password and read each other's objects.
//
// Spec: PluralStarCloudNode/SPEC.md section 6. The password never leaves the
// device. One Argon2id pass (RFC 9106, memory 64 MiB, 3 iterations, one lane,
// fixed application salt) gives 32 bytes of material; HKDF-SHA256 with three
// distinct labels splits that into the lookup ID (sent, identifies the vault),
// the auth secret (sent once on create, then required on every call; the node
// stores only its hash) and the key-encryption key, which never leaves the
// device. The vault's random master key is wrapped with the KEK and stored on
// the node, so a password change is a rewrap and nothing is re-uploaded.
//
// Objects and the manifest use nacl secretbox (XSalsa20-Poly1305), the
// primitive both apps already carry. The object ID is BLAKE2b-256 of the
// ciphertext; the node recomputes it and refuses a mismatch.
//
// Argon2id in pure JS is slow (no 64-bit integers in JS, and Hermes has no
// JIT): tens of seconds on a phone at these parameters. It runs ONCE per
// device, at link time, and the derived credentials are kept locally after
// that, so the cost is paid once and never on a wake check.

import nacl from 'tweetnacl';
import {argon2idAsync} from '@noble/hashes/argon2.js';
import {blake2b} from '@noble/hashes/blake2.js';
import {hkdf} from '@noble/hashes/hkdf.js';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex, utf8ToBytes} from '@noble/hashes/utils.js';
import {gzipSync, gunzipSync, strToU8, strFromU8} from 'fflate';

export const VAULT_KDF = {t: 3, m: 65536, p: 1} as const;
const KDF_MAXMEM = 2 ** 27;
const APP_SALT = utf8ToBytes('PluralStarCloudVault/v1');
const LABEL_LOOKUP = utf8ToBytes('lookup');
const LABEL_AUTH = utf8ToBytes('auth');
const LABEL_KEK = utf8ToBytes('kek');

export interface VaultCredentials {
  lookupId: string;
  authSecret: string;
  kek: Uint8Array;
}

export const deriveVaultCredentials = async (
  password: string,
  onProgress?: (fraction: number) => void,
): Promise<VaultCredentials> => {
  const material = await argon2idAsync(utf8ToBytes(password), APP_SALT, {
    ...VAULT_KDF,
    dkLen: 32,
    maxmem: KDF_MAXMEM,
    asyncTick: 20,
    onProgress,
  });
  const lookupId = bytesToHex(hkdf(sha256, material, APP_SALT, LABEL_LOOKUP, 32));
  const authSecret = bytesToHex(hkdf(sha256, material, APP_SALT, LABEL_AUTH, 32));
  const kek = hkdf(sha256, material, APP_SALT, LABEL_KEK, 32);
  material.fill(0);
  return {lookupId, authSecret, kek};
};

export type PasswordRule = 'length' | 'upper' | 'lower' | 'digit' | 'symbol';

// The first unmet rule, or null when the password passes. The field names the
// rule while typing and Submit stays disabled until this returns null.
export const passwordRuleFailing = (password: string): PasswordRule | null => {
  if (password.length < 10) return 'length';
  if (!/[A-Z]/.test(password)) return 'upper';
  if (!/[a-z]/.test(password)) return 'lower';
  if (!/[0-9]/.test(password)) return 'digit';
  if (!/[^A-Za-z0-9]/.test(password)) return 'symbol';
  return null;
};

const NONCE_LEN = nacl.secretbox.nonceLength;

export const newMasterKey = (): Uint8Array => nacl.randomBytes(nacl.secretbox.keyLength);

const seal = (key: Uint8Array, plain: Uint8Array): Uint8Array => {
  const nonce = nacl.randomBytes(NONCE_LEN);
  const box = nacl.secretbox(plain, nonce, key);
  const out = new Uint8Array(NONCE_LEN + box.length);
  out.set(nonce, 0);
  out.set(box, NONCE_LEN);
  return out;
};

const open = (key: Uint8Array, sealed: Uint8Array): Uint8Array | null => {
  if (sealed.length <= NONCE_LEN) return null;
  return nacl.secretbox.open(sealed.subarray(NONCE_LEN), sealed.subarray(0, NONCE_LEN), key);
};

export const wrapMasterKey = (masterKey: Uint8Array, kek: Uint8Array): string =>
  bytesToBase64(seal(kek, masterKey));

export const unwrapMasterKey = (wrappedB64: string, kek: Uint8Array): Uint8Array | null => {
  let sealed: Uint8Array;
  try {
    sealed = base64ToBytes(wrappedB64);
  } catch {
    return null;
  }
  const mk = open(kek, sealed);
  return mk && mk.length === nacl.secretbox.keyLength ? mk : null;
};

export const encryptBytes = (masterKey: Uint8Array, plain: Uint8Array): Uint8Array => seal(masterKey, plain);

export const decryptBytes = (masterKey: Uint8Array, sealed: Uint8Array): Uint8Array | null => open(masterKey, sealed);

export const objectIdOf = (ciphertext: Uint8Array): string => bytesToHex(blake2b(ciphertext, {dkLen: 32}));

// Data entries are one JSON string per storage key, gzipped before encryption
// (spec 7.2). Media entries are the raw image bytes and are not gzipped.
export const packData = (raw: string): Uint8Array => gzipSync(strToU8(raw), {level: 6});

export const unpackData = (bytes: Uint8Array): string => strFromU8(gunzipSync(bytes));

// A content hash for local change detection. Not a security boundary: it only
// decides whether a key needs re-uploading, and it lives inside the encrypted
// manifest so the node never sees it.
export const contentHashHex = (raw: string): string => bytesToHex(blake2b(strToU8(raw), {dkLen: 16}));

// Base64 over Uint8Array in both directions, chunked so a multi-megabyte media
// object does not build its string one character at a time on Hermes.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_REV = (() => {
  const r = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) r[B64.charCodeAt(i)] = i;
  r['='.charCodeAt(0)] = 0;
  return r;
})();
const CHUNK = 8190;

export const bytesToBase64 = (bytes: Uint8Array): string => {
  const parts: string[] = [];
  const len = bytes.length;
  let codes: number[] = [];
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    codes.push(
      B64.charCodeAt(b0 >> 2),
      B64.charCodeAt(((b0 & 3) << 4) | (b1 >> 4)),
      i + 1 < len ? B64.charCodeAt(((b1 & 15) << 2) | (b2 >> 6)) : 61,
      i + 2 < len ? B64.charCodeAt(b2 & 63) : 61,
    );
    if (codes.length >= CHUNK) {
      parts.push(String.fromCharCode.apply(null, codes));
      codes = [];
    }
  }
  if (codes.length) parts.push(String.fromCharCode.apply(null, codes));
  return parts.join('');
};

export const base64ToBytes = (b64: string): Uint8Array => {
  const s = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  let pad = 0;
  if (s.endsWith('==')) pad = 2;
  else if (s.endsWith('=')) pad = 1;
  const outLen = Math.floor((s.length * 3) / 4) - pad;
  const out = new Uint8Array(Math.max(0, outLen));
  let o = 0;
  for (let i = 0; i < s.length && o < outLen; i += 4) {
    const c0 = B64_REV[s.charCodeAt(i)];
    const c1 = i + 1 < s.length ? B64_REV[s.charCodeAt(i + 1)] : 0;
    const c2 = i + 2 < s.length ? B64_REV[s.charCodeAt(i + 2)] : 0;
    const c3 = i + 3 < s.length ? B64_REV[s.charCodeAt(i + 3)] : 0;
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) throw new Error('invalid base64');
    out[o++] = (c0 << 2) | (c1 >> 4);
    if (o < outLen) out[o++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (o < outLen) out[o++] = ((c2 & 3) << 6) | c3;
  }
  return out;
};

export interface DataUriParts {
  mime: string;
  bytes: Uint8Array;
}

export const splitDataUri = (uri: string): DataUriParts | null => {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(uri);
  if (!m || !m[2]) return null;
  try {
    return {mime: m[1] || 'application/octet-stream', bytes: base64ToBytes(m[3])};
  } catch {
    return null;
  }
};

export const joinDataUri = (mime: string, bytes: Uint8Array): string => `data:${mime};base64,${bytesToBase64(bytes)}`;
