import React, {useState, useEffect, useRef, useCallback} from 'react';
import {View, ScrollView, TouchableOpacity, Alert, FlatList, Image, Linking, Platform, Keyboard, Dimensions, AccessibilityInfo} from 'react-native';
import {KeyboardAwareScrollView} from 'react-native-keyboard-controller';
import {Text, TextInput} from '../components/AppText';
import {Avatar} from '../components/Avatar';
import {useTranslation} from 'react-i18next';
import ReactNativeBlobUtil from 'react-native-blob-util';
import Share from 'react-native-share';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import {readFileBase64} from '../utils/fileBytes';
import {Fonts, fontScale, ThemeColors} from '../theme';
import {useAppStore} from '../store/appStore';
import {saveChatChannels, saveChatCategories} from '../store/actions';
import {Member, ChatChannel, ChatCategory, ChatMessage, DEFAULT_CHANNELS, uid, fmtTime, sortMembersBySearch, memberMatchesSearch, frontersFirst, sortChatCategories, chatChannelsIn} from '../utils';
import {useDragReorder} from '../hooks/useDragReorder';
import {DragHandle, ReorderLockButton} from '../components/DragHandle';
import {store, chatMsgKey} from '../storage';
import {RichText as RichContent} from '../components/MarkdownRenderer';
import {saveChatMedia, getChatMediaFileName} from '../utils/mediaUtils';
import {readClipboardImage} from '../utils/clipboardImage';
import {showChatPingNotification} from '../services/NotificationService';

const EMOJI_QUICK = ['👍', '❤️', '😂', '😢', '😮', '🎉', '✨', '🔥'];

interface Props {
  theme: ThemeColors;
  onMentionPress?: (memberId: string) => void;
}

