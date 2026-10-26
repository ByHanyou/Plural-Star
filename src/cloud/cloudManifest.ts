import {CloudError, VaultManifest} from './cloudTypes';
import {decryptBytes, encryptBytes, packData, unpackData} from './cloudCrypto';

export const MANIFEST_V = 1 as const;

export const openManifest = (ciphertext: Uint8Array, key: Uint8Array): VaultManifest => {
  const plain = decryptBytes(key, ciphertext);
  if (!plain) throw new CloudError(0, 'manifest undecryptable');
  const m = JSON.parse(unpackData(plain)) as VaultManifest;
  if (!m || m.v !== MANIFEST_V || !Array.isArray(m.entries)) throw new CloudError(0, 'manifest malformed');
  return m;
};

export const sealManifest = (m: VaultManifest, key: Uint8Array): Uint8Array =>
  encryptBytes(key, packData(JSON.stringify(m)));
