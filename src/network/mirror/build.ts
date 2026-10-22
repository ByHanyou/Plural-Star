import { KEYS } from '../../storage';
import { allRelationshipTypes, isRosterMember, nameCompare, pushTo } from '../../utils';
import type {
  CustomFieldDef,
  HistoryEntry,
  JournalEntry,
  Member,
  MemberGroup,
  PlannerAppointment,
  PlannerReminder,
  Relationship,
  RelationshipTypeDef,
  SystemInfo,
  WhiteboardStroke,
} from '../../utils';
import { CLOUD_MEDIA_MARK } from '../../cloud/cloudKeys';
import { allowedCustomFrontIdsFor, allowedFacetIdsFor, effectiveScope, EffectiveScope, frontVisibilityFor } from '../frontShare';
import {
  MirrorFeature,
  MirrorGroupsPayload,
  MirrorMember,
  MirrorPayload,
  MirrorPlannerPayload,
  MirrorSystemProfile,
  MIRROR_SYSTEM_AVATAR_ID,
  MIRROR_SYSTEM_BANNER_ID,
  PrivacyBucket,
} from '../types';

export type MirrorServedFeature = Exclude<MirrorFeature, 'medical'>;

export const isServedFeature = (f: MirrorFeature): f is MirrorServedFeature => f !== 'medical';

export interface MirrorMediaItem {
  id: string;
  src: string;
  maxDim?: number;
}

export type MirrorGifSources = Map<string, {h: string; src: string}>;

export interface MirrorBuild {
  payload: string;
  media: MirrorMediaItem[];
  gifSrc: MirrorGifSources;
}

export interface MirrorSource {
  read(key: string): Promise<string | null>;
  gifHash(src: unknown): Promise<string | null>;
  isSource(v: unknown): v is string;
}

type MirrorPart<T extends MirrorPayload> = {payload: T; media: MirrorMediaItem[]; gifSrc: MirrorGifSources};

const parseArray = <T>(raw: string | null): T[] => {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
};

const parseArrayStrict = <T>(raw: string | null): T[] => {
  const parsed: unknown = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? (parsed as T[]) : [];
};

const parseObject = <T>(raw: string | null): Partial<T> => {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Partial<T>) : {};
  } catch {
    return {};
  }
};

const none = (): MirrorGifSources => new Map();

const buildWhiteboard = async (src: MirrorSource): Promise<MirrorPart<WhiteboardStroke[]>> => ({
  payload: parseArray<WhiteboardStroke>(await src.read(KEYS.whiteboard)),
  media: [],
  gifSrc: none(),
});

const buildPlanner = async (src: MirrorSource): Promise<MirrorPart<MirrorPlannerPayload>> => {
  const parsed = parseObject<{appointments: unknown; reminders: unknown}>(await src.read(KEYS.planner));
  const appointments = Array.isArray(parsed.appointments) ? (parsed.appointments as (Partial<PlannerAppointment> | null)[]) : [];
  const reminders = Array.isArray(parsed.reminders) ? (parsed.reminders as (Partial<PlannerReminder> | null)[]) : [];
  return {
    payload: {
      appointments: appointments.map(a => ({
        id: String(a?.id || ''),
        title: String(a?.title || ''),
        time: Number(a?.time) || 0,
        location: a?.location ? String(a.location) : undefined,
        notes: a?.notes ? String(a.notes) : undefined,
        repeat: a?.repeat ? String(a.repeat) : undefined,
        color: a?.color ? String(a.color) : undefined,
      })),
      reminders: reminders.map(r => ({
        id: String(r?.id || ''),
        title: String(r?.title || ''),
        times: Array.isArray(r?.times) ? r.times.map(x => String(x)) : [],
        enabled: r?.enabled !== false,
        notes: r?.notes ? String(r.notes) : undefined,
        repeat: r?.repeat ? String(r.repeat) : undefined,
      })),
    },
    media: [],
    gifSrc: none(),
  };
};

