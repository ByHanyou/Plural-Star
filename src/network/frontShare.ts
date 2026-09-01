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

/**
 * `allowedIds` is the recipient's members scope: null means they may see every
 * member, a Set means ONLY those ids. Privacy buckets used to govern mirrors
 * alone, so a friend scoped to a handful of members was still told every
 * fronter's name by the front broadcast and by the push that rides it. A
 * recipient who may see none of the current fronters gets null — nothing at
 * all — rather than a redacted shell, and mood/location/note travel with the
 * primary tier, so they go only to someone allowed to see a primary fronter.
 */
export const buildFrontShare = (front: any, members: Member[], allowedIds?: Set<string> | null, facetAllowedIds?: Set<string> | null): FrontShare | null => {
  if (!front) return null;
  // Facets can carry their OWN scope ("share all my main alters but not the
  // fragments"): when `facetAllowedIds` is given, facet fronters answer to it
  // and everyone else answers to `allowedIds`. Omitted (undefined), facets
  // follow `allowedIds` exactly as they always did.
  const facetIds = facetAllowedIds === undefined ? null : new Set(members.filter(m => m.isFacet && !m.isCustomFront).map(m => m.id));
  const permit = (ids: string[]) => ids.filter(id => {
    if (facetIds && facetIds.has(id)) return facetAllowedIds === null ? true : !!facetAllowedIds?.has(id);
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

/**
 * Rebuild a share from the gateway's cached copy of a friend's announce.
 *
 * The cache carries names and the front's start time and nothing else: mood,
 * location and note are never announced, because that lane is one payload fanned
 * to every watcher. So when the names have changed we must DROP the mood we were
 * holding rather than show it under a different fronter, and when the names are
 * identical we keep it, since it still belongs to the same person.
 */
export const gatewayFrontToShare = (entry: any, prev: FrontShare | null | undefined): FrontShare | null => {
  const str = (v: any): string | undefined => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s.length > 0 ? s : undefined;
  };
  const primary = str(entry?.primary);
  const coFront = str(entry?.co_front);
  const coConscious = str(entry?.co_conscious);
  const fronters = str(entry?.fronters) || [primary, coFront, coConscious].filter(Boolean).join(', ');
  // No names is real news, not a gap: the friend cleared their front, or the
  // buckets leave us nothing to see. Either way we stop showing the old one.
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
