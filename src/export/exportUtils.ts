import {Alert, Linking, Platform} from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
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
import {parallelMap} from '../utils/concurrency';

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
  journalTemplates?: boolean;
}

const ALL_CATEGORIES: ExportCategories = {
  system: true, members: true, avatars: true, banners: true, frontHistory: true, journal: true,
  groups: true, chat: true, moods: true, palettes: true, settings: true,
  customFields: true, noteboards: true, polls: true, journalTemplates: true,
};

export const buildExportPayload = async (
  system: SystemInfo,
  members: Member[],
  history: HistoryEntry[],
  journal: JournalEntry[],
  categories: ExportCategories = ALL_CATEGORIES,
): Promise<ExportPayload> => {
  const cat = { ...ALL_CATEGORIES, ...categories };
  const [groups, channels, settings, front, palettes, customFieldDefs, noteboards, polls, journalTemplates] = await Promise.all([
    store.get<MemberGroup[]>(KEYS.groups),
    store.get<ChatChannel[]>(KEYS.chatChannels),
    store.get<AppSettings>(KEYS.settings),
    store.get<FrontState>(KEYS.front),
    store.get<any[]>(KEYS.palettes),
    store.get<any[]>(KEYS.customFieldDefs),
    store.get<any[]>(KEYS.noteboards),
    store.get<any[]>(KEYS.polls),
    store.get<any[]>(KEYS.journalTemplates),
  ]);

  const chatMessages: Record<string, ChatMessage[]> = {};
  if (cat.chat && channels && channels.length > 0) {
    const fetched = await parallelMap(
      channels,
      async (ch) => ({id: ch.id, msgs: await store.get<ChatMessage[]>(chatMsgKey(ch.id))}),
      6,
    );
    for (const entry of fetched) {
      if (entry && entry.msgs && entry.msgs.length > 0) chatMessages[entry.id] = entry.msgs;
    }
  }

  const readImageBase64 = async (uri: string, defaultMime: string): Promise<string | null> => {
    try {
      const filePath = uri.replace(/\?.*$/, '').replace(/^file:\/\//, '');
      const b64 = await ReactNativeBlobUtil.fs.readFile(filePath, 'base64');
      let mime = defaultMime;
      if (b64.startsWith('iVBOR')) mime = 'image/png';
      else if (b64.startsWith('R0lGO')) mime = 'image/gif';
      else if (b64.startsWith('UklGR')) mime = 'image/webp';
      else if (b64.startsWith('/9j/')) mime = 'image/jpeg';
      return `data:${mime};base64,${b64}`;
    } catch { return null; }
  };

  const avatars: Record<string, string> = {};
  if (cat.avatars) {
    const withAvatars = members.filter(m => !!m.avatar);
    const results = await parallelMap(withAvatars, async (m) => {
      if (m.avatar!.startsWith('data:')) return {id: m.id, data: m.avatar!};
      const data = await readImageBase64(m.avatar!, 'image/jpeg');
      return data ? {id: m.id, data} : null;
    }, 6);
    for (const r of results) if (r) avatars[r.id] = r.data;
  }
  const banners: Record<string, string> = {};
  if (cat.banners) {
    const withBanners = members.filter(m => !!m.banner);
    const results = await parallelMap(withBanners, async (m) => {
      if (m.banner!.startsWith('data:')) return {id: m.id, data: m.banner!};
      const data = await readImageBase64(m.banner!, 'image/png');
      return data ? {id: m.id, data} : null;
    }, 6);
    for (const r of results) if (r) banners[r.id] = r.data;
  }
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
    journalTemplates: cat.journalTemplates ? (journalTemplates || []) : [],
  };
};

export const buildHtmlExport = (
  system: SystemInfo,
  members: Member[],
  history: HistoryEntry[],
  journal: JournalEntry[],
): string => {
  const memberRows = members
    .filter(m => !m.isCustomFront)
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
    body{font-family:OpenDyslexic,serif;max-width:860px;margin:40px auto;padding:0 24px;color:#222;line-height:1.6}
    h1{font-size:32px;margin-bottom:4px}
    h2{font-size:22px;margin:40px 0 16px;border-bottom:2px solid #c9a96e;padding-bottom:8px;color:#7a5c2e}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;padding:8px 12px;background:#f5f0e8;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:#7a5c2e}
    .meta{font-size:13px;color:#888;margin-bottom:32px}
  </style></head>
  <body>
  <h1>${system.name}</h1>
  ${system.description ? `<p style="font-size:16px;color:#555;margin-top:0">${system.description}</p>` : ''}
  <div class="meta">Exported ${new Date().toLocaleString('en-US', {dateStyle: 'long', timeStyle: 'short'})} via Plural Star · ${members.filter(m => !m.isCustomFront).length} members · ${journal.length} journal entries · ${history.length} front history records</div>
  <h2>Members</h2>
  ${members.filter(m => !m.isCustomFront).length ? `<table><thead><tr><th>Name</th><th>Pronouns</th><th>Role</th><th>Description</th></tr></thead><tbody>${memberRows}</tbody></table>` : '<p style="color:#888">No members recorded.</p>'}
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


const dateSlug = () => new Date().toISOString().slice(0, 10);

const mimeFor = (filename: string): string => {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.html')) return 'text/html';
  if (lower.endsWith('.md')) return 'text/markdown';
  return 'text/plain';
};

const saveToDownloads = async (content: string, filename: string): Promise<void> => {
  const isAndroid = Platform.OS === 'android';

  if (isAndroid) {
    const tempPath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${filename}`;
    await ReactNativeBlobUtil.fs.writeFile(tempPath, content, 'utf8');
    try {
      await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
        {name: filename, parentFolder: '', mimeType: mimeFor(filename)},
        'Download',
        tempPath,
      );
      Alert.alert(
        i18n.t('share.savedToDownloads'),
        i18n.t('share.savedToDownloadsMsg', {filename}),
        [{text: i18n.t('common.ok')}],
      );
    } catch (e: any) {
      Alert.alert(
        i18n.t('share.exportReady', {defaultValue: 'Export failed'}),
        String(e?.message || e || 'Unknown error'),
        [{text: i18n.t('common.ok')}],
      );
    } finally {
      try { await ReactNativeBlobUtil.fs.unlink(tempPath); } catch {}
    }
    return;
  }

  const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${filename}`;
  await ReactNativeBlobUtil.fs.writeFile(path, content, 'utf8');
  try {
    await Share.open({
      url: `file://${path}`,
      type: mimeFor(filename),
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
