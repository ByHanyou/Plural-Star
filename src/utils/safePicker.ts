import {InteractionManager, Keyboard, Platform} from 'react-native';
import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick as pickDocument,
  types,
  type DocumentPickerOptionsBase,
  type DocumentPickerResponse,
} from '@react-native-documents/picker';
import {log} from './log';

const EXT_RE = /\.[A-Za-z0-9]{1,8}$/;

const decodeOr = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export const isPickerCancel = (error: unknown): boolean =>
  isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED;

export const getPickedFilePath = (result: DocumentPickerResponse | undefined): string => {
  const uri = result?.uri || '';
  if (!uri.startsWith('file://')) return uri;
  return decodeOr(uri.slice('file://'.length).split('#')[0].split('?')[0]);
};

const copyFileName = (result: DocumentPickerResponse, index: number): string => {
  const name = (result.name || '').trim();
  if (name) return name;
  const tail = decodeOr(result.uri.split('/').pop() || '');
  return EXT_RE.test(tail) ? tail : `picked-${Date.now()}-${index}`;
};

const localCopy = async (result: DocumentPickerResponse, index: number): Promise<DocumentPickerResponse> => {
  if (!result.uri || result.uri.startsWith('file://')) return result;
  try {
    const [copy] = await keepLocalCopy({
      destination: 'cachesDirectory',
      files: [{uri: result.uri, fileName: copyFileName(result, index)}],
    });
    if (copy.status === 'success' && copy.localUri) return {...result, uri: copy.localUri};
    if (copy.status === 'error') log.debug('picker', copy.copyError);
  } catch (e) {
    log.debug('picker', e);
  }
  return result;
};

const localizeOnAndroid = async (results: DocumentPickerResponse[]): Promise<DocumentPickerResponse[]> => {
  if (Platform.OS !== 'android') return results;
  const output: DocumentPickerResponse[] = [];
  for (let index = 0; index < results.length; index++) output.push(await localCopy(results[index], index));
  return output;
};

export const safePick = (options: DocumentPickerOptionsBase): Promise<DocumentPickerResponse[]> =>
  new Promise((resolve, reject) => {
    Keyboard.dismiss();
    const launch = () => {
      const pickerOptions =
        Platform.OS === 'ios'
          ? {type: [types.allFiles], allowMultiSelection: !!options.allowMultiSelection}
          : Array.isArray(options.type) && options.type.length > 1
          ? {...options, type: [types.allFiles]}
          : options;
      pickDocument(pickerOptions).then(localizeOnAndroid).then(resolve, reject);
    };
    if (Platform.OS === 'android') {
      InteractionManager.runAfterInteractions(() => {
        setTimeout(launch, 150);
      });
      return;
    }
    launch();
  });
