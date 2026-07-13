import React from 'react';
import {View} from 'react-native';

export const PlusMinusIcon = ({minus = false, size = 12, thickness = 2, color}: {minus?: boolean; size?: number; thickness?: number; color: string}) => (
  <View style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={{width: size, height: thickness, borderRadius: thickness / 2, backgroundColor: color}} />
    {!minus && <View style={{position: 'absolute', width: thickness, height: size, borderRadius: thickness / 2, backgroundColor: color}} />}
  </View>
);
