import { CustomFieldDef, JournalEntry, Member, MemberGroup, asCustomFieldType, pushTo } from '../../utils';
import { MirrorAppointment, MirrorGroup, MirrorGroupsPayload, MirrorMember, MirrorPayload } from '../types';
import { mirrorGroupsOf } from './payload';

export const NO_MIRROR_GROUPS: MirrorGroupsPayload = { groups: [], membership: {} };

export const mirrorToMember = (mm: MirrorMember, media: ReadonlyMap<string, string>, groupIds: string[] = []): Member => ({
  id: mm.id,
  name: mm.name,
  pronouns: mm.pronouns || '',
  role: mm.role || '',
  color: mm.color || '',
  description: mm.description || '',
  archived: mm.archived,
  avatar: media.get(mm.id),
  banner: media.get(`${mm.id}#banner`),
  groupIds,
  customFields: (mm.customFields || []).map((cf, i) => ({
    fieldId: cf.fieldId || `mirror-cf-${i}`,
    value: cf.type === 'image'
      ? (media.get(`${mm.id}#cf:${cf.fieldId || ''}`) ?? null)
      : cf.value,
  })),
});

export const mirrorFieldDefs = (mm: MirrorMember): CustomFieldDef[] =>
  (mm.customFields || []).map((cf, i) => ({
    id: cf.fieldId || `mirror-cf-${i}`,
    name: cf.name,
    type: asCustomFieldType(cf.type),
    markdown: cf.markdown,
    sortOrder: i,
  }));

export const groupsDataOf = (data: MirrorPayload | null | undefined): MirrorGroupsPayload | null => {
  const d = mirrorGroupsOf(data);
  if (!d) return null;
  return { groups: Array.isArray(d.groups) ? d.groups : [], membership: d.membership && typeof d.membership === 'object' ? d.membership : {} };
};

export const toBrowserGroups = (groups: MirrorGroup[]): MemberGroup[] => {
  const ids = new Set(groups.map(x => x.id));
  return groups.map(g => ({
    id: g.id,
    name: g.name,
    color: g.color,
    kind: g.kind === 'subsystem' ? 'subsystem' : 'group',
    parentId: g.parentId && ids.has(g.parentId) ? g.parentId : undefined,
    sortOrder: g.sortOrder,
  }));
};

export const toBrowserMembers = (data: MirrorGroupsPayload, mirrorMembers: MirrorMember[], media: ReadonlyMap<string, string>): Member[] => {
  const groupIdsBy = new Map<string, string[]>();
  const named = new Map<string, string>();
  for (const [gid, list] of Object.entries(data.membership)) {
    for (const m of Array.isArray(list) ? list : []) {
      named.set(m.id, m.name);
      if (gid) pushTo(groupIdsBy, m.id, gid);
    }
  }
  return [...named].map(([id, name]) => mirrorToMember(mirrorMembers.find(x => x.id === id) || { id, name }, media, groupIdsBy.get(id) || []));
};

export const searchMirrorMembers = (members: MirrorMember[], query: string): MirrorMember[] => {
  const q = query.trim().toLowerCase();
  return q ? members.filter(m => [m.name, m.pronouns, m.role].some(v => (v || '').toLowerCase().includes(q))) : members;
};

export const sortMirrorJournal = (entries: JournalEntry[]): JournalEntry[] =>
  [...entries].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.timestamp || 0) - (a.timestamp || 0));

export const sortMirrorAppointments = (appts: MirrorAppointment[]): MirrorAppointment[] =>
  [...appts].sort((a, b) => (Number(a?.time) || 0) - (Number(b?.time) || 0));
