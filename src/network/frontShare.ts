// Build the front/status payload a friend shares over the network. This mirrors
// NotificationService.buildFrontContent so a friend's row shows the same content
// the on-device notification would (names resolved here; duration derived from
// startTime on the receiving side so it stays live).

import { Member } from '../utils';
import { FrontShare } from './types';

const getTierIds = (front: any, tier: string): string[] => {
  if (front?.[tier]?.memberIds && Array.isArray(front[tier].memberIds)) return front[tier].memberIds;
  if (tier === 'primary' && Array.isArray(front?.memberIds)) return front.memberIds;
  return [];
};

const getTierField = (front: any, tier: string, field: string): string | undefined => {
  if (front?.[tier]?.[field] !== undefined) return front[tier][field];
  if (tier === 'primary' && front?.[field] !== undefined) return front[field];
  return undefined;
};

const resolveNames = (ids: string[], members: Member[]): string =>
  ids.map(id => members.find(m => m.id === id)?.name).filter(Boolean).join(', ');

export const buildFrontShare = (front: any, members: Member[]): FrontShare | null => {
  if (!front) return null;
  const primaryIds = getTierIds(front, 'primary');
  const coFrontIds = getTierIds(front, 'coFront');
  const coConsciousIds = getTierIds(front, 'coConscious');
  if (primaryIds.length === 0 && coFrontIds.length === 0 && coConsciousIds.length === 0) return null;

  const primary = resolveNames(primaryIds, members);
  const coFront = resolveNames(coFrontIds, members);
  const coConscious = resolveNames(coConsciousIds, members);
  if (!primary && !coFront && !coConscious) return null;

  return {
    fronters: primary || coFront || coConscious,
    primary: primary || undefined,
    coFront: coFront || undefined,
    coConscious: coConscious || undefined,
    mood: getTierField(front, 'primary', 'mood'),
    location: getTierField(front, 'primary', 'location'),
    note: getTierField(front, 'primary', 'note'),
    startTime: typeof front.startTime === 'number' ? front.startTime : undefined,
  };
};
