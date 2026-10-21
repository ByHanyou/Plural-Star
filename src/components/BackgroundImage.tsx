import React from 'react';
import {Image, StyleSheet, View} from 'react-native';
import type {ThemeColors} from '../theme';
import {backgroundImageUri} from '../utils/mediaUtils';

export const BackgroundImage = ({filename, theme: T}: {filename?: string; theme: ThemeColors}) => {
  const uri = backgroundImageUri(filename);
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, {backgroundColor: T.bg}]}>
      {uri && <>
        <Image source={{uri}} resizeMode="cover" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, {backgroundColor: T.bg, opacity: 0.78}]} />
      </>}
    </View>
  );
};