const buildSystemProfile = async (src: MirrorSource): Promise<MirrorPart<MirrorSystemProfile>> => {
  const sys = parseObject<SystemInfo>(await src.read(KEYS.system));
  const avatar = typeof sys.avatar === 'string' && sys.avatar ? sys.avatar : undefined;
  const banner = typeof sys.banner === 'string' && sys.banner ? sys.banner : undefined;
  const bannerGif = banner ? await src.gifHash(banner) : null;
  const gifSrc = none();
  if (banner && bannerGif) gifSrc.set(MIRROR_SYSTEM_BANNER_ID, {h: bannerGif, src: banner});
  const media: MirrorMediaItem[] = [];
  if (avatar) media.push({id: MIRROR_SYSTEM_AVATAR_ID, src: avatar, maxDim: 256});
  if (banner) media.push({id: MIRROR_SYSTEM_BANNER_ID, src: banner, maxDim: 512});
  return {
    payload: {
      name: String(sys.name || ''),
      description: sys.description ? String(sys.description) : undefined,
      hasAvatar: !!avatar || undefined,
      hasBanner: !!banner || undefined,
      bannerGif: bannerGif || undefined,
    },
    media,
    gifSrc,
  };
};

const isMirrorMember = (m: Member | null): m is Member => !!m && isRosterMember(m) && !m.private;

type Connection = NonNullable<MirrorMember['connections']>[number];
type CustomField = NonNullable<MirrorMember['customFields']>[number];

const buildMembers = async (src: MirrorSource, buckets: PrivacyBucket[], peerId: string, scope: EffectiveScope): Promise<MirrorPart<MirrorMember[]>> => {
  const list = parseArrayStrict<Member | null>(await src.read(KEYS.members));
  const shared = list
    .filter((m): m is Member => isMirrorMember(m) && (scope.mode === 'all' || scope.ids.has(m.id)))
    .sort((a, b) => ((a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)) || nameCompare(a.name, b.name));
  const cfScope = effectiveScope(buckets, peerId, 'customFields');
  let grantedDefs: CustomFieldDef[] = [];
  if (cfScope.mode !== 'none') {
    const defs = parseArray<CustomFieldDef | null>(await src.read(KEYS.customFieldDefs));
    grantedDefs = defs
      .filter((d): d is CustomFieldDef => !!d && (cfScope.mode === 'all' || cfScope.ids.has(d.id)))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }
  const sharedIdSet = new Set(shared.map(m => m.id));
  const nameById = new Map(shared.map(m => [m.id, String(m.name || '')]));
  const connScope = effectiveScope(buckets, peerId, 'connections');
  let sharedRels: Relationship[] = [];
  const relTypeById = new Map<string, RelationshipTypeDef>();
  if (connScope.mode !== 'none') {
    const rels = parseArray<Relationship | null>(await src.read(KEYS.relationships));
    const types = parseArray<RelationshipTypeDef>(await src.read(KEYS.relationshipTypes));
    for (const td of allRelationshipTypes(types)) {
      if (td && td.id) relTypeById.set(td.id, td);
    }
    sharedRels = rels.filter(
      (r): r is Relationship => !!r && sharedIdSet.has(r.fromId) && sharedIdSet.has(r.toId) && (connScope.mode === 'all' || connScope.ids.has(r.id)),
    );
  }
  const connectionsOf = (memberId: string): MirrorMember['connections'] => {
    const rows = sharedRels
      .filter(r => r.fromId === memberId || r.toId === memberId)
      .map((r): Connection | null => {
        const td = relTypeById.get(r.typeId);
        if (!td) return null;
        const otherId = r.fromId === memberId ? r.toId : r.fromId;
        const inverseSide = r.fromId === memberId;
        const plain = !!td.preset && !td.overridden;
        const useInverse = inverseSide && !!td.directional;
        const labelKey = plain ? `relType.${td.id}${useInverse ? 'Inverse' : ''}` : undefined;
        const label = plain
          ? ''
          : (useInverse ? (td.inverseName || td.name || '') : (td.name || ''));
        return {
          id: r.id,
          otherId,
          otherName: nameById.get(otherId) || '',
          label,
          labelKey,
          color: td.color || undefined,
          note: r.note || undefined,
        };
      })
      .filter((c): c is Connection => !!c);
    return rows.length > 0 ? rows : undefined;
  };
  const probed = new Map<string, string | null>();
  const probe = async (s: unknown): Promise<void> => {
    if (typeof s !== 'string' || !s || probed.has(s)) return;
    probed.set(s, await src.gifHash(s));
  };
  for (const m of shared) {
    await probe(m.banner);
    for (const d of grantedDefs) {
      if (d.type !== 'image') continue;
      const v = (m.customFields || []).find(x => x && x.fieldId === d.id);
      if (v) await probe(v.value);
    }
  }
  const gifSrc = none();
  const cfImages: MirrorMediaItem[] = [];
  const slim: MirrorMember[] = shared.map(m => {
    const cfs = grantedDefs
      .map((d): CustomField | null => {
        const v = (m.customFields || []).find(x => x && x.fieldId === d.id);
        if (!v || v.value === null || v.value === '') return null;
        if (d.type === 'image') {
          if (typeof v.value !== 'string' || !v.value || v.value === CLOUD_MEDIA_MARK) return null;
          cfImages.push({id: `${m.id}#cf:${d.id}`, src: v.value, maxDim: 512});
          const gif = probed.get(v.value) || undefined;
          if (gif) gifSrc.set(`${m.id}#cf:${d.id}`, {h: gif, src: v.value});
          return {name: d.name, value: '🖼', type: d.type, fieldId: d.id, gif};
        }
        return {name: d.name, value: v.value, type: d.type, markdown: d.markdown || undefined, fieldId: d.id};
      })
      .filter((c): c is CustomField => !!c);
    const banner = src.isSource(m.banner) ? m.banner : undefined;
    const bannerGif = banner ? probed.get(banner) || undefined : undefined;
    if (banner && bannerGif) gifSrc.set(`${m.id}#banner`, {h: bannerGif, src: banner});
    return {
      id: m.id,
      name: m.name || '',
      pronouns: m.pronouns || undefined,
      role: m.role || undefined,
      color: m.color || undefined,
      description: m.description || undefined,
      archived: m.archived || undefined,
      hasAvatar: src.isSource(m.avatar) ? true : undefined,
      hasBanner: banner !== undefined,
      bannerGif,
      customFields: cfs.length > 0 ? cfs : undefined,
      connections: connectionsOf(m.id),
    };
  });
  const avatars: MirrorMediaItem[] = [];
  const banners: MirrorMediaItem[] = [];
  for (const m of shared) {
    if (src.isSource(m.avatar)) avatars.push({id: m.id, src: m.avatar});
    if (src.isSource(m.banner)) banners.push({id: `${m.id}#banner`, src: m.banner, maxDim: 720});
  }
  return {payload: slim, media: [...avatars, ...cfImages, ...banners], gifSrc};
};

