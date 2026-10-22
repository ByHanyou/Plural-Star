import type {GroupNodeKind, MemberGroup} from '../model/types';
import {nameCompare} from './intl';

export const groupKind = (g: MemberGroup): GroupNodeKind => g.kind || 'group';
export const groupParent = (g: MemberGroup): string | null => g.parentId ?? null;

export const linkedSubsystemsOf = (groups: MemberGroup[], memberId: string): MemberGroup[] =>
  memberId ? groups.filter(g => groupKind(g) === 'subsystem' && g.linkedMemberId === memberId) : [];

export const setSubsystemLinks = (groups: MemberGroup[], memberId: string, subsystemIds: string[]): MemberGroup[] => {
  if (!memberId) return groups;
  const want = new Set(subsystemIds);
  let changed = false;
  const next = groups.map(g => {
    if (groupKind(g) !== 'subsystem') return g;
    if (want.has(g.id)) {
      if (g.linkedMemberId === memberId) return g;
      changed = true;
      return {...g, linkedMemberId: memberId};
    }
    if (g.linkedMemberId !== memberId) return g;
    changed = true;
    return {...g, linkedMemberId: undefined};
  });
  return changed ? next : groups;
};

export const childrenOf = (nodes: MemberGroup[], parentId: string | null): MemberGroup[] =>
  nodes
    .filter(n => groupParent(n) === parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || nameCompare(a.name, b.name));

const groupDisplayOrder = (nodes: MemberGroup[]): Map<string, number> => {
  const order = new Map<string, number>();
  const walk = (parentId: string | null) => {
    for (const g of childrenOf(nodes, parentId)) {
      if (order.has(g.id)) continue;
      order.set(g.id, order.size);
      walk(g.id);
    }
  };
  walk(null);
  for (const g of nodes) {
    if (!order.has(g.id)) order.set(g.id, order.size);
  }
  return order;
};

export const sortGroupsForDisplay = (list: MemberGroup[], all: MemberGroup[]): MemberGroup[] => {
  const order = groupDisplayOrder(all);
  return [...list].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
};

export const descendantsOf = (nodes: MemberGroup[], id: string): MemberGroup[] => {
  const out: MemberGroup[] = [];
  const seen = new Set<string>([id]);
  const walk = (pid: string) => {
    for (const n of nodes) {
      if (groupParent(n) === pid && !seen.has(n.id)) {
        seen.add(n.id);
        out.push(n);
        walk(n.id);
      }
    }
  };
  walk(id);
  return out;
};

export const isDescendant = (nodes: MemberGroup[], candidateId: string, ofId: string): boolean => {
  if (candidateId === ofId) return true;
  return descendantsOf(nodes, ofId).some(n => n.id === candidateId);
};

export const moveGroupsTo = (nodes: MemberGroup[], ids: string[], parentId: string | null): MemberGroup[] => {
  const valid = ids.filter(id => !(parentId && isDescendant(nodes, parentId, id)));
  if (valid.length === 0) return nodes;
  const moving = new Set(valid);
  const base = childrenOf(nodes, parentId).filter(g => !moving.has(g.id)).length;
  return nodes.map(g => {
    const i = valid.indexOf(g.id);
    return i >= 0 ? {...g, parentId, sortOrder: base + i} : g;
  });
};

export const removeGroupsPromoting = (nodes: MemberGroup[], ids: string[]): MemberGroup[] => {
  const removed = new Set(ids);
  const byId = new Map(nodes.map(n => [n.id, n]));
  const survivingParent = (n: MemberGroup): string | null => {
    const seen = new Set<string>();
    let pid = groupParent(n);
    while (pid && removed.has(pid) && !seen.has(pid)) {
      seen.add(pid);
      const parent = byId.get(pid);
      pid = parent ? groupParent(parent) : null;
    }
    return pid && removed.has(pid) ? null : pid;
  };
  return nodes
    .filter(n => !removed.has(n.id))
    .map(n => {
      const pid = groupParent(n);
      return pid && removed.has(pid) ? {...n, parentId: survivingParent(n)} : n;
    });
};

export const removeGroupSubtrees = (nodes: MemberGroup[], ids: string[]): MemberGroup[] => {
  const gone = new Set([...ids, ...ids.flatMap(id => descendantsOf(nodes, id).map(d => d.id))]);
  return nodes.filter(n => !gone.has(n.id));
};

export const groupTree = (groups: MemberGroup[]): {roots: MemberGroup[]; unreached: MemberGroup[]} => {
  const exists = new Set(groups.map(g => g.id));
  const roots = groups
    .filter(g => { const p = groupParent(g); return p === null || !exists.has(p); })
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || nameCompare(a.name, b.name));
  const reachable = new Set<string>();
  const mark = (g: MemberGroup): void => {
    if (reachable.has(g.id)) return;
    reachable.add(g.id);
    for (const c of childrenOf(groups, g.id)) mark(c);
  };
  roots.forEach(mark);
  return {roots, unreached: groups.filter(g => !reachable.has(g.id))};
};
