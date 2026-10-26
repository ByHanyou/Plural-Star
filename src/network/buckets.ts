import type {TFunction} from 'i18next';
import {CustomFieldDef, JournalEntry, Member, MemberGroup, Relationship, RelationshipTypeDef, allRelationshipTypes, fmtTime, isCustomFrontMember, isFacetMember, isRosterMember, memberMatchesSearch, relTypeLabel, toggleId, uid} from '../utils';
import type {PrivacyBucket, PrivacyScope, PrivacyScopeMode} from './types';
import {effectiveScope} from './frontShare';

export type BucketFeature = 'front' | 'members' | 'groups' | 'journal' | 'history' | 'customFields' | 'medical' | 'connections' | 'systemProfile' | 'whiteboard' | 'planner' | 'facets' | 'customFronts';

export const BUCKET_ROWS: BucketFeature[] = ['front', 'members', 'facets', 'customFronts', 'groups', 'journal', 'history', 'customFields', 'connections', 'systemProfile', 'whiteboard', 'planner'];

export type Bucket = PrivacyBucket & {front: PrivacyScope; systemProfile: PrivacyScope; whiteboard: PrivacyScope; planner: PrivacyScope; facets: PrivacyScope; customFronts: PrivacyScope};

type ScopeKey = Exclude<BucketFeature, 'front'>;

const SCOPE_KEYS: ScopeKey[] = ['members', 'groups', 'journal', 'history', 'customFields', 'medical', 'connections', 'systemProfile', 'whiteboard', 'planner', 'facets', 'customFronts'];

const emptyScope = (): PrivacyScope => ({mode: 'none', ids: []});

const allScope = (): PrivacyScope => ({mode: 'all', ids: []});

const copyScope = (s: PrivacyScope): PrivacyScope => ({mode: s.mode, ids: [...(s.ids || [])]});

const scopesOf = (make: (k: ScopeKey) => PrivacyScope): Record<ScopeKey, PrivacyScope> => {
  const out = {} as Record<ScopeKey, PrivacyScope>;
  for (const k of SCOPE_KEYS) out[k] = make(k);
  return out;
};

export const newBucket = (name = ''): Bucket => ({
  id: uid(),
  name,
  front: allScope(),
  ...scopesOf(emptyScope),
  friendPeerIds: [],
  createdAt: Date.now(),
});

const normalizeBucket = (b: PrivacyBucket): Bucket => ({
  ...b,
  name: typeof b.name === 'string' ? b.name : '',
  front: b.front || allScope(),
  ...scopesOf(k => b[k] || ((k === 'facets' || k === 'customFronts') && b.members ? copyScope(b.members) : emptyScope())),
  friendPeerIds: Array.isArray(b.friendPeerIds) ? b.friendPeerIds : [],
});

export const normalizeBuckets = (saved: unknown): Bucket[] =>
  Array.isArray(saved) ? saved.filter((b): b is PrivacyBucket => !!b && typeof b === 'object').map(normalizeBucket) : [];

export const copyBucket = (b: Bucket, name: string): Bucket => ({
  id: uid(),
  name,
  front: {mode: b.front.mode, ids: []},
  frontMood: b.frontMood,
  frontLocation: b.frontLocation,
  frontNote: b.frontNote,
  ...scopesOf(k => copyScope(b[k])),
  friendPeerIds: [],
  createdAt: Date.now(),
});

export const splitKinds = (b: Bucket, members: Member[]): Bucket => {
  const facetIds = new Set(members.filter(isFacetMember).map(m => m.id));
  const cfIds = new Set(members.filter(isCustomFrontMember).map(m => m.id));
  return {
    ...b,
    members: {...b.members, ids: b.members.ids.filter(id => !facetIds.has(id) && !cfIds.has(id))},
    facets: {...b.facets, ids: b.facets.ids.filter(id => facetIds.has(id))},
    customFronts: {...b.customFronts, ids: b.customFronts.ids.filter(id => cfIds.has(id))},
  };
};

export const effectiveShare = (buckets: Bucket[], peerId: string, f: BucketFeature): PrivacyScope => {
  if (!buckets.some(b => (b.friendPeerIds || []).includes(peerId))) return f === 'front' || f === 'facets' || f === 'customFronts' ? allScope() : emptyScope();
  const s = effectiveScope(buckets, peerId, f);
  return {mode: s.mode, ids: [...s.ids]};
};

