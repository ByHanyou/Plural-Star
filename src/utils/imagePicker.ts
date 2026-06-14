import {launchImageLibrary} from 'react-native-image-picker';
import type {PhotoQuality} from 'react-native-image-picker';

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
