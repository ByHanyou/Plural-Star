import {Alert, Platform} from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import Share from 'react-native-share';
import i18n from '../i18n/i18n';
import {errorMessage} from '../utils/log';
import {decodeBase64} from '../network/bytes';
import {tempFilePath} from '../utils/mediaFiles';

export const datedName = (slug: string, ext: string): string => `${slug}-${new Date().toISOString().slice(0, 10)}.${ext}`;

const mimeFor = (filename: string): string => {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.html')) return 'text/html';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.zip')) return 'application/zip';
  return 'text/plain';
};

const STREAM_CHUNK_CHARS = 64 * 1024;

const verifyExport = async (tempPath: string, filename: string, expectedSize?: number): Promise<void> => {
  const failed = () => new Error(i18n.t('share.exportVerifyFailed', {filename}));
  const lower = filename.toLowerCase();
  const stat = await ReactNativeBlobUtil.fs.stat(tempPath);
  const size = Number(stat.size) || 0;
  if (!size || (expectedSize !== undefined && size !== expectedSize)) throw failed();

  if (lower.endsWith('.json')) {
    const written = await ReactNativeBlobUtil.fs.readFile(tempPath, 'utf8');
    try { JSON.parse(written); } catch { throw failed(); }
    return;
  }

  if (lower.endsWith('.zip')) {
    const tailLen = Math.min(size, 66 * 1024);
    const tailPath = `${tempPath}.tail`;
    try {
      await ReactNativeBlobUtil.fs.slice(tempPath, tailPath, size - tailLen, size);
      const tail = decodeBase64(await ReactNativeBlobUtil.fs.readFile(tailPath, 'base64'));
      let found = false;
      for (let i = tail.length - 4; i >= 0; i--) {
        if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) { found = true; break; }
      }
      if (!found) throw failed();
    } finally {
      try { await ReactNativeBlobUtil.fs.unlink(tailPath); } catch {}
    }
  }
};

const handOffFile = async (tempPath: string, filename: string): Promise<void> => {
  if (Platform.OS === 'android') {
    try {
      await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
        {name: filename, parentFolder: '', mimeType: mimeFor(filename)},
        'Download',
        tempPath,
      );
    } finally {
      try { await ReactNativeBlobUtil.fs.unlink(tempPath); } catch {}
    }
    return;
  }
  await Share.open({
    url: `file://${tempPath}`,
    type: mimeFor(filename),
    filename,
    failOnCancel: false,
    saveToFiles: true,
  });
};

export const deliverFile = async (tempPath: string, filename: string, expectedSize?: number): Promise<void> => {
  await verifyExport(tempPath, filename, expectedSize);
  const ok = [{text: i18n.t('common.ok')}];
  try {
    await handOffFile(tempPath, filename);
  } catch (e) {
    if (Platform.OS === 'android') Alert.alert(i18n.t('share.exportFailed'), errorMessage(e), ok);
    else Alert.alert(i18n.t('share.exportReady'), i18n.t('share.exportReadyMsg', {filename}), ok);
    return;
  }
  if (Platform.OS === 'android') Alert.alert(i18n.t('share.savedToDownloads'), i18n.t('share.savedToDownloadsMsg', {filename}), ok);
};

export const handOffTextFile = async (content: string, filename: string): Promise<void> => {
  const tempPath = tempFilePath(filename);
  await ReactNativeBlobUtil.fs.writeFile(tempPath, content, 'utf8');
  await handOffFile(tempPath, filename);
};

export const saveToDownloads = async (content: string, filename: string): Promise<void> => {
  const tempPath = tempFilePath(filename);
  await ReactNativeBlobUtil.fs.writeFile(tempPath, content ?? '', 'utf8');
  await deliverFile(tempPath, filename);
};

export const saveStreamedToDownloads = async (
  filename: string,
  write: (append: (s: string) => Promise<unknown>) => Promise<void>,
): Promise<void> => {
  const tempPath = tempFilePath(filename);
  try { await ReactNativeBlobUtil.fs.unlink(tempPath); } catch {}
  let started = false;
  await write(async (s: string) => {
    if (!s) return;
    let i = 0;
    while (i < s.length) {
      let end = Math.min(i + STREAM_CHUNK_CHARS, s.length);
      if (end < s.length) {
        const c = s.charCodeAt(end - 1);
        if (c >= 0xd800 && c <= 0xdbff) end -= 1;
      }
      const piece = s.slice(i, end);
      if (started) await ReactNativeBlobUtil.fs.appendFile(tempPath, piece, 'utf8');
      else { await ReactNativeBlobUtil.fs.writeFile(tempPath, piece, 'utf8'); started = true; }
      i = end;
    }
  });
  if (!started) await ReactNativeBlobUtil.fs.writeFile(tempPath, '', 'utf8');
  await deliverFile(tempPath, filename);
};
