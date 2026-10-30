import {store, KEYS, chatMsgKey} from '../storage';
import {SystemInfo, Member, MemberGroup, HistoryEntry, JournalEntry, JournalTemplate, ShareSettings, AppSettings, NoteboardEntry, Relationship, allFrontMemberIds, ChatChannel, ChatCategory, ChatMessage, PlannerData, FrontState, FrontTier, FrontTierKey, MemberSortMode, FrontSortMode, closeOpenFrontEntry, frontTiersWith, frontTiersWithout, pruneFrontOfGone, frontOfKnown, tierOfKnown, detailChangeEntries, frontToHistoryEntry, tierDetailChanges, withMemberSince, computeFrontUpdate, mergeTags, findSelfMember, newSelfMember, upsertById} from '../utils';
import i18n, {changeLanguage} from '../i18n/i18n';
import {getGPSLocation} from '../utils/gpsLocation';
import {requestGPSPermission, requestFilesPermission} from '../utils/permissions';
import {log, logError} from '../utils/log';
import {Emitter} from '../utils/emitter';
import type {CustomPalette} from '../theme';
import {LIGHT_PALETTE} from '../theme';
import {deleteAvatar} from '../utils/mediaUtils';
import {migrateInlineChatMedia, rebaseChatMessageMedia} from '../utils/mediaMigrations';
import {reschedulePlannerNotifications} from '../services/reminders';
import {mailCountsFor} from '../mailbox/mailbox';
import {useAppStore} from './appStore';

export const loadChatMessages = async (channels: ChatChannel[]) => {
  const {setAllChatMessages} = useAppStore.getState();
  const allMsgs: ChatMessage[] = [];
  for (const ch of channels) {
    try {
      const msgs = await store.get<ChatMessage[]>(chatMsgKey(ch.id), []);
      if (msgs) {
        const migrated = await migrateInlineChatMedia(msgs);
        const rebased = rebaseChatMessageMedia(migrated.messages);
        if (migrated.changed || rebased.changed) await store.set(chatMsgKey(ch.id), rebased.messages);
        if (!ch.archived) for (const m of rebased.messages) allMsgs.push(m);
      }
    } catch (e) {
      log.error('store', 'chat load error:', ch.id, e);
    }
  }
  setAllChatMessages(allMsgs);
};

export const saveSystem = async (d: SystemInfo) => {
  const {setSystem} = useAppStore.getState();
  setSystem(d); await store.set(KEYS.system, d);
};

const pruneFrontFor = async (members: Member[]) => {
  const {front, setFront} = useAppStore.getState();
  const cleaned = pruneFrontOfGone(members, front);
  if (cleaned === undefined) return;
  setFront(cleaned);
  await store.set(KEYS.front, cleaned);
};

export const pruneFrontOfRemovedMembers = () => pruneFrontFor(useAppStore.getState().members);

export const saveMembers = async (d: Member[]) => {
  const {loaded, setMembers} = useAppStore.getState();
  if (!loaded && d.length === 0) {
    log.warn('store', 'Blocked pre-load save of empty members');
    return;
  }
  setMembers(d);
  await store.set(KEYS.members, d);
  await pruneFrontFor(d);
};

export const saveHistory = async (d: HistoryEntry[]) => {
  const {loaded, setHistory} = useAppStore.getState();
  if (!loaded && d.length === 0) return;
  setHistory(d); await store.set(KEYS.history, d);
};

const saveJournal = async (d: JournalEntry[]) => {
  const {loaded, setJournal} = useAppStore.getState();
  if (!loaded && d.length === 0) return;
  setJournal(d); await store.set(KEYS.journal, d);
};

export const saveJournalTemplates = async (d: JournalTemplate[]) => {
  const {loaded, setJournalTemplates} = useAppStore.getState();
  if (!loaded && d.length === 0) return;
  setJournalTemplates(d); await store.set(KEYS.journalTemplates, d);
};

export const saveShareSettings = async (d: ShareSettings) => {
  const {setShareSettings} = useAppStore.getState();
  setShareSettings(d); await store.set(KEYS.share, d);
};

export const saveGroups = async (d: MemberGroup[]) => {
  const {loaded, setGroups, groups: previous, members, setMembers} = useAppStore.getState();
  if (!loaded && d.length === 0) return;
  setGroups(d); await store.set(KEYS.groups, d);
  const kept = new Set(d.map(g => g.id));
  const gone = new Set((previous || []).filter(g => !kept.has(g.id)).map(g => g.id));
  if (gone.size === 0) return;
  let changed = false;
  const next = members.map(m => {
    if (!m.groupIds || !m.groupIds.some(id => gone.has(id))) return m;
    changed = true;
    return {...m, groupIds: m.groupIds.filter(id => !gone.has(id))};
  });
  if (changed) { setMembers(next); await store.set(KEYS.members, next); }
};

