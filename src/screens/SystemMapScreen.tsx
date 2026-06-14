import React, {useState, useEffect, useMemo, useCallback, useRef} from 'react';
import {View, ScrollView, TouchableOpacity, Alert, Animated, PanResponder, KeyboardAvoidingView, StyleSheet} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useKeyboardBehavior} from '../hooks/useKeyboardBehavior';
import {useTranslation} from 'react-i18next';
import {Member, Relationship, RelationshipTypeDef, allRelationshipTypes, relationshipDegrees, uid, sortMembersBySearch, DEFAULT_REL_COLOR, RELATIONSHIP_COLOR_CHOICES, PRESET_RELATIONSHIP_TYPES, isValidHex, normalizeHex} from '../utils';
import {PALETTE} from '../theme';
import {store, KEYS} from '../storage';
import {ColorPicker} from '../components/ColorPicker';
import {Avatar} from '../components/Avatar';

interface Props {
  theme: any;
  members: Member[];
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

const MemberPickerField = ({label, value, onChange, members, T}: {
  label: string; value: string; onChange: (id: string) => void; members: Member[]; T: any;
}) => {
  const {t} = useTranslation();
  const fs = (s: number) => Math.round(s * (T.textScale || 1));
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const sel = members.find(m => m.id === value);
  const filtered = sortMembersBySearch(members.filter(m => !search.trim() || m.name.toLowerCase().includes(search.trim().toLowerCase())), search.trim());
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
          <TextInput value={search} onChangeText={setSearch} placeholder={t('common.search')} placeholderTextColor={T.muted} autoFocus
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
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const TypeForm = ({T, initial, saveLabel, onSave}: {
  T: any; initial?: RelationshipTypeDef | null; saveLabel: string;
  onSave: (d: {name: string; directional: boolean; inverseName?: string; color: string}) => void;
}) => {
  const {t} = useTranslation();
  const fs = (s: number) => Math.round(s * (T.textScale || 1));
  const [name, setName] = useState(initial?.name || '');
  const [directional, setDirectional] = useState(initial?.directional || false);
  const [inverse, setInverse] = useState(initial?.inverseName || '');
  const [color, setColor] = useState(initial?.color || DEFAULT_REL_COLOR);
  const [hexInput, setHexInput] = useState(initial?.color || DEFAULT_REL_COLOR);
  const [hexError, setHexError] = useState(false);
  const handleHexChange = (val: string) => {
    setHexInput(val);
    const n = normalizeHex(val);
    if (isValidHex(n)) {
      setColor(n);
      setHexError(false);
    } else {
      setHexError(val.length > 1);
    }
  };
  const swatches = [...new Set([...RELATIONSHIP_COLOR_CHOICES, DEFAULT_REL_COLOR, ...PALETTE])];
  return (
    <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12, marginBottom: 12}}>
      <TextInput value={name} onChangeText={setName} placeholder={t('systemMap.typeName')} placeholderTextColor={T.muted}
        style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: fs(13), marginBottom: 8}} />
      <TouchableOpacity onPress={() => setDirectional(!directional)} activeOpacity={0.7}
        accessibilityRole="switch" accessibilityState={{checked: directional}} accessibilityLabel={t('systemMap.directional')}
        style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8}}>
        <View style={{width: 40, height: 22, borderRadius: 11, backgroundColor: directional ? T.accent : T.toggleOff, justifyContent: 'center'}}>
          <View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', position: 'absolute', left: directional ? 20 : 3}} />
        </View>
        <Text style={{fontSize: fs(12), color: T.dim}}>{t('systemMap.directional')}</Text>
      </TouchableOpacity>
      {directional && (
        <TextInput value={inverse} onChangeText={setInverse} placeholder={t('systemMap.inverseName')} placeholderTextColor={T.muted}
          style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: fs(13), marginBottom: 8}} />
      )}
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('systemMap.typeColor')}</Text>
      <ColorPicker value={color} onChange={setColor} T={T} />
      <View style={{height: 12}} />
      {hexError && <Text style={{fontSize: fs(11), color: T.danger, marginBottom: 8}}>{t('modal.invalidHex')}</Text>}
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10}}>
        {swatches.map(c => (
          <TouchableOpacity key={c} onPress={() => {setColor(c); setHexInput(c); setHexError(false);}} activeOpacity={0.8}
            accessibilityRole="button" accessibilityState={{selected: color === c}} accessibilityLabel={`${t('systemMap.typeColor')} ${c}`}
            style={{width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: 2, borderColor: color === c ? '#fff' : 'transparent'}} />
        ))}
      </View>
      <TouchableOpacity onPress={() => { if (name.trim()) onSave({name: name.trim(), directional, inverseName: directional ? (inverse.trim() || name.trim()) : undefined, color}); }} activeOpacity={0.7}
        accessibilityRole="button" accessibilityLabel={saveLabel}
        style={{backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingVertical: 9, alignItems: 'center', opacity: name.trim() ? 1 : 0.45}}>
        <Text style={{fontSize: fs(12), fontWeight: '600', color: T.accent}}>{saveLabel}</Text>
      </TouchableOpacity>
    </View>
  );
};

