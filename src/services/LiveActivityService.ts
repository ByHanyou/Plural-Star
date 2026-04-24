import {NativeModules, Platform} from 'react-native';
import type {FrontState, Member} from '../utils';
import {fmtDur} from '../utils';

type LiveActivityModule = {
  startOrUpdate(payload: Record<string, unknown>): Promise<unknown>;
  endActivity(): Promise<unknown>;
};

const nativeModule: LiveActivityModule | null =
  Platform.OS === 'ios' ? (NativeModules.PluralSpaceLiveActivity as LiveActivityModule | undefined) || null : null;

const resolveNames = (ids: string[], members: Member[]): string =>
  ids.map(id => members.find(m => m.id === id)?.name || '?').join(', ');

export const liveActivitiesSupported = Platform.OS === 'ios' && !!nativeModule;

export const updateFrontLiveActivity = async (
  front: FrontState | null,
  members: Member[],
  systemName: string,
) => {
  if (!nativeModule) return;
  if (!front) {
    await nativeModule.endActivity();
    return;
  }

  const primaryText = resolveNames(front.primary.memberIds, members);
  if (!primaryText) {
    await nativeModule.endActivity();
    return;
  }

  await nativeModule.startOrUpdate({
    systemName: systemName || 'Plural Star',
    primaryText,
    coFrontText: front.coFront.memberIds.length > 0 ? resolveNames(front.coFront.memberIds, members) : undefined,
    coConsciousText: front.coConscious.memberIds.length > 0 ? resolveNames(front.coConscious.memberIds, members) : undefined,
    mood: front.primary.mood,
    location: front.primary.location,
    note: front.primary.note || undefined,
    startTime: front.startTime,
    statusLine: fmtDur(front.startTime),
  });
};

export const endFrontLiveActivity = async () => {
  if (!nativeModule) return;
  await nativeModule.endActivity();
};
