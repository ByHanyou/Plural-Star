import React, {useState} from 'react';
import {View, TouchableOpacity} from 'react-native';
import {Text} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';

export const AlphaRail = React.memo(function AlphaRail({show, letters, color, onJump}: {
  show: boolean;
  letters: string[];
  color: string;
  onJump: (letter: string) => void;
}) {
  const [railH, setRailH] = useState(0);
  const fs = fontScale(useTheme());
  if (!show) return null;
  const railItemBase = fs(9) + 3;
  const railItemH = railH > 0 && letters.length > 0 ? Math.min(railItemBase, railH / letters.length) : railItemBase;
  const railScale = railItemH / railItemBase;
  return (
    <View style={{position: 'absolute', right: 1, top: 96, bottom: 96, justifyContent: 'center'}} onLayout={e => setRailH(e.nativeEvent.layout.height)}>
      {letters.map(L => (
        <TouchableOpacity key={L} onPress={() => onJump(L)} hitSlop={{left: 10, right: 4, top: railScale < 1 ? 0 : 1, bottom: railScale < 1 ? 0 : 1}} accessibilityRole="button" accessibilityLabel={L} style={{paddingHorizontal: 3, height: railItemH, justifyContent: 'center'}}>
          <Text style={{fontSize: fs(9) * railScale, lineHeight: railItemH, fontWeight: '700', color}} allowFontScaling={false}>{L}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
});
