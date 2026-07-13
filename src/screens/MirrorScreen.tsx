import React, {useCallback, useEffect, useRef, useState} from 'react';
import {View, Modal, ScrollView, FlatList, TouchableOpacity, Image, ActivityIndicator} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {NetworkManager} from '../network/NetworkManager';
import {MirrorFeature, MirrorCacheEntry, MirrorMember, MirrorGroup} from '../network/types';
import {ThemeColors, fontScale} from '../theme';
import {Member, JournalEntry, fmtTime} from '../utils';
import {RichText} from '../components/MarkdownRenderer';

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
  const [entry, setEntry] = useState<MirrorCacheEntry | null>(null);
  const [memberCache, setMemberCache] = useState<MirrorMember[]>([]);
  const [memberMedia, setMemberMedia] = useState<Record<string, string>>({});
  const [requesting, setRequesting] = useState<'idle' | 'sent' | 'failed'>('idle');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [groupPath, setGroupPath] = useState<MirrorGroup[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [viewEntry, setViewEntry] = useState<JournalEntry | null>(null);
  const [unlockFor, setUnlockFor] = useState<JournalEntry | null>(null);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const waitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onlineRef = useRef(false);

  const reload = useCallback(async () => {
    const cache = await NetworkManager.loadMirror(peerId, feature);
    setEntry(cache);
    if (feature === 'journal' || feature === 'groups') {
      const mc = await NetworkManager.loadMirror(peerId, 'members');
      setMemberCache(mc && Array.isArray(mc.data) ? mc.data : []);
      setMemberMedia(mc?.media || {});
    }
  }, [peerId, feature]);

  const request = useCallback(() => {
    setRequesting('sent');
    if (waitRef.current) clearTimeout(waitRef.current);
    // The node drops packets for offline peers — no error comes back, so an unanswered
    // request would spin forever. Time it out and fall back to the cached copy.
    waitRef.current = setTimeout(() => {
      waitRef.current = null;
      setRequesting(r => (r === 'sent' ? 'failed' : r));
    }, 12000);
    NetworkManager.requestMirror(peerId, feature)
      .catch(() => setRequesting('failed'));
    if (feature === 'groups') {
      NetworkManager.requestMirror(peerId, 'members').catch(() => {});
    }
  }, [peerId, feature]);

  useEffect(() => {
    if (!visible) return;
    setEntry(null);
    setExpandedId(null);
    setGroupPath([]);
    setDetailId(null);
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
    // Ask again the moment they come online. Without this, a cached "not shared" (or an
    // unanswered request) just sits there until the screen is reopened — which is what a
    // freshly-granted bucket looks like from the other side.
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
    : t('tabs.journal');

  const mentionSource: MirrorMember[] =
    feature === 'members' && Array.isArray(entry?.data) ? (entry!.data as MirrorMember[]) : memberCache;
  const mentionMembers: Member[] = mentionSource.map(mm => ({
    id: mm.id,
    name: mm.name,
    pronouns: mm.pronouns || '',
    role: mm.role || '',
    color: mm.color || '',
    description: '',
  }));

  const statusLine = () => {
    // The body already says "they haven't shared this" for a none entry — don't print it
    // twice (it read like the app was stuttering).
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

  const cfDisplay = (cf: {value: string | number | boolean | null; type?: string}): string => {
    if (typeof cf.value === 'boolean') return cf.value ? '✓' : '—';
    if (cf.type === 'date' && typeof cf.value === 'number') return fmtTime(cf.value);
    return String(cf.value ?? '');
  };

  const renderCustomFields = (mm: MirrorMember) => (
    <>
      {(mm.customFields || []).map((cf, i) => (
        <View key={i} style={{marginTop: 6}}>
          <Text style={{fontSize: fs(11), color: T.dim}}>{cf.name}</Text>
          {cf.markdown && typeof cf.value === 'string' ? (
            <RichText text={cf.value} T={T} members={mentionMembers} />
          ) : (
            <Text style={{fontSize: fs(12), color: T.text}}>{cfDisplay(cf)}</Text>
          )}
        </View>
      ))}
    </>
  );

  const renderMemberRow = ({item}: {item: MirrorMember}) => {
    const avatar = entry?.media?.[item.id];
    const sub = [item.pronouns, item.role].filter(Boolean).join('  ·  ');
    const expanded = expandedId === item.id;
    return (
      <TouchableOpacity
        onPress={() => setExpandedId(expanded ? null : item.id)}
        activeOpacity={item.description ? 0.7 : 1}
        accessibilityRole="button"
        accessibilityState={{expanded}}
        accessibilityLabel={`${item.name}${sub ? `. ${sub}` : ''}`}
        style={{flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border}}>
        {avatar ? (
          <Image source={{uri: avatar}} style={{width: fs(40), height: fs(40), borderRadius: fs(20), marginRight: 12}} accessibilityElementsHidden importantForAccessibility="no" />
        ) : (
          <View style={{width: fs(40), height: fs(40), borderRadius: fs(20), marginRight: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: item.color || T.border}} accessibilityElementsHidden importantForAccessibility="no">
            <Text style={{fontSize: fs(16), fontWeight: '700', color: '#fff'}}>{(item.name || '?').slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={{flex: 1, minWidth: 0}}>
          <Text style={{fontSize: fs(14), fontWeight: '600', color: T.text, opacity: item.archived ? 0.55 : 1}} numberOfLines={1}>{item.name}</Text>
          {!!sub && <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}} numberOfLines={expanded ? undefined : 1}>{sub}</Text>}
          {expanded && !!item.description && (
            <View style={{marginTop: 6}}>
              <RichText text={item.description} T={T} members={mentionMembers} />
            </View>
          )}
          {expanded && renderCustomFields(item)}
        </View>
      </TouchableOpacity>
    );
  };

  const groupsData: {groups: MirrorGroup[]; membership: Record<string, {id: string; name: string}[]>} =
    feature === 'groups' && entry?.data && typeof entry.data === 'object' && !Array.isArray(entry.data)
      ? {groups: entry.data.groups || [], membership: entry.data.membership || {}}
      : {groups: [], membership: {}};

  const groupChildren = (parentId?: string): MirrorGroup[] => {
    const ids = new Set(groupsData.groups.map(g => g.id));
    return groupsData.groups
      .filter(g => ((g.parentId && ids.has(g.parentId)) ? g.parentId : undefined) === parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.name || '').localeCompare(b.name || ''));
  };

  const renderGroups = () => {
    const current = groupPath.length > 0 ? groupPath[groupPath.length - 1] : null;
    const subgroups = groupChildren(current ? current.id : undefined);
    const groupMembers = [...(groupsData.membership[current ? current.id : ''] || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const empty = subgroups.length === 0 && groupMembers.length === 0;
    return (
      <ScrollView style={{flex: 1}} contentContainerStyle={{padding: 16}}>
        {groupPath.length > 0 && (
          <TouchableOpacity onPress={() => setGroupPath(groupPath.slice(0, -1))} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel={t('common.back')} style={{paddingVertical: 8}}>
            <Text style={{fontSize: fs(13), color: T.accent}}>‹ {t('common.back')}</Text>
          </TouchableOpacity>
        )}
        {current && (
          <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '700', color: T.text, marginBottom: 6}}>{current.name}</Text>
        )}
        {subgroups.map(g => {
          const count = (groupsData.membership[g.id] || []).length;
          return (
            <TouchableOpacity key={g.id} onPress={() => setGroupPath([...groupPath, g])} activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel={`${g.name}, ${count}`}
              style={{flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border}}>
              <View style={{width: 10, height: 10, borderRadius: 5, marginRight: 10, backgroundColor: g.color || T.border}} importantForAccessibility="no" accessibilityElementsHidden />
              <Text style={{flex: 1, fontSize: fs(14), fontWeight: '600', color: T.text}} numberOfLines={1} importantForAccessibility="no">{g.name}</Text>
              <Text style={{fontSize: fs(11), color: T.dim}} importantForAccessibility="no">{count} ›</Text>
            </TouchableOpacity>
          );
        })}
        {groupMembers.map(m => {
          const mm = memberCache.find(x => x.id === m.id);
          const avatar = memberMedia[m.id];
          return (
            <TouchableOpacity key={m.id} onPress={() => setDetailId(m.id)} activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel={m.name}
              style={{flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: T.border}}>
              {avatar ? (
                <Image source={{uri: avatar}} style={{width: fs(30), height: fs(30), borderRadius: fs(15), marginRight: 10}} accessibilityElementsHidden importantForAccessibility="no" />
              ) : (
                <View style={{width: fs(30), height: fs(30), borderRadius: fs(15), marginRight: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: mm?.color || T.border}} accessibilityElementsHidden importantForAccessibility="no">
                  <Text style={{fontSize: fs(12), fontWeight: '700', color: '#fff'}}>{(m.name || '?').slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <Text style={{flex: 1, fontSize: fs(13), color: T.text}} numberOfLines={1} importantForAccessibility="no">{m.name}</Text>
            </TouchableOpacity>
          );
        })}
        {empty && <Text style={{fontSize: fs(12), color: T.dim}}>{t('network.mirrorNothing')}</Text>}
      </ScrollView>
    );
  };

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
      // Never render an empty void — either we're waiting on them, or there's nothing
      // cached and they're unreachable. Say which.
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
          contentContainerStyle={{padding: 16}}
          ListEmptyComponent={<Text style={{fontSize: fs(12), color: T.dim}}>{t('network.mirrorNothing')}</Text>}
        />
      );
    }
    if (feature === 'groups') return renderGroups();
    return (
      <FlatList
        data={journalEntries}
        keyExtractor={e => e.id}
        renderItem={renderJournalRow}
        contentContainerStyle={{padding: 16}}
        ListEmptyComponent={<Text style={{fontSize: fs(12), color: T.dim}}>{t('network.mirrorNothing')}</Text>}
      />
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{flex: 1, backgroundColor: T.bg}}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border}}>
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

        <Modal visible={!!viewEntry} transparent animationType="fade" onRequestClose={() => setViewEntry(null)}>
          <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24}}>
            <View style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, maxHeight: '80%', padding: 16}}>
              <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text}} numberOfLines={2}>
                {viewEntry?.pinned ? '📌 ' : ''}{viewEntry?.title || t('common.untitled')}
              </Text>
              <Text style={{fontSize: fs(11), color: T.muted, marginTop: 2, marginBottom: 8}}>{viewEntry ? fmtTime(viewEntry.timestamp) : ''}</Text>
              <ScrollView style={{flexGrow: 0}}>
                {viewEntry?.body ? <RichText text={viewEntry.body} T={T} members={mentionMembers} /> : null}
                {(viewEntry?.hashtags || []).length > 0 && (
                  <Text style={{fontSize: fs(11), color: T.accent, marginTop: 8}}>{(viewEntry?.hashtags || []).map(x => `#${x}`).join(' ')}</Text>
                )}
              </ScrollView>
              <TouchableOpacity onPress={() => setViewEntry(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')}
                style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, borderColor: T.border, marginTop: 12}}>
                <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={!!detailId} transparent animationType="fade" onRequestClose={() => setDetailId(null)}>
          <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24}}>
            <View style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, maxHeight: '80%', padding: 16}}>
              {(() => {
                const mm = detailId ? memberCache.find(x => x.id === detailId) || null : null;
                const fallbackName = detailId
                  ? Object.values(groupsData.membership).flat().find(x => x.id === detailId)?.name || ''
                  : '';
                const avatar = detailId ? memberMedia[detailId] : undefined;
                const sub = mm ? [mm.pronouns, mm.role].filter(Boolean).join('  ·  ') : '';
                return (
                  <>
                    <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 8}}>
                      {avatar ? (
                        <Image source={{uri: avatar}} style={{width: fs(44), height: fs(44), borderRadius: fs(22), marginRight: 12}} accessibilityElementsHidden importantForAccessibility="no" />
                      ) : (
                        <View style={{width: fs(44), height: fs(44), borderRadius: fs(22), marginRight: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: mm?.color || T.border}} accessibilityElementsHidden importantForAccessibility="no">
                          <Text style={{fontSize: fs(17), fontWeight: '700', color: '#fff'}}>{((mm?.name || fallbackName) || '?').slice(0, 1).toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={{flex: 1, minWidth: 0}}>
                        <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '700', color: T.text}} numberOfLines={1}>{mm?.name || fallbackName}</Text>
                        {!!sub && <Text style={{fontSize: fs(11), color: T.dim, marginTop: 1}}>{sub}</Text>}
                      </View>
                    </View>
                    <ScrollView style={{flexGrow: 0}}>
                      {mm ? (
                        <>
                          {!!mm.description && <RichText text={mm.description} T={T} members={mentionMembers} />}
                          {renderCustomFields(mm)}
                        </>
                      ) : (
                        <ActivityIndicator color={T.accent} />
                      )}
                    </ScrollView>
                    <TouchableOpacity onPress={() => setDetailId(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')}
                      style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, borderColor: T.border, marginTop: 12}}>
                      <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.close')}</Text>
                    </TouchableOpacity>
                  </>
                );
              })()}
            </View>
          </View>
        </Modal>

        <Modal visible={!!unlockFor} transparent animationType="fade" onRequestClose={() => setUnlockFor(null)}>
          <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24}}>
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
