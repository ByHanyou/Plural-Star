import type {CloudApi, VaultCreds} from './cloudApi';
import {CloudError, CloudLinkState, isCloudKind, ManifestEntry, VaultManifest} from './cloudTypes';
import {bytesToBase64, decryptBytes, objectIdOf, unpackData, unwrapMasterKey} from './cloudCrypto';
import {rosterOf} from './cloudKeys';
import {openManifest} from './cloudManifest';
import type {CloudPlatform} from './cloudVault';
import {log} from '../utils/log';

const PARTIAL_SHARE = 0.6;

export type PendingLink = {
  lookupId: string;
  authSecret: string;
  subId: string;
  deviceKey: string;
  masterKey: Uint8Array;
  manifest: VaultManifest | null;
  version: number;
  deviceCount: number;
  empty: boolean;
  canClear: boolean;
};

export const pendingVaultCreds = (p: PendingLink): VaultCreds => ({lookupId: p.lookupId, authSecret: p.authSecret, deviceId: p.subId, deviceKey: p.deviceKey});

export const newLinkState = (lookupId: string, authSecret: string, masterKey: Uint8Array, mediaTier: boolean, deviceKey: string, manifestVersion: number, linkedAt: number): CloudLinkState => ({
  v: 1,
  lookupId,
  authSecret,
  masterKeyB64: bytesToBase64(masterKey),
  mediaTier,
  manifestVersion,
  linkedAt,
  lastCheckAt: 0,
  known: {},
  deviceKey,
});

export const isDeviceGone = (e: unknown): boolean => isCloudKind(e, 'DEVICE_UNLINKED');

const sameMembers = async (api: CloudApi, vc: VaultCreds, mk: Uint8Array, entries: ManifestEntry[], local: Record<string, string>): Promise<boolean> => {
  const e = entries.find(x => x.path === 'ps:members');
  if (!e) return false;
  const ct = await api.getObject(vc, e.id);
  if (objectIdOf(ct) !== e.id) throw new CloudError(0, 'object hash mismatch', `Downloaded object ${e.id} did not match its ID.`);
  const plain = decryptBytes(mk, ct);
  if (!plain) throw new CloudError(0, 'object undecryptable', `Object ${e.id} could not be decrypted.`);
  const vault = rosterOf(unpackData(plain));
  const mine = rosterOf(local['ps:members']);
  return !!vault && !!mine && vault.length === mine.length && vault.every((m, i) => m === mine[i]);
};

export const peekVault = async (api: CloudApi, p: CloudPlatform, creds: {lookupId: string; authSecret: string; kek: Uint8Array}): Promise<PendingLink> => {
  const subId = await p.deviceSubId();
  const vc: VaultCreds = {lookupId: creds.lookupId, authSecret: creds.authSecret, deviceId: subId};
  let mk: Uint8Array | null = null;
  try {
    const reg = await api.linkDevice(vc, subId, p.deviceLabel());
    vc.deviceKey = reg.deviceKey;
    const info = await api.info(vc);
    mk = unwrapMasterKey(info.wrappedMasterKey, creds.kek);
    if (!mk) throw new CloudError(0, 'bad password', 'The vault exists but this password does not open it.');
    const remote = await api.getManifest(vc);
    const manifest = remote ? openManifest(remote.ciphertext, mk) : null;
    const entries = manifest ? manifest.entries : [];
    const empty = entries.length === 0;
    let canClear = empty;
    if (!empty) {
      const local = await p.snapshot();
      const partial = entries.length < Object.keys(local).length * PARTIAL_SHARE;
      canClear = partial && (reg.existed || (await sameMembers(api, vc, mk, entries, local)));
    }
    return {
      lookupId: creds.lookupId,
      authSecret: creds.authSecret,
      subId,
      deviceKey: reg.deviceKey,
      masterKey: mk,
      manifest,
      version: remote ? remote.version : 0,
      deviceCount: reg.devices.length,
      empty,
      canClear,
    };
  } catch (e) {
    if (mk) mk.fill(0);
    if (vc.deviceKey && !isDeviceGone(e)) await api.unlinkDevice(vc, subId).catch(err => log.debug('cloud', err));
    throw e;
  } finally {
    creds.kek.fill(0);
  }
};
