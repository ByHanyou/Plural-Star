import React from 'react';
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

  if (member?.avatar) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          ...pulseStyle,
        }}>
        <Image
          source={{uri: member.avatar}}
          style={{width: size, height: size, borderRadius: size / 2}}
        />
      </View>
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
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
        }}>
        {getInitials(member?.name || '?')}
      </Text>
    </View>
  );
};
