import {useCallback, useEffect, useRef, useState} from 'react';
import {ChatMessage} from '../utils';
import {store, chatMsgKey} from '../storage';
import {NetworkManager} from '../network/NetworkManager';
import {logError} from '../utils/log';

export const useChannelMessages = (activeChannelId: string | null) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const loadMessages = useCallback((channelId: string) => {
    store.get<ChatMessage[]>(chatMsgKey(channelId), []).then(msgs => setMessages(msgs || [])).catch(e => logError('chat', e));
  }, []);

  useEffect(() => {
    if (activeChannelId) loadMessages(activeChannelId);
  }, [activeChannelId, loadMessages]);

  useEffect(() => NetworkManager.onSyncApplied(() => {
    if (activeChannelId) loadMessages(activeChannelId);
  }), [activeChannelId, loadMessages]);

  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  const saveMessages = async (channelId: string, msgs: ChatMessage[]) => {
    const prev = messagesRef.current;
    messagesRef.current = msgs;
    setMessages(msgs);
    try {
      await store.set(chatMsgKey(channelId), msgs);
    } catch (e) {
      if (messagesRef.current === msgs) { messagesRef.current = prev; setMessages(prev); }
      throw e;
    }
  };

  const clearMessages = () => {
    messagesRef.current = [];
    setMessages([]);
  };

  return {messages, messagesRef, saveMessages, clearMessages};
};
