import {FrontState, Member, MemberPoll, activeRosterAndFacets, allFrontMemberIds, toggleId, uid} from '../utils';

export interface PollDraft {
  question: string;
  options: string[];
  targetId: string;
  createdBy: string;
  hideVoters: boolean;
  multiChoice: boolean;
}

export const pollOptionLabels = (options: string[]): string[] => options.map(o => o.trim()).filter(Boolean);

export const pollDraftReady = (d: Pick<PollDraft, 'question' | 'options'>): boolean =>
  !!d.question.trim() && pollOptionLabels(d.options).length >= 2;

export const createPoll = (d: PollDraft): MemberPoll | null => {
  if (!pollDraftReady(d)) return null;
  return {
    id: uid(),
    targetMemberId: d.targetId,
    question: d.question.trim(),
    options: pollOptionLabels(d.options).map(label => ({id: uid(), label, votes: []})),
    createdBy: d.createdBy,
    createdAt: Date.now(),
    hideVoterNames: d.hideVoters || undefined,
    multipleChoice: d.multiChoice || undefined,
  };
};

export const castPollVote = (poll: MemberPoll, optionId: string, voterId: string): MemberPoll => {
  if (poll.multipleChoice) {
    return {...poll, options: poll.options.map(o => (o.id !== optionId ? o : {...o, votes: toggleId(o.votes, voterId)}))};
  }
  const alreadyVoted = poll.options.some(o => o.id === optionId && o.votes.includes(voterId));
  return {
    ...poll,
    options: poll.options.map(o => {
      const without = o.votes.filter(v => v !== voterId);
      return o.id === optionId && !alreadyVoted ? {...o, votes: [...without, voterId]} : {...o, votes: without};
    }),
  };
};

export const togglePollClosed = (poll: MemberPoll): MemberPoll => ({...poll, closedAt: poll.closedAt ? undefined : Date.now()});

export const pollVoterCount = (poll: MemberPoll): number => new Set(poll.options.flatMap(o => o.votes)).size;

export const pollOptionPercent = (votes: number, voters: number): number => (voters > 0 ? Math.round((votes / voters) * 100) : 0);

export const defaultVoterId = (members: Member[], front: FrontState | null): string => {
  const voters = activeRosterAndFacets(members);
  const votable = new Set([...voters.members, ...voters.facets].map(m => m.id));
  return allFrontMemberIds(front).find(id => votable.has(id)) || voters.members[0]?.id || voters.facets[0]?.id || '';
};
