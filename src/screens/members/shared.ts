import {StyleSheet} from 'react-native';
import {Fonts} from '../../theme';
import {AppSettings} from '../../utils';

export type MemberTab = 'active' | 'facets' | 'customFronts';
export type MemberListFields = NonNullable<AppSettings['memberListFields']>;

export const ms = StyleSheet.create({
  heading: {fontFamily: Fonts.display, fontSize: 22, fontWeight: '600', fontStyle: 'italic'},
  addBtn: {paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1},
  search: {borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, fontSize: 13, marginBottom: 14},
  empty: {alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24},
  chip: {paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1},
});
