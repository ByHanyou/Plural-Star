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

export const buildFrontShare = (front: any, members: Member[], allowedIds?: Set<string> | null, facetAllowedIds?: Set<string> | null, customFrontAllowedIds?: Set<string> | null): FrontShare | null => {
  if (!front) return null;
  const facetIds = facetAllowedIds === undefined ? null : new Set(members.filter(m => m.isFacet && !m.isCustomFront).map(m => m.id));
  const customFrontIds = customFrontAllowedIds === undefined ? null : new Set(members.filter(m => m.isCustomFront).map(m => m.id));
  const permit = (ids: string[]) => ids.filter(id => {
    if (facetIds && facetIds.has(id)) return facetAllowedIds === null ? true : !!facetAllowedIds?.has(id);
    if (customFrontIds && customFrontIds.has(id)) return customFrontAllowedIds === null ? true : !!customFrontAllowedIds?.has(id);
    return allowedIds ? allowedIds.has(id) : true;
  });
  const primaryIds = permit(getTierIds(front, 'primary'));
  const coFrontIds = permit(getTierIds(front, 'coFront'));
  const coConsciousIds = permit(getTierIds(front, 'coConscious'));
  if (primaryIds.length === 0 && coFrontIds.length === 0 && coConsciousIds.length === 0) return null;

  const primary = resolveNames(primaryIds, members);
  const coFront = resolveNames(coFrontIds, members);
  const coConscious = resolveNames(coConsciousIds, members);
  if (!primary && !coFront && !coConscious) return null;

  return {
    fronters: [primary, coFront, coConscious].filter(Boolean).join(', '),
    primary: primary || undefined,
    coFront: coFront || undefined,
    coConscious: coConscious || undefined,
    mood: primary ? getTierField(front, 'primary', 'mood') : undefined,
    location: primary ? getTierField(front, 'primary', 'location') : undefined,
    note: primary ? getTierField(front, 'primary', 'note') : undefined,
    startTime: typeof front.startTime === 'number' ? front.startTime : undefined,
  };
};

export const gatewayFrontToShare = (entry: any, prev: FrontShare | null | undefined): FrontShare | null => {
  const str = (v: any): string | undefined => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s.length > 0 ? s : undefined;
  };
  const primary = str(entry?.primary);
  const coFront = str(entry?.co_front);
  const coConscious = str(entry?.co_conscious);
  const fronters = str(entry?.fronters) || [primary, coFront, coConscious].filter(Boolean).join(', ');
  if (!fronters) return null;
  const samePeople = !!prev && prev.fronters === fronters;
  const start = typeof entry?.start_time === 'number' && entry.start_time > 0 ? entry.start_time : undefined;
  return {
    fronters,
    primary,
    coFront,
    coConscious,
    mood: samePeople ? prev?.mood : undefined,
    location: samePeople ? prev?.location : undefined,
    note: samePeople ? prev?.note : undefined,
    startTime: start ?? (samePeople ? prev?.startTime : undefined),
  };
};
