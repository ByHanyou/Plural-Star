import React, {useMemo} from 'react';
import {View, TouchableOpacity, StyleSheet, Image} from 'react-native';
import {useTranslation} from 'react-i18next';
import {useMappingHelper} from '@shopify/flash-list';
import {Text} from '../../components/AppText';
import {Avatar} from '../../components/Avatar';
import {PlusMinusIcon} from '../../components/Glyphs';
import {fontScale, tierAccent} from '../../theme';
import {useTheme} from '../../themeContext';
import {Member, MemberGroup, FrontState, FrontTierKey, FRONT_TIER_KEYS, sortGroupsForDisplay, groupKind} from '../../utils';
import {MemberListFields} from './shared';

const getMemberTier = (id: string, front: FrontState | null): FrontTierKey | null =>
  (front && FRONT_TIER_KEYS.find(k => front[k].memberIds.includes(id))) || null;

const TIER_BADGE_KEY: Record<FrontTierKey, string> = {
  primary: 'tier.primaryBadge',
  coFront: 'tier.coFrontBadge',
  coConscious: 'tier.coConBadge',
};

interface MemberCardProps {
  m: Member;
  index: number;
  isLast: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  showReorder: boolean;
  front: FrontState | null;
  allFrontIds: Set<string>;
  groups: MemberGroup[];
  onActivate: (m: Member) => void;
  onToggleSelect: (id: string) => void;
  onEnterSelection: (id: string) => void;
  onReorder?: (id: string, direction: 'up' | 'down') => void;
  onQuickFront?: (m: Member) => void;
  onRemoveFromFront?: (m: Member) => void;
  fields: MemberListFields;
  prevName?: string;
  nextName?: string;
  dragHandle?: React.ReactNode;
}

