import React, {useState, useEffect} from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  AccessibilityInfo,
} from 'react-native';
import type {GestureResponderHandlers} from 'react-native';
import {Text} from '../components/AppText';
import {Avatar} from '../components/Avatar';
import {DragHandle} from '../components/DragHandle';
import {useTranslation} from 'react-i18next';
import {Fonts, fontScale, ThemeColors} from '../theme';
import {useAppStore} from '../store/appStore';
import {useMinuteTick} from '../hooks/useMinuteTick';
import {useDragReorder} from '../hooks/useDragReorder';
import type {DragReorderState} from '../hooks/useDragReorder';
import {updateFront, saveFrontSortMode, saveFrontCustomOrder} from '../store/actions';
import {
  FrontState,
  FrontTier,
  FrontTierKey,
  FrontSortMode,
  Member,
  fmtTime,
  fmtDur,
  frontSessionStart,
  isFrontEmpty,
  translateMood,
  upperText,
  orderFronters,
  placeInCustomOrder,
} from '../utils';

interface Props {
  theme: ThemeColors;
  onSetFront: () => void;
  onEditDetails: (tier: FrontTierKey) => void;
  onOpenMember?: (id: string) => void;
}

const stripMember = (tier: FrontTier, id: string): FrontTier => ({
  ...tier,
  memberIds: tier.memberIds.filter(x => x !== id),
});

const TIER_I18N_KEY: Record<FrontTierKey, string> = {
  primary: 'tier.primaryFront',
  coFront: 'tier.coFront',
  coConscious: 'tier.coConscious',
};

const FRONT_SORTS: [FrontSortMode, string][] = [
  ['added', 'frontSort.added'],
  ['az', 'frontSort.az'],
  ['za', 'frontSort.za'],
  ['custom', 'frontSort.custom'],
];

const dragKey = (tierKey: FrontTierKey, id: string) => `${tierKey}|${id}`;

