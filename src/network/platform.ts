import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { saveAvatar, saveBannerFromBase64, saveBioImage, saveChatMediaDataUri, deleteChatMediaFor } from '../utils/mediaUtils';
import { localPathOf, rawBase64, sniffImageExt, fieldImageId, MIME_BY_EXT } from '../utils/mediaFiles';
import { mirrorThumbDataUri, mirrorGifProbe, mirrorGifBase64, mirrorGifFiles, pruneMirrorGifs, saveMirrorGif, clearMirrorGifs } from '../utils/mirrorMedia';
import { CLOUD_MEDIA_REF } from '../cloud/cloudKeys';
import { getFriendsPushToken, endFriendsActivity, getAPNsDeviceToken, waitForProtectedData } from '../services/LiveActivityService';
import i18n from '../i18n/i18n';
import { store } from '../storage';
import { mirrorGifHash } from './mirror/gifHash';
import { log } from '../utils/log';
import type { MediaAdapter, MediaImageKind, NetworkAdapters, PlatformAdapter, StorageAdapter } from './adapters';

const readRaw = async (key: string): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(key);
  } catch (e) {
    log.debug('network', e);
    const v = await store.get<unknown>(key, null);
    return v == null ? null : JSON.stringify(v);
  }
};

const storage: StorageAdapter = {
  getRaw: readRaw,
  async getMany(keys) {
    try {
      return await AsyncStorage.getMany(keys);
    } catch (e) {
      log.debug('network', e);
      const got: Record<string, string | null> = {};
      for (const k of keys) got[k] = await readRaw(k);
      return got;
    }
  },
  setRaw: (key, raw) => store.setRaw(key, raw),
  setMany: entries => AsyncStorage.setMany(entries),
  remove: key => AsyncStorage.removeItem(key),
  removeMany: keys => AsyncStorage.removeMany(keys),
  get: (key, fallback) => store.get(key, fallback),
  set: (key, value) => store.set(key, value),
  allKeys: () => AsyncStorage.getAllKeys(),
};

const readLocalDataUri = async (val: string, image: boolean): Promise<string | null> => {
  if (val.startsWith('data:')) return val;
  if (!val.startsWith('file://')) return null;
  try {
    const path = localPathOf(val);
    const b64 = await ReactNativeBlobUtil.fs.readFile(path, 'base64');
    const ext = (path.split('.').pop() || '').toLowerCase();
    const mime = MIME_BY_EXT[ext] || (image ? 'image/jpeg' : 'application/octet-stream');
    return `data:${mime};base64,${b64}`;
  } catch (e) {
    log.debug('network', e);
    return null;
  }
};

const readMediaDataUri = async (ref: string): Promise<string | null> => {
  const m = /^(img|file):\d+:\d+:(.*)$/.exec(ref);
  if (!m) return null;
  return readLocalDataUri(m[2], m[1] !== 'file');
};

const saveImage = (kind: MediaImageKind, id: string, dataUri: string): Promise<string> =>
  kind === 'avatar' ? saveAvatar(id, dataUri) : saveBannerFromBase64(id, dataUri);

const media: MediaAdapter = {
  localPrefix: 'file://',
  isSource: (v): v is string => typeof v === 'string' && (v.startsWith('file://') || v.startsWith('data:')),
  signature: src => (src.startsWith('data:') ? mirrorGifHash(src) : src.replace(/^file:\/\/.*\/Documents\//, 'file:///Documents/')),
  thumb: mirrorThumbDataUri,
  gifHash: src => (typeof src === 'string' ? mirrorGifProbe(src) : Promise.resolve(null)),
  gifBase64: mirrorGifBase64,
  gifsPresent: async (peerId, feature, wants) => new Set(Object.keys(await mirrorGifFiles(peerId, feature, wants))),
  gifUris: mirrorGifFiles,
  pruneGifs: pruneMirrorGifs,
  saveGif: saveMirrorGif,
  clearGifs: clearMirrorGifs,
  async ref(val, file = false) {
    if (val.startsWith('data:')) return val;
    if (!val.startsWith('file://')) return null;
    try {
      const st = await ReactNativeBlobUtil.fs.stat(localPathOf(val));
      return `${CLOUD_MEDIA_REF}${file ? 'file' : 'img'}:${Number(st.lastModified) || 0}:${Number(st.size) || 0}:${val}`;
    } catch (e) {
      log.debug('network', e);
      return null;
    }
  },
  materialize: value => (value.startsWith(CLOUD_MEDIA_REF) ? readMediaDataUri(value.slice(CLOUD_MEDIA_REF.length)) : Promise.resolve(value)),
  readDataUri: readMediaDataUri,
  saveMemberImage: saveImage,
  saveSystemImage: (kind, dataUri) => saveImage(kind, `system-${kind}`, dataUri),
  saveFieldImage: (memberId, fieldId, dataUri) => saveBioImage(fieldImageId(memberId, fieldId), dataUri, sniffImageExt(rawBase64(dataUri)) ?? 'png'),
  saveChatMedia: saveChatMediaDataUri,
  deleteChatMedia: deleteChatMediaFor,
};

const deviceLabel = (): string => {
  try {
    const c = (Platform.constants || {}) as {interfaceIdiom?: string; Brand?: string; Model?: string};
    if (Platform.OS === 'ios') {
      const idiom = c.interfaceIdiom;
      const kind = idiom === 'pad' ? 'iPad' : idiom === 'mac' ? 'Mac' : 'iPhone';
      return `${kind} (iOS ${Platform.Version})`;
    }
    const name = [c.Brand, c.Model].filter(Boolean).join(' ');
    return name || `Android ${Platform.Version}`;
  } catch (e) {
    log.debug('network', e);
    return Platform.OS === 'ios' ? 'iPhone' : i18n.t('network.androidDeviceFallback');
  }
};

const platform: PlatformAdapter = {
  deviceLabel,
  unnamedDevice: () => i18n.t('network.deviceFallback'),
  unnamedFriend: () => i18n.t('network.friendFallback'),
  defaultSystemName: () => i18n.t('network.defaultSystemName'),
  async http(url, req, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {...req, signal: controller.signal});
      return {ok: res.ok, status: res.status, text: await res.text()};
    } catch (e) {
      if ((e as {name?: unknown} | null)?.name === 'AbortError') throw new Error('request timed out');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  },
  onForeground(fn) {
    AppState.addEventListener('change', s => {
      if (s === 'active') fn();
    });
  },
  waitForStorage: () => waitForProtectedData(),
  push: Platform.OS === 'ios'
    ? {
        env: __DEV__ ? 'sandbox' : 'prod',
        activityToken: () => getFriendsPushToken(),
        deviceToken: () => getAPNsDeviceToken(),
        endFriendsActivity: () => endFriendsActivity(),
      }
    : null,
};

export const adapters: NetworkAdapters = {storage, media, platform};
