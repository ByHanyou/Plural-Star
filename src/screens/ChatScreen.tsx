import React, {useState, useRef, useCallback, useMemo} from 'react';
import {View, TouchableOpacity, Alert, FlatList, Platform, Dimensions} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {Avatar} from '../components/Avatar';
import {MemberPicker} from '../components/MemberPicker';
import {memberFacetPools} from '../picker/memberPicker';
import type {PickerPool} from '../picker/memberPicker';
import {useTranslation} from 'react-i18next';
import {errorMessage, logError} from '../utils/log';
import {reportSaveError} from '../utils/saveError';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import {readFileBase64} from '../utils/fileBytes';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {useAppStore} from '../store/appStore';
import {Member, ChatMessage, uid, frontersFirst, toggleReaction, truncateRunes} from '../utils';
import {saveChatMedia, getChatMediaFileName, deleteChatMediaFile} from '../utils/mediaUtils';
import {readClipboardImage} from '../utils/clipboardImage';
import {showChatPingNotification} from '../services/messageNotifications';
import {stripMarkup} from '../markdown/parse';
import {useKeyboardHeight} from '../hooks/useKeyboardHeight';
import {useChannelMessages} from '../hooks/useChannelMessages';
import {ChannelList} from './chat/ChannelList';
import {MessageRow, isEditableMessage} from './chat/MessageRow';
import {FormatBar} from './chat/FormatBar';

const MAX_CHAT_FILE_BYTES = 25 * 1024 * 1024;
const CHAT_IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
const BOTTOM_STICK_PX = 64;

const isMedia = (m: ChatMessage) => m.type === 'image' || m.type === 'file';

interface Props {
  onMentionPress?: (memberId: string) => void;
}

