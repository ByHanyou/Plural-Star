import {Alert} from 'react-native';
import {store, KEYS} from '../storage';
import {SystemInfo, Member, MemberGroup, HistoryEntry, JournalEntry, JournalTemplate, ShareSettings, AppSettings, ChatChannel, ChatMessage, MedicalData, FrontState, FrontTier, FrontTierKey, MemberSortMode, isFrontEmpty, frontToHistoryEntry, uid} from '../utils';
import i18n, {changeLanguage} from '../i18n/i18n';
import {getGPSLocation} from '../utils/gpsLocation';
import {requestGPSPermission, requestFilesPermission} from '../utils/permissions';
import {logError} from '../utils/log';
import type {CustomPalette} from '../theme';
import {migrateInlineChatMedia, rebaseChatMessageMedia} from '../utils/mediaUtils';
import {setEmergencyNotificationInfo, rescheduleMedicationReminders, rescheduleAppointmentReminders, showFrontNotification} from '../services/NotificationService';
import {useAppStore} from './appStore';

export const loadChatMessages = async (channels: ChatChannel[]) => {
  const {setAllChatMessages} = useAppStore.getState();
  const allMsgs: ChatMessage[] = [];
  for (const ch of channels) {
    if (ch.archived) continue;
    try {
      const msgs = await store.get<ChatMessage[]>(`ps:chat:${ch.id}`, []);
      if (msgs) {
        const {messages: migrated, changed} = await migrateInlineChatMedia(msgs);
        const {messages: rebased, changed: rebasedChanged} = rebaseChatMessageMedia(changed ? migrated : msgs);
        const finalMsgs = rebasedChanged ? rebased : (changed ? migrated : msgs);
        if (changed || rebasedChanged) await store.set(`ps:chat:${ch.id}`, finalMsgs);
        allMsgs.push(...finalMsgs);
      }
    } catch (e) {
      console.error('[PS] chat load error:', ch.id, e);
    }
  }
  setAllChatMessages(allMsgs);
};

export const saveSystem = async (d: SystemInfo) => {
  const {setSystem} = useAppStore.getState();
  setSystem(d); await store.set(KEYS.system, d);
};

export const saveMembers = async (d: Member[]) => {
  const {loaded, front, setMembers, setFront} = useAppStore.getState();
  if (!loaded && d.length === 0) {
    console.warn('[PS] Blocked pre-load save of empty members');
    return;
  }
  setMembers(d);
  await store.set(KEYS.members, d);
  const archivedIds = new Set(d.filter(m => m.archived).map(m => m.id));
  if (archivedIds.size > 0 && front) {
    const pruneTier = (tier: any) => tier ? {...tier, memberIds: (tier.memberIds || []).filter((id: string) => !archivedIds.has(id))} : tier;
    const next: any = {...front, primary: pruneTier(front.primary), coFront: pruneTier(front.coFront), coConscious: pruneTier(front.coConscious)};
    const count = (f: any) => (f?.primary?.memberIds?.length || 0) + (f?.coFront?.memberIds?.length || 0) + (f?.coConscious?.memberIds?.length || 0);
    if (count(next) !== count(front)) {
      const cleaned = isFrontEmpty(next) ? null : next;
      setFront(cleaned);
      await store.set(KEYS.front, cleaned);
    }
  }
};

export const saveHistory = async (d: HistoryEntry[]) => {
  const {loaded, setHistory} = useAppStore.getState();
  if (!loaded && d.length === 0) return;
  setHistory(d); await store.set(KEYS.history, d);
};

export const saveJournal = async (d: JournalEntry[]) => {
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
  const {loaded, setGroups} = useAppStore.getState();
  if (!loaded && d.length === 0) return;
  setGroups(d); await store.set(KEYS.groups, d);
};

export const savePalettes = async (d: CustomPalette[]) => {
  const {setPalettes} = useAppStore.getState();
  setPalettes(d); await store.set(KEYS.palettes, d);
};

export const saveChatChannels = async (d: ChatChannel[]) => {
  const {setChatChannels} = useAppStore.getState();
  setChatChannels(d); await store.set(KEYS.chatChannels, d); await loadChatMessages(d);
};

export const saveMedical = async (d: MedicalData) => {
  const {setMedical, front, members, system, appSettings} = useAppStore.getState();
  setMedical(d);
  await store.set(KEYS.medical, d);
  setEmergencyNotificationInfo(null);
  await rescheduleMedicationReminders(d.medications || []);
  await rescheduleAppointmentReminders(d.appointments || []);
  if (appSettings.notificationsEnabled) {
    showFrontNotification(front, members, system.name).catch(e => console.error('[PS] notif error:', e));
  }
};

