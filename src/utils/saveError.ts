import {Alert} from 'react-native';
import i18n from '../i18n/i18n';
import {errorMessage, logError} from './log';

export const reportSaveError = (e: unknown): void => {
  logError('save', e);
  Alert.alert(i18n.t('modal.saveFailed'), errorMessage(e));
};
