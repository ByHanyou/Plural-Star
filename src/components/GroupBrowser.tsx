import React, {ReactNode} from 'react';
import {View, TouchableOpacity} from 'react-native';
import {Text} from './AppText';
import {Avatar} from './Avatar';
import {SortChips} from './SortChips';
import {useTranslation} from 'react-i18next';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {Member, MemberGroup, MemberSortMode, childrenOf, groupKind, isCustomFrontMember, isFacetMember, isRosterMember, sortMembers} from '../utils';
import {sectionLabel} from './controls';

interface GroupBrowserProps {
  groups: MemberGroup[];
  members: Member[];
  browseId: string | null;
  onNavigate: (id: string | null) => void;
  onViewMember?: (id: string) => void;
  rootTitle: string;
  headerRight?: ReactNode;
  banner?: ReactNode;
  linkedMember?: Member | null;
  renderMemberRow?: (m: Member) => ReactNode;
  renderMemberAction?: (m: Member) => ReactNode;
  sortMode?: MemberSortMode;
  onSortModeChange?: (mode: MemberSortMode) => void;
}

export const GroupBrowser = ({
  groups,
  members,
  browseId,
  onNavigate,
  onViewMember,
  rootTitle,
  headerRight,
  banner,
  linkedMember,
  renderMemberRow,
  renderMemberAction,
  sortMode,
  onSortModeChange,
}: GroupBrowserProps) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const sort = sortMode || 'manual';

  const listable = members.filter(isRosterMember);
  const facetListable = members.filter(isFacetMember);
  const cfListable = members.filter(isCustomFrontMember);
  const countable = [...listable, ...facetListable, ...cfListable];
  const folders = childrenOf(groups, browseId);
  const inFolder = (list: Member[]) => (browseId === null
    ? list.filter(m => !(m.groupIds || []).length)
    : list.filter(m => (m.groupIds || []).includes(browseId)));
  const folderMembersRaw = inFolder(listable);
  const folderMembers = sortMembers(folderMembersRaw, sort);
  const folderFacets = sortMembers(inFolder(facetListable), sort);
  const folderCustomFronts = browseId === null ? [] : sortMembers(inFolder(cfListable), sort);
  const current = browseId ? groups.find(g => g.id === browseId) || null : null;

  const memberLine = (m: Member): ReactNode => {
    if (renderMemberRow) return <React.Fragment key={m.id}>{renderMemberRow(m)}</React.Fragment>;
    return (
      <View key={m.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 10, marginBottom: 4}}>
        <TouchableOpacity onPress={() => onViewMember && onViewMember(m.id)} activeOpacity={onViewMember ? 0.7 : 1}
          accessibilityRole="button" accessibilityLabel={[m.name, m.pronouns, m.role].filter(Boolean).join(', ')} hitSlop={{top: 7, bottom: 7}}
          style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10}}>
          <Avatar member={m} size={30} />
          <View style={{flex: 1}}>
            <Text style={{fontSize: fs(14), color: T.text}} numberOfLines={1}>{m.name}</Text>
            {[m.pronouns, m.role].filter(Boolean).length > 0 ? <Text style={{fontSize: fs(11), color: T.dim}} numberOfLines={1}>{[m.pronouns, m.role].filter(Boolean).join(' · ')}</Text> : null}
          </View>
        </TouchableOpacity>
        {renderMemberAction && renderMemberAction(m)}
      </View>
    );
  };

  return (
    <>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14}}>
        {browseId !== null && (
          <TouchableOpacity onPress={() => onNavigate(current?.parentId ?? null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}} style={{padding: 4}}>
            <Text style={{fontSize: fs(18), color: T.dim}} allowFontScaling={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">←</Text>
          </TouchableOpacity>
        )}
        {current || rootTitle ? (
          <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(16), fontWeight: '600', color: current?.color || T.text}} numberOfLines={1}>{current ? current.name : rootTitle}</Text>
        ) : (
          <View style={{flex: 1}} />
        )}
        {headerRight}
      </View>
      {linkedMember && (
        <TouchableOpacity onPress={() => onViewMember && onViewMember(linkedMember.id)} activeOpacity={onViewMember ? 0.7 : 1} disabled={!onViewMember}
          accessibilityRole="button" accessibilityState={{disabled: !onViewMember}} accessibilityLabel={t('a11y.labelValue', {label: t('memberGroups.linkedFronter'), value: linkedMember.name})}
          style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, marginBottom: 12}}>
          <Avatar member={linkedMember} size={30} />
          <View style={{flex: 1}}>
            <Text style={sectionLabel(T)}>{t('memberGroups.linkedFronter')}</Text>
            <Text style={{fontSize: fs(14), color: T.text}} numberOfLines={1}>{linkedMember.name}</Text>
          </View>
          {onViewMember ? <Text style={{fontSize: fs(16), color: T.dim}} allowFontScaling={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">›</Text> : null}
        </TouchableOpacity>
      )}
      {banner}
      {folders.map(g => {
        const cnt = countable.filter(m => (m.groupIds || []).includes(g.id)).length;
        const subs = childrenOf(groups, g.id).length;
        return (
          <TouchableOpacity key={g.id} onPress={() => onNavigate(g.id)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel={[g.name, groupKind(g) === 'subsystem' ? t('memberGroups.subsystem') : t('memberGroups.group'), t('members.count', {count: cnt}), subs > 0 ? t('memberGroups.subgroupCount', {count: subs}) : null].filter(Boolean).join(', ')}
            hitSlop={{top: 4, bottom: 4}}
            style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: T.border, backgroundColor: T.card, marginBottom: 8}}>
            <View style={{width: 16, height: 16, borderRadius: groupKind(g) === 'subsystem' ? 4 : 8, backgroundColor: g.color || T.accent}} />
            <Text style={{flex: 1, fontSize: fs(14), fontWeight: '500', color: T.text}} numberOfLines={1}>{g.name}</Text>
            <Text style={{fontSize: fs(11), color: T.muted}}>{subs > 0 ? `${subs} ⊟ · ` : ''}{cnt}</Text>
            <Text style={{fontSize: fs(16), color: T.dim}} allowFontScaling={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">›</Text>
          </TouchableOpacity>
        );
      })}
      {onSortModeChange && <SortChips value={sort} onChange={onSortModeChange} />}
      {folderMembers.length > 0 && (
        <Text accessibilityRole="header" style={sectionLabel(T, {marginTop: 12, marginBottom: 6})}>{t('members.title')}</Text>
      )}
      {folderMembers.map(memberLine)}
      {folderFacets.length > 0 && (
        <>
          <Text accessibilityRole="header" style={sectionLabel(T, {marginTop: 12, marginBottom: 6})}>{t('members.facets')}</Text>
          {folderFacets.map(memberLine)}
        </>
      )}
      {folderCustomFronts.length > 0 && (
        <>
          <Text accessibilityRole="header" style={sectionLabel(T, {marginTop: 12, marginBottom: 6})}>{t('members.customFronts')}</Text>
          {folderCustomFronts.map(memberLine)}
        </>
      )}
      {folders.length === 0 && folderMembers.length === 0 && folderFacets.length === 0 && folderCustomFronts.length === 0 && (
        <Text style={{fontSize: fs(12), color: T.muted, fontStyle: 'italic', marginTop: 8}}>{t('memberGroups.none')}</Text>
      )}
    </>
  );
};