export const selectPalette = async (id: string) => {
  const {appSettings, setActivePaletteId, setAppSettings} = useAppStore.getState();
  setActivePaletteId(id);
  const updated = {...appSettings, activePaletteId: id, lightMode: id === '__light__'};
  setAppSettings(updated);
  await store.set(KEYS.settings, updated);
  await store.set(KEYS.lightMode, id === '__light__');
};

export const updateLastLocation = async (loc: string | undefined) => {
  const {setLastKnownLocation} = useAppStore.getState();
  if (loc) { setLastKnownLocation(loc); await store.set('ps:lastLocation', loc); }
};

export const clearLastLocation = async () => {
  const {setLastKnownLocation} = useAppStore.getState();
  setLastKnownLocation(undefined);
  await store.remove('ps:lastLocation');
};

export const maybeGPS = async (manualLocation?: string): Promise<string | undefined> => {
  const {appSettings} = useAppStore.getState();
  const loc = manualLocation?.trim() || undefined;
  if (loc) return loc;
  if (appSettings.gpsEnabled) { const gps = await getGPSLocation(); return gps || undefined; }
  return undefined;
};

export const updateFront = async (primary: FrontTier, coFront: FrontTier, coConscious: FrontTier) => {
  const {front, history, members, appSettings, setFront} = useAppStore.getState();
  const now = Date.now();
  const cleanTier = (tier: FrontTier): FrontTier =>
    tier.memberIds.length === 0
      ? {memberIds: [], mood: undefined, note: '', location: undefined, energyLevel: undefined}
      : tier;
  const cleanPrimary = cleanTier(primary);
  const cleanCoFront = cleanTier(coFront);
  const cleanCoConscious = cleanTier(coConscious);
  const isEmpty = cleanPrimary.memberIds.length === 0 && cleanCoFront.memberIds.length === 0 && cleanCoConscious.memberIds.length === 0;

  const sameMembers = (a: string[] = [], b: string[] = []) =>
    a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
  const continuing = !!front && !isEmpty
    && sameMembers(front.primary.memberIds, cleanPrimary.memberIds)
    && sameMembers(front.coFront.memberIds, cleanCoFront.memberIds)
    && sameMembers(front.coConscious.memberIds, cleanCoConscious.memberIds);

  const explicitLocation = cleanPrimary.location?.trim() || undefined;
  const nf: FrontState | null = isEmpty ? null : {primary: {...cleanPrimary, location: explicitLocation}, coFront: cleanCoFront, coConscious: cleanCoConscious, startTime: continuing ? front!.startTime : now};

  let newHistory = [...history];
  if (front && !continuing) {
    newHistory = newHistory.map(e =>
      e.endTime === null && e.startTime === front.startTime && (!e.changeType || e.changeType === 'front') ? {...e, endTime: now} : e);
  }

  let finalFront = nf;
  if (nf) {
    if (continuing) {
      const extras: HistoryEntry[] = [];
      const moodChanged = (nf.primary.mood || undefined) !== (front!.primary.mood || undefined);
      const locChanged = (nf.primary.location || undefined) !== (front!.primary.location || undefined);
      const noteChanged = (nf.primary.note || undefined) !== (front!.primary.note || undefined);
      if (moodChanged || locChanged) {
        const entry = frontToHistoryEntry(nf, null, moodChanged ? 'mood' : 'location');
        entry.changeTime = now;
        extras.push(entry);
      }
      if (noteChanged) {
        const entry = frontToHistoryEntry(nf, null, 'note');
        entry.changeTime = now + 1;
        extras.push(entry);
      }
      const tierTracked = (a: FrontTier, b: FrontTier) =>
        (a.mood || undefined) !== (b.mood || undefined) || (a.energyLevel ?? undefined) !== (b.energyLevel ?? undefined);
      const segment = tierTracked(nf.primary, front!.primary) || tierTracked(nf.coFront, front!.coFront)
        || tierTracked(nf.coConscious, front!.coConscious) || locChanged;
      if (segment) {
        finalFront = {...nf, startTime: now};
        const segEntry = frontToHistoryEntry(finalFront, null, 'front');
        newHistory = newHistory.map(e =>
          e.endTime === null && e.startTime === front!.startTime && (!e.changeType || e.changeType === 'front') ? {...e, endTime: now} : e);
        newHistory = [segEntry, ...extras, ...newHistory];
      } else {
        const frontEntry = frontToHistoryEntry(nf, null, 'front');
        newHistory = newHistory.map(e =>
          e.endTime === null && e.startTime === front!.startTime && (!e.changeType || e.changeType === 'front') ? frontEntry : e);
        newHistory = [...extras, ...newHistory];
      }
    } else {
      const frontEntry = frontToHistoryEntry(nf, null, 'front');
      newHistory = [frontEntry, ...newHistory];
    }
  }

  setFront(finalFront);
  await store.set(KEYS.front, finalFront);
  await saveHistory(newHistory);

  if (nf) {
    const allFrontIds = [...nf.primary.memberIds, ...nf.coFront.memberIds, ...nf.coConscious.memberIds];
    if (allFrontIds.length > 0) {
      try {
        const notes = await store.get<any[]>(KEYS.noteboards) || [];
        if (notes && notes.length > 0) {
          const memberNotes: Record<string, number> = {};
          for (const n of notes) {
            if (allFrontIds.includes(n.memberId)) {
              memberNotes[n.memberId] = (memberNotes[n.memberId] || 0) + 1;
            }
          }
          const withNotes = Object.entries(memberNotes);
          if (withNotes.length > 0) {
            const names = withNotes.map(([id, count]) => {
              const m = members.find(mm => mm.id === id);
              return `${m?.name || '?'} (${count})`;
            }).join(', ');
            Alert.alert(i18n.t('noteboard.title'), `${names}`);
          }
        }
      } catch (e) { logError('front', e); }
    }
  }

  if (nf && appSettings.gpsEnabled && !cleanPrimary.location?.trim()) {
    try {
      const gpsLocation = await getGPSLocation();
      if (gpsLocation && gpsLocation !== explicitLocation) {
        const patched: FrontState = {...nf, primary: {...nf.primary, location: gpsLocation}};
        useAppStore.getState().setFront(patched);
        await store.set(KEYS.front, patched);
        await updateLastLocation(gpsLocation);
      }
    } catch (e) { console.error('[PS] GPS post-save error:', e); }
  } else if (explicitLocation) {
    await updateLastLocation(explicitLocation);
  } else if (nf) {
    await clearLastLocation();
  }
};

