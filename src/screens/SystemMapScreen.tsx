import React, {useState, useEffect, useMemo, useCallback, useRef} from 'react';
import {View, ScrollView, TouchableOpacity, Alert, Animated, PanResponder, StyleSheet, useWindowDimensions} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useKeyboardHeight} from '../hooks/useKeyboardHeight';
import {useTranslation} from 'react-i18next';
import {Member, Relationship, RelationshipTypeDef, allRelationshipTypes, relationshipDegrees, uid, sortMembersBySearch, memberMatchesSearch, DEFAULT_REL_COLOR, PRESET_RELATIONSHIP_TYPES} from '../utils';
import {fontScale, ThemeColors} from '../theme';
import {useAppStore} from '../store/appStore';
import {TogglePill} from '../components/ToggleSwitch';
import {logError} from '../utils/log';
import {store, KEYS} from '../storage';
import {ColorCarousel} from '../components/ColorCarousel';
import {Avatar} from '../components/Avatar';

interface Props {
  theme: ThemeColors;
  onViewMember?: (id: string) => void;
  onRelCountChange?: (n: number) => void;
  focus?: {id: string; n: number} | null;
}

interface MapNode {
  id: string;
  x: number;
  y: number;
  r: number;
}

const WORLD = 4000;
const HALF = WORLD / 2;