export const savePalettes = async (d: CustomPalette[]) => {
  const {setPalettes} = useAppStore.getState();
  setPalettes(d); await store.set(KEYS.palettes, d);
};

export const saveChatChannels = async (d: ChatChannel[]) => {
  const {setChatChannels} = useAppStore.getState();
  setChatChannels(d); await store.set(KEYS.chatChannels, d);
};

export const saveChatCategories = async (d: ChatCategory[]) => {
  const {setChatCategories} = useAppStore.getState();
  setChatCategories(d); await store.set(KEYS.chatCategories, d);
};

export const savePlanner = async (d: PlannerData) => {
  const {setPlanner} = useAppStore.getState();
  setPlanner(d);
  await store.set(KEYS.planner, d);
  await reschedulePlannerNotifications(d);
};

export const selectPalette = async (id: string) => {
  const {appSettings, setActivePaletteId, setAppSettings} = useAppStore.getState();
  setActivePaletteId(id);
  const updated = {...appSettings, activePaletteId: id, lightMode: id === LIGHT_PALETTE.id};
  setAppSettings(updated);
  await store.set(KEYS.settings, updated);
  await store.set(KEYS.lightMode, id === LIGHT_PALETTE.id);
};

const updateLastLocation = async (loc: string | undefined) => {
  const {setLastKnownLocation} = useAppStore.getState();
  if (loc) { setLastKnownLocation(loc); await store.set(KEYS.lastLocation, loc); }
};

const clearLastLocation = async () => {
  const {setLastKnownLocation} = useAppStore.getState();
  setLastKnownLocation(undefined);
  await store.remove(KEYS.lastLocation);
};

const maybeGPS = async (manualLocation?: string): Promise<string | undefined> => {
  const {appSettings} = useAppStore.getState();
  const loc = manualLocation?.trim() || undefined;
  if (loc) return loc;
  if (appSettings.gpsEnabled) { const gps = await getGPSLocation(); return gps || undefined; }
  return undefined;
};

const frontMail = new Emitter<[names: string]>('front');

export const onFrontersHaveMail = (fn: (names: string) => void): (() => void) => frontMail.on(fn);

export const updateFront = async (primary: FrontTier, coFront: FrontTier, coConscious: FrontTier) => {
  const {front, history, members, appSettings, setFront} = useAppStore.getState();
  const now = Date.now();
  const known = new Set(members.map(m => m.id));
  const nextPrimary = tierOfKnown(primary, known);
  const {front: finalFront, history: newHistory} = computeFrontUpdate(frontOfKnown(front, known), history, nextPrimary, tierOfKnown(coFront, known), tierOfKnown(coConscious, known), now);
  const explicitLocation = nextPrimary.memberIds.length > 0 ? (nextPrimary.location?.trim() || undefined) : undefined;

  setFront(finalFront);
  await store.set(KEYS.front, finalFront);
  await saveHistory(newHistory);

  if (finalFront) {
    const allFrontIds = allFrontMemberIds(finalFront);
    if (allFrontIds.length > 0) {
      try {
        const notes = await store.get<NoteboardEntry[]>(KEYS.noteboards) || [];
        const withNotes = [...mailCountsFor(notes, allFrontIds)];
        if (withNotes.length > 0) {
          const names = withNotes.map(([id, count]) => {
            const m = members.find(mm => mm.id === id);
            return `${m?.name || '?'} (${count})`;
          }).join(', ');
          frontMail.emit(names);
        }
      } catch (e) { logError('front', e); }
    }
  }

  if (finalFront && appSettings.gpsEnabled && !explicitLocation) {
    try {
      const gpsLocation = await getGPSLocation();
      const live = useAppStore.getState().front;
      if (gpsLocation && live && live.startTime === finalFront.startTime && !live.primary.location?.trim()) {
        const patched: FrontState = {...live, primary: {...live.primary, location: gpsLocation}};
        useAppStore.getState().setFront(patched);
        await store.set(KEYS.front, patched);
        await updateLastLocation(gpsLocation);
      }
    } catch (e) { log.error('store', 'GPS post-save error:', e); }
  } else if (explicitLocation) {
    await updateLastLocation(explicitLocation);
  } else if (finalFront) {
    await clearLastLocation();
  }
};

