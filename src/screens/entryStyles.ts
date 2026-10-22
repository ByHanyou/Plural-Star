import {StyleSheet} from 'react-native';
import {Fonts} from '../theme';

export const entry = StyleSheet.create({
  container: {flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48},
  logo: {width: 180, height: 180, marginBottom: 24},
  heading: {fontFamily: Fonts.display, fontWeight: '600', fontStyle: 'italic', marginBottom: 8},
  sub: {fontSize: 14, marginBottom: 40},
  form: {width: '100%'},
  label: {fontSize: 10, letterSpacing: 1, fontWeight: '600', marginBottom: 5},
  input: {borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 14},
  btn: {borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 4},
  btnText: {fontSize: 15, fontWeight: '700'},
});
