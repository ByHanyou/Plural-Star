import {NativeModules, Platform} from 'react-native';
import type {FrontState, Member} from '../utils';
import {fmtDur} from '../utils';

type LiveActivityModule = {
  startOrUpdate(payload: Record<string, unknown>): Promise<unknown>;
  endActivity(): Promise<unknown>;
  getFriendsPushToken?(): Promise<string | null>;
  endFriendsActivity?(): Promise<unknown>;
  waitForProtectedData?(): Promise<boolean>;
};

const nativeModule: LiveActivityModule | null =
  Platform.OS === 'ios' ? (NativeModules.PluralSpaceLiveActivity as LiveActivityModule | undefined) || null : null;

const resolveNames = (ids: string[], members: Member[]): string =>
  ids.map(id => members.find(m => m.id === id)?.name || '?').join(', ');

export const liveActivitiesSupported = Platform.OS === 'ios' && !!nativeModule;

export const getFriendsPushToken = async (): Promise<string | null> => {
  if (!nativeModule || typeof nativeModule.getFriendsPushToken !== 'function') return null;
  try {
    return (await nativeModule.getFriendsPushToken()) || null;
  } catch {
    return null;
  }
};

export const endFriendsActivity = async (): Promise<void> => {
  if (!nativeModule || typeof nativeModule.endFriendsActivity !== 'function') return;
  try {
    await nativeModule.endFriendsActivity();
  } catch {}
};

export const waitForProtectedData = async (): Promise<boolean> => {
  if (Platform.OS !== 'ios') return true;
  if (!nativeModule || typeof nativeModule.waitForProtectedData !== 'function') return true;
  try {
    const raced = await Promise.race<boolean | 'timeout'>([
      nativeModule.waitForProtectedData() as Promise<boolean>,
      new Promise<'timeout'>(r => setTimeout(() => r('timeout'), 32000)),
    ]);
    return raced === true;
  } catch {
    return true;
  }
};

export const updateFrontLiveActivity = async (
  front: FrontState | null,
  members: Member[],
  systemName: string,
  friendsText?: string,
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
    friendsText: friendsText || undefined,
  });
};

export const endFrontLiveActivity = async () => {
  if (!nativeModule) return;
  await nativeModule.endActivity();
};