export const updateFrontDetails = async (tier: FrontTierKey, mood?: string, location?: string, note?: string, energyLevel?: number) => {
  const resolvedLocation = tier === 'primary' ? await maybeGPS(location) : location;
  const {front, history, setFront} = useAppStore.getState();
  if (!front) return;
  const now = Date.now();
  const tierData = front[tier];
  const updatedTier = {...tierData, mood, location: resolvedLocation, note: note ?? tierData.note, energyLevel};
  const changed = tierDetailChanges(tierData, updatedTier);
  const segment = changed.mood || changed.location;
  const updated = segment ? {...front, [tier]: updatedTier, startTime: now} : {...front, [tier]: updatedTier};
  setFront(updated); await store.set(KEYS.front, updated);
  if (tier === 'primary') {
    if (resolvedLocation) await updateLastLocation(resolvedLocation);
    else await clearLastLocation();
  }
  const extras = detailChangeEntries(updated, changed, now, tier);
  if (segment) {
    const segEntry = frontToHistoryEntry(updated, null, 'front');
    await saveHistory([segEntry, ...extras, ...closeOpenFrontEntry(history, front.startTime, now)]);
  } else if (extras.length > 0) {
    await saveHistory([...extras, ...history]);
  }
};

export const quickAddToFront = async (id: string, tierKey: FrontTierKey) => {
  const tiers = frontTiersWith(useAppStore.getState().front, id, tierKey);
  await updateFront(tiers.primary, tiers.coFront, tiers.coConscious);
};

export const removeFromFront = async (id: string) => {
  const {front} = useAppStore.getState();
  if (!front) return;
  const tiers = frontTiersWithout(front, id);
  await updateFront(tiers.primary, tiers.coFront, tiers.coConscious);
};

export const saveMember = async (m: Member) => {
  const {members} = useAppStore.getState();
  const prev = members.find(x => x.id === m.id);
  const u = upsertById(members, m);
  await saveMembers(u);
  if (prev?.avatar && !m.avatar) deleteAvatar(m.id).catch(e => logError('saveMember: avatar', e));
};

const forgetMemberLinks = async (id: string): Promise<void> => {
  try {
    const rels = (await store.get<Relationship[]>(KEYS.relationships, [])) || [];
    const keep = rels.filter(r => r && r.fromId !== id && r.toId !== id);
    if (keep.length !== rels.length) await store.set(KEYS.relationships, keep);
  } catch (e) { logError('deleteMember: relationships', e); }
  try {
    const ids = (await store.get<string[]>(KEYS.systemMapMembers, [])) || [];
    if (ids.includes(id)) await store.set(KEYS.systemMapMembers, ids.filter(x => x !== id));
  } catch (e) { logError('deleteMember: map members', e); }
  try {
    const pos = (await store.get<Record<string, unknown>>(KEYS.systemMapPositions, {})) || {};
    if (id in pos) { const rest = {...pos}; delete rest[id]; await store.set(KEYS.systemMapPositions, rest); }
  } catch (e) { logError('deleteMember: map positions', e); }
};

const updateMembers = (ids: Iterable<string>, change: (m: Member) => Member): Promise<void> => {
  const idSet = new Set(ids);
  return saveMembers(useAppStore.getState().members.map(m => (idSet.has(m.id) ? change(m) : m)));
};

export const restoreDeletedMember = (id: string) => updateMembers([id], m => ({...m, deleted: false, archived: false}));

export const bulkSetFacet = (ids: string[], toFacet: boolean) => updateMembers(ids, m => (m.isCustomFront ? m : {...m, isFacet: toFacet}));

export const bulkSetArchived = (ids: string[], archived: boolean) => updateMembers(ids, m => ({...m, archived}));

export const bulkDeleteMembers = async (ids: string[]) => {
  for (const id of ids) await forgetMemberLinks(id);
  await updateMembers(ids, m => ({...m, archived: true, deleted: true}));
};

export const deleteMember = (id: string) => bulkDeleteMembers([id]);

export const bulkAddGroups = (ids: string[], groupIds: string[]) =>
  updateMembers(ids, m => ({...m, groupIds: [...new Set([...(m.groupIds || []), ...groupIds])]}));

export const bulkAddTags = async (ids: string[], tags: string[]) => {
  if (ids.length === 0 || tags.length === 0) return;
  await updateMembers(ids, m => {
    const next = mergeTags(m.tags, tags);
    return next.length === (m.tags || []).length ? m : {...m, tags: next};
  });
};

export const bulkRemoveFromGroup = (ids: string[], groupId: string) =>
  updateMembers(ids, m => ({...m, groupIds: (m.groupIds || []).filter(g => g !== groupId)}));

