import React, {useEffect, useMemo, useState} from 'react';
import {View, Modal, Platform, ScrollView, FlatList, TouchableOpacity, ActivityIndicator, StatusBar, AccessibilityInfo} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {MirrorFeature, MirrorGroupsPayload, MirrorMember, MirrorAppointment, MirrorReminder, MIRROR_SYSTEM_AVATAR_ID, MIRROR_SYSTEM_BANNER_ID} from '../network/types';
import {mirrorMembersOf, mirrorJournalOf, mirrorPlannerOf, mirrorStrokesOf, mirrorProfileOf, mirrorHistoryOf} from '../network/mirror/payload';
import {NO_MIRROR_GROUPS, groupsDataOf, mirrorFieldDefs, mirrorToMember, searchMirrorMembers, sortMirrorAppointments, sortMirrorJournal, toBrowserGroups, toBrowserMembers} from '../network/mirror/view';
import {useMirrorFeed} from '../hooks/useMirrorFeed';
import {SystemProfileCard} from '../components/SystemProfileCard';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {JournalEntry, WhiteboardStroke, fmtTime} from '../utils';
import {GroupBrowser} from '../components/GroupBrowser';
import {useAppStore} from '../store/appStore';
import {saveGroupSortMode} from '../store/actions';
import {MemberModal} from '../modals/MemberModal';
import {JournalModal} from '../modals/JournalModal';
import {HistoryScreen} from './HistoryScreen';
import {PasswordDialog} from '../components/PasswordDialog';
import {reportSaveError} from '../utils/saveError';
import {MirrorJournalRow, MirrorMemberRow, MirrorNothing, MirrorPlanner, MirrorWhiteboard} from './mirror/MirrorParts';

interface Props {
  visible: boolean;
  peerId: string;
  displayName: string;
  feature: MirrorFeature;
  onClose: () => void;
}

const FEATURE_LABEL_KEY: Partial<Record<MirrorFeature, string>> = {
  members: 'tabs.members',
  groups: 'members.fieldGroups',
  history: 'tabs.history',
  systemProfile: 'systemProfile.title',
  whiteboard: 'whiteboard.title',
  planner: 'planner.title',
};

const NO_JOURNAL: JournalEntry[] = [];

