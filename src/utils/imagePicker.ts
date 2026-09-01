import {Alert} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import type {PhotoQuality} from 'react-native-image-picker';
import i18n from '../i18n/i18n';
import {requestImageCrop} from '../components/ImageCropModal';

export interface PickedImage {
  uri: string;
  base64?: string;
  fileName?: string;
  type?: string;
  width?: number;
  height?: number;
}

const normalizePhotoQuality = (quality?: number): PhotoQuality => {
  if (typeof quality !== 'number' || Number.isNaN(quality)) return 1;
  const clamped = Math.max(0, Math.min(1, quality));
  return Number(clamped.toFixed(1)) as PhotoQuality;
};

export const pickImageFromGallery = async (
  opts: {includeBase64?: boolean; quality?: number; maxWidth?: number; maxHeight?: number} = {},
): Promise<PickedImage | null> => {
  const result = await launchImageLibrary({
    mediaType: 'photo',
    selectionLimit: 1,
    includeBase64: opts.includeBase64 ?? false,
    quality: normalizePhotoQuality(opts.quality),
    maxWidth: opts.maxWidth ?? 1280,
    maxHeight: opts.maxHeight ?? 1280,
  });
  if (result.didCancel) return null;
  if (result.errorCode) {
    throw new Error(result.errorMessage || result.errorCode);
  }
  const a = result.assets?.[0];
  if (!a || !a.uri) return null;
  return {
    uri: a.uri,
    base64: a.base64,
    fileName: a.fileName,
    type: a.type,
    width: a.width,
    height: a.height,
  };
};

/** Gallery pick, then the Auto/Edit choice. Auto returns the pick untouched —
 *  exactly what every call site got before this existed. Edit opens the crop
 *  editor and returns the cropped file, which then rides the same save/resize
 *  path, so Auto and Edit store through identical code. Cancel anywhere
 *  (including backing out of the crop) returns null. */
export const pickImageForUpload = async (
  opts: {includeBase64?: boolean; quality?: number; maxWidth?: number; maxHeight?: number} = {},
): Promise<PickedImage | null> => {
  const img = await pickImageFromGallery(opts);
  if (!img) return null;
  const choice = await new Promise<'auto' | 'edit' | 'cancel'>(resolve => {
    Alert.alert(i18n.t('modal.imagePickHow'), undefined, [
      {text: i18n.t('common.cancel'), style: 'cancel', onPress: () => resolve('cancel')},
      {text: i18n.t('modal.imageAuto'), onPress: () => resolve('auto')},
      {text: i18n.t('common.edit'), onPress: () => resolve('edit')},
    ], {cancelable: true, onDismiss: () => resolve('cancel')});
  });
  if (choice === 'cancel') return null;
  if (choice === 'auto') return img;
  const cropUri = img.uri.startsWith('file://') || img.uri.startsWith('content://') ? img.uri : `file://${img.uri}`;
  const cropped = await requestImageCrop({uri: cropUri, width: img.width, height: img.height});
  if (!cropped) return null;
  // base64/size describe the ORIGINAL file; never let them ride along.
  return {uri: cropped.uri, fileName: img.fileName, type: img.type};
};
