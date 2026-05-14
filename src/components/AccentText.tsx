import React from 'react';
import {Text, View, StyleSheet} from 'react-native';

interface Props {
  children: React.ReactNode;
  style?: any;
  T: any;
}

const OFFSETS = [[-1,-1],[1,-1],[-1,1],[1,1]];
const OUTLINE_MIN_SIZE = 14;

export const AccentText = ({children, style, T}: Props) => {
  const fontSize = StyleSheet.flatten(style)?.fontSize ?? 12;
  const shouldOutline = T.isLight && fontSize >= OUTLINE_MIN_SIZE;

  if (!shouldOutline) {
    return <Text style={style}>{children}</Text>;
  }

  return (
    <View style={[s.wrap, style && {width: undefined, height: undefined}]}>
      {OFFSETS.map(([dx, dy], i) => (
        <Text key={i} style={[style, s.abs, {color: '#0A1F2E', left: dx, top: dy}]}>
          {children}
        </Text>
      ))}
      <Text style={[style, {color: 'transparent'}]}>{children}</Text>
      <Text style={[style, s.abs, {top: 0, left: 0}]}>{children}</Text>
    </View>
  );
};

const s = StyleSheet.create({
  wrap: {position: 'relative'},
  abs: {position: 'absolute'},
});
