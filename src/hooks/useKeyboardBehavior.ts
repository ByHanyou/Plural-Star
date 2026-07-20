import {useEffect, useState} from 'react';
import {Keyboard, Platform} from 'react-native';
import type {KeyboardAvoidingViewProps} from 'react-native';

export function useKeyboardBehavior(): KeyboardAvoidingViewProps['behavior'] {
  const defaultValue: KeyboardAvoidingViewProps['behavior'] =
    Platform.OS === 'ios' ? 'padding' : 'height';
  const [behaviour, setBehaviour] =
    useState<KeyboardAvoidingViewProps['behavior']>(defaultValue);

  useEffect(() => {
    if (Platform.OS === 'ios') return;
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      setBehaviour(defaultValue);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setBehaviour(undefined);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return behaviour;
}