const buildGroups = async (src: MirrorSource, buckets: PrivacyBucket[], peerId: string, scope: EffectiveScope): Promise<MirrorPart<MirrorGroupsPayload>> => {
  const allGroups = parseArray<MemberGroup | null>(await src.read(KEYS.groups));
  const allMembers = parseArray<Member | null>(await src.read(KEYS.members));
  const sharedGroups = allGroups.filter((g): g is MemberGroup => !!g && (scope.mode === 'all' || scope.ids.has(g.id)));
  const sharedGroupIds = new Set(sharedGroups.map(g => g.id));
  const mScope = effectiveScope(buckets, peerId, 'members');
  const sharedMembers = allMembers.filter((m): m is Member => isMirrorMember(m) && (mScope.mode === 'all' || mScope.ids.has(m.id)));
  const byGroup = new Map<string, {id: string; name: string}[]>();
  for (const m of sharedMembers) {
    const gids = (m.groupIds || []).filter(gid => sharedGroupIds.has(gid));
    for (const gid of gids.length === 0 ? [''] : gids) pushTo(byGroup, gid, {id: m.id, name: m.name || ''});
  }
  const membership = Object.fromEntries(byGroup);
  const groups = sharedGroups.map(g => ({
    id: g.id,
    name: g.name || '',
    color: g.color || undefined,
    kind: g.kind || undefined,
    parentId: g.parentId || undefined,
    sortOrder: g.sortOrder ?? undefined,
  }));
  return {payload: {groups, membership}, media: [], gifSrc: none()};
};

