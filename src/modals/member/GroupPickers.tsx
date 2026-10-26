import React from 'react';
import {View, TouchableOpacity} from 'react-native';
import type {ViewStyle} from 'react-native';
import {Text} from '../../components/AppText';
import {useTranslation} from 'react-i18next';
import {fontScale, ensureReadable} from '../../theme';
import {useTheme} from '../../themeContext';
import {Member, MemberGroup, groupKind, groupTree, childrenOf, descendantsOf} from '../../utils';
import {sectionLabel} from '../../components/controls';

type GroupOpenState = ReadonlyMap<string, boolean>;

const dotRadius = (g: MemberGroup): number => (groupKind(g) === 'subsystem' ? 1.5 : 3.5);

export const GroupChips = ({groups, onInfo, bgOn, style}: {
  groups: MemberGroup[]; onInfo: (g: MemberGroup) => void; bgOn: boolean; style?: ViewStyle;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  return (
    <View style={[{flexDirection: 'row', flexWrap: 'wrap', gap: 7}, style]}>
      {groups.map(g => {
        const c = g.color || T.accent;
        return (
          <TouchableOpacity key={g.id} onPress={g.description ? () => onInfo(g) : undefined} activeOpacity={g.description ? 0.7 : 1}
            accessibilityRole={g.description ? 'button' : undefined} accessibilityLabel={g.name}
            hitSlop={{top: 7, bottom: 7}} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
              backgroundColor: bgOn ? T.surface : `${c}20`, borderColor: bgOn ? T.border : `${c}50`}}>
            <View style={{width: 7, height: 7, borderRadius: dotRadius(g), backgroundColor: c}} />
            <Text style={{fontSize: fs(11), color: bgOn ? ensureReadable(c, T.surface, 4.5) : c}}>{g.name}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export const GroupToggleChip = ({g, on, onPress, role, label, suffix}: {
  g: MemberGroup; on: boolean; onPress: () => void; role: 'button' | 'checkbox'; label: string; suffix?: string;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const c = g.color || T.accent;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      accessibilityRole={role} accessibilityState={role === 'checkbox' ? {checked: on} : {selected: on}} accessibilityLabel={label}
      hitSlop={{top: 7, bottom: 7}} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
        backgroundColor: on ? `${c}20` : T.surface, borderColor: on ? `${c}50` : T.border}}>
      <View style={{width: 7, height: 7, borderRadius: dotRadius(g), backgroundColor: c}} />
      <Text style={{fontSize: fs(12), color: on ? c : T.dim}}>{g.name}{suffix}</Text>
      {on && <Text style={{fontSize: fs(11), fontWeight: '700', color: c}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</Text>}
    </TouchableOpacity>
  );
};

export const GroupTreePicker = ({groups, selectedIds, onToggle, open, setOpen}: {
  groups: MemberGroup[]; selectedIds: string[]; onToggle: (groupId: string) => void;
  open: GroupOpenState; setOpen: React.Dispatch<React.SetStateAction<GroupOpenState>>;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const selected = new Set(selectedIds);
  const chip = (g: MemberGroup) => <GroupToggleChip key={g.id} g={g} on={selected.has(g.id)} onPress={() => onToggle(g.id)} role="button" label={g.name} />;
  const isOpen = (g: MemberGroup): boolean =>
    open.get(g.id) ?? descendantsOf(groups, g.id).some(d => selected.has(d.id));
  const toggleOpen = (g: MemberGroup) => setOpen(prev => new Map(prev).set(g.id, !isOpen(g)));
  const {roots, unreached} = groupTree(groups);
  const seen = new Set<string>();
  const renderLevel = (parentId: string | null, depth: number): React.ReactNode => {
    const kids = (parentId === null ? roots : childrenOf(groups, parentId)).filter(g => !seen.has(g.id));
    kids.forEach(g => seen.add(g.id));
    const leaves = kids.filter(g => childrenOf(groups, g.id).length === 0);
    const parents = kids.filter(g => childrenOf(groups, g.id).length > 0);
    return (
      <View style={{paddingLeft: depth === 0 ? 0 : 16, gap: 7}}>
        {leaves.length > 0 && (
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 7}}>{leaves.map(g => chip(g))}</View>
        )}
        {parents.map(g => {
          const expanded = isOpen(g);
          const activeKids = descendantsOf(groups, g.id).filter(d => selected.has(d.id)).length;
          return (
            <View key={g.id} style={{gap: 7}}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                {chip(g)}
                <TouchableOpacity onPress={() => toggleOpen(g)} activeOpacity={0.7} hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}
                  accessibilityRole="button" accessibilityState={{expanded}} accessibilityLabel={t('memberGroups.expandA11y', {name: g.name, count: activeKids})}
                  style={{flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface}}>
                  {!expanded && activeKids > 0 && <Text style={{fontSize: fs(10), fontWeight: '600', color: g.color || T.accent}}>{activeKids}</Text>}
                  <Text style={{fontSize: fs(10), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{expanded ? '▽' : '▷'}</Text>
                </TouchableOpacity>
              </View>
              {expanded && renderLevel(g.id, depth + 1)}
            </View>
          );
        })}
      </View>
    );
  };
  return (
    <>
      <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{t('memberGroups.title')}</Text>
      <View style={{marginBottom: 14, gap: 7}}>
        {renderLevel(null, 0)}
        {unreached.length > 0 && (
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 7}}>{unreached.map(g => chip(g))}</View>
        )}
      </View>
    </>
  );
};

export const LinkedSubsystemPicker = ({subsystems, linkedIds, members, memberId, onToggle}: {
  subsystems: MemberGroup[]; linkedIds: string[]; members: Member[]; memberId: string; onToggle: (groupId: string) => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  return (
    <>
      <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{t('memberGroups.linkedSubsystems')}</Text>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14}}>
        {subsystems.map(g => {
          const on = linkedIds.includes(g.id);
          const other = !on && g.linkedMemberId && g.linkedMemberId !== memberId
            ? members.find(m => m.id === g.linkedMemberId && !m.deleted)
            : undefined;
          return (
            <GroupToggleChip key={g.id} g={g} on={on} onPress={() => onToggle(g.id)} role="checkbox"
              suffix={other ? `  ·  ${other.name}` : ''}
              label={other ? `${g.name}, ${t('a11y.labelValue', {label: t('memberGroups.linkedFronter'), value: other.name})}` : g.name} />
          );
        })}
      </View>
    </>
  );
};
