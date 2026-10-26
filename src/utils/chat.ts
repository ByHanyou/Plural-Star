import type {ChatCategory, ChatChannel, ChatMessage} from '../model/types';
import {nameCompare} from './intl';

const byOrderThenAge = <T extends {sortOrder?: number; createdAt?: number; name?: string}>(a: T, b: T): number => {
  const ao = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
  const bo = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  const ac = typeof a.createdAt === 'number' ? a.createdAt : 0;
  const bc = typeof b.createdAt === 'number' ? b.createdAt : 0;
  if (ac !== bc) return ac - bc;
  return nameCompare(a.name, b.name);
};

export const CHAT_CHANNEL_LIMIT = 100;

export const sortChatCategories = (cats: ChatCategory[]): ChatCategory[] =>
  [...(cats || [])].sort(byOrderThenAge);

export const chatChannelsIn = (
  channels: ChatChannel[],
  categoryId: string | null | undefined,
  categories: ChatCategory[],
): ChatChannel[] => {
  const known = new Set((categories || []).map(c => c.id));
  return [...(channels || [])]
    .filter(c => {
      const own = c.categoryId && known.has(c.categoryId) ? c.categoryId : null;
      return own === (categoryId || null);
    })
    .sort(byOrderThenAge);
};

export const moveChannelToCategory = (channels: ChatChannel[], categories: ChatCategory[], channelId: string, categoryId: string | null): ChatChannel[] => {
  const tail = chatChannelsIn(channels.filter(c => !c.archived), categoryId, categories).filter(c => c.id !== channelId).length;
  return channels.map(c => (c.id === channelId ? {...c, categoryId: categoryId || undefined, sortOrder: tail} : c));
};

export const releaseCategoryChannels = (channels: ChatChannel[], categories: ChatCategory[], categoryId: string): ChatChannel[] => {
  let next = chatChannelsIn(channels.filter(c => !c.archived), null, categories).length;
  return channels.map(c => (c.categoryId === categoryId ? {...c, categoryId: undefined, sortOrder: next++} : c));
};

export const toggleReaction = (msg: ChatMessage, emoji: string, memberId: string): ChatMessage => {
  const reactions = {...(msg.reactions || {})};
  const users = reactions[emoji] || [];
  if (users.includes(memberId)) {
    reactions[emoji] = users.filter(u => u !== memberId);
    if (reactions[emoji].length === 0) delete reactions[emoji];
  } else {
    reactions[emoji] = [...users, memberId];
  }
  return {...msg, reactions};
};

export const DEFAULT_CHANNELS: {name: string; key: string}[] = [
  {name: 'General', key: 'chat.defaultGeneral'},
  {name: 'Venting', key: 'chat.defaultVenting'},
  {name: 'Planning', key: 'chat.defaultPlanning'},
];
