import {Member, NoteboardEntry, countUp, uid} from '../utils';

export const ALL_RECIPIENTS = '*';

export interface InboxSummary {
  id: string;
  count: number;
  unread: number;
  latest: number;
}

export const inboxSummaries = (notes: NoteboardEntry[]): InboxSummary[] => {
  const byMember = new Map<string, InboxSummary>();
  for (const n of notes) {
    const cur = byMember.get(n.memberId) || {id: n.memberId, count: 0, unread: 0, latest: 0};
    cur.count += 1;
    if (n.read !== true) cur.unread += 1;
    cur.latest = Math.max(cur.latest, n.timestamp);
    byMember.set(n.memberId, cur);
  }
  return [...byMember.values()];
};

export const inboxMessages = (notes: NoteboardEntry[], memberId: string): NoteboardEntry[] =>
  notes.filter(n => n.memberId === memberId).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.timestamp - a.timestamp);

export const markInboxRead = (notes: NoteboardEntry[], memberId: string): NoteboardEntry[] | null => {
  let changed = false;
  const next = notes.map(n => {
    if (n.memberId !== memberId || n.read === true) return n;
    changed = true;
    return {...n, read: true};
  });
  return changed ? next : null;
};

export const mailRecipients = (recipientId: string, senderId: string, roster: Member[]): string[] =>
  recipientId === ALL_RECIPIENTS ? roster.map(m => m.id).filter(id => id !== senderId) : [recipientId];

export const composeMail = (recipientIds: string[], authorId: string, body: string, now = Date.now()): NoteboardEntry[] =>
  recipientIds.map(memberId => ({id: uid(), memberId, authorId, content: body, timestamp: now, read: authorId === memberId}));

export const toggleNotePinned = (notes: NoteboardEntry[], id: string): NoteboardEntry[] =>
  notes.map(n => (n.id === id ? {...n, pinned: !n.pinned} : n));

export const removeNote = (notes: NoteboardEntry[], id: string): NoteboardEntry[] => notes.filter(n => n.id !== id);

export const mailCountsFor = (notes: NoteboardEntry[], memberIds: string[]): Map<string, number> => {
  const wanted = new Set(memberIds);
  const counts = new Map<string, number>();
  for (const n of notes) {
    if (wanted.has(n.memberId)) countUp(counts, n.memberId);
  }
  return counts;
};