export const SystemMapScreen = ({theme: T, members, onViewMember, onRelCountChange, focus}: Props) => {
  const {t} = useTranslation();
  const fs = (s: number) => Math.round(s * (T.textScale || 1));
  const behavior = useKeyboardBehavior();
  const eligibleMembers = useMemo(() => members.filter(m => !m.isCustomFront && !m.archived), [members]);
  const [mapIds, setMapIds] = useState<string[]>([]);
  const mapIdSet = useMemo(() => new Set(mapIds), [mapIds]);
  const mapMembers = useMemo(() => eligibleMembers.filter(m => mapIdSet.has(m.id)), [eligibleMembers, mapIdSet]);
  const memberById = useMemo(() => new Map(eligibleMembers.map(m => [m.id, m])), [eligibleMembers]);

  const [relationships, setRelationships] = useState<Relationship[]>([]);
  useEffect(() => { onRelCountChange?.(relationships.length); }, [relationships.length, onRelCountChange]);
  const [customTypes, setCustomTypes] = useState<RelationshipTypeDef[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { if (focus) setSelectedId(focus.id); }, [focus]);
  const [showEditor, setShowEditor] = useState(false);
  const [editRel, setEditRel] = useState<Relationship | null>(null);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
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
      const [rels, savedTypes, savedMapIds] = await Promise.all([
        store.get<Relationship[]>(KEYS.relationships, []),
        store.get<RelationshipTypeDef[]>(KEYS.relationshipTypes, []),
        store.get<string[]>(KEYS.systemMapMembers),
      ]);
      setCustomTypes(savedTypes || []);
      const all = rels || [];
      const ids = new Set(members.map(m => m.id));
      const valid = all.filter(r => ids.has(r.fromId) && ids.has(r.toId));
      setRelationships(valid);
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

  const typeLabel = useCallback((td: RelationshipTypeDef): string => (td.preset && !td.overridden) ? t(`relType.${td.id}`) : td.name, [t]);
  const typeInverseLabel = useCallback((td: RelationshipTypeDef): string => {
    if (!td.directional) return typeLabel(td);
    return (td.preset && !td.overridden) ? t(`relType.${td.id}Inverse`) : (td.inverseName || td.name);
  }, [t, typeLabel]);

  const roleOfOther = (r: Relationship, memberId: string): string => {
    const td = typeById.get(r.typeId);
    if (!td) return '?';
    return r.fromId === memberId ? typeInverseLabel(td) : typeLabel(td);
  };

  const layout = useMemo(() => buildLayout(mapMembers, relationships), [mapMembers, relationships]);
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

  const panRef = useRef({tx: 0, ty: 0, scale: 1, startTx: 0, startTy: 0, startScale: 1, startDist: 0, moved: false});
  const animTx = useRef(new Animated.Value(0)).current;
  const animTy = useRef(new Animated.Value(0)).current;
  const animScale = useRef(new Animated.Value(1)).current;
  const viewportRef = useRef({x: 0, y: 0, w: 0, h: 0});
  const containerRef = useRef<View>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const applyFit = useCallback(() => {
    const vp = viewportRef.current;
    if (vp.w === 0 || vp.h === 0) return;
    const p = panRef.current;
    const fit = Math.min(1, (Math.min(vp.w, vp.h) / 2 - 16) / layoutRef.current.maxExtent);
    p.tx = 0;
    p.ty = 0;
    p.scale = fit;
    animTx.setValue(0);
    animTy.setValue(0);
    animScale.setValue(fit);
  }, [animTx, animTy, animScale]);

  useEffect(() => { applyFit(); }, [layout, applyFit]);

  const handleTap = useCallback((pageX: number, pageY: number) => {
    const vp = viewportRef.current;
    const p = panRef.current;
    const wx = (pageX - vp.x - vp.w / 2 - p.tx) / p.scale;
    const wy = (pageY - vp.y - vp.h / 2 - p.ty) / p.scale;
    let best: string | null = null;
    let bestD = Number.MAX_VALUE;
    const slack = p.scale < 1 ? 14 / p.scale : 14;
    for (const node of layoutRef.current.nodes) {
      const d = Math.hypot(node.x - wx, node.y - wy);
      if (d < node.r + slack && d < bestD) {
        bestD = d;
        best = node.id;
      }
    }
    setSelectedId(best);
  }, []);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      const p = panRef.current;
      p.startTx = p.tx;
      p.startTy = p.ty;
      p.startScale = p.scale;
      p.startDist = 0;
      p.moved = false;
    },
    onPanResponderMove: (evt, gs) => {
      const p = panRef.current;
      const touches = evt.nativeEvent.touches;
      if (touches.length >= 2) {
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
      } else {
        if (Math.abs(gs.dx) > 4 || Math.abs(gs.dy) > 4) p.moved = true;
        p.tx = p.startTx + gs.dx;
        p.ty = p.startTy + gs.dy;
        animTx.setValue(p.tx);
        animTy.setValue(p.ty);
      }
    },
    onPanResponderRelease: (evt, gs) => {
      if (!panRef.current.moved) handleTap(gs.x0 + gs.dx, gs.y0 + gs.dy);
    },
  }), [handleTap, animTx, animTy, animScale]);

  const zoomBy = (f: number) => {
    const p = panRef.current;
    p.scale = Math.min(3, Math.max(0.05, p.scale * f));
    animScale.setValue(p.scale);
  };

  const openEditor = (rel: Relationship | null, presetFromId?: string) => {
    setEditRel(rel);
    setFromId(rel?.fromId || presetFromId || '');
    setToId(rel?.toId || '');
    setTypeId(rel?.typeId || '');
    setRelNote(rel?.note || '');
    setShowNewType(false);
    setShowEditor(true);
  };

  const saveRelationship = async () => {
    const td = typeById.get(typeId);
    if (!fromId || !toId || !td) {
      Alert.alert(t('systemMap.title'), t('systemMap.missingFields'));
      return;
    }
    if (fromId === toId) {
      Alert.alert(t('systemMap.title'), t('systemMap.sameMember'));
      return;
    }
    const dup = relationships.find(r => r.id !== editRel?.id && r.typeId === typeId
      && ((r.fromId === fromId && r.toId === toId) || (!td.directional && r.fromId === toId && r.toId === fromId)));
    if (dup) {
      Alert.alert(t('systemMap.title'), t('systemMap.duplicate'));
      return;
    }
    const entry: Relationship = {
      id: editRel?.id || uid(),
      fromId, toId, typeId,
      note: relNote.trim() || undefined,
      createdAt: editRel?.createdAt || Date.now(),
    };
    const next = editRel ? relationships.map(r => r.id === editRel.id ? entry : r) : [...relationships, entry];
    await saveRelationships(next);
    const mapAdds = [fromId, toId].filter(id => !mapIdSet.has(id));
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

  const selectedMember = selectedId ? memberById.get(selectedId) : undefined;
  const selectedRels = selectedId ? relationships.filter(r => r.fromId === selectedId || r.toId === selectedId) : [];
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
              const a = layout.byId.get(r.fromId);
              const b = layout.byId.get(r.toId);
              if (!a || !b) return null;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const len = Math.hypot(dx, dy) || 1;
              const angle = Math.atan2(dy, dx);
              const lit = !!selectedId && inReach(r.fromId) && inReach(r.toId);
              const relColor = typeById.get(r.typeId)?.color || DEFAULT_REL_COLOR;
              return (
                <View key={r.id} style={{
                  position: 'absolute',
                  left: HALF + (a.x + b.x) / 2 - len / 2,
                  top: HALF + (a.y + b.y) / 2 - (lit ? 1.5 : 1),
                  width: len,
                  height: lit ? 3 : 2,
                  borderRadius: 1.5,
                  backgroundColor: lit ? relColor : T.dim,
                  opacity: selectedId ? (lit ? 0.95 : 0.06) : 0.3,
                  transform: [{rotateZ: `${angle}rad`}],
                }} />
              );
            })}
            {layout.nodes.map(node => {
              const m = memberById.get(node.id);
              if (!m) return null;
              const dimmed = hopDistances ? !inReach(node.id) : false;
              const isSel = node.id === selectedId;
              const nodeCount = layout.nodes.length;
              const showAvatar = nodeCount <= 250;
              const showLabel = nodeCount <= 600;
              return (
                <View key={node.id} style={{position: 'absolute', left: HALF + node.x - node.r, top: HALF + node.y - node.r, opacity: dimmed ? 0.25 : 1}}>
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
                <TouchableOpacity key={r.id} onPress={() => openEditor(r)} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityLabel={`${roleOfOther(r, selectedMember.id)}: ${other.name}`}
                  style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border}}>
                  <Avatar member={other} size={24} T={T} />
                  <View style={{flex: 1}}>
                    <Text style={{fontSize: fs(13), color: T.text}} numberOfLines={1}>{other.name}</Text>
                    {r.note ? <Text style={{fontSize: fs(10), color: T.muted}} numberOfLines={1}>{r.note}</Text> : null}
                  </View>
                  <View style={{backgroundColor: `${typeById.get(r.typeId)?.color || DEFAULT_REL_COLOR}20`, borderWidth: 1, borderColor: `${typeById.get(r.typeId)?.color || DEFAULT_REL_COLOR}60`, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3}}>
                    <Text style={{fontSize: fs(10), color: typeById.get(r.typeId)?.color || DEFAULT_REL_COLOR}}>{roleOfOther(r, selectedMember.id)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => deleteRelationship(r)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemMap.deleteRelationship')} style={{padding: 4}}>
                    <Text style={{fontSize: fs(12), color: T.danger}}>✕</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {showEditor && (
        <KeyboardAvoidingView behavior={behavior} style={{...StyleSheet.absoluteFill, backgroundColor: '#00000088', justifyContent: 'flex-end'}}>
          <View style={{backgroundColor: T.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: T.border, maxHeight: '88%'}}>
            <ScrollView contentContainerStyle={{padding: 16, paddingBottom: 28}} keyboardShouldPersistTaps="handled">
              <Text accessibilityRole="header" style={{fontSize: fs(17), fontWeight: '600', color: T.text, marginBottom: 14}}>
                {editRel ? t('systemMap.editRelationship') : t('systemMap.addRelationship')}
              </Text>

              <MemberPickerField label={t('systemMap.from')} value={fromId} onChange={setFromId} members={eligibleMembers} T={T} />

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

              <MemberPickerField label={t('systemMap.to')} value={toId} onChange={setToId} members={eligibleMembers} T={T} />

              {selectedTd && fromId && toId && (
                <Text style={{fontSize: fs(11), color: T.muted, marginBottom: 12}}>
                  {selectedTd.directional
                    ? `${memberById.get(fromId)?.name || '?'} (${typeLabel(selectedTd)}) → ${memberById.get(toId)?.name || '?'} (${typeInverseLabel(selectedTd)})`
                    : `${memberById.get(fromId)?.name || '?'} ⟷ ${memberById.get(toId)?.name || '?'} (${typeLabel(selectedTd)})`}
                </Text>
              )}

              <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{t('modal.note')}</Text>
              <TextInput value={relNote} onChangeText={setRelNote} placeholder={t('systemMap.notePlaceholder')} placeholderTextColor={T.muted} multiline
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
        </KeyboardAvoidingView>
      )}

      {showConnections && (
        <KeyboardAvoidingView behavior={behavior} style={{...StyleSheet.absoluteFill, backgroundColor: '#00000088', justifyContent: 'flex-end'}}>
          <View style={{backgroundColor: T.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: T.border, maxHeight: '88%'}}>
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
        </KeyboardAvoidingView>
      )}

      {showMemberPicker && (
        <KeyboardAvoidingView behavior={behavior} style={{...StyleSheet.absoluteFill, backgroundColor: '#00000088', justifyContent: 'flex-end'}}>
          <View style={{backgroundColor: T.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: T.border, maxHeight: '75%'}}>
            <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8}}>
              <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(17), fontWeight: '600', color: T.text}}>{t('members.addMember')}</Text>
              <TouchableOpacity onPress={() => setShowMemberPicker(false)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')} style={{padding: 4}}>
                <Text style={{fontSize: fs(15), color: T.dim}}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={{paddingHorizontal: 16, paddingBottom: 8}}>
              <TextInput value={memberPickerSearch} onChangeText={setMemberPickerSearch} placeholder={t('common.search')} placeholderTextColor={T.muted}
                style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13)}} />
            </View>
            <ScrollView contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 28}} keyboardShouldPersistTaps="handled">
              {(() => {
                const q = memberPickerSearch.trim().toLowerCase();
                const candidates = sortMembersBySearch(
                  eligibleMembers.filter(m => !mapIdSet.has(m.id) && (!q || m.name.toLowerCase().includes(q))),
                  memberPickerSearch.trim(),
                );
                if (candidates.length === 0) {
                  return <Text style={{fontSize: fs(12), color: T.muted, paddingVertical: 12}}>{t('mention.noMembers')}</Text>;
                }
                const PICKER_CAP = 60;
                const shown = candidates.slice(0, PICKER_CAP);
                return (
                  <>
                    {shown.map(m => (
                      <TouchableOpacity key={m.id} onPress={() => addToMap(m.id)} activeOpacity={0.7}
                        accessibilityRole="button" accessibilityLabel={m.name}
                        style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: T.border}}>
                        <Avatar member={m} size={26} T={T} />
                        <Text style={{flex: 1, fontSize: fs(13), color: T.text}} numberOfLines={1}>{m.name}</Text>
                        <Text style={{fontSize: fs(14), color: T.accent}}>＋</Text>
                      </TouchableOpacity>
                    ))}
                    {candidates.length > PICKER_CAP && (
                      <Text style={{fontSize: fs(11), color: T.muted, fontStyle: 'italic', paddingVertical: 10, textAlign: 'center'}}>
                        {t('members.refineSearch', {count: candidates.length - PICKER_CAP})}
                      </Text>
                    )}
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
};
