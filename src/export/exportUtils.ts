// src/export/exportUtils.ts
import {Alert, Linking, Platform} from 'react-native';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import i18n from '../i18n/i18n';
import {
  SystemInfo,
  Member,
  HistoryEntry,
  JournalEntry,
  ExportPayload,
  ChatChannel,
  ChatMessage,
  MemberGroup,
  AppSettings,
  FrontState,
  fmtTime,
  fmtDur,
} from '../utils';
import {store, KEYS, chatMsgKey} from '../storage';

// ── Payload builders ──────────────────────────────────────────────────────────

export interface ExportCategories {
  system?: boolean;
  members?: boolean;
  avatars?: boolean;
  banners?: boolean;
  frontHistory?: boolean;
  journal?: boolean;
  groups?: boolean;
  chat?: boolean;
  moods?: boolean;
  palettes?: boolean;
  settings?: boolean;
  customFields?: boolean;
  noteboards?: boolean;
  polls?: boolean;
}

const ALL_CATEGORIES: ExportCategories = {
  system: true, members: true, avatars: true, banners: true, frontHistory: true, journal: true,
  groups: true, chat: true, moods: true, palettes: true, settings: true,
  customFields: true, noteboards: true, polls: true,
};

export const buildExportPayload = async (
  system: SystemInfo,
  members: Member[],
  history: HistoryEntry[],
  journal: JournalEntry[],
  categories: ExportCategories = ALL_CATEGORIES,
): Promise<ExportPayload> => {
  const cat = { ...ALL_CATEGORIES, ...categories };
  // Load supplementary data from storage
  const [groups, channels, settings, front, palettes, customFieldDefs, noteboards, polls] = await Promise.all([
    store.get<MemberGroup[]>(KEYS.groups),
    store.get<ChatChannel[]>(KEYS.chatChannels),
    store.get<AppSettings>(KEYS.settings),
    store.get<FrontState>(KEYS.front),
    store.get<any[]>(KEYS.palettes),
    store.get<any[]>(KEYS.customFieldDefs),
    store.get<any[]>(KEYS.noteboards),
    store.get<any[]>(KEYS.polls),
  ]);

  // Gather chat messages per channel (only if chat category selected)
  const chatMessages: Record<string, ChatMessage[]> = {};
  if (cat.chat && channels && channels.length > 0) {
    for (const ch of channels) {
      const msgs = await store.get<ChatMessage[]>(chatMsgKey(ch.id));
      if (msgs && msgs.length > 0) chatMessages[ch.id] = msgs;
    }
  }

  // Extract avatars (only if avatars category selected)
  const avatars: Record<string, string> = {};
  if (cat.avatars) {
    for (const m of members) {
      if (!m.avatar) continue;
      if (m.avatar.startsWith('data:')) {
        avatars[m.id] = m.avatar;
      } else {
        try {
          const filePath = m.avatar.replace(/\?.*$/, '').replace(/^file:\/\//, '');
          const b64 = await RNFS.readFile(filePath, 'base64');
          let mime = 'image/jpeg';
          if (b64.startsWith('iVBOR')) mime = 'image/png';
          else if (b64.startsWith('R0lGO')) mime = 'image/gif';
          else if (b64.startsWith('UklGR')) mime = 'image/webp';
          avatars[m.id] = `data:${mime};base64,${b64}`;
        } catch {}
      }
    }
  }
  // Extract banners (only if banners category selected) — same pattern as avatars
  const banners: Record<string, string> = {};
  if (cat.banners) {
    for (const m of members) {
      if (!m.banner) continue;
      if (m.banner.startsWith('data:')) {
        banners[m.id] = m.banner;
      } else {
        try {
          const filePath = m.banner.replace(/\?.*$/, '').replace(/^file:\/\//, '');
          const b64 = await RNFS.readFile(filePath, 'base64');
          let mime = 'image/png';
          if (b64.startsWith('/9j/')) mime = 'image/jpeg';
          else if (b64.startsWith('R0lGO')) mime = 'image/gif';
          else if (b64.startsWith('UklGR')) mime = 'image/webp';
          banners[m.id] = `data:${mime};base64,${b64}`;
        } catch {}
      }
    }
  }
  // Strip avatar AND banner file paths from exported member records — they are device-local
  // file:// URIs that do not resolve on other devices. The image data travels in the
  // `avatars` and `banners` dicts (when selected), and restore rebuilds the file path.
  const membersForExport = members.map(({avatar: _a, banner: _b, ...rest}) => rest as Member);

  return {
    _meta: {
      version: '1.2',
      app: 'Plural Star',
      exportedAt: new Date().toISOString(),
    },
    system: cat.system ? system : undefined as any,
    members: cat.members ? membersForExport : [],
    frontHistory: cat.frontHistory ? history : [],
    journal: cat.journal ? journal : [],
    groups: cat.groups ? (groups || []) : [],
    chatChannels: cat.chat ? (channels || []) : [],
    chatMessages: cat.chat ? chatMessages : {},
    settings: cat.settings ? (settings || undefined) : undefined,
    front: cat.frontHistory ? (front || undefined) : undefined,
    palettes: cat.palettes ? (palettes || []) : [],
    avatars: cat.avatars ? avatars : {},
    banners: cat.banners ? banners : {},
    customMoods: cat.moods ? (settings?.customMoods || []) : [],
    customFieldDefs: cat.customFields ? (customFieldDefs || []) : [],
    noteboards: cat.noteboards ? (noteboards || []) : [],
    polls: cat.polls ? (polls || []) : [],
  };
};

export const buildHtmlExport = (
  system: SystemInfo,
  members: Member[],
  history: HistoryEntry[],
  journal: JournalEntry[],
): string => {
  const memberRows = members
    .map(
      m => `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #ddd;font-weight:600">${m.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #ddd">${m.pronouns || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #ddd">${m.role || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #ddd;font-size:13px;color:#555">${m.description || '—'}</td>
    </tr>`,
    )
    .join('');

  const journalHtml = journal
    .map(e => {
      const authors = (e.authorIds || [])
        .map(id => members.find(m => m.id === id)?.name)
        .filter(Boolean);
      return `<div style="margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid #eee">
        <h3 style="margin:0 0 4px;font-size:16px">${e.title || 'Untitled'}</h3>
        <div style="font-size:12px;color:#888;margin-bottom:10px">${fmtTime(e.timestamp)}${authors.length ? ` · By: ${authors.join(', ')}` : ''}</div>
        <div style="font-size:14px;line-height:1.7;white-space:pre-wrap">${e.body || ''}</div>
      </div>`;
    })
    .join('');

  const historyRows = history
    .slice(0, 100)
    .map(e => {
      const names =
        (e.memberIds || [])
          .map(id => members.find(m => m.id === id)?.name)
          .filter(Boolean)
          .join(', ') || 'Unknown';
      return `<tr>
        <td style="padding:7px 12px;border-bottom:1px solid #eee;font-size:13px">${names}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #eee;font-size:13px">${fmtTime(e.startTime)}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #eee;font-size:13px">${e.endTime ? fmtTime(e.endTime) : 'Ongoing'}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #eee;font-size:13px">${fmtDur(e.startTime, e.endTime)}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #eee;font-size:12px;color:#666">${e.note || ''}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>${system.name} — Plural Star Export</title>
  <style>
    body{font-family:Georgia,serif;max-width:860px;margin:40px auto;padding:0 24px;color:#222;line-height:1.6}
    h1{font-size:32px;margin-bottom:4px}
    h2{font-size:22px;margin:40px 0 16px;border-bottom:2px solid #c9a96e;padding-bottom:8px;color:#7a5c2e}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;padding:8px 12px;background:#f5f0e8;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:#7a5c2e}
    .meta{font-size:13px;color:#888;margin-bottom:32px}
  </style></head>
  <body>
  <h1>${system.name}</h1>
  ${system.description ? `<p style="font-size:16px;color:#555;margin-top:0">${system.description}</p>` : ''}
  <div class="meta">Exported ${new Date().toLocaleString('en-US', {dateStyle: 'long', timeStyle: 'short'})} via Plural Star · ${members.length} members · ${journal.length} journal entries · ${history.length} front history records</div>
  <h2>Members</h2>
  ${members.length ? `<table><thead><tr><th>Name</th><th>Pronouns</th><th>Role</th><th>Description</th></tr></thead><tbody>${memberRows}</tbody></table>` : '<p style="color:#888">No members recorded.</p>'}
  <h2>System Journal</h2>
  ${journal.length ? journalHtml : '<p style="color:#888">No journal entries.</p>'}
  <h2>Front History</h2>
  ${history.length ? `<table><thead><tr><th>Who</th><th>Started</th><th>Ended</th><th>Duration</th><th>Note</th></tr></thead><tbody>${historyRows}</tbody></table>${history.length > 100 ? `<p style="font-size:12px;color:#888;margin-top:8px">Showing 100 of ${history.length} records. Full history in JSON export.</p>` : ''}` : '<p style="color:#888">No front history recorded.</p>'}
  </body></html>`;
};

export const buildEmailBody = (
  system: SystemInfo,
  members: Member[],
  history: HistoryEntry[],
  journal: JournalEntry[],
): string => {
  const mList = members
    .map(m => `• ${m.name}${m.pronouns ? ` (${m.pronouns})` : ''}${m.role ? ` — ${m.role}` : ''}`)
    .join('\n');

  const jList = journal
    .slice(0, 10)
    .map(e => `[${fmtTime(e.timestamp)}] ${e.title || 'Untitled'}\n${e.body?.slice(0, 300) || ''}${(e.body?.length ?? 0) > 300 ? '…' : ''}`)
    .join('\n\n---\n\n');

  const hList = history
    .slice(0, 20)
    .map(e => {
      const names = (e.memberIds || []).map(id => members.find(m => m.id === id)?.name).filter(Boolean).join(', ') || 'Unknown';
      return `${fmtTime(e.startTime)} → ${e.endTime ? fmtTime(e.endTime) : 'ongoing'} (${fmtDur(e.startTime, e.endTime)}) — ${names}${e.note ? ` | "${e.note}"` : ''}`;
    })
    .join('\n');

  return `SYSTEM EXPORT — ${system.name}\nExported: ${new Date().toLocaleString()}\n${system.description ? `\n${system.description}\n` : ''}\n\n━━ MEMBERS (${members.length}) ━━\n${mList || 'None recorded.'}\n\n━━ JOURNAL (${journal.length} entries${journal.length > 10 ? ' — showing 10 most recent' : ''}) ━━\n${jList || 'No entries.'}\n\n━━ FRONT HISTORY (${history.length} records${history.length > 20 ? ' — showing 20 most recent' : ''}) ━━\n${hList || 'No history.'}\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nFull data available by exporting JSON from Plural Star.`;
};

// ── Download helpers ──────────────────────────────────────────────────────────

const dateSlug = () => new Date().toISOString().slice(0, 10);

const saveToDownloads = async (content: string, filename: string): Promise<void> => {
  const isAndroid = Platform.OS === 'android';
  const basePath = isAndroid
    ? RNFS.DownloadDirectoryPath
    : RNFS.TemporaryDirectoryPath || RNFS.DocumentDirectoryPath;
  const path = `${basePath}/${filename}`;
  await RNFS.writeFile(path, content, 'utf8');
  if (isAndroid) {
    Alert.alert(
      i18n.t('share.savedToDownloads'),
      i18n.t('share.savedToDownloadsMsg', {filename}),
      [{text: i18n.t('common.ok')}],
    );
    return;
  }

  try {
    await Share.open({
      url: `file://${path}`,
      type: 'text/plain',
      filename,
      failOnCancel: false,
      saveToFiles: true,
    });
  } catch (e) {
    Alert.alert(
      i18n.t('share.exportReady'),
      i18n.t('share.exportReadyMsg', {filename}),
      [{text: i18n.t('common.ok')}],
    );
  }
};

// ── Full system export ────────────────────────────────────────────────────────

export const exportJSON = async (
  system: SystemInfo,
  members: Member[],
  history: HistoryEntry[],
  journal: JournalEntry[],
  categories?: ExportCategories,
): Promise<void> => {
  const payload = await buildExportPayload(system, members, history, journal, categories);
  const slug = system.name.replace(/\s+/g, '-').toLowerCase();
  await saveToDownloads(
    JSON.stringify(payload, null, 2),
    `${slug}-export-${dateSlug()}.json`,
  );
};

export const exportHTML = async (
  system: SystemInfo,
  members: Member[],
  history: HistoryEntry[],
  journal: JournalEntry[],
): Promise<void> => {
  const slug = system.name.replace(/\s+/g, '-').toLowerCase();
  await saveToDownloads(
    buildHtmlExport(system, members, history, journal),
    `${slug}-export-${dateSlug()}.html`,
  );
};

export const exportEmail = (
  system: SystemInfo,
  members: Member[],
  history: HistoryEntry[],
  journal: JournalEntry[],
  recipient: string,
): void => {
  const subject = encodeURIComponent(
    `${system.name} — Plural Star Export · ${new Date().toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'})}`,
  );
  const body = encodeURIComponent(buildEmailBody(system, members, history, journal));
  Linking.openURL(`mailto:${recipient}?subject=${subject}&body=${body}`);
};

// ── Journal-only export ───────────────────────────────────────────────────────

const buildJournalTxt = (journal: JournalEntry[], members: Member[]): string => {
  return journal.map(e => {
    const authors = (e.authorIds || []).map(id => members.find(m => m.id === id)?.name).filter(Boolean);
    const header = [
      `Title: ${e.title || 'Untitled'}`,
      `Date: ${fmtTime(e.timestamp)}`,
      authors.length ? `Authors: ${authors.join(', ')}` : null,
    ].filter(Boolean).join('\n');
    return `${header}\n${'─'.repeat(40)}\n${e.body || ''}\n`;
  }).join('\n\n' + '═'.repeat(40) + '\n\n');
};

const buildJournalMd = (journal: JournalEntry[], members: Member[]): string => {
  return journal.map(e => {
    const authors = (e.authorIds || []).map(id => members.find(m => m.id === id)?.name).filter(Boolean);
    const meta = [
      `*${fmtTime(e.timestamp)}*`,
      authors.length ? `*Authors: ${authors.join(', ')}*` : null,
    ].filter(Boolean).join(' · ');
    return `# ${e.title || 'Untitled'}\n\n${meta}\n\n${e.body || ''}`;
  }).join('\n\n---\n\n');
};

export const exportAllJournalJSON = async (
  journal: JournalEntry[],
  systemName: string,
): Promise<void> => {
  const slug = systemName.replace(/\s+/g, '-').toLowerCase();
  await saveToDownloads(
    JSON.stringify({journal, exportedAt: new Date().toISOString()}, null, 2),
    `${slug}-journal-${dateSlug()}.json`,
  );
};

export const exportAllJournalTxt = async (
  journal: JournalEntry[],
  members: Member[],
  systemName: string,
): Promise<void> => {
  const slug = systemName.replace(/\s+/g, '-').toLowerCase();
  await saveToDownloads(
    buildJournalTxt(journal, members),
    `${slug}-journal-${dateSlug()}.txt`,
  );
};

export const exportAllJournalMd = async (
  journal: JournalEntry[],
  members: Member[],
  systemName: string,
): Promise<void> => {
  const slug = systemName.replace(/\s+/g, '-').toLowerCase();
  await saveToDownloads(
    buildJournalMd(journal, members),
    `${slug}-journal-${dateSlug()}.md`,
  );
};

// ── Per-entry export ──────────────────────────────────────────────────────────

export const exportEntryTxt = async (
  entry: JournalEntry,
  members: Member[],
): Promise<void> => {
  const slug = (entry.title || 'entry').replace(/\s+/g, '-').toLowerCase();
  await saveToDownloads(
    buildJournalTxt([entry], members),
    `${slug}-${dateSlug()}.txt`,
  );
};

export const exportEntryMd = async (
  entry: JournalEntry,
  members: Member[],
): Promise<void> => {
  const slug = (entry.title || 'entry').replace(/\s+/g, '-').toLowerCase();
  await saveToDownloads(
    buildJournalMd([entry], members),
    `${slug}-${dateSlug()}.md`,
  );
};

export const exportEntryJSON = async (
  entry: JournalEntry,
): Promise<void> => {
  const slug = (entry.title || 'entry').replace(/\s+/g, '-').toLowerCase();
  await saveToDownloads(
    JSON.stringify(entry, null, 2),
    `${slug}-${dateSlug()}.json`,
  );
};
