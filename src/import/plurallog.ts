import {Alert} from 'react-native';
import {importNameKey} from './importNames';
import {ImportUserError, importErrorText} from './importError';
import {Member, MemberGroup, HistoryEntry, JournalEntry, ChatChannel, ChatMessage, NoteboardEntry, asRecord, pushTo, uid, truncateRunes} from '../utils';
import {store, KEYS, chatMsgKey} from '../storage';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import {readZipBundle, zipEntry, zipTextOf} from './zipBundle';
import {encodeBase64} from '../network/bytes';
import {saveAvatar} from '../utils/mediaUtils';
import {parallelMap} from '../utils/concurrency';
import {mergeForeignMember, finalizeMemberReplace, normHex, claimGroup, getStoredList, getStoredMembers, mergeMediaIntoMembers, chatSig, localIds} from './convert';
import {confirmImport} from './confirm';
import {applyImportedHistory} from './restoreCommon';
import {asArray} from './formats';
import type {PlExport, PlFolder, PlJournal, PlChannel, PlMessage, PlFrontMessage} from './formats';
import type {ExtImportCtx} from './preview';
import {log} from '../utils/log';

export type PluralLogCtx = ExtImportCtx & {setRestoreProgress: (label: string) => void};

const ARGB_MASK = 0xffffff;
const argbToHex = (n: unknown): string => {
  const num = typeof n === 'number' && Number.isFinite(n) ? n : NaN;
  if (Number.isNaN(num)) return normHex(undefined);
  return `#${(num & ARGB_MASK).toString(16).padStart(6, '0').toUpperCase()}`;
};

const csv = (s: unknown): string[] =>
  String(s || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);

const baseName = (p: unknown): string => String(p || '').split('/').pop() || '';

export const isPluralLogDb = (o: unknown): o is PlExport => {
  const r = asRecord(o);
  return !!r && Array.isArray(r.members) && Array.isArray(r.switchEvents) && !!r.config && typeof r.config === 'object';
};

export const handlePluralLogPick = async (ctx: PluralLogCtx) => {
  const {t, setRestoreError, setExtPreview, setImportStatus, setImportMsg, setImportSource} = ctx;
  setRestoreError(''); setExtPreview(null); setImportStatus('idle'); setImportMsg('');
  try {
    const [res] = await safePick({type: ['application/zip', '*/*']});
    if (!res) return;
    const path = getPickedFilePath(res);
    const bundle = await readZipBundle(path, res.uri);
    const files = bundle.files;
    const manifestJson = bundle.manifest?.exportJson;
    const dbName = (manifestJson && zipEntry(files, manifestJson))
      ? manifestJson
      : Object.keys(files).find(n => /(^|\/)plurallog_export.*\.json$/i.test(n));
    const dbBytes = dbName ? zipEntry(files, dbName) : undefined;
    let db: unknown = null;
    if (dbBytes) {
      try { db = JSON.parse(zipTextOf(dbBytes)); } catch (e) { log.debug('import', e); }
    }
    if (!isPluralLogDb(db)) {
      throw new ImportUserError(t('share.plurallogNeedsZip'));
    }
    setExtPreview({source: 'plurallog', db, files});
    setImportSource('plurallog');
  } catch (e) { if (!isPickerCancel(e)) Alert.alert(t('share.importFailed'), importErrorText(e, t)); }
};