export const saveEntry = async (e: JournalEntry) => {
  const {journal} = useAppStore.getState();
  await saveJournal(upsertById(journal, e, true));
};

export const deleteEntry = async (id: string) => {
  const {journal} = useAppStore.getState();
  return saveJournal(journal.filter(e => e.id !== id));
};

export const addJournalEntry = async (e: JournalEntry) => {
  const {journal} = useAppStore.getState();
  return saveJournal([e, ...journal]);
};

export const saveAppSettings = async (d: AppSettings) => {
  const {appSettings, setAppSettings} = useAppStore.getState();
  const gpsJustEnabled = d.gpsEnabled && !appSettings.gpsEnabled;
  const filesJustEnabled = d.filesEnabled && !appSettings.filesEnabled;
  setAppSettings(d);
  await store.set(KEYS.settings, d);
  if (d.language) { changeLanguage(d.language); await store.set(KEYS.language, d.language); }
  if (gpsJustEnabled) { await requestGPSPermission(); }
  if (filesJustEnabled) { await requestFilesPermission(); }
};

const resolveSelfMember = async (selfMemberId: string | undefined): Promise<Member> => {
  const {members, system} = useAppStore.getState();
  const existing = findSelfMember(members, selfMemberId);
  if (existing) return existing;
  const nm = newSelfMember(system.name || i18n.t('share.system'));
  await saveMembers([...members, nm]);
  return nm;
};

export const ensureSelfMember = async (): Promise<Member> => {
  const {appSettings} = useAppStore.getState();
  const self = await resolveSelfMember(appSettings.selfMemberId);
  if (self.id !== appSettings.selfMemberId) await saveAppSettings({...useAppStore.getState().appSettings, selfMemberId: self.id});
  return self;
};

export const saveSettingsWithSelf = async (s: AppSettings): Promise<void> => {
  if (s.accountMode !== 'singlet') return saveAppSettings(s);
  const self = await resolveSelfMember(s.selfMemberId);
  await saveAppSettings({...s, selfMemberId: self.id});
};

export const completeSetup = async ({name, description, singlet}: {name: string; description: string; singlet?: boolean}): Promise<void> => {
  await saveSystem({name, description});
  if (!singlet) return;
  const self = newSelfMember(name);
  const {members, appSettings} = useAppStore.getState();
  await saveMembers([...members, self]);
  await saveAppSettings({...appSettings, accountMode: 'singlet', selfMemberId: self.id});
};

export const loadLastLocation = async (): Promise<void> => {
  const loc = await store.get<string>(KEYS.lastLocation);
  if (loc) useAppStore.getState().setLastKnownLocation(loc);
};

export const applyFrontState = async (f: FrontState | null, since?: number) => {
  const {front, setFront} = useAppStore.getState();
  const now = Date.now();
  const next = withMemberSince(f, front, typeof since === 'number' && Number.isFinite(since) && since > 0 ? Math.min(since, now) : now);
  setFront(next);
  await store.set(KEYS.front, next);
};

const patchAppSettings = async (patch: Partial<AppSettings>) => {
  const {appSettings, setAppSettings} = useAppStore.getState();
  const next = {...appSettings, ...patch}; setAppSettings(next); await store.set(KEYS.settings, next);
};

export const saveMemberListFields = (next: NonNullable<AppSettings['memberListFields']>) => patchAppSettings({memberListFields: next});

export const saveMemberSortMode = (mode: MemberSortMode) => patchAppSettings({memberSortMode: mode});

export const saveGroupSortMode = (mode: MemberSortMode) => patchAppSettings({groupSortMode: mode});

export const saveFrontSortMode = (mode: FrontSortMode) => patchAppSettings({frontSortMode: mode});

export const saveFrontCustomOrder = (order: string[]) => patchAppSettings({frontCustomOrder: order});

export const reorderMember = async (id: string, direction: 'up' | 'down') => {
  const {members} = useAppStore.getState();
  const target = members.find(m => m.id === id);
  if (!target) return;
  const inSubset = (m: Member) => !m.archived && !!m.isCustomFront === !!target.isCustomFront && !!m.isFacet === !!target.isFacet;
  const subset = members.filter(inSubset);
  const rest = members.filter(m => !inSubset(m));
  const ordered = [...subset].sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER));
  const idx = ordered.findIndex(m => m.id === id);
  if (idx === -1) return;
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= ordered.length) return;
  [ordered[idx], ordered[swapWith]] = [ordered[swapWith], ordered[idx]];
  const reindexed = ordered.map((m, i) => ({...m, sortOrder: i}));
  await saveMembers([...reindexed, ...rest]);
};
