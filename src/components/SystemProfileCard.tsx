import React from 'react';
import {View, ScrollView, StyleSheet, Image} from 'react-native';
import {Text} from './AppText';
import {useTranslation} from 'react-i18next';
import {RichText} from './MarkdownRenderer';
import {getInitials} from '../utils';
import {fontScale, initialOn} from '../theme';
import type {ThemeColors} from '../theme';

interface Props {
  T: ThemeColors;
  name: string;
  description?: string;
  avatar?: string;
  banner?: string;
  children?: React.ReactNode;
  bottomInset?: number;
  embedded?: boolean;
}

export const SystemProfileCard = ({T, name, description, avatar, banner, children, bottomInset = 0, embedded = false}: Props) => {
  const {t} = useTranslation();
  const fs = fontScale(T);
  const inner = (
    <>
      {banner ? (
        <Image source={{uri: banner}} accessibilityElementsHidden importantForAccessibility="no" style={{width: '100%', aspectRatio: 3}} resizeMode="cover" />
      ) : null}
      <View style={{paddingHorizontal: embedded ? 0 : 16, paddingTop: banner ? 0 : embedded ? 0 : 20}}>
        <View style={{alignItems: 'center', marginTop: banner ? -36 : 0, marginBottom: 14}}>
          {avatar ? (
            <Image source={{uri: avatar}} accessibilityRole="image" accessibilityLabel={name || t('systemProfile.title')}
              style={{width: 88, height: 88, borderRadius: 20, borderWidth: 2, borderColor: T.accent}} resizeMode="cover" />
          ) : (
            <View style={{width: 88, height: 88, borderRadius: 20, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)'}}>
              <Text style={{fontSize: fs(30), fontWeight: '700', color: initialOn(T.accent), includeFontPadding: false, textAlign: 'center', textAlignVertical: 'center'}}
                accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {getInitials(name || '?')}
              </Text>
            </View>
          )}
          <Text accessibilityRole="header" style={{fontSize: fs(22), fontWeight: '600', color: T.text, marginTop: 10, textAlign: 'center'}} numberOfLines={3}>
            {name || t('systemProfile.unnamed')}
          </Text>
        </View>

        <View style={[s.card, {backgroundColor: T.card, borderColor: T.border, padding: 14}]}>
          {description ? (
            <RichText text={description} T={T} />
          ) : (
            <Text style={{fontSize: fs(12), color: T.muted, fontStyle: 'italic'}}>{t('systemProfile.noDescription')}</Text>
          )}
        </View>
        {children}
      </View>
    </>
  );
  if (embedded) return inner;
  return (
    <ScrollView style={{flex: 1}} contentContainerStyle={{paddingBottom: 24 + bottomInset}}>
      {inner}
    </ScrollView>
  );
};

const s = StyleSheet.create({
  card: {borderRadius: 14, borderWidth: 1},
});
