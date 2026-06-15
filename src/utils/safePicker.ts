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

type LocalizedDocumentPickerResponse = DocumentPickerResponse & {
  fileCopyUri?: string;
  fileName?: string;
};

export const isPickerCancel = (error: unknown): boolean =>
  isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED;

export const getPickedFilePath = (result: unknown): string => {
  const typed = result as LocalizedDocumentPickerResponse | null | undefined;
  const uri = typed?.fileCopyUri || typed?.uri || '';
  if (!uri.startsWith('file://')) return uri;
  const stripped = uri
    .replace('file://', '')
    .split('#')[0]
    .split('?')[0];
  try {
    return decodeURIComponent(stripped);
  } catch {
    return stripped;
  }
};

const fallbackFileName = (
  result: LocalizedDocumentPickerResponse,
  index: number,
): string => {
  const raw = (result.name || result.fileName || '').toString().trim();
  if (raw) return raw;
  const tail = (result.uri || '').toString().split('/').pop() || '';
  try {
    const decoded = decodeURIComponent(tail);
    if (decoded && /\.[A-Za-z0-9]{1,8}$/.test(decoded)) return decoded;
  } catch {
    if (tail && /\.[A-Za-z0-9]{1,8}$/.test(tail)) return tail;
  }
  return `picked-${Date.now()}-${index}`;
};

const localizeOnAndroid = async (
  results: DocumentPickerResponse[],
): Promise<DocumentPickerResponse[]> => {
  if (Platform.OS !== 'android' || results.length === 0) return results;
  const output: DocumentPickerResponse[] = [];

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index] as LocalizedDocumentPickerResponse;
    const sourceUri = (result.uri || result.fileCopyUri || '').toString();

    if (!sourceUri || sourceUri.startsWith('file://')) {
      output.push(result);
      continue;
    }

    try {
      const copyResult = await keepLocalCopy({
        destination: 'cachesDirectory',
        files: [{uri: sourceUri, fileName: fallbackFileName(result, index)}],
      });
      const first = Array.isArray(copyResult) ? copyResult[0] : copyResult;

      if (first?.status === 'success' && typeof first.localUri === 'string' && first.localUri) {
        output.push({
          ...result,
          uri: first.localUri,
          fileCopyUri: first.localUri,
        } as DocumentPickerResponse);
        continue;
      }
    } catch {}

    output.push(result);
  }

  return output;
};

export const safePick = async (
  options: DocumentPickerOptionsBase,
): Promise<DocumentPickerResponse[]> =>
  new Promise((resolve, reject) => {
    Keyboard.dismiss();

    const launch = () => {
      const pickerOptions =
        Platform.OS === 'ios'
          ? {
              type: [types.allFiles],
              allowMultiSelection: !!options.allowMultiSelection,
            }
          : options;

      pickDocument(pickerOptions)
        .then(async results => {
          try {
            resolve(await localizeOnAndroid(results));
          } catch {
            resolve(results);
          }
        })
        .catch(reject);
    };

    if (Platform.OS === 'android') {
      InteractionManager.runAfterInteractions(() => {
        setTimeout(launch, 150);
      });
      return;
    }

    launch();
  });
