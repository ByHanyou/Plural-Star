import type { TFunction } from 'i18next';
import { Member, FrontTier, FrontTimes, asRecord, isRecord, fmtDur, fmtTime, frontSessionStart, memberNames, translateMood } from '../utils';
import { logError } from '../utils/log';
import { FrontShare, FrontVisibility, MirrorFeature, PrivacyBucket, PrivacyScope } from './types';

export type ShareTier = Partial<FrontTier> & { memberIds: string[] };
export interface ShareableFront {
  primary: ShareTier;
  coFront: ShareTier;
  coConscious: ShareTier;
  startTime?: number;
  memberSince?: Record<string, number>;
}

const hasStartTime = (front: ShareableFront): front is ShareableFront & FrontTimes => typeof front.startTime === 'number';

export interface FrontShareDetails { mood?: boolean; location?: boolean; note?: boolean }

export const buildFrontShare = (front: ShareableFront | null | undefined, members: Member[], allowedIds?: Set<string> | null, facetAllowedIds?: Set<string> | null, customFrontAllowedIds?: Set<string> | null, details?: FrontShareDetails): FrontShare | null => {
  if (!front) return null;
  const shareMood = details?.mood !== false;
  const shareLocation = details?.location !== false;
  const shareNote = details?.note !== false;
  const facetIds = facetAllowedIds === undefined ? null : new Set(members.filter(m => m.isFacet && !m.isCustomFront).map(m => m.id));
  const customFrontIds = customFrontAllowedIds === undefined ? null : new Set(members.filter(m => m.isCustomFront).map(m => m.id));
  const permit = (ids: string[]) => ids.filter(id => {
    if (facetIds && facetIds.has(id)) return facetAllowedIds === null ? true : !!facetAllowedIds?.has(id);
    if (customFrontIds && customFrontIds.has(id)) return customFrontAllowedIds === null ? true : !!customFrontAllowedIds?.has(id);
    return allowedIds ? allowedIds.has(id) : true;
  });
  const primaryIds = permit(front.primary.memberIds);
  const coFrontIds = permit(front.coFront.memberIds);
  const coConsciousIds = permit(front.coConscious.memberIds);
  if (primaryIds.length === 0 && coFrontIds.length === 0 && coConsciousIds.length === 0) return null;

  const primary = memberNames(primaryIds, members);
  const coFront = memberNames(coFrontIds, members);
  const coConscious = memberNames(coConsciousIds, members);
  if (!primary && !coFront && !coConscious) return null;
  const shown = new Set([...primaryIds, ...coFrontIds, ...coConsciousIds].filter(id => !!members.find(m => m.id === id)?.name));

  return {
    fronters: [primary, coFront, coConscious].filter(Boolean).join(', '),
    primary: primary || undefined,
    coFront: coFront || undefined,
    coConscious: coConscious || undefined,
    mood: primary && shareMood ? front.primary.mood : undefined,
    location: primary && shareLocation ? front.primary.location : undefined,
    note: primary && shareNote ? front.primary.note : undefined,
    startTime: hasStartTime(front) ? frontSessionStart(front, id => shown.has(id)) : undefined,
  };
};

export const singletShareFront = (front: ShareableFront | null, selfMemberId: string | undefined): ShareableFront | null => {
  if (!selfMemberId || (front && [front.primary, front.coFront, front.coConscious].some(t => t.memberIds.length > 0))) return front;
  return { primary: { memberIds: [selfMemberId] }, coFront: { memberIds: [] }, coConscious: { memberIds: [] } };
};

const optText = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 ? s : undefined;
};

export const frontShareTierLines = (s: FrontShare, t: TFunction): string[] => {
  const lines: string[] = [];
  if (s.primary) lines.push(t('notification.primary', { names: s.primary }));
  if (s.coFront) lines.push(t('notification.coFront', { names: s.coFront }));
  if (s.coConscious) lines.push(t('notification.coConscious', { names: s.coConscious }));
  return lines;
};

export const frontShareDetailLines = (s: FrontShare, t: TFunction): string[] => {
  const lines: string[] = [];
  if (s.mood) lines.push(t('notification.mood', { mood: translateMood(s.mood, t) }));
  if (s.location) lines.push(t('notification.at', { location: s.location }));
  if (s.note) lines.push(t('notification.note', { note: s.note }));
  return lines;
};