export const updateFrontDetails = async (tier: FrontTierKey, mood?: string, location?: string, note?: string) => {
  const {front, history, setFront} = useAppStore.getState();
  if (!front) return;
  const now = Date.now();
  const tierData = front[tier];
  const resolvedLocation = tier === 'primary' ? await maybeGPS(location) : tierData.location;
  const updatedTier = {...tierData, mood, location: resolvedLocation, note: note ?? tierData.note};
  const moodChanged = (mood || undefined) !== (tierData.mood || undefined);
  const locChanged = tier === 'primary' && (resolvedLocation || undefined) !== (tierData.location || undefined);
  const noteChanged = note !== undefined && (note || undefined) !== (tierData.note || undefined);
  const segment = moodChanged || locChanged;
  const updated = segment ? {...front, [tier]: updatedTier, startTime: now} : {...front, [tier]: updatedTier};
  setFront(updated); await store.set(KEYS.front, updated);
  if (tier === 'primary') {
    if (resolvedLocation) await updateLastLocation(resolvedLocation);
    else await clearLastLocation();
  }
  const extras: HistoryEntry[] = [];
  if (moodChanged || locChanged) { const entry = frontToHistoryEntry(updated, null, moodChanged ? 'mood' : 'location', tier); entry.changeTime = now; extras.push(entry); }
  if (noteChanged) { const entry = frontToHistoryEntry(updated, null, 'note', tier); entry.changeTime = now + 1; extras.push(entry); }
  let newHistory = [...history];
  if (segment) {
    const segEntry = frontToHistoryEntry(updated, null, 'front');
    newHistory = newHistory.map(e =>
      e.endTime === null && e.startTime === front.startTime && (!e.changeType || e.changeType === 'front') ? {...e, endTime: now} : e);
    newHistory = [segEntry, ...extras, ...newHistory];
    await saveHistory(newHistory);
  } else if (extras.length > 0) {
    await saveHistory([...extras, ...newHistory]);
  }
};

export const quickAddToFront = async (id: string, tierKey: FrontTierKey) => {
  const {front} = useAppStore.getState();
  const strip = (tier: FrontTier): FrontTier => ({...tier, memberIds: tier.memberIds.filter(x => x !== id)});
  const tiers: Record<FrontTierKey, FrontTier> = {
    primary: front ? strip(front.primary) : {memberIds: [], note: ''},
    coFront: front ? strip(front.coFront) : {memberIds: [], note: ''},
    coConscious: front ? strip(front.coConscious) : {memberIds: [], note: ''},
  };
  tiers[tierKey] = {...tiers[tierKey], memberIds: [...tiers[tierKey].memberIds, id]};
  await updateFront(tiers.primary, tiers.coFront, tiers.coConscious);
};

