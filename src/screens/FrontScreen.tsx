

import React from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import {Text} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {reportSaveError} from '../utils/saveError';
import {announceMove} from '../utils/announce';
import {Fonts, fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {useAppStore} from '../store/appStore';
import {useUiStore} from '../store/uiStore';
import {useMinuteTick} from '../hooks/useMinuteTick';
import {useDragReorder} from '../hooks/useDragReorder';
import {removeFromFront, saveFrontSortMode, saveFrontCustomOrder} from '../store/actions';
import {
  FrontTier,
  FrontSortMode,
  isFrontEmpty,
  orderFronters,
  placeInCustomOrder,
  FRONT_TIER_KEYS,
} from '../utils';
import {TierCard} from './front/TierCard';

const FRONT_SORTS: [FrontSortMode, string][] = [
  ['added', 'frontSort.added'],
  ['az', 'frontSort.az'],
  ['za', 'frontSort.za'],
  ['custom', 'frontSort.custom'],
];

export const FrontScreen = () => {
  const T = useTheme();
  const onSetFront = useUiStore(s => s.openSetFront);
  const onEditDetails = useUiStore(s => s.openEditFrontDetail);
  const onOpenMember = useUiStore(s => s.openMemberById);
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
    saveFrontCustomOrder(placeInCustomOrder(live.appSettings.frontCustomOrder, ordered, keep)).catch(reportSaveError);
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
    announceMove(to, ids.length, getMember(ids[to])?.name, dir === -1);
  };
  const dragProps = {custom: customOn, drag, dragging, registerHeight, makeHandlePanHandlers, onStep: stepFronter};

  const quickRemove = (memberId: string) => {
    const name = getMember(memberId)?.name || '';
    Alert.alert(t('front.quickRemove', {name}), t('members.removeFromFrontMsg', {name}), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('network.remove'), style: 'destructive', onPress: () => { removeFromFront(memberId).catch(reportSaveError); }},
    ]);
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
            style={[s.heading, {color: T.text, marginBottom: 10, fontSize: fs(22)}]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}>
            {t('front.currentlyFronting')}
          </Text>
          <TouchableOpacity
            onPress={onSetFront}
            accessibilityRole="button"
            accessibilityLabel={t('front.update')}
            hitSlop={{top: 8, bottom: 8}} style={[
              s.btn,
              {backgroundColor: T.accentBg, borderColor: `${T.accent}40`, alignSelf: 'flex-start'},
            ]}>
            <Text
              style={[s.btnText, {color: T.accent, fontSize: fs(13)}]}
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
                  <TouchableOpacity key={mode} onPress={() => { if (!sel) saveFrontSortMode(mode).catch(reportSaveError); }} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityState={{selected: sel}} accessibilityLabel={t('a11y.labelValue', {label: t('frontSort.label'), value: t(key)})}
                    hitSlop={{top: 9, bottom: 9}} style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
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

        {empty || !front ? (
          <View style={[s.emptyCard, {backgroundColor: T.card, borderColor: T.border}]}>
            <Text style={{color: T.muted, fontSize: fs(13)}}>
              {t('front.noOneFronting')}
            </Text>
          </View>
        ) : FRONT_TIER_KEYS.map(tierKey => (
          <TierCard
            key={tierKey}
            tier={front[tierKey]}
            tierKey={tierKey}
            getMember={getMember}
            front={front}
            onEditDetails={onEditDetails}
            onQuickRemove={quickRemove}
            onOpenMember={onOpenMember}
            ids={orderedIds(front[tierKey])}
            {...dragProps}
          />
        ))}

      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
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
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    minHeight: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
