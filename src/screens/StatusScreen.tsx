import React from 'react';
import {View, ScrollView, StyleSheet, TouchableOpacity} from 'react-native';
import {Text} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Fonts, fontScale, ThemeColors} from '../theme';
import {useAppStore} from '../store/appStore';
import {Member, FrontState, FrontTierKey, isFrontEmpty, fmtTime, fmtDur, translateMood} from '../utils';

interface Props {
  theme: ThemeColors;
  selfId?: string;
  onSetStatus: () => void;
  onEditDetails: (tier: FrontTierKey) => void;
}

export const StatusScreen = ({theme: T, selfId, onSetStatus, onEditDetails}: Props) => {
  const front = useAppStore(s => s.front);
  const members = useAppStore(s => s.members);
  const getMember = (id: string) => members.find(m => m.id === id);
  const {t} = useTranslation();
  const fs = fontScale(T);

  const empty = isFrontEmpty(front);
  const tier = front?.primary;
  const statuses = (tier?.memberIds || [])
    .filter(id => id !== selfId)
    .map(getMember)
    .filter(Boolean) as Member[];

  return (
    <View style={{flex: 1}}>
      <ScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={{padding: 16, paddingBottom: 140}}>
        <View style={{marginBottom: 16}}>
          <Text accessibilityRole="header" style={[s.heading, {color: T.text, marginBottom: 10, fontSize: fs(22)}]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {t('status.current')}
          </Text>
          <TouchableOpacity onPress={onSetStatus} accessibilityRole="button" accessibilityLabel={t('status.update')}
            style={[s.btn, {backgroundColor: T.accentBg, borderColor: `${T.accent}40`, alignSelf: 'flex-start'}]}>
            <Text style={[s.btnText, {color: T.accent, fontSize: fs(13)}]} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('status.update')}</Text>
          </TouchableOpacity>
        </View>

        {empty ? (
          <View style={[s.emptyCard, {backgroundColor: T.card, borderColor: T.border}]}>
            <Text style={{color: T.muted, fontSize: fs(13)}}>{t('status.noneSet')}</Text>
          </View>
        ) : (
          <TouchableOpacity onPress={() => onEditDetails('primary')} activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel={t('status.editDetails')}
            style={[s.card, {backgroundColor: T.card, borderColor: T.border}]}>
            {statuses.length > 0 && (
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10}}>
                {statuses.map(m => (
                  <View key={m.id} style={{flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: `${m.color}20`, borderWidth: 1, borderColor: `${m.color}50`}}>
                    <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: m.color}} />
                    <Text style={{fontSize: fs(13), fontWeight: '500', color: m.color}}>{m.name}</Text>
                  </View>
                ))}
              </View>
            )}
            {statuses.length === 0 && (
              <Text style={{fontSize: fs(12), color: T.muted, marginBottom: 10, fontStyle: 'italic'}}>{t('status.noStatuses')}</Text>
            )}
            {tier?.mood ? (
              <View style={s.row}>
                <Text style={[s.rowLabel, {color: T.dim, fontSize: fs(10)}]}>{t('modal.mood')}</Text>
                <Text style={{fontSize: fs(13), color: T.text}}>{translateMood(tier.mood, t)}</Text>
              </View>
            ) : null}
            {tier?.location ? (
              <View style={s.row}>
                <Text style={[s.rowLabel, {color: T.dim, fontSize: fs(10)}]}>{t('modal.location')}</Text>
                <Text style={{fontSize: fs(13), color: T.text}}>{tier.location}</Text>
              </View>
            ) : null}
            {tier?.energyLevel !== undefined ? (
              <View style={s.row}>
                <Text style={[s.rowLabel, {color: T.dim, fontSize: fs(10)}]}>{t('energy.level')}</Text>
                <Text style={{fontSize: fs(13), color: T.text}}>{tier.energyLevel}/10</Text>
              </View>
            ) : null}
            {tier?.note ? (
              <View style={s.row}>
                <Text style={[s.rowLabel, {color: T.dim, fontSize: fs(10)}]}>{t('modal.note')}</Text>
                <Text style={{fontSize: fs(13), color: T.text}}>{tier.note}</Text>
              </View>
            ) : null}
            {front ? (
              <Text style={{fontSize: fs(11), color: T.muted, marginTop: 8}}>
                {t('status.since', {time: fmtTime(front.startTime)})} · {fmtDur(front.startTime)}
              </Text>
            ) : null}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  heading: {fontFamily: Fonts.display, fontWeight: '600', fontStyle: 'italic'},
  btn: {paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1},
  btnText: {fontWeight: '500'},
  emptyCard: {borderRadius: 14, borderWidth: 1, padding: 24, alignItems: 'center'},
  card: {borderRadius: 14, borderWidth: 1, padding: 16},
  row: {flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 6},
  rowLabel: {letterSpacing: 1, textTransform: 'uppercase', fontWeight: '600', minWidth: 64},
});
