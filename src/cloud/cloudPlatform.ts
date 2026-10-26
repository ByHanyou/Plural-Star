import ReactNativeBlobUtil from 'react-native-blob-util';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import {Platform} from 'react-native';
import {config} from '../config';
import {store, KEYS} from '../storage';
import {getDeviceSubId} from '../network/identity';
import {parseMediaKey} from '../network/mediaKey';
import {NetworkManager} from '../network/NetworkManager';
import {Member} from '../utils';
import {CloudService, CloudPlatform} from './cloudVault';
import {CLOUD_LINK_KEY, CloudLinkState, CloudRequest, CloudResponse, CloudTransport} from './cloudTypes';
import {splitDataUri, base64ToBytes, VAULT_KDF} from './cloudCrypto';
import {AVATAR_MAX, filePathOf, rawBase64, sniffImageExt, tempFilePath} from '../utils/mediaFiles';
import {withTimeout} from '../utils/concurrency';
import {watchCloudTriggers} from './cloudBoot';
import {log} from '../utils/log';
import {strFromU8} from 'fflate';
import {bytesToHex, hexToBytes} from '@noble/hashes/utils.js';
import type Argon2 from 'react-native-argon2';

const transport: CloudTransport = {
  async request(req: CloudRequest): Promise<CloudResponse> {
    const headers: Record<string, string> = {...req.headers};
    const timeoutMs = req.timeoutMs || config().cloud.transportTimeoutMs;
    const guardMs = timeoutMs + 1000;
    if (req.method === 'HEAD') {
      const r = await withTimeout(fetch(req.url, {method: 'HEAD', headers}), guardMs, 'request');
      const out: Record<string, string> = {};
      r.headers.forEach((v, k) => { out[k.toLowerCase()] = v; });
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
    const res = await withTimeout(call, guardMs, 'request');
    const info = res.info();
    const out: Record<string, string> = {};
    const h: Record<string, unknown> = info.headers || {};
    for (const k in h) out[String(k).toLowerCase()] = String(h[k]);
    let bodyBase64 = '';
    try {
      bodyBase64 = res.base64() || '';
    } catch (e) {
      log.debug('cloud', e);
    }
    return {status: Number(info.status) || 0, headers: out, bodyBase64};
  },
};

const isAvatarKey = (key: string): boolean => {
  const mk = parseMediaKey(key);
  return !!mk && (mk.kind === 'av' || mk.kind === 'sysav');
};

const keepsTransparentPng = async (key: string): Promise<boolean> => {
  const mk = parseMediaKey(key);
  if (!mk || mk.kind !== 'av') return false;
  const members = await store.get<Member[]>(KEYS.members, []) || [];
  return members.some(m => m && m.id === mk.memberId && m.avatarTransparent === true);
};

const reencodeImage = async (dataUri: string, key: string): Promise<string> => {
  if (!splitDataUri(dataUri)) return dataUri;
  const b64 = rawBase64(dataUri);
  const kind = sniffImageExt(b64);
  if (kind === 'gif') return `data:image/gif;base64,${b64}`;
  const tmp = tempFilePath('ps_cloud.img');
  try {
    const png = kind === 'png' && (await keepsTransparentPng(key));
    const max = isAvatarKey(key) ? AVATAR_MAX : 10000;
    await ReactNativeBlobUtil.fs.writeFile(tmp, b64, 'base64');
    const resized = await ImageResizer.createResizedImage(`file://${tmp}`, max, max, png ? 'PNG' : 'JPEG', png ? 100 : 80, 0, null, false, {mode: 'contain', onlyScaleDown: true});
    const path = filePathOf(resized.uri);
    const out = await ReactNativeBlobUtil.fs.readFile(path, 'base64');
    try { await ReactNativeBlobUtil.fs.unlink(path); } catch {}
    return `data:${png ? 'image/png' : 'image/jpeg'};base64,${out}`;
  } catch (e) {
    log.debug('cloud', e);
    return dataUri;
  } finally {
    try { await ReactNativeBlobUtil.fs.unlink(tmp); } catch {}
  }
};

const argon2id = async (password: string, salt: Uint8Array): Promise<Uint8Array> => {
  const argon2: typeof Argon2 = require('react-native-argon2').default;
  const {rawHash} = await argon2(password, bytesToHex(salt), {
    mode: 'argon2id',
    iterations: VAULT_KDF.t,
    memory: VAULT_KDF.m,
    parallelism: VAULT_KDF.p,
    hashLength: 32,
    saltEncoding: 'hex',
  });
  return hexToBytes(rawHash);
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
  readMedia: ref => NetworkManager.readMediaDataUri(ref),
  deviceLabel: () => (Platform.OS === 'ios' ? 'iOS' : 'Android'),
  now: () => Date.now(),
  limits: () => config().cloud,
  argon2id,
};

export const CloudServices = new CloudService(platform);

let booted = false;
export const bootCloudServices = (): void => {
  if (booted) return;
  booted = true;
  watchCloudTriggers(CloudServices);
};
