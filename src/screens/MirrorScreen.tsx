import React, {useCallback, useEffect, useRef, useState} from 'react';
import {View, Modal, Platform, ScrollView, FlatList, TouchableOpacity, Image, ActivityIndicator, StatusBar} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {NetworkManager} from '../network/NetworkManager';
import {MirrorFeature, MirrorCacheEntry, MirrorMember, MirrorGroup} from '../network/types';
import {ThemeColors, fontScale} from '../theme';
import {Member, MemberGroup, CustomFieldDef, CustomFieldType, JournalEntry, HistoryEntry, fmtTime} from '../utils';
import {GroupBrowser} from '../components/GroupBrowser';
import {MemberModal} from '../modals/MemberModal';
import {JournalModal} from '../modals/JournalModal';
import {HistoryScreen} from './HistoryScreen';
import {useKeyboardHeight} from '../hooks/useKeyboardHeight';

interface Props {
  theme: ThemeColors;
  visible: boolean;
  peerId: string;
  displayName: string;
  feature: MirrorFeature;
  onClose: () => void;
}

export const MirrorScreen = ({theme: T, visible, peerId, displayName, feature, onClose}: Props) => {
  const {t} = useTranslation();
  const fs = fontScale(T);
  const insets = useSafeAreaInsets();
  const kbHeight = useKeyboardHeight();
  const [entry, setEntry] = useState<MirrorCacheEntry | null>(null);
  const [memberCache, setMemberCache] = useState<MirrorMember[]>([]);
  const [memberMedia, setMemberMedia] = useState<Record<string, string>>({});
  const [requesting, setRequesting] = useState<'idle' | 'sent' | 'failed'>('idle');
  const [browseId, setBrowseId] = useState<string | null>(null);
  const [viewMemberId, setViewMemberId] = useState<string | null>(null);
  const [viewEntry, setViewEntry] = useState<JournalEntry | null>(null);
  const [unlockFor, setUnlockFor] = useState<JournalEntry | null>(null);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const waitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onlineRef = useRef(false);

  const reload = useCallback(async () => {
    const cache = await NetworkManager.loadMirror(peerId, feature);
    setEntry(cache);
    if (feature === 'journal' || feature === 'groups' || feature === 'history') {
      const mc = await NetworkManager.loadMirror(peerId, 'members');
      setMemberCache(mc && Array.isArray(mc.data) ? mc.data : []);
      setMemberMedia(mc?.media || {});
    }
  }, [peerId, feature]);

  const request = useCallback(() => {
    setRequesting('sent');
    if (waitRef.current) clearTimeout(waitRef.current);
    waitRef.current = setTimeout(() => {
      waitRef.current = null;
      setRequesting(r => (r === 'sent' ? 'failed' : r));
    }, 12000);
    NetworkManager.requestMirror(peerId, feature)
      .catch(() => setRequesting('failed'));
    if (feature === 'groups' || feature === 'history') {
      NetworkManager.requestMirror(peerId, 'members').catch(() => {});
    }
  }, [peerId, feature]);

  useEffect(() => {
    if (!visible) return;
    setEntry(null);
    setBrowseId(null);
    setViewMemberId(null);
    setViewEntry(null);
    setUnlockFor(null);
    reload();
    request();
    const unsub = NetworkManager.onMirrorUpdated((pid, feat) => {
      if (pid === peerId && (feat === feature || feat === 'members')) {
        if (waitRef.current) {
          clearTimeout(waitRef.current);
          waitRef.current = null;
        }
        setRequesting('idle');
        reload();
      }
    });
    const unsubNet = NetworkManager.subscribe(s => {
      const online = s.onlinePeers.includes(peerId);
      const was = onlineRef.current;
      onlineRef.current = online;
      if (online && !was) request();
    });
    return () => {
      unsub();
      unsubNet();
      if (waitRef.current) {
        clearTimeout(waitRef.current);
        waitRef.current = null;
      }
    };
  }, [visible, peerId, feature, reload, request]);

  const featureLabel =
    feature === 'members' ? t('tabs.members')
    : feature === 'groups' ? t('members.fieldGroups')
    : feature === 'history' ? t('tabs.history')
    : t('tabs.journal');

  const mirrorMembers: MirrorMember[] =
    feature === 'members' && Array.isArray(entry?.data) ? (entry!.data as MirrorMember[]) : memberCache;
  const mirrorMedia: Record<string, string> = (feature === 'members' ? entry?.media : memberMedia) || {};
  const mentionMembers: Member[] = mirrorMembers.map(mm => ({
    id: mm.id,
    name: mm.name,
    pronouns: mm.pronouns || '',
    role: mm.role || '',
    color: mm.color || '',
    description: '',
  }));

  const statusLine = () => {
    if (entry?.none) return requesting === 'failed' ? t('network.mirrorEmptyOffline') : '';
    if (requesting === 'failed') {
      return entry ? t('network.mirrorOffline') : t('network.mirrorEmptyOffline');
    }
    if (entry?.fetchedAt) return t('network.mirrorUpdated', {time: fmtTime(entry.fetchedAt)});
    if (requesting === 'sent') return t('network.mirrorLoading');
    return '';
  };

  const openJournalEntry = (e: JournalEntry) => {
    if (e.password) {
      setPwInput('');
      setPwError(false);
      setUnlockFor(e);
    } else {
      setViewEntry(e);
    }
  };

  const tryUnlock = () => {
    if (unlockFor && pwInput === unlockFor.password) {
      const e = unlockFor;
      setUnlockFor(null);
      setViewEntry(e);
    } else {
      setPwError(true);
    }
  };

  const toMember = (mm: MirrorMember, groupIds: string[] = []): Member => ({
    id: mm.id,
    name: mm.name,
    pronouns: mm.pronouns || '',
    role: mm.role || '',
    color: mm.color || '',
    description: mm.description || '',
    archived: mm.archived,
    avatar: mirrorMedia[mm.id],
    groupIds,
    customFields: (mm.customFields || []).map((cf, i) => ({
      fieldId: cf.fieldId || `mirror-cf-${i}`,
      value: cf.type === 'image'
        ? (mirrorMedia[`${mm.id}#cf:${cf.fieldId || ''}`] ?? null)
        : cf.value,
    })),
  } as Member);

  const fieldDefsOf = (mm: MirrorMember): CustomFieldDef[] =>
    (mm.customFields || []).map((cf, i) => ({
      id: cf.fieldId || `mirror-cf-${i}`,
      name: cf.name,
      type: (cf.type || 'text') as CustomFieldType,
      markdown: cf.markdown,
      sortOrder: i,
    }));

  const renderMemberRow = ({item}: {item: MirrorMember}) => {
    const avatar = mirrorMedia[item.id];
    const sub = [item.pronouns, item.role].filter(Boolean).join('  ·  ');
    return (
      <TouchableOpacity
        onPress={() => setViewMemberId(item.id)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}${sub ? `. ${sub}` : ''}`}
        style={{flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border}}>
        {avatar ? (
          <Image source={{uri: avatar}} style={{width: fs(40), height: fs(40), borderRadius: fs(20), marginRight: 12}} accessibilityElementsHidden importantForAccessibility="no" />
        ) : (
          <View style={{width: fs(40), height: fs(40), borderRadius: fs(20), marginRight: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: item.color || T.border}} accessibilityElementsHidden importantForAccessibility="no">
            <Text style={{fontSize: fs(16), fontWeight: '700', color: '#fff'}}>{(item.name || '?').slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={{flex: 1, minWidth: 0}}>
          <Text style={{fontSize: fs(14), fontWeight: '600', color: T.text, opacity: item.archived ? 0.55 : 1}} numberOfLines={1}>{item.name}</Text>
          {!!sub && <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}} numberOfLines={1}>{sub}</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  const groupsData: {groups: MirrorGroup[]; membership: Record<string, {id: string; name: string}[]>} =
    feature === 'groups' && entry?.data && typeof entry.data === 'object' && !Array.isArray(entry.data)
      ? {groups: entry.data.groups || [], membership: entry.data.membership || {}}
      : {groups: [], membership: {}};

  const browserGroups: MemberGroup[] = groupsData.groups.map(g => {
    const ids = new Set(groupsData.groups.map(x => x.id));
    return {
      id: g.id,
      name: g.name,
      color: g.color,
      kind: g.kind,
      parentId: g.parentId && ids.has(g.parentId) ? g.parentId : undefined,
      sortOrder: g.sortOrder,
    } as MemberGroup;
  });

  const browserMembers: Member[] = (() => {
    const groupIdsBy: Record<string, string[]> = {};
    Object.entries(groupsData.membership).forEach(([gid, list]) => {
      if (!gid) return;
      (list || []).forEach(m => {
        groupIdsBy[m.id] = [...(groupIdsBy[m.id] || []), gid];
      });
    });
    const named: Record<string, string> = {};
    Object.values(groupsData.membership).forEach(list => (list || []).forEach(m => { named[m.id] = m.name; }));
    return Object.keys(named).map(id => {
      const mm = memberCache.find(x => x.id === id) || {id, name: named[id]};
      return toMember(mm as MirrorMember, groupIdsBy[id] || []);
    });
  })();

  const renderGroups = () => (
    <ScrollView style={{flex: 1}} contentContainerStyle={{padding: 16, paddingBottom: 16 + insets.bottom}}>
      <GroupBrowser
        T={T}
        groups={browserGroups}
        members={browserMembers}
        browseId={browseId}
        onNavigate={setBrowseId}
        onViewMember={setViewMemberId}
        rootTitle={t('members.fieldGroups')}
      />
    </ScrollView>
  );

  const journalEntries: JournalEntry[] = Array.isArray(entry?.data) ? [...(entry!.data as JournalEntry[])].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.timestamp || 0) - (a.timestamp || 0)) : [];

  const renderJournalRow = ({item}: {item: JournalEntry}) => (
    <TouchableOpacity
      onPress={() => openJournalEntry(item)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${item.password ? '🔒 ' : ''}${item.pinned ? '📌 ' : ''}${item.title || t('common.untitled')}, ${fmtTime(item.timestamp)}`}
      style={{paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border}}>
      <Text style={{fontSize: fs(14), fontWeight: '600', color: T.text}} numberOfLines={1}>
        {item.pinned ? '📌 ' : ''}{item.password ? '🔒 ' : ''}{item.title || t('common.untitled')}
      </Text>
      <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}}>{fmtTime(item.timestamp)}</Text>
      {(item.hashtags || []).length > 0 && (
        <Text style={{fontSize: fs(11), color: T.accent, marginTop: 2}} numberOfLines={1}>{(item.hashtags || []).map(x => `#${x}`).join(' ')}</Text>
      )}
    </TouchableOpacity>
  );

  const body = () => {
    if (entry?.none) {
      return <View style={{padding: 24}}><Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center'}}>{t('network.mirrorNothing')}</Text></View>;
    }
    if (!entry) {
      return (
        <View style={{padding: 32, alignItems: 'center'}}>
          {requesting === 'sent' ? (
            <>
              <ActivityIndicator color={T.accent} />
              <Text style={{fontSize: fs(12), color: T.dim, marginTop: 12, textAlign: 'center'}}>{t('network.mirrorLoading')}</Text>
            </>
          ) : (
            <Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center'}}>{t('network.mirrorEmptyOffline')}</Text>
          )}
        </View>
      );
    }
    if (feature === 'members') {
      const data: MirrorMember[] = Array.isArray(entry.data) ? entry.data : [];
      return (
        <FlatList
          data={data}
          keyExtractor={m => m.id}
          renderItem={renderMemberRow}
          contentContainerStyle={{padding: 16, paddingBottom: 16 + insets.bottom}}
          ListEmptyComponent={<Text style={{fontSize: fs(12), color: T.dim}}>{t('network.mirrorNothing')}</Text>}
        />
      );
    }
    if (feature === 'groups') return renderGroups();
    if (feature === 'history') {
      const events: HistoryEntry[] = Array.isArray(entry.data) ? entry.data : [];
      return (
        <HistoryScreen
          theme={T}
          readOnly
          historyOverride={events}
          membersOverride={mirrorMembers.map(mm => toMember(mm))}
          journalOverride={[]}
        />
      );
    }
    return (
      <FlatList
        data={journalEntries}
        keyExtractor={e => e.id}
        renderItem={renderJournalRow}
        contentContainerStyle={{padding: 16, paddingBottom: 16 + insets.bottom}}
        ListEmptyComponent={<Text style={{fontSize: fs(12), color: T.dim}}>{t('network.mirrorNothing')}</Text>}
      />
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{flex: 1, backgroundColor: T.bg}}>
        {/* Same edge-to-edge fix as the MD editor: full-screen Modals span the
            Android status bar now, so the bare 12 clipped this header under it. */}
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 12 + insets.top : 12 + Math.max(StatusBar.currentHeight || 0, insets.top || 0), paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: T.border}}>
          <View style={{flex: 1, minWidth: 0, marginRight: 8}}>
            <Text accessibilityRole="header" style={{fontSize: fs(16), fontWeight: '700', color: T.text}} numberOfLines={1}>{displayName}</Text>
            <Text style={{fontSize: fs(11), color: T.dim, marginTop: 1}}>{featureLabel}</Text>
          </View>
          <TouchableOpacity onPress={request} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('network.mirrorRefresh')} style={{padding: 10}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Text style={{fontSize: fs(16), color: T.accent}} importantForAccessibility="no">⟳</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')} style={{padding: 10}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Text style={{fontSize: fs(16), color: T.dim}} importantForAccessibility="no">✕</Text>
          </TouchableOpacity>
        </View>
        {!!statusLine() && (
          <Text accessibilityRole="alert" style={{fontSize: fs(11), color: T.dim, paddingHorizontal: 16, paddingTop: 8}}>{statusLine()}</Text>
        )}
        {body()}

        {!!viewEntry && (
          <JournalModal
            visible
            theme={T}
            entry={viewEntry}
            members={mentionMembers}
            templates={[]}
            lockView
            onSave={() => {}}
            onClose={() => setViewEntry(null)}
          />
        )}

        {(() => {
          const mm = viewMemberId ? mirrorMembers.find(x => x.id === viewMemberId) || null : null;
          if (!viewMemberId) return null;
          if (!mm) {
            return (
              <Modal visible transparent animationType="fade" onRequestClose={() => setViewMemberId(null)}>
                <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center'}}>
                  <ActivityIndicator color={T.accent} />
                </View>
              </Modal>
            );
          }
          const gids = browserMembers.find(x => x.id === mm.id)?.groupIds || [];
          return (
            <MemberModal
              visible
              theme={T}
              member={toMember(mm, gids)}
              members={mentionMembers}
              groups={browserGroups}
              readOnly
              lockRead
              fieldDefsOverride={fieldDefsOf(mm)}
              connectionsOverride={mm.connections || []}
              onClose={() => setViewMemberId(null)}
              onSave={() => {}}
              onDelete={() => {}}
            />
          );
        })()}

        <Modal visible={!!unlockFor} transparent animationType="fade" onRequestClose={() => setUnlockFor(null)}>
          <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24, paddingBottom: 24 + kbHeight}}>
            <View style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 16}}>
              <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, marginBottom: 10}}>🔒 {unlockFor?.title || t('common.untitled')}</Text>
              <TextInput
                value={pwInput}
                onChangeText={v => { setPwInput(v); setPwError(false); }}
                placeholder={t('journal.password')}
                placeholderTextColor={T.muted}
                secureTextEntry
                autoFocus
                onSubmitEditing={tryUnlock}
                accessibilityLabel={t('journal.password')}
                style={{borderWidth: 1, borderColor: pwError ? '#E05B5B' : T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, color: T.text, fontSize: fs(13)}}
              />
              {pwError && <Text accessibilityRole="alert" style={{fontSize: fs(11), color: '#E05B5B', marginTop: 6}}>{t('journal.incorrectPassword')}</Text>}
              <View style={{flexDirection: 'row', gap: 10, marginTop: 12}}>
                <TouchableOpacity onPress={() => setUnlockFor(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
                  style={{flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
                  <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={tryUnlock} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('journal.unlock')}
                  style={{flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
                  <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('journal.unlock')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
};
