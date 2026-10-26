import {Linking} from 'react-native';
import i18n from '../i18n/i18n';
import {SystemInfo, Member, HistoryEntry, JournalEntry, fmtTime, fmtDur, getLocale, truncateRunes, fileSlug, fmtNum, isRosterMember, memberNames} from '../utils';
import {ALL_EXPORT_CATEGORIES, ExportCategories} from './categories';
import {buildExportBase} from './payload';
import {datedName, saveStreamedToDownloads, saveToDownloads} from './files';
import {streamImageMap} from './images';
import {buildPluralKitExport} from './pluralKitExport';

const buildEmailBody = (
  system: SystemInfo,
  members: Member[],
  history: HistoryEntry[],
  journal: JournalEntry[],
): string => {
  const realMembers = members.filter(isRosterMember);
  const mList = realMembers
    .map(m => `• ${m.name}${m.pronouns ? ` (${m.pronouns})` : ''}${m.role ? ` - ${m.role}` : ''}`)
    .join('\n');

  const jList = journal
    .slice(0, 10)
    .map(e => `[${fmtTime(e.timestamp)}] ${e.title || i18n.t('common.untitled')}\n${truncateRunes(e.body || '', 300, '…')}`)
    .join('\n\n---\n\n');

  const hList = history
    .slice(0, 20)
    .map(e => {
      const names = memberNames(e.memberIds || [], members) || i18n.t('common.unknown');
      return `${fmtTime(e.startTime)} → ${e.endTime ? fmtTime(e.endTime) : i18n.t('share.exportDocOngoing')} (${fmtDur(e.startTime, e.endTime)}) - ${names}${e.note ? ` | ${i18n.t('share.quoted', {text: e.note})}` : ''}`;
    })
    .join('\n');

  const journalHeader = journal.length > 10
    ? i18n.t('share.exportMailJournalHeaderRecent', {count: fmtNum(journal.length, 0), shown: fmtNum(10, 0)})
    : i18n.t('share.exportMailJournalHeader', {count: fmtNum(journal.length, 0)});
  const historyHeader = history.length > 20
    ? i18n.t('share.exportMailHistoryHeaderRecent', {count: fmtNum(history.length, 0), shown: fmtNum(20, 0)})
    : i18n.t('share.exportMailHistoryHeader', {count: fmtNum(history.length, 0)});
  return `${i18n.t('share.exportMailTitle')} - ${system.name}\n${i18n.t('share.exportMailExportedLine', {date: new Date().toLocaleString(getLocale())})}\n${system.description ? `\n${system.description}\n` : ''}\n\n━━ ${i18n.t('share.exportMailMembersHeader', {count: fmtNum(realMembers.length, 0)})} ━━\n${mList || i18n.t('share.exportMailNone')}\n\n━━ ${journalHeader} ━━\n${jList || i18n.t('share.exportMailNoEntries')}\n\n━━ ${historyHeader} ━━\n${hList || i18n.t('share.exportMailNoHistory')}\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n${i18n.t('share.exportMailFooter')}`;
};

export const exportJSON = async (
  system: SystemInfo,
  members: Member[],
  history: HistoryEntry[],
  journal: JournalEntry[],
  categories?: ExportCategories,
): Promise<void> => {
  const cat = { ...ALL_EXPORT_CATEGORIES, ...(categories || {}) };
  const base = await buildExportBase(system, members, history, journal, cat);
  const baseStr = JSON.stringify(base);
  await saveStreamedToDownloads(datedName(`${fileSlug(system.name)}-export`, 'json'), async (append) => {
    await append(baseStr.slice(0, -1));
    await append(',"avatars":');
    if (cat.avatars) await streamImageMap(append, members.filter(m => !!m.avatar), m => m.avatar ?? '', 'image/jpeg');
    else await append('{}');
    await append(',"banners":');
    if (cat.banners) await streamImageMap(append, members.filter(m => !!m.banner), m => m.banner ?? '', 'image/png');
    else await append('{}');
    await append('}');
  });
};

export const exportPluralKit = async (
  system: SystemInfo,
  members: Member[],
  history: HistoryEntry[],
): Promise<void> => {
  const obj = buildPluralKitExport(system, members, history);
  await saveToDownloads(JSON.stringify(obj, null, 2), datedName(`${fileSlug(system.name)}-pluralkit`, 'json'));
};

export const exportEmail = (
  system: SystemInfo,
  members: Member[],
  history: HistoryEntry[],
  journal: JournalEntry[],
  recipient: string,
): Promise<void> => {
  const subject = encodeURIComponent(
    `${system.name} - ${i18n.t('share.exportDocTitle')} ·${new Date().toLocaleDateString(getLocale(), {month: 'long', day: 'numeric', year: 'numeric'})}`,
  );
  const body = encodeURIComponent(buildEmailBody(system, members, history, journal));
  return Linking.openURL(`mailto:${recipient}?subject=${subject}&body=${body}`);
};
