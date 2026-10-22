import React, {useMemo, useState} from 'react';
import {View, TouchableOpacity, Alert} from 'react-native';
import {KeyboardAwareScrollView} from 'react-native-keyboard-controller';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {Avatar} from '../../components/Avatar';
import {GroupBrowser} from '../../components/GroupBrowser';
import {MemberPicker} from '../../components/MemberPicker';
import {PlusMinusIcon} from '../../components/Glyphs';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {useAppStore} from '../../store/appStore';
import {quickAddToFront, removeFromFront, bulkAddGroups, bulkRemoveFromGroup, saveGroupSortMode} from '../../store/actions';
import {reportSaveError} from '../../utils/saveError';
import {pickerPool} from '../../picker/memberPicker';
import {Member, FrontTierKey, MemberSortMode, allFrontMemberIds, groupKind, toggleId} from '../../utils';
import {QuickFrontSheet} from '../members/QuickFrontSheet';
import {PickerDialog} from './PickerDialog';

const ROUND_HIT = {top: 8, bottom: 8, left: 8, right: 8};

const roundBtn = (bg: string, border: string) =>
  ({width: 28, height: 28, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, backgroundColor: bg, borderColor: border});

const saveSortMode = (mode: MemberSortMode) => { saveGroupSortMode(mode).catch(reportSaveError); };

const quickFront = (m: Member, tier: FrontTierKey) => { quickAddToFront(m.id, tier).catch(reportSaveError); };

