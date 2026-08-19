import {useEffect, useState} from 'react';
import {Dimensions, Keyboard, Platform} from 'react-native';

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // Both platforms: pad by how far the keyboard actually overlaps the
    // CURRENT window (winH - screenY), measured at event time — never by the
    // event's raw `height`. On Android that raw height is wrong by a system
    // bar on notch/gesture devices and, under the app-wide KeyboardProvider's
    // edge-to-edge handling, it overshoots the real overlap, which floated
    // sheets a bar's height above the keyboard. If the window itself was
    // already resized or panned for the keyboard, this measures ~0 instead of
    // stacking a second, doubled adjustment on top of the system's.
    const onFrame = (e: any) => {
      const screenY = e?.endCoordinates?.screenY;
      // No frame origin (shouldn't happen on either platform) — fall back to
      // the raw height rather than leaving content under the keyboard.
      if (typeof screenY !== 'number') { setHeight(e?.endCoordinates?.height || 0); return; }
      const winH = Dimensions.get('window').height;
      setHeight(Math.max(0, winH - screenY));
    };
    const subs = Platform.OS === 'ios'
      ? [
          Keyboard.addListener('keyboardWillShow', onFrame),
          Keyboard.addListener('keyboardWillChangeFrame', onFrame),
          Keyboard.addListener('keyboardWillHide', () => setHeight(0)),
        ]
      : [
          Keyboard.addListener('keyboardDidShow', onFrame),
          Keyboard.addListener('keyboardDidHide', () => setHeight(0)),
        ];
    return () => subs.forEach(s => s.remove());
  }, []);

  return height;
}
