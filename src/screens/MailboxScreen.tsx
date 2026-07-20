import React, {useEffect, useState} from 'react';
import {View, ScrollView, TouchableOpacity, Alert, Modal} from 'react-native';
import {KeyboardAvoidingView} from 'react-native-keyboard-controller';
import {Text, TextInput} from '../components/AppText';
import {useKeyboardBehavior} from '../hooks/useKeyboardBehavior';
import {useTranslation} from 'react-i18next';
import {Member, NoteboardEntry, uid, fmtTime, getInitials} from '../utils';
import {fontScale, ThemeColors} from '../theme';
import {useAppStore} from '../store/appStore';
import {saveMember} from '../store/actions';
import {store, KEYS} from '../storage';
import {useKeyboardHeight} from '../hooks/useKeyboardHeight';

interface Props {
  theme: ThemeColors;
  onBack: () => void;
}

export const MailboxScreen = ({theme: T, onBack}: Props) => {
  const kbHeight = useKeyboardHeight();
  const members = useAppStore(s => s.members);
  const onSetMailboxPassword = (memberId: string, password?: string) => {
    const m = members.find(x => x.id === memberId);
    if (m) saveMember({...m, mailboxPassword: password});
  };
  const {t} = useTranslation();
  const fs = fontScale(T);
  const behavior = useKeyboardBehavior();

  const [notes, setNotes] = useState<NoteboardEntry[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const [lockManage, setLockManage] = useState(false);
  const [lockInput, setLockInput] = useState('');
  const [composing, setComposing] = useState(false);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [text, setText] = useState('');

  useEffect(() => {
    store.get<NoteboardEntry[]>(KEYS.noteboards, []).then(n => setNotes(n || []));
  }, []);

  const real = (members || []).filter(m => !m.isCustomFront);
  const active = real.filter(m => !m.archived);
  const byId = (id: string) => (members || []).find(m => m.id === id);

  const save = async (updated: NoteboardEntry[]) => {
    setNotes(updated);
    await store.set(KEYS.noteboards, updated);
  };

  const unreadFor = (id: string) => notes.filter(n => n.memberId === id && n.read !== true).length;
  const latestFor = (id: string) => notes.filter(n => n.memberId === id).reduce((mx, n) => Math.max(mx, n.timestamp), 0);
  const inboxIds = [...new Set(notes.map(n => n.memberId))]
    .filter(id => byId(id))
    .sort((a, b) => (unreadFor(b) > 0 ? 1 : 0) - (unreadFor(a) > 0 ? 1 : 0) || latestFor(b) - latestFor(a));

  const markRead = (id: string) => {
    let changed = false;
    const updated = notes.map(n => {
      if (n.memberId === id && n.read !== true) { changed = true; return {...n, read: true}; }
      return n;
    });
    if (changed) save(updated);
  };

  const openInbox = (id: string) => {
    const m = byId(id);
    if (m?.mailboxPassword && !unlockedIds.has(id)) {
      setPwInput('');
      setPwError(false);
      setPwFor(id);
      return;
    }
    setOpenId(id);
    markRead(id);
  };

  const submitUnlock = () => {
    if (!pwFor) return;
    const m = byId(pwFor);
    if (pwInput === (m?.mailboxPassword || '')) {
      setUnlockedIds(prev => new Set(prev).add(pwFor));
      setOpenId(pwFor);
      markRead(pwFor);
      setPwFor(null);
      setPwInput('');
      setPwError(false);
    } else {
      setPwError(true);
    }
  };

  const submitLock = () => {
    if (!openId || !onSetMailboxPassword) return;
    const owner = byId(openId);
    const next = lockInput.trim();
    if (!next && owner?.mailboxPassword) {
      Alert.alert(t('mailbox.lockTitle'), t('mailbox.removeLockMsg'), [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('common.delete'), style: 'destructive', onPress: () => {
          onSetMailboxPassword(openId, undefined);
          setLockManage(false);
          setLockInput('');
        }},
      ]);
      return;
    }
    if (next) {
      onSetMailboxPassword(openId, next);
      setUnlockedIds(prev => new Set(prev).add(openId));
    }
    setLockManage(false);
    setLockInput('');
  };

  const send = (recipientId: string, senderId: string) => {
    if (!recipientId || !senderId || !text.trim()) return;
    const entry: NoteboardEntry = {
      id: uid(), memberId: recipientId, authorId: senderId,
      content: text.trim(), timestamp: Date.now(), read: senderId === recipientId,
    };
    save([...notes, entry]);
    setText('');
    setComposing(false);
  };

  const del = (id: string) => Alert.alert(t('mailbox.deleteTitle'), t('mailbox.deleteMsg'), [
    {text: t('common.cancel'), style: 'cancel'},
    {text: t('common.delete'), style: 'destructive', onPress: () => save(notes.filter(n => n.id !== id))},
  ]);

  const togglePin = (id: string) => save(notes.map(n => n.id === id ? {...n, pinned: !n.pinned} : n));

  const inboxMsgs = (id: string) => notes.filter(n => n.memberId === id).sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.timestamp - a.timestamp;
  });

  const MemberChips = ({selected, onSelect}: {selected: string; onSelect: (id: string) => void}) => (
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 4}}>
      {active.map(m => (
        <TouchableOpacity key={m.id} onPress={() => onSelect(m.id)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityState={{selected: selected === m.id}} accessibilityLabel={m.name}
          style={{paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
            backgroundColor: selected === m.id ? `${m.color}20` : T.bg,
            borderColor: selected === m.id ? `${m.color}50` : T.border}}>
          <Text style={{fontSize: fs(11), color: selected === m.id ? m.color : T.dim}}>{m.name}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const MessageCard = ({note}: {note: NoteboardEntry}) => {
    const author = byId(note.authorId);
    const unread = note.read !== true;
    return (
      <View style={{backgroundColor: note.pinned ? `${T.accent}10` : T.card, borderRadius: 10, borderWidth: unread ? 2 : 1, borderColor: (unread || note.pinned) ? T.accent : T.border, padding: 12, marginBottom: 8}}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6}}>
          <View style={{width: 22, height: 22, borderRadius: 5, backgroundColor: author?.color || T.muted, alignItems: 'center', justifyContent: 'center'}}>
            <Text style={{fontSize: fs(9), fontWeight: '700', color: 'rgba(0,0,0,0.75)'}}>{getInitials(author?.name || '?')}</Text>
          </View>
          <Text style={{fontSize: fs(12), color: author?.color || T.dim, fontWeight: '500'}}>{author?.name || '?'}</Text>
          {note.pinned && <Text style={{fontSize: fs(10), color: T.accent}}>📌</Text>}
          <Text style={{fontSize: fs(10), color: T.muted, marginLeft: 'auto'}}>{fmtTime(note.timestamp)}</Text>
        </View>
        <Text style={{fontSize: fs(13), color: T.text, lineHeight: 20}}>{note.content}</Text>
        <View style={{flexDirection: 'row', gap: 14, marginTop: 8}}>
          <TouchableOpacity onPress={() => togglePin(note.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={note.pinned ? t('noteboard.unpin') : t('noteboard.pin')}>
            <Text style={{fontSize: fs(11), color: note.pinned ? T.accent : T.dim}}>{note.pinned ? t('noteboard.unpin') : t('noteboard.pin')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => del(note.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.delete')}>
            <Text style={{fontSize: fs(11), color: T.danger}}>{t('common.delete')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (openId) {
    const owner = byId(openId);
    const msgs = inboxMsgs(openId);
    return (
      <KeyboardAvoidingView style={{flex: 1, backgroundColor: T.bg}} behavior={behavior} keyboardVerticalOffset={90}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8}}>
          <TouchableOpacity onPress={() => setOpenId(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{padding: 4, marginRight: 12}}>
            <Text style={{fontSize: fs(18), color: T.dim}}>←</Text>
          </TouchableOpacity>
          <Text accessibilityRole="header" style={{fontSize: fs(18), fontWeight: '600', color: T.text, flex: 1}} numberOfLines={1}>{t('mailbox.inboxOf', {name: owner?.name || '?'})}</Text>
          {!!onSetMailboxPassword && (
            <TouchableOpacity onPress={() => { setLockInput(''); setLockManage(true); }} activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel={t('mailbox.lockTitle')} style={{padding: 6}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Text style={{fontSize: fs(15), color: owner?.mailboxPassword ? T.accent : T.dim}} importantForAccessibility="no">{owner?.mailboxPassword ? '🔒' : '🔓'}</Text>
            </TouchableOpacity>
          )}
        </View>
        <ScrollView style={{flex: 1}} contentContainerStyle={{padding: 16, paddingTop: 4, paddingBottom: 24}} keyboardShouldPersistTaps="handled">
          {msgs.length > 0 ? msgs.map(n => <MessageCard key={n.id} note={n} />) : (
            <View style={{alignItems: 'center', paddingVertical: 40}}>
              <Text style={{fontSize: fs(13), color: T.muted}}>{t('mailbox.emptyInbox')}</Text>
            </View>
          )}
          <View style={{backgroundColor: T.surface, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12, marginTop: 8}}>
            <Text style={{fontSize: fs(11), color: T.dim, marginBottom: 6}}>{t('mailbox.replyFrom', {name: owner?.name || '?'})}</Text>
            <MemberChips selected={fromId} onSelect={setFromId} />
            <View style={{flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginTop: 8}}>
              <TextInput value={text} onChangeText={setText} placeholder={t('mailbox.messagePlaceholder')} placeholderTextColor={T.muted} accessibilityLabel={t('mailbox.messagePlaceholder')} multiline
                style={{flex: 1, backgroundColor: T.bg, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), minHeight: 48, textAlignVertical: 'top'}} />
              <TouchableOpacity onPress={() => send(openId, fromId)} activeOpacity={0.7} disabled={!fromId || !text.trim()}
                accessibilityRole="button" accessibilityLabel={t('mailbox.send')}
                style={{backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 11, opacity: (!fromId || !text.trim()) ? 0.4 : 1}}>
                <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('mailbox.send')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
        <Modal visible={lockManage} transparent animationType="fade" onRequestClose={() => setLockManage(false)}>
          <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 32, paddingBottom: 32 + kbHeight}}>
            <View style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 16}}>
              <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, marginBottom: 6}}>{t('mailbox.lockTitle')}</Text>
              <Text style={{fontSize: fs(12), color: T.dim, marginBottom: 10}}>{t('mailbox.lockHint')}</Text>
              <TextInput value={lockInput} onChangeText={setLockInput} placeholder={t('journal.password')} placeholderTextColor={T.muted} secureTextEntry
                accessibilityLabel={t('journal.password')}
                style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13), marginBottom: 12}} />
              <View style={{flexDirection: 'row', gap: 10}}>
                <TouchableOpacity onPress={() => { setLockManage(false); setLockInput(''); }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
                  style={{flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
                  <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={submitLock} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.save')}
                  style={{flex: 2, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
                  <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{flex: 1, backgroundColor: T.bg}} behavior={behavior} keyboardVerticalOffset={90}>
      <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8}}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{padding: 4, marginRight: 4}}>
          <Text style={{fontSize: fs(18), color: T.dim}}>←</Text>
        </TouchableOpacity>
        <Text accessibilityRole="header" style={{fontSize: fs(20), fontWeight: '600', color: T.text, flex: 1}} numberOfLines={1}>{t('mailbox.title')}</Text>
        <TouchableOpacity onPress={() => {setComposing(c => !c); setToId(''); }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('mailbox.compose')}
          style={{backgroundColor: composing ? T.surface : T.accentBg, borderWidth: 1, borderColor: composing ? T.border : `${T.accent}40`, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7}}>
          <Text style={{fontSize: fs(12), fontWeight: '600', color: composing ? T.dim : T.accent}}>{composing ? t('common.cancel') : `✉ ${t('mailbox.compose')}`}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{flex: 1}} contentContainerStyle={{padding: 16, paddingTop: 4, paddingBottom: 24}} keyboardShouldPersistTaps="handled">
        {composing && (
          <View style={{backgroundColor: T.surface, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12, marginBottom: 16}}>
            <Text style={{fontSize: fs(11), color: T.dim, marginBottom: 6}}>{t('mailbox.from')}</Text>
            <MemberChips selected={fromId} onSelect={setFromId} />
            <Text style={{fontSize: fs(11), color: T.dim, marginTop: 10, marginBottom: 6}}>{t('mailbox.to')}</Text>
            <MemberChips selected={toId} onSelect={setToId} />
            <TextInput value={text} onChangeText={setText} placeholder={t('mailbox.messagePlaceholder')} placeholderTextColor={T.muted} accessibilityLabel={t('mailbox.messagePlaceholder')} multiline
              style={{backgroundColor: T.bg, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), minHeight: 56, textAlignVertical: 'top', marginTop: 10}} />
            <TouchableOpacity onPress={() => send(toId, fromId)} activeOpacity={0.7} disabled={!fromId || !toId || !text.trim()}
              accessibilityRole="button" accessibilityLabel={t('mailbox.send')}
              style={{backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingVertical: 11, alignItems: 'center', marginTop: 10, opacity: (!fromId || !toId || !text.trim()) ? 0.4 : 1}}>
              <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('mailbox.send')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {inboxIds.length > 0 ? inboxIds.map(id => {
          const m = byId(id);
          const unread = unreadFor(id);
          const count = notes.filter(n => n.memberId === id).length;
          return (
            <TouchableOpacity key={id} onPress={() => openInbox(id)} activeOpacity={0.7} accessibilityRole="button"
              accessibilityLabel={`${m?.name || '?'}. ${t('mailbox.messageCount', {count})}.${unread > 0 ? ` ${t('mailbox.unreadCount', {count: unread})}` : ''}`}
              style={{flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: unread > 0 ? T.accent : T.border, padding: 12, marginBottom: 8}}>
              <View style={{width: 36, height: 36, borderRadius: 8, backgroundColor: m?.color || T.muted, alignItems: 'center', justifyContent: 'center'}}>
                <Text style={{fontSize: fs(13), fontWeight: '700', color: 'rgba(0,0,0,0.75)'}}>{getInitials(m?.name || '?')}</Text>
              </View>
              <View style={{flex: 1}}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                  <Text style={{fontSize: fs(14), fontWeight: '600', color: T.text, flexShrink: 1}} numberOfLines={1}>{m?.name || '?'}</Text>
                  {!!m?.mailboxPassword && <Text style={{fontSize: fs(11)}} importantForAccessibility="no">🔒</Text>}
                </View>
                <Text style={{fontSize: fs(11), color: T.muted}}>{t('mailbox.messageCount', {count})}</Text>
              </View>
              {unread > 0 && (
                <View style={{minWidth: 22, height: 22, borderRadius: 11, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6}}>
                  <Text style={{fontSize: fs(11), fontWeight: '700', color: 'rgba(0,0,0,0.8)'}}>{unread}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }) : (
          <View style={{alignItems: 'center', paddingVertical: 56}}>
            <Text style={{fontSize: fs(32), opacity: 0.3, marginBottom: 10}}>✉</Text>
            <Text style={{fontSize: fs(13), color: T.muted, textAlign: 'center'}}>{t('mailbox.empty')}</Text>
          </View>
        )}
      </ScrollView>
      <Modal visible={!!pwFor} transparent animationType="fade" onRequestClose={() => setPwFor(null)}>
        <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 32, paddingBottom: 32 + kbHeight}}>
          <View style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 16}}>
            <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, marginBottom: 6}}>
              {`🔒 ${byId(pwFor || '')?.name || '?'}`}
            </Text>
            <Text style={{fontSize: fs(12), color: T.dim, marginBottom: 10}}>{t('mailbox.lockedPrompt')}</Text>
            <TextInput value={pwInput} onChangeText={v => { setPwInput(v); setPwError(false); }} placeholder={t('journal.password')} placeholderTextColor={T.muted} secureTextEntry
              accessibilityLabel={t('journal.password')} onSubmitEditing={submitUnlock}
              style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: pwError ? T.danger : T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13), marginBottom: 8}} />
            {pwError && <Text style={{fontSize: fs(12), color: T.danger, marginBottom: 8}} accessibilityRole="alert">{t('journal.incorrectPassword')}</Text>}
            <View style={{flexDirection: 'row', gap: 10}}>
              <TouchableOpacity onPress={() => { setPwFor(null); setPwInput(''); setPwError(false); }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
                style={{flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
                <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitUnlock} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('journal.unlock')}
                style={{flex: 2, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
                <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('journal.unlock')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};
