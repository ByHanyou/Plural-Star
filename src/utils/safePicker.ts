import {Keyboard, Platform, InteractionManager} from 'react-native';
import {
  errorCodes,
  isErrorWithCode,
  pick as pickDocument,
  type DocumentPickerOptionsBase,
  type DocumentPickerResponse,
} from '@react-native-documents/picker';

export const isPickerCancel = (error: unknown): boolean =>
  isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED;
export const getPickedFilePath = (result: any): string => {
  const uri = result?.uri || '';
  return uri.startsWith('file://') ? uri.replace('file://', '') : uri;
};

const resolveUri = (result: DocumentPickerResponse): DocumentPickerResponse => result;

export const safePick = (
  options: DocumentPickerOptionsBase,
): Promise<DocumentPickerResponse[]> => {
  return new Promise((resolve, reject) => {
    Keyboard.dismiss();
    const launch = () => {
      try {
        pickDocument(options)
          .then(results => resolve(results.map(resolveUri)))
          .catch(reject);
      } catch (e) {
        reject(e);
      }
    };
    if (Platform.OS === 'android') {
      InteractionManager.runAfterInteractions(() => {
        setTimeout(launch, 150);
      });
    } else {
      launch();
    }
  });
};
