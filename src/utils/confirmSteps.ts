import {Alert} from 'react-native';
import i18n from '../i18n/i18n';

export interface ConfirmStep {
  title: string;
  message: string;
  action: string;
}

export const confirmSteps = (steps: ConfirmStep[], onConfirm: () => void, onCancel?: () => void): void => {
  const [step, ...rest] = steps;
  if (!step) {
    onConfirm();
    return;
  }
  Alert.alert(step.title, step.message, [
    {text: i18n.t('common.cancel'), style: 'cancel', onPress: onCancel},
    {text: step.action, style: 'destructive', onPress: () => confirmSteps(rest, onConfirm, onCancel)},
  ]);
};