const TierCard = ({
  tier,
  tierKey,
  T,
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
  T: ThemeColors;
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
  const {t} = useTranslation();

  const fs = fontScale(T);

  const [note, setNote] = useState(tier.note || '');

  useEffect(() => {
    setNote(tier.note || '');
  }, [tier.note]);

  const fronters = ids
    .map(getMember)
    .filter(Boolean) as Member[];
  const canDrag = custom && fronters.length > 1;

  const isPrimary = tierKey === 'primary';
  const label = t(TIER_I18N_KEY[tierKey]);
  const accentColor =
    isPrimary ? T.accent : tierKey === 'coFront' ? T.info : T.success;

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
        <Text
          accessibilityRole="header"
          style={{
            fontSize: fs(10),
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: accentColor,
            fontWeight: '700',
          }}>
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
              return (
              <View key={m.id}
                onLayout={canDrag ? e => registerHeight(key, e.nativeEvent.layout.height) : undefined}
                style={{flexDirection: 'row', alignItems: 'center', gap: 12,
                  ...(canDrag ? {borderTopWidth: 2, borderTopColor: isDropTarget ? T.accent : 'transparent'} : null),
                  ...(drag.key === key ? {transform: [{translateY: drag.dy}], zIndex: 10, elevation: 6} : null)}}>
                {canDrag && (
                  <DragHandle T={T} active panHandlers={makeHandlePanHandlers(key, () => fronters.map(x => dragKey(tierKey, x.id)))} name={m.name}
                    position={idx + 1} count={fronters.length}
                    onStep={dir => onStep(fronters.map(x => x.id), m.id, dir)} />
                )}
                <TouchableOpacity onPress={onOpenMember ? () => onOpenMember(m.id) : undefined} activeOpacity={onOpenMember ? 0.7 : 1} disabled={!onOpenMember} accessible={!!onOpenMember}
                  accessibilityRole={onOpenMember ? 'button' : undefined} accessibilityLabel={onOpenMember ? `${m.name}, ${t('systemMap.viewProfile')}` : undefined}
                  style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12}}>
                  <Avatar member={m} size={isPrimary ? 48 : 40} T={T} />
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
                <Text style={{fontSize: fs(11), color: T.muted}} accessibilityLabel={`${m.name}, ${t('front.frontingFor')} ${fmtDur(front.memberSince?.[m.id] ?? front.startTime)}`}>
                  {fmtDur(front.memberSince?.[m.id] ?? front.startTime)}
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
              {t('front.frontingFor')}{' '}
              <Text style={{color: T.accent}}>{fmtDur(frontSessionStart(front))}</Text>{' '}
              · {t('front.since')} {fmtTime(frontSessionStart(front))}
            </Text>
          </View>
        )}

        {(tier.mood || tier.location || tier.energyLevel) ? (
          <View style={{flexDirection: 'row', gap: 16, borderTopWidth: 1, borderTopColor: T.border, paddingTop: 8, marginBottom: 8}}>
            {tier.mood ? (
              <View style={{flex: 1}}>
                <Text style={{fontSize: fs(9), letterSpacing: 1, color: T.dim, textTransform: 'uppercase'}}>{t('modal.mood')}</Text>
                <Text style={{fontSize: fs(13), fontWeight: '500', color: T.text}} numberOfLines={2}>{translateMood(tier.mood, t)}</Text>
              </View>
            ) : null}
            {tier.location ? (
              <View style={{flex: 1}}>
                <Text style={{fontSize: fs(9), letterSpacing: 1, color: T.dim, textTransform: 'uppercase'}}>{t('modal.location')}</Text>
                <Text style={{fontSize: fs(13), fontWeight: '500', color: T.text}} numberOfLines={2}>{tier.location}</Text>
              </View>
            ) : null}
            {tier.energyLevel ? (
              <View>
                <Text style={{fontSize: fs(9), letterSpacing: 1, color: T.dim, textTransform: 'uppercase'}}>{t('energy.label')}</Text>
                <Text style={{fontSize: fs(13), fontWeight: '500', color: T.text}}>{tier.energyLevel}/10</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <TouchableOpacity onPress={() => onEditDetails(tierKey)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('tier.editTier', {tier: label})} style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 8}}>
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

export const FrontScreen = ({
  theme: T,
  onSetFront,
  onEditDetails,
  onOpenMember,
}: Props) => {
  const front = useAppStore(s => s.front);
  const members = useAppStore(s => s.members);
  const frontSortMode: FrontSortMode = useAppStore(s => s.appSettings.frontSortMode) || 'added';
  const frontCustomOrder = useAppStore(s => s.appSettings.frontCustomOrder);
  const getMember = (id: string) => members.find(m => m.id === id);
  const {t} = useTranslation();
  const fs = fontScale(T);
  useMinuteTick();

  const empty = isFrontEmpty(front);
  const customOn = frontSortMode === 'custom';
  const orderedIds = (tier: FrontTier) =>
    orderFronters(tier.memberIds.filter(id => !!getMember(id)), frontSortMode, id => getMember(id)?.name || '', frontCustomOrder);
  const commitOrder = (ordered: string[]) => {
    const live = useAppStore.getState();
    const keep = (id: string) => live.members.some(m => m.id === id && !m.deleted);
    saveFrontCustomOrder(placeInCustomOrder(live.appSettings.frontCustomOrder, ordered, keep)).catch(() => {});
  };
  const onDropFronter = (_key: string, from: number, to: number, siblings: string[]) => {
    const ids = siblings.map(k => k.slice(k.indexOf('|') + 1));
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    commitOrder(ids);
  };
  const {drag, dragging, registerHeight, makeHandlePanHandlers} = useDragReorder({enabled: customOn, onDrop: onDropFronter});
  const stepFronter = (ids: string[], id: string, dir: 1 | -1) => {
    const from = ids.indexOf(id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, id);
    commitOrder(next);
    const neighbor = getMember(ids[to])?.name || '';
    AccessibilityInfo.announceForAccessibility(
      to === 0 ? t('common.movedToTop')
        : to === ids.length - 1 ? t('common.movedToBottom')
        : dir === -1 ? t('common.movedAbove', {name: neighbor})
        : t('common.movedBelow', {name: neighbor}),
    );
  };
  const dragProps = {custom: customOn, drag, dragging, registerHeight, makeHandlePanHandlers, onStep: stepFronter};

  const quickRemove = (memberId: string) => {
    if (!front) return;
    updateFront(
      stripMember(front.primary, memberId),
      stripMember(front.coFront, memberId),
      stripMember(front.coConscious, memberId),
    ).catch(() => {});
  };

  return (
    <View style={{flex: 1}}>
      <ScrollView
        style={{flex: 1, backgroundColor: T.bg}}
        scrollEnabled={!dragging}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 140,
        }}>

        <View style={{marginBottom: 16}}>
          <Text
            accessibilityRole="header"
            style={[s.heading, {color: T.text, marginBottom: 10}]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}>
            {t('front.currentlyFronting')}
          </Text>
          <TouchableOpacity
            onPress={onSetFront}
            accessibilityRole="button"
            accessibilityLabel={t('front.update')}
            style={[
              s.btn,
              {backgroundColor: T.accentBg, borderColor: `${T.accent}40`, alignSelf: 'flex-start'},
            ]}>
            <Text
              style={[s.btnText, {color: T.accent}]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}>
              {t('front.update')}
            </Text>
          </TouchableOpacity>
        </View>

        {!empty && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 14, flexGrow: 0}}>
            <View style={{flexDirection: 'row', gap: 6, paddingHorizontal: 2}}>
              {FRONT_SORTS.map(([mode, key]) => {
                const sel = frontSortMode === mode;
                return (
                  <TouchableOpacity key={mode} onPress={() => { if (!sel) saveFrontSortMode(mode).catch(() => {}); }} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityState={{selected: sel}} accessibilityLabel={`${t('frontSort.label')}: ${t(key)}`}
                    style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
                      backgroundColor: sel ? `${T.accent}20` : T.surface,
                      borderColor: sel ? `${T.accent}50` : T.border}}>
                    <Text style={{fontSize: fs(12), color: sel ? T.accent : T.dim, fontWeight: sel ? '600' : '400'}} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                      {t(key)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}

        {empty ? (
          <View style={[s.emptyCard, {backgroundColor: T.card, borderColor: T.border}]}>
            <Text style={{color: T.muted, fontSize: fs(13)}}>
              {t('front.noOneFronting')}
            </Text>
          </View>
        ) : (
          <>
            <TierCard
              tier={front!.primary}
              tierKey="primary"
              T={T}
              getMember={getMember}
              front={front!}
              onEditDetails={onEditDetails}
              onQuickRemove={quickRemove}
              onOpenMember={onOpenMember}
              ids={orderedIds(front!.primary)}
              {...dragProps}
            />

            <TierCard
              tier={front!.coFront}
              tierKey="coFront"
              T={T}
              getMember={getMember}
              front={front!}
              onEditDetails={onEditDetails}
              onQuickRemove={quickRemove}
              onOpenMember={onOpenMember}
              ids={orderedIds(front!.coFront)}
              {...dragProps}
            />

            <TierCard
              tier={front!.coConscious}
              tierKey="coConscious"
              T={T}
              getMember={getMember}
              front={front!}
              onEditDetails={onEditDetails}
              onQuickRemove={quickRemove}
              onOpenMember={onOpenMember}
              ids={orderedIds(front!.coConscious)}
              {...dragProps}
            />
          </>
        )}

      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  heading: {
    fontFamily: Fonts.display,
    fontSize: 22,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  btnText: {
    fontSize: 13,
    fontWeight: '500',
  },
  tierCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    minHeight: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
});