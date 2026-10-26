import i18n from '../i18n/i18n';
import {HistoryEntry, Member, SystemInfo, isRosterMember, truncateRunes} from '../utils';

const pkHexColor = (c?: string): string | null => {
  const h = String(c || '').replace(/^#/, '').trim().toLowerCase();
  return /^[0-9a-f]{6}$/.test(h) ? h : null;
};

const pkPublicUrl = (u?: string): string | null =>
  (u && /^https?:\/\//i.test(u) && u.length <= 256) ? u : null;

const pkShortId = (i: number): string => {
  let s = '';
  let n = i;
  for (let k = 0; k < 5; k++) { s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
};

const pkUuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

interface PluralKitExportMember {
  id: string;
  uuid: string;
  name: string;
  display_name: string | null;
  color: string | null;
  birthday: string | null;
  pronouns: string | null;
  avatar_url: string | null;
  webhook_avatar_url: string | null;
  banner: string | null;
  description: string | null;
  created: string;
  keep_proxy: boolean;
  tts: boolean;
  autoproxy_enabled: boolean;
  message_count: number;
  last_message_timestamp: string | null;
  proxy_tags: {prefix?: string | null; suffix?: string | null}[];
  privacy: null;
}

export interface PluralKitExportFile {
  version: number;
  name: string | null;
  description: string | null;
  tag: string | null;
  pronouns: string | null;
  color: string | null;
  avatar_url: string | null;
  banner: string | null;
  members: PluralKitExportMember[];
  switches: {timestamp: string; members: string[]}[];
}

export const buildPluralKitExport = (
  system: SystemInfo,
  members: Member[],
  history: HistoryEntry[],
): PluralKitExportFile => {
  const realMembers = members.filter(isRosterMember);
  const idMap = new Map(realMembers.map((m, i) => [m.id, pkShortId(i)]));

  const pkMembers = realMembers.map((m, i) => ({
    id: pkShortId(i),
    uuid: pkUuid(),
    name: truncateRunes(m.name || i18n.t('share.unnamedMember'), 100),
    display_name: null,
    color: pkHexColor(m.color),
    birthday: null,
    pronouns: m.pronouns ? truncateRunes(m.pronouns, 100) : null,
    avatar_url: pkPublicUrl(m.avatar) || m.pkAvatarUrl || null,
    webhook_avatar_url: null,
    banner: pkPublicUrl(m.banner) || m.pkBannerUrl || null,
    description: m.description ? truncateRunes(m.description, 1000) : null,
    created: new Date(m.createdAt || Date.now()).toISOString(),
    keep_proxy: m.pkKeepProxy ?? false,
    tts: false,
    autoproxy_enabled: false,
    message_count: 0,
    last_message_timestamp: null,
    proxy_tags: Array.isArray(m.pkProxyTags) ? m.pkProxyTags : [],
    privacy: null,
  }));

  const pkSwitches = (history || [])
    .map(h => ({
      t: new Date(h.startTime).getTime(),
      members: (h.memberIds || []).flatMap(id => idMap.get(id) || []),
    }))
    .filter(sw => sw.members.length > 0 && !isNaN(sw.t))
    .sort((a, b) => b.t - a.t)
    .map(sw => ({timestamp: new Date(sw.t).toISOString(), members: sw.members}));

  return {
    version: 1,
    name: system?.name ? truncateRunes(system.name, 100) : null,
    description: system?.description ? truncateRunes(system.description, 1000) : null,
    tag: null,
    pronouns: null,
    color: null,
    avatar_url: null,
    banner: null,
    members: pkMembers,
    switches: pkSwitches,
  };
};
