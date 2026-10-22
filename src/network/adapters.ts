import type { MirrorFeature } from './types';

export interface StorageAdapter {
  getRaw(key: string): Promise<string | null>;
  getMany(keys: string[]): Promise<Record<string, string | null>>;
  setRaw(key: string, raw: string): Promise<void>;
  setMany(entries: Record<string, string>): Promise<void>;
  remove(key: string): Promise<void>;
  removeMany(keys: string[]): Promise<void>;
  get<T>(key: string, fallback: T | null): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  allKeys(): Promise<string[]>;
}

export type MediaImageKind = 'avatar' | 'banner';

export interface MediaAdapter {
  localPrefix: 'file://' | 'data:';
  isSource(v: unknown): v is string;
  signature(src: string): string;
  thumb(src: string, maxDim?: number): Promise<string | null>;
  gifHash(src: unknown): Promise<string | null>;
  gifBase64(src: string): Promise<string | null>;
  gifsPresent(peerId: string, feature: MirrorFeature, wants: Map<string, string>): Promise<Set<string>>;
  gifUris(peerId: string, feature: MirrorFeature, wants: Map<string, string>): Promise<Record<string, string>>;
  pruneGifs(peerId: string, feature: MirrorFeature, wants: Map<string, string>): Promise<void>;
  saveGif(peerId: string, feature: MirrorFeature, id: string, h: string, b64: string): Promise<boolean>;
  clearGifs(peerId: string): Promise<void>;
  ref(val: string, file?: boolean): Promise<string | null>;
  materialize(value: string): Promise<string | null>;
  readDataUri(ref: string): Promise<string | null>;
  saveMemberImage(kind: MediaImageKind, memberId: string, dataUri: string): Promise<string>;
  saveSystemImage(kind: MediaImageKind, dataUri: string): Promise<string>;
  saveFieldImage(memberId: string, fieldId: string, dataUri: string): Promise<string>;
  saveChatMedia(msgId: string, dataUri: string): Promise<string>;
  deleteChatMedia(msgId: string): Promise<void>;
}

export interface HttpRequest {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  text: string;
}

export interface PushAdapter {
  env: 'sandbox' | 'prod';
  activityToken(): Promise<string | null>;
  deviceToken(): Promise<string | null>;
  endFriendsActivity(): Promise<void>;
}

export interface PlatformAdapter {
  deviceLabel(): string;
  unnamedDevice(): string;
  unnamedFriend(): string;
  defaultSystemName(): string;
  http(url: string, req: HttpRequest, timeoutMs: number): Promise<HttpResponse>;
  onForeground(fn: () => void): void;
  waitForStorage(): Promise<boolean>;
  push: PushAdapter | null;
}

export interface NetworkAdapters {
  storage: StorageAdapter;
  media: MediaAdapter;
  platform: PlatformAdapter;
}
