import {useCallback, useEffect, useRef, useState} from 'react';
import {Member, Relationship, RelationshipTypeDef} from '../../utils';
import {useAppStore} from '../../store/appStore';
import {logError} from '../../utils/log';
import {reportSaveError} from '../../utils/saveError';
import {NetworkManager} from '../../network/NetworkManager';
import {store, KEYS} from '../../storage';
import type {MapPoint} from './layout';

const MAP_PREF = {showArchived: 'ps.mapShowArchived', colorThreads: 'ps.mapColorThreads', showFacets: 'ps.mapShowFacets', lockPositions: 'ps.mapLockPositions'};

export type MapPref = keyof typeof MAP_PREF;

export const useSystemMapData = () => {
  const [showArchived, setShowArchived] = useState(false);
  const [showFacets, setShowFacets] = useState(true);
  const [colorAll, setColorAll] = useState(false);
  const [lockPositions, setLockPositions] = useState(false);
  const lockPositionsRef = useRef(false);
  lockPositionsRef.current = lockPositions;
  const [mapIds, setMapIds] = useState<string[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [posOverrides, setPosOverrides] = useState<Record<string, MapPoint>>({});
  const posRef = useRef(posOverrides);
  posRef.current = posOverrides;
  const [customTypes, setCustomTypes] = useState<RelationshipTypeDef[]>([]);

  useEffect(() => {
    const load = async () => {
      const [rels, savedTypes, savedMapIds, savedPositions, savedShowArchived, savedColorAll, savedShowFacets, savedLock, storedMembers] = await Promise.all([
        store.get<Relationship[]>(KEYS.relationships, []),
        store.get<RelationshipTypeDef[]>(KEYS.relationshipTypes, []),
        store.get<string[]>(KEYS.systemMapMembers),
        store.get<Record<string, MapPoint>>(KEYS.systemMapPositions),
        store.get<boolean>(MAP_PREF.showArchived, false),
        store.get<boolean>(MAP_PREF.colorThreads, false),
        store.get<boolean>(MAP_PREF.showFacets, true),
        store.get<boolean>(MAP_PREF.lockPositions, false),
        store.get<Member[]>(KEYS.members, []),
      ]);
      setShowArchived(!!savedShowArchived);
      setColorAll(!!savedColorAll);
      setShowFacets(savedShowFacets !== false);
      setLockPositions(!!savedLock);
      setCustomTypes(savedTypes || []);
      const all = rels || [];
      const memberList = storedMembers && storedMembers.length ? storedMembers : useAppStore.getState().members;
      const ids = new Set(memberList.map(m => m.id));
      const known = (id: string) => ids.size === 0 || ids.has(id);
      const valid = all.filter(r => known(r.fromId) && known(r.toId));
      setRelationships(valid);
      if (savedPositions) setPosOverrides(Object.fromEntries(Object.entries(savedPositions).filter(([id]) => known(id))));
      if (ids.size > 0 && valid.length !== all.length) await store.set(KEYS.relationships, valid);
      if (savedMapIds) {
        setMapIds(savedMapIds.filter(known));
      } else {
        const seeded = [...new Set(valid.flatMap(r => [r.fromId, r.toId]))];
        setMapIds(seeded);
        await store.set(KEYS.systemMapMembers, seeded);
      }
    };
    const reload = () => { load().catch(e => logError('systemMap', e)); };
    reload();
    return NetworkManager.onSyncApplied(reload);
  }, []);

  const setPref = (pref: MapPref, v: boolean) => {
    const set = {showArchived: setShowArchived, colorThreads: setColorAll, showFacets: setShowFacets, lockPositions: setLockPositions}[pref];
    set(v);
    store.set(MAP_PREF[pref], v).catch(e => logError('systemMap', e));
  };

  const saveMapIds = async (next: string[]) => {
    setMapIds(next);
    await store.set(KEYS.systemMapMembers, next).catch(reportSaveError);
  };
  const saveRelationships = async (next: Relationship[]) => {
    setRelationships(next);
    await store.set(KEYS.relationships, next).catch(reportSaveError);
  };
  const saveCustomTypes = async (next: RelationshipTypeDef[]) => {
    setCustomTypes(next);
    await store.set(KEYS.relationshipTypes, next).catch(reportSaveError);
  };
  const movePosition = useCallback((id: string, p: MapPoint) => {
    posRef.current = {...posRef.current, [id]: p};
    setPosOverrides(posRef.current);
  }, []);
  const savePositions = useCallback(() => { store.set(KEYS.systemMapPositions, posRef.current).catch(reportSaveError); }, []);

  return {
    showArchived, showFacets, colorAll, lockPositions, lockPositionsRef, setPref,
    mapIds, saveMapIds, relationships, saveRelationships, customTypes, saveCustomTypes,
    posOverrides, movePosition, savePositions,
  };
};