export const ChatScreen = ({theme: T, onMentionPress}: Props) => {
  const members = useAppStore(s => s.members);
  const channels = useAppStore(s => s.chatChannels);
  const categories = useAppStore(s => s.chatCategories);
  const front = useAppStore(s => s.front);
  const onSaveChannels = saveChatChannels;
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [kbHeight, setKbHeight] = useState(0);
  const [gapBelow, setGapBelow] = useState(0);
  const composerRef = useRef<View>(null);
  useEffect(() => {
    const evShow = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const evHide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(evShow as any, (e: any) => setKbHeight(e?.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(evHide as any, () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const appliedLiftRef = useRef(0);
  const measureComposer = useCallback(() => {
    composerRef.current?.measureInWindow((_x, y, _w, h) => {
      const winH = Dimensions.get('window').height;
      const gap = winH - (y + h) - appliedLiftRef.current;
      if (isFinite(gap)) setGapBelow(Math.max(0, gap));
    });
  }, []);
  const keyboardLift = Math.max(0, kbHeight - gapBelow);
  appliedLiftRef.current = keyboardLift;
  const [activeChannelId, setActiveChannelId] = useState<string | null>(channels.find(c => !c.archived)?.id || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [activeMemberId, setActiveMemberId] = useState<string | null>(members.find(m => !m.archived)?.id || null);
  const [memberSearch, setMemberSearch] = useState('');
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [showChannelList, setShowChannelList] = useState(true);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [showEmojiFor, setShowEmojiFor] = useState<string | null>(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [editChannelId, setEditChannelId] = useState<string | null>(null);
  const [editChannelName, setEditChannelName] = useState('');
  const [reorderOn, setReorderOn] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [moveChannelId, setMoveChannelId] = useState<string | null>(null);
  const [showFormatBar, setShowFormatBar] = useState(false);
  const [actionsForMessage, setActionsForMessage] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const isAtBottomRef = useRef(true);

  const activeChannel = channels.find(c => c.id === activeChannelId);
  const activeMember = members.find(m => m.id === activeMemberId);
  const activeChannels = channels.filter(c => !c.archived);
  const archivedChannels = channels.filter(c => c.archived);
  const sortedCategories = sortChatCategories(categories);
  const uncategorized = chatChannelsIn(activeChannels, null, categories);

  const applyChannelOrder = (orderedIds: string[]) => {
    const pos = new Map(orderedIds.map((id, i) => [id, i] as const));
    onSaveChannels(channels.map(c => (pos.has(c.id) ? {...c, sortOrder: pos.get(c.id)} : c)));
  };

  const applyCategoryOrder = (orderedIds: string[]) => {
    const pos = new Map(orderedIds.map((id, i) => [id, i] as const));
    saveChatCategories(categories.map(c => (pos.has(c.id) ? {...c, sortOrder: pos.get(c.id)} : c)));
  };

  const announceMove = (list: {name: string}[], to: number) => {
    const msg = to <= 0
      ? t('common.movedToTop')
      : to >= list.length - 1
        ? t('common.movedToBottom')
        : t('common.movedBelow', {name: list[to - 1].name});
    AccessibilityInfo.announceForAccessibility(msg);
  };

  const reorderIds = (ids: string[], from: number, to: number): string[] => {
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  };

  const channelsOf = (categoryId: string | null | undefined) => chatChannelsIn(activeChannels, categoryId, categories);

  const onDropChannel = (_key: string, from: number, to: number, siblings: string[]) => {
    const ordered = reorderIds(siblings, from, to);
    applyChannelOrder(ordered);
    announceMove(ordered.map(id => channels.find(c => c.id === id)).filter(Boolean) as ChatChannel[], to);
  };

  const stepChannel = (ch: ChatChannel, dir: 1 | -1) => {
    const list = channelsOf(ch.categoryId);
    const from = list.findIndex(c => c.id === ch.id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= list.length) return;
    const ordered = reorderIds(list.map(c => c.id), from, to);
    applyChannelOrder(ordered);
    announceMove(ordered.map(id => channels.find(c => c.id === id)).filter(Boolean) as ChatChannel[], to);
  };

  const onDropCategory = (_key: string, from: number, to: number, siblings: string[]) => {
    const ordered = reorderIds(siblings, from, to);
    applyCategoryOrder(ordered);
    announceMove(ordered.map(id => categories.find(c => c.id === id)).filter(Boolean) as ChatCategory[], to);
  };

  const stepCategory = (cat: ChatCategory, dir: 1 | -1) => {
    const from = sortedCategories.findIndex(c => c.id === cat.id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= sortedCategories.length) return;
    const ordered = reorderIds(sortedCategories.map(c => c.id), from, to);
    applyCategoryOrder(ordered);
    announceMove(ordered.map(id => categories.find(c => c.id === id)).filter(Boolean) as ChatCategory[], to);
  };

  const chDrag = useDragReorder({enabled: reorderOn, onDrop: onDropChannel});
  const catDrag = useDragReorder({enabled: reorderOn, onDrop: onDropCategory});

  const isChannelDropTarget = (ch: ChatChannel, i: number) =>
    chDrag.dragging && chDrag.drag.key !== ch.id && chDrag.drag.target === i && chDrag.drag.siblings.includes(ch.id);

  const createCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const cat: ChatCategory = {id: uid(), name, sortOrder: sortedCategories.length, createdAt: Date.now()};
    saveChatCategories([...categories, cat]);
    setNewCategoryName('');
    setShowNewCategory(false);
  };

  const renameCategory = (id: string) => {
    const name = editCategoryName.trim();
    if (!name) return;
    saveChatCategories(categories.map(c => (c.id === id ? {...c, name} : c)));
    setEditCategoryId(null);
    setEditCategoryName('');
  };

  const toggleCategory = (id: string) => {
    saveChatCategories(categories.map(c => (c.id === id ? {...c, collapsed: !c.collapsed} : c)));
  };

  const deleteCategory = (id: string) => {
    Alert.alert(t('chat.deleteCategory'), t('chat.deleteCategoryMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => {
        const inside = channels.filter(c => c.categoryId === id);
        if (inside.length > 0) {
          let next = uncategorized.length;
          const moved = new Map(inside.map(c => [c.id, next++] as const));
          onSaveChannels(channels.map(c => (moved.has(c.id) ? {...c, categoryId: undefined, sortOrder: moved.get(c.id)} : c)));
        }
        saveChatCategories(categories.filter(c => c.id !== id));
      }},
    ]);
  };

  const assignChannel = (chId: string, categoryId: string | null) => {
    const target = channelsOf(categoryId).filter(c => c.id !== chId);
    onSaveChannels(channels.map(c => (c.id === chId ? {...c, categoryId: categoryId || undefined, sortOrder: target.length} : c)));
    setMoveChannelId(null);
  };

  const insertFormat = (before: string, after: string) => {
    setInput(prev => prev + before + (after ? t('editor.textPlaceholder') : '') + after);
  };

  const loadMessages = useCallback(async (channelId: string) => {
    const msgs = await store.get<ChatMessage[]>(chatMsgKey(channelId), []);
    setMessages(msgs || []);
  }, []);

  useEffect(() => {
    if (activeChannelId) loadMessages(activeChannelId);
  }, [activeChannelId]);

  const saveMessages = async (channelId: string, msgs: ChatMessage[]) => {
    setMessages(msgs);
    await store.set(chatMsgKey(channelId), msgs);
  };

  const sendMessage = async () => {
    if (!input.trim() || !activeChannelId || !activeMemberId) return;
    const msg: ChatMessage = {
      id: uid(),
      channelId: activeChannelId,
      authorId: activeMemberId,
      type: replyTo ? 'reply' : 'text',
      content: input.trim(),
      replyToId: replyTo?.id,
      timestamp: Date.now(),
    };
    const updated = [...messages, msg];
    await saveMessages(activeChannelId, updated);
    setInput('');
    setReplyTo(null);
    isAtBottomRef.current = true;
    setTimeout(() => flatListRef.current?.scrollToEnd({animated: true}), 100);
  };

  const sendMedia = async () => {
    if (!activeChannelId || !activeMemberId) return;
    try {
      const [res] = await safePick({type: ['*/*']});
      if (!res) return;
      const fileName = res.name || 'file';
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
      const isImage = imageExts.includes(ext);
      const base64 = await readFileBase64(getPickedFilePath(res), (res as any)?.uri);
      const msgId = uid();
      const fileUri = await saveChatMedia(msgId, base64, ext);
      const msg: ChatMessage = {
        id: msgId,
        channelId: activeChannelId,
        authorId: activeMemberId,
        type: isImage ? 'image' : 'file',
        content: fileUri,
        timestamp: Date.now(),
      };
      const updated = [...messages, msg];
      await saveMessages(activeChannelId, updated);
      isAtBottomRef.current = true;
    setTimeout(() => flatListRef.current?.scrollToEnd({animated: true}), 100);
    } catch (e: any) {
      if (!isPickerCancel(e)) Alert.alert(t('chat.imageFailed'), e.message || '');
    }
  };

  const sendClipboardImage = async () => {
    if (!activeChannelId || !activeMemberId) return;
    try {
      const img = await readClipboardImage();
      if (!img) {
        Alert.alert(t('chat.noClipboardImage'));
        return;
      }
      const msgId = uid();
      const fileUri = await saveChatMedia(msgId, img.base64, img.ext);
      const msg: ChatMessage = {
        id: msgId,
        channelId: activeChannelId,
        authorId: activeMemberId,
        type: 'image',
        content: fileUri,
        timestamp: Date.now(),
      };
      const updated = [...messages, msg];
      await saveMessages(activeChannelId, updated);
      isAtBottomRef.current = true;
      setTimeout(() => flatListRef.current?.scrollToEnd({animated: true}), 100);
    } catch (e: any) {
      Alert.alert(t('chat.imageFailed'), e.message || '');
    }
  };

  const addReaction = async (msgId: string, emoji: string) => {
    if (!activeMemberId || !activeChannelId) return;
    const updated = messages.map(m => {
      if (m.id !== msgId) return m;
      const reactions = {...(m.reactions || {})};
      const users = reactions[emoji] || [];
      if (users.includes(activeMemberId)) {
        reactions[emoji] = users.filter(u => u !== activeMemberId);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      } else {
        reactions[emoji] = [...users, activeMemberId];
      }
      return {...m, reactions};
    });
    await saveMessages(activeChannelId, updated);
    setShowEmojiFor(null);
  };

  const startEditMessage = (msg: ChatMessage) => {
    if (msg.type !== 'text' && msg.type !== 'reply') return;
    setEditingMessageId(msg.id);
    setInput(msg.content);
    setActionsForMessage(null);
  };

  const cancelEditMessage = () => {
    setEditingMessageId(null);
    setInput('');
  };

  const saveEditedMessage = async () => {
    if (!editingMessageId || !activeChannelId) return;
    const next = input.trim();
    if (!next) { cancelEditMessage(); return; }
    const updated = messages.map(m =>
      m.id === editingMessageId ? {...m, content: next} : m
    );
    await saveMessages(activeChannelId, updated);
    cancelEditMessage();
  };

  const deleteMessage = (msg: ChatMessage) => {
    if (!activeChannelId) return;
    setActionsForMessage(null);
    Alert.alert(
      t('chat.deleteMsg'),
      t('chat.deleteMsgConfirm'),
      [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('common.delete'), style: 'destructive', onPress: async () => {
          const updated = messages.filter(m => m.id !== msg.id);
          await saveMessages(activeChannelId, updated);
          if (editingMessageId === msg.id) cancelEditMessage();
        }},
      ],
    );
  };

  const pingMessage = async (msg: ChatMessage) => {
    if (!activeChannel) return;
    const author = getMember(msg.authorId);
    const speaker = author?.name || t('common.unknown');
    let preview = '';
    if (msg.type === 'image') preview = t('chat.imagePreview');
    else if (msg.type === 'file') preview = `📄 ${getChatMediaFileName(msg.content)}`;
    else preview = (msg.content || '').replace(/<[^>]+>/g, '').replace(/[#*`~_]/g, '').trim();
    await showChatPingNotification(activeChannel.name, speaker, preview);
    setActionsForMessage(null);
    if (Platform.OS === 'ios') {
      Alert.alert(
        t('chat.pingSent'),
        t('chat.pingSentMsg'),
      );
    }
  };

  const createChannel = () => {
    const name = newChannelName.trim();
    if (!name) return;
    if (channels.length >= 100) {
      Alert.alert(t('chat.channelLimit'), t('chat.channelLimitMsg'));
      return;
    }
    const ch: ChatChannel = {id: uid(), name, sortOrder: uncategorized.length, createdAt: Date.now()};
    onSaveChannels([...channels, ch]);
    setNewChannelName('');
    setShowNewChannel(false);
    setActiveChannelId(ch.id);
    setShowChannelList(false);
  };

  const renameChannel = (id: string) => {
    const name = editChannelName.trim();
    if (!name) return;
    onSaveChannels(channels.map(c => c.id === id ? {...c, name} : c));
    setEditChannelId(null);
    setEditChannelName('');
  };

  const exportChannelSnapshot = async (filename: string, channel: ChatChannel, msgs: ChatMessage[]) => {
    const tempPath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${filename}`;
    await ReactNativeBlobUtil.fs.writeFile(tempPath, JSON.stringify({channel, messages: msgs}, null, 2), 'utf8');
    if (Platform.OS === 'android') {
      try {
        await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
          {name: filename, parentFolder: '', mimeType: 'application/json'},
          'Download',
          tempPath,
        );
      } finally {
        try { await ReactNativeBlobUtil.fs.unlink(tempPath); } catch {}
      }
      return;
    }
    await Share.open({
      url: `file://${tempPath}`,
      type: 'application/json',
      filename,
      failOnCancel: false,
      saveToFiles: true,
    });
  };

  const deleteChannel = (id: string) => {
    Alert.alert(t('chat.deleteChannel'), t('chat.deleteChannelMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: async () => {
        await store.remove(chatMsgKey(id));
        const updated = channels.filter(c => c.id !== id);
        onSaveChannels(updated);
        if (activeChannelId === id) setActiveChannelId(updated.find(c => !c.archived)?.id || null);
      }},
    ]);
  };

  const archiveChannel = (id: string) => {
    const ch = channels.find(c => c.id === id);
    if (!ch) return;
    Alert.alert(t('chat.archiveChannel'), t('chat.archiveChannelMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('chat.archiveClose'), onPress: async () => {
        const msgs = await store.get<ChatMessage[]>(chatMsgKey(id), []) ?? [];
        const filename = `${ch.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
        await exportChannelSnapshot(filename, ch, msgs);
        await store.remove(chatMsgKey(id));
        onSaveChannels(channels.map(c => c.id === id ? {...c, archived: true, archivedAt: Date.now()} : c));
        if (activeChannelId === id) setActiveChannelId(activeChannels.filter(c => c.id !== id)[0]?.id || null);
        Alert.alert(t('chat.archived'), t('chat.archivedMsg', {filename}));
      }},
      {text: t('chat.archiveFresh'), onPress: async () => {
        const msgs = await store.get<ChatMessage[]>(chatMsgKey(id), []) ?? [];
        const filename = `${ch.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
        await exportChannelSnapshot(filename, ch, msgs);
        await store.set(chatMsgKey(id), []);
        setMessages([]);
        Alert.alert(t('chat.archived'), t('chat.archivedFreshMsg', {filename}));
      }},
    ]);
  };

  const getMember = (id: string) => members.find(m => m.id === id);

  const renderMessage = ({item: msg}: {item: ChatMessage}) => {
    const author = getMember(msg.authorId);
    const replyMsg = msg.replyToId ? messages.find(m => m.id === msg.replyToId) : null;
    const replyAuthor = replyMsg ? getMember(replyMsg.authorId) : null;
    const reactions = msg.reactions || {};
    const reactionEntries = Object.entries(reactions);

    return (
      <View style={{paddingHorizontal: 16, paddingVertical: 6}}>
        {replyMsg && (
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 38, marginBottom: 4, opacity: 0.7}}>
            <Text style={{fontSize: fs(10), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">↳</Text>
            <Text style={{fontSize: fs(11), color: replyAuthor?.color || T.dim, fontWeight: '500'}}>{replyAuthor?.name || '?'}</Text>
            <Text style={{fontSize: fs(11), color: T.muted}} numberOfLines={1}>{replyMsg.content.length > 50 ? replyMsg.content.slice(0, 50) + '…' : replyMsg.content}</Text>
          </View>
        )}
        <View style={{flexDirection: 'row', gap: 10}}>
          <Avatar member={author} size={28} T={T} />
          <View style={{flex: 1}}>
            <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 2}}>
              <Text style={{fontSize: fs(13), fontWeight: '600', color: author?.color || T.text}}>{author?.name || '?'}</Text>
              <Text style={{fontSize: fs(10), color: T.muted}}>{fmtTime(msg.timestamp)}</Text>
            </View>
            {msg.type === 'image' ? (
              (typeof msg.content === 'string' && msg.content.trim().length > 0) ? (
                <Image source={{uri: msg.content.trim()}} accessibilityRole="image" accessibilityLabel={t('a11y.image')} style={{width: 200, height: 200, borderRadius: 8, marginTop: 4}} resizeMode="cover" />
              ) : (
                <Text style={{fontSize: fs(11), color: T.muted, fontStyle: 'italic', marginTop: 4}}>{t('chat.imageUnavailable')}</Text>
              )
            ) : msg.type === 'file' ? (
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, marginTop: 4}}>
                <Text style={{fontSize: fs(18)}}>📄</Text>
                <Text style={{fontSize: fs(13), color: T.info, flex: 1}} numberOfLines={1}>{getChatMediaFileName(msg.content)}</Text>
              </View>
            ) : (
              <RichContent text={msg.content} T={T} members={members} onMentionPress={onMentionPress} />
            )}
            {reactionEntries.length > 0 && (
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4}}>
                {reactionEntries.map(([emoji, users]) => (
                  <TouchableOpacity key={emoji} onPress={() => addReaction(msg.id, emoji)} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityState={{selected: (users as string[]).includes(activeMemberId || '')}} accessibilityLabel={`${emoji} ${(users as string[]).length}`}
                    style={{flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
                      backgroundColor: (users as string[]).includes(activeMemberId || '') ? `${T.accent}20` : T.surface, borderWidth: 1, borderColor: T.border}}>
                    <Text style={{fontSize: fs(12)}}>{emoji}</Text>
                    <Text style={{fontSize: fs(10), color: T.dim}}>{(users as string[]).length}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          <View style={{flexDirection: 'row', gap: 4, paddingTop: 2}}>
            <TouchableOpacity onPress={() => setReplyTo(msg)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('chat.reply')}><Text style={{fontSize: fs(12), color: T.dim}}>↩</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setShowEmojiFor(showEmojiFor === msg.id ? null : msg.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('chat.addReaction')}><Text style={{fontSize: fs(12), color: T.dim}}>☺</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setActionsForMessage(actionsForMessage === msg.id ? null : msg.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('chat.messageActions')}><Text style={{fontSize: fs(14), color: actionsForMessage === msg.id ? T.accent : T.dim, fontWeight: '700'}}>⋯</Text></TouchableOpacity>
          </View>
        </View>
        {showEmojiFor === msg.id && (
          <View style={{flexDirection: 'row', gap: 6, marginLeft: 38, marginTop: 4, padding: 6, backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
            {EMOJI_QUICK.map(e => (
              <TouchableOpacity key={e} onPress={() => addReaction(msg.id, e)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={e}>
                <Text style={{fontSize: fs(18)}}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {actionsForMessage === msg.id && (
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 38, marginTop: 4, padding: 6, backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
            {(msg.type === 'text' || msg.type === 'reply') && (
              <TouchableOpacity onPress={() => startEditMessage(msg)} activeOpacity={0.7} accessibilityRole="button" style={{paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
                <Text style={{fontSize: fs(11), fontWeight: '500', color: T.accent}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('common.edit')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => pingMessage(msg)} activeOpacity={0.7} accessibilityRole="button" style={{paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, backgroundColor: T.infoBg, borderColor: `${T.info}40`}}>
              <Text style={{fontSize: fs(11), fontWeight: '500', color: T.info}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('chat.ping')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => deleteMessage(msg)} activeOpacity={0.7} accessibilityRole="button" style={{paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, backgroundColor: T.dangerBg, borderColor: `${T.danger}40`}}>
              <Text style={{fontSize: fs(11), fontWeight: '500', color: T.danger}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('common.delete')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderChannelRow = (ch: ChatChannel, i: number, list: ChatChannel[]) => (
    <View
      key={ch.id}
      onLayout={e => chDrag.registerHeight(ch.id, e.nativeEvent.layout.height + 6)}
      style={{marginBottom: 6, ...(chDrag.drag.key === ch.id ? {transform: [{translateY: chDrag.drag.dy}], zIndex: 10, elevation: 6} : null)}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
        {editChannelId === ch.id ? (
          <View style={{flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center'}}>
            <TextInput value={editChannelName} onChangeText={setEditChannelName} autoFocus accessibilityLabel={t('chat.channelName')}
              style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: fs(13)}}
              onSubmitEditing={() => renameChannel(ch.id)} returnKeyType="done" />
            <TouchableOpacity onPress={() => renameChannel(ch.id)} accessibilityRole="button" accessibilityLabel={t('common.save')}><Text style={{fontSize: fs(14), color: T.success}}>✓</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setEditChannelId(null)} accessibilityRole="button" accessibilityLabel={t('common.cancel')}><Text style={{fontSize: fs(12), color: T.dim}}>✕</Text></TouchableOpacity>
          </View>
        ) : (
          <>
            <DragHandle T={T} active={reorderOn}
              panHandlers={chDrag.makeHandlePanHandlers(ch.id, () => channelsOf(ch.categoryId).map(c => c.id))}
              name={ch.name} position={i + 1} count={list.length}
              onStep={dir => stepChannel(ch, dir)} />
            <TouchableOpacity onPress={() => {setActiveChannelId(ch.id); setShowChannelList(false);}} activeOpacity={0.7}
              accessibilityRole="button" accessibilityState={{selected: activeChannelId === ch.id}} accessibilityLabel={ch.name}
              style={{flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, backgroundColor: T.card,
                borderColor: isChannelDropTarget(ch, i) ? T.accent : activeChannelId === ch.id ? `${T.accent}50` : T.border}}>
              <Text style={{fontSize: fs(14), fontWeight: '500', color: T.text}}># {ch.name}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMoveChannelId(moveChannelId === ch.id ? null : ch.id)} activeOpacity={0.7}
              accessibilityRole="button" accessibilityState={{expanded: moveChannelId === ch.id}} accessibilityLabel={`${t('chat.moveToCategory')}, ${ch.name}`}>
              <Text style={{fontSize: fs(12), color: moveChannelId === ch.id ? T.accent : T.dim}}>🗂</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {setEditChannelId(ch.id); setEditChannelName(ch.name);}} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t('common.edit')} ${ch.name}`} style={{paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}><Text style={{fontSize: fs(11), fontWeight: '500', color: T.accent}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('common.edit')}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => archiveChannel(ch.id)} accessibilityRole="button" accessibilityLabel={t('chat.archiveChannel')}><Text style={{fontSize: fs(12), color: T.info}}>▼</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => deleteChannel(ch.id)} accessibilityRole="button" accessibilityLabel={`${t('common.delete')} ${ch.name}`}><Text style={{fontSize: fs(12), color: T.danger}}>✕</Text></TouchableOpacity>
          </>
        )}
      </View>
      {moveChannelId === ch.id && (
        <View style={{marginTop: 6, marginLeft: 30, padding: 8, borderRadius: 8, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border}}>
          <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 6}}>{t('chat.moveToCategory')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{flexDirection: 'row', gap: 6}}>
              {[{id: null as string | null, name: t('chat.uncategorized')}, ...sortedCategories.map(c => ({id: c.id as string | null, name: c.name}))].map(opt => {
                const current = (ch.categoryId || null) === opt.id;
                return (
                  <TouchableOpacity key={opt.id ?? '__none__'} onPress={() => assignChannel(ch.id, opt.id)} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityState={{selected: current}} accessibilityLabel={opt.name}
                    style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
                      backgroundColor: current ? T.accentBg : T.bg, borderColor: current ? `${T.accent}50` : T.border}}>
                    <Text style={{fontSize: fs(11), color: current ? T.accent : T.text}}>{opt.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );

  if (showChannelList) {
    return (
      <KeyboardAwareScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={{padding: 16, paddingBottom: 32}} bottomOffset={24}>
        <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10}}>
          <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600'}}>{t('chat.channels')}</Text>
          <ReorderLockButton T={T} on={reorderOn} onToggle={() => setReorderOn(v => !v)} />
        </View>

        {sortedCategories.length > 0 && uncategorized.length > 0 && (
          <Text accessibilityRole="header" style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.muted, fontWeight: '600', marginBottom: 8}}>{t('chat.uncategorized')}</Text>
        )}
        {uncategorized.map((ch, i) => renderChannelRow(ch, i, uncategorized))}

        {sortedCategories.map((cat, ci) => {
          const list = channelsOf(cat.id);
          const catTarget = catDrag.dragging && catDrag.drag.key !== cat.id && catDrag.drag.target === ci;
          return (
            <View key={cat.id}
              onLayout={e => catDrag.registerHeight(cat.id, e.nativeEvent.layout.height + 14)}
              style={{marginTop: 14, ...(catDrag.drag.key === cat.id ? {transform: [{translateY: catDrag.drag.dy}], zIndex: 10, elevation: 6} : null)}}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: catTarget ? T.accent : T.border}}>
                {editCategoryId === cat.id ? (
                  <View style={{flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center'}}>
                    <TextInput value={editCategoryName} onChangeText={setEditCategoryName} autoFocus accessibilityLabel={t('chat.categoryName')}
                      style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: fs(13)}}
                      onSubmitEditing={() => renameCategory(cat.id)} returnKeyType="done" />
                    <TouchableOpacity onPress={() => renameCategory(cat.id)} accessibilityRole="button" accessibilityLabel={t('common.save')}><Text style={{fontSize: fs(14), color: T.success}}>✓</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => setEditCategoryId(null)} accessibilityRole="button" accessibilityLabel={t('common.cancel')}><Text style={{fontSize: fs(12), color: T.dim}}>✕</Text></TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <DragHandle T={T} active={reorderOn}
                      panHandlers={catDrag.makeHandlePanHandlers(cat.id, () => sortedCategories.map(c => c.id))}
                      name={cat.name} position={ci + 1} count={sortedCategories.length}
                      onStep={dir => stepCategory(cat, dir)} />
                    <TouchableOpacity onPress={() => toggleCategory(cat.id)} activeOpacity={0.7}
                      accessibilityRole="button" accessibilityState={{expanded: !cat.collapsed}} accessibilityLabel={cat.name}
                      accessibilityValue={{text: String(list.length)}}
                      style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4}}>
                      <Text style={{fontSize: fs(11), color: T.dim}}>{cat.collapsed ? '▸' : '▾'}</Text>
                      <Text style={{flex: 1, fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600'}}>{cat.name}</Text>
                      <Text style={{fontSize: fs(10), color: T.muted}}>{list.length}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => {setEditCategoryId(cat.id); setEditCategoryName(cat.name);}} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t('common.edit')} ${cat.name}`} style={{paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}><Text style={{fontSize: fs(11), fontWeight: '500', color: T.accent}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('common.edit')}</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteCategory(cat.id)} accessibilityRole="button" accessibilityLabel={`${t('common.delete')} ${cat.name}`}><Text style={{fontSize: fs(12), color: T.danger}}>✕</Text></TouchableOpacity>
                  </>
                )}
              </View>
              {!cat.collapsed && list.map((ch, i) => renderChannelRow(ch, i, list))}
              {!cat.collapsed && list.length === 0 && (
                <Text style={{fontSize: fs(11), color: T.muted, fontStyle: 'italic', marginBottom: 6}}>{t('chat.categoryEmpty')}</Text>
              )}
            </View>
          );
        })}

        {showNewChannel ? (
          <View style={{flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8}}>
            <TextInput value={newChannelName} onChangeText={setNewChannelName} accessibilityLabel={t('chat.channelName')} placeholder={t('chat.channelName')} placeholderTextColor={T.muted}
              style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13)}}
              onSubmitEditing={createChannel} returnKeyType="done" autoFocus />
            <TouchableOpacity onPress={createChannel} activeOpacity={0.7} accessibilityRole="button"
              style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`}}>
              <Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>{t('common.add')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setShowNewChannel(true)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('chat.newChannel')}
            style={{alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: T.border, marginTop: 8}}>
            <Text style={{fontSize: fs(12), color: T.dim}}>+ {t('chat.newChannel')}</Text>
          </TouchableOpacity>
        )}

        {showNewCategory ? (
          <View style={{flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8}}>
            <TextInput value={newCategoryName} onChangeText={setNewCategoryName} accessibilityLabel={t('chat.categoryName')} placeholder={t('chat.categoryName')} placeholderTextColor={T.muted}
              style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13)}}
              onSubmitEditing={createCategory} returnKeyType="done" autoFocus />
            <TouchableOpacity onPress={createCategory} activeOpacity={0.7} accessibilityRole="button"
              style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`}}>
              <Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>{t('common.add')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setShowNewCategory(true)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('chat.newCategory')}
            style={{alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: T.border, marginTop: 8}}>
            <Text style={{fontSize: fs(12), color: T.dim}}>+ {t('chat.newCategory')}</Text>
          </TouchableOpacity>
        )}

        {archivedChannels.length > 0 && (
          <View style={{marginTop: 20}}>
            <Text accessibilityRole="header" style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 10}}>{t('chat.archivedChannels')}</Text>
            {archivedChannels.map(ch => (
              <View key={ch.id} style={{padding: 12, borderRadius: 10, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border, marginBottom: 6, opacity: 0.6}}>
                <Text style={{fontSize: fs(14), color: T.text}}>#{ch.name}</Text>
                <Text style={{fontSize: fs(11), color: T.muted, marginTop: 2}}>{t('chat.archivedOn', {date: ch.archivedAt ? fmtTime(ch.archivedAt) : '?'})}</Text>
              </View>
            ))}
          </View>
        )}
      </KeyboardAwareScrollView>
    );
  }

  return (
    <View style={{flex: 1, backgroundColor: T.bg, paddingBottom: keyboardLift}}>
      <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border}}>
        <TouchableOpacity onPress={() => setShowChannelList(true)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('chat.channels')} style={{marginRight: 10}}>
          <Text style={{fontSize: fs(16), color: T.dim}}>☰</Text>
        </TouchableOpacity>
        <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(15), fontWeight: '600', color: T.text}}>#{activeChannel?.name || '?'}</Text>
        <TouchableOpacity onPress={() => setShowMemberPicker(!showMemberPicker)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityState={{expanded: showMemberPicker}} accessibilityLabel={t('chat.selectSpeaker')} accessibilityValue={{text: activeMember?.name || ''}}
          style={{flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
            backgroundColor: activeMember ? `${activeMember.color}15` : T.surface, borderColor: activeMember ? `${activeMember.color}40` : T.border}}>
          {activeMember && <Avatar member={activeMember} size={18} T={T} />}
          <Text style={{fontSize: fs(11), color: activeMember?.color || T.dim, fontWeight: '500'}}>{activeMember?.name || t('chat.selectSpeaker')}</Text>
        </TouchableOpacity>
      </View>

      {showMemberPicker && (
        <View style={{paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: T.surface}}>
          <TextInput value={memberSearch} onChangeText={setMemberSearch} accessibilityLabel={t('chat.searchSpeaker')} placeholder={t('chat.searchSpeaker')} placeholderTextColor={T.muted}
            style={{backgroundColor: T.bg, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, fontSize: fs(13), marginBottom: 6}} />
          {(() => {
            const q = memberSearch.toLowerCase();
            const match = (m: Member) => !m.archived && !m.isCustomFront && (!memberSearch || memberMatchesSearch(m, q));
            const chip = (m: Member) => (
              <TouchableOpacity key={m.id} onPress={() => {setActiveMemberId(m.id); setShowMemberPicker(false); setMemberSearch('');}} activeOpacity={0.7}
                accessibilityRole="button" accessibilityState={{selected: activeMemberId === m.id}} accessibilityLabel={m.name}
                style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
                  backgroundColor: activeMemberId === m.id ? `${m.color}20` : T.bg, borderColor: activeMemberId === m.id ? `${m.color}50` : T.border}}>
                <Avatar member={m} size={18} T={T} />
                <Text style={{fontSize: fs(11), color: activeMemberId === m.id ? m.color : T.text}}>{m.name}</Text>
              </TouchableOpacity>
            );
            const roster = frontersFirst(sortMembersBySearch(members.filter(m => match(m) && !m.isFacet), memberSearch), front);
            const facets = sortMembersBySearch(members.filter(m => match(m) && m.isFacet), memberSearch);
            return (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{flexDirection: 'row', gap: 6}}>{roster.map(chip)}</View>
                </ScrollView>
                {facets.length > 0 && (
                  <>
                    <Text accessibilityRole="header" style={{fontSize: fs(9), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginTop: 8, marginBottom: 4}}>{t('members.facets')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{flexDirection: 'row', gap: 6}}>{facets.map(chip)}</View>
                    </ScrollView>
                  </>
                )}
              </>
            );
          })()}
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        style={{flex: 1}}
        contentContainerStyle={{paddingVertical: 8}}
        onScroll={e => {
          const {contentOffset, contentSize, layoutMeasurement} = e.nativeEvent;
          const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
          isAtBottomRef.current = distanceFromBottom < 64;
        }}
        scrollEventThrottle={32}
        onContentSizeChange={() => {
          if (isAtBottomRef.current) flatListRef.current?.scrollToEnd({animated: false});
        }}
        ListEmptyComponent={
          <View style={{alignItems: 'center', paddingVertical: 48}}>
            <Text style={{fontSize: fs(13), color: T.dim}}>{t('chat.noMessages')}</Text>
          </View>
        }
      />

      {replyTo && !editingMessageId && (
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6, backgroundColor: T.surface, borderTopWidth: 1, borderTopColor: T.border}}>
          <Text style={{fontSize: fs(11), color: T.dim, flex: 1}} numberOfLines={1}>↳ {getMember(replyTo.authorId)?.name}: {replyTo.content.slice(0, 40)}</Text>
          <TouchableOpacity onPress={() => setReplyTo(null)} accessibilityRole="button" accessibilityLabel={t('common.cancel')}><Text style={{fontSize: fs(12), color: T.danger}}>✕</Text></TouchableOpacity>
        </View>
      )}
      {editingMessageId && (
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6, backgroundColor: `${T.accent}15`, borderTopWidth: 1, borderTopColor: `${T.accent}40`}}>
          <Text style={{fontSize: fs(11), color: T.accent, flex: 1, fontWeight: '500'}} numberOfLines={1}>✎ {t('chat.editingHeader')}</Text>
          <TouchableOpacity onPress={cancelEditMessage} accessibilityRole="button" accessibilityLabel={t('common.cancel')}><Text style={{fontSize: fs(12), color: T.danger}}>{t('common.cancel')}</Text></TouchableOpacity>
        </View>
      )}

      {showFormatBar && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{maxHeight: Math.max(40, fs(12) * 2 + 28), flexGrow: 0, borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.surface}}
          contentContainerStyle={{paddingHorizontal: 12, paddingVertical: 6, gap: 6, flexDirection: 'row', alignItems: 'center'}}>
          {[
            {label: 'B', a11y: 'markdown.toolBold', before: '**', after: '**'},
            {label: 'I', a11y: 'markdown.toolItalic', before: '*', after: '*'},
            {label: 'S', a11y: 'markdown.toolStrike', before: '~~', after: '~~'},
            {label: 'H1', a11y: 'markdown.toolH1', before: '# ', after: ''},
            {label: 'H2', a11y: 'markdown.toolH2', before: '## ', after: ''},
            {label: '🔗', a11y: 'markdown.toolLink', before: '[', after: '](url)'},
            {label: '•', a11y: 'markdown.toolBullets', before: '- ', after: ''},
            {label: '1.', a11y: 'markdown.toolNumbered', before: '1. ', after: ''},
            {label: '❝', a11y: 'markdown.toolQuote', before: '> ', after: ''},
            {label: '</>', a11y: 'markdown.toolCode', before: '`', after: '`'},
          ].map(tool => (
            <TouchableOpacity key={tool.label} onPress={() => insertFormat(tool.before, tool.after)} activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel={t(tool.a11y)}
              style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: T.border, backgroundColor: T.bg}}>
              <Text style={{fontSize: fs(12), fontWeight: tool.label === 'B' ? '700' : '500', fontStyle: tool.label === 'I' ? 'italic' : 'normal', textDecorationLine: tool.label === 'S' ? 'line-through' : 'none', color: T.dim}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{tool.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View
        ref={composerRef}
        onLayout={measureComposer}
        style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.surface}}>
        <TouchableOpacity onPress={sendMedia} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('chat.attachFile')} style={{padding: 4}}>
          <Text style={{fontSize: fs(18), color: T.dim}}>📎</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={sendClipboardImage} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('chat.pasteImage')} style={{padding: 4}}>
          <Text style={{fontSize: fs(18), color: T.dim}}>📋</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowFormatBar(!showFormatBar)} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{expanded: showFormatBar}} accessibilityLabel={t('chat.formatting')} style={{padding: 4}}>
          <Text style={{fontSize: fs(14), fontWeight: '700', color: showFormatBar ? T.accent : T.dim}}>Aa</Text>
        </TouchableOpacity>
        <TextInput value={input} onChangeText={setInput} accessibilityLabel={editingMessageId ? t('chat.editPlaceholder') : t('chat.typeMessage')} placeholder={editingMessageId ? t('chat.editPlaceholder') : t('chat.typeMessage')} placeholderTextColor={T.muted}
          style={{flex: 1, backgroundColor: T.bg, color: T.text, borderWidth: 1, borderColor: editingMessageId ? `${T.accent}60` : T.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: fs(14)}}
          onSubmitEditing={editingMessageId ? saveEditedMessage : sendMessage} returnKeyType={editingMessageId ? 'done' : 'send'} />
        <TouchableOpacity onPress={editingMessageId ? saveEditedMessage : sendMessage} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel={editingMessageId ? t('common.save') : t('chat.send')}
          style={{width: 36, height: 36, borderRadius: 18, backgroundColor: input.trim() ? T.accent : T.toggleOff, alignItems: 'center', justifyContent: 'center'}}>
          <Text style={{fontSize: fs(16), color: input.trim() ? T.bg : T.muted}}>{editingMessageId ? '✓' : '↑'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
