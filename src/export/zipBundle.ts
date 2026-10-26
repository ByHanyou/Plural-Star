import ReactNativeBlobUtil from 'react-native-blob-util';
import {Zip, ZipPassThrough, strToU8} from 'fflate';
import {HistoryEntry, JournalEntry, Member, SystemInfo, fileSlug} from '../utils';
import {encodeBase64} from '../network/bytes';
import {dataUriImageExt, tempFilePath} from '../utils/mediaFiles';
import type {BundleMember} from '../import/zipBundle';
import {ALL_EXPORT_CATEGORIES, ExportCategories} from './categories';
import {buildExportBase} from './payload';
import {datedName, deliverFile} from './files';
import {extFromPath, loadImageBytes} from './images';

const zipToFile = async (
  tempPath: string,
  addFiles: (add: (name: string, bytes: Uint8Array) => Promise<void>) => Promise<void>,
): Promise<number> => {
  try { await ReactNativeBlobUtil.fs.unlink(tempPath); } catch {}
  let started = false;
  let written = 0;
  const put = async (b64: string) => {
    if (!b64) return;
    if (started) await ReactNativeBlobUtil.fs.appendFile(tempPath, b64, 'base64');
    else { await ReactNativeBlobUtil.fs.writeFile(tempPath, b64, 'base64'); started = true; }
  };
  const queue: Uint8Array[] = [];
  let zipErr: unknown = null;
  let markDone: () => void = () => {};
  const finished = new Promise<void>(resolve => { markDone = resolve; });
  const zip = new Zip((err: unknown, data: Uint8Array | undefined, final?: boolean) => {
    if (err) { zipErr = err; markDone(); return; }
    if (data && data.length) { queue.push(data); written += data.length; }
    if (final) markDone();
  });
  let carry = new Uint8Array(0);
  const drain = async () => {
    if (zipErr) throw zipErr;
    for (let chunk = queue.shift(); chunk; chunk = queue.shift()) {
      let buf: Uint8Array;
      if (carry.length) {
        buf = new Uint8Array(carry.length + chunk.length);
        buf.set(carry, 0);
        buf.set(chunk, carry.length);
      } else {
        buf = chunk;
      }
      const aligned = buf.length - (buf.length % 3);
      if (aligned > 0) await put(encodeBase64(buf.subarray(0, aligned)));
      carry = aligned < buf.length ? new Uint8Array(buf.subarray(aligned)) : new Uint8Array(0);
    }
  };
  const add = async (name: string, bytes: Uint8Array) => {
    const f = new ZipPassThrough(name);
    zip.add(f);
    f.push(bytes, true);
    await drain();
  };
  await addFiles(add);
  zip.end();
  await finished;
  await drain();
  if (carry.length) await put(encodeBase64(carry));
  if (!started) await ReactNativeBlobUtil.fs.writeFile(tempPath, '', 'base64');
  if (zipErr) throw zipErr;
  return written;
};

export const exportZipBundle = async (
  system: SystemInfo,
  members: Member[],
  history: HistoryEntry[],
  journal: JournalEntry[],
  categories?: ExportCategories,
): Promise<void> => {
  const cat = { ...ALL_EXPORT_CATEGORIES, ...(categories || {}) };
  const base = await buildExportBase(system, members, history, journal, cat);

  const media: {name: string; src: string}[] = [];
  const mediaPaths: Record<'avatar' | 'banner', Record<string, string>> = {avatar: {}, banner: {}};

  if (cat.members) {
    for (const m of members) {
      for (const kind of ['avatar', 'banner'] as const) {
        const src = m[kind];
        if (!src || !(kind === 'avatar' ? cat.avatars : cat.banners)) continue;
        const name = `media/${kind}-${m.id}.${src.startsWith('data:') ? dataUriImageExt(src, 'jpg') : extFromPath(src)}`;
        mediaPaths[kind][m.id] = name;
        media.push({name, src});
      }
    }
    base.members = members.map(({avatar: _a, banner: _b, ...rest}) => {
      const out: BundleMember = {...rest};
      if (mediaPaths.avatar[rest.id]) out.avatar_media_path = mediaPaths.avatar[rest.id];
      if (mediaPaths.banner[rest.id]) out.banner_media_path = mediaPaths.banner[rest.id];
      return out;
    });
  }

  const manifest = {
    app: 'Plural Star',
    format_version: '2.0',
    system_name: system?.name || '',
    export_date: new Date().toISOString(),
  };

  const filename = datedName(`${fileSlug(system.name)}-export`, 'zip');
  const tempPath = tempFilePath(filename);

  const written = await zipToFile(tempPath, async (add) => {
    await add('manifest.json', strToU8(JSON.stringify(manifest)));
    await add('data.json', strToU8(JSON.stringify(base)));
    for (const item of media) {
      const bytes = await loadImageBytes(item.src);
      if (bytes) await add(item.name, bytes);
    }
  });

  await deliverFile(tempPath, filename, written);
};
