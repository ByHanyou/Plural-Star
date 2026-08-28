import React, {useState, useEffect} from 'react';
import {View, Image} from 'react-native';
import {Text} from './AppText';
import {Member, getInitials} from '../utils';
import type {ThemeColors} from '../theme';

interface AvatarProps {
  member?: Member | null;
  size?: number;
  pulse?: boolean;
  T: ThemeColors;
}

/**
 * Memoised: this renders in every row of every list in the app — the member
 * list, chat messages, every picker — so without it one parent re-render
 * rebuilds hundreds of these and their style objects for nothing. The theme
 * object is memoised at the top of App, so the comparison actually holds.
 */
export const Avatar = React.memo(function Avatar({member, size = 28, pulse = false, T}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  // Keyed on id as well as uri: FlashList recycles row components, so this
  // instance can be handed a different member while imgError is still true from
  // the previous one — that row would then show initials for a member whose
  // image is perfectly fine.
  useEffect(() => { setImgError(false); }, [member?.id, member?.avatar]);

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
          backgroundColor: member.avatarTransparent ? 'transparent' : (member?.color || T.toggleOff),
          ...pulseStyle,
        }}>
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
          // Android reserves ascender/descender padding inside the glyph box,
          // which floats a single centered initial visibly off middle (worse
          // under the custom font choices). Both props are Android-only no-ops
          // on iOS.
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
