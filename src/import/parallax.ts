import {Alert} from 'react-native';
import type {TFunction} from 'i18next';
import {Member, SystemInfo, HistoryEntry, ChatChannel, ChatMessage, uid} from '../utils';
import {store, KEYS, chatMsgKey} from '../storage';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import {readFileText} from '../utils/fileBytes';
import {mergeForeignMember, finalizeMemberReplace, normHex, ImportMode} from './convert';
import {applyImportedHistory} from './restore';

export type ParallaxCtx = {
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

/**
 * Parallax export (single .json), reversed from a real 272-member export — the
 * Tupperbox rule: match the file the app actually writes, not a doc.
 *   top: exported_at, user_id, members[], fronting_log[], notes[], polls[]/
 *        poll_options[]/poll_votes[], messages[], timeline[], reminders[]
 *   members: uuid id, name, pronouns, role, description, color_theme #hex,
 *            is_active, sort_order, sp_id (the Simply Plural id — it doubles
 *            as Ourcana's member id, so it is the sourceId and a Parallax
 *            import lands on the same members an SP or Ourcana import already
 *            created), profile_picture (a storage KEY relative to their host,
 *            not a URL — nothing fetchable), avatar_emoji + likes/dislikes/
 *            triggers/age_presentation/pinned_quote/notes (all empty in the
 *            reference export, dropped until a real file shows their shape)
 *   fronting_log: ONE fronter per row — part_id (null = unknown fronter,
 *                 skipped like PluralLog's sentinel), started_at/ended_at ISO
 *   messages: their chats — chat_id groups them (the export names no chats,
 *             so channels are numbered by first-message date), from_part_id,
 *             body, created_at
 *   notes/polls/timeline/reminders: empty in the reference export, dropped.
 */
const isParallaxDb = (o: any): boolean =>
  !!o && typeof o === 'object' && typeof o.user_id === 'string' && Array.isArray(o.members) && Array.isArray(o.fronting_log);

const pxTime = (v: any): number => {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const ms = new Date(String(v)).getTime();
  return isNaN(ms) ? 0 : ms;
};

export const handleParallaxPick = async (ctx: ParallaxCtx) => {
  const {t, setRestoreError, setExtPreview, setImportStatus, setImportMsg, setImportSource} = ctx;
  setRestoreError(''); setExtPreview(null); setImportStatus('idle'); setImportMsg('');
  try {
    const [res] = await safePick({type: ['application/json', 'text/plain']});
    if (!res) return;
    const path = getPickedFilePath(res);
    const raw: string = await readFileText(path, (res as any).uri);
    let db: any = null;
    try { db = JSON.parse(raw); } catch {}
    if (!isParallaxDb(db)) {
      throw new Error(t('share.parallaxNeedsJson', {defaultValue: "That isn't a Parallax export. In Parallax, use Export Data and pick the .json file it saves."}));
    }
    setExtPreview({source: 'parallax', db});
    setImportSource('parallax');
  } catch (e: any) { if (!isPickerCancel(e)) Alert.alert(t('share.importFailed'), e.message || ''); }
};

export const handleParallaxConfirm = (ctx: ParallaxCtx) => {
  const {extPreview, extSel, importMode, t, setRestoreError, setExtPreview, setImportStatus, setImportMsg, setRestoreProgress, onDataImported} = ctx;
  if (!extPreview || extPreview.source !== 'parallax') return;
  Alert.alert(t('share.importData'), t(importMode === 'update' ? 'share.importUpdateDataMsg' : 'share.importAddDataMsg'), [
    {text: t('common.cancel'), style: 'cancel'},
    {text: t('share.importBtn'), onPress: async () => {
      try {
        const db = extPreview.db;
        const pxMembers: any[] = Array.isArray(db.members) ? db.members : [];
        const idMap: Record<string, string> = {};

        if (extSel.members) {
          const existing = await store.get<Member[]>(KEYS.members, []) || [];
          const merged: Member[] = [...existing];
          [...pxMembers]
            .sort((a: any, b: any) => (a?.sort_order ?? 0) - (b?.sort_order ?? 0))
            .forEach((m: any) => {
              if (!m || !m.id) return;
              const spId = String(m.sp_id || '');
              const srcKey = /^[0-9a-f]{24}$/i.test(spId) ? spId : 'px:' + String(m.id);
              mergeForeignMember(merged, idMap, srcKey, {
                name: (m.name && String(m.name).trim()) || 'Unnamed member',
                pronouns: String(m.pronouns || ''),
                role: String(m.role || ''),
                color: normHex(m.color_theme),
                description: String(m.description || ''),
                archived: m.is_active === false,
              });
              // fronting_log and messages reference the Parallax uuid, not the
              // sp_id the merge was keyed on.
              const local = idMap[srcKey.replace(/^[a-z]+:/, '')];
              if (local) idMap[String(m.id)] = local;
            });
          await store.set(KEYS.members, finalizeMemberReplace(merged, idMap, importMode));
        }

        const fronts: any[] = Array.isArray(db.fronting_log) ? db.fronting_log : [];
        if (extSel.frontHistory && fronts.length > 0) {
          const entries: HistoryEntry[] = [];
          [...fronts]
            .sort((a: any, b: any) => pxTime(a?.started_at) - pxTime(b?.started_at))
            .forEach((f: any) => {
              const member = f?.part_id ? idMap[String(f.part_id)] : undefined;
              const startTime = pxTime(f?.started_at);
              if (!member || !startTime) return;
              const end = pxTime(f?.ended_at);
              entries.push({memberIds: [member], startTime, endTime: end > 0 ? end : null, note: ''});
            });
          await applyImportedHistory(entries, {history: ctx.history});
        }

        const msgs: any[] = Array.isArray(db.messages) ? db.messages : [];
        if (extSel.chat && msgs.length > 0) {
          const byChat: Record<string, {authorId: string; content: string; timestamp: number}[]> = {};
          msgs.forEach((m: any) => {
            const chatId = String(m?.chat_id || '');
            const authorId = idMap[String(m?.from_part_id)];
            const content = String(m?.body || '');
            const timestamp = pxTime(m?.created_at);
            if (!chatId || !authorId || !content || !timestamp) return;
            (byChat[chatId] ||= []).push({authorId, content, timestamp});
          });
          const chats = Object.values(byChat)
            .map(list => list.sort((a, b) => a.timestamp - b.timestamp))
            .sort((a, b) => a[0].timestamp - b[0].timestamp);
          if (chats.length > 0) {
            const existing = await store.get<ChatChannel[]>(KEYS.chatChannels, []) || [];
            const channels = [...existing];
            for (let i = 0; i < chats.length; i++) {
              // The export names no chats — number them by first-message date.
              const name = `Parallax ${i + 1}`;
              const found = channels.find(x => x.name.toLowerCase() === name.toLowerCase());
              const channelId = found ? found.id : uid();
              if (!found) channels.push({id: channelId, name, createdAt: chats[i][0].timestamp});
              const cur = await store.get<ChatMessage[]>(chatMsgKey(channelId), []) || [];
              const seen = new Set(cur.map(m => `${m.timestamp}|${m.authorId}|${m.content}`));
              const fresh: ChatMessage[] = chats[i]
                .filter(m => !seen.has(`${m.timestamp}|${m.authorId}|${m.content}`))
                .map(m => ({id: uid(), channelId, authorId: m.authorId, type: 'text', content: m.content, timestamp: m.timestamp}));
              if (fresh.length > 0) await store.set(chatMsgKey(channelId), [...cur, ...fresh].sort((a, b) => a.timestamp - b.timestamp));
            }
            await store.set(KEYS.chatChannels, channels);
          }
        }

        setImportStatus('success');
        setImportMsg(t('share.membersCount', {count: pxMembers.length}));
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
