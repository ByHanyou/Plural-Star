import React, {useCallback, useEffect, useState} from 'react';
import {View, TouchableOpacity, Alert, AccessibilityInfo} from 'react-native';
import {KeyboardAwareScrollView} from 'react-native-keyboard-controller';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Member, NoteboardEntry, fmtTime, getInitials, activeRosterAndFacets} from '../utils';
import {fontScale, initialOn} from '../theme';
import {useTheme} from '../themeContext';
import {useAppStore} from '../store/appStore';
import {saveMember} from '../store/actions';
import {store, KEYS} from '../storage';
import {NetworkManager} from '../network/NetworkManager';
import {PasswordDialog} from '../components/PasswordDialog';
import {sectionLabel} from '../components/controls';
import {BackHeader} from '../components/BackHeader';
import {reportSaveError} from '../utils/saveError';
import {logError} from '../utils/log';
import {ALL_RECIPIENTS, composeMail, inboxMessages, inboxSummaries, mailRecipients, markInboxRead, removeNote, toggleNotePinned} from '../mailbox/mailbox';

interface Props {
  onBack: () => void;
}

export const MailboxScreen = ({onBack}: Props) => {
  const T = useTheme();
  const members = useAppStore(s => s.members);
  const {t} = useTranslation();
  const fs = fontScale(T);

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

  const load = useCallback(() => { store.get<NoteboardEntry[]>(KEYS.noteboards, []).then(n => setNotes(n || [])).catch(e => logError('mailbox', e)); }, []);

  useEffect(() => {
    load();
    return NetworkManager.onSyncApplied(load);
  }, [load]);

  const {members: active, facets: activeFacets} = activeRosterAndFacets(members);
  const byId = (id: string) => members.find(m => m.id === id && !m.deleted);

  const save = (updated: NoteboardEntry[]) => {
    setNotes(updated);
    store.set(KEYS.noteboards, updated).catch((e: unknown) => { reportSaveError(e); load(); });
  };

  const setMailboxPassword = async (memberId: string, password?: string): Promise<boolean> => {
    const m = members.find(x => x.id === memberId);
    if (!m) return false;
    try {
      await saveMember({...m, mailboxPassword: password});
      return true;
    } catch (e) {
      reportSaveError(e);
      return false;
    }
  };

  const inbox = inboxSummaries(notes)
    .filter(s => byId(s.id))
    .sort((a, b) => (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0) || b.latest - a.latest);

  const markRead = (id: string) => {
    const updated = markInboxRead(notes, id);
    if (updated) save(updated);
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
      AccessibilityInfo.announceForAccessibility(t('journal.incorrectPassword'));
    }
  };

  const closeLock = () => {
    setLockManage(false);
    setLockInput('');
  };

  const submitLock = async () => {
    if (!openId) return;
    const owner = byId(openId);
    const next = lockInput.trim();
    if (!next && owner?.mailboxPassword) {
      Alert.alert(t('mailbox.lockTitle'), t('mailbox.removeLockMsg'), [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('common.delete'), style: 'destructive', onPress: () => { setMailboxPassword(openId, undefined).then(ok => { if (ok) closeLock(); }); }},
      ]);
      return;
    }
    if (next) {
      if (!(await setMailboxPassword(openId, next))) return;
      setUnlockedIds(prev => new Set(prev).add(openId));
    }
    closeLock();
  };

  const send = (recipientId: string, senderId: string) => {
    if (!recipientId || !senderId || !text.trim()) return;
    const targets = mailRecipients(recipientId, senderId, active);
    if (targets.length === 0) return;
    save([...notes, ...composeMail(targets, senderId, text.trim())]);
    setText('');
    setComposing(false);
  };

  const del = (id: string) => Alert.alert(t('mailbox.deleteTitle'), t('mailbox.deleteMsg'), [
    {text: t('common.cancel'), style: 'cancel'},
    {text: t('common.delete'), style: 'destructive', onPress: () => save(removeNote(notes, id))},
  ]);

  const togglePin = (id: string) => save(toggleNotePinned(notes, id));

  if (openId) {
    const owner = byId(openId);
    const msgs = inboxMessages(notes, openId);
    return (
      <View style={{flex: 1, backgroundColor: T.bg}}>
        <BackHeader title={t('mailbox.inboxOf', {name: owner?.name || '?'})} titleSize={18} onBack={() => setOpenId(null)} right={
          <TouchableOpacity onPress={() => { setLockInput(''); setLockManage(true); }} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel={t('mailbox.lockTitle')} accessibilityValue={{text: owner?.mailboxPassword ? t('mailbox.locked') : t('mailbox.unlocked')}} style={{padding: 6}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Text style={{fontSize: fs(15), color: owner?.mailboxPassword ? T.accent : T.dim}} accessibilityElementsHidden importantForAccessibility="no">{owner?.mailboxPassword ? '🔒' : '🔓'}</Text>
          </TouchableOpacity>
        } />
        <KeyboardAwareScrollView style={{flex: 1}} contentContainerStyle={{padding: 16, paddingTop: 4, paddingBottom: 24}} keyboardShouldPersistTaps="handled" bottomOffset={24}>
          {msgs.length > 0 ? msgs.map(n => <MessageCard key={n.id} note={n} author={byId(n.authorId)} onTogglePin={togglePin} onDelete={del} />) : (
            <View style={{alignItems: 'center', paddingVertical: 40}}>
              <Text style={{fontSize: fs(13), color: T.muted}}>{t('mailbox.emptyInbox')}</Text>
            </View>
          )}
          <View style={{backgroundColor: T.surface, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12, marginTop: 8}}>
            <Text accessibilityRole="header" style={{fontSize: fs(11), color: T.dim, marginBottom: 6}}>{t('mailbox.replyFrom', {name: owner?.name || '?'})}</Text>
            <MemberChips active={active} activeFacets={activeFacets} selected={fromId} onSelect={setFromId} />
            <View style={{flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginTop: 8}}>
              <TextInput value={text} onChangeText={setText} placeholder={t('mailbox.messagePlaceholder')} placeholderTextColor={T.muted} accessibilityLabel={t('mailbox.messagePlaceholder')} multiline
                style={{flex: 1, backgroundColor: T.bg, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), minHeight: 48, textAlignVertical: 'top'}} />
              <TouchableOpacity onPress={() => send(openId, fromId)} activeOpacity={0.7} disabled={!fromId || !text.trim()}
                accessibilityRole="button" accessibilityLabel={t('mailbox.send')} accessibilityState={{disabled: !fromId || !text.trim()}}
                hitSlop={{top: 6, bottom: 6}} style={{backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 11, opacity: (!fromId || !text.trim()) ? 0.4 : 1}}>
                <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('mailbox.send')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAwareScrollView>
        <PasswordDialog visible={lockManage} title={t('mailbox.lockTitle')} hint={t('mailbox.lockHint')} value={lockInput} onChange={setLockInput}
          submitLabel={t('common.save')} onSubmit={submitLock} onCancel={closeLock} />
      </View>
    );
  }

  return (
    <View style={{flex: 1, backgroundColor: T.bg}}>
      <BackHeader title={t('mailbox.title')} onBack={onBack} right={
        <TouchableOpacity onPress={() => {setComposing(c => !c); setToId(''); }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={composing ? t('common.cancel') : t('mailbox.compose')} accessibilityState={{expanded: composing}}
          hitSlop={{top: 8, bottom: 8}} style={{backgroundColor: composing ? T.surface : T.accentBg, borderWidth: 1, borderColor: composing ? T.border : `${T.accent}40`, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7}}>
          <Text style={{fontSize: fs(12), fontWeight: '600', color: composing ? T.dim : T.accent}}>{composing ? t('common.cancel') : `✉ ${t('mailbox.compose')}`}</Text>
        </TouchableOpacity>
      } />
      <KeyboardAwareScrollView style={{flex: 1}} contentContainerStyle={{padding: 16, paddingTop: 4, paddingBottom: 24}} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        {composing && (
          <View style={{backgroundColor: T.surface, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 12, marginBottom: 16}}>
            <Text accessibilityRole="header" style={{fontSize: fs(11), color: T.dim, marginBottom: 6}}>{t('mailbox.from')}</Text>
            <MemberChips active={active} activeFacets={activeFacets} selected={fromId} onSelect={setFromId} />
            <Text accessibilityRole="header" style={{fontSize: fs(11), color: T.dim, marginTop: 10, marginBottom: 6}}>{t('mailbox.to')}</Text>
            <MemberChips active={active} activeFacets={activeFacets} selected={toId} onSelect={setToId} allowAll excludeId={fromId} />
            <TextInput value={text} onChangeText={setText} placeholder={t('mailbox.messagePlaceholder')} placeholderTextColor={T.muted} accessibilityLabel={t('mailbox.messagePlaceholder')} multiline
              style={{backgroundColor: T.bg, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), minHeight: 56, textAlignVertical: 'top', marginTop: 10}} />
            <TouchableOpacity onPress={() => send(toId, fromId)} activeOpacity={0.7} disabled={!fromId || !toId || !text.trim()}
              accessibilityRole="button" accessibilityLabel={t('mailbox.send')} accessibilityState={{disabled: !fromId || !toId || !text.trim()}}
              hitSlop={{top: 6, bottom: 6}} style={{backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingVertical: 11, alignItems: 'center', marginTop: 10, opacity: (!fromId || !toId || !text.trim()) ? 0.4 : 1}}>
              <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('mailbox.send')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {inbox.length > 0 ? inbox.map(({id, unread, count}) => {
          const m = byId(id);
          return (
            <TouchableOpacity key={id} onPress={() => openInbox(id)} activeOpacity={0.7} accessibilityRole="button"
              accessibilityLabel={[m?.name || '?', t('mailbox.messageCount', {count}), unread > 0 ? t('mailbox.unreadCount', {count: unread}) : null, m?.mailboxPassword ? t('mailbox.locked') : null].filter(Boolean).join(', ')}
              style={{flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: unread > 0 ? T.accent : T.border, padding: 12, marginBottom: 8}}>
              <View style={{width: 36, height: 36, borderRadius: 8, backgroundColor: m?.color || T.muted, alignItems: 'center', justifyContent: 'center'}}>
                <Text style={{fontSize: fs(13), fontWeight: '700', color: initialOn(m?.color || T.muted), includeFontPadding: false, textAlign: 'center', textAlignVertical: 'center'}}>{getInitials(m?.name || '?')}</Text>
              </View>
              <View style={{flex: 1}}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                  <Text style={{fontSize: fs(14), fontWeight: '600', color: T.text, flexShrink: 1}} numberOfLines={1}>{m?.name || '?'}</Text>
                  {!!m?.mailboxPassword && <Text style={{fontSize: fs(11)}} accessibilityElementsHidden importantForAccessibility="no">🔒</Text>}
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
            <Text style={{fontSize: fs(32), opacity: 0.3, marginBottom: 10}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✉</Text>
            <Text style={{fontSize: fs(13), color: T.muted, textAlign: 'center'}}>{t('mailbox.empty')}</Text>
          </View>
        )}
      </KeyboardAwareScrollView>
      <PasswordDialog visible={!!pwFor} title={`🔒 ${byId(pwFor || '')?.name || '?'}`} hint={t('mailbox.lockedPrompt')} value={pwInput} onChange={v => { setPwInput(v); setPwError(false); }}
        submitLabel={t('journal.unlock')} onSubmit={submitUnlock} submitOnEnter error={pwError} onCancel={() => { setPwFor(null); setPwInput(''); setPwError(false); }} />
    </View>
  );
};

function MemberChips({selected, onSelect, allowAll = false, excludeId, active, activeFacets}: {selected: string; onSelect: (id: string) => void; allowAll?: boolean; excludeId?: string; active: Member[]; activeFacets: Member[]}) {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const allLabel = t('mailbox.allOthersCount', {count: active.filter(m => m.id !== excludeId).length});
  const chip = (m: Member) => (
    <TouchableOpacity key={m.id} onPress={() => onSelect(m.id)} activeOpacity={0.7}
      accessibilityRole="button" accessibilityState={{selected: selected === m.id}} accessibilityLabel={m.name}
      hitSlop={{top: 4, bottom: 10}} style={{paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
        backgroundColor: selected === m.id ? `${m.color}20` : T.bg,
        borderColor: selected === m.id ? `${m.color}50` : T.border}}>
      <Text style={{fontSize: fs(11), color: selected === m.id ? m.color : T.dim}}>{m.name}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 4}}>
      {allowAll && active.length > 0 && (
        <TouchableOpacity onPress={() => onSelect(ALL_RECIPIENTS)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityState={{selected: selected === ALL_RECIPIENTS}} accessibilityLabel={allLabel}
          hitSlop={{top: 4, bottom: 10}} style={{paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
            backgroundColor: selected === ALL_RECIPIENTS ? `${T.accent}20` : T.bg,
            borderColor: selected === ALL_RECIPIENTS ? `${T.accent}50` : T.border}}>
          <Text style={{fontSize: fs(11), fontWeight: '600', color: selected === ALL_RECIPIENTS ? T.accent : T.dim}}>{allLabel}</Text>
        </TouchableOpacity>
      )}
      {active.length > 0 && (
        <Text accessibilityRole="header" style={sectionLabel(T, {width: '100%', fontSize: fs(9)})}>{t('members.title')}</Text>
      )}
      {active.map(chip)}
      {activeFacets.length > 0 && (
        <>
          <Text accessibilityRole="header" style={sectionLabel(T, {width: '100%', fontSize: fs(9), marginTop: 6})}>{t('members.facets')}</Text>
          {activeFacets.map(chip)}
        </>
      )}
    </View>
  );
}

function MessageCard({note, author, onTogglePin, onDelete}: {note: NoteboardEntry; author: Member | undefined; onTogglePin: (id: string) => void; onDelete: (id: string) => void}) {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const unread = note.read !== true;
  return (
    <View style={{backgroundColor: note.pinned ? `${T.accent}10` : T.card, borderRadius: 10, borderWidth: unread ? 2 : 1, borderColor: (unread || note.pinned) ? T.accent : T.border, padding: 12, marginBottom: 8}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6}}>
        <View style={{width: 22, height: 22, borderRadius: 5, backgroundColor: author?.color || T.muted, alignItems: 'center', justifyContent: 'center'}}>
          <Text style={{fontSize: fs(9), fontWeight: '700', color: initialOn(author?.color || T.muted), includeFontPadding: false, textAlign: 'center', textAlignVertical: 'center'}}>{getInitials(author?.name || '?')}</Text>
        </View>
        <Text style={{fontSize: fs(12), color: author?.color || T.dim, fontWeight: '500'}} accessibilityLabel={unread ? [author?.name || '?', t('mailbox.unread')].join(', ') : undefined}>{author?.name || '?'}</Text>
        {note.pinned && <Text style={{fontSize: fs(10), color: T.accent}} accessibilityLabel={t('noteboard.pinned')}>📌</Text>}
        <Text style={{fontSize: fs(10), color: T.muted, marginLeft: 'auto'}}>{fmtTime(note.timestamp)}</Text>
      </View>
      <Text style={{fontSize: fs(13), color: T.text, lineHeight: fs(20)}}>{note.content}</Text>
      <View style={{flexDirection: 'row', gap: 14, marginTop: 8}}>
        <TouchableOpacity hitSlop={{top: 12, bottom: 12, left: 6, right: 6}} onPress={() => onTogglePin(note.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={note.pinned ? t('noteboard.unpin') : t('noteboard.pin')}>
          <Text style={{fontSize: fs(11), color: note.pinned ? T.accent : T.dim}}>{note.pinned ? t('noteboard.unpin') : t('noteboard.pin')}</Text>
        </TouchableOpacity>
        <TouchableOpacity hitSlop={{top: 12, bottom: 12, left: 6, right: 6}} onPress={() => onDelete(note.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('mailbox.deleteFrom', {name: author?.name || '?'})}>
          <Text style={{fontSize: fs(11), color: T.danger}}>{t('common.delete')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
