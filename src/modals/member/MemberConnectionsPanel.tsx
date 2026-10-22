import React from 'react';
import {View, TouchableOpacity} from 'react-native';
import {Text} from '../../components/AppText';
import {useTranslation} from 'react-i18next';
import {Avatar} from '../../components/Avatar';
import {fontScale, ensureReadable} from '../../theme';
import {useTheme} from '../../themeContext';
import type {Member} from '../../utils';
import {profileSectionHeading} from '../../components/headings';

export type MemberConnectionRow = {key: string; otherId: string; name: string; note?: string; label: string; color: string; other: Member | undefined};

export const MemberConnectionsPanel = ({rows, readOnly, memberId, onShowOnMap, onMentionPress, bgOn, mc, edge}: {
  rows: MemberConnectionRow[]; readOnly: boolean; memberId: string; onShowOnMap?: (memberId: string) => void;
  onMentionPress?: (memberId: string) => void; bgOn: boolean; mc: string; edge: string;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <View>
      {readOnly && (
        <Text accessibilityRole="header" style={profileSectionHeading(fs, mc, edge)}>{t('systemMap.connections')}</Text>
      )}
      {onShowOnMap && (
        <TouchableOpacity onPress={() => onShowOnMap(memberId)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemMap.showOnMap')}
          hitSlop={{top: 6, bottom: 6}} style={{alignSelf: 'flex-start', borderWidth: 1, borderColor: `${T.accent}40`, backgroundColor: T.accentBg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14}}>
          <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('systemMap.showOnMap')}</Text>
        </TouchableOpacity>
      )}
      {rows.length === 0 ? (
        !readOnly && <Text style={{fontSize: fs(12), color: T.dim, paddingVertical: 8}}>{t('systemMap.noneForMember')}</Text>
      ) : rows.map(row => (
        <TouchableOpacity key={row.key} onPress={() => onMentionPress?.(row.otherId)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel={[t('a11y.labelValue', {label: row.label, value: row.name}), row.note].filter(Boolean).join(', ')}
          style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border}}>
          <Avatar member={row.other} size={32} />
          <View style={{flex: 1}}>
            <Text style={{fontSize: fs(14), color: T.text}} numberOfLines={1}>{row.name}</Text>
            {row.note ? <Text style={{fontSize: fs(11), color: T.muted}} numberOfLines={1}>{row.note}</Text> : null}
          </View>
          <View style={{backgroundColor: bgOn ? T.surface : `${row.color}20`, borderWidth: 1, borderColor: bgOn ? T.border : `${row.color}60`, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3}}>
            <Text style={{fontSize: fs(10), color: bgOn ? ensureReadable(row.color, T.surface, 4.5) : row.color}}>{row.label}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
};
