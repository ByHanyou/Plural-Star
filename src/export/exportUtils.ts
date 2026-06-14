import {Alert, Linking, Platform} from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import Share from 'react-native-share';
import i18n from '../i18n/i18n';
import {
  SystemInfo,
  Member,
  HistoryEntry,
  JournalEntry,
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
import {Zip, ZipPassThrough, strToU8, strFromU8, unzipSync} from 'fflate';

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
  relationships?: boolean;
  medical?: boolean;
}

const ALL_CATEGORIES: ExportCategories = {
  system: true, members: true, avatars: true, banners: true, frontHistory: true, journal: true,
  groups: true, chat: true, moods: true, palettes: true, settings: true,
  customFields: true, noteboards: true, polls: true, journalTemplates: true, relationships: true,
  medical: true,
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const readImageBase64 = async (uri: string, defaultMime: string): Promise<string | null> => {
  try {
    const filePath = uri.replace(/\?.*$/, '').replace(/^file:\/\//, '');
    try {
      const stat = await ReactNativeBlobUtil.fs.stat(filePath);
      if (Number(stat.size) > MAX_IMAGE_BYTES) return null;
    } catch {}
    const b64 = await ReactNativeBlobUtil.fs.readFile(filePath, 'base64');
    let mime = defaultMime;
    if (b64.startsWith('iVBOR')) mime = 'image/png';
    else if (b64.startsWith('R0lGO')) mime = 'image/gif';
    else if (b64.startsWith('UklGR')) mime = 'image/webp';
    else if (b64.startsWith('/9j/')) mime = 'image/jpeg';
    return `data:${mime};base64,${b64}`;
  } catch { return null; }
};

const streamImageMap = async (
  append: (s: string) => Promise<any>,
  items: Member[],
  pick: (m: Member) => string,
  defaultMime: string,
): Promise<void> => {
  await append('{');
  let first = true;
  for (const m of items) {
    const src = pick(m);
    const data = src.startsWith('data:') ? src : await readImageBase64(src, defaultMime);
    if (!data) continue;
    await append((first ? '' : ',') + JSON.stringify(m.id) + ':' + JSON.stringify(data));
    first = false;
  }
  await append('}');
};

export const buildExportBase = async (
  system: SystemInfo,
  members: Member[],
  history: HistoryEntry[],
  journal: JournalEntry[],
  categories: ExportCategories = ALL_CATEGORIES,
): Promise<Record<string, any>> => {
  const cat = { ...ALL_CATEGORIES, ...categories };
  const [groups, channels, settings, front, palettes, customFieldDefs, noteboards, polls, journalTemplates, relationships, relationshipTypes, medical, systemMapMembers] = await Promise.all([
    store.get<MemberGroup[]>(KEYS.groups),
    store.get<ChatChannel[]>(KEYS.chatChannels),
    store.get<AppSettings>(KEYS.settings),
    store.get<FrontState>(KEYS.front),
    store.get<any[]>(KEYS.palettes),
    store.get<any[]>(KEYS.customFieldDefs),
    store.get<any[]>(KEYS.noteboards),
    store.get<any[]>(KEYS.polls),
    store.get<any[]>(KEYS.journalTemplates),
    store.get<any[]>(KEYS.relationships),
    store.get<any[]>(KEYS.relationshipTypes),
    store.get<any>(KEYS.medical),
    store.get<string[]>(KEYS.systemMapMembers),
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
    customMoods: cat.moods ? (settings?.customMoods || []) : [],
    customFieldDefs: cat.customFields ? (customFieldDefs || []) : [],
    noteboards: cat.noteboards ? (noteboards || []) : [],
    polls: cat.polls ? (polls || []) : [],
    journalTemplates: cat.journalTemplates ? (journalTemplates || []) : [],
    relationships: cat.relationships ? (relationships || []) : [],
    relationshipTypes: cat.relationships ? (relationshipTypes || []) : [],
    systemMapMembers: cat.relationships ? (systemMapMembers || []) : [],
    medical: cat.medical ? (medical || undefined) : undefined,
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
  if (lower.endsWith('.zip')) return 'application/zip';
  return 'text/plain';
};

const deliverFile = async (tempPath: string, filename: string): Promise<void> => {
  const isAndroid = Platform.OS === 'android';

  if (isAndroid) {
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

  try {
    await Share.open({
      url: `file://${tempPath}`,
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

const saveToDownloads = async (content: string, filename: string): Promise<void> => {
  const tempPath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${filename}`;
  await ReactNativeBlobUtil.fs.writeFile(tempPath, content ?? '', 'utf8');
  await deliverFile(tempPath, filename);
};

const saveStreamedToDownloads = async (
  filename: string,
  write: (append: (s: string) => Promise<any>) => Promise<void>,
): Promise<void> => {
  const tempPath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${filename}`;
  try { await ReactNativeBlobUtil.fs.unlink(tempPath); } catch {}
  const stream = await ReactNativeBlobUtil.fs.writeStream(tempPath, 'utf8', false);
  try {
    await write((s) => stream.write(s));
  } finally {
    await stream.close();
  }
  await deliverFile(tempPath, filename);
};


export const exportJSON = async (
  system: SystemInfo,
  members: Member[],
  history: HistoryEntry[],
  journal: JournalEntry[],
  categories?: ExportCategories,
): Promise<void> => {
  const cat = { ...ALL_CATEGORIES, ...(categories || {}) };
  const base = await buildExportBase(system, members, history, journal, cat);
  const baseStr = JSON.stringify(base);
  const slug = system.name.replace(/\s+/g, '-').toLowerCase();
  await saveStreamedToDownloads(`${slug}-export-${dateSlug()}.json`, async (append) => {
    await append(baseStr.slice(0, -1));
    await append(',"avatars":');
    if (cat.avatars) await streamImageMap(append, members.filter(m => !!m.avatar), m => m.avatar!, 'image/jpeg');
    else await append('{}');
    await append(',"banners":');
    if (cat.banners) await streamImageMap(append, members.filter(m => !!m.banner), m => m.banner!, 'image/png');
    else await append('{}');
    await append('}');
  });
};

const B64C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64INV = (() => {
  const a = new Int16Array(256);
  for (let i = 0; i < 256; i++) a[i] = -1;
  for (let i = 0; i < B64C.length; i++) a[B64C.charCodeAt(i)] = i;
  return a;
})();

const u8FromBase64 = (b64: string): Uint8Array => {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const full = Math.floor(clean.length / 4);
  const rem = clean.length - full * 4;
  const out = new Uint8Array(full * 3 + (rem >= 2 ? rem - 1 : 0));
  let o = 0;
  let i = 0;
  for (let f = 0; f < full; f++) {
    const n = (B64INV[clean.charCodeAt(i)] << 18) | (B64INV[clean.charCodeAt(i + 1)] << 12) | (B64INV[clean.charCodeAt(i + 2)] << 6) | B64INV[clean.charCodeAt(i + 3)];
    out[o++] = (n >> 16) & 255;
    out[o++] = (n >> 8) & 255;
    out[o++] = n & 255;
    i += 4;
  }
  if (rem >= 2) {
    const c0 = B64INV[clean.charCodeAt(i)];
    const c1 = B64INV[clean.charCodeAt(i + 1)];
    out[o++] = (c0 << 2) | (c1 >> 4);
    if (rem === 3) {
      const c2 = B64INV[clean.charCodeAt(i + 2)];
      out[o++] = ((c1 & 15) << 4) | (c2 >> 2);
    }
  }
  return out;
};

const b64Aligned = (bytes: Uint8Array, end: number): string => {
  let out = '';
  for (let i = 0; i < end; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64C[(n >> 18) & 63] + B64C[(n >> 12) & 63] + B64C[(n >> 6) & 63] + B64C[n & 63];
  }
  return out;
};

const b64Tail = (bytes: Uint8Array, start: number): string => {
  const rem = bytes.length - start;
  if (rem === 0) return '';
  const b0 = bytes[start];
  if (rem === 1) return B64C[b0 >> 2] + B64C[(b0 & 3) << 4] + '==';
  const b1 = bytes[start + 1];
  return B64C[b0 >> 2] + B64C[((b0 & 3) << 4) | (b1 >> 4)] + B64C[(b1 & 15) << 2] + '=';
};

const zipToFile = async (
  tempPath: string,
  addFiles: (add: (name: string, bytes: Uint8Array) => Promise<void>) => Promise<void>,
): Promise<void> => {
  try { await ReactNativeBlobUtil.fs.unlink(tempPath); } catch {}
  const stream = await ReactNativeBlobUtil.fs.writeStream(tempPath, 'base64', false);
  const queue: Uint8Array[] = [];
  let zipErr: any = null;
  const zip = new Zip((err, data) => {
    if (err) { zipErr = err; return; }
    if (data && data.length) queue.push(data);
  });
  let carry = new Uint8Array(0);
  const drain = async () => {
    if (zipErr) throw zipErr;
    while (queue.length) {
      const chunk = queue.shift()!;
      let buf: Uint8Array;
      if (carry.length) {
        buf = new Uint8Array(carry.length + chunk.length);
        buf.set(carry, 0);
        buf.set(chunk, carry.length);
      } else {
        buf = chunk;
      }
      const aligned = buf.length - (buf.length % 3);
      if (aligned > 0) await stream.write(b64Aligned(buf, aligned));
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
  await drain();
  if (carry.length) await stream.write(b64Tail(carry, 0));
  await stream.close();
};

const extFromDataUri = (uri: string): string => {
  const m = /^data:image\/([a-z0-9+]+)/i.exec(uri);
  const t = (m ? m[1] : 'jpeg').toLowerCase();
  if (t === 'jpeg') return 'jpg';
  if (t === 'svg+xml') return 'svg';
  return t;
};

const extFromPath = (p: string): string => {
  const m = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(p);
  return m ? m[1].toLowerCase() : 'jpg';
};

const loadImageBytes = async (src: string): Promise<Uint8Array | null> => {
  try {
    if (src.startsWith('data:')) {
      const comma = src.indexOf(',');
      return comma >= 0 ? u8FromBase64(src.slice(comma + 1)) : null;
    }
    const filePath = src.replace(/\?.*$/, '').replace(/^file:\/\//, '');
    try {
      const stat = await ReactNativeBlobUtil.fs.stat(filePath);
      if (Number(stat.size) > MAX_IMAGE_BYTES) return null;
    } catch {}
    const b64 = await ReactNativeBlobUtil.fs.readFile(filePath, 'base64');
    return u8FromBase64(b64);
  } catch { return null; }
};

export const exportBundle = async (
  system: SystemInfo,
  members: Member[],
  history: HistoryEntry[],
  journal: JournalEntry[],
  categories?: ExportCategories,
): Promise<void> => {
  const cat = { ...ALL_CATEGORIES, ...(categories || {}) };
  const base = await buildExportBase(system, members, history, journal, cat);

  const media: {name: string; src: string}[] = [];
  const avatarPathById: Record<string, string> = {};
  const bannerPathById: Record<string, string> = {};

  if (cat.members) {
    for (const m of members) {
      if (cat.avatars && m.avatar) {
        const ext = m.avatar.startsWith('data:') ? extFromDataUri(m.avatar) : extFromPath(m.avatar);
        const name = `media/avatar-${m.id}.${ext}`;
        avatarPathById[m.id] = name;
        media.push({name, src: m.avatar});
      }
      if (cat.banners && m.banner) {
        const ext = m.banner.startsWith('data:') ? extFromDataUri(m.banner) : extFromPath(m.banner);
        const name = `media/banner-${m.id}.${ext}`;
        bannerPathById[m.id] = name;
        media.push({name, src: m.banner});
      }
    }
    base.members = members.map(m => {
      const {avatar: _a, banner: _b, ...rest} = m as any;
      const out: any = {...rest};
      if (avatarPathById[m.id]) out.avatar_media_path = avatarPathById[m.id];
      if (bannerPathById[m.id]) out.banner_media_path = bannerPathById[m.id];
      return out;
    });
  }

  const manifest = {
    app: 'Plural Star',
    format_version: '2.0',
    system_name: system?.name || '',
    export_date: new Date().toISOString(),
  };

  const slug = system.name.replace(/\s+/g, '-').toLowerCase();
  const filename = `${slug}-export-${dateSlug()}.zip`;
  const tempPath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${filename}`;

  await zipToFile(tempPath, async (add) => {
    await add('manifest.json', strToU8(JSON.stringify(manifest)));
    await add('data.json', strToU8(JSON.stringify(base)));
    for (const item of media) {
      const bytes = await loadImageBytes(item.src);
      if (bytes) await add(item.name, bytes);
    }
  });

  await deliverFile(tempPath, filename);
};

const readFileBytes = (path: string): Promise<Uint8Array> => new Promise((resolve, reject) => {
  const clean = path.replace(/^file:\/\//, '');
  const chunks: Uint8Array[] = [];
  let total = 0;
  ReactNativeBlobUtil.fs.readStream(clean, 'base64', 99999)
    .then((stream: any) => {
      stream.open();
      stream.onData((chunk: string) => {
        const u = u8FromBase64(chunk);
        chunks.push(u);
        total += u.length;
      });
      stream.onError((err: any) => reject(err));
      stream.onEnd(() => {
        const out = new Uint8Array(total);
        let o = 0;
        for (const c of chunks) { out.set(c, o); o += c.length; }
        resolve(out);
      });
    })
    .catch(reject);
});

export const base64FromU8 = (bytes: Uint8Array): string => {
  const aligned = bytes.length - (bytes.length % 3);
  return b64Aligned(bytes, aligned) + b64Tail(bytes, aligned);
};

export const readZipBundle = async (
  zipPath: string,
): Promise<{files: Record<string, Uint8Array>; data: any | null}> => {
  const bytes = await readFileBytes(zipPath);
  const files = unzipSync(bytes);
  const dj = files['data.json'];
  const data = dj ? JSON.parse(strFromU8(dj)) : null;
  return {files, data};
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
