import React, {useState, useMemo} from 'react';
import {View, ScrollView, StyleSheet, TouchableOpacity, Image} from 'react-native';
import {Text} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Fonts, fontScale, initialOn, profileTheme} from '../theme';
import {ThemeProvider, useTheme} from '../themeContext';
import {AccentText} from '../components/AccentText';
import {RichText} from '../components/MarkdownRenderer';
import {Member, getInitials, allFrontMemberIds, singletStatuses, isValidHex, colorName} from '../utils';
import {useAppStore} from '../store/appStore';
import {useUiStore} from '../store/uiStore';
import {profileHeading} from '../components/headings';

type SubTab = 'profile' | 'statuses';

interface Props {
  member?: Member;
}

export const ProfileScreen = ({member}: Props) => {
  const T = useTheme();
  const onEditProfile = useUiStore(s => s.openProfileEditor);
  const openCustomFront = useUiStore(s => s.openCustomFront);
  const onAddStatus = () => openCustomFront(null);
  const onEditStatus = openCustomFront;
  const front = useAppStore(s => s.front);
  const members = useAppStore(s => s.members);
  const statuses = singletStatuses(members);
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [subTab, setSubTab] = useState<SubTab>('profile');
  const activeIds = allFrontMemberIds(front);
  const bgColor = member?.profileBg && isValidHex(member.color) ? member.color : null;
  const bgOn = !!bgColor;
  const P = useMemo(() => (bgColor ? profileTheme(T, bgColor) : T), [bgColor, T]);

  return (
    <View style={{flex: 1, backgroundColor: T.bg}}>
      <View style={{paddingHorizontal: 16, paddingTop: 16}}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <Text accessibilityRole="header" style={[s.heading, {color: T.text, flex: 1, fontSize: fs(22)}]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {t('tabs.profile')}
          </Text>
          <TouchableOpacity onPress={subTab === 'profile' ? onEditProfile : onAddStatus} accessibilityRole="button" accessibilityLabel={subTab === 'profile' ? t('profile.edit') : t('status.add')}
            hitSlop={{top: 8, bottom: 8}} style={[s.btn, {backgroundColor: T.accentBg, borderColor: `${T.accent}40`}]}>
            <Text style={{fontSize: fs(13), fontWeight: '500', color: T.accent}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{subTab === 'profile' ? t('common.edit') : t('profile.addStatus')}</Text>
          </TouchableOpacity>
        </View>
        <View style={{flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border, marginTop: 4}}>
          {(['profile', 'statuses'] as SubTab[]).map(tab => (
            <TouchableOpacity key={tab} onPress={() => setSubTab(tab)} activeOpacity={0.7}
              accessibilityRole="tab" accessibilityState={{selected: subTab === tab}}
              hitSlop={{top: 6, bottom: 6}} style={[s.subtab, {flex: 1, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: subTab === tab ? T.accent : 'transparent'}]}>
              <AccentText numberOfLines={2} maxFontSizeMultiplier={1.3} style={{fontSize: fs(13), textAlign: 'center', fontWeight: subTab === tab ? '600' : '400', color: subTab === tab ? T.accent : T.dim}}>
                {tab === 'profile' ? t('tabs.profile') : t('profile.statuses')}
              </AccentText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {subTab === 'profile' && (
        <ScrollView style={{flex: 1, backgroundColor: P.bg}} contentContainerStyle={{paddingBottom: 140}}>
          {member?.banner ? (
            <Image source={{uri: member.banner}} accessibilityElementsHidden importantForAccessibility="no" style={{width: '100%', aspectRatio: 3}} resizeMode="cover" />
          ) : null}
          <View style={{paddingHorizontal: 16, paddingTop: member?.banner ? 0 : 20}}>
            <View style={{alignItems: 'center', marginTop: member?.banner ? -36 : 0, marginBottom: 14}}>
              {member?.avatar ? (
                <Image source={{uri: member.avatar}} accessibilityRole="image" accessibilityLabel={member.name} style={{width: 88, height: 88, borderRadius: 20, borderWidth: 2, borderColor: bgOn ? P.border : (member.color || T.accent)}} resizeMode="cover" />
              ) : (
                <View style={{width: 88, height: 88, borderRadius: 20, backgroundColor: bgOn ? P.surface : (member?.color || T.accent), alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: bgOn ? P.border : 'rgba(255,255,255,0.15)'}}>
                  <Text style={{fontSize: fs(30), fontWeight: '700', color: bgOn ? P.text : initialOn(member?.color || T.accent), includeFontPadding: false, textAlign: 'center', textAlignVertical: 'center'}}>{getInitials(member?.name || '?')}</Text>
                </View>
              )}
              <Text accessibilityRole="header" style={{fontSize: fs(22), fontWeight: '600', color: P.text, marginTop: 10, textAlign: 'center'}} numberOfLines={2}>
                {member?.name || t('profile.notSetUp')}
              </Text>
              {member?.pronouns ? <Text style={{fontSize: fs(14), color: P.dim, marginTop: 3}}>{member.pronouns}</Text> : null}
              {member ? (
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8}}>
                  <Text style={profileHeading(fs, P.dim)}>{t('profile.favoriteColor')}</Text>
                  <View accessible accessibilityLabel={colorName(member.color || T.accent, t)} style={{width: 16, height: 16, borderRadius: 8, backgroundColor: member.color || T.accent, borderWidth: 1, borderColor: bgOn ? P.border : 'rgba(255,255,255,0.2)'}} />
                  {member.emoji ? <Text style={{fontSize: fs(16)}} accessibilityLabel={t('a11y.labelValue', {label: t('modal.emoji'), value: member.emoji})}>{member.emoji}</Text> : null}
                </View>
              ) : null}
            </View>

            <View style={[s.card, {backgroundColor: bgOn ? P.surface : T.card, borderColor: P.border, padding: 14}]}>
              {member?.description ? (
                <ThemeProvider value={P}><RichText text={member.description} /></ThemeProvider>
              ) : (
                <Text style={{fontSize: fs(12), color: P.muted, fontStyle: 'italic'}}>{t('profile.noDescription')}</Text>
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
                    accessibilityRole="button" accessibilityLabel={active ? t('profile.statusActiveA11y', {name: m.name}) : m.name}
                    style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: i === statuses.length - 1 ? 0 : 1, borderBottomColor: T.border}}>
                    <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: m.color}} />
                    <Text style={{flex: 1, fontSize: fs(14), color: T.text, fontWeight: '500'}} numberOfLines={1}>{m.name}</Text>
                    {active && (
                      <View style={{paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: T.successBg, borderWidth: 1, borderColor: `${T.success}40`}}>
                        <Text style={{fontSize: fs(10), color: T.success, fontWeight: '600'}}>{t('profile.activeStatus')}</Text>
                      </View>
                    )}
                    <Text style={{fontSize: fs(12), color: T.muted}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">›</Text>
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
