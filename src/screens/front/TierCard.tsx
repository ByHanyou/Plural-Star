import React from 'react';
import {View, TouchableOpacity, StyleSheet} from 'react-native';
import type {GestureResponderHandlers} from 'react-native';
import {useTranslation, Trans} from 'react-i18next';
import {Text} from '../../components/AppText';
import {Avatar} from '../../components/Avatar';
import {DragHandle} from '../../components/DragHandle';
import {sectionLabel} from '../../components/controls';
import {fontScale, tierAccent} from '../../theme';
import {useTheme} from '../../themeContext';
import type {DragReorderState} from '../../hooks/useDragReorder';
import {FrontState, FrontTier, FrontTierKey, Member, fmtTime, fmtDur, fmtNum, frontSessionStart, membersByIds, translateMood, upperText, TIER_I18N_KEY} from '../../utils';

export const dragKey = (tierKey: FrontTierKey, id: string) => `${tierKey}|${id}`;

export const TierCard = ({
  tier,
  tierKey,
  getMember,
  front,
  onEditDetails,
  onQuickRemove,
  onOpenMember,
  ids,
  custom,
  drag,
  dragging,
  registerHeight,
  makeHandlePanHandlers,
  onStep,
}: {
  tier: FrontTier;
  tierKey: FrontTierKey;
  getMember: (id: string) => Member | undefined;
  front: FrontState;
  onEditDetails: (tier: FrontTierKey) => void;
  onQuickRemove: (memberId: string) => void;
  onOpenMember?: (id: string) => void;
  ids: string[];
  custom: boolean;
  drag: DragReorderState;
  dragging: boolean;
  registerHeight: (key: string, h: number) => void;
  makeHandlePanHandlers: (key: string, siblings: () => string[]) => GestureResponderHandlers;
  onStep: (ids: string[], id: string, dir: 1 | -1) => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();

  const fs = fontScale(T);

  const note = tier.note || '';

  const fronters = membersByIds(ids, getMember);
  const since = frontSessionStart(front, id => !!getMember(id)?.name);
  const detail = (labelKey: string, value: string, grow = true) => (
    <View style={grow ? {flex: 1} : undefined}>
      <Text style={{fontSize: fs(9), letterSpacing: 1, color: T.dim, textTransform: 'uppercase'}}>{t(labelKey)}</Text>
      <Text style={{fontSize: fs(13), fontWeight: '500', color: T.text}} numberOfLines={grow ? 2 : undefined}>{value}</Text>
    </View>
  );
  const canDrag = custom && fronters.length > 1;

  const isPrimary = tierKey === 'primary';
  const label = t(TIER_I18N_KEY[tierKey]);
  const accentColor = tierAccent(T, tierKey);

  return (
    <View style={{marginBottom: 14}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8}}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: accentColor,
          }}
        />
        <Text accessibilityRole="header" style={sectionLabel(T, {color: accentColor, fontWeight: '700'})}>
          {label}
        </Text>
        <View style={{flex: 1, height: 1, backgroundColor: T.border}} />
      </View>

      <View
        style={[
          s.tierCard,
          {backgroundColor: T.card, borderColor: `${accentColor}40`},
        ]}>
        <View style={{gap: 12, marginBottom: 10}}>
          {fronters.length > 0 ? (
            fronters.map((m, idx) => {
              const key = dragKey(tierKey, m.id);
              const isDropTarget = dragging && drag.key !== key && drag.siblings[drag.target] === key;
              const fronting = fmtDur(front.memberSince?.[m.id] ?? front.startTime);
              return (
              <View key={m.id}
                onLayout={canDrag ? e => registerHeight(key, e.nativeEvent.layout.height) : undefined}
                style={{flexDirection: 'row', alignItems: 'center', gap: 12,
                  ...(canDrag ? {borderTopWidth: 2, borderTopColor: isDropTarget ? T.accent : 'transparent'} : null),
                  ...(drag.key === key ? {transform: [{translateY: drag.dy}], zIndex: 10, elevation: 6} : null)}}>
                {canDrag && (
                  <DragHandle active panHandlers={makeHandlePanHandlers(key, () => fronters.map(x => dragKey(tierKey, x.id)))} name={m.name}
                    position={idx + 1} count={fronters.length}
                    onStep={dir => onStep(fronters.map(x => x.id), m.id, dir)} />
                )}
                <TouchableOpacity onPress={onOpenMember ? () => onOpenMember(m.id) : undefined} activeOpacity={onOpenMember ? 0.7 : 1} disabled={!onOpenMember} accessible={!!onOpenMember}
                  accessibilityRole={onOpenMember ? 'button' : undefined} accessibilityLabel={onOpenMember ? [m.name, m.pronouns, m.role, t('systemMap.viewProfile')].filter(Boolean).join(', ') : undefined}
                  hitSlop={{top: 6, bottom: 6}} style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12}}>
                  <Avatar member={m} size={isPrimary ? 48 : 40} />
                  <View style={{flex: 1}}>
                    <Text style={{fontSize: isPrimary ? fs(16) : fs(14), fontWeight: '500', color: T.text}}>
                      {m.name}
                    </Text>
                    {m.pronouns ? (
                      <Text style={{fontSize: fs(12), color: T.dim}}>
                        {m.pronouns}
                      </Text>
                    ) : null}
                    {m.role ? (
                      <Text style={{fontSize: fs(10), fontWeight: '600', letterSpacing: 1, marginTop: 1, color: m.color}}>
                        {upperText(m.role)}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
                <Text style={{fontSize: fs(11), color: T.muted}} accessibilityLabel={t('front.frontingForA11y', {name: m.name, dur: fronting})}>
                  {fronting}
                </Text>
                <TouchableOpacity onPress={() => onQuickRemove(m.id)} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityLabel={t('front.quickRemove', {name: m.name})}
                  style={{padding: 8}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                  <Text style={{fontSize: fs(14), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no">✕</Text>
                </TouchableOpacity>
              </View>
              );
            })
          ) : (
            <Text style={{fontSize: fs(12), color: T.muted}}>
              {t('front.noOneFronting')}
            </Text>
          )}
        </View>

        {isPrimary && (
          <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 8, marginBottom: 8}}>
            <Text style={{fontSize: fs(11), color: T.muted}}>
              <Trans i18nKey="front.frontingForSince" values={{dur: fmtDur(since), time: fmtTime(since)}} components={{b: <Text style={{color: T.accent}} />}} />
            </Text>
          </View>
        )}

        {(tier.mood || tier.location || tier.energyLevel) ? (
          <View style={{flexDirection: 'row', gap: 16, borderTopWidth: 1, borderTopColor: T.border, paddingTop: 8, marginBottom: 8}}>
            {tier.mood ? detail('modal.mood', translateMood(tier.mood, t)) : null}
            {tier.location ? detail('modal.location', tier.location) : null}
            {tier.energyLevel ? detail('energy.label', t('energy.outOfTen', {n: fmtNum(tier.energyLevel, 0)}), false) : null}
          </View>
        ) : null}

        <TouchableOpacity onPress={() => onEditDetails(tierKey)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t('tier.editTier', {tier: label})}, ${note || t('front.noNote')}`} hitSlop={{top: 8, bottom: 11}} style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 8}}>
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
            <Text style={{fontSize: fs(9), letterSpacing: 1, color: T.dim}}>
              {t('front.frontNote')}
            </Text>
            <View style={{paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
              <Text style={{fontSize: fs(11), fontWeight: '500', color: T.accent}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('common.edit')}</Text>
            </View>
          </View>
          <Text style={{fontSize: fs(12), color: note ? T.text : T.muted, marginTop: 4}}>
            {note || t('front.noNote')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  tierCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
});
