import type {TFunction} from 'i18next';
import type {Member, Relationship, RelationshipTypeDef} from '../model/types';
import {pushTo} from './collections';

export const DEFAULT_REL_COLOR = '#8A94A6';
export const RELATIONSHIP_COLOR_CHOICES = ['#E05B5B', '#5BBF7A', '#D9B84A', '#E87BA8'];

export const PRESET_RELATIONSHIP_TYPES: RelationshipTypeDef[] = [
  {id: 'love', name: 'Love', directional: false, color: '#E87BA8', preset: true},
  {id: 'friend', name: 'Friend', directional: false, color: '#5BBF7A', preset: true},
  {id: 'ally', name: 'Ally', directional: false, color: '#D9B84A', preset: true},
  {id: 'rival', name: 'Rival', directional: false, color: '#E05B5B', preset: true},
];

export const allRelationshipTypes = (customTypes: RelationshipTypeDef[]): RelationshipTypeDef[] => {
  const overrides = new Map(customTypes.filter(t => t.preset).map(t => [t.id, t]));
  const presets = PRESET_RELATIONSHIP_TYPES
    .filter(p => !overrides.get(p.id)?.deleted)
    .map(p => {
      const o = overrides.get(p.id);
      return o ? {...p, ...o, overridden: true} : p;
    });
  return [...presets, ...customTypes.filter(t => !t.preset && !t.deleted)];
};

export const relTypeLabel = (td: RelationshipTypeDef, t: TFunction): string =>
  td.preset && !td.overridden ? t(`relType.${td.id}`) : td.name;

export const relTypeInverseLabel = (td: RelationshipTypeDef, t: TFunction): string => {
  if (!td.directional) return relTypeLabel(td, t);
  return td.preset && !td.overridden ? t(`relType.${td.id}Inverse`) : (td.inverseName || td.name);
};

export const relationshipDegrees = (memberIds: string[], relationships: Relationship[]): Record<string, number> => {
  const degrees: Record<string, number> = {};
  for (const id of memberIds) degrees[id] = 0;
  for (const r of relationships) {
    if (degrees[r.fromId] !== undefined) degrees[r.fromId] += 1;
    if (degrees[r.toId] !== undefined) degrees[r.toId] += 1;
  }
  return degrees;
};

export const relationshipHops = (fromId: string | null, relationships: Relationship[], maxHops = 3): Map<string, number> | null => {
  if (!fromId) return null;
  const adjacency = new Map<string, string[]>();
  const link = (a: string, b: string): void => pushTo(adjacency, a, b);
  for (const r of relationships) {
    link(r.fromId, r.toId);
    link(r.toId, r.fromId);
  }
  const hops = new Map<string, number>([[fromId, 0]]);
  let frontier = [fromId];
  for (let d = 1; d <= maxHops && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of adjacency.get(id) || []) {
        if (hops.has(nb)) continue;
        hops.set(nb, d);
        next.push(nb);
      }
    }
    frontier = next;
  }
  return hops;
};

export const findDuplicateRelationship = (relationships: Relationship[], type: RelationshipTypeDef | undefined, typeId: string, fromId: string, toId: string, skipId?: string): Relationship | undefined =>
  relationships.find(r => r.id !== skipId && r.typeId === typeId && ((r.fromId === fromId && r.toId === toId) || (!type?.directional && r.fromId === toId && r.toId === fromId)));

export type RelationshipTypeFields = Pick<RelationshipTypeDef, 'name' | 'directional' | 'inverseName' | 'color'>;

export const upsertRelationshipType = (customTypes: RelationshipTypeDef[], id: string, fields: RelationshipTypeFields): RelationshipTypeDef[] =>
  customTypes.some(x => x.id === id)
    ? customTypes.map(x => (x.id === id ? {...x, ...fields} : x))
    : [...customTypes, {id, ...fields, ...(PRESET_RELATIONSHIP_TYPES.some(p => p.id === id) ? {preset: true} : {})}];

export const removeRelationshipType = (customTypes: RelationshipTypeDef[], type: RelationshipTypeDef): RelationshipTypeDef[] => {
  const rest = customTypes.filter(x => x.id !== type.id);
  return type.preset ? [...rest, {id: type.id, name: type.name, directional: !!type.directional, preset: true, deleted: true}] : rest;
};

export const memberRelationships = (memberId: string, members: Member[], relationships: Relationship[]): Relationship[] => {
  const gone = (id: string) => !!members.find(m => m.id === id)?.deleted;
  return relationships.filter(r => (r.fromId === memberId || r.toId === memberId) && !gone(r.fromId === memberId ? r.toId : r.fromId));
};

export const relationshipRoleOfOther = (type: RelationshipTypeDef | undefined, r: Relationship, memberId: string, t: TFunction): string =>
  !type ? '?' : r.fromId === memberId ? relTypeInverseLabel(type, t) : relTypeLabel(type, t);
