import React from 'react';
import {View, ScrollView, TouchableOpacity, Image} from 'react-native';
import {useTranslation} from 'react-i18next';
import Svg, {Path} from 'react-native-svg';
import {Text} from '../../components/AppText';
import {fontScale, initialOn} from '../../theme';
import {useTheme} from '../../themeContext';
import {JournalEntry, WhiteboardStroke, clamp, fmtTime, fmtClockHHMM, getInitials} from '../../utils';
import {MirrorAppointment, MirrorMember, MirrorReminder} from '../../network/types';
import {strokeAttrs, strokesViewBox, viewBoxAttr} from '../../whiteboard/geometry';

export const MirrorNothing = () => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  return (
    <View style={{padding: 24, alignItems: 'center'}}>
      <Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center'}}>{t('network.mirrorNothing')}</Text>
    </View>
  );
};

export const MirrorMemberRow = ({item, avatar, onPress}: {item: MirrorMember; avatar?: string; onPress: () => void}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  const sub = [item.pronouns, item.role].filter(Boolean).join('  ·  ');
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={[item.name, sub || null, item.archived ? t('members.archived') : null].filter(Boolean).join(', ')}
      style={{flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border}}>
      {avatar ? (
        <Image source={{uri: avatar}} style={{width: fs(40), height: fs(40), borderRadius: fs(20), marginRight: 12}} accessibilityElementsHidden importantForAccessibility="no" />
      ) : (
        <View style={{width: fs(40), height: fs(40), borderRadius: fs(20), marginRight: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: item.color || T.border}} accessibilityElementsHidden importantForAccessibility="no">
          <Text style={{fontSize: fs(16), fontWeight: '700', color: initialOn(item.color || T.border)}}>{Array.from(getInitials(item.name || '?'))[0] || '?'}</Text>
        </View>
      )}
      <View style={{flex: 1, minWidth: 0}}>
        <Text style={{fontSize: fs(14), fontWeight: '600', color: T.text, opacity: item.archived ? 0.55 : 1}} numberOfLines={1}>{item.name}</Text>
        {!!sub && <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}} numberOfLines={1}>{sub}</Text>}
      </View>
    </TouchableOpacity>
  );
};

export const MirrorJournalRow = ({item, onPress}: {item: JournalEntry; onPress: () => void}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  const tags = item.hashtags || [];
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={[item.title || t('common.untitled'), item.pinned ? t('noteboard.pinned') : null, item.password ? t('journal.locked') : null, fmtTime(item.timestamp)].filter(Boolean).join(', ')}
      style={{paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border}}>
      <Text style={{fontSize: fs(14), fontWeight: '600', color: T.text}} numberOfLines={1}>
        {item.pinned ? '📌 ' : ''}{item.password ? '🔒 ' : ''}{item.title || t('common.untitled')}
      </Text>
      <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}}>{fmtTime(item.timestamp)}</Text>
      {tags.length > 0 && (
        <Text style={{fontSize: fs(11), color: T.accent, marginTop: 2}} numberOfLines={1}>{tags.map(x => (x.startsWith('#') ? x : `#${x}`)).join(' ')}</Text>
      )}
    </TouchableOpacity>
  );
};

export const MirrorPlanner = ({appts, rems, bottomInset}: {
  appts: MirrorAppointment[]; rems: MirrorReminder[]; bottomInset: number;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  const plannerHeading = (label: string, marginTop = 0) => (
    <Text accessibilityRole="header" style={{fontSize: fs(12), fontWeight: '700', color: T.dim, marginTop, marginBottom: 8}}>{label}</Text>
  );
  return (
    <ScrollView contentContainerStyle={{padding: 16, paddingBottom: 16 + bottomInset}}>
      {appts.length > 0 ? (
        <>
          {plannerHeading(t('planner.appt'))}
          {appts.map((a, ai) => (
            <View key={`${String(a?.id || a?.time)}-${ai}`} style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12, marginBottom: 8}}>
              <Text style={{fontSize: fs(13), fontWeight: '600', color: a?.color || T.text}} numberOfLines={2}>{String(a?.title || '')}</Text>
              <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}}>{fmtTime(Number(a?.time) || 0)}</Text>
              {a?.location ? <Text style={{fontSize: fs(11), color: T.muted, marginTop: 2}} numberOfLines={2}>{String(a.location)}</Text> : null}
              {a?.notes ? <Text style={{fontSize: fs(11), color: T.muted, marginTop: 2}}>{String(a.notes)}</Text> : null}
            </View>
          ))}
        </>
      ) : null}
      {rems.length > 0 ? (
        <>
          {plannerHeading(t('planner.reminders'), appts.length > 0 ? 12 : 0)}
          {rems.map((r, ri) => (
            <View key={`${String(r?.id || r?.title)}-${ri}`} style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12, marginBottom: 8, opacity: r?.enabled === false ? 0.5 : 1}}>
              <Text style={{fontSize: fs(13), fontWeight: '600', color: T.text}} numberOfLines={2} accessibilityLabel={r?.enabled === false ? [String(r?.title || ''), t('planner.reminderOff')].join(', ') : undefined}>{String(r?.title || '')}</Text>
              {Array.isArray(r?.times) && r.times.length > 0 ? (
                <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}}>{r.times.map((tm: unknown) => fmtClockHHMM(String(tm))).join('  ·  ')}</Text>
              ) : null}
              {r?.notes ? <Text style={{fontSize: fs(11), color: T.muted, marginTop: 2}}>{String(r.notes)}</Text> : null}
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
};

export const MirrorWhiteboard = ({strokes, bottomInset}: {strokes: WhiteboardStroke[]; bottomInset: number}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const box = strokesViewBox(strokes);
  return (
    <ScrollView contentContainerStyle={{padding: 16, paddingBottom: 16 + bottomInset}}>
      <View accessibilityRole="image" accessibilityLabel={t('whiteboard.title')}
        style={{width: '100%', aspectRatio: clamp(box.w / box.h, 0.4, 3), backgroundColor: T.surface, borderRadius: 8, borderWidth: 1, borderColor: T.border, overflow: 'hidden'}}>
        <Svg width="100%" height="100%" viewBox={viewBoxAttr(box)}>
          {strokes.map(s => <Path key={s.id} {...strokeAttrs(s)} />)}
        </Svg>
      </View>
    </ScrollView>
  );
};
