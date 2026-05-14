import {Keyboard, Platform, InteractionManager} from 'react-native';
import {pick as pickDocument, isCancel as isPickerCancel} from '@react-native-documents/picker';

export {isPickerCancel};
export const getPickedFilePath = (result: any): string => {
  const uri = result?.fileCopyUri || result?.uri || '';
  return uri.startsWith('file://') ? uri.replace('file://', '') : uri;
};

const resolveUri = (result: any): any => {
  if (Platform.OS === 'android' && result.fileCopyUri) {
    return {...result, uri: result.fileCopyUri};
  }
  return result;
};

export const safePick = (options: {type: string[]}): Promise<any[]> => {
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
