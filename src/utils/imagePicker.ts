import {Alert} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import i18n from '../i18n/i18n';
import {requestImageCrop} from '../components/ImageCropModal';
import {sleep} from './concurrency';
import {errorMessage} from './log';

const asFileUri = (uri: string): string => (uri.startsWith('file://') || uri.startsWith('content://') ? uri : `file://${uri}`);

const pickFromGallery = async (): Promise<{uri: string; width?: number; height?: number} | null> => {
  const result = await launchImageLibrary({
    mediaType: 'photo',
    selectionLimit: 1,
    includeBase64: false,
    quality: 1,
    maxWidth: 1280,
    maxHeight: 1280,
  });
  if (result.didCancel) return null;
  if (result.errorCode) throw new Error(result.errorMessage || result.errorCode);
  const a = result.assets?.[0];
  return a?.uri ? {uri: asFileUri(a.uri), width: a.width, height: a.height} : null;
};

const askHowToUse = (): Promise<'auto' | 'edit' | 'cancel'> =>
  new Promise(resolve => {
    Alert.alert(i18n.t('modal.imagePickHow'), undefined, [
      {text: i18n.t('common.cancel'), style: 'cancel', onPress: () => resolve('cancel')},
      {text: i18n.t('modal.imageAuto'), onPress: () => resolve('auto')},
      {text: i18n.t('common.edit'), onPress: () => resolve('edit')},
    ], {cancelable: true, onDismiss: () => resolve('cancel')});
  });

const pickImageUri = async (): Promise<string | null> => {
  const img = await pickFromGallery();
  if (!img) return null;
  const choice = await askHowToUse();
  if (choice === 'cancel') return null;
  if (choice === 'auto') return img.uri;
  await sleep(500);
  const cropped = await requestImageCrop(img);
  return cropped ? asFileUri(cropped.uri) : null;
};

export const pickAndSaveImage = async (save: (fileUri: string) => Promise<string>): Promise<string | null> => {
  try {
    const uri = await pickImageUri();
    return uri ? await save(uri) : null;
  } catch (e) {
    Alert.alert(i18n.t('modal.pfpFailed'), errorMessage(e));
    return null;
  }
};
