import {Alert} from 'react-native';
import type {TFunction} from 'i18next';
import type {ImportMode} from './convert';

export const confirmImport = (t: TFunction, importMode: ImportMode, onConfirm: () => void): void => {
  Alert.alert(t('share.importData'), t(importMode === 'update' ? 'share.importUpdateDataMsg' : 'share.importAddDataMsg'), [
    {text: t('common.cancel'), style: 'cancel'},
    {text: t('share.importBtn'), onPress: onConfirm},
  ]);
};
