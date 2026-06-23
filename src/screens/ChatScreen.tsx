import React, {useState, useEffect, useRef, useCallback} from 'react';
import {View, ScrollView, TouchableOpacity, Alert, FlatList, Image, Linking, Platform} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {Avatar} from '../components/Avatar';
import {useTranslation} from 'react-i18next';
import ReactNativeBlobUtil from 'react-native-blob-util';
import Share from 'react-native-share';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import {Fonts} from '../theme';
import {Member, ChatChannel, ChatMessage, DEFAULT_CHANNELS, uid, fmtTime, sortMembersBySearch} from '../utils';
import {store, chatMsgKey} from '../storage';
import {RichText as RichContent} from '../components/MarkdownRenderer';
import {saveChatMedia, getChatMediaFileName} from '../utils/mediaUtils';
import {showChatPingNotification} from '../services/NotificationService';

const EMOJI_QUICK = ['👍', '❤️', '😂', '😢', '😮', '🎉', '✨', '🔥'];

interface Props {
  theme: any;
  members: Member[];
  channels: ChatChannel[];
  onSaveChannels: (ch: ChatChannel[]) => void;
  onMentionPress?: (memberId: string) => void;
}

export const ChatScreen = ({theme: T, members, channels, onSaveChannels, onMentionPress}: Props) => {
  const {t} = useTranslation();
  const fs = (s: number) => Math.round(s * (T.textScale || 1));
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
  const [showFormatBar, setShowFormatBar] = useState(false);
  const [actionsForMessage, setActionsForMessage] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const isAtBottomRef = useRef(true);

  const activeChannel = channels.find(c => c.id === activeChannelId);
  const activeMember = members.find(m => m.id === activeMemberId);
  const activeChannels = channels.filter(c => !c.archived);
  const archivedChannels = channels.filter(c => c.archived);

  const insertFormat = (before: string, after: string) => {
    setInput(prev => prev + before + (after ? 'text' : '') + after);
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
      const base64 = await ReactNativeBlobUtil.fs.readFile(getPickedFilePath(res), 'base64');
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
    const ch: ChatChannel = {id: uid(), name, createdAt: Date.now()};
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
            <Text style={{fontSize: fs(10), color: T.dim}}>↳</Text>
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
                <Image source={{uri: msg.content.trim()}} accessibilityRole="image" accessibilityLabel="Image" style={{width: 200, height: 200, borderRadius: 8, marginTop: 4}} resizeMode="cover" />
              ) : (
                <Text style={{fontSize: fs(11), color: T.muted, fontStyle: 'italic', marginTop: 4}}>[image unavailable]</Text>
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

  if (showChannelList) {
    return (
      <ScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={{padding: 16, paddingBottom: 32}}>
        <Text accessibilityRole="header" style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 10}}>{t('chat.channels')}</Text>
        {activeChannels.map(ch => (
          <View key={ch.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6}}>
            {editChannelId === ch.id ? (
              <View style={{flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center'}}>
                <TextInput value={editChannelName} onChangeText={setEditChannelName} autoFocus
                  style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: fs(13)}}
                  onSubmitEditing={() => renameChannel(ch.id)} returnKeyType="done" />
                <TouchableOpacity onPress={() => renameChannel(ch.id)} accessibilityRole="button" accessibilityLabel={t('common.save')}><Text style={{fontSize: fs(14), color: T.success}}>✓</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setEditChannelId(null)} accessibilityRole="button" accessibilityLabel={t('common.cancel')}><Text style={{fontSize: fs(12), color: T.dim}}>✕</Text></TouchableOpacity>
              </View>
            ) : (
              <>
                <TouchableOpacity onPress={() => {setActiveChannelId(ch.id); setShowChannelList(false);}} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityState={{selected: activeChannelId === ch.id}} accessibilityLabel={ch.name}
                  style={{flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, backgroundColor: T.card, borderColor: activeChannelId === ch.id ? `${T.accent}50` : T.border}}>
                  <Text style={{fontSize: fs(14), fontWeight: '500', color: T.text}}># {ch.name}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => {setEditChannelId(ch.id); setEditChannelName(ch.name);}} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t('common.edit')} ${ch.name}`} style={{paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}><Text style={{fontSize: fs(11), fontWeight: '500', color: T.accent}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('common.edit')}</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => archiveChannel(ch.id)} accessibilityRole="button" accessibilityLabel={t('chat.archiveChannel')}><Text style={{fontSize: fs(12), color: T.info}}>▼</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => deleteChannel(ch.id)} accessibilityRole="button" accessibilityLabel={`${t('common.delete')} ${ch.name}`}><Text style={{fontSize: fs(12), color: T.danger}}>✕</Text></TouchableOpacity>
              </>
            )}
          </View>
        ))}

        {showNewChannel ? (
          <View style={{flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8}}>
            <TextInput value={newChannelName} onChangeText={setNewChannelName} placeholder={t('chat.channelName')} placeholderTextColor={T.muted}
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
      </ScrollView>
    );
  }

  return (
    <View style={{flex: 1, backgroundColor: T.bg}}>
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
          <TextInput value={memberSearch} onChangeText={setMemberSearch} placeholder={t('chat.searchSpeaker')} placeholderTextColor={T.muted}
            style={{backgroundColor: T.bg, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, fontSize: fs(13), marginBottom: 6}} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{flexDirection: 'row', gap: 6}}>
              {sortMembersBySearch(members.filter(m => !m.archived && !m.isCustomFront && (!memberSearch || m.name.toLowerCase().includes(memberSearch.toLowerCase()))), memberSearch).map(m => (
                <TouchableOpacity key={m.id} onPress={() => {setActiveMemberId(m.id); setShowMemberPicker(false); setMemberSearch('');}} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityState={{selected: activeMemberId === m.id}} accessibilityLabel={m.name}
                  style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
                    backgroundColor: activeMemberId === m.id ? `${m.color}20` : T.bg, borderColor: activeMemberId === m.id ? `${m.color}50` : T.border}}>
                  <Avatar member={m} size={18} T={T} />
                  <Text style={{fontSize: fs(11), color: activeMemberId === m.id ? m.color : T.text}}>{m.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
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
          style={{maxHeight: 40, flexGrow: 0, borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.surface}}
          contentContainerStyle={{paddingHorizontal: 12, paddingVertical: 6, gap: 6, flexDirection: 'row', alignItems: 'center'}}>
          {[
            {label: 'B', before: '**', after: '**'},
            {label: 'I', before: '*', after: '*'},
            {label: 'S', before: '~~', after: '~~'},
            {label: 'H1', before: '# ', after: ''},
            {label: 'H2', before: '## ', after: ''},
            {label: '🔗', before: '[', after: '](url)'},
            {label: '•', before: '- ', after: ''},
            {label: '1.', before: '1. ', after: ''},
            {label: '❝', before: '> ', after: ''},
            {label: '</>', before: '`', after: '`'},
          ].map(tool => (
            <TouchableOpacity key={tool.label} onPress={() => insertFormat(tool.before, tool.after)} activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel={tool.label}
              style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: T.border, backgroundColor: T.bg}}>
              <Text style={{fontSize: fs(12), fontWeight: tool.label === 'B' ? '700' : '500', fontStyle: tool.label === 'I' ? 'italic' : 'normal', textDecorationLine: tool.label === 'S' ? 'line-through' : 'none', color: T.dim}}>{tool.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.surface}}>
        <TouchableOpacity onPress={sendMedia} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('chat.attachFile')} style={{padding: 4}}>
          <Text style={{fontSize: fs(18), color: T.dim}}>📎</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowFormatBar(!showFormatBar)} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{expanded: showFormatBar}} accessibilityLabel={t('chat.formatting')} style={{padding: 4}}>
          <Text style={{fontSize: fs(14), fontWeight: '700', color: showFormatBar ? T.accent : T.dim}}>Aa</Text>
        </TouchableOpacity>
        <TextInput value={input} onChangeText={setInput} placeholder={editingMessageId ? t('chat.editPlaceholder') : t('chat.typeMessage')} placeholderTextColor={T.muted}
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
