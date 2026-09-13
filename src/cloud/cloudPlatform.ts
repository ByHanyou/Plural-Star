// Cloud Services: the mobile side of CloudPlatform. This file is the one part
// of src/cloud that differs between the repos; everything it hands to the
// shared engine is bytes, strings and store keys.

import ReactNativeBlobUtil from 'react-native-blob-util';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import {Platform} from 'react-native';
import {store, onStoreWrite} from '../storage';
import {getDeviceSubId} from '../network/identity';
import {SYNC_STATE_KEY, MIRROR_CACHE_PREFIX} from '../network/types';
import {NetworkManager} from '../network/NetworkManager';
import {CloudService, CloudPlatform} from './cloudVault';
import {CLOUD_LINK_KEY, CloudLinkState, CloudRequest, CloudResponse, CloudTransport} from './cloudTypes';
import {splitDataUri, base64ToBytes} from './cloudCrypto';
import {strFromU8} from 'fflate';

// react-native-blob-util moves bytes as base64 in both directions without the
// string-body limits of RN's fetch, and it reports every response header, which
// the resumable upload needs for Upload-Offset.
const transport: CloudTransport = {
  async request(req: CloudRequest): Promise<CloudResponse> {
    const headers: Record<string, string> = {...req.headers};
    const timeoutMs = req.timeoutMs || 30000;
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('request timed out')), timeoutMs + 1000));
    if (req.method === 'HEAD') {
      // No body either way, and blob-util's typings do not admit HEAD. RN's
      // own fetch handles it and exposes the headers, which is all HEAD is for.
      const r: any = await Promise.race([fetch(req.url, {method: 'HEAD', headers}), timeout]);
      const out: Record<string, string> = {};
      try {
        r.headers.forEach((v: string, k: string) => { out[String(k).toLowerCase()] = String(v); });
      } catch {}
      return {status: Number(r.status) || 0, headers: out, bodyBase64: ''};
    }
    const hasBody = typeof req.bodyBase64 === 'string';
    if (hasBody && !headers['Content-Type']) headers['Content-Type'] = 'application/octet-stream';
    // blob-util decodes a string body from base64 ONLY under
    // application/octet-stream; any other content type is sent verbatim. So
    // ciphertext goes as base64 and JSON goes as the text it is.
    let body: string | undefined;
    if (hasBody) {
      body = headers['Content-Type'] === 'application/octet-stream'
        ? req.bodyBase64
        : strFromU8(base64ToBytes(req.bodyBase64 as string));
    }
    const call = ReactNativeBlobUtil.config({timeout: timeoutMs}).fetch(
      req.method as 'GET' | 'POST' | 'PUT' | 'DELETE',
      req.url,
      headers,
      body,
    );
    const res: any = await Promise.race([call, timeout]);
    const info = res.info();
    const out: Record<string, string> = {};
    const h = info.headers || {};
    for (const k in h) out[String(k).toLowerCase()] = String(h[k]);
    let bodyBase64 = '';
    try {
      bodyBase64 = res.base64() || '';
    } catch {
      bodyBase64 = '';
    }
    return {status: Number(info.status) || 0, headers: out, bodyBase64};
  },
};

// Spec 7.3: JPEG quality 80, longest side unchanged, GIF passed through. PNG is
// passed through as well: a member's transparent avatar is a feature the app
// exposes (avatarTransparent), and a JPEG has no alpha channel to keep it.
const reencodeImage = async (dataUri: string): Promise<string> => {
  const parts = splitDataUri(dataUri);
  if (!parts) return dataUri;
  const mime = parts.mime.toLowerCase();
  // A JPEG is re-encoded like everything else (7.3 says quality 80, not "as
  // is"); only GIF, and PNG per deviation 2, pass through.
  if (mime === 'image/gif' || mime === 'image/png') return dataUri;
  const tmp = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/ps_cloud_${Date.now()}_${Math.floor(Math.random() * 1e6)}.img`;
  try {
    const b64 = dataUri.slice(dataUri.indexOf(',') + 1);
    await ReactNativeBlobUtil.fs.writeFile(tmp, b64, 'base64');
    const resized = await ImageResizer.createResizedImage(`file://${tmp}`, 10000, 10000, 'JPEG', 80, 0);
    const path = resized.uri.replace('file://', '');
    const out = await ReactNativeBlobUtil.fs.readFile(path, 'base64');
    try { await ReactNativeBlobUtil.fs.unlink(path); } catch {}
    return `data:image/jpeg;base64,${out}`;
  } catch {
    return dataUri;
  } finally {
    try { await ReactNativeBlobUtil.fs.unlink(tmp); } catch {}
  }
};

const platform: CloudPlatform = {
  transport,
  relay: () => NetworkManager.cloudRelay(),
  snapshot: () => NetworkManager.cloudSnapshot(),
  apply: keys => NetworkManager.applyCloudSnapshot(keys),
  remove: key => NetworkManager.removeCloudKey(key),
  adoptIdentity: (identityRaw, friendsRaw) => NetworkManager.adoptCloudIdentity(identityRaw, friendsRaw),
  mergeFriends: (friendsRaw, tombstonesRaw) => NetworkManager.mergeCloudFriends(friendsRaw, tombstonesRaw),
  reencodeImage,
  localHash: raw => NetworkManager.cloudLocalHash(raw),
  loadLink: () => store.get<CloudLinkState>(CLOUD_LINK_KEY, null),
  saveLink: async state => {
    if (state) await store.set(CLOUD_LINK_KEY, state);
    else await store.remove(CLOUD_LINK_KEY);
  },
  deviceSubId: () => getDeviceSubId(),
  deviceLabel: () => (Platform.OS === 'ios' ? 'iOS' : 'Android'),
  now: () => Date.now(),
};

export const CloudServices = new CloudService(platform);

// Called once from App.tsx after NetworkManager.init(). Feature detection and
// the wake check ride the relay's own connection state, so nothing about the
// cloud is polled while the app is offline.
let booted = false;
export const bootCloudServices = (): void => {
  if (booted) return;
  booted = true;
  CloudServices.init().catch(() => {});
  // Every Save also saves to the cloud (spec 8.1). The engine's own state
  // writes and the device-sync bookkeeping are not saves.
  onStoreWrite((key, removed) => {
    if (!key.startsWith('ps:') || key === CLOUD_LINK_KEY || key === SYNC_STATE_KEY || key.startsWith(MIRROR_CACHE_PREFIX)) return;
    // A store.remove is the one deliberate removal; anything else that turns
    // up missing is repaired from the vault on the next check (spec 8.2).
    if (removed) CloudServices.noteRemoved(key);
    CloudServices.schedulePush();
  });
  NetworkManager.subscribe(s => {
    if (s.status !== 'online') return;
    CloudServices.refreshAvailability()
      .then(ok => {
        if (ok) CloudServices.wake();
      })
      .catch(() => {});
  });
};
