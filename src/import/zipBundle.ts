import {strFromU8, unzipSync} from 'fflate';
import i18n from '../i18n/i18n';
import {ExportPayload, Member, asRecord} from '../utils';
import {readFileBytes} from '../utils/fileBytes';
import {encodeBase64} from '../network/bytes';
import {ImportUserError} from './importError';
import type {ZipManifest} from './formats';

interface BundleMemberMedia {
  avatar_media_path?: string;
  banner_media_path?: string;
}

export type BundleMember = Omit<Member, 'avatar' | 'banner'> & BundleMemberMedia;

export interface ImportedZipBundle {
  files: Record<string, Uint8Array>;
  data: ExportPayload;
}

const normalizeZipEntryPath = (value: string): string => value.replace(/\\/g, '/').replace(/^\.?\//, '');

export const zipEntry = (files: Record<string, Uint8Array>, name: string): Uint8Array | undefined =>
  Object.hasOwn(files, name) ? files[name] : undefined;

const findZipEntry = (
  files: Record<string, Uint8Array>,
  targetPath: string,
): Uint8Array | undefined => {
  const normalizedTarget = normalizeZipEntryPath(targetPath);
  if (!normalizedTarget) return undefined;
  const direct = zipEntry(files, normalizedTarget);
  if (direct) return direct;
  return Object.entries(files).find(([name]) => normalizeZipEntryPath(name).endsWith(`/${normalizedTarget}`) || normalizeZipEntryPath(name) === normalizedTarget)?.[1];
};

export const zipTextOf = (bytes: Uint8Array): string => strFromU8(bytes);

const parseZipJson = (
  files: Record<string, Uint8Array>,
  targetPath: string,
): unknown => {
  const entry = findZipEntry(files, targetPath);
  if (!entry) return null;
  return JSON.parse(strFromU8(entry));
};

export const isPluralStarBundleData = (data: unknown, manifest?: ZipManifest | null): data is ExportPayload => {
  const rec = asRecord(data);
  if (!rec) return false;
  const metaApp = asRecord(rec._meta)?.app;
  const manifestApp = manifest?.app;
  return metaApp === 'Plural Star'
    || metaApp === 'Plural Space'
    || manifestApp === 'Plural Star'
    || manifestApp === 'Plural Space';
};

const parseZipManifest = (files: Record<string, Uint8Array>): ZipManifest | null => {
  const raw = asRecord(parseZipJson(files, 'manifest.json'));
  if (!raw) return null;
  const manifest: ZipManifest = {};
  if (typeof raw.app === 'string') manifest.app = raw.app;
  if (typeof raw.format_version === 'string') manifest.format_version = raw.format_version;
  if (typeof raw.system_name === 'string') manifest.system_name = raw.system_name;
  if (typeof raw.export_date === 'string') manifest.export_date = raw.export_date;
  if (typeof raw.exportJson === 'string') manifest.exportJson = raw.exportJson;
  return manifest;
};

export const readZipBundle = async (
  ...zipPaths: (string | undefined)[]
): Promise<{files: Record<string, Uint8Array>; data: unknown; manifest: ZipManifest | null}> => {
  const bytes = await readFileBytes(...zipPaths);
  const files = unzipSync(bytes);
  const manifest = parseZipManifest(files);
  const data = parseZipJson(files, 'data.json');
  return {files, data, manifest};
};

const collectBundledMemberMedia = (
  files: Record<string, Uint8Array>,
  members: BundleMember[],
  field: 'avatar_media_path' | 'banner_media_path',
): Record<string, string> => {
  const out: Record<string, string> = {};
  members.forEach(member => {
    const memberId = String(member?.id || '');
    const mediaPath = String(member?.[field] || '');
    if (!memberId || !mediaPath) return;
    const bytes = findZipEntry(files, mediaPath);
    if (!bytes) return;
    out[memberId] = encodeBase64(bytes);
  });
  return out;
};

export const importZipBundle = async (zipPath: string): Promise<ImportedZipBundle> => {
  const {files, data, manifest} = await readZipBundle(zipPath);
  if (!isPluralStarBundleData(data, manifest)) {
    throw new ImportUserError(i18n.t('share.bundleNotRecognized'));
  }
  const rawMembers: BundleMember[] = Array.isArray(data.members) ? data.members : [];
  const members: Member[] = rawMembers.map(({avatar_media_path: _avatar, banner_media_path: _banner, ...rest}) => rest);
  const avatars = collectBundledMemberMedia(files, rawMembers, 'avatar_media_path');
  const banners = collectBundledMemberMedia(files, rawMembers, 'banner_media_path');
  return {
    files,
    data: {
      ...data,
      members,
      avatars,
      banners,
    },
  };
};
