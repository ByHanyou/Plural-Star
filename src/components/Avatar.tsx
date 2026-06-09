import React, {useState, useEffect} from 'react';
import {View, Image} from 'react-native';
import {Text} from './AppText';
import {Member, getInitials} from '../utils';

interface AvatarProps {
  member?: Member | null;
  size?: number;
  pulse?: boolean;
  T: any;
}

export const Avatar = ({member, size = 28, pulse = false, T}: AvatarProps) => {
  const [imgError, setImgError] = useState(false);
  useEffect(() => { setImgError(false); }, [member?.avatar]);

  const radius = Math.round(size * 0.22);

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

  if (member?.avatar && !imgError) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: member?.color || T.toggleOff,
          ...pulseStyle,
        }}>
        <Image
          source={{uri: member.avatar}}
          style={{width: size, height: size}}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      </View>
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        overflow: 'hidden',
        backgroundColor: member?.color || T.toggleOff,
        alignItems: 'center',
        justifyContent: 'center',
        ...pulseStyle,
      }}>
      <Text
        style={{
          fontSize: size * 0.35,
          fontWeight: '700',
          color: 'rgba(0,0,0,0.75)',
        }}
        allowFontScaling={false}>
        {getInitials(member?.name || '?')}
      </Text>
    </View>
  );
};
