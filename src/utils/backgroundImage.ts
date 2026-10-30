import {BACKGROUND_DIR, downscaleOrCopy, ensureDir, removeIfExists} from './mediaFiles';

export const backgroundImageUri = (filename?: string): string | undefined =>
  typeof filename === 'string' && /^background-[a-z0-9-]+\.png$/.test(filename)
    ? `file://${BACKGROUND_DIR}/${filename}`
    : undefined;

export const removeBackgroundImage = async (filename?: string): Promise<void> => {
  const uri = backgroundImageUri(filename);
  if (!uri) return;
  await removeIfExists(uri.slice('file://'.length));
};

export const saveBackgroundImageFromUri = async (sourceUri: string): Promise<string> => {
  if (!sourceUri.startsWith('file://') && !sourceUri.startsWith('content://')) throw new Error('Invalid background image');
  await ensureDir(BACKGROUND_DIR);
  const filename = `background-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
  try {
    await downscaleOrCopy(sourceUri, `${BACKGROUND_DIR}/${filename}`, 1920);
    return filename;
  } catch (e) {
    await removeBackgroundImage(filename);
    throw e;
  }
};
