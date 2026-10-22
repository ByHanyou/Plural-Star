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
const KDF_CHECK_PASSWORD = 'Plural Star vault check ✦ 2026';
const KDF_CHECK_HEX = 'bab91b985a030977df4e9a9eb2b616bb1e70a54e82f346d2e568b8c6583c3f11';
const FAST_KDF_TIMEOUT_MS = 20000;

export interface VaultCredentials {
  lookupId: string;
  authSecret: string;
  kek: Uint8Array;
}

type Argon2idHook = (password: string, salt: Uint8Array) => Promise<Uint8Array>;

let fastKdfCheck: Promise<boolean> | null = null;

const hasLoneSurrogate = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0xd800 || c > 0xdfff) continue;
    if (c > 0xdbff) return true;
    const next = s.charCodeAt(i + 1);
    if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
    i++;
  }
  return false;
};

const runFastKdf = async (hook: Argon2idHook, password: string): Promise<Uint8Array | null> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const out = await Promise.race([
      hook(password, APP_SALT.slice()),
      new Promise<null>(resolve => (timer = setTimeout(() => resolve(null), FAST_KDF_TIMEOUT_MS))),
    ]);
    return out instanceof Uint8Array && out.length === 32 ? out : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const fastKdfTrusted = (hook: Argon2idHook): Promise<boolean> => {
  if (!fastKdfCheck) fastKdfCheck = runFastKdf(hook, KDF_CHECK_PASSWORD).then(out => !!out && bytesToHex(out) === KDF_CHECK_HEX);
  return fastKdfCheck;
};

export const deriveVaultCredentials = async (
  password: string,
  onProgress?: (fraction: number) => void,
  argon2id?: Argon2idHook,
): Promise<VaultCredentials> => {
  const fast = argon2id && !hasLoneSurrogate(password) && (await fastKdfTrusted(argon2id)) ? await runFastKdf(argon2id, password) : null;
  const material =
    fast ||
    (await argon2idAsync(utf8ToBytes(password), APP_SALT, {
      ...VAULT_KDF,
      dkLen: 32,
      maxmem: KDF_MAXMEM,
      asyncTick: 20,
      onProgress,
    }));
  const lookupId = bytesToHex(hkdf(sha256, material, APP_SALT, LABEL_LOOKUP, 32));
  const authSecret = bytesToHex(hkdf(sha256, material, APP_SALT, LABEL_AUTH, 32));
  const kek = hkdf(sha256, material, APP_SALT, LABEL_KEK, 32);
  material.fill(0);
  return {lookupId, authSecret, kek};
};

export type PasswordRule = 'length' | 'upper' | 'lower' | 'digit' | 'symbol';

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
  const mk = open(kek, base64ToBytes(wrappedB64));
  return mk && mk.length === nacl.secretbox.keyLength ? mk : null;
};

export const encryptBytes = (masterKey: Uint8Array, plain: Uint8Array): Uint8Array => seal(masterKey, plain);

export const decryptBytes = (masterKey: Uint8Array, sealed: Uint8Array): Uint8Array | null => open(masterKey, sealed);

export const objectIdOf = (ciphertext: Uint8Array): string => bytesToHex(blake2b(ciphertext, {dkLen: 32}));

export const packData = (raw: string): Uint8Array => gzipSync(strToU8(raw), {level: 6});

export const unpackData = (bytes: Uint8Array): string => strFromU8(gunzipSync(bytes));

export const contentHashHex = (raw: string): string => bytesToHex(blake2b(strToU8(raw), {dkLen: 16}));

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_REV = (() => {
  const r = new Uint8Array(256);
  for (let i = 0; i < B64.length; i++) r[B64.charCodeAt(i)] = i;
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
  return {mime: m[1] || 'application/octet-stream', bytes: base64ToBytes(m[3])};
};

export const joinDataUri = (mime: string, bytes: Uint8Array): string => `data:${mime};base64,${bytesToBase64(bytes)}`;