const FEATURE_LABEL_KEY: Record<BucketFeature, string> = {
  front: 'tabs.front',
  members: 'tabs.members',
  facets: 'members.facets',
  customFronts: 'members.customFronts',
  groups: 'members.fieldGroups',
  journal: 'tabs.journal',
  history: 'tabs.history',
  customFields: 'customFields.title',
  medical: 'medical.title',
  connections: 'systemMap.title',
  systemProfile: 'systemProfile.title',
  whiteboard: 'whiteboard.title',
  planner: 'planner.title',
};

export const featureLabel = (t: TFunction, f: BucketFeature): string => t(FEATURE_LABEL_KEY[f]);

export const scopeSummary = (t: TFunction, s: PrivacyScope, short = false): string =>
  s.mode === 'all' ? t('network.scopeAll') : s.mode === 'none' ? t('network.scopeNone') : short ? `${s.ids.length}` : t('network.scopeCount', {count: s.ids.length});

const ALL_OR_NONE: BucketFeature[] = ['front', 'history', 'systemProfile', 'whiteboard', 'planner'];

export const scopeModesFor = (f: BucketFeature): PrivacyScopeMode[] => ALL_OR_NONE.includes(f) ? ['all', 'none'] : ['all', 'select', 'none'];

export const FRONT_DETAILS = [['frontMood', 'modal.mood'], ['frontLocation', 'modal.location'], ['frontNote', 'modal.note']] as const;

export const withScopeMode = (b: Bucket, f: BucketFeature, mode: PrivacyScopeMode): Bucket => ({...b, [f]: {...b[f], mode}});

export const withFriendToggled = (b: Bucket, peerId: string): Bucket => ({...b, friendPeerIds: toggleId(b.friendPeerIds || [], peerId)});

export type BucketPickItem = {id: string; name: string};

export interface BucketPickSource {
  members: Member[];
  groups: MemberGroup[];
  journal: JournalEntry[];
  fieldDefs: CustomFieldDef[];
  relationships: Relationship[];
  relTypes: RelationshipTypeDef[];
}

export const bucketPickItems = (f: BucketFeature, src: BucketPickSource, search: string, t: TFunction): BucketPickItem[] => {
  const q = search.trim().toLowerCase();
  const matches = (name: string) => !q || name.toLowerCase().includes(q);
  const byId = new Map(src.members.map(m => [m.id, m]));
  const memberName = (id: string) => byId.get(id)?.name || '?';
  const isPrivateId = (id: string) => !!byId.get(id)?.private;
  const pickMembers = (keep: (m: Member) => boolean) => src.members
    .filter(m => keep(m) && !m.private && memberMatchesSearch(m, search))
    .map(m => ({id: m.id, name: m.name}));
  switch (f) {
    case 'groups':
      return src.groups.map(g => ({id: g.id, name: g.name}));
    case 'journal':
      return src.journal
        .filter(e => matches(e.title || ''))
        .map(e => ({id: e.id, name: `${e.password ? '🔒 ' : ''}${e.title || fmtTime(e.timestamp)}`}));
    case 'customFields':
      return [...src.fieldDefs]
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map(d => ({id: d.id, name: d.name}))
        .filter(x => matches(x.name || ''));
    case 'connections': {
      const types = allRelationshipTypes(src.relTypes);
      return src.relationships
        .filter(r => !isPrivateId(r.fromId) && !isPrivateId(r.toId))
        .map(r => {
          const rt = types.find(x => x.id === r.typeId);
          return {id: r.id, name: `${memberName(r.fromId)} ${rt?.directional ? '→' : '↔'} ${memberName(r.toId)}${rt ? `  ·  ${relTypeLabel(rt, t)}` : ''}`};
        })
        .filter(x => matches(x.name));
    }
    case 'facets':
      return pickMembers(isFacetMember);
    case 'customFronts':
      return pickMembers(isCustomFrontMember);
    default:
      return pickMembers(isRosterMember);
  }
};

export const allPicked = (b: Bucket, f: BucketFeature, items: BucketPickItem[]): boolean =>
  items.length > 0 && items.every(i => b[f].ids.includes(i.id));

export const withPickToggled = (b: Bucket, f: BucketFeature, id: string): Bucket => ({...b, [f]: {...b[f], ids: toggleId(b[f].ids, id)}});

export const withAllPickedToggled = (b: Bucket, f: BucketFeature, items: BucketPickItem[]): Bucket => {
  const listed = new Set(items.map(i => i.id));
  const ids = allPicked(b, f, items) ? b[f].ids.filter(x => !listed.has(x)) : [...new Set([...b[f].ids, ...listed])];
  return {...b, [f]: {...b[f], ids}};
};