export const MemberCard = React.memo(function MemberCard({
  m, index, isLast, selectionMode, isSelected, showReorder,
  front, allFrontIds, groups,
  onActivate, onToggleSelect, onEnterSelection, onReorder, onQuickFront, onRemoveFromFront, fields, prevName, nextName, dragHandle,
}: MemberCardProps) {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  const {getMappingKey} = useMappingHelper();
  const tier = getMemberTier(m.id, front);
  const isFronting = allFrontIds.has(m.id);
  const badge = tier ? t(TIER_BADGE_KEY[tier]) : null;
  const badgeColor = tier ? tierAccent(T, tier) : T.accent;
  const memberGroups = useMemo(
    () => sortGroupsForDisplay(groups.filter(g => (m.groupIds || []).includes(g.id)), groups),
    [groups, m.groupIds],
  );
  const isFirst = index === 0;
  const descPreview = String(m.description ?? '').split('\n').filter(l => l.trim()).join('\n');
  const subline = [fields.pronouns !== false ? m.pronouns : null, fields.roles !== false ? m.role : null].filter(Boolean);
  const cardBorder = selectionMode
    ? (isSelected ? T.accent : T.border)
    : (isFronting ? `${m.color}60` : T.border);
  const bgMode = fields.background || 'plain';
  const bannerBg = bgMode === 'banner' && m.banner ? m.banner : null;
  const cardBg = bgMode === 'plain' || selectionMode
    ? T.card
    : bannerBg ? T.card : `${m.color}18`;
  return (
    <View
      style={[s.card, {backgroundColor: cardBg, borderColor: cardBorder, borderWidth: selectionMode && isSelected ? 2 : 1, marginBottom: 8, overflow: 'hidden'}]}>
      {bannerBg && !selectionMode && (
        <>
          <Image source={{uri: bannerBg}} accessibilityElementsHidden importantForAccessibility="no" style={StyleSheet.absoluteFill} resizeMode="cover" resizeMethod="resize" />
          <View style={[StyleSheet.absoluteFill, {backgroundColor: `${T.card}C8`}]} accessibilityElementsHidden importantForAccessibility="no" />
        </>
      )}
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 14}}>
        {dragHandle}
        {!selectionMode && showReorder && (
          <View style={{justifyContent: 'center', gap: 2, marginRight: -6}}>
            <TouchableOpacity onPress={() => onReorder?.(m.id, 'up')} hitSlop={{top: 6, bottom: 2, left: 8, right: 8}} disabled={isFirst} accessibilityRole="button" accessibilityState={{disabled: isFirst}} accessibilityLabel={isFirst || !prevName ? t('members.moveUpItem', {name: m.name}) : `${t('members.moveUpItem', {name: m.name})}, ${t('members.moveAbove', {name: prevName})}`}>
              <Text style={{fontSize: fs(14), color: isFirst ? T.muted : T.dim, opacity: isFirst ? 0.3 : 1}} accessibilityElementsHidden importantForAccessibility="no">▲</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onReorder?.(m.id, 'down')} hitSlop={{top: 2, bottom: 6, left: 8, right: 8}} disabled={isLast} accessibilityRole="button" accessibilityState={{disabled: isLast}} accessibilityLabel={isLast || !nextName ? t('members.moveDownItem', {name: m.name}) : `${t('members.moveDownItem', {name: m.name})}, ${t('members.moveBelow', {name: nextName})}`}>
              <Text style={{fontSize: fs(14), color: isLast ? T.muted : T.dim, opacity: isLast ? 0.3 : 1}} accessibilityElementsHidden importantForAccessibility="no">▼</Text>
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={[m.name, badge, ...subline, fields.groups !== false && memberGroups.length ? memberGroups.map(g => g.name).join(', ') : null, fields.descriptions !== false ? descPreview : null].filter(Boolean).join(', ')}
          accessibilityState={selectionMode ? {selected: isSelected} : undefined}
          onPress={selectionMode ? () => onToggleSelect(m.id) : () => onActivate(m)}
          onLongPress={() => selectionMode ? onToggleSelect(m.id) : onEnterSelection(m.id)}
          delayLongPress={350}
          accessibilityActions={[{name: 'longpress', label: selectionMode && isSelected ? t('members.deselectAction') : t('members.selectAction')}]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName !== 'longpress') return;
            if (selectionMode) onToggleSelect(m.id);
            else onEnterSelection(m.id);
          }}
          style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14}}>
        {selectionMode && (
          <View style={{width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: isSelected ? T.accent : T.border, backgroundColor: isSelected ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
            {isSelected && <Text style={{fontSize: fs(12), fontWeight: '700', color: T.bg}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</Text>}
          </View>
        )}
        <Avatar member={m} size={44} pulse={isFronting} />
        <View style={{flex: 1, overflow: 'hidden'}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2}}>
            <Text style={{fontSize: fs(15), fontWeight: '500', color: T.text, flexShrink: 1}} numberOfLines={1} maxFontSizeMultiplier={1.4}>{m.name}</Text>
            {badge && (<View style={{paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: `${badgeColor}18`, borderWidth: 1, borderColor: `${badgeColor}35`, flexShrink: 0}}><Text style={{fontSize: fs(10), color: badgeColor, fontWeight: '500'}} numberOfLines={1} maxFontSizeMultiplier={1.3}>{badge}</Text></View>)}
          </View>
          {subline.length > 0 ? <Text style={{fontSize: fs(12), color: T.dim}}>{subline.join(' · ')}</Text> : null}
          {fields.descriptions !== false && descPreview ? <Text style={{fontSize: fs(11), color: T.muted, marginTop: 2}} numberOfLines={2}>{descPreview}</Text> : null}
          {fields.groups !== false && memberGroups.length > 0 && (
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4}}>
              {memberGroups.map((g, gi) => (<View key={getMappingKey(g.id, gi)} style={{flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: `${g.color || T.accent}15`}}><View style={{width: 5, height: 5, borderRadius: groupKind(g) === 'subsystem' ? 1 : 2.5, backgroundColor: g.color || T.accent}} /><Text style={{fontSize: fs(10), color: g.color || T.accent}}>{g.name}</Text></View>))}
            </View>
          )}
        </View>
        </TouchableOpacity>
        {!selectionMode && (
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
            {!!onQuickFront && !!onRemoveFromFront && !m.archived && !m.deleted && (
              <TouchableOpacity onPress={() => isFronting ? onRemoveFromFront(m) : onQuickFront(m)} activeOpacity={0.7} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                accessibilityRole="button" accessibilityLabel={isFronting ? t('members.removeFromFrontName', {name: m.name}) : t('members.addToFrontName', {name: m.name})}
                style={{width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isFronting ? `${T.danger}12` : T.accentBg, borderColor: isFronting ? `${T.danger}50` : `${T.accent}40`}}>
                <PlusMinusIcon minus={isFronting} size={12} color={isFronting ? T.danger : T.accent} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  card: {borderRadius: 12, borderWidth: 1, padding: 14},
});
