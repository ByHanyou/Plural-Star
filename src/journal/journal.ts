import {JournalEntry, tagKey} from '../utils';

export const journalAuthorIds = (journal: JournalEntry[]): Set<string> => {
  const ids = new Set<string>();
  for (const e of journal) for (const id of e.authorIds || []) ids.add(id);
  return ids;
};

export const filterJournal = (journal: JournalEntry[], activeTagKey: string | null, activeAuthor: string | null): JournalEntry[] =>
  journal.filter(e => {
    const tagMatch = !activeTagKey || (e.hashtags || []).some(tag => tagKey(tag) === activeTagKey);
    const authorMatch = !activeAuthor || (e.authorIds || []).includes(activeAuthor);
    return tagMatch && authorMatch;
  }).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

export const filterTags = (tags: string[], search: string): string[] => {
  const q = tagKey(search);
  return tags.filter(tag => !q || tagKey(tag).includes(q));
};