export const frontShareLines = (s: FrontShare, t: TFunction): string[] => {
  const tiers = frontShareTierLines(s, t);
  const lines = [...(tiers.length > 0 ? tiers : [s.fronters]), ...frontShareDetailLines(s, t)];
  if (s.startTime) lines.push(`${t('notification.since', { time: fmtTime(s.startTime) })}  ·  ${fmtDur(s.startTime)}`);
  return lines;
};

export const gatewayFrontToShare = (entry: unknown, prev: FrontShare | null | undefined): FrontShare | null => {
  const e = asRecord(entry) ?? {};
  const primary = optText(e.primary);
  const coFront = optText(e.co_front);
  const coConscious = optText(e.co_conscious);
  const fronters = optText(e.fronters) || [primary, coFront, coConscious].filter(Boolean).join(', ');
  if (!fronters) return null;
  const samePeople = !!prev && prev.fronters === fronters;
  const start = typeof e.start_time === 'number' && e.start_time > 0 ? e.start_time : undefined;
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

export type ScopeFeature = MirrorFeature | 'customFields' | 'connections' | 'front' | 'facets' | 'customFronts';

export interface EffectiveScope {
  mode: 'all' | 'select' | 'none';
  ids: Set<string>;
}

export const parsePrivacyBuckets = (raw: string | null): PrivacyBucket[] => {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((b): b is PrivacyBucket => isRecord(b)) : [];
  } catch (e) {
    logError('network', e);
    return [];
  }
};

const bucketsFor = (buckets: PrivacyBucket[], peerId: string): PrivacyBucket[] =>
  buckets.filter(b => b && Array.isArray(b.friendPeerIds) && b.friendPeerIds.includes(peerId));

export const effectiveScope = (buckets: PrivacyBucket[], peerId: string, feature: ScopeFeature): EffectiveScope => {
  const mine = bucketsFor(buckets, peerId);
  const ids = new Set<string>();
  let all = false;
  let any = false;
  for (const b of mine) {
    const scope = b[feature];
    if (!scope || scope.mode === 'none') continue;
    if (scope.mode === 'all') {
      all = true;
      any = true;
      continue;
    }
    if (scope.mode === 'select') {
      for (const id of scope.ids || []) ids.add(id);
      if ((scope.ids || []).length > 0) any = true;
    }
  }
  if (all) return {mode: 'all', ids: new Set()};
  if (!any) return {mode: 'none', ids: new Set()};
  return {mode: 'select', ids};
};

export const allowedMemberIdsFor = (buckets: PrivacyBucket[], peerId: string): Set<string> | null => {
  if (bucketsFor(buckets, peerId).length === 0) return null;
  const scope = effectiveScope(buckets, peerId, 'members');
  if (scope.mode === 'all') return null;
  if (scope.mode === 'none') return new Set<string>();
  return scope.ids;
};

const allowedKindIdsFor = (buckets: PrivacyBucket[], peerId: string, kind: 'facets' | 'customFronts'): Set<string> | null => {
  const mine = bucketsFor(buckets, peerId);
  if (mine.length === 0) return null;
  const ids = new Set<string>();
  let all = false;
  for (const b of mine) {
    const scope = (b[kind] ?? b.members) as PrivacyScope | undefined;
    if (!scope || scope.mode === 'none') continue;
    if (scope.mode === 'all') { all = true; continue; }
    for (const id of scope.ids || []) ids.add(id);
  }
  if (all) return null;
  return ids;
};

export const allowedFacetIdsFor = (buckets: PrivacyBucket[], peerId: string): Set<string> | null =>
  allowedKindIdsFor(buckets, peerId, 'facets');

export const allowedCustomFrontIdsFor = (buckets: PrivacyBucket[], peerId: string): Set<string> | null =>
  allowedKindIdsFor(buckets, peerId, 'customFronts');

export const frontVisibilityFor = (buckets: PrivacyBucket[], peerId: string): FrontVisibility => {
  const mine = bucketsFor(buckets, peerId);
  if (mine.length === 0) return {show: true, mood: true, location: true, note: true};
  const v: FrontVisibility = {show: false, mood: false, location: false, note: false};
  for (const b of mine) {
    if (b.front && b.front.mode === 'none') continue;
    v.show = true;
    if (b.frontMood !== false) v.mood = true;
    if (b.frontLocation !== false) v.location = true;
    if (b.frontNote !== false) v.note = true;
  }
  return v;
};