export const ChatScreen = ({onMentionPress}: Props) => {
  const T = useTheme();
  const members = useAppStore(s => s.members);
  const channels = useAppStore(s => s.chatChannels);
  const front = useAppStore(s => s.front);
  const {t} = useTranslation();
  const fs = fontScale(T);
  const kbHeight = useKeyboardHeight();
  const [gapBelow, setGapBelow] = useState(0);
  const composerRef = useRef<View>(null);
  const appliedLiftRef = useRef(0);
  const measureComposer = useCallback(() => {
    composerRef.current?.measureInWindow((_x, y, _w, h) => {
      const gap = Dimensions.get('window').height - (y + h) - appliedLiftRef.current;
      if (isFinite(gap)) setGapBelow(Math.max(0, gap));
    });
  }, []);
  const keyboardLift = Math.max(0, kbHeight - gapBelow);
  appliedLiftRef.current = keyboardLift;
  const [activeChannelId, setActiveChannelId] = useState<string | null>(channels.find(c => !c.archived)?.id || null);
  const {messages, messagesRef, saveMessages, clearMessages} = useChannelMessages(activeChannelId);
  const [input, setInput] = useState('');
  const [activeMemberId, setActiveMemberId] = useState<string | null>(members.find(m => !m.archived && !m.deleted && !m.isCustomFront)?.id || null);
  const speakerPools = useMemo(() => memberFacetPools(members, t), [members, t]);
  const speakerOrder = useCallback((rows: Member[], pool: PickerPool) => pool.kind === 'members' ? frontersFirst(rows, front) : rows, [front]);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [showChannelList, setShowChannelList] = useState(true);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [showEmojiFor, setShowEmojiFor] = useState<string | null>(null);
  const [showFormatBar, setShowFormatBar] = useState(false);
  const [actionsForMessage, setActionsForMessage] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const isAtBottomRef = useRef(true);

  const memberMap = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const messageById = useMemo(() => new Map(messages.map(m => [m.id, m])), [messages]);
  const activeChannel = channels.find(c => c.id === activeChannelId);
  const activeMember = activeMemberId ? memberMap.get(activeMemberId) : undefined;
  const previewOf = (m: ChatMessage) => m.type === 'image' ? t('a11y.image') : m.type === 'file' ? getChatMediaFileName(m.content) : truncateRunes(m.content, 40);

  const insertFormat = (before: string, after: string) => {
    setInput(prev => prev + before + (after ? t('editor.textPlaceholder') : '') + after);
  };

  const appendMessage = async (channelId: string, msg: ChatMessage) => {
    await saveMessages(channelId, [...messagesRef.current, msg]);
    isAtBottomRef.current = true;
    setTimeout(() => flatListRef.current?.scrollToEnd({animated: true}), 100);
  };

  const sendMessage = async () => {
    if (!input.trim() || !activeChannelId || !activeMemberId) return;
    try {
      await appendMessage(activeChannelId, {
        id: uid(),
        channelId: activeChannelId,
        authorId: activeMemberId,
        type: replyTo ? 'reply' : 'text',
        content: input.trim(),
        replyToId: replyTo?.id,
        timestamp: Date.now(),
      });
    } catch (e) {
      reportSaveError(e);
      return;
    }
    setInput('');
    setReplyTo(null);
  };

  const sendMediaMessage = async (channelId: string, authorId: string, base64: string, ext: string, type: 'image' | 'file') => {
    const id = uid();
    const content = await saveChatMedia(id, base64, ext);
    await appendMessage(channelId, {id, channelId, authorId, type, content, timestamp: Date.now()});
  };

  const sendMedia = async () => {
    if (!activeChannelId || !activeMemberId) return;
    try {
      const [res] = await safePick({type: ['*/*']});
      if (!res) return;
      const size = typeof res.size === 'number' ? res.size : 0;
      if (size > MAX_CHAT_FILE_BYTES) { Alert.alert(t('chat.imageFailed'), t('chat.fileTooLarge', {mb: MAX_CHAT_FILE_BYTES >> 20})); return; }
      const ext = (res.name || 'file').split('.').pop()?.toLowerCase() || '';
      const base64 = await readFileBase64(getPickedFilePath(res), res.uri);
      await sendMediaMessage(activeChannelId, activeMemberId, base64, ext, CHAT_IMAGE_EXTS.includes(ext) ? 'image' : 'file');
    } catch (e) {
      if (!isPickerCancel(e)) Alert.alert(t('chat.imageFailed'), errorMessage(e));
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
      await sendMediaMessage(activeChannelId, activeMemberId, img.base64, img.ext, 'image');
    } catch (e) {
      Alert.alert(t('chat.imageFailed'), errorMessage(e));
    }
  };

  const addReaction = async (msgId: string, emoji: string) => {
    if (!activeMemberId || !activeChannelId) return;
    const updated = messagesRef.current.map(m => (m.id === msgId ? toggleReaction(m, emoji, activeMemberId) : m));
    try {
      await saveMessages(activeChannelId, updated);
      setShowEmojiFor(null);
    } catch (e) {
      reportSaveError(e);
    }
  };

  const startEditMessage = (msg: ChatMessage) => {
    if (!isEditableMessage(msg)) return;
    setEditingMessageId(msg.id);
    setInput(msg.content);
    setActionsForMessage(null);
  };

  const cancelEditMessage = () => {
    setEditingMessageId(null);
    setInput('');
  };

  const switchChannel = (id: string | null) => {
    if (id !== activeChannelId) {
      if (editingMessageId) cancelEditMessage();
      setReplyTo(null);
      setShowEmojiFor(null);
      setActionsForMessage(null);
    }
    setActiveChannelId(id);
  };

  const openChannel = (id: string) => {
    switchChannel(id);
    setShowChannelList(false);
  };

  const clearChannelView = (id: string) => {
    if (id !== activeChannelId) return;
    clearMessages();
  };

  const saveEditedMessage = async () => {
    if (!editingMessageId || !activeChannelId) return;
    const next = input.trim();
    if (!next) { cancelEditMessage(); return; }
    const updated = messagesRef.current.map(m => m.id === editingMessageId ? {...m, content: next} : m);
    try {
      await saveMessages(activeChannelId, updated);
      cancelEditMessage();
    } catch (e) {
      reportSaveError(e);
    }
  };

  const deleteMessage = (msg: ChatMessage) => {
    if (!activeChannelId) return;
    setActionsForMessage(null);
    Alert.alert(t('chat.deleteMsg'), t('chat.deleteMsgConfirm'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => {
        saveMessages(activeChannelId, messagesRef.current.filter(m => m.id !== msg.id)).then(() => {
          if (isMedia(msg)) deleteChatMediaFile(msg.content).catch(e => logError('chat', e));
          if (editingMessageId === msg.id) cancelEditMessage();
        }).catch(reportSaveError);
      }},
    ]);
  };

  const pingMessage = async (msg: ChatMessage) => {
    if (!activeChannel) return;
    const speaker = memberMap.get(msg.authorId)?.name || t('common.unknown');
    const preview = msg.type === 'image' ? t('chat.imagePreview')
      : msg.type === 'file' ? `📄 ${getChatMediaFileName(msg.content)}`
      : stripMarkup(msg.content || '');
    await showChatPingNotification(activeChannel.name, speaker, preview);
    setActionsForMessage(null);
    if (Platform.OS === 'ios') Alert.alert(t('chat.pingSent'), t('chat.pingSentMsg'));
  };

  const renderMessage = ({item: msg}: {item: ChatMessage}) => {
    const replyMsg = msg.replyToId ? messageById.get(msg.replyToId) : undefined;
    return (
      <MessageRow
        msg={msg}
        author={memberMap.get(msg.authorId)}
        replyMsg={replyMsg}
        replyAuthor={replyMsg ? memberMap.get(replyMsg.authorId) : undefined}
        members={members}
        activeMemberId={activeMemberId}
        emojiOpen={showEmojiFor === msg.id}
        actionsOpen={actionsForMessage === msg.id}
        onMentionPress={onMentionPress}
        onReply={setReplyTo}
        onToggleEmoji={id => setShowEmojiFor(cur => (cur === id ? null : id))}
        onToggleActions={id => setActionsForMessage(cur => (cur === id ? null : id))}
        onReact={addReaction}
        onEdit={startEditMessage}
        onPing={pingMessage}
        onDelete={deleteMessage}
      />
    );
  };

  if (showChannelList) {
    return <ChannelList activeChannelId={activeChannelId} onOpen={openChannel} onActiveGone={switchChannel} onCleared={clearChannelView} />;
  }

  const editing = !!editingMessageId;
  const canSend = !!input.trim();
  const submit = editing ? saveEditedMessage : sendMessage;
  const composerIcon = (onPress: () => void, label: string, glyph: string) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label} hitSlop={{top: 7, bottom: 7}} style={{padding: 4}}>
      <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(18), color: T.dim}}>{glyph}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{flex: 1, backgroundColor: T.bg, paddingBottom: keyboardLift}}>
      <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border}}>
        <TouchableOpacity onPress={() => setShowChannelList(true)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('chat.channels')} hitSlop={{top: 12, bottom: 12, left: 12, right: 12}} style={{marginRight: 10}}>
          <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(16), color: T.dim}}>☰</Text>
        </TouchableOpacity>
        <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(15), fontWeight: '600', color: T.text}}>#{activeChannel?.name || '?'}</Text>
        <TouchableOpacity onPress={() => setShowMemberPicker(v => !v)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityState={{expanded: showMemberPicker}} accessibilityLabel={t('chat.selectSpeaker')} accessibilityValue={{text: activeMember?.name || ''}}
          hitSlop={{top: 8, bottom: 8}} style={{flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
            backgroundColor: activeMember ? `${activeMember.color}15` : T.surface, borderColor: activeMember ? `${activeMember.color}40` : T.border}}>
          {activeMember && <Avatar member={activeMember} size={18} />}
          <Text style={{fontSize: fs(11), color: activeMember?.color || T.dim, fontWeight: '500'}}>{activeMember?.name || t('chat.selectSpeaker')}</Text>
        </TouchableOpacity>
      </View>

      {showMemberPicker && (
        <View style={{paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: T.surface}}>
          <MemberPicker pools={speakerPools} selected={activeMemberId} onPick={m => {setActiveMemberId(m.id); setShowMemberPicker(false);}}
            variant="chips" chipAvatar maxResults={Infinity} searchLabel={t('chat.searchSpeaker')} orderRows={speakerOrder} />
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
          isAtBottomRef.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < BOTTOM_STICK_PX;
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

      {replyTo && !editing && (
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6, backgroundColor: T.surface, borderTopWidth: 1, borderTopColor: T.border}}>
          <Text style={{fontSize: fs(11), color: T.dim, flex: 1}} numberOfLines={1}>↳ {memberMap.get(replyTo.authorId)?.name}: {previewOf(replyTo)}</Text>
          <TouchableOpacity hitSlop={{top: 12, bottom: 12, left: 10, right: 10}} onPress={() => setReplyTo(null)} accessibilityRole="button" accessibilityLabel={t('common.cancel')}><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(12), color: T.danger}}>✕</Text></TouchableOpacity>
        </View>
      )}
      {editing && (
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6, backgroundColor: `${T.accent}15`, borderTopWidth: 1, borderTopColor: `${T.accent}40`}}>
          <Text style={{fontSize: fs(11), color: T.accent, flex: 1, fontWeight: '500'}} numberOfLines={1}>✎ {t('chat.editingHeader')}</Text>
          <TouchableOpacity hitSlop={{top: 12, bottom: 12, left: 10, right: 10}} onPress={cancelEditMessage} accessibilityRole="button" accessibilityLabel={t('common.cancel')}><Text style={{fontSize: fs(12), color: T.danger}}>{t('common.cancel')}</Text></TouchableOpacity>
        </View>
      )}

      {showFormatBar && <FormatBar onInsert={insertFormat} />}

      <View
        ref={composerRef}
        onLayout={measureComposer}
        style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.surface}}>
        {composerIcon(sendMedia, t('chat.attachFile'), '📎')}
        {composerIcon(sendClipboardImage, t('chat.pasteImage'), '📋')}
        <TouchableOpacity onPress={() => setShowFormatBar(v => !v)} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{expanded: showFormatBar}} accessibilityLabel={t('chat.formatting')} hitSlop={{top: 9, bottom: 9}} style={{padding: 4}}>
          <Text style={{fontSize: fs(14), fontWeight: '700', color: showFormatBar ? T.accent : T.dim}}>Aa</Text>
        </TouchableOpacity>
        <TextInput value={input} onChangeText={setInput} accessibilityLabel={editing ? t('chat.editPlaceholder') : t('chat.typeMessage')} placeholder={editing ? t('chat.editPlaceholder') : t('chat.typeMessage')} placeholderTextColor={T.muted}
          style={{flex: 1, backgroundColor: T.bg, color: T.text, borderWidth: 1, borderColor: editing ? `${T.accent}60` : T.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: fs(14)}}
          onSubmitEditing={submit} returnKeyType={editing ? 'done' : 'send'} />
        <TouchableOpacity onPress={submit} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel={editing ? t('common.save') : t('chat.send')} accessibilityState={{disabled: !editing && !canSend}}
          hitSlop={{top: 4, bottom: 4, left: 4, right: 4}} style={{width: 36, height: 36, borderRadius: 18, backgroundColor: canSend ? T.accent : T.toggleOff, alignItems: 'center', justifyContent: 'center'}}>
          <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(16), color: canSend ? T.bg : T.muted}}>{editing ? '✓' : '↑'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
