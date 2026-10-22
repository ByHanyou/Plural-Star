import {Alert} from 'react-native';
import {ImportUserError, importErrorText} from './importError';
import {Member, ChatChannel, ChatMessage, pushTo, uid} from '../utils';
import {store, KEYS, chatMsgKey} from '../storage';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import {readFileText} from '../utils/fileBytes';
import {log} from '../utils/log';
import {mergeForeignMember, finalizeMemberReplace, normHex, pxTime, convertParallaxFronts, getStoredList, getStoredMembers, chatSig} from './convert';
import {confirmImport} from './confirm';
import {asArray} from './formats';
import type {PxMember, PxFront, PxMessage} from './formats';
import type {ExtImportCtx} from './preview';
import {applyImportedHistory} from './restoreCommon';
import {isParallaxDb} from './detect';

export type ParallaxCtx = ExtImportCtx & {setRestoreProgress: (label: string) => void};

export const handleParallaxPick = async (ctx: ParallaxCtx) => {
  const {t, setRestoreError, setExtPreview, setImportStatus, setImportMsg, setImportSource} = ctx;
  setRestoreError(''); setExtPreview(null); setImportStatus('idle'); setImportMsg('');
  try {
    const [res] = await safePick({type: ['application/json', 'text/plain']});
    if (!res) return;
    const path = getPickedFilePath(res);
    const raw: string = await readFileText(path, res.uri);
    let db: unknown = null;
    try { db = JSON.parse(raw); } catch (e) { log.debug('import', e); }
    if (!isParallaxDb(db)) {
      throw new ImportUserError(t('share.parallaxNeedsJson'));
    }
    setExtPreview({source: 'parallax', db});
    setImportSource('parallax');
  } catch (e) { if (!isPickerCancel(e)) Alert.alert(t('share.importFailed'), importErrorText(e, t)); }
};

export const handleParallaxConfirm = (ctx: ParallaxCtx) => {
  const {extPreview, extSel, importMode, t, setExtPreview, setImportStatus, setImportMsg, setRestoreProgress, onDataImported} = ctx;
  if (!extPreview || extPreview.source !== 'parallax') return;
  confirmImport(t, importMode, async () => {
    try {
      const db = extPreview.db;
      const pxMembers: PxMember[] = asArray<PxMember>(db.members);
      const idMap = new Map<string, string>();

      if (extSel.members) {
        const existing = await getStoredMembers();
        const merged: Member[] = [...existing];
        [...pxMembers]
          .sort((a, b) => (a?.sort_order ?? 0) - (b?.sort_order ?? 0))
          .forEach(m => {
            if (!m || !m.id) return;
            const spId = String(m.sp_id || '');
            const srcKey = /^[0-9a-f]{24}$/i.test(spId) ? spId : 'px:' + String(m.id);
            mergeForeignMember(merged, idMap, srcKey, {
              name: (m.name && String(m.name).trim()) || t('share.unnamedMember'),
              pronouns: String(m.pronouns || ''),
              role: String(m.role || ''),
              color: normHex(m.color_theme),
              description: String(m.description || ''),
              archived: m.is_active === false,
            });
            const local = idMap.get(srcKey.replace(/^[a-z]+:/, ''));
            if (local) idMap.set(String(m.id), local);
          });
        await store.set(KEYS.members, finalizeMemberReplace(merged, idMap, importMode));
      }

      const fronts: PxFront[] = asArray<PxFront>(db.fronting_log);
      if (extSel.frontHistory && fronts.length > 0) {
        await applyImportedHistory(convertParallaxFronts(fronts, idMap), {history: ctx.history});
      }

      const msgs: PxMessage[] = asArray<PxMessage>(db.messages);
      if (extSel.chat && msgs.length > 0) {
        const byChat = new Map<string, {authorId: string; content: string; timestamp: number}[]>();
        msgs.forEach(m => {
          const chatId = String(m?.chat_id || '');
          const authorId = idMap.get(String(m?.from_part_id));
          const content = String(m?.body || '');
          const timestamp = pxTime(m?.created_at);
          if (!chatId || !authorId || !content || !timestamp) return;
          pushTo(byChat, chatId, {authorId, content, timestamp});
        });
        const chats = [...byChat.values()]
          .map(list => list.sort((a, b) => a.timestamp - b.timestamp))
          .sort((a, b) => a[0].timestamp - b[0].timestamp);
        if (chats.length > 0) {
          const existing = await getStoredList<ChatChannel>(KEYS.chatChannels);
          const channels = [...existing];
          for (let i = 0; i < chats.length; i++) {
            const name = `Parallax ${i + 1}`;
            const found = channels.find(x => x.name.toLowerCase() === name.toLowerCase());
            const channelId = found ? found.id : uid();
            if (!found) channels.push({id: channelId, name, createdAt: chats[i][0].timestamp});
            const cur = await getStoredList<ChatMessage>(chatMsgKey(channelId));
            const seen = new Set(cur.map(chatSig));
            const fresh: ChatMessage[] = chats[i]
              .filter(m => !seen.has(chatSig(m)))
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
    } catch (e) {
      setRestoreProgress('');
      setImportStatus('error');
      setImportMsg(importErrorText(e, t));
    }
  });
};
