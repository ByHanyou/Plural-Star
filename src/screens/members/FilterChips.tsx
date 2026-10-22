import React from 'react';
import {View, ScrollView, TouchableOpacity, AccessibilityInfo} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {MemberGroup, clamp, groupKind} from '../../utils';
import {ms} from './shared';

const stepThrough = <V,>(list: V[], current: V, dir: 1 | -1): V =>
  list[clamp(Math.max(0, list.indexOf(current)) + dir, 0, list.length - 1)];

const FilterChip = ({label, on, color, onPress, children}: {
  label: string; on: boolean; color: string; onPress: () => void; children?: React.ReactNode;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const text = <Text style={{fontSize: fs(11), color: on ? color : T.dim, fontWeight: on ? '600' : '400'}}>{label}</Text>;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      accessibilityRole="button" accessibilityState={{selected: on}} accessibilityLabel={label}
      hitSlop={{top: 10, bottom: 10}} style={[ms.chip, {backgroundColor: on ? `${color}18` : T.surface, borderColor: on ? `${color}50` : T.border}]}>
      {children ? <View style={{flexDirection: 'row', alignItems: 'center', gap: 5}}>{children}{text}</View> : text}
    </TouchableOpacity>
  );
};

const AdjustableChips = ({label, value, nextLabel, prevLabel, onStep, style, children}: {
  label: string; value: string; nextLabel: string; prevLabel: string; onStep: (dir: 1 | -1) => void; style: {marginBottom: number}; children: React.ReactNode;
}) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style}>
    <View accessible accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityValue={{text: value}}
      accessibilityActions={[{name: 'increment', label: nextLabel}, {name: 'decrement', label: prevLabel}]}
      onAccessibilityAction={e => onStep(e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
      <View style={{flexDirection: 'row', gap: 6}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {children}
      </View>
    </View>
  </ScrollView>
);

export const GroupFilterChips = ({groups, choices, active, onChange}: {
  groups: MemberGroup[]; choices: MemberGroup[]; active: string | null; onChange: (id: string | null) => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  if (groups.length === 0) return null;
  const nameOf = (id: string | null) => (id ? (groups.find(g => g.id === id)?.name || '') : t('memberGroups.allGroups'));
  const step = (dir: 1 | -1) => {
    const next = stepThrough<string | null>([null, ...choices.map(g => g.id)], active, dir);
    onChange(next);
    AccessibilityInfo.announceForAccessibility(nameOf(next));
  };
  return (
    <AdjustableChips label={t('memberGroups.title')} value={nameOf(active)} nextLabel={t('a11y.nextGroup')} prevLabel={t('a11y.previousGroup')} onStep={step} style={{marginBottom: 6}}>
      <FilterChip label={t('memberGroups.allGroups')} on={!active} color={T.accent} onPress={() => onChange(null)} />
      {choices.map(g => (
        <FilterChip key={g.id} label={g.name} on={active === g.id} color={g.color || T.accent} onPress={() => onChange(active === g.id ? null : g.id)}>
          <View style={{width: 6, height: 6, borderRadius: groupKind(g) === 'subsystem' ? 1 : 3, backgroundColor: g.color || T.accent}} />
        </FilterChip>
      ))}
    </AdjustableChips>
  );
};

export const TagFilterChips = ({tags, active, onChange}: {
  tags: string[]; active: string | null; onChange: (tag: string | null) => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  if (tags.length === 0) return null;
  const step = (dir: 1 | -1) => {
    const next = stepThrough<string | null>([null, ...tags], active, dir);
    onChange(next);
    AccessibilityInfo.announceForAccessibility(next || t('members.allTags'));
  };
  return (
    <AdjustableChips label={t('modal.tags')} value={active || t('members.allTags')} nextLabel={t('a11y.nextTag')} prevLabel={t('a11y.previousTag')} onStep={step} style={{marginBottom: 8}}>
      <FilterChip label={t('members.allTags')} on={!active} color={T.info} onPress={() => onChange(null)} />
      {tags.map(tag => (
        <FilterChip key={tag} label={tag} on={active === tag} color={T.info} onPress={() => onChange(active === tag ? null : tag)} />
      ))}
    </AdjustableChips>
  );
};