const buildHistory = async (src: MirrorSource, buckets: PrivacyBucket[], peerId: string): Promise<MirrorPart<HistoryEntry[]>> => {
  const list = parseArray<HistoryEntry | null>(await src.read(KEYS.history));
  const allMembers = parseArray<Member | null>(await src.read(KEYS.members));
  const mScope = effectiveScope(buckets, peerId, 'members');
  const facetIds = allowedFacetIdsFor(buckets, peerId);
  const customFrontIds = allowedCustomFrontIdsFor(buckets, peerId);
  const allowedBy = (m: Member): boolean => {
    if (m.isCustomFront) return customFrontIds === null || customFrontIds.has(m.id);
    if (m.isFacet) return facetIds === null || facetIds.has(m.id);
    return mScope.mode === 'all' || mScope.ids.has(m.id);
  };
  const visibleIds = new Set(
    allMembers
      .filter((m): m is Member => !!m && !m.deleted && !m.private && allowedBy(m))
      .map(m => m.id),
  );
  const keep = (ids?: string[]) => (ids || []).filter(id => visibleIds.has(id));
  const vis = frontVisibilityFor(buckets, peerId);
  const events = (!vis.show ? [] : list)
    .map((ev): HistoryEntry | null => {
      if (!ev) return null;
      const memberIds = keep(ev.memberIds);
      const coFrontIds = keep(ev.coFrontIds);
      const coConsciousIds = keep(ev.coConsciousIds);
      if (memberIds.length === 0 && coFrontIds.length === 0 && coConsciousIds.length === 0) return null;
      const out: HistoryEntry = {
        ...ev,
        memberIds,
        coFrontIds: coFrontIds.length > 0 ? coFrontIds : undefined,
        coConsciousIds: coConsciousIds.length > 0 ? coConsciousIds : undefined,
      };
      if (memberIds.length === 0) { out.note = ''; delete out.mood; delete out.location; delete out.energyLevel; }
      if (coFrontIds.length === 0) { delete out.coFrontMood; delete out.coFrontNote; delete out.coFrontEnergy; delete out.coFrontLocation; }
      if (coConsciousIds.length === 0) { delete out.coConsciousMood; delete out.coConsciousNote; delete out.coConsciousEnergy; delete out.coConsciousLocation; }
      if (!vis.mood) { delete out.mood; delete out.energyLevel; delete out.coFrontMood; delete out.coFrontEnergy; delete out.coConsciousMood; delete out.coConsciousEnergy; }
      if (!vis.location) { delete out.location; delete out.coFrontLocation; delete out.coConsciousLocation; }
      if (!vis.note) { out.note = ''; delete out.coFrontNote; delete out.coConsciousNote; }
      return out;
    })
    .filter((ev): ev is HistoryEntry => !!ev);
  return {payload: events, media: [], gifSrc: none()};
};

const buildJournal = async (src: MirrorSource, scope: EffectiveScope): Promise<MirrorPart<JournalEntry[]>> => {
  const list = parseArrayStrict<JournalEntry | null>(await src.read(KEYS.journal));
  const allMembers = parseArray<Member | null>(await src.read(KEYS.members));
  const privateIds = new Set(allMembers.filter((m): m is Member => !!m && !!m.private).map(m => m.id));
  const shared = list
    .filter((e): e is JournalEntry => !!e && (scope.mode === 'all' || scope.ids.has(e.id)))
    .filter(e => !(Array.isArray(e.authorIds) && e.authorIds.some(id => privateIds.has(id))));
  return {payload: shared, media: [], gifSrc: none()};
};

export const buildMirror = async (
  src: MirrorSource,
  feature: MirrorServedFeature,
  buckets: PrivacyBucket[],
  peerId: string,
  scope: EffectiveScope,
): Promise<MirrorBuild> => {
  const part = feature === 'whiteboard' ? await buildWhiteboard(src)
    : feature === 'planner' ? await buildPlanner(src)
    : feature === 'systemProfile' ? await buildSystemProfile(src)
    : feature === 'members' ? await buildMembers(src, buckets, peerId, scope)
    : feature === 'groups' ? await buildGroups(src, buckets, peerId, scope)
    : feature === 'history' ? await buildHistory(src, buckets, peerId)
    : await buildJournal(src, scope);
  return {payload: JSON.stringify(part.payload), media: part.media, gifSrc: part.gifSrc};
};
