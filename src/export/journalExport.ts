import i18n from '../i18n/i18n';
import {JournalEntry, Member, fmtTime, fileSlug} from '../utils';
import {datedName, saveToDownloads} from './files';

const authorNames = (e: JournalEntry, members: Member[]): string[] =>
  (e.authorIds || []).map(id => members.find(m => m.id === id)?.name).filter((n): n is string => !!n);

const buildJournalTxt = (journal: JournalEntry[], members: Member[]): string =>
  journal.map(e => {
    const authors = authorNames(e, members);
    const header = [
      i18n.t('share.exportTitleLine', {title: e.title || i18n.t('common.untitled')}),
      i18n.t('share.exportDateLine', {date: fmtTime(e.timestamp)}),
      authors.length ? i18n.t('share.exportAuthorsLine', {authors: authors.join(', ')}) : null,
    ].filter(Boolean).join('\n');
    return `${header}\n${'─'.repeat(40)}\n${e.body || ''}\n`;
  }).join('\n\n' + '═'.repeat(40) + '\n\n');

const buildJournalMd = (journal: JournalEntry[], members: Member[]): string =>
  journal.map(e => {
    const authors = authorNames(e, members);
    const meta = [
      `*${fmtTime(e.timestamp)}*`,
      authors.length ? `*${i18n.t('share.exportAuthorsLine', {authors: authors.join(', ')})}*` : null,
    ].filter(Boolean).join(' · ');
    return `# ${e.title || i18n.t('common.untitled')}\n\n${meta}\n\n${e.body || ''}`;
  }).join('\n\n---\n\n');

export type JournalExportFormat = 'txt' | 'md' | 'json';

const journalText = (entries: JournalEntry[], members: Member[], fmt: JournalExportFormat, json: unknown): string =>
  fmt === 'txt' ? buildJournalTxt(entries, members) : fmt === 'md' ? buildJournalMd(entries, members) : JSON.stringify(json, null, 2);

export const exportJournal = (journal: JournalEntry[], members: Member[], systemName: string, fmt: JournalExportFormat): Promise<void> =>
  saveToDownloads(journalText(journal, members, fmt, {journal, exportedAt: new Date().toISOString()}), datedName(`${fileSlug(systemName)}-journal`, fmt));

export const exportEntry = (entry: JournalEntry, members: Member[], fmt: JournalExportFormat): Promise<void> =>
  saveToDownloads(journalText([entry], members, fmt, entry), datedName(fileSlug(entry.title || '', 'entry'), fmt));
