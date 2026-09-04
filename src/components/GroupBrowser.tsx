import React, {ReactNode} from 'react';
import {View, ScrollView, TouchableOpacity} from 'react-native';
import {Text} from './AppText';
import {Avatar} from './Avatar';
import {useTranslation} from 'react-i18next';
import {fontScale, ThemeColors} from '../theme';
import {Member, MemberGroup, MemberSortMode, childrenOf, groupKind, isRosterMember, sortMembers} from '../utils';

interface GroupBrowserProps {
  T: ThemeColors;
  groups: MemberGroup[];
  members: Member[];
  browseId: string | null;
  onNavigate: (id: string | null) => void;
  onViewMember?: (id: string) => void;
  rootTitle: string;
  headerRight?: ReactNode;
  banner?: ReactNode;
  memberRow?: (m: Member) => ReactNode;
  memberAction?: (m: Member) => ReactNode;
  sortMode?: MemberSortMode;
  onSortModeChange?: (mode: MemberSortMode) => void;
}

export const GroupBrowser = ({
  T,
  groups,
  members,
  browseId,
  onNavigate,
  onViewMember,
  rootTitle,
  headerRight,
  banner,
  memberRow,
  memberAction,
  sortMode,
  onSortModeChange,
}: GroupBrowserProps) => {
  const {t} = useTranslation();
  const fs = fontScale(T);

  const listable = members.filter(isRosterMember);
  const roster = members.filter(isRosterMember);
  const facetListable = members.filter(m => m.isFacet && !m.isCustomFront && !m.deleted);
  const cfListable = members.filter(m => m.isCustomFront && !m.deleted);
  const folders = childrenOf(groups, browseId);
  const inFolder = (list: Member[]) => (browseId === null
    ? list.filter(m => !(m.groupIds || []).length)
    : list.filter(m => (m.groupIds || []).includes(browseId)));
  const folderMembersRaw = inFolder(listable);
  const folderMembers = sortMembers(folderMembersRaw, sortMode || 'manual');
  const folderFacets = sortMembers(inFolder(facetListable), sortMode || 'manual');
  const folderCustomFronts = browseId === null ? [] : sortMembers(inFolder(cfListable), sortMode || 'manual');
  const current = browseId ? groups.find(g => g.id === browseId) || null : null;

  return (
    <>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14}}>
        {browseId !== null && (
          <TouchableOpacity onPress={() => onNavigate(current?.parentId ?? null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{padding: 4}}>
            <Text style={{fontSize: fs(18), color: T.dim}} allowFontScaling={false}>←</Text>
          </TouchableOpacity>
        )}
        <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(16), fontWeight: '600', color: current?.color || T.text}} numberOfLines={1}>{current ? current.name : rootTitle}</Text>
        {headerRight}
      </View>
      {banner}
      {folders.map(g => {
        const cnt = roster.filter(m => (m.groupIds || []).includes(g.id)).length;
        const subs = childrenOf(groups, g.id).length;
        return (
          <TouchableOpacity key={g.id} onPress={() => onNavigate(g.id)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel={`${g.name}, ${groupKind(g) === 'subsystem' ? t('memberGroups.subsystem') : t('memberGroups.group')}, ${cnt}`}
            style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: T.border, backgroundColor: T.card, marginBottom: 8}}>
            <View style={{width: 16, height: 16, borderRadius: groupKind(g) === 'subsystem' ? 4 : 8, backgroundColor: g.color || T.accent}} />
            <Text style={{flex: 1, fontSize: fs(14), fontWeight: '500', color: T.text}} numberOfLines={1}>{g.name}</Text>
            <Text style={{fontSize: fs(11), color: T.muted}}>{subs > 0 ? `${subs} ⊟ · ` : ''}{cnt}</Text>
            <Text style={{fontSize: fs(16), color: T.dim}} allowFontScaling={false}>›</Text>
          </TouchableOpacity>
        );
      })}
      {onSortModeChange && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 10, flexGrow: 0}}>
          <View style={{flexDirection: 'row', gap: 6, paddingHorizontal: 2}}>
            {(['alphabetical', 'reverse-alphabetical', 'age', 'color', 'role', 'manual'] as const).map(mode => (
              <TouchableOpacity key={mode} onPress={() => onSortModeChange(mode)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityState={{selected: (sortMode || 'manual') === mode}} accessibilityLabel={t(`memberSort.${mode}`)}
                style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
                  backgroundColor: (sortMode || 'manual') === mode ? `${T.accent}20` : T.surface,
                  borderColor: (sortMode || 'manual') === mode ? `${T.accent}50` : T.border}}>
                <Text style={{fontSize: fs(11), color: (sortMode || 'manual') === mode ? T.accent : T.dim, fontWeight: (sortMode || 'manual') === mode ? '600' : '400'}}>
                  {t(`memberSort.${mode}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}
      {folderMembers.map(m => {
        if (memberRow) return <React.Fragment key={m.id}>{memberRow(m)}</React.Fragment>;
        return (
          <View key={m.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 10, marginBottom: 4}}>
            <TouchableOpacity onPress={() => onViewMember && onViewMember(m.id)} activeOpacity={onViewMember ? 0.7 : 1}
              accessibilityRole="button" accessibilityLabel={[m.name, m.pronouns, m.role].filter(Boolean).join(', ')}
              style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10}}>
              <Avatar member={m} size={30} T={T} />
              <View style={{flex: 1}}>
                <Text style={{fontSize: fs(14), color: T.text}} numberOfLines={1}>{m.name}</Text>
                {[m.pronouns, m.role].filter(Boolean).length > 0 ? <Text style={{fontSize: fs(11), color: T.dim}} numberOfLines={1}>{[m.pronouns, m.role].filter(Boolean).join(' · ')}</Text> : null}
              </View>
            </TouchableOpacity>
            {memberAction && memberAction(m)}
          </View>
        );
      })}
      {folderFacets.length > 0 && (
        <>
          <Text accessibilityRole="header" style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginTop: 12, marginBottom: 6}}>{t('members.facets')}</Text>
          {folderFacets.map(m => {
            if (memberRow) return <React.Fragment key={m.id}>{memberRow(m)}</React.Fragment>;
            return (
              <View key={m.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 10, marginBottom: 4}}>
                <TouchableOpacity onPress={() => onViewMember && onViewMember(m.id)} activeOpacity={onViewMember ? 0.7 : 1}
                  accessibilityRole="button" accessibilityLabel={[m.name, m.pronouns, m.role].filter(Boolean).join(', ')}
                  style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10}}>
                  <Avatar member={m} size={30} T={T} />
                  <View style={{flex: 1}}>
                    <Text style={{fontSize: fs(14), color: T.text}} numberOfLines={1}>{m.name}</Text>
                    {[m.pronouns, m.role].filter(Boolean).length > 0 ? <Text style={{fontSize: fs(11), color: T.dim}} numberOfLines={1}>{[m.pronouns, m.role].filter(Boolean).join(' · ')}</Text> : null}
                  </View>
                </TouchableOpacity>
                {memberAction && memberAction(m)}
              </View>
            );
          })}
        </>
      )}
      {folderCustomFronts.length > 0 && (
        <>
          <Text accessibilityRole="header" style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginTop: 12, marginBottom: 6}}>{t('members.customFronts')}</Text>
          {folderCustomFronts.map(m => {
            if (memberRow) return <React.Fragment key={m.id}>{memberRow(m)}</React.Fragment>;
            return (
              <View key={m.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 10, marginBottom: 4}}>
                <TouchableOpacity onPress={() => onViewMember && onViewMember(m.id)} activeOpacity={onViewMember ? 0.7 : 1}
                  accessibilityRole="button" accessibilityLabel={[m.name, m.pronouns, m.role].filter(Boolean).join(', ')}
                  style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10}}>
                  <Avatar member={m} size={30} T={T} />
                  <View style={{flex: 1}}>
                    <Text style={{fontSize: fs(14), color: T.text}} numberOfLines={1}>{m.name}</Text>
                    {[m.pronouns, m.role].filter(Boolean).length > 0 ? <Text style={{fontSize: fs(11), color: T.dim}} numberOfLines={1}>{[m.pronouns, m.role].filter(Boolean).join(' · ')}</Text> : null}
                  </View>
                </TouchableOpacity>
                {memberAction && memberAction(m)}
              </View>
            );
          })}
        </>
      )}
      {folders.length === 0 && folderMembers.length === 0 && folderFacets.length === 0 && folderCustomFronts.length === 0 && (
        <Text style={{fontSize: fs(12), color: T.muted, fontStyle: 'italic', marginTop: 8}}>{t('memberGroups.none')}</Text>
      )}
    </>
  );
};
