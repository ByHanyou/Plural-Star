import type {TextStyle} from 'react-native';

export const profileHeading = (fs: (n: number) => number, color: string, extra?: TextStyle): TextStyle =>
  ({fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color, fontWeight: '600', ...extra});

export const profileSectionHeading = (fs: (n: number) => number, color: string, edge: string): TextStyle =>
  profileHeading(fs, color, {marginBottom: 8, borderTopWidth: 1, borderTopColor: edge, paddingTop: 14});