export const GroupBrowsePane = ({header, hideRootTitle, onViewMember, onEdit}: {
  header?: React.ReactNode; hideRootTitle?: boolean; onViewMember?: (id: string) => void; onEdit: () => void;
}) => {
  const T = useTheme();
  const members = useAppStore(s => s.members);
  const groups = useAppStore(s => s.groups);
  const front = useAppStore(s => s.front);
  const groupSortMode = useAppStore(s => s.appSettings.groupSortMode);
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [browseId, setBrowseId] = useState<string | null>(null);
  const [quickFrontFor, setQuickFrontFor] = useState<Member | null>(null);
  const [addPickOpen, setAddPickOpen] = useState(false);
  const [addPickIds, setAddPickIds] = useState<string[]>([]);
  const [removeMode, setRemoveMode] = useState(false);
  const [removeIds, setRemoveIds] = useState<string[]>([]);
  const frontIds = useMemo(() => new Set(allFrontMemberIds(front)), [front]);

  const exitRemoveMode = () => {
    setRemoveMode(false);
    setRemoveIds([]);
  };
  const closeAddPick = () => {
    setAddPickOpen(false);
    setAddPickIds([]);
  };
  const goBrowseTo = (id: string | null) => {
    setBrowseId(id);
    exitRemoveMode();
    closeAddPick();
  };

  const current = browseId ? groups.find(g => g.id === browseId) || null : null;
  const browseEligible = members.filter(m => !m.archived && !m.isCustomFront && !m.isFacet);
  const browseListable = members.filter(m => !m.archived && !m.deleted);
  const hasFolderMembers = !!current && browseEligible.some(m => (m.groupIds || []).includes(current.id));
  const linkedMember = current && groupKind(current) === 'subsystem' && current.linkedMemberId
    ? members.find(m => m.id === current.linkedMemberId && !m.deleted) || null
    : null;
  const notInCurrent = (m: Member) => !!current && !m.archived && !(m.groupIds || []).includes(current.id);
  const addPools = [
    pickerPool('members', browseEligible.filter(notInCurrent), t),
    pickerPool('facets', members.filter(m => !m.isCustomFront && m.isFacet && notInCurrent(m)), t),
    pickerPool('customFronts', members.filter(m => m.isCustomFront && notInCurrent(m)), t),
  ];

  const confirmRemove = () => {
    if (!current || removeIds.length === 0) return;
    Alert.alert(t('memberGroups.removeMembers'), t('members.selectedCount', {count: removeIds.length}), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('network.remove'), style: 'destructive', onPress: () => {
        bulkRemoveFromGroup(removeIds, current.id).catch(reportSaveError);
        exitRemoveMode();
      }},
    ]);
  };
  const confirmAdd = () => {
    if (current && addPickIds.length > 0) bulkAddGroups(addPickIds, [current.id]).catch(reportSaveError);
    closeAddPick();
  };
  const confirmRemoveFromFront = (m: Member) => {
    Alert.alert(t('members.removeFromFront'), t('members.removeFromFrontMsg', {name: m.name}), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('network.remove'), style: 'destructive', onPress: () => { removeFromFront(m.id).catch(reportSaveError); }},
    ]);
  };

  const renderRemoveRow = (m: Member) => {
    const checked = removeIds.includes(m.id);
    const sub = [m.pronouns, m.role].filter(Boolean).join(' · ');
    return (
      <TouchableOpacity onPress={() => setRemoveIds(sel => toggleId(sel, m.id))} activeOpacity={0.7}
        accessibilityRole="checkbox" accessibilityState={{checked}} accessibilityLabel={m.name}
        style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 10, marginBottom: 4}}>
        <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(16), color: checked ? T.danger : T.muted}}>{checked ? '☑' : '☐'}</Text>
        <Avatar member={m} size={30} />
        <View style={{flex: 1}}>
          <Text style={{fontSize: fs(14), color: T.text}} numberOfLines={1}>{m.name}</Text>
          {sub ? <Text style={{fontSize: fs(11), color: T.dim}} numberOfLines={1}>{sub}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderFrontAction = (m: Member) => (frontIds.has(m.id) ? (
    <TouchableOpacity onPress={() => confirmRemoveFromFront(m)}
      accessibilityRole="button" accessibilityLabel={`${t('members.removeFromFront')} - ${m.name}`}
      hitSlop={ROUND_HIT} style={roundBtn(T.dangerBg, `${T.danger}40`)}>
      <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(15), color: T.danger}} allowFontScaling={false}>−</Text>
    </TouchableOpacity>
  ) : (
    <TouchableOpacity onPress={() => setQuickFrontFor(m)}
      accessibilityRole="button" accessibilityLabel={`${t('members.addToFront')} - ${m.name}`}
      hitSlop={ROUND_HIT} style={roundBtn(T.accentBg, `${T.accent}40`)}>
      <PlusMinusIcon size={12} color={T.accent} />
    </TouchableOpacity>
  ));

  const headerRight = (
    <>
      {current && !removeMode && (
        <TouchableOpacity onPress={() => { setAddPickIds([]); setAddPickOpen(true); }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('memberGroups.addMembers')}
          hitSlop={ROUND_HIT} style={roundBtn(T.accentBg, `${T.accent}40`)}>
          <PlusMinusIcon size={12} color={T.accent} />
        </TouchableOpacity>
      )}
      {hasFolderMembers && !removeMode && (
        <TouchableOpacity onPress={() => { setRemoveIds([]); setRemoveMode(true); }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('memberGroups.removeMembers')}
          hitSlop={ROUND_HIT} style={roundBtn(T.dangerBg, `${T.danger}40`)}>
          <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(15), color: T.danger}} allowFontScaling={false}>−</Text>
        </TouchableOpacity>
      )}
      {!removeMode && (
        <TouchableOpacity onPress={onEdit} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.edit')}
          hitSlop={{top: 10, bottom: 10}} style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
          <Text style={{fontSize: fs(11), color: T.dim}}>{t('common.edit')}</Text>
        </TouchableOpacity>
      )}
    </>
  );

  const removeBanner = removeMode && current ? (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, padding: 8, borderRadius: 8, backgroundColor: T.surface, borderWidth: 1, borderColor: `${T.danger}40`}}>
      <Text style={{flex: 1, fontSize: fs(11), color: T.dim}}>{t('members.selectedCount', {count: removeIds.length})}</Text>
      <TouchableOpacity onPress={confirmRemove} disabled={removeIds.length === 0} accessibilityRole="button" accessibilityState={{disabled: removeIds.length === 0}} accessibilityLabel={t('memberGroups.removeMembers')}
        hitSlop={{top: 10, bottom: 10}} style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, backgroundColor: T.dangerBg, borderColor: `${T.danger}40`, opacity: removeIds.length === 0 ? 0.45 : 1}}>
        <Text style={{fontSize: fs(11), fontWeight: '600', color: T.danger}}>{t('network.remove')}</Text>
      </TouchableOpacity>
      <TouchableOpacity hitSlop={{top: 15, bottom: 15}} onPress={exitRemoveMode} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
        <Text style={{fontSize: fs(11), color: T.dim}}>{t('common.cancel')}</Text>
      </TouchableOpacity>
    </View>
  ) : undefined;

  return (
    <KeyboardAwareScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={{padding: 16, paddingBottom: 120}} bottomOffset={24}>
      {header}
      <GroupBrowser
        groups={groups}
        members={browseListable}
        browseId={browseId}
        onNavigate={goBrowseTo}
        onViewMember={id => onViewMember?.(id)}
        sortMode={groupSortMode}
        onSortModeChange={saveSortMode}
        rootTitle={hideRootTitle ? '' : t('systemManager.title')}
        linkedMember={linkedMember}
        headerRight={headerRight}
        banner={removeBanner}
        renderMemberRow={removeMode ? renderRemoveRow : undefined}
        renderMemberAction={renderFrontAction}
      />

      <QuickFrontSheet member={quickFrontFor} onPick={quickFront} onClose={() => setQuickFrontFor(null)} />

      <PickerDialog visible={addPickOpen} title={t('memberGroups.addMembersTo', {name: current?.name})} onClose={closeAddPick}
        footer={
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12}}>
            <Text style={{flex: 1, fontSize: fs(11), color: T.dim}}>{t('members.selectedCount', {count: addPickIds.length})}</Text>
            <TouchableOpacity onPress={closeAddPick} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
              hitSlop={{top: 6, bottom: 6}} style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
              <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmAdd} disabled={addPickIds.length === 0}
              accessibilityRole="button" accessibilityState={{disabled: addPickIds.length === 0}} accessibilityLabel={t('common.add')}
              hitSlop={{top: 6, bottom: 6}} style={{paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, opacity: addPickIds.length === 0 ? 0.45 : 1}}>
              <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('common.add')}</Text>
            </TouchableOpacity>
          </View>
        }>
        <MemberPicker pools={addPools} selected={addPickIds} onPick={m => setAddPickIds(sel => toggleId(sel, m.id))} multi maxResults={Infinity} rowSize={26}
          emptyLabel={t('members.noMembers')} />
      </PickerDialog>
    </KeyboardAwareScrollView>
  );
};
