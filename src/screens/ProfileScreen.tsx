import React, {useState} from 'react';
import {View, ScrollView, StyleSheet, TouchableOpacity, Image} from 'react-native';
import {Text} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Fonts} from '../theme';
import {AccentText} from '../components/AccentText';
import {RichText} from '../components/MarkdownRenderer';
import {Member, FrontState, getInitials, allFrontMemberIds} from '../utils';

type SubTab = 'profile' | 'statuses';

interface Props {
  theme: any;
  member?: Member;
  statuses: Member[];
  front: FrontState | null;
  onEditProfile: () => void;
  onAddStatus: () => void;
  onEditStatus: (m: Member) => void;
}

export const ProfileScreen = ({theme: T, member, statuses, front, onEditProfile, onAddStatus, onEditStatus}: Props) => {
  const {t} = useTranslation();
  const fs = (n: number) => Math.round(n * (T.textScale || 1));
  const [subTab, setSubTab] = useState<SubTab>('profile');
  const activeIds = allFrontMemberIds(front);

  return (
    <View style={{flex: 1, backgroundColor: T.bg}}>
      <View style={{paddingHorizontal: 16, paddingTop: 16}}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <Text accessibilityRole="header" style={[s.heading, {color: T.text, flex: 1, fontSize: fs(22)}]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {t('tabs.profile')}
          </Text>
          {subTab === 'profile' ? (
            <TouchableOpacity onPress={onEditProfile} accessibilityRole="button" accessibilityLabel={t('profile.edit')}
              style={[s.btn, {backgroundColor: T.accentBg, borderColor: `${T.accent}40`}]}>
              <Text style={{fontSize: fs(13), fontWeight: '500', color: T.accent}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('common.edit')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={onAddStatus} accessibilityRole="button" accessibilityLabel={t('status.add')}
              style={[s.btn, {backgroundColor: T.accentBg, borderColor: `${T.accent}40`}]}>
              <Text style={{fontSize: fs(13), fontWeight: '500', color: T.accent}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('profile.addStatus')}</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={{flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border, marginTop: 4}}>
          {(['profile', 'statuses'] as SubTab[]).map(tab => (
            <TouchableOpacity key={tab} onPress={() => setSubTab(tab)} activeOpacity={0.7}
              accessibilityRole="tab" accessibilityState={{selected: subTab === tab}}
              style={[s.subtab, {flex: 1, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: subTab === tab ? T.accent : 'transparent'}]}>
              <AccentText T={T} numberOfLines={2} maxFontSizeMultiplier={1.3} style={{fontSize: fs(13), textAlign: 'center', fontWeight: subTab === tab ? '600' : '400', color: subTab === tab ? T.accent : T.dim}}>
                {tab === 'profile' ? t('tabs.profile') : t('profile.statuses')}
              </AccentText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {subTab === 'profile' && (
        <ScrollView style={{flex: 1}} contentContainerStyle={{paddingBottom: 140}}>
          {member?.banner ? (
            <Image source={{uri: member.banner}} accessibilityElementsHidden importantForAccessibility="no" style={{width: '100%', aspectRatio: 3}} resizeMode="cover" />
          ) : null}
          <View style={{paddingHorizontal: 16, paddingTop: member?.banner ? 0 : 20}}>
            <View style={{alignItems: 'center', marginTop: member?.banner ? -36 : 0, marginBottom: 14}}>
              {member?.avatar ? (
                <Image source={{uri: member.avatar}} accessibilityRole="image" accessibilityLabel={member.name} style={{width: 88, height: 88, borderRadius: 20, borderWidth: 2, borderColor: member.color || T.accent}} resizeMode="cover" />
              ) : (
                <View style={{width: 88, height: 88, borderRadius: 20, backgroundColor: member?.color || T.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)'}}>
                  <Text style={{fontSize: fs(30), fontWeight: '700', color: 'rgba(0,0,0,0.75)'}}>{getInitials(member?.name || '?')}</Text>
                </View>
              )}
              <Text style={{fontSize: fs(22), fontWeight: '600', color: T.text, marginTop: 10, textAlign: 'center'}} numberOfLines={2}>
                {member?.name || t('profile.notSetUp')}
              </Text>
              {member?.pronouns ? <Text style={{fontSize: fs(14), color: T.dim, marginTop: 3}}>{member.pronouns}</Text> : null}
              {member ? (
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8}}>
                  <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600'}}>{t('profile.favoriteColor')}</Text>
                  <View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: member.color || T.accent, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)'}} />
                </View>
              ) : null}
            </View>

            <View style={[s.card, {backgroundColor: T.card, borderColor: T.border, padding: 14}]}>
              {member?.description ? (
                <RichText text={member.description} T={T} />
              ) : (
                <Text style={{fontSize: fs(12), color: T.muted, fontStyle: 'italic'}}>{t('profile.noDescription')}</Text>
              )}
            </View>
          </View>
        </ScrollView>
      )}

      {subTab === 'statuses' && (
        <ScrollView style={{flex: 1}} contentContainerStyle={{padding: 16, paddingBottom: 140}}>
          <Text style={{fontSize: fs(11), color: T.muted, marginBottom: 12, lineHeight: fs(16)}}>{t('profile.statusesDesc')}</Text>
          {statuses.length === 0 ? (
            <View style={[s.card, {backgroundColor: T.card, borderColor: T.border, padding: 18, alignItems: 'center'}]}>
              <Text style={{fontSize: fs(12), color: T.muted, fontStyle: 'italic'}}>{t('profile.noStatuses')}</Text>
            </View>
          ) : (
            <View style={[s.card, {backgroundColor: T.card, borderColor: T.border, overflow: 'hidden'}]}>
              {statuses.map((m, i) => {
                const active = activeIds.includes(m.id);
                return (
                  <TouchableOpacity key={m.id} onPress={() => onEditStatus(m)} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityLabel={m.name}
                    style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: i === statuses.length - 1 ? 0 : 1, borderBottomColor: T.border}}>
                    <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: m.color}} />
                    <Text style={{flex: 1, fontSize: fs(14), color: T.text, fontWeight: '500'}} numberOfLines={1}>{m.name}</Text>
                    {active && (
                      <View style={{paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: T.successBg, borderWidth: 1, borderColor: `${T.success}40`}}>
                        <Text style={{fontSize: fs(10), color: T.success, fontWeight: '600'}}>{t('profile.activeStatus')}</Text>
                      </View>
                    )}
                    <Text style={{fontSize: fs(12), color: T.muted}}>›</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  heading: {fontFamily: Fonts.display, fontWeight: '600', fontStyle: 'italic'},
  subtab: {paddingHorizontal: 16, paddingVertical: 10, marginBottom: -1},
  btn: {paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1},
  card: {borderRadius: 14, borderWidth: 1},
});
