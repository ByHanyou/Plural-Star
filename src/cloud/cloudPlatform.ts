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

const transport: CloudTransport = {
  async request(req: CloudRequest): Promise<CloudResponse> {
    const headers: Record<string, string> = {...req.headers};
    const timeoutMs = req.timeoutMs || 30000;
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('request timed out')), timeoutMs + 1000));
    if (req.method === 'HEAD') {
      const r: any = await Promise.race([fetch(req.url, {method: 'HEAD', headers}), timeout]);
      const out: Record<string, string> = {};
      try {
        r.headers.forEach((v: string, k: string) => { out[String(k).toLowerCase()] = String(v); });
      } catch {}
      return {status: Number(r.status) || 0, headers: out, bodyBase64: ''};
    }
    const hasBody = typeof req.bodyBase64 === 'string';
    if (hasBody && !headers['Content-Type']) headers['Content-Type'] = 'application/octet-stream';
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

const reencodeImage = async (dataUri: string): Promise<string> => {
  const parts = splitDataUri(dataUri);
  if (!parts) return dataUri;
  const mime = parts.mime.toLowerCase();
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

let booted = false;
export const bootCloudServices = (): void => {
  if (booted) return;
  booted = true;
  CloudServices.init().catch(() => {});
  onStoreWrite((key, removed) => {
    if (!key.startsWith('ps:') || key === CLOUD_LINK_KEY || key === SYNC_STATE_KEY || key.startsWith(MIRROR_CACHE_PREFIX)) return;
    if (removed) CloudServices.noteRemoved(key);
    CloudServices.schedulePush();
  });
  let wasOnline = false;
  NetworkManager.subscribe(s => {
    const online = s.status === 'online';
    const rising = online && !wasOnline;
    wasOnline = online;
    if (!rising) return;
    CloudServices.refreshAvailability()
      .then(ok => {
        if (ok) CloudServices.wake();
      })
      .catch(() => {});
  });
};
