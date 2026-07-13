import React, {useState, useEffect} from 'react';
import {View, ScrollView, TouchableOpacity, Alert} from 'react-native';
import {KeyboardAvoidingView} from 'react-native-keyboard-controller';
import {Text, TextInput} from '../components/AppText';
import {useKeyboardBehavior} from '../hooks/useKeyboardBehavior';
import {useTranslation} from 'react-i18next';
import {Fonts, fontScale, ThemeColors} from '../theme';
import {useAppStore} from '../store/appStore';
import {Member, MemberPoll, PollOption, uid, fmtTime, sortMembersBySearch} from '../utils';
import {store, KEYS} from '../storage';

interface Props {
  theme: ThemeColors;
}

export const PollsScreen = ({theme: T}: Props) => {
  const members = useAppStore(s => s.members);
  const {t} = useTranslation();
  const fs = fontScale(T);
  const behavior = useKeyboardBehavior();
  const activeMembers = members.filter(m => !m.archived && !m.isCustomFront);
  const [polls, setPolls] = useState<MemberPoll[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [hideVoters, setHideVoters] = useState(false);
  const [voterId, setVoterId] = useState(activeMembers[0]?.id || '');
  const [voterPickerOpen, setVoterPickerOpen] = useState(false);
  const [voterSearch, setVoterSearch] = useState('');

  useEffect(() => {
    store.get<MemberPoll[]>(KEYS.polls, []).then(p => setPolls(p || []));
  }, []);

  const savePolls = async (updated: MemberPoll[]) => {
    setPolls(updated);
    await store.set(KEYS.polls, updated);
  };

  const createPoll = () => {
    if (!question.trim() || options.filter(o => o.trim()).length < 2) return;
    const poll: MemberPoll = {
      id: uid(), targetMemberId: voterId, question: question.trim(),
      options: options.filter(o => o.trim()).map(o => ({id: uid(), label: o.trim(), votes: []})),
      createdBy: voterId, createdAt: Date.now(), hideVoterNames: hideVoters || undefined,
    };
    savePolls([...polls, poll]);
    setShowCreate(false); setQuestion(''); setOptions(['', '']); setHideVoters(false);
  };

  const vote = (pollId: string, optionId: string) => {
    if (!voterId) return;
    savePolls(polls.map(p => {
      if (p.id !== pollId) return p;
      const opts = p.options.map(o => {
        const without = o.votes.filter(v => v !== voterId);
        return o.id === optionId ? {...o, votes: [...without, voterId]} : {...o, votes: without};
      });
      return {...p, options: opts};
    }));
  };

  const toggleClose = (pollId: string) => savePolls(polls.map(p => p.id === pollId ? {...p, closedAt: p.closedAt ? undefined : Date.now()} : p));

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
          style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6}}>
          <Text style={{fontSize: fs(12), color: T.text}}>{getName(voterId)} ▾</Text>
        </TouchableOpacity>
        <View style={{flex: 1}} />
        <TouchableOpacity onPress={() => setShowCreate(!showCreate)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityState={{expanded: showCreate}} accessibilityLabel={t('polls.createPoll')}
          style={{backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8}}>
          <Text style={{fontSize: fs(12), fontWeight: '600', color: T.accent}}>{t('polls.createPoll')}</Text>
        </TouchableOpacity>
      </View>

      {voterPickerOpen && (
        <View style={{marginHorizontal: 16, backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, marginBottom: 8}}>
          <TextInput
            value={voterSearch}
            onChangeText={setVoterSearch}
            placeholder={t('common.search') || 'Search…'}
            placeholderTextColor={T.muted}
            autoFocus
            style={{
              backgroundColor: T.surface, color: T.text, fontSize: fs(13),
              paddingHorizontal: 12, paddingVertical: 8,
              borderBottomWidth: 1, borderBottomColor: T.border,
              borderTopLeftRadius: 10, borderTopRightRadius: 10,
            }}
          />
          <ScrollView style={{maxHeight: 220}} keyboardShouldPersistTaps="handled">
            {sortMembersBySearch(activeMembers.filter(m => !voterSearch.trim() || m.name.toLowerCase().includes(voterSearch.trim().toLowerCase())), voterSearch.trim())
              .map(m => (
                <TouchableOpacity key={m.id} onPress={() => {setVoterId(m.id); setVoterPickerOpen(false); setVoterSearch('');}} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityLabel={m.name} accessibilityState={{selected: voterId === m.id}}
                  style={{paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border,
                    backgroundColor: voterId === m.id ? `${T.accent}15` : 'transparent'}}>
                  <Text style={{fontSize: fs(13), color: voterId === m.id ? T.accent : T.text}}>{m.name}</Text>
                </TouchableOpacity>
              ))}
          </ScrollView>
        </View>
      )}

      {showCreate && (
        <View style={{marginHorizontal: 16, marginBottom: 12, backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 14}}>
          <TextInput value={question} onChangeText={setQuestion} placeholder={t('polls.questionPlaceholder')} placeholderTextColor={T.muted}
            style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(14), marginBottom: 10}} />
          {options.map((opt, i) => (
            <View key={i} style={{flexDirection: 'row', gap: 6, marginBottom: 6, alignItems: 'center'}}>
              <TextInput value={opt} onChangeText={v => {const u = [...options]; u[i] = v; setOptions(u);}}
                placeholder={`${t('polls.optionPlaceholder')} ${i + 1}`} placeholderTextColor={T.muted}
                style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: fs(13)}} />
              {options.length > 2 && (
                <TouchableOpacity onPress={() => setOptions(options.filter((_, j) => j !== i))} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('polls.removeOption')}>
                  <Text style={{fontSize: fs(14), color: T.danger}}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          <TouchableOpacity onPress={() => setOptions([...options, ''])} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('polls.addOption')} style={{paddingVertical: 6}}>
            <Text style={{fontSize: fs(12), color: T.accent}}>{t('polls.addOption')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setHideVoters(!hideVoters)} activeOpacity={0.7} accessibilityRole="checkbox" accessibilityState={{checked: hideVoters}} accessibilityLabel={t('polls.hideVoters')} style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 10}}>
            <Text style={{fontSize: fs(16), color: hideVoters ? T.accent : T.muted}}>{hideVoters ? '☑' : '☐'}</Text>
            <Text style={{fontSize: fs(12), color: T.dim}}>{t('polls.hideVoters')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={createPoll} activeOpacity={0.7} accessibilityRole="button"
            style={{backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingVertical: 10, alignItems: 'center'}}>
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
          const totalVotes = poll.options.reduce((s, o) => s + o.votes.length, 0);
          const isClosed = !!poll.closedAt;
          return (
            <View key={poll.id} style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 10}}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6}}>
                <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(15), fontWeight: '600', color: T.text}}>{poll.question}</Text>
                {isClosed && <Text style={{fontSize: fs(10), color: T.danger, fontWeight: '600', textTransform: 'uppercase'}}>{t('polls.closed')}</Text>}
              </View>
              <Text style={{fontSize: fs(11), color: T.muted, marginBottom: 10}}>
                {getName(poll.createdBy)} · {fmtTime(poll.createdAt)} · {t('polls.votes', {count: totalVotes})}
              </Text>

              {poll.options.map(opt => {
                const pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
                const voted = opt.votes.includes(voterId);
                return (
                  <TouchableOpacity key={opt.id} onPress={() => !isClosed && vote(poll.id, opt.id)} activeOpacity={isClosed ? 1 : 0.7}
                    accessibilityRole="button" accessibilityLabel={`${opt.label}, ${pct}%`} accessibilityState={{selected: voted, disabled: isClosed}}
                    style={{borderRadius: 8, borderWidth: 1, borderColor: voted ? T.accent : T.border, backgroundColor: T.surface, marginBottom: 6, overflow: 'hidden'}}>
                    <View style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, backgroundColor: voted ? `${T.accent}15` : `${T.border}30`}} />
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10}}>
                      <Text style={{fontSize: fs(13), color: voted ? T.accent : T.text, fontWeight: voted ? '600' : '400'}}>{opt.label}</Text>
                      <Text style={{fontSize: fs(12), color: T.muted}}>{pct}%</Text>
                    </View>
                    {!poll.hideVoterNames && opt.votes.length > 0 && (
                      <Text style={{fontSize: fs(10), color: T.muted, paddingHorizontal: 12, paddingBottom: 6}}>{opt.votes.map(v => getName(v)).join(', ')}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}

              <View style={{flexDirection: 'row', gap: 12, marginTop: 6}}>
                <TouchableOpacity onPress={() => toggleClose(poll.id)} activeOpacity={0.7} accessibilityRole="button">
                  <Text style={{fontSize: fs(11), color: T.accent}}>{isClosed ? t('polls.reopenPoll') : t('polls.closePoll')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deletePoll(poll.id)} activeOpacity={0.7} accessibilityRole="button">
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
