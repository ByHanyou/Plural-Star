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

export const pickImageFromGallery = async (
  opts: {includeBase64?: boolean; quality?: number; maxWidth?: number; maxHeight?: number} = {},
): Promise<PickedImage | null> => {
  // maxWidth/maxHeight make the picker re-encode the image: it bakes in EXIF
  // orientation and downscales to fit. We no longer crop afterwards (frames use
  // resizeMode="cover"), so this is where the image gets sized down. 1280 keeps
  // banners crisp at 3x while staying memory-safe with many members.
  const result = await launchImageLibrary({
    mediaType: 'photo',
    selectionLimit: 1,
    includeBase64: opts.includeBase64 ?? false,
    quality: (opts.quality ?? 1) as PhotoQuality,
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
