import React from 'react';
import {View, Image, StatusBar, StyleSheet} from 'react-native';
import {Text} from './AppText';
import {Fonts, DEFAULT_THEME} from '../theme';

export const SplashView = () => (
  <View style={[styles.loading, {backgroundColor: DEFAULT_THEME.bg}]}>
    <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
    <Image source={require('../assets/splash-logo.png')} accessibilityElementsHidden importantForAccessibility="no" style={styles.splashLogo} resizeMode="contain" />
    <Text style={[styles.splashName, {color: DEFAULT_THEME.accent}]}>Plural Star</Text>
  </View>
);

const styles = StyleSheet.create({
  loading: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  splashLogo: {width: 200, height: 200},
  splashName: {fontFamily: Fonts.display, fontSize: 22, fontStyle: 'italic', letterSpacing: 2, marginTop: 16},
});
