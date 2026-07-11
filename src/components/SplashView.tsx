import React from 'react';
import {View, Image, StatusBar, StyleSheet} from 'react-native';
import {Text} from './AppText';
import {T} from '../theme';

export const SplashView = () => (
  <View style={[styles.loading, {backgroundColor: T.bg}]}>
    <StatusBar barStyle="light-content" backgroundColor={T.bg} translucent={false} />
    <Image source={require('../assets/splash-logo.png')} accessibilityElementsHidden importantForAccessibility="no" style={styles.splashLogo} resizeMode="contain" />
    <Text style={[styles.splashName, {color: T.accent}]}>Plural Star</Text>
  </View>
);

const styles = StyleSheet.create({
  loading: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  splashLogo: {width: 200, height: 200},
  splashName: {fontFamily: 'OpenDyslexic', fontSize: 22, fontStyle: 'italic', letterSpacing: 2, marginTop: 16},
});
