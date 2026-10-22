import React, {useState, useEffect, useMemo, useCallback, useRef} from 'react';
import {View, ScrollView, TouchableOpacity, Alert, Animated, PanResponder, useWindowDimensions} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useKeyboardHeight} from '../hooks/useKeyboardHeight';
import {useTranslation} from 'react-i18next';
import {Relationship, RelationshipTypeDef, allRelationshipTypes, relationshipDegrees, relationshipHops, findDuplicateRelationship, upsertRelationshipType, removeRelationshipType, uid, relTypeLabel, relTypeInverseLabel, relationshipRoleOfOther, isRosterMember, isFacetMember} from '../utils';
import type {RelationshipTypeFields} from '../utils';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {useAppStore} from '../store/appStore';
import {logError} from '../utils/log';
import {MemberPicker} from '../components/MemberPicker';
import {pickerPool} from '../picker/memberPicker';
import {MapNode, buildLayout, clampMapCoord, clampMapScale} from './systemMap/layout';
import {useSystemMapData} from './systemMap/useSystemMapData';
import {ABS_FILL, SheetHeader, SheetScrim} from './systemMap/MapParts';
import {MapCanvas} from './systemMap/MapCanvas';
import {MapDepth, MemberPanel} from './systemMap/MemberPanel';
import {RelationshipDraft, RelationshipEditor} from './systemMap/RelationshipEditor';
import {ConnectionsSheet} from './systemMap/ConnectionsSheet';

interface Props {
  onViewMember?: (id: string) => void;
  onRelCountChange?: (n: number) => void;
  focus?: {id: string; n: number} | null;
}

const ZOOM_STEP = 1.3;
const PAN_SLOP = 6;
const MOVE_SLOP = 4;
const TAP_SLACK = 14;

