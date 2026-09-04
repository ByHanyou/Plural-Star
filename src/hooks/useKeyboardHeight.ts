import {useEffect, useState} from 'react';
import {Dimensions, Keyboard, Platform} from 'react-native';

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const onFrame = (e: any) => {
      const screenY = e?.endCoordinates?.screenY;
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
