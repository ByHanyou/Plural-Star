import {Keyboard, Platform, InteractionManager} from 'react-native';
import {pick as pickDocument, isCancel as isPickerCancel} from '@react-native-documents/picker';

export {isPickerCancel};
export const getPickedFilePath = (result: any): string => {
  const uri = result?.fileCopyUri || result?.uri || '';
  return uri.startsWith('file://') ? uri.replace('file://', '') : uri;
};

/**
 * Resolves the best readable URI for a picked file result.
 *
 * On Android (especially Samsung devices with OneUI), the picker returns
 * content:// URIs that are wrapped by Samsung's file provider and may not
 * be directly readable by RNFS. The picker library copies the file to the
 * app cache and exposes `fileCopyUri` (a plain file:// path) for exactly
 * this case. We prefer it on Android whenever it is available.
 */
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