const buildLayout = (ms: Member[], rels: Relationship[]): {nodes: MapNode[]; byId: Map<string, MapNode>; maxExtent: number} => {
  const ids = ms.map(m => m.id);
  const degrees = relationshipDegrees(ids, rels);
  const order = [...ids].sort((a, b) => (degrees[b] || 0) - (degrees[a] || 0));
  const idx = new Map(order.map((id, i) => [id, i]));
  const n = order.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const rad = 46 * Math.sqrt(i);
    const ang = i * 2.39996;
    xs[i] = rad * Math.cos(ang);
    ys[i] = rad * Math.sin(ang);
  }
  const edges: [number, number][] = [];
  for (const rel of rels) {
    const a = idx.get(rel.fromId);
    const b = idx.get(rel.toId);
    if (a !== undefined && b !== undefined && a !== b) edges.push([a, b]);
  }
  const iterations = n > 800 ? 40 : n > 250 ? 60 : n > 120 ? 120 : 220;
  const useGrid = n > 250;
  const CELL = 150;
  const repel = (i: number, j: number, fx: Float64Array, fy: Float64Array) => {
    let dx = xs[i] - xs[j];
    let dy = ys[i] - ys[j];
    let d2 = dx * dx + dy * dy;
    if (d2 < 1) d2 = 1;
    const d = Math.sqrt(d2);
    const f = 5200 / d2;
    dx /= d;
    dy /= d;
    fx[i] += dx * f;
    fy[i] += dy * f;
    fx[j] -= dx * f;
    fy[j] -= dy * f;
  };
  for (let it = 0; it < iterations; it++) {
    const fx = new Float64Array(n);
    const fy = new Float64Array(n);
    if (useGrid) {
      const grid = new Map<string, number[]>();
      const cellX = new Int32Array(n);
      const cellY = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        cellX[i] = Math.floor(xs[i] / CELL);
        cellY[i] = Math.floor(ys[i] / CELL);
        const key = `${cellX[i]},${cellY[i]}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(i); else grid.set(key, [i]);
      }
      for (let i = 0; i < n; i++) {
        for (let gx = cellX[i] - 1; gx <= cellX[i] + 1; gx++) {
          for (let gy = cellY[i] - 1; gy <= cellY[i] + 1; gy++) {
            const bucket = grid.get(`${gx},${gy}`);
            if (!bucket) continue;
            for (const j of bucket) {
              if (j > i) repel(i, j, fx, fy);
            }
          }
        }
      }
    } else {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          repel(i, j, fx, fy);
        }
      }
    }
    for (const [a, b] of edges) {
      let dx = xs[b] - xs[a];
      let dy = ys[b] - ys[a];
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = 0.04 * (d - 110);
      dx /= d;
      dy /= d;
      fx[a] += dx * f;
      fy[a] += dy * f;
      fx[b] -= dx * f;
      fy[b] -= dy * f;
    }
    const maxStep = 24 * (1 - it / iterations) + 2;
    for (let i = 1; i < n; i++) {
      fx[i] -= xs[i] * 0.012;
      fy[i] -= ys[i] * 0.012;
      const mag = Math.hypot(fx[i], fy[i]) || 1;
      const step = Math.min(maxStep, mag);
      xs[i] += (fx[i] / mag) * step;
      ys[i] += (fy[i] / mag) * step;
      const cap = HALF - 80;
      if (xs[i] > cap) xs[i] = cap;
      if (xs[i] < -cap) xs[i] = -cap;
      if (ys[i] > cap) ys[i] = cap;
      if (ys[i] < -cap) ys[i] = -cap;
    }
  }
  const nodes: MapNode[] = order.map((id, i) => ({id, x: xs[i], y: ys[i], r: 12 + Math.min(degrees[id] || 0, 10) * 2}));
  const byId = new Map(nodes.map(node => [node.id, node]));
  let maxExtent = 120;
  for (const node of nodes) {
    maxExtent = Math.max(maxExtent, Math.abs(node.x) + node.r + 40, Math.abs(node.y) + node.r + 40);
  }
  return {nodes, byId, maxExtent};
};

const MemberPickerField = ({label, value, onChange, members, facets = [], T}: {
  label: string; value: string; onChange: (id: string) => void; members: Member[];
  facets?: Member[]; T: ThemeColors;
}) => {
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const sel = members.find(m => m.id === value) || facets.find(m => m.id === value);
  const q = search.trim().toLowerCase();
  const filtered = sortMembersBySearch(members.filter(m => memberMatchesSearch(m, q)), search.trim());
  const filteredFacets = sortMembersBySearch(facets.filter(m => memberMatchesSearch(m, q)), search.trim());
  return (
    <View style={{marginBottom: 12}}>
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{label}</Text>
      <TouchableOpacity onPress={() => {setOpen(!open); setSearch('');}} activeOpacity={0.7}
        accessibilityRole="button" accessibilityState={{expanded: open}} accessibilityLabel={label} accessibilityValue={{text: sel?.name || t('systemMap.selectMember')}}
        style={{flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8}}>
        {sel ? <Avatar member={sel} size={22} T={T} /> : null}
        <Text style={{flex: 1, fontSize: fs(13), color: sel ? T.text : T.muted}}>{sel?.name || t('systemMap.selectMember')}</Text>
        <Text style={{fontSize: fs(12), color: T.dim}}>▾</Text>
      </TouchableOpacity>
      {open && (
        <View style={{backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.border, marginTop: 4, overflow: 'hidden'}}>
          <TextInput value={search} onChangeText={setSearch} accessibilityLabel={t('common.search')} placeholder={t('common.search')} placeholderTextColor={T.muted} autoFocus
            style={{backgroundColor: T.surface, color: T.text, fontSize: fs(13), paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border}} />
          <ScrollView style={{maxHeight: 180}} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {filtered.slice(0, 30).map(m => (
              <TouchableOpacity key={m.id} onPress={() => {onChange(m.id); setOpen(false); setSearch('');}} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={m.name} accessibilityState={{selected: value === m.id}}
                style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: value === m.id ? `${T.accent}15` : 'transparent'}}>
                <Avatar member={m} size={22} T={T} />
                <Text style={{fontSize: fs(13), color: value === m.id ? T.accent : T.text}}>{m.name}</Text>
              </TouchableOpacity>
            ))}
            {filteredFacets.length > 0 && (
              <Text accessibilityRole="header" style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: T.border}}>{t('members.facets')}</Text>
            )}
            {filteredFacets.slice(0, 30).map(m => (
              <TouchableOpacity key={m.id} onPress={() => {onChange(m.id); setOpen(false); setSearch('');}} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={m.name} accessibilityState={{selected: value === m.id}}
                style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: value === m.id ? `${T.accent}15` : 'transparent'}}>
                <Avatar member={m} size={22} T={T} />
                <Text style={{fontSize: fs(13), color: value === m.id ? T.accent : T.text}}>{m.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const MemberMultiPickerField = ({label, values, onToggle, members, facets = [], T}: {
  label: string; values: string[]; onToggle: (id: string) => void; members: Member[];
  facets?: Member[]; T: ThemeColors;
}) => {
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const pool = useMemo(() => [...members, ...facets], [members, facets]);
  const selected = values.map(id => pool.find(m => m.id === id)).filter(Boolean) as Member[];
  const q = search.trim().toLowerCase();
  const filtered = sortMembersBySearch(members.filter(m => memberMatchesSearch(m, q)), search.trim());
  const filteredFacets = sortMembersBySearch(facets.filter(m => memberMatchesSearch(m, q)), search.trim());
  const summary = selected.map(m => m.name).join(', ');
  return (
    <View style={{marginBottom: 12}}>
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{label}</Text>
      <TouchableOpacity onPress={() => {setOpen(!open); setSearch('');}} activeOpacity={0.7}
        accessibilityRole="button" accessibilityState={{expanded: open}} accessibilityLabel={label} accessibilityValue={{text: summary || t('systemMap.selectMember')}}
        style={{flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8}}>
        {selected.length === 1 ? <Avatar member={selected[0]} size={22} T={T} /> : null}
        <Text style={{flex: 1, fontSize: fs(13), color: selected.length ? T.text : T.muted}} numberOfLines={1}>{summary || t('systemMap.selectMember')}</Text>
        <Text style={{fontSize: fs(12), color: T.dim}}>▾</Text>
      </TouchableOpacity>
      {open && (
        <View style={{backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.border, marginTop: 4, overflow: 'hidden'}}>
          <TextInput value={search} onChangeText={setSearch} accessibilityLabel={t('common.search')} placeholder={t('common.search')} placeholderTextColor={T.muted} autoFocus
            style={{backgroundColor: T.surface, color: T.text, fontSize: fs(13), paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border}} />
          <ScrollView style={{maxHeight: 180}} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {filtered.slice(0, 30).map(m => {
              const on = values.includes(m.id);
              return (
                <TouchableOpacity key={m.id} onPress={() => onToggle(m.id)} activeOpacity={0.7}
                  accessibilityRole="checkbox" accessibilityState={{checked: on}} accessibilityLabel={m.name}
                  style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: on ? `${T.accent}15` : 'transparent'}}>
                  <Avatar member={m} size={22} T={T} />
                  <Text style={{flex: 1, fontSize: fs(13), color: on ? T.accent : T.text}}>{m.name}</Text>
                  {on ? <Text style={{fontSize: fs(13), color: T.accent}} accessibilityElementsHidden importantForAccessibility="no">✓</Text> : null}
                </TouchableOpacity>
              );
            })}
            {filteredFacets.length > 0 && (
              <Text accessibilityRole="header" style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: T.border}}>{t('members.facets')}</Text>
            )}
            {filteredFacets.slice(0, 30).map(m => {
              const on = values.includes(m.id);
              return (
                <TouchableOpacity key={m.id} onPress={() => onToggle(m.id)} activeOpacity={0.7}
                  accessibilityRole="checkbox" accessibilityState={{checked: on}} accessibilityLabel={m.name}
                  style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: on ? `${T.accent}15` : 'transparent'}}>
                  <Avatar member={m} size={22} T={T} />
                  <Text style={{flex: 1, fontSize: fs(13), color: on ? T.accent : T.text}}>{m.name}</Text>
                  {on ? <Text style={{fontSize: fs(13), color: T.accent}} accessibilityElementsHidden importantForAccessibility="no">✓</Text> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const TypeForm = ({T, initial, saveLabel, onSave}: {
  T: ThemeColors; initial?: RelationshipTypeDef | null; saveLabel: string;
  onSave: (d: {name: string; directional: boolean; inverseName?: string; color: string}) => void;
}) => {
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [name, setName] = useState(initial?.name || '');
  const [directional, setDirectional] = useState(initial?.directional || false);
  const [inverse, setInverse] = useState(initial?.inverseName || '');
  const [color, setColor] = useState(initial?.color || DEFAULT_REL_COLOR);
  return (
    <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12, marginBottom: 12}}>
      <TextInput value={name} onChangeText={setName} accessibilityLabel={t('systemMap.typeName')} placeholder={t('systemMap.typeName')} placeholderTextColor={T.muted}
        style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: fs(13), marginBottom: 8}} />
      <TouchableOpacity onPress={() => setDirectional(!directional)} activeOpacity={0.7}
        accessibilityRole="switch" accessibilityState={{checked: directional}} accessibilityLabel={t('systemMap.directional')}
        style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8}}>
        <TogglePill on={directional} T={T} />
        <Text style={{fontSize: fs(12), color: T.dim}}>{t('systemMap.directional')}</Text>
      </TouchableOpacity>
      {directional && (
        <TextInput value={inverse} onChangeText={setInverse} accessibilityLabel={t('systemMap.inverseName')} placeholder={t('systemMap.inverseName')} placeholderTextColor={T.muted}
          style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: fs(13), marginBottom: 8}} />
      )}
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('systemMap.typeColor')}</Text>
      <ColorCarousel value={color} onChange={setColor} T={T} />
      <View style={{height: 12}} />
      <TouchableOpacity onPress={() => { if (name.trim()) onSave({name: name.trim(), directional, inverseName: directional ? (inverse.trim() || name.trim()) : undefined, color}); }} activeOpacity={0.7}
        accessibilityRole="button" accessibilityLabel={saveLabel}
        style={{backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingVertical: 9, alignItems: 'center', opacity: name.trim() ? 1 : 0.45}}>
        <Text style={{fontSize: fs(12), fontWeight: '600', color: T.accent}}>{saveLabel}</Text>
      </TouchableOpacity>
    </View>
  );
};

export const SystemMapScreen = ({theme: T, onViewMember, onRelCountChange, focus}: Props) => {
  const members = useAppStore(s => s.members);
  const {t} = useTranslation();
  const fs = fontScale(T);
  const kb = useKeyboardHeight();
  const winH = useWindowDimensions().height;
  const editorScrollRef = useRef<ScrollView>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showFacets, setShowFacets] = useState(true);
  const [colorAll, setColorAll] = useState(false);
  const [mapIds, setMapIds] = useState<string[]>([]);
  const mapIdSet = useMemo(() => new Set(mapIds), [mapIds]);
  const rosterEligible = useMemo(() => members.filter(m => !m.isCustomFront && !m.isFacet && !m.deleted && (showArchived || !m.archived)), [members, showArchived]);
  const facetEligible = useMemo(() => members.filter(m => m.isFacet && !m.isCustomFront && !m.deleted && (showArchived || !m.archived)), [members, showArchived]);
  const eligibleMembers = useMemo(
    () => [...rosterEligible, ...facetEligible.filter(m => mapIdSet.has(m.id))],
    [rosterEligible, facetEligible, mapIdSet],
  );
  const mapMembers = useMemo(() => eligibleMembers.filter(m => mapIdSet.has(m.id) && (showFacets || !m.isFacet)), [eligibleMembers, mapIdSet, showFacets]);
  const memberById = useMemo(() => new Map([...rosterEligible, ...facetEligible].map(m => [m.id, m])), [rosterEligible, facetEligible]);

  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [posOverrides, setPosOverrides] = useState<Record<string, {x: number; y: number}>>({});
  useEffect(() => { onRelCountChange?.(relationships.length); }, [relationships.length, onRelCountChange]);
  const [customTypes, setCustomTypes] = useState<RelationshipTypeDef[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { if (focus) setSelectedId(focus.id); }, [focus]);
  const [showEditor, setShowEditor] = useState(false);
  const [editRel, setEditRel] = useState<Relationship | null>(null);
  const [fromId, setFromId] = useState('');
  const [toIds, setToIds] = useState<string[]>([]);
  const [typeId, setTypeId] = useState('');
  const [relNote, setRelNote] = useState('');
  const [showNewType, setShowNewType] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [showAddType, setShowAddType] = useState(false);
  const [editTypeId, setEditTypeId] = useState<string | null>(null);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [memberPickerSearch, setMemberPickerSearch] = useState('');
  const [depth, setDepth] = useState<1 | 2 | 3>(1);

  const types = useMemo(() => allRelationshipTypes(customTypes), [customTypes]);
  const typeById = useMemo(() => new Map(types.map(td => [td.id, td])), [types]);
  const userTypes = useMemo(() => types.filter(td => !td.preset), [types]);
  const presetTypes = useMemo(() => types.filter(td => td.preset), [types]);

  useEffect(() => {
    (async () => {
      const [rels, savedTypes, savedMapIds, savedPositions, savedShowArchived, savedColorAll, savedShowFacets] = await Promise.all([
        store.get<Relationship[]>(KEYS.relationships, []),
        store.get<RelationshipTypeDef[]>(KEYS.relationshipTypes, []),
        store.get<string[]>(KEYS.systemMapMembers),
        store.get<Record<string, {x: number; y: number}>>(KEYS.systemMapPositions),
        store.get<boolean>('ps.mapShowArchived', false),
        store.get<boolean>('ps.mapColorThreads', false),
        store.get<boolean>('ps.mapShowFacets', true),
      ]);
      setShowArchived(!!savedShowArchived);
      setColorAll(!!savedColorAll);
      setShowFacets(savedShowFacets !== false);
      setCustomTypes(savedTypes || []);
      const all = rels || [];
      const ids = new Set(members.map(m => m.id));
      const valid = all.filter(r => ids.has(r.fromId) && ids.has(r.toId));
      setRelationships(valid);
      if (savedPositions) {
        const pruned: Record<string, {x: number; y: number}> = {};
        for (const id in savedPositions) {
          if (ids.has(id)) pruned[id] = savedPositions[id];
        }
        setPosOverrides(pruned);
      }
      if (valid.length !== all.length) await store.set(KEYS.relationships, valid);
      if (savedMapIds) {
        setMapIds(savedMapIds.filter(id => ids.has(id)));
      } else {
        const seeded = [...new Set(valid.flatMap(r => [r.fromId, r.toId]))];
        setMapIds(seeded);
        await store.set(KEYS.systemMapMembers, seeded);
      }
    })();
  }, []);

  const toggleShowArchived = () => {
    const v = !showArchived;
    setShowArchived(v);
    store.set('ps.mapShowArchived', v).catch(() => {});
  };
  const toggleShowFacets = () => {
    const v = !showFacets;
    setShowFacets(v);
    store.set('ps.mapShowFacets', v).catch(() => {});
  };
  const toggleColorAll = () => {
    const v = !colorAll;
    setColorAll(v);
    store.set('ps.mapColorThreads', v).catch(() => {});
  };

  const saveMapIds = async (next: string[]) => {
    setMapIds(next);
    await store.set(KEYS.systemMapMembers, next);
  };

  const addToMap = async (id: string) => {
    if (!mapIdSet.has(id)) await saveMapIds([...mapIds, id]);
  };

  const removeFromMap = async (id: string) => {
    await saveMapIds(mapIds.filter(x => x !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const saveRelationships = async (next: Relationship[]) => {
    setRelationships(next);
    await store.set(KEYS.relationships, next);
  };

  const saveCustomTypes = async (next: RelationshipTypeDef[]) => {
    setCustomTypes(next);
    await store.set(KEYS.relationshipTypes, next);
  };

  const typeLabel = useCallback((td: RelationshipTypeDef): string => (td.preset && !td.overridden) ? t(`relType.${td.id}`, {defaultValue: td.name}) : td.name, [t]);
  const typeInverseLabel = useCallback((td: RelationshipTypeDef): string => {
    if (!td.directional) return typeLabel(td);
    return (td.preset && !td.overridden) ? t(`relType.${td.id}Inverse`, {defaultValue: td.inverseName || td.name}) : (td.inverseName || td.name);
  }, [t, typeLabel]);

  const roleOfOther = (r: Relationship, memberId: string): string => {
    const td = typeById.get(r.typeId);
    if (!td) return '?';
    return r.fromId === memberId ? typeInverseLabel(td) : typeLabel(td);
  };

  const layout = useMemo(() => buildLayout(mapMembers, relationships), [mapMembers, relationships]);
  const nodes = useMemo(() => {
    let changed = false;
    const out = layout.nodes.map(n => {
      const o = posOverrides[n.id];
      if (!o) return n;
      changed = true;
      return {...n, x: o.x, y: o.y};
    });
    return changed ? out : layout.nodes;
  }, [layout, posOverrides]);
  const nodesById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const maxExtentEff = useMemo(() => {
    let me = layout.maxExtent;
    for (const id in posOverrides) {
      const o = posOverrides[id];
      me = Math.max(me, Math.abs(o.x) + 60, Math.abs(o.y) + 60);
    }
    return me;
  }, [layout, posOverrides]);
  const degrees = useMemo(() => relationshipDegrees(mapMembers.map(m => m.id), relationships), [mapMembers, relationships]);
  const usageByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of relationships) counts[r.typeId] = (counts[r.typeId] || 0) + 1;
    return counts;
  }, [relationships]);

  const hopDistances = useMemo(() => {
    if (!selectedId) return null;
    const adjacency = new Map<string, string[]>();
    for (const r of relationships) {
      if (!mapIdSet.has(r.fromId) || !mapIdSet.has(r.toId)) continue;
      if (!adjacency.has(r.fromId)) adjacency.set(r.fromId, []);
      if (!adjacency.has(r.toId)) adjacency.set(r.toId, []);
      adjacency.get(r.fromId)!.push(r.toId);
      adjacency.get(r.toId)!.push(r.fromId);
    }
    const dist = new Map<string, number>([[selectedId, 0]]);
    let frontier = [selectedId];
    for (let d = 1; d <= 3; d++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const nb of adjacency.get(id) || []) {
          if (!dist.has(nb)) {
            dist.set(nb, d);
            next.push(nb);
          }
        }
      }
      frontier = next;
    }
    return dist;
  }, [selectedId, relationships, mapIdSet]);

  const inReach = (id: string): boolean => {
    if (!hopDistances) return false;
    const d = hopDistances.get(id);
    return d !== undefined && d <= depth;
  };

  const edgeLit = (fromId: string, toId: string): boolean => {
    if (!hopDistances || !selectedId) return false;
    const a = hopDistances.get(fromId);
    const b = hopDistances.get(toId);
    if (a === undefined || b === undefined) return false;
    if (a > depth || b > depth) return false;
    return Math.abs(a - b) === 1;
  };

  const panRef = useRef({tx: 0, ty: 0, scale: 1, startTx: 0, startTy: 0, startScale: 1, startDist: 0, moved: false});
  const animTx = useRef(new Animated.Value(0)).current;
  const animTy = useRef(new Animated.Value(0)).current;
  const animScale = useRef(new Animated.Value(1)).current;
  const viewportRef = useRef({x: 0, y: 0, w: 0, h: 0});
  const containerRef = useRef<View>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const maxExtentRef = useRef(maxExtentEff);
  maxExtentRef.current = maxExtentEff;
  const dragRef = useRef<{id: string; startX: number; startY: number} | null>(null);

  const applyFit = useCallback(() => {
    const vp = viewportRef.current;
    if (vp.w === 0 || vp.h === 0) return;
    const p = panRef.current;
    const fit = Math.min(1, (Math.min(vp.w, vp.h) / 2 - 16) / maxExtentRef.current);
    p.tx = 0;
    p.ty = 0;
    p.scale = fit;
    animTx.setValue(0);
    animTy.setValue(0);
    animScale.setValue(fit);
  }, [animTx, animTy, animScale]);

  useEffect(() => { applyFit(); }, [layout, applyFit]);

  const nodeAt = useCallback((pageX: number, pageY: number): MapNode | null => {
    const vp = viewportRef.current;
    const p = panRef.current;
    const wx = (pageX - vp.x - vp.w / 2 - p.tx) / p.scale;
    const wy = (pageY - vp.y - vp.h / 2 - p.ty) / p.scale;
    let best: MapNode | null = null;
    let bestD = Number.MAX_VALUE;
    const slack = p.scale < 1 ? 14 / p.scale : 14;
    for (const node of nodesRef.current) {
      const d = Math.hypot(node.x - wx, node.y - wy);
      if (d < node.r + slack && d < bestD) {
        bestD = d;
        best = node;
      }
    }
    return best;
  }, []);

  const handleTap = useCallback((pageX: number, pageY: number) => {
    setSelectedId(nodeAt(pageX, pageY)?.id ?? null);
  }, [nodeAt]);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_evt, gs) => Math.abs(gs.dx) > 6 || Math.abs(gs.dy) > 6,
    onPanResponderGrant: (evt) => {
      const p = panRef.current;
      p.startTx = p.tx;
      p.startTy = p.ty;
      p.startScale = p.scale;
      p.startDist = 0;
      p.moved = false;
      const hit = nodeAt(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      dragRef.current = hit ? {id: hit.id, startX: hit.x, startY: hit.y} : null;
    },
    onPanResponderMove: (evt, gs) => {
      const p = panRef.current;
      const touches = evt.nativeEvent.touches;
      if (touches.length >= 2) {
        dragRef.current = null;
        const dx = touches[0].pageX - touches[1].pageX;
        const dy = touches[0].pageY - touches[1].pageY;
        const dist = Math.hypot(dx, dy) || 1;
        if (p.startDist === 0) {
          p.startDist = dist;
          p.startScale = p.scale;
        } else {
          p.scale = Math.min(3, Math.max(0.05, p.startScale * (dist / p.startDist)));
          animScale.setValue(p.scale);
        }
        p.moved = true;
      } else if (dragRef.current) {
        if (Math.abs(gs.dx) > 4 || Math.abs(gs.dy) > 4) p.moved = true;
        if (p.moved) {
          const drag = dragRef.current;
          const cap = HALF - 80;
          const nx = Math.max(-cap, Math.min(cap, drag.startX + gs.dx / p.scale));
          const ny = Math.max(-cap, Math.min(cap, drag.startY + gs.dy / p.scale));
          setPosOverrides(prev => ({...prev, [drag.id]: {x: nx, y: ny}}));
        }
      } else {
        if (Math.abs(gs.dx) > 4 || Math.abs(gs.dy) > 4) p.moved = true;
        p.tx = p.startTx + gs.dx;
        p.ty = p.startTy + gs.dy;
        animTx.setValue(p.tx);
        animTy.setValue(p.ty);
      }
    },
    onPanResponderRelease: (evt, gs) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!panRef.current.moved) {
        handleTap(gs.x0 + gs.dx, gs.y0 + gs.dy);
        return;
      }
      if (drag) {
        setPosOverrides(prev => {
          store.set(KEYS.systemMapPositions, prev).catch(e => logError('systemMap', e));
          return prev;
        });
      }
    },
  }), [nodeAt, handleTap, animTx, animTy, animScale]);

  const zoomBy = (f: number) => {
    const p = panRef.current;
    p.scale = Math.min(3, Math.max(0.05, p.scale * f));
    animScale.setValue(p.scale);
  };

  const openEditor = (rel: Relationship | null, presetFromId?: string) => {
    setEditRel(rel);
    setFromId(rel?.fromId || presetFromId || '');
    setToIds(rel?.toId ? [rel.toId] : []);
    setTypeId(rel?.typeId || '');
    setRelNote(rel?.note || '');
    setShowNewType(false);
    setShowEditor(true);
  };

  const saveRelationship = async () => {
    const td = typeById.get(typeId);
    if (!fromId || toIds.length === 0 || !td) {
      Alert.alert(t('systemMap.title'), t('systemMap.missingFields'));
      return;
    }
    const targets = [...new Set(toIds)].filter(id => id && id !== fromId);
    if (targets.length === 0) {
      Alert.alert(t('systemMap.title'), t('systemMap.sameMember'));
      return;
    }
    const findDup = (to: string) => relationships.find(r => r.id !== editRel?.id && r.typeId === typeId
      && ((r.fromId === fromId && r.toId === to) || (!td.directional && r.fromId === to && r.toId === fromId)));
    const offerDup = (dup: Relationship) => {
      Alert.alert(t('systemMap.title'), t('systemMap.duplicate'), [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('common.edit'), onPress: async () => {
          const backOnMap = [dup.fromId, dup.toId].filter(id => !mapIdSet.has(id));
          if (backOnMap.length > 0) await saveMapIds([...mapIds, ...backOnMap]);
          openEditor(dup);
        }},
      ]);
    };
    if (editRel) {
      const to = targets[0];
      const dup = findDup(to);
      if (dup) { offerDup(dup); return; }
      const entry: Relationship = {id: editRel.id, fromId, toId: to, typeId, note: relNote.trim() || undefined, createdAt: editRel.createdAt};
      await saveRelationships(relationships.map(r => r.id === editRel.id ? entry : r));
      const mapAdds = [fromId, to].filter(id => !mapIdSet.has(id));
      if (mapAdds.length > 0) await saveMapIds([...mapIds, ...mapAdds]);
      setShowEditor(false);
      setEditRel(null);
      return;
    }
    const fresh = targets.filter(to => !findDup(to));
    if (fresh.length === 0) {
      offerDup(findDup(targets[0])!);
      return;
    }
    const nowTs = Date.now();
    const entries: Relationship[] = fresh.map(to => ({id: uid(), fromId, toId: to, typeId, note: relNote.trim() || undefined, createdAt: nowTs}));
    await saveRelationships([...relationships, ...entries]);
    const mapAdds = [fromId, ...fresh].filter(id => !mapIdSet.has(id));
    if (mapAdds.length > 0) await saveMapIds([...mapIds, ...mapAdds]);
    setShowEditor(false);
    setEditRel(null);
  };

  const deleteRelationship = (rel: Relationship) => {
    Alert.alert(t('systemMap.deleteRelationship'), t('systemMap.deleteRelationshipMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: async () => {
        await saveRelationships(relationships.filter(r => r.id !== rel.id));
        if (showEditor) {
          setShowEditor(false);
          setEditRel(null);
        }
      }},
    ]);
  };

  const createType = async (d: {name: string; directional: boolean; inverseName?: string; color: string}): Promise<string> => {
    const td: RelationshipTypeDef = {id: uid(), name: d.name, directional: d.directional, inverseName: d.inverseName, color: d.color};
    await saveCustomTypes([...customTypes, td]);
    return td.id;
  };

  const updateType = async (id: string, d: {name: string; directional: boolean; inverseName?: string; color: string}) => {
    if (customTypes.some(x => x.id === id)) {
      await saveCustomTypes(customTypes.map(x => x.id === id ? {...x, name: d.name, directional: d.directional, inverseName: d.inverseName, color: d.color} : x));
    } else if (PRESET_RELATIONSHIP_TYPES.some(p => p.id === id)) {
      await saveCustomTypes([...customTypes, {id, name: d.name, directional: d.directional, inverseName: d.inverseName, color: d.color, preset: true}]);
    }
  };

  const deleteCustomType = (td: RelationshipTypeDef) => {
    Alert.alert(t('systemMap.deleteType'), t('systemMap.deleteTypeMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: async () => {
        await saveCustomTypes(customTypes.filter(x => x.id !== td.id));
        await saveRelationships(relationships.filter(r => r.typeId !== td.id));
        if (typeId === td.id) setTypeId('');
      }},
    ]);
  };

  const deletePresetType = (td: RelationshipTypeDef) => {
    Alert.alert(t('systemMap.deleteType'), t('systemMap.deleteTypeMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: async () => {
        await saveCustomTypes([...customTypes.filter(x => x.id !== td.id), {id: td.id, name: td.name, directional: td.directional, preset: true, deleted: true}]);
        await saveRelationships(relationships.filter(r => r.typeId !== td.id));
        if (typeId === td.id) setTypeId('');
      }},
    ]);
  };

  const selectedMember = selectedId ? memberById.get(selectedId) : undefined;
  const selectedRels = selectedId
    ? relationships.filter(r => (r.fromId === selectedId || r.toId === selectedId) && nodesById.has(r.fromId === selectedId ? r.toId : r.fromId))
    : [];
  const selectedTd = typeById.get(typeId);

  return (
    <View style={{flex: 1, backgroundColor: T.bg}}>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 10}}>
        <TouchableOpacity onPress={() => {setShowMemberPicker(true); setMemberPickerSearch('');}} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel={t('members.addMember')}
          style={{borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8}}>
          <Text style={{fontSize: fs(12), fontWeight: '600', color: T.text}}>{t('systemMap.addMember')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => {setShowConnections(true); setShowAddType(false); setEditTypeId(null);}} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel={t('systemMap.connections')}
          style={{borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8}}>
          <Text style={{fontSize: fs(12), fontWeight: '600', color: T.text}}>{t('systemMap.connections')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => openEditor(null, selectedId || undefined)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel={t('systemMap.addRelationship')}
          style={{backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8}}>
          <Text style={{fontSize: fs(12), fontWeight: '600', color: T.accent}}>{t('systemMap.addRelationship')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleShowArchived} activeOpacity={0.7}
          accessibilityRole="switch" accessibilityState={{checked: showArchived}} accessibilityLabel={t('members.archived')}
          style={{borderWidth: 1, borderColor: showArchived ? `${T.accent}40` : T.border, backgroundColor: showArchived ? T.accentBg : T.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8}}>
          <Text style={{fontSize: fs(12), fontWeight: '600', color: showArchived ? T.accent : T.dim}}>{t('members.archived')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleShowFacets} activeOpacity={0.7}
          accessibilityRole="switch" accessibilityState={{checked: showFacets}} accessibilityLabel={t('members.facets')}
          style={{borderWidth: 1, borderColor: showFacets ? `${T.accent}40` : T.border, backgroundColor: showFacets ? T.accentBg : T.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8}}>
          <Text style={{fontSize: fs(12), fontWeight: '600', color: showFacets ? T.accent : T.dim}}>{t('members.facets')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleColorAll} activeOpacity={0.7}
          accessibilityRole="switch" accessibilityState={{checked: colorAll}} accessibilityLabel={t('systemMap.showColors')}
          style={{borderWidth: 1, borderColor: colorAll ? `${T.accent}40` : T.border, backgroundColor: colorAll ? T.accentBg : T.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8}}>
          <Text style={{fontSize: fs(12), fontWeight: '600', color: colorAll ? T.accent : T.dim}}>{t('systemMap.showColors')}</Text>
        </TouchableOpacity>
      </View>

      <View
        ref={containerRef}
        style={{flex: 1, overflow: 'hidden'}}
        onLayout={() => {
          containerRef.current?.measureInWindow((x, y, w, h) => {
            viewportRef.current = {x, y, w, h};
            applyFit();
          });
        }}
        {...responder.panHandlers}>
        <View pointerEvents="none" style={{position: 'absolute', left: '50%', top: '50%', width: 0, height: 0}}>
          <Animated.View style={{
            position: 'absolute',
            left: -HALF,
            top: -HALF,
            width: WORLD,
            height: WORLD,
            transform: [{translateX: animTx}, {translateY: animTy}, {scale: animScale}],
          }}>
            {relationships.map(r => {
              const a = nodesById.get(r.fromId);
              const b = nodesById.get(r.toId);
              if (!a || !b) return null;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const len = Math.hypot(dx, dy) || 1;
              const angle = Math.atan2(dy, dx);
              const lit = edgeLit(r.fromId, r.toId);
              const relColor = typeById.get(r.typeId)?.color || DEFAULT_REL_COLOR;
              return (
                <View key={r.id} style={{
                  position: 'absolute',
                  left: HALF + (a.x + b.x) / 2 - len / 2,
                  top: HALF + (a.y + b.y) / 2 - (lit ? 1.5 : 1),
                  width: len,
                  height: lit ? 3 : 2,
                  borderRadius: 1.5,
                  backgroundColor: lit || colorAll ? relColor : T.dim,
                  opacity: selectedId ? (lit ? 0.95 : 0.06) : 0.3,
                  transform: [{rotateZ: `${angle}rad`}],
                }} />
              );
            })}
            {nodes.map(node => {
              const m = memberById.get(node.id);
              if (!m) return null;
              const dimmed = hopDistances ? !inReach(node.id) : false;
              const isSel = node.id === selectedId;
              const nodeCount = nodes.length;
              const showAvatar = nodeCount <= 250;
              const showLabel = nodeCount <= 600;
              return (
                <View key={node.id} style={{position: 'absolute', left: HALF + node.x - node.r, top: HALF + node.y - node.r, opacity: dimmed ? 0.25 : m.archived ? 0.55 : 1}}>
                  {showAvatar ? (
                    <View style={{
                      width: node.r * 2,
                      height: node.r * 2,
                      borderRadius: node.r,
                      borderWidth: isSel ? 3 : 2,
                      borderColor: isSel ? T.accent : m.color,
                      backgroundColor: T.card,
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}>
                      <Avatar member={m} size={node.r * 2 - 4} T={T} />
                    </View>
                  ) : (
                    <View style={{
                      width: node.r * 2,
                      height: node.r * 2,
                      borderRadius: node.r,
                      borderWidth: isSel ? 3 : 0,
                      borderColor: T.accent,
                      backgroundColor: m.color,
                    }} />
                  )}
                  {showLabel && (
                    <Text numberOfLines={1} style={{
                      position: 'absolute',
                      width: 90,
                      left: node.r - 45,
                      top: node.r * 2 + 2,
                      textAlign: 'center',
                      fontSize: 9,
                      color: isSel ? T.accent : T.dim,
                    }}>{m.name}</Text>
                  )}
                </View>
              );
            })}
          </Animated.View>
        </View>

        {(mapMembers.length === 0 || relationships.length === 0) && !selectedId && (
          <View pointerEvents="none" style={{position: 'absolute', left: 16, right: 16, bottom: 16, alignItems: 'center'}}>
            <View style={{maxWidth: 360, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10}}>
              <Text style={{fontSize: fs(12), color: T.dim, textAlign: 'center'}}>
                {mapMembers.length === 0 ? t('systemMap.emptyMap') : t('systemMap.noRelationships')}
              </Text>
            </View>
          </View>
        )}

        <View style={{position: 'absolute', right: 12, top: 12, gap: 8}}>
          {[{icon: '＋', label: t('systemMap.zoomIn'), onPress: () => zoomBy(1.3)},
            {icon: '－', label: t('systemMap.zoomOut'), onPress: () => zoomBy(1 / 1.3)},
            {icon: '⟲', label: t('systemMap.resetView'), onPress: applyFit}].map((b, i) => (
            <TouchableOpacity key={i} onPress={b.onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={b.label}
              style={{width: 36, height: 36, borderRadius: 18, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center'}}>
              <Text style={{fontSize: fs(15), color: T.accent}}>{b.icon}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {selectedMember && !showEditor && (
        <View style={{position: 'absolute', left: 12, right: 12, bottom: 12, backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 14, maxHeight: 300}}>
          <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10}}>
            <View style={{flexDirection: 'row', gap: 4}}>
              {([1, 2, 3] as const).map(d => (
                <TouchableOpacity key={d} onPress={() => setDepth(d)} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityState={{selected: depth === d}} accessibilityLabel={`${t('systemMap.depth')} ${d}`}
                  style={{width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: depth === d ? `${T.accent}25` : T.surface, borderColor: depth === d ? T.accent : T.border}}>
                  <Text style={{fontSize: fs(11), fontWeight: '600', color: depth === d ? T.accent : T.dim}}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{flex: 1}} />
            {onViewMember && (
              <TouchableOpacity onPress={() => onViewMember(selectedMember.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemMap.viewProfile')}
                style={{borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginRight: 4}}>
                <Text style={{fontSize: fs(11), color: T.accent}}>{t('systemMap.viewProfile')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => removeFromMap(selectedMember.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemMap.removeFromMap')} style={{padding: 4}}>
              <Text style={{fontSize: fs(14), color: T.danger}}>⊖</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSelectedId(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')} style={{padding: 4}}>
              <Text style={{fontSize: fs(14), color: T.dim}}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8}}>
            <Avatar member={selectedMember} size={30} T={T} />
            <View style={{flex: 1}}>
              <Text style={{fontSize: fs(15), fontWeight: '600', color: selectedMember.color}} numberOfLines={1}>{selectedMember.name}</Text>
              <Text style={{fontSize: fs(10), color: T.muted}} numberOfLines={1}>
                {(degrees[selectedMember.id] || 0) === 1 ? t('systemMap.relationshipOne') : t('systemMap.relationships', {count: degrees[selectedMember.id] || 0})}
              </Text>
            </View>
          </View>
          <ScrollView style={{maxHeight: 170}}>
            {selectedRels.length === 0 ? (
              <Text style={{fontSize: fs(12), color: T.dim, paddingVertical: 8}}>{t('systemMap.noneForMember')}</Text>
            ) : selectedRels.map(r => {
              const otherId = r.fromId === selectedMember.id ? r.toId : r.fromId;
              const other = memberById.get(otherId);
              if (!other) return null;
              return (
                <View key={r.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border}}>
                  <TouchableOpacity onPress={() => openEditor(r)} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityLabel={`${roleOfOther(r, selectedMember.id)}: ${other.name}`}
                    style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10}}>
                    <Avatar member={other} size={24} T={T} />
                    <View style={{flex: 1}}>
                      <Text style={{fontSize: fs(13), color: T.text}} numberOfLines={1}>{other.name}</Text>
                      {r.note ? <Text style={{fontSize: fs(10), color: T.muted}} numberOfLines={1}>{r.note}</Text> : null}
                    </View>
                    <View style={{backgroundColor: `${typeById.get(r.typeId)?.color || DEFAULT_REL_COLOR}20`, borderWidth: 1, borderColor: `${typeById.get(r.typeId)?.color || DEFAULT_REL_COLOR}60`, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3}}>
                      <Text style={{fontSize: fs(10), color: typeById.get(r.typeId)?.color || DEFAULT_REL_COLOR}}>{roleOfOther(r, selectedMember.id)}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteRelationship(r)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemMap.deleteRelationship')} style={{padding: 4}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                    <Text style={{fontSize: fs(12), color: T.danger}} accessibilityElementsHidden importantForAccessibility="no">✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {showEditor && (
        <View style={{...StyleSheet.absoluteFill, backgroundColor: '#00000088', justifyContent: 'flex-end', paddingBottom: kb}}>
          <View style={{backgroundColor: T.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: T.border, maxHeight: Math.min(winH * 0.88, winH - kb - 16)}}>
            <ScrollView ref={editorScrollRef} contentContainerStyle={{padding: 16, paddingBottom: 28}} keyboardShouldPersistTaps="handled">
              <Text accessibilityRole="header" style={{fontSize: fs(17), fontWeight: '600', color: T.text, marginBottom: 14}}>
                {editRel ? t('systemMap.editRelationship') : t('systemMap.addRelationship')}
              </Text>

              <MemberPickerField label={t('systemMap.from')} value={fromId} onChange={setFromId} members={rosterEligible} facets={facetEligible} T={T} />

              <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('systemMap.type')}</Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6}}>
                {types.map(td => {
                  const sel = td.id === typeId;
                  const tc = td.color || DEFAULT_REL_COLOR;
                  return (
                    <TouchableOpacity key={td.id} onPress={() => setTypeId(td.id)} onLongPress={() => { if (!td.preset) deleteCustomType(td); }} activeOpacity={0.7}
                      accessibilityRole="button" accessibilityState={{selected: sel}}
                      accessibilityLabel={td.directional ? `${typeLabel(td)} → ${typeInverseLabel(td)}` : typeLabel(td)}
                      style={{flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6,
                        backgroundColor: sel ? `${tc}25` : T.surface, borderColor: sel ? tc : T.border}}>
                      <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: tc}} />
                      <Text style={{fontSize: fs(12), color: sel ? tc : T.text}}>
                        {td.directional ? `${typeLabel(td)} → ${typeInverseLabel(td)}` : typeLabel(td)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity onPress={() => setShowNewType(!showNewType)} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityState={{expanded: showNewType}} accessibilityLabel={t('systemMap.newType')}
                  style={{borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'transparent', borderColor: T.dim}}>
                  <Text style={{fontSize: fs(12), color: T.dim}}>{t('systemMap.newType')}</Text>
                </TouchableOpacity>
              </View>
              {customTypes.length > 0 && (
                <Text style={{fontSize: fs(9), color: T.muted, marginBottom: 8}}>{t('systemMap.longPressDelete')}</Text>
              )}

              {showNewType && (
                <TypeForm T={T} saveLabel={t('common.add')} onSave={async d => {
                  const id = await createType(d);
                  setTypeId(id);
                  setShowNewType(false);
                }} />
              )}

              {editRel ? (
                <MemberPickerField label={t('systemMap.to')} value={toIds[0] || ''} onChange={id => setToIds([id])} members={rosterEligible} facets={facetEligible} T={T} />
              ) : (
                <MemberMultiPickerField label={t('systemMap.to')} values={toIds}
                  onToggle={id => setToIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                  members={rosterEligible} facets={facetEligible} T={T} />
              )}

              {selectedTd && fromId && toIds.length > 0 && (
                <Text style={{fontSize: fs(11), color: T.muted, marginBottom: 12}}>
                  {selectedTd.directional
                    ? `${memberById.get(fromId)?.name || '?'} (${typeLabel(selectedTd)}) → ${toIds.map(id => memberById.get(id)?.name || '?').join(', ')} (${typeInverseLabel(selectedTd)})`
                    : `${memberById.get(fromId)?.name || '?'} ⟷ ${toIds.map(id => memberById.get(id)?.name || '?').join(', ')} (${typeLabel(selectedTd)})`}
                </Text>
              )}

              <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('modal.note')}</Text>
              <TextInput value={relNote} onChangeText={setRelNote} accessibilityLabel={t('systemMap.notePlaceholder')} placeholder={t('systemMap.notePlaceholder')} placeholderTextColor={T.muted} multiline
                onFocus={() => setTimeout(() => editorScrollRef.current?.scrollToEnd({animated: true}), 80)}
                style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13), minHeight: 60, textAlignVertical: 'top', marginBottom: 16}} />

              <View style={{flexDirection: 'row', gap: 10}}>
                {editRel && (
                  <TouchableOpacity onPress={() => deleteRelationship(editRel)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.delete')}
                    style={{flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 8, borderWidth: 1, backgroundColor: 'transparent', borderColor: `${T.danger}60`}}>
                    <Text style={{fontSize: fs(14), fontWeight: '500', color: T.danger}}>{t('common.delete')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => {setShowEditor(false); setEditRel(null);}} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
                  style={{flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 8, borderWidth: 1, backgroundColor: 'transparent', borderColor: T.border}}>
                  <Text style={{fontSize: fs(14), fontWeight: '500', color: T.dim}}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveRelationship} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.save')}
                  style={{flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
                  <Text style={{fontSize: fs(14), fontWeight: '500', color: T.accent}}>{t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {showConnections && (
        <View style={{...StyleSheet.absoluteFill, backgroundColor: '#00000088', justifyContent: 'flex-end', paddingBottom: kb}}>
          <View style={{backgroundColor: T.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: T.border, maxHeight: Math.min(winH * 0.88, winH - kb - 16)}}>
            <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4}}>
              <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(17), fontWeight: '600', color: T.text}}>{t('systemMap.connections')}</Text>
              <TouchableOpacity onPress={() => {setShowConnections(false); setShowAddType(false); setEditTypeId(null);}} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')} style={{padding: 4}}>
                <Text style={{fontSize: fs(15), color: T.dim}}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{padding: 16, paddingTop: 8, paddingBottom: 28}} keyboardShouldPersistTaps="handled">
              {showAddType ? (
                <TypeForm T={T} saveLabel={t('common.add')} onSave={async d => {
                  await createType(d);
                  setShowAddType(false);
                }} />
              ) : (
                <TouchableOpacity onPress={() => {setShowAddType(true); setEditTypeId(null);}} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityLabel={t('systemMap.newType')}
                  style={{borderWidth: 1, borderStyle: 'dashed', borderColor: T.dim, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginBottom: 14}}>
                  <Text style={{fontSize: fs(13), color: T.dim}}>{t('systemMap.newType')}</Text>
                </TouchableOpacity>
              )}

              <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{t('systemMap.customTypes')}</Text>
              {userTypes.length === 0 ? (
                <Text style={{fontSize: fs(12), color: T.muted, marginBottom: 14}}>{t('systemMap.noCustomTypes')}</Text>
              ) : (
                <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 14}}>
                  {userTypes.map(td => (
                    <View key={td.id} style={{borderBottomWidth: 1, borderBottomColor: T.border}}>
                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10}}>
                        <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: td.color || DEFAULT_REL_COLOR}} />
                        <View style={{flex: 1}}>
                          <Text style={{fontSize: fs(13), color: T.text}} numberOfLines={1}>
                            {td.directional ? `${td.name} → ${td.inverseName || td.name}` : td.name}
                          </Text>
                          <Text style={{fontSize: fs(10), color: T.muted}}>{t('systemMap.inUse', {count: usageByType[td.id] || 0})}</Text>
                        </View>
                        <TouchableOpacity onPress={() => {setEditTypeId(editTypeId === td.id ? null : td.id); setShowAddType(false);}} activeOpacity={0.7}
                          accessibilityRole="button" accessibilityState={{expanded: editTypeId === td.id}} accessibilityLabel={t('systemMap.editType')}
                          style={{borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5}}>
                          <Text style={{fontSize: fs(11), color: T.accent}}>{t('common.edit')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => deleteCustomType(td)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemMap.deleteType')} style={{padding: 4}}>
                          <Text style={{fontSize: fs(13), color: T.danger}}>✕</Text>
                        </TouchableOpacity>
                      </View>
                      {editTypeId === td.id && (
                        <View style={{paddingHorizontal: 12, paddingBottom: 12}}>
                          <TypeForm T={T} initial={td} saveLabel={t('common.save')} onSave={async d => {
                            await updateType(td.id, d);
                            setEditTypeId(null);
                          }} />
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}

              <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 8}}>{t('systemMap.presetTypes')}</Text>
              <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden'}}>
                {presetTypes.map(td => (
                  <View key={td.id} style={{borderBottomWidth: 1, borderBottomColor: T.border}}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10}}>
                      <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: td.color || DEFAULT_REL_COLOR}} />
                      <View style={{flex: 1}}>
                        <Text style={{fontSize: fs(13), color: T.text}} numberOfLines={1}>
                          {td.directional ? `${typeLabel(td)} → ${typeInverseLabel(td)}` : typeLabel(td)}
                        </Text>
                        <Text style={{fontSize: fs(10), color: T.muted}}>{t('systemMap.inUse', {count: usageByType[td.id] || 0})}</Text>
                      </View>
                      <TouchableOpacity onPress={() => {setEditTypeId(editTypeId === td.id ? null : td.id); setShowAddType(false);}} activeOpacity={0.7}
                        accessibilityRole="button" accessibilityState={{expanded: editTypeId === td.id}} accessibilityLabel={t('systemMap.editType')}
                        style={{borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5}}>
                        <Text style={{fontSize: fs(11), color: T.accent}}>{t('common.edit')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deletePresetType(td)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemMap.deleteType')} style={{padding: 4}}>
                        <Text style={{fontSize: fs(13), color: T.danger}}>✕</Text>
                      </TouchableOpacity>
                    </View>
                    {editTypeId === td.id && (
                      <View style={{paddingHorizontal: 12, paddingBottom: 12}}>
                        <TypeForm T={T} initial={{...td, name: typeLabel(td), inverseName: td.directional ? typeInverseLabel(td) : td.inverseName}} saveLabel={t('common.save')} onSave={async d => {
                          await updateType(td.id, d);
                          setEditTypeId(null);
                        }} />
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {showMemberPicker && (
        <View style={{...StyleSheet.absoluteFill, backgroundColor: '#00000088', justifyContent: 'flex-end', paddingBottom: kb}}>
          <View style={{backgroundColor: T.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: T.border, height: Math.max(240, Math.min(winH * 0.75, winH - kb - 16))}}>
            <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8}}>
              <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(17), fontWeight: '600', color: T.text}}>{t('members.addMember')}</Text>
              <TouchableOpacity onPress={() => setShowMemberPicker(false)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')} style={{padding: 4}}>
                <Text style={{fontSize: fs(15), color: T.dim}}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={{paddingHorizontal: 16, paddingBottom: 8}}>
              <TextInput value={memberPickerSearch} onChangeText={setMemberPickerSearch} accessibilityLabel={t('common.search')} placeholder={t('common.search')} placeholderTextColor={T.muted}
                style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13)}} />
            </View>
            <ScrollView contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 28}} keyboardShouldPersistTaps="handled">
              {(() => {
                const q = memberPickerSearch.trim().toLowerCase();
                const match = (m: Member) => !mapIdSet.has(m.id) && memberMatchesSearch(m, q);
                const candidates = sortMembersBySearch(rosterEligible.filter(match), memberPickerSearch.trim());
                const facetCandidates = sortMembersBySearch(facetEligible.filter(match), memberPickerSearch.trim());
                if (candidates.length === 0 && facetCandidates.length === 0) {
                  return <Text style={{fontSize: fs(12), color: T.muted, paddingVertical: 12}}>{t('mention.noMembers')}</Text>;
                }
                const PICKER_CAP = 60;
                const shown = candidates.slice(0, PICKER_CAP);
                const shownFacets = facetCandidates.slice(0, PICKER_CAP);
                const row = (m: Member) => (
                  <TouchableOpacity key={m.id} onPress={() => addToMap(m.id)} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityLabel={m.name}
                    style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: T.border}}>
                    <Avatar member={m} size={26} T={T} />
                    <Text style={{flex: 1, fontSize: fs(13), color: T.text}} numberOfLines={1}>{m.name}</Text>
                    <Text style={{fontSize: fs(14), lineHeight: fs(14), textAlign: 'center', includeFontPadding: false, textAlignVertical: 'center', color: T.accent}}>＋</Text>
                  </TouchableOpacity>
                );
                return (
                  <>
                    {shown.map(row)}
                    {candidates.length > PICKER_CAP && (
                      <Text style={{fontSize: fs(11), color: T.muted, fontStyle: 'italic', paddingVertical: 10, textAlign: 'center'}}>
                        {t('members.refineSearch', {count: candidates.length - PICKER_CAP})}
                      </Text>
                    )}
                    {shownFacets.length > 0 && (
                      <>
                        <Text accessibilityRole="header" style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginTop: 16, marginBottom: 6}}>
                          {t('members.facets')}
                        </Text>
                        {shownFacets.map(row)}
                        {facetCandidates.length > PICKER_CAP && (
                          <Text style={{fontSize: fs(11), color: T.muted, fontStyle: 'italic', paddingVertical: 10, textAlign: 'center'}}>
                            {t('members.refineSearch', {count: facetCandidates.length - PICKER_CAP})}
                          </Text>
                        )}
                      </>
                    )}
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
};
