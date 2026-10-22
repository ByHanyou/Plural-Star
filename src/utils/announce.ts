import {AccessibilityInfo} from 'react-native';
import i18n from '../i18n/i18n';

export const announceMove = (to: number, count: number, neighbor: string | undefined, above: boolean): void =>
  AccessibilityInfo.announceForAccessibility(
    to <= 0 ? i18n.t('common.movedToTop')
      : to >= count - 1 ? i18n.t('common.movedToBottom')
      : i18n.t(above ? 'common.movedAbove' : 'common.movedBelow', {name: neighbor || ''}),
  );