export const removeFromFront = async (id: string) => {
  const {front} = useAppStore.getState();
  if (!front) return;
  await updateFront(
    {...front.primary, memberIds: front.primary.memberIds.filter(x => x !== id)},
    {...front.coFront, memberIds: front.coFront.memberIds.filter(x => x !== id)},
    {...front.coConscious, memberIds: front.coConscious.memberIds.filter(x => x !== id)},
  );
};

export const saveMember = async (m: Member) => {
  const {members} = useAppStore.getState();
  const u = members.find(x => x.id === m.id) ? members.map(x => (x.id === m.id ? m : x)) : [...members, m];
  await saveMembers(u);
};

export const deleteMember = async (id: string) => {
  const {members} = useAppStore.getState();
  return saveMembers(members.map(m => m.id === id ? {...m, archived: true, deleted: true} : m));
};

export const bulkSetArchived = async (ids: string[], archived: boolean) => {
  const {members} = useAppStore.getState();
  const idSet = new Set(ids);
  await saveMembers(members.map(m => idSet.has(m.id) ? {...m, archived} : m));
};

export const bulkDeleteMembers = async (ids: string[]) => {
  const {members} = useAppStore.getState();
  const idSet = new Set(ids);
  await saveMembers(members.map(m => idSet.has(m.id) ? {...m, archived: true, deleted: true} : m));
};

export const bulkAddGroups = async (ids: string[], groupIds: string[]) => {
  const {members} = useAppStore.getState();
  const idSet = new Set(ids);
  await saveMembers(members.map(m => idSet.has(m.id) ? {...m, groupIds: [...new Set([...(m.groupIds || []), ...groupIds])]} : m));
};

export const bulkRemoveFromGroup = async (ids: string[], groupId: string) => {
  const {members} = useAppStore.getState();
  const idSet = new Set(ids);
  await saveMembers(members.map(m => idSet.has(m.id) ? {...m, groupIds: (m.groupIds || []).filter(g => g !== groupId)} : m));
};

export const saveEntry = async (e: JournalEntry) => {
  const {journal} = useAppStore.getState();
  const u = journal.find(x => x.id === e.id) ? journal.map(x => (x.id === e.id ? e : x)) : [e, ...journal];
  await saveJournal(u);
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

export const ensureSelfMember = async (): Promise<Member> => {
  const {members, appSettings, system} = useAppStore.getState();
  const selfMember = members.find(m => m.id === appSettings.selfMemberId && !m.isCustomFront)
    || members.find(m => !m.isCustomFront && !m.archived);
  if (selfMember) {
    if (selfMember.id !== appSettings.selfMemberId) await saveAppSettings({...appSettings, selfMemberId: selfMember.id});
    return selfMember;
  }
  const nm: Member = {id: uid(), name: system.name || i18n.t('share.system'), pronouns: '', role: '', color: '#DAA520', description: '', tags: [], groupIds: [], customFields: [], createdAt: Date.now()};
  await saveMembers([...members, nm]);
  await saveAppSettings({...useAppStore.getState().appSettings, selfMemberId: nm.id});
  return nm;
};

export const applyFrontState = async (f: FrontState | null) => {
  const {setFront} = useAppStore.getState();
  setFront(f);
  await store.set(KEYS.front, f);
};

export const saveMemberListFields = async (next: {groups?: boolean; descriptions?: boolean; pronouns?: boolean; roles?: boolean}) => {
  const {appSettings, setAppSettings} = useAppStore.getState();
  const sNext = {...appSettings, memberListFields: next}; setAppSettings(sNext); await store.set(KEYS.settings, sNext);
};

export const saveMemberSortMode = async (mode: MemberSortMode) => {
  const {appSettings, setAppSettings} = useAppStore.getState();
  const next = {...appSettings, memberSortMode: mode}; setAppSettings(next); await store.set(KEYS.settings, next);
};

export const reorderMember = async (id: string, direction: 'up' | 'down') => {
  const {members} = useAppStore.getState();
  const target = members.find(m => m.id === id);
  if (!target) return;
  const inSubset = (m: Member) => !m.archived && !!m.isCustomFront === !!target.isCustomFront;
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
