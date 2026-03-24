// src/services/NotificationService.ts
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidStyle,
} from '@notifee/react-native';
import {FrontState, Member, fmtDur, fmtTime, isFrontEmpty} from '../utils';

export const NOTIF_CHANNEL_ID = 'plural-space-front';
export const NOTIF_ID = 'ps-front-status';

export const setupNotificationChannel = async () => {
  await notifee.createChannel({
    id: NOTIF_CHANNEL_ID,
    name: 'Front Status',
    importance: AndroidImportance.LOW,
    visibility: AndroidVisibility.PUBLIC,
    sound: '',
  });
};

const resolveNames = (ids: string[], members: Member[]): string =>
  ids.map(id => members.find(m => m.id === id)?.name || '?').join(', ');

// Safety: extract memberIds from a tier, handling both new and old format
const getTierIds = (front: any, tier: string): string[] => {
  // New tiered format: front.primary.memberIds, front.coFront.memberIds, etc.
  if (front?.[tier]?.memberIds && Array.isArray(front[tier].memberIds)) {
    return front[tier].memberIds;
  }
  // Old flat format fallback: front.memberIds (only applies to primary)
  if (tier === 'primary' && Array.isArray(front?.memberIds)) {
    return front.memberIds;
  }
  return [];
};

const getTierField = (front: any, tier: string, field: string): string | undefined => {
  // New format
  if (front?.[tier]?.[field] !== undefined) return front[tier][field];
  // Old format fallback (primary only)
  if (tier === 'primary' && front?.[field] !== undefined) return front[field];
  return undefined;
};

export const showFrontNotification = async (
  front: FrontState | null,
  members: Member[],
) => {
  try {
    if (!front) {
      await clearFrontNotification();
      return;
    }

    // Check emptiness safely (handles both old and new format)
    const primaryIds = getTierIds(front, 'primary');
    const coFrontIds = getTierIds(front, 'coFront');
    const coConsciousIds = getTierIds(front, 'coConscious');

    if (primaryIds.length === 0 && coFrontIds.length === 0 && coConsciousIds.length === 0) {
      await clearFrontNotification();
      return;
    }

    await setupNotificationChannel();

    const primaryNames = resolveNames(primaryIds, members);
    const coFrontNames = resolveNames(coFrontIds, members);
    const coConsciousNames = resolveNames(coConsciousIds, members);

    const duration = fmtDur(front.startTime);
    const titleNames = primaryNames || coFrontNames || coConsciousNames || 'Unknown';
    const title = `◈ ${titleNames}  ·  ${duration}`;

    // Body lines for bigText expansion
    const lines: string[] = [];
    if (primaryIds.length > 0) lines.push(`Primary: ${primaryNames}`);
    if (coFrontIds.length > 0) lines.push(`Co-Front: ${coFrontNames}`);
    if (coConsciousIds.length > 0) lines.push(`Co-Conscious: ${coConsciousNames}`);

    const primaryMood = getTierField(front, 'primary', 'mood');
    const primaryLocation = getTierField(front, 'primary', 'location');
    const primaryNote = getTierField(front, 'primary', 'note');

    if (primaryMood) lines.push(`Mood: ${primaryMood}`);
    if (primaryLocation) lines.push(`At: ${primaryLocation}`);
    if (primaryNote) lines.push(`Note: ${primaryNote}`);
    lines.push(`Since ${fmtTime(front.startTime)}`);

    // Collapsed summary
    const summaryParts: string[] = [];
    if (coFrontIds.length > 0) summaryParts.push(`CF: ${coFrontNames}`);
    if (coConsciousIds.length > 0) summaryParts.push(`CC: ${coConsciousNames}`);
    if (primaryMood) summaryParts.push(`Mood: ${primaryMood}`);
    summaryParts.push(duration);
    const summary = summaryParts.join('  ·  ');

    await notifee.displayNotification({
      id: NOTIF_ID,
      title,
      body: summary,
      android: {
        channelId: NOTIF_CHANNEL_ID,
        ongoing: true,
        onlyAlertOnce: true,
        autoCancel: false,
        smallIcon: 'ic_notif',
        importance: AndroidImportance.LOW,
        visibility: AndroidVisibility.PUBLIC,
        pressAction: {id: 'default'},
        color: '#DAA520',
        style: {
          type: AndroidStyle.BIGTEXT,
          text: lines.join('\n'),
        },
      },
    });
  } catch (e) {
    console.error('[PluralSpace] Notification error:', e);
  }
};

export const clearFrontNotification = async () => {
  try {
    await notifee.cancelNotification(NOTIF_ID);
  } catch (e) {
    console.error('[PluralSpace] Clear notification error:', e);
  }
};
