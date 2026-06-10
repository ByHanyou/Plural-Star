import {Keyboard, Platform, InteractionManager} from 'react-native';
import {pick as pickDocument, isErrorWithCode, errorCodes, keepLocalCopy, types} from '@react-native-documents/picker';

export const isPickerCancel = (err: any): boolean =>
  isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED;
export const getPickedFilePath = (result: any): string => {
  const uri = result?.fileCopyUri || result?.uri || '';
  if (uri.startsWith('file://')) {
    const stripped = uri.replace('file://', '');
    try { return decodeURIComponent(stripped); } catch { return stripped; }
  }
  return uri;
};

const fallbackFileName = (result: any, idx: number): string => {
  const raw = (result?.name || result?.fileName || '').toString().trim();
  if (raw) return raw;
  const uri = (result?.uri || '').toString();
  const tail = uri.split('/').pop() || '';
  const decoded = (() => { try { return decodeURIComponent(tail); } catch { return tail; } })();
  if (decoded && /\.[A-Za-z0-9]{1,8}$/.test(decoded)) return decoded;
  return `picked-${Date.now()}-${idx}`;
};

const localizeOnAndroid = async (results: any[]): Promise<any[]> => {
  if (Platform.OS !== 'android' || !Array.isArray(results) || results.length === 0) return results;
  const out: any[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const srcUri = (r?.uri || r?.fileCopyUri || '').toString();
    if (!srcUri || srcUri.startsWith('file://')) { out.push(r); continue; }
    try {
      const copyRes: any = await keepLocalCopy({
        destination: 'cachesDirectory',
        files: [{uri: srcUri, fileName: fallbackFileName(r, i)}],
      });
      const first = Array.isArray(copyRes) ? copyRes[0] : copyRes;
      if (first && first.status === 'success' && typeof first.localUri === 'string' && first.localUri) {
        out.push({...r, uri: first.localUri, fileCopyUri: first.localUri});
      } else {
        out.push(r);
      }
    } catch {
      out.push(r);
    }
  }
  return out;
};

export const safePick = (options: {type: string[]; allowMultiSelection?: boolean}): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    Keyboard.dismiss();
    const launch = () => {
      try {
        pickDocument(Platform.OS === 'ios' ? {type: [types.allFiles], allowMultiSelection: !!options.allowMultiSelection} : options)
          .then(async results => {
            try {
              const localized = await localizeOnAndroid(results);
              resolve(localized);
            } catch (e) {
              resolve(results);
            }
          })
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