export const MirrorScreen = ({visible, peerId, displayName, feature, onClose}: Props) => {
  const T = useTheme();
  const groupSortMode = useAppStore(s => s.appSettings.groupSortMode);
  const {t} = useTranslation();
  const fs = fontScale(T);
  const insets = useSafeAreaInsets();
  const {entry, memberCache, memberMedia, groupCache, requesting, request} = useMirrorFeed(visible, peerId, feature);
  const [browseId, setBrowseId] = useState<string | null>(null);
  const [viewMemberId, setViewMemberId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [viewEntry, setViewEntry] = useState<JournalEntry | null>(null);
  const [unlockFor, setUnlockFor] = useState<JournalEntry | null>(null);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setBrowseId(null);
    setViewMemberId(null);
    setViewEntry(null);
    setUnlockFor(null);
  }, [visible, peerId, feature]);

  const featureLabel = t(FEATURE_LABEL_KEY[feature] || 'tabs.journal');

  const mirrorMembers = useMemo<MirrorMember[]>(
    () => (feature === 'members' && entry ? mirrorMembersOf(entry.data) : memberCache),
    [feature, entry, memberCache],
  );
  const mirrorMedia = useMemo<ReadonlyMap<string, string>>(
    () => new Map(Object.entries((feature === 'members' ? entry?.media : memberMedia) || {})),
    [feature, entry, memberMedia],
  );

  const statusLine = () => {
    if (entry?.none) return requesting === 'failed' ? t('network.mirrorEmptyOffline') : '';
    if (requesting === 'failed') return entry ? t('network.mirrorOffline') : t('network.mirrorEmptyOffline');
    if (entry?.fetchedAt) return t('network.mirrorUpdated', {time: fmtTime(entry.fetchedAt)});
    if (requesting === 'sent') return t('network.mirrorLoading');
    return '';
  };
  const status = statusLine();

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
      AccessibilityInfo.announceForAccessibility(t('journal.incorrectPassword'));
    }
  };

  const mentionMembers = useMemo(() => mirrorMembers.map(mm => mirrorToMember(mm, mirrorMedia)), [mirrorMembers, mirrorMedia]);

  const groupsData = useMemo<MirrorGroupsPayload>(() => {
    if (feature === 'groups') return groupsDataOf(entry?.data) || NO_MIRROR_GROUPS;
    return feature === 'members' && groupCache ? groupCache : NO_MIRROR_GROUPS;
  }, [feature, entry, groupCache]);
  const browserGroups = useMemo(() => toBrowserGroups(groupsData.groups), [groupsData]);
  const browserMembers = useMemo(() => toBrowserMembers(groupsData, mirrorMembers, mirrorMedia), [groupsData, mirrorMembers, mirrorMedia]);
  const viewed = useMemo(() => {
    const mm = viewMemberId ? mirrorMembers.find(x => x.id === viewMemberId) : undefined;
    if (!mm) return null;
    const groupIds = browserMembers.find(x => x.id === mm.id)?.groupIds || [];
    return {member: mirrorToMember(mm, mirrorMedia, groupIds), fieldDefs: mirrorFieldDefs(mm), connections: mm.connections || []};
  }, [viewMemberId, mirrorMembers, mirrorMedia, browserMembers]);

  const journalEntries = useMemo(() => sortMirrorJournal(mirrorJournalOf(entry?.data)), [entry]);
  const historyEvents = useMemo(() => mirrorHistoryOf(entry?.data), [entry]);

  const nothing = () => <MirrorNothing />;

  const body = () => {
    if (entry?.none) return nothing();
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
      return (
        <FlatList
          data={searchMirrorMembers(mirrorMembers, memberSearch)}
          keyExtractor={m => m.id}
          renderItem={({item}) => <MirrorMemberRow item={item} avatar={mirrorMedia.get(item.id)} onPress={() => setViewMemberId(item.id)} />}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{padding: 16, paddingBottom: 16 + insets.bottom}}
          ListHeaderComponent={mirrorMembers.length > 0 ? (
            <TextInput value={memberSearch} onChangeText={setMemberSearch} placeholder={t('history.searchMember')} placeholderTextColor={T.muted}
              accessibilityLabel={t('history.searchMember')} autoCorrect={false} clearButtonMode="while-editing"
              style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), marginBottom: 8}} />
          ) : null}
          ListEmptyComponent={<Text style={{fontSize: fs(12), color: T.dim}}>{mirrorMembers.length > 0 ? t('mention.noMembers') : t('network.mirrorNothing')}</Text>}
        />
      );
    }
    if (feature === 'planner') {
      const pd = mirrorPlannerOf(entry.data);
      const appts: MirrorAppointment[] = Array.isArray(pd.appointments) ? pd.appointments : [];
      const rems: MirrorReminder[] = Array.isArray(pd.reminders) ? pd.reminders : [];
      const sortedAppts = sortMirrorAppointments(appts);
      if (sortedAppts.length === 0 && rems.length === 0) return nothing();
      return <MirrorPlanner appts={sortedAppts} rems={rems} bottomInset={insets.bottom} />;
    }
    if (feature === 'whiteboard') {
      const strokes: WhiteboardStroke[] = mirrorStrokesOf(entry.data);
      if (strokes.length === 0) return nothing();
      return <MirrorWhiteboard strokes={strokes} bottomInset={insets.bottom} />;
    }
    if (feature === 'systemProfile') {
      const sp = mirrorProfileOf(entry.data);
      const media = entry.media || {};
      return (
        <SystemProfileCard
          name={sp?.name || displayName}
          description={sp?.description}
          avatar={media[MIRROR_SYSTEM_AVATAR_ID]}
          banner={media[MIRROR_SYSTEM_BANNER_ID]}
          bottomInset={insets.bottom}
        />
      );
    }
    if (feature === 'groups') {
      return (
        <ScrollView style={{flex: 1}} contentContainerStyle={{padding: 16, paddingBottom: 16 + insets.bottom}}>
          <GroupBrowser
            groups={browserGroups}
            members={browserMembers}
            browseId={browseId}
            onNavigate={setBrowseId}
            onViewMember={setViewMemberId}
            sortMode={groupSortMode}
            onSortModeChange={mode => { saveGroupSortMode(mode).catch(reportSaveError); }}
            rootTitle={t('members.fieldGroups')}
          />
        </ScrollView>
      );
    }
    if (feature === 'history') {
      return (
        <HistoryScreen
          readOnly
          historyOverride={historyEvents}
          membersOverride={mentionMembers}
          journalOverride={NO_JOURNAL}
        />
      );
    }
    return (
      <FlatList
        data={journalEntries}
        keyExtractor={e => e.id}
        renderItem={({item}) => <MirrorJournalRow item={item} onPress={() => openJournalEntry(item)} />}
        contentContainerStyle={{padding: 16, paddingBottom: 16 + insets.bottom}}
        ListEmptyComponent={<Text style={{fontSize: fs(12), color: T.dim}}>{t('network.mirrorNothing')}</Text>}
      />
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{flex: 1, backgroundColor: T.bg}}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 12 + insets.top : 12 + Math.max(StatusBar.currentHeight || 0, insets.top), paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: T.border}}>
          <View style={{flex: 1, minWidth: 0, marginRight: 8}}>
            <Text accessibilityRole="header" style={{fontSize: fs(16), fontWeight: '700', color: T.text}} numberOfLines={1}>{displayName}</Text>
            <Text style={{fontSize: fs(11), color: T.dim, marginTop: 1}}>{featureLabel}</Text>
          </View>
          <TouchableOpacity onPress={request} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('network.mirrorRefresh')} style={{padding: 10}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Text style={{fontSize: fs(16), color: T.accent}} accessibilityElementsHidden importantForAccessibility="no">⟳</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')} style={{padding: 10}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Text style={{fontSize: fs(16), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no">✕</Text>
          </TouchableOpacity>
        </View>
        {!!status && (
          <Text accessibilityRole="alert" style={{fontSize: fs(11), color: T.dim, paddingHorizontal: 16, paddingTop: 8}}>{status}</Text>
        )}
        {body()}

        {!!viewEntry && (
          <JournalModal
            visible
            entry={viewEntry}
            members={mentionMembers}
            templates={[]}
            lockView
            onSave={() => {}}
            onClose={() => setViewEntry(null)}
          />
        )}

        {viewMemberId && !viewed && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setViewMemberId(null)}>
            <View accessibilityViewIsModal onAccessibilityEscape={() => setViewMemberId(null)} style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center'}}>
              <ActivityIndicator color={T.accent} accessibilityLabel={t('network.mirrorLoading')} />
            </View>
          </Modal>
        )}
        {viewed && (
          <MemberModal
            visible
            member={viewed.member}
            members={mentionMembers}
            groups={browserGroups}
            readOnly
            lockRead
            fieldDefsOverride={viewed.fieldDefs}
            connectionsOverride={viewed.connections}
            onClose={() => setViewMemberId(null)}
            onSave={() => {}}
            onDelete={() => {}}
          />
        )}

        <PasswordDialog
          visible={!!unlockFor}
          title={`🔒 ${unlockFor?.title || t('common.untitled')}`}
          value={pwInput}
          onChange={v => { setPwInput(v); setPwError(false); }}
          submitLabel={t('journal.unlock')}
          onSubmit={tryUnlock}
          submitOnEnter
          autoFocus
          error={pwError}
          onCancel={() => setUnlockFor(null)}
        />
      </View>
    </Modal>
  );
};
