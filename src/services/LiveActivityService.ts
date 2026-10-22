import {NativeModules, Platform} from 'react-native';
import type {FrontState, Member} from '../utils';
import {TIER_I18N_KEY, fmtDur, frontSessionStart, translateMood} from '../utils';
import i18n from '../i18n/i18n';
import {log, logError} from '../utils/log';

type LiveActivityModule = {
  startOrUpdate(payload: Record<string, unknown>): Promise<unknown>;
  endActivity(): Promise<unknown>;
  getFriendsPushToken?(title: string): Promise<string | null>;
  endFriendsActivity?(): Promise<unknown>;
  waitForProtectedData?(): Promise<boolean>;
  getAPNsDeviceToken?(): Promise<string | null>;
};

const nativeModule: LiveActivityModule | null =
  Platform.OS === 'ios' ? (NativeModules.PluralSpaceLiveActivity as LiveActivityModule | undefined) || null : null;

const resolveNames = (ids: string[], members: Member[]): string =>
  ids.map(id => members.find(m => m.id === id)?.name || '?').join(', ');

const PROTECTED_DATA_WAIT_MS = 32000;

const readToken = async (read: (m: LiveActivityModule) => Promise<string | null> | undefined): Promise<string | null> => {
  if (!nativeModule) return null;
  try {
    return (await read(nativeModule)) || null;
  } catch (e) {
    log.debug('liveActivity', e);
    return null;
  }
};

export const getFriendsPushToken = (): Promise<string | null> => readToken(m => m.getFriendsPushToken?.(i18n.t('network.friends')));

export const getAPNsDeviceToken = (): Promise<string | null> => readToken(m => m.getAPNsDeviceToken?.());

export const endFriendsActivity = async (): Promise<void> => {
  try {
    await nativeModule?.endFriendsActivity?.();
  } catch (e) {
    logError('liveActivity', e);
  }
};

export const waitForProtectedData = async (): Promise<boolean> => {
  if (!nativeModule?.waitForProtectedData) return true;
  try {
    const raced = await Promise.race<boolean | 'timeout'>([
      nativeModule.waitForProtectedData(),
      new Promise<'timeout'>(r => setTimeout(() => r('timeout'), PROTECTED_DATA_WAIT_MS)),
    ]);
    return raced === true;
  } catch (e) {
    log.debug('liveActivity', e);
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

  const primaryIds = front.primary.memberIds;
  const coFrontIds = front.coFront.memberIds;
  const coConsciousIds = front.coConscious.memberIds;
  const primaryText = resolveNames(primaryIds, members);
  if (!primaryText && coFrontIds.length === 0 && coConsciousIds.length === 0) {
    await nativeModule.endActivity();
    return;
  }

  const since = frontSessionStart(front);
  await nativeModule.startOrUpdate({
    systemName: systemName || 'Plural Star',
    primaryText,
    coFrontText: coFrontIds.length > 0 ? resolveNames(coFrontIds, members) : undefined,
    coConsciousText: coConsciousIds.length > 0 ? resolveNames(coConsciousIds, members) : undefined,
    mood: front.primary.mood ? translateMood(front.primary.mood, i18n.t) : front.primary.mood,
    location: front.primary.location,
    note: front.primary.note || undefined,
    startTime: since,
    statusLine: fmtDur(since),
    friendsText: friendsText || undefined,
    frontLabel: i18n.t('tabs.front'),
    coFrontLabel: i18n.t(TIER_I18N_KEY.coFront),
    coConsciousLabel: i18n.t(TIER_I18N_KEY.coConscious),
    moodLabel: i18n.t('modal.mood'),
    locationLabel: i18n.t('notification.atLabel'),
    friendsLabel: i18n.t('network.friends'),
  });
};

export const endFrontLiveActivity = async () => {
  if (!nativeModule) return;
  await nativeModule.endActivity();
};
