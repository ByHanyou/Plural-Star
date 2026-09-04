import {Alert} from 'react-native';
import type {TFunction} from 'i18next';
import {Member, MemberGroup, SystemInfo, HistoryEntry, JournalEntry, ChatChannel, ChatMessage, NoteboardEntry, uid} from '../utils';
import {store, KEYS, chatMsgKey} from '../storage';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import {readZipBundle, base64FromU8, zipTextOf} from '../export/exportUtils';
import {saveAvatar} from '../utils/mediaUtils';
import {parallelMap} from '../utils/concurrency';
import {mergeForeignMember, finalizeMemberReplace, normHex, ImportMode} from './convert';
import {applyImportedHistory} from './restore';

export type PluralLogCtx = {
  extPreview: any;
  extSel: Record<string, boolean>;
  importMode: ImportMode;
  system: SystemInfo;
  history: HistoryEntry[];
  t: TFunction;
  setRestoreError: any;
  setExtPreview: any;
  setImportStatus: any;
  setImportMsg: any;
  setImportSource: any;
  setRestoreProgress: any;
  onDataImported: () => void;
};

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

const isPluralLogDb = (o: any): boolean =>
  !!o && typeof o === 'object' && Array.isArray(o.members) && Array.isArray(o.switchEvents) && o.config && typeof o.config === 'object';

export const handlePluralLogPick = async (ctx: PluralLogCtx) => {
  const {t, setRestoreError, setExtPreview, setImportStatus, setImportMsg, setImportSource} = ctx;
  setRestoreError(''); setExtPreview(null); setImportStatus('idle'); setImportMsg('');
  try {
    const [res] = await safePick({type: ['application/zip', '*/*']});
    if (!res) return;
    const path = getPickedFilePath(res);
    let bundle: {files: Record<string, Uint8Array>; data: any | null; manifest: any | null} | null = null;
    bundle = await readZipBundle(path, (res as any).uri);
    const files = bundle?.files || {};
    const dbName = (bundle?.manifest && typeof bundle.manifest.exportJson === 'string' && files[bundle.manifest.exportJson])
      ? bundle.manifest.exportJson
      : Object.keys(files).find(n => /(^|\/)plurallog_export.*\.json$/i.test(n));
    let db: any = null;
    if (dbName && files[dbName]) {
      try { db = JSON.parse(zipTextOf(files[dbName])); } catch {}
    }
    if (!isPluralLogDb(db)) {
      throw new Error(t('share.plurallogNeedsZip', {defaultValue: "That isn't a PluralLog export. In PluralLog, use Export and pick the .zip bundle it saves."}));
    }
    setExtPreview({source: 'plurallog', db, files});
    setImportSource('plurallog');
  } catch (e: any) { if (!isPickerCancel(e)) Alert.alert(t('share.importFailed'), e.message || ''); }
};

