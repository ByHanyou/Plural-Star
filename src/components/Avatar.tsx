import React, {useState, useEffect} from 'react';
import {View, Image} from 'react-native';
import {Text} from './AppText';
import {Member, getInitials} from '../utils';
import {useTheme} from '../themeContext';
import {initialOn} from '../theme';

interface AvatarProps {
  member?: Member | null;
  size?: number;
  pulse?: boolean;
}

export const Avatar = React.memo(function Avatar({member, size = 28, pulse = false}: AvatarProps) {
  const T = useTheme();
  const [imgError, setImgError] = useState(false);
  useEffect(() => { setImgError(false); }, [member?.id, member?.avatar]);

  const fill = member?.color || T.toggleOff;

  const pulseStyle = pulse
    ? {
        shadowColor: member?.color || 'transparent',
        shadowOpacity: 0.5,
        shadowRadius: 8,
        elevation: 4,
      }
    : {
        shadowColor: 'transparent',
        shadowOpacity: 0,
        shadowRadius: 0,
        elevation: 0,
      };

  const box = {width: size, height: size, borderRadius: Math.round(size * 0.22), overflow: 'hidden' as const, ...pulseStyle};

  if (member?.avatar && !imgError) {
    return (
      <View style={{...box, backgroundColor: member.avatarTransparent ? 'transparent' : fill}}>
        <Image
          source={{uri: member.avatar}}
          style={{width: size, height: size}}
          resizeMode="cover"
          accessibilityElementsHidden
          importantForAccessibility="no"
          onError={() => setImgError(true)}
        />
      </View>
    );
  }

  return (
    <View style={{...box, backgroundColor: fill, alignItems: 'center', justifyContent: 'center'}}>
      <Text
        style={{
          fontSize: size * 0.35,
          fontWeight: '700',
          color: initialOn(fill),
          includeFontPadding: false,
          textAlign: 'center',
          textAlignVertical: 'center',
        }}
        allowFontScaling={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {getInitials(member?.name || '?')}
      </Text>
    </View>
  );
});