export const handlePluralLogConfirm = (ctx: PluralLogCtx) => {
  const {extPreview, extSel, importMode, system, t, setExtPreview, setImportStatus, setImportMsg, setRestoreProgress, onDataImported} = ctx;
  if (!extPreview || extPreview.source !== 'plurallog') return;
  confirmImport(t, importMode, async () => {
    try {
      const db = extPreview.db;
      const files = extPreview.files;
      const plMembers = db.members;
      const idMap = new Map<string, string>();

      if (extSel.system && db.config?.systemName) {
        await store.set(KEYS.system, {...system, name: String(db.config.systemName) || system.name});
      }

      if (extSel.members) {
        const existing = await getStoredMembers();
        const merged: Member[] = [...existing];
        plMembers.forEach(m => {
          if (!m || !m.id) return;
          mergeForeignMember(merged, idMap, 'pl:' + String(m.id), {
            name: (m.name && String(m.name).trim()) || t('share.unnamedMember'),
            pronouns: String(m.pronouns || ''),
            role: String(m.role || ''),
            color: argbToHex(m.color),
            description: String(m.description || m.profileMarkdown || ''),
            archived: !!m.archived,
            ...(m.parentMemberId ? {isFacet: true} : {}),
          });
        });
        await store.set(KEYS.members, finalizeMemberReplace(merged, idMap, importMode));

        if (extSel.avatars) {
          const withAvatar = plMembers.flatMap(m => {
            const localId = idMap.get(String(m.id));
            const bytes = m.profileImagePath ? zipEntry(files, `stored_media/${baseName(m.profileImagePath)}`) : undefined;
            return localId && bytes ? [{localId, bytes}] : [];
          });
          if (withAvatar.length > 0) {
            setRestoreProgress(t('share.progressAvatars'));
            const saved = new Map<string, string>();
            await parallelMap(withAvatar, async ({localId, bytes}) => {
              const uri = await saveAvatar(localId, encodeBase64(bytes));
              if (uri) saved.set(localId, uri);
            }, 4, (done, total) => setRestoreProgress(t('share.progressAvatarsN', {done, total})));
            if (saved.size > 0) {
              const cur = await getStoredMembers();
              await store.set(KEYS.members, mergeMediaIntoMembers(cur, 'avatar', saved));
            }
            setRestoreProgress('');
          }
        }

        const folders = asArray<PlFolder>(db.folders);
        if (extSel.groups && folders.length > 0) {
          const existingGroups = await getStoredList<MemberGroup>(KEYS.groups);
          const groups = [...existingGroups];
          const folderIdMap = new Map<string, string>();
          folders.forEach((f, i) => {
            const name = (f?.name && String(f.name).trim()) || t('share.groupN', {n: i + 1});
            folderIdMap.set(String(f.id), claimGroup(groups, groups, name, {color: argbToHex(f.colorValue), sortOrder: f.sortOrder ?? i}));
          });
          folders.forEach(f => {
            const localId = folderIdMap.get(String(f.id));
            const parent = f.parentFolderId ? folderIdMap.get(String(f.parentFolderId)) : null;
            if (!localId || !parent) return;
            const idx = groups.findIndex(g => g.id === localId);
            if (idx >= 0) groups[idx] = {...groups[idx], parentId: parent};
          });
          await store.set(KEYS.groups, groups);
          const membership = new Map<string, string[]>();
          folders.forEach(f => {
            const gid = folderIdMap.get(String(f.id));
            if (!gid) return;
            csv(f.memberIds).forEach(mid => {
              const local = idMap.get(mid);
              if (!local) return;
              pushTo(membership, local, gid);
            });
          });
          const cur = await getStoredMembers();
          await store.set(KEYS.members, cur.map(m => {
            const add = (membership.get(m.id) || []).filter(g => !(m.groupIds || []).includes(g));
            return add.length ? {...m, groupIds: [...(m.groupIds || []), ...add]} : m;
          }));
        }
      }

      if (extSel.frontHistory && db.switchEvents.length > 0) {
        const entries: HistoryEntry[] = [];
        [...db.switchEvents]
          .sort((a, b) => (a.startTime || 0) - (b.startTime || 0))
          .forEach(s => {
            const primary = idMap.get(String(s.memberId));
            if (!primary || !s.startTime) return;
            const co = localIds(idMap, csv(s.cofronterIds));
            entries.push({
              memberIds: [primary],
              ...(co.length ? {coFrontIds: co} : {}),
              startTime: Number(s.startTime),
              endTime: s.endTime == null ? null : Number(s.endTime),
              note: String(s.notes || ''),
            });
          });
        await applyImportedHistory(entries, {history: ctx.history});
      }

      const journal = asArray<PlJournal>(db.journal);
      if (extSel.journal && journal.length > 0) {
        const existing = await getStoredList<JournalEntry>(KEYS.journal);
        const sig = (e: JournalEntry) => `${e.timestamp}|${e.body}`;
        const seen = new Set(existing.map(sig));
        const added: JournalEntry[] = [];
        journal.forEach(j => {
          const body = String(j?.text || '').trim();
          if (!body || !j.timestamp) return;
          const author = idMap.get(String(j.authorId));
          const firstLine = truncateRunes(body.split('\n')[0], 60);
          const tags = csv(j.tags).map(x => (x.startsWith('#') ? x : `#${x}`));
          if (j.emotion) tags.push(`#${String(j.emotion)}`);
          const entry: JournalEntry = {
            id: uid(),
            title: firstLine,
            body,
            authorIds: author ? [author] : [],
            hashtags: [...new Set(tags)],
            timestamp: Number(j.timestamp),
          };
          if (!seen.has(sig(entry))) { seen.add(sig(entry)); added.push(entry); }
        });
        if (added.length) await store.set(KEYS.journal, [...existing, ...added].sort((a, b) => b.timestamp - a.timestamp));
      }

      const plChannels = asArray<PlChannel>(db.channels);
      const plMessages = asArray<PlMessage>(db.messages);
      if (extSel.chat && Array.isArray(db.channels) && plMessages.length > 0) {
        const existing = await getStoredList<ChatChannel>(KEYS.chatChannels);
        const channels = [...existing];
        const chMap = new Map<string, string>();
        plChannels.forEach((c, i) => {
          const name = (c?.name && String(c.name).trim()) || t('share.channelN', {n: i + 1});
          const found = channels.find(x => importNameKey(x.name) === importNameKey(name));
          const localId = found ? found.id : uid();
          if (!found) channels.push({id: localId, name, createdAt: Date.now()});
          chMap.set(String(c.id), localId);
        });
        await store.set(KEYS.chatChannels, channels);
        const byChannel = new Map<string, ChatMessage[]>();
        plMessages.forEach(m => {
          const channelId = chMap.get(String(m.channelId));
          const authorId = idMap.get(String(m.authorId));
          const content = String(m?.text || '');
          if (!channelId || !authorId || !content || !m.timestamp) return;
          pushTo(byChannel, channelId, {id: uid(), channelId, authorId, type: 'text', content, timestamp: Number(m.timestamp)});
        });
        for (const [channelId, msgs] of byChannel) {
          const cur = await getStoredList<ChatMessage>(chatMsgKey(channelId));
          const seen = new Set(cur.map(chatSig));
          const fresh = msgs.filter(m => !seen.has(chatSig(m)));
          if (fresh.length) await store.set(chatMsgKey(channelId), [...cur, ...fresh].sort((a, b) => a.timestamp - b.timestamp));
        }
      }

      const frontMessages = asArray<PlFrontMessage>(db.frontMessages);
      if (extSel.mailbox && frontMessages.length > 0) {
        const existing = await getStoredList<NoteboardEntry>(KEYS.noteboards);
        const seen = new Set(existing.map(chatSig));
        const added: NoteboardEntry[] = [];
        frontMessages.forEach(fm => {
          const memberId = idMap.get(String(fm.toMemberId));
          const authorId = idMap.get(String(fm.fromMemberId));
          const content = String(fm?.text || '');
          if (!memberId || !authorId || !content || !fm.createdAt) return;
          const entry: NoteboardEntry = {id: uid(), memberId, authorId, content, timestamp: Number(fm.createdAt), read: !!fm.read};
          const k = chatSig(entry);
          if (!seen.has(k)) { seen.add(k); added.push(entry); }
        });
        if (added.length) await store.set(KEYS.noteboards, [...existing, ...added]);
      }

      setImportStatus('success');
      setImportMsg(t('share.membersCount', {count: plMembers.length}));
      setExtPreview(null);
      setTimeout(() => onDataImported(), 500);
    } catch (e) {
      setRestoreProgress('');
      setImportStatus('error');
      setImportMsg(importErrorText(e, t));
    }
  });
};