export const handlePluralLogConfirm = (ctx: PluralLogCtx) => {
  const {extPreview, extSel, importMode, system, t, setExtPreview, setImportStatus, setImportMsg, setRestoreProgress, onDataImported} = ctx;
  if (!extPreview || extPreview.source !== 'plurallog') return;
  Alert.alert(t('share.importData'), t(importMode === 'update' ? 'share.importUpdateDataMsg' : 'share.importAddDataMsg'), [
    {text: t('common.cancel'), style: 'cancel'},
    {text: t('share.importBtn'), onPress: async () => {
      try {
        const db = extPreview.db;
        const files: Record<string, Uint8Array> = extPreview.files || {};
        const plMembers: any[] = Array.isArray(db.members) ? db.members : [];
        const idMap: Record<string, string> = {};

        if (extSel.system && db.config?.systemName) {
          await store.set(KEYS.system, {...system, name: String(db.config.systemName) || system.name});
        }

        if (extSel.members) {
          const existing = await store.get<Member[]>(KEYS.members, []) || [];
          const merged: Member[] = [...existing];
          plMembers.forEach((m: any) => {
            if (!m || !m.id) return;
            mergeForeignMember(merged, idMap, 'pl:' + String(m.id), {
              name: (m.name && String(m.name).trim()) || 'Unnamed member',
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
            const withAvatar = plMembers.filter((m: any) => idMap[String(m.id)] && m.profileImagePath && files[`stored_media/${baseName(m.profileImagePath)}`]);
            if (withAvatar.length > 0) {
              setRestoreProgress(t('share.progressAvatars'));
              const saved: Record<string, string> = {};
              await parallelMap(withAvatar, async (m: any) => {
                const localId = idMap[String(m.id)];
                const bytes = files[`stored_media/${baseName(m.profileImagePath)}`];
                const uri = await saveAvatar(localId, base64FromU8(bytes)).catch(() => null);
                if (uri) saved[localId] = uri;
              }, 4, (done: number, total: number) => setRestoreProgress(t('share.progressAvatarsN', {done, total})));
              if (Object.keys(saved).length > 0) {
                const cur = await store.get<Member[]>(KEYS.members, []) || [];
                await store.set(KEYS.members, cur.map(m => saved[m.id] ? {...m, avatar: saved[m.id]} : m));
              }
              setRestoreProgress('');
            }
          }

          if (extSel.groups && Array.isArray(db.folders) && db.folders.length > 0) {
            const existingGroups = await store.get<MemberGroup[]>(KEYS.groups, []) || [];
            const groups = [...existingGroups];
            const folderIdMap: Record<string, string> = {};
            db.folders.forEach((f: any, i: number) => {
              const name = (f?.name && String(f.name).trim()) || `Group ${i + 1}`;
              const found = groups.find(g => g.name.toLowerCase() === name.toLowerCase());
              const localId = found ? found.id : uid();
              if (!found) groups.push({id: localId, name, color: argbToHex(f.colorValue), sortOrder: f.sortOrder ?? i});
              folderIdMap[String(f.id)] = localId;
            });
            db.folders.forEach((f: any) => {
              const localId = folderIdMap[String(f.id)];
              const parent = f.parentFolderId ? folderIdMap[String(f.parentFolderId)] : null;
              if (!localId || !parent) return;
              const idx = groups.findIndex(g => g.id === localId);
              if (idx >= 0) groups[idx] = {...groups[idx], parentId: parent};
            });
            await store.set(KEYS.groups, groups);
            const membership: Record<string, string[]> = {};
            db.folders.forEach((f: any) => {
              const gid = folderIdMap[String(f.id)];
              if (!gid) return;
              csv(f.memberIds).forEach(mid => {
                const local = idMap[mid];
                if (!local) return;
                (membership[local] ||= []).push(gid);
              });
            });
            const cur = await store.get<Member[]>(KEYS.members, []) || [];
            await store.set(KEYS.members, cur.map(m => {
              const add = (membership[m.id] || []).filter(g => !(m.groupIds || []).includes(g));
              return add.length ? {...m, groupIds: [...(m.groupIds || []), ...add]} : m;
            }));
          }
        }

        if (extSel.frontHistory && Array.isArray(db.switchEvents) && db.switchEvents.length > 0) {
          const entries: HistoryEntry[] = [];
          [...db.switchEvents]
            .sort((a: any, b: any) => (a.startTime || 0) - (b.startTime || 0))
            .forEach((s: any) => {
              const primary = idMap[String(s.memberId)];
              if (!primary || !s.startTime) return;
              const co = csv(s.cofronterIds).map(x => idMap[x]).filter(Boolean) as string[];
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

        if (extSel.journal && Array.isArray(db.journal) && db.journal.length > 0) {
          const existing = await store.get<JournalEntry[]>(KEYS.journal, []) || [];
          const sig = (e: JournalEntry) => `${e.timestamp}|${e.body}`;
          const seen = new Set(existing.map(sig));
          const added: JournalEntry[] = [];
          db.journal.forEach((j: any) => {
            const body = String(j?.text || '').trim();
            if (!body || !j.timestamp) return;
            const author = idMap[String(j.authorId)];
            const firstLine = body.split('\n')[0].slice(0, 60);
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

        if (extSel.chat && Array.isArray(db.channels) && Array.isArray(db.messages) && db.messages.length > 0) {
          const existing = await store.get<ChatChannel[]>(KEYS.chatChannels, []) || [];
          const channels = [...existing];
          const chMap: Record<string, string> = {};
          db.channels.forEach((c: any, i: number) => {
            const name = (c?.name && String(c.name).trim()) || `Channel ${i + 1}`;
            const found = channels.find(x => x.name.toLowerCase() === name.toLowerCase());
            const localId = found ? found.id : uid();
            if (!found) channels.push({id: localId, name, createdAt: Date.now()});
            chMap[String(c.id)] = localId;
          });
          await store.set(KEYS.chatChannels, channels);
          const byChannel: Record<string, ChatMessage[]> = {};
          db.messages.forEach((m: any) => {
            const channelId = chMap[String(m.channelId)];
            const authorId = idMap[String(m.authorId)];
            const content = String(m?.text || '');
            if (!channelId || !authorId || !content || !m.timestamp) return;
            (byChannel[channelId] ||= []).push({
              id: uid(), channelId, authorId, type: 'text', content, timestamp: Number(m.timestamp),
            });
          });
          for (const [channelId, msgs] of Object.entries(byChannel)) {
            const cur = await store.get<ChatMessage[]>(chatMsgKey(channelId), []) || [];
            const seen = new Set(cur.map(m => `${m.timestamp}|${m.authorId}|${m.content}`));
            const fresh = msgs.filter(m => !seen.has(`${m.timestamp}|${m.authorId}|${m.content}`));
            if (fresh.length) await store.set(chatMsgKey(channelId), [...cur, ...fresh].sort((a, b) => a.timestamp - b.timestamp));
          }
        }

        if (extSel.mailbox && Array.isArray(db.frontMessages) && db.frontMessages.length > 0) {
          const existing = await store.get<NoteboardEntry[]>(KEYS.noteboards, []) || [];
          const seen = new Set(existing.map(n => `${n.timestamp}|${n.authorId}|${n.content}`));
          const added: NoteboardEntry[] = [];
          db.frontMessages.forEach((fm: any) => {
            const memberId = idMap[String(fm.toMemberId)];
            const authorId = idMap[String(fm.fromMemberId)];
            const content = String(fm?.text || '');
            if (!memberId || !authorId || !content || !fm.createdAt) return;
            const entry: NoteboardEntry = {id: uid(), memberId, authorId, content, timestamp: Number(fm.createdAt), read: !!fm.read};
            const k = `${entry.timestamp}|${entry.authorId}|${entry.content}`;
            if (!seen.has(k)) { seen.add(k); added.push(entry); }
          });
          if (added.length) await store.set(KEYS.noteboards, [...existing, ...added]);
        }

        setImportStatus('success');
        setImportMsg(t('share.membersCount', {count: plMembers.length}));
        setExtPreview(null);
        setTimeout(() => onDataImported(), 500);
      } catch (e: any) {
        setRestoreProgress('');
        setImportStatus('error');
        setImportMsg(e.message || t('share.importFailed'));
      }
    }},
  ]);
};
