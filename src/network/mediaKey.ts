export type MediaKey =
  | {kind: 'sysav'}
  | {kind: 'sysbn'}
  | {kind: 'av' | 'bn'; memberId: string}
  | {kind: 'cf'; memberId: string; fieldId: string}
  | {kind: 'chat'; channelId: string; msgId: string};

const MEDIA_KEY_PREFIX = 'ps:media:';
const CHAT_MEDIA_KEY_PREFIX = `${MEDIA_KEY_PREFIX}chat:`;
export const SYSTEM_AVATAR_MEDIA_KEY = `${MEDIA_KEY_PREFIX}sysav`;
export const SYSTEM_BANNER_MEDIA_KEY = `${MEDIA_KEY_PREFIX}sysbn`;

export const isMediaKey = (key: string): boolean => key.startsWith(MEDIA_KEY_PREFIX);
export const isChatMediaKey = (key: string): boolean => key.startsWith(CHAT_MEDIA_KEY_PREFIX);

export const memberMediaKey = (kind: 'av' | 'bn', memberId: string): string => `${MEDIA_KEY_PREFIX}${kind}:${memberId}`;
export const fieldMediaKey = (memberId: string, fieldId: string): string => `${MEDIA_KEY_PREFIX}cf:${memberId}:${fieldId}`;
export const chatMediaKey = (channelId: string, msgId: string): string => `${CHAT_MEDIA_KEY_PREFIX}${channelId}:${msgId}`;

export const parseMediaKey = (key: string): MediaKey | null => {
  if (key === SYSTEM_AVATAR_MEDIA_KEY) return {kind: 'sysav'};
  if (key === SYSTEM_BANNER_MEDIA_KEY) return {kind: 'sysbn'};
  if (!key.startsWith(MEDIA_KEY_PREFIX)) return null;
  const rest = key.slice(MEDIA_KEY_PREFIX.length);
  const chat = /^chat:([^:]+):(.+)$/.exec(rest);
  if (chat) return {kind: 'chat', channelId: chat[1], msgId: chat[2]};
  const cf = /^cf:(.+):([^:]+)$/.exec(rest);
  if (cf) return {kind: 'cf', memberId: cf[1], fieldId: cf[2]};
  const m = /^(av|bn):(.+)$/.exec(rest);
  if (m) return {kind: m[1] === 'av' ? 'av' : 'bn', memberId: m[2]};
  return null;
};