export const SystemMapScreen = ({onViewMember, onRelCountChange, focus}: Props) => {
  const T = useTheme();
  const members = useAppStore(s => s.members);
  const {t} = useTranslation();
  const fs = fontScale(T);
  const kb = useKeyboardHeight();
  const winH = useWindowDimensions().height;
  const hostRef = useRef<View>(null);
  const [hostBox, setHostBox] = useState({y: 0, h: 0});
  const measureHost = () => {
    hostRef.current?.measureInWindow((_x, y, _w, h) => { if (h > 0) setHostBox({y, h}); });
  };
  const hostH = hostBox.h > 0 ? hostBox.h : winH;
  const kbIn = hostBox.h > 0 ? Math.max(0, kb - Math.max(0, winH - (hostBox.y + hostBox.h))) : kb;
  const sheetMax = Math.min(hostH * 0.88, hostH - kbIn - 16);
  const {
    showArchived, showFacets, colorAll, lockPositions, lockPositionsRef, setPref,
    mapIds, saveMapIds, relationships, saveRelationships, customTypes, saveCustomTypes,
    posOverrides, movePosition, savePositions,
  } = useSystemMapData();
  const mapIdSet = useMemo(() => new Set(mapIds), [mapIds]);
  const rosterEligible = useMemo(() => members.filter(m => isRosterMember(m) && (showArchived || !m.archived)), [members, showArchived]);
  const facetEligible = useMemo(() => members.filter(m => isFacetMember(m) && (showArchived || !m.archived)), [members, showArchived]);
  const mapMembers = useMemo(
    () => [...rosterEligible, ...facetEligible].filter(m => mapIdSet.has(m.id) && (showFacets || !m.isFacet)),
    [rosterEligible, facetEligible, mapIdSet, showFacets],
  );
  const memberById = useMemo(() => new Map([...rosterEligible, ...facetEligible].map(m => [m.id, m])), [rosterEligible, facetEligible]);
  const mapAddPools = useMemo(() => [
    pickerPool('members', rosterEligible.filter(m => !mapIdSet.has(m.id)), t),
    pickerPool('facets', facetEligible.filter(m => !mapIdSet.has(m.id)), t),
  ], [rosterEligible, facetEligible, mapIdSet, t]);
  const addableCount = mapAddPools.reduce((n, p) => n + p.members.length, 0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { if (focus) setSelectedId(focus.id); }, [focus]);
  const [editor, setEditor] = useState<{rel: Relationship | null; fromId?: string; session: number} | null>(null);
  const [showConnections, setShowConnections] = useState(false);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [memberPickerSearch, setMemberPickerSearch] = useState('');
  const [depth, setDepth] = useState<MapDepth>(1);

  const types = useMemo(() => allRelationshipTypes(customTypes), [customTypes]);
  const typeById = useMemo(() => new Map(types.map(td => [td.id, td])), [types]);
  const userTypes = useMemo(() => types.filter(td => !td.preset), [types]);
  const presetTypes = useMemo(() => types.filter(td => td.preset), [types]);

  const ensureOnMap = async (ids: string[]) => {
    const adds = [...new Set(ids)].filter(id => !mapIdSet.has(id));
    if (adds.length > 0) await saveMapIds([...mapIds, ...adds]);
  };
  const removeFromMap = async (id: string) => {
    await saveMapIds(mapIds.filter(x => x !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const typeLabel = useCallback((td: RelationshipTypeDef): string => relTypeLabel(td, t), [t]);
  const typeInverseLabel = useCallback((td: RelationshipTypeDef): string => relTypeInverseLabel(td, t), [t]);
  const typeTitle = useCallback((td: RelationshipTypeDef): string => td.directional ? `${typeLabel(td)} → ${typeInverseLabel(td)}` : typeLabel(td), [typeLabel, typeInverseLabel]);

  const layout = useMemo(() => buildLayout(mapMembers, relationships), [mapMembers, relationships]);
  const nodes = useMemo(() => {
    if (!layout.nodes.some(n => posOverrides[n.id])) return layout.nodes;
    return layout.nodes.map(n => {
      const o = posOverrides[n.id];
      return o ? {...n, x: o.x, y: o.y} : n;
    });
  }, [layout, posOverrides]);
  const nodesById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const visibleRels = useMemo(() => relationships.filter(r => nodesById.has(r.fromId) && nodesById.has(r.toId)), [relationships, nodesById]);
  useEffect(() => { onRelCountChange?.(visibleRels.length); }, [visibleRels.length, onRelCountChange]);
  const maxExtentEff = useMemo(
    () => Object.values(posOverrides).reduce((me, o) => Math.max(me, Math.abs(o.x) + 60, Math.abs(o.y) + 60), layout.maxExtent),
    [layout, posOverrides],
  );
  const degrees = useMemo(() => relationshipDegrees(mapMembers.map(m => m.id), visibleRels), [mapMembers, visibleRels]);
  const usageByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of relationships) counts[r.typeId] = (counts[r.typeId] || 0) + 1;
    return counts;
  }, [relationships]);

  const hopDistances = useMemo(() => relationshipHops(selectedId, visibleRels), [selectedId, visibleRels]);
  const withinDepth = (id: string): boolean => {
    const d = hopDistances?.get(id);
    return d !== undefined && d <= depth;
  };
  const isDimmed = (id: string): boolean => !!hopDistances && !withinDepth(id);
  const isLit = (a: string, b: string): boolean => {
    if (!selectedId) return false;
    const da = hopDistances?.get(a);
    const db = hopDistances?.get(b);
    return da !== undefined && db !== undefined && da <= depth && db <= depth && Math.abs(da - db) === 1;
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
    const slack = p.scale < 1 ? TAP_SLACK / p.scale : TAP_SLACK;
    let best: MapNode | null = null;
    let bestD = Number.MAX_VALUE;
    for (const node of nodesRef.current) {
      const d = Math.hypot(node.x - wx, node.y - wy);
      if (d < node.r + slack && d < bestD) {
        bestD = d;
        best = node;
      }
    }
    return best;
  }, []);

  const setScale = useCallback((s: number) => {
    panRef.current.scale = clampMapScale(s);
    animScale.setValue(panRef.current.scale);
  }, [animScale]);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_evt, gs) => Math.abs(gs.dx) > PAN_SLOP || Math.abs(gs.dy) > PAN_SLOP,
    onPanResponderGrant: (evt) => {
      const p = panRef.current;
      p.startTx = p.tx;
      p.startTy = p.ty;
      p.startScale = p.scale;
      p.startDist = 0;
      p.moved = false;
      const hit = lockPositionsRef.current ? null : nodeAt(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      dragRef.current = hit ? {id: hit.id, startX: hit.x, startY: hit.y} : null;
    },
    onPanResponderMove: (evt, gs) => {
      const p = panRef.current;
      const touches = evt.nativeEvent.touches;
      if (touches.length >= 2) {
        dragRef.current = null;
        const dist = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY) || 1;
        if (p.startDist === 0) {
          p.startDist = dist;
          p.startScale = p.scale;
        } else {
          setScale(p.startScale * (dist / p.startDist));
        }
        p.moved = true;
        return;
      }
      if (Math.abs(gs.dx) > MOVE_SLOP || Math.abs(gs.dy) > MOVE_SLOP) p.moved = true;
      const drag = dragRef.current;
      if (drag) {
        if (!p.moved) return;
        movePosition(drag.id, {x: clampMapCoord(drag.startX + gs.dx / p.scale), y: clampMapCoord(drag.startY + gs.dy / p.scale)});
        return;
      }
      p.tx = p.startTx + gs.dx;
      p.ty = p.startTy + gs.dy;
      animTx.setValue(p.tx);
      animTy.setValue(p.ty);
    },
    onPanResponderRelease: (_evt, gs) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!panRef.current.moved) {
        setSelectedId(nodeAt(gs.x0 + gs.dx, gs.y0 + gs.dy)?.id ?? null);
        return;
      }
      if (drag) savePositions();
    },
  }), [nodeAt, setScale, animTx, animTy, lockPositionsRef, movePosition, savePositions]);

  const openEditor = (rel: Relationship | null, presetFromId?: string) => setEditor(prev => ({rel, fromId: presetFromId, session: (prev?.session || 0) + 1}));
  const closeEditor = () => setEditor(null);

  const submitRelationship = async ({fromId, toIds, typeId, note}: RelationshipDraft) => {
    const editRel = editor?.rel || null;
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
    const findDup = (to: string) => findDuplicateRelationship(relationships, td, typeId, fromId, to, editRel?.id);
    const offerDup = (dup: Relationship) => {
      Alert.alert(t('systemMap.title'), t('systemMap.duplicate'), [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('common.edit'), onPress: async () => {
          await ensureOnMap([dup.fromId, dup.toId]);
          openEditor(dup);
        }},
      ]);
    };
    const trimmedNote = note.trim() || undefined;
    if (editRel) {
      const to = targets[0];
      const dup = findDup(to);
      if (dup) { offerDup(dup); return; }
      const entry: Relationship = {id: editRel.id, fromId, toId: to, typeId, note: trimmedNote, createdAt: editRel.createdAt};
      await saveRelationships(relationships.map(r => r.id === editRel.id ? entry : r));
      await ensureOnMap([fromId, to]);
      closeEditor();
      return;
    }
    const fresh = targets.filter(to => !findDup(to));
    if (fresh.length === 0) {
      const dup = findDup(targets[0]);
      if (dup) offerDup(dup);
      return;
    }
    const nowTs = Date.now();
    await saveRelationships([...relationships, ...fresh.map(to => ({id: uid(), fromId, toId: to, typeId, note: trimmedNote, createdAt: nowTs}))]);
    await ensureOnMap([fromId, ...fresh]);
    closeEditor();
  };

  const deleteRelationship = (rel: Relationship) => {
    Alert.alert(t('systemMap.deleteRelationship'), t('systemMap.deleteRelationshipMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: async () => {
        await saveRelationships(relationships.filter(r => r.id !== rel.id));
        closeEditor();
      }},
    ]);
  };

  const createType = async (d: RelationshipTypeFields): Promise<string> => {
    const td: RelationshipTypeDef = {id: uid(), name: d.name, directional: d.directional, inverseName: d.inverseName, color: d.color};
    await saveCustomTypes([...customTypes, td]);
    return td.id;
  };
  const updateType = (id: string, d: RelationshipTypeFields) => saveCustomTypes(upsertRelationshipType(customTypes, id, d));
  const deleteType = (td: RelationshipTypeDef, onDeleted?: () => void) => {
    Alert.alert(t('systemMap.deleteType'), t('systemMap.deleteTypeMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: async () => {
        await saveCustomTypes(removeRelationshipType(customTypes, td));
        await saveRelationships(relationships.filter(r => r.typeId !== td.id));
        onDeleted?.();
      }},
    ]);
  };

  const selectedMember = selectedId ? memberById.get(selectedId) : undefined;
  const selectedRels = selectedId
    ? relationships.filter(r => (r.fromId === selectedId || r.toId === selectedId) && nodesById.has(r.fromId === selectedId ? r.toId : r.fromId))
    : [];
  const prefToggles = [
    {on: showArchived, label: t('members.archived'), onPress: () => setPref('showArchived', !showArchived)},
    {on: showFacets, label: t('members.facets'), onPress: () => setPref('showFacets', !showFacets)},
    {on: colorAll, label: t('systemMap.showColors'), onPress: () => setPref('colorThreads', !colorAll)},
    {on: lockPositions, label: t('systemMap.lockPositions'), onPress: () => setPref('lockPositions', !lockPositions), icon: lockPositions ? '🔒' : '🔓'},
  ];
  const zoomButtons = [
    {icon: '＋', label: t('systemMap.zoomIn'), onPress: () => setScale(panRef.current.scale * ZOOM_STEP)},
    {icon: '－', label: t('systemMap.zoomOut'), onPress: () => setScale(panRef.current.scale / ZOOM_STEP)},
    {icon: '⟲', label: t('systemMap.resetView'), onPress: applyFit},
  ];
  const toolBtn = (label: string, onPress: () => void, accent = false, disabled = false) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} disabled={disabled}
      accessibilityRole="button" accessibilityLabel={label} accessibilityState={disabled ? {disabled} : undefined}
      hitSlop={{top: 7, bottom: 7}} style={{borderWidth: 1, borderColor: accent ? `${T.accent}40` : T.border, backgroundColor: accent ? T.accentBg : T.surface, borderRadius: 8, paddingHorizontal: accent ? 14 : 12, paddingVertical: 8, opacity: disabled ? 0.45 : 1}}>
      <Text style={{fontSize: fs(12), fontWeight: '600', color: accent ? T.accent : T.text}}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View ref={hostRef} onLayout={measureHost} style={{flex: 1, backgroundColor: T.bg}}>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 10}}>
        {toolBtn(t('systemMap.addMember'), () => { setShowMemberPicker(true); setMemberPickerSearch(''); measureHost(); }, false, addableCount === 0)}
        {toolBtn(t('systemMap.connections'), () => setShowConnections(true))}
        {toolBtn(t('systemMap.addRelationship'), () => openEditor(null, selectedId || undefined), true)}
        {prefToggles.map(b => (
          <TouchableOpacity key={b.label} onPress={b.onPress} activeOpacity={0.7}
            accessibilityRole="switch" accessibilityState={{checked: b.on}} accessibilityLabel={b.label}
            hitSlop={{top: 7, bottom: 7}} style={{flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: b.on ? `${T.accent}40` : T.border, backgroundColor: b.on ? T.accentBg : T.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8}}>
            {b.icon ? <Text style={{fontSize: fs(12)}} accessibilityElementsHidden importantForAccessibility="no">{b.icon}</Text> : null}
            <Text style={{fontSize: fs(12), fontWeight: '600', color: b.on ? T.accent : T.dim}}>{b.label}</Text>
          </TouchableOpacity>
        ))}
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
        <MapCanvas nodes={nodes} nodesById={nodesById} rels={visibleRels} memberById={memberById} typeById={typeById} selectedId={selectedId}
          isLit={isLit} isDimmed={isDimmed} colorAll={colorAll} tx={animTx} ty={animTy} scale={animScale} />
        <View
          pointerEvents="none"
          accessible
          accessibilityRole="image"
          accessibilityLabel={t('systemMap.mapA11y', {members: t('members.count', {count: nodes.length}), relationships: t('systemMap.relationships', {count: visibleRels.length})})}
          accessibilityHint={nodes.length > 0 ? t('systemMap.mapA11yHint') : undefined}
          accessibilityActions={nodes.filter(n => memberById.has(n.id)).map(n => ({name: `select:${n.id}`, label: memberById.get(n.id)?.name || '?'}))}
          onAccessibilityAction={e => {
            const name = e.nativeEvent.actionName;
            if (name.startsWith('select:')) setSelectedId(name.slice('select:'.length));
          }}
          style={ABS_FILL}
        />

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
          {zoomButtons.map(b => (
            <TouchableOpacity key={b.icon} onPress={b.onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={b.label}
              hitSlop={{top: 4, bottom: 4, left: 4, right: 4}} style={{width: 36, height: 36, borderRadius: 18, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center'}}>
              <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(15), color: T.accent}}>{b.icon}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {selectedMember && !editor && (
        <MemberPanel member={selectedMember} rels={selectedRels} relCount={degrees[selectedMember.id] || 0} memberById={memberById} typeById={typeById}
          depth={depth} onDepth={setDepth} roleOf={r => relationshipRoleOfOther(typeById.get(r.typeId), r, selectedMember.id, t)}
          onEditRel={r => openEditor(r)} onDeleteRel={deleteRelationship} onViewMember={onViewMember}
          onRemove={() => { removeFromMap(selectedMember.id).catch(e => logError('systemMap', e)); }} onClose={() => setSelectedId(null)} />
      )}

      {editor && (
        <RelationshipEditor key={editor.session} rel={editor.rel} presetFromId={editor.fromId} types={types} typeById={typeById} hasCustomTypes={customTypes.length > 0}
          typeLabel={typeLabel} typeInverseLabel={typeInverseLabel} typeTitle={typeTitle} roster={rosterEligible} facets={facetEligible} memberById={memberById}
          onCreateType={createType} onDeleteType={deleteType} onSubmit={draft => { submitRelationship(draft).catch(e => logError('systemMap', e)); }}
          onDelete={deleteRelationship} onClose={closeEditor} bottomInset={kbIn} maxHeight={sheetMax} />
      )}

      {showConnections && (
        <ConnectionsSheet userTypes={userTypes} presetTypes={presetTypes} usageByType={usageByType} typeLabel={typeLabel} typeInverseLabel={typeInverseLabel} typeTitle={typeTitle}
          onCreateType={createType} onUpdateType={updateType} onDeleteType={td => deleteType(td)} onClose={() => setShowConnections(false)}
          bottomInset={kbIn} maxHeight={sheetMax} />
      )}

      {showMemberPicker && (
        <SheetScrim bottomInset={kbIn} onEscape={() => setShowMemberPicker(false)} size={{height: Math.max(240, Math.min(hostH * 0.75, hostH - kbIn - 16))}}>
          <SheetHeader title={t('members.addMember')} onClose={() => setShowMemberPicker(false)} paddingBottom={8} />
          <View style={{paddingHorizontal: 16, paddingBottom: 8}}>
            <TextInput value={memberPickerSearch} onChangeText={setMemberPickerSearch} accessibilityLabel={t('common.search')} placeholder={t('common.search')} placeholderTextColor={T.muted}
              style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13)}} />
          </View>
          <ScrollView contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 28}} keyboardShouldPersistTaps="handled">
            <MemberPicker pools={mapAddPools} onPick={m => { ensureOnMap([m.id]).catch(e => logError('systemMap', e)); }} showSearch={false} search={memberPickerSearch}
              maxResults={60} emptyLabel={t('mention.noMembers')} rowSize={26} />
          </ScrollView>
        </SheetScrim>
      )}
    </View>
  );
};
