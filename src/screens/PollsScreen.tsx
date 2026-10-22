import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {View, ScrollView, TouchableOpacity, Alert} from 'react-native';
import {KeyboardAvoidingView} from 'react-native-keyboard-controller';
import {Text, TextInput} from '../components/AppText';
import {MemberPicker} from '../components/MemberPicker';
import {memberFacetPools} from '../picker/memberPicker';
import {useKeyboardBehavior} from '../hooks/useKeyboardBehavior';
import {useTranslation} from 'react-i18next';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {useAppStore} from '../store/appStore';
import {MemberPoll, fmtTime, fmtPercent, fmtList} from '../utils';
import {store, KEYS} from '../storage';
import {NetworkManager} from '../network/NetworkManager';
import {reportSaveError} from '../utils/saveError';
import {logError} from '../utils/log';
import {castPollVote, createPoll, defaultVoterId, pollOptionPercent, pollVoterCount, togglePollClosed} from '../polls/polls';
import type {PollDraft} from '../polls/polls';

type NewPoll = Omit<PollDraft, 'targetId' | 'createdBy'>;

const BLANK_POLL: NewPoll = {question: '', options: ['', ''], hideVoters: false, multiChoice: false};

export const PollsScreen = () => {
  const T = useTheme();
  const members = useAppStore(s => s.members);
  const front = useAppStore(s => s.front);
  const {t} = useTranslation();
  const fs = fontScale(T);
  const behavior = useKeyboardBehavior();
  const voterPools = useMemo(() => memberFacetPools(members, t), [members, t]);
  const [polls, setPolls] = useState<MemberPoll[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<NewPoll>(BLANK_POLL);
  const patch = (p: Partial<NewPoll>) => setDraft(d => ({...d, ...p}));
  const {question, options, hideVoters, multiChoice} = draft;
  const [voterId, setVoterId] = useState(() => defaultVoterId(members, front));
  const [voterPickerOpen, setVoterPickerOpen] = useState(false);

  const load = useCallback(() => { store.get<MemberPoll[]>(KEYS.polls, []).then(p => setPolls(p || [])).catch(e => logError('polls', e)); }, []);

  useEffect(() => {
    load();
    return NetworkManager.onSyncApplied(load);
  }, [load]);

  const savePolls = (updated: MemberPoll[]) => {
    setPolls(updated);
    store.set(KEYS.polls, updated).catch((e: unknown) => { reportSaveError(e); load(); });
  };

  const addPoll = () => {
    const poll = createPoll({...draft, targetId: voterId, createdBy: voterId});
    if (!poll) { Alert.alert(t('polls.incomplete')); return; }
    savePolls([...polls, poll]);
    setShowCreate(false);
    setDraft(BLANK_POLL);
  };

  const checkRow = (on: boolean, onPress: () => void, label: string, marginBottom = 0) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="checkbox" accessibilityState={{checked: on}} accessibilityLabel={label} hitSlop={{top: 6, bottom: 12}} style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom}}>
      <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(16), color: on ? T.accent : T.muted}}>{on ? '☑' : '☐'}</Text>
      <Text style={{fontSize: fs(12), color: T.dim}}>{label}</Text>
    </TouchableOpacity>
  );

  const vote = (pollId: string, optionId: string) => {
    if (!voterId) return;
    savePolls(polls.map(p => (p.id === pollId ? castPollVote(p, optionId, voterId) : p)));
  };

  const toggleClose = (pollId: string) => savePolls(polls.map(p => (p.id === pollId ? togglePollClosed(p) : p)));

  const deletePoll = (id: string) => {
    Alert.alert(t('polls.deletePoll'), t('polls.deletePollMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => savePolls(polls.filter(p => p.id !== id))},
    ]);
  };

  const getName = (id: string) => members.find(m => m.id === id)?.name || '?';

  return (
    <KeyboardAvoidingView style={{flex: 1}} behavior={behavior}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10}}>
        <Text style={{fontSize: fs(11), color: T.dim}}>{t('polls.votingAs')}</Text>
        <TouchableOpacity onPress={() => setVoterPickerOpen(!voterPickerOpen)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityState={{expanded: voterPickerOpen}} accessibilityLabel={t('polls.votingAs')} accessibilityValue={{text: getName(voterId)}}
          hitSlop={{top: 9, bottom: 9}} style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6}}>
          <Text style={{fontSize: fs(12), color: T.text}}>{getName(voterId)} ▾</Text>
        </TouchableOpacity>
        <View style={{flex: 1}} />
        <TouchableOpacity onPress={() => setShowCreate(!showCreate)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityState={{expanded: showCreate}} accessibilityLabel={t('polls.createPoll')}
          hitSlop={{top: 7, bottom: 7}} style={{backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8}}>
          <Text style={{fontSize: fs(12), fontWeight: '600', color: T.accent}}>{t('polls.createPoll')}</Text>
        </TouchableOpacity>
      </View>

      {voterPickerOpen && (
        <View style={{marginHorizontal: 16, marginBottom: 8}}>
          <MemberPicker pools={voterPools} selected={voterId} onPick={m => {setVoterId(m.id); setVoterPickerOpen(false);}}
            autoFocus maxResults={Infinity} listMaxHeight={220} />
        </View>
      )}

      {showCreate && (
        <View style={{marginHorizontal: 16, marginBottom: 12, backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 14}}>
          <TextInput value={question} onChangeText={v => patch({question: v})} accessibilityLabel={t('polls.questionPlaceholder')} placeholder={t('polls.questionPlaceholder')} placeholderTextColor={T.muted}
            style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(14), marginBottom: 10}} />
          {options.map((opt, i) => (
            <View key={i} style={{flexDirection: 'row', gap: 6, marginBottom: 6, alignItems: 'center'}}>
              <TextInput value={opt} onChangeText={v => patch({options: options.map((o, j) => (j === i ? v : o))})}
                accessibilityLabel={t('polls.optionN', {n: i + 1})} placeholder={t('polls.optionN', {n: i + 1})} placeholderTextColor={T.muted}
                style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: fs(13)}} />
              {options.length > 2 && (
                <TouchableOpacity hitSlop={{top: 6, bottom: 12, left: 6, right: 12}} onPress={() => patch({options: options.filter((_, j) => j !== i)})} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('polls.removeOptionN', {n: i + 1})}>
                  <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(14), color: T.danger}}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          <TouchableOpacity onPress={() => patch({options: [...options, '']})} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('polls.addOption')} hitSlop={{top: 6, bottom: 9}} style={{paddingVertical: 6}}>
            <Text style={{fontSize: fs(12), color: T.accent}}>{t('polls.addOption')}</Text>
          </TouchableOpacity>
          {checkRow(multiChoice, () => patch({multiChoice: !multiChoice}), t('polls.multipleChoice'))}
          {checkRow(hideVoters, () => patch({hideVoters: !hideVoters}), t('polls.hideVoters'), 10)}
          <TouchableOpacity onPress={addPoll} activeOpacity={0.7} accessibilityRole="button"
            hitSlop={{top: 6, bottom: 6}} style={{backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingVertical: 10, alignItems: 'center'}}>
            <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('common.add')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={{flex: 1}} contentContainerStyle={{padding: 16, paddingTop: 0}}>
        {polls.length === 0 ? (
          <View style={{alignItems: 'center', paddingVertical: 48}}>
            <Text style={{fontSize: fs(13), color: T.dim}}>{t('polls.noPolls')}</Text>
          </View>
        ) : polls.map(poll => {
          const voterCount = pollVoterCount(poll);
          const isClosed = !!poll.closedAt;
          return (
            <View key={poll.id} style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 10}}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6}}>
                <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(15), fontWeight: '600', color: T.text}}>{poll.question}</Text>
                {isClosed && <Text style={{fontSize: fs(10), color: T.danger, fontWeight: '600', textTransform: 'uppercase'}}>{t('polls.closed')}</Text>}
              </View>
              <Text style={{fontSize: fs(11), color: T.muted, marginBottom: 10}}>
                {poll.hideVoterNames ? '' : `${getName(poll.createdBy)} · `}{fmtTime(poll.createdAt)} · {t('polls.votes', {count: voterCount})}{poll.multipleChoice ? ` · ${t('polls.multipleChoice')}` : ''}
              </Text>

              {poll.options.map(opt => {
                const pct = pollOptionPercent(opt.votes.length, voterCount);
                const voted = opt.votes.includes(voterId);
                return (
                  <TouchableOpacity key={opt.id} onPress={() => !isClosed && vote(poll.id, opt.id)} activeOpacity={isClosed ? 1 : 0.7}
                    accessibilityRole={poll.multipleChoice ? 'checkbox' : 'button'} accessibilityLabel={`${opt.label}, ${fmtPercent(pct / 100, 0)}`}
                    accessibilityState={poll.multipleChoice ? {checked: voted, disabled: isClosed} : {selected: voted, disabled: isClosed}}
                    hitSlop={{top: 6, bottom: 6}} style={{borderRadius: 8, borderWidth: 1, borderColor: voted ? T.accent : T.border, backgroundColor: T.surface, marginBottom: 6, overflow: 'hidden'}}>
                    <View style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, backgroundColor: voted ? `${T.accent}55` : `${T.muted}45`}} />
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10}}>
                      <Text style={{fontSize: fs(13), color: voted ? T.accent : T.text, fontWeight: voted ? '600' : '400'}}>{opt.label}</Text>
                      <Text style={{fontSize: fs(12), color: T.muted}}>{fmtPercent(pct / 100, 0)}</Text>
                    </View>
                    {!poll.hideVoterNames && opt.votes.length > 0 && (
                      <Text style={{fontSize: fs(10), color: T.muted, paddingHorizontal: 12, paddingBottom: 6}}>{fmtList(opt.votes.map(getName))}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}

              <View style={{flexDirection: 'row', gap: 12, marginTop: 6}}>
                <TouchableOpacity hitSlop={{top: 12, bottom: 12, left: 6, right: 6}} onPress={() => toggleClose(poll.id)} activeOpacity={0.7} accessibilityRole="button">
                  <Text style={{fontSize: fs(11), color: T.accent}}>{isClosed ? t('polls.reopenPoll') : t('polls.closePoll')}</Text>
                </TouchableOpacity>
                <TouchableOpacity hitSlop={{top: 12, bottom: 12, left: 6, right: 6}} onPress={() => deletePoll(poll.id)} activeOpacity={0.7} accessibilityRole="button">
                  <Text style={{fontSize: fs(11), color: T.danger}}>{t('polls.deletePoll')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};
