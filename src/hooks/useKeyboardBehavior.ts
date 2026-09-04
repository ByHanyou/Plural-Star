import type {KeyboardAvoidingViewProps} from 'react-native';

export function useKeyboardBehavior(): KeyboardAvoidingViewProps['behavior'] {
  return 'padding';
}
