import Clipboard from '@react-native-clipboard/clipboard';

export const readClipboardImage = async (): Promise<{base64: string; ext: string} | null> => {
  try {
    const data = await Clipboard.getImage();
    if (!data || typeof data !== 'string' || !data.startsWith('data:image/')) return null;
    const mime = data.slice(5, data.indexOf(';'));
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/gif' ? 'gif' : 'jpg';
    const idx = data.indexOf('base64,');
    if (idx === -1) return null;
    const base64 = data.slice(idx + 7);
    if (!base64) return null;
    return {base64, ext};
  } catch {
    return null;
  }
};
