import React from 'react';
import {View, Modal, TouchableOpacity, StyleSheet, ActivityIndicator} from 'react-native';
import {Text} from './AppText';
import {useTranslation} from 'react-i18next';
import {fontScale, ThemeColors} from '../theme';
import {ImportProgress, progressFraction} from '../import/progress';

interface Props {
  visible: boolean;
  progress: ImportProgress | null;
  theme: ThemeColors;
  /** Omitted for runs that cannot be stopped safely. */
  onCancel?: () => void;
}

/**
 * Blocking "please wait" screen for imports.
 *
 * Deliberately not dismissible by back/tap: an import is mid-write, and letting
 * the screen go would leave the user staring at a half-populated app with no
 * idea anything was still running. The only way out is Cancel, which asks for a
 * stop at the next phase boundary rather than tearing out of a write.
 */
export const ImportWaitOverlay = ({visible, progress, theme: T, onCancel}: Props) => {
  const {t} = useTranslation();
  const fs = fontScale(T);
  const fraction = progressFraction(progress);
  const pct = fraction === null ? null : Math.round(fraction * 100);
  const stopping = !!progress?.stopping;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={[s.backdrop, {backgroundColor: `${T.bg}E6`}]}>
        <View
          style={[s.card, {backgroundColor: T.card, borderColor: T.border}]}
          accessibilityViewIsModal
          accessibilityLiveRegion="polite">
          <Text style={[s.title, {color: T.text, fontSize: fs(18)}]} accessibilityRole="header">
            {t('share.importing')}
          </Text>

          {!!progress?.label && (
            <Text style={[s.label, {color: T.dim, fontSize: fs(13)}]} numberOfLines={2}>
              {progress.label}
            </Text>
          )}

          {fraction === null ? (
            // Nothing countable yet — a spinner is more honest than a bar at 0%.
            <ActivityIndicator
              color={T.accent}
              style={{marginVertical: 14}}
              // Decorative: the phase label above carries the meaning, and the
              // card is a polite live region — announcing a nameless spinner too
              // is just noise for screen reader users.
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          ) : (
            <View
              style={[s.track, {backgroundColor: T.border}]}
              accessibilityRole="progressbar"
              accessibilityValue={{min: 0, max: 100, now: pct ?? 0}}>
              <View style={[s.fill, {backgroundColor: T.accent, width: `${pct ?? 0}%` as const}]} />
            </View>
          )}

          <View style={s.metaRow}>
            {pct !== null && (
              <Text style={[s.meta, {color: T.dim, fontSize: fs(11)}]}>{`${pct}%`}</Text>
            )}
            {!!progress?.total && progress.total > 0 && (
              <Text style={[s.meta, {color: T.dim, fontSize: fs(11)}]}>
                {`${progress.done ?? 0}/${progress.total}`}
              </Text>
            )}
          </View>

          {stopping ? (
            <Text style={[s.label, {color: T.accent, fontSize: fs(12)}]}>
              {t('share.importStopping', {
                defaultValue: 'Finishing this step, then stopping…',
              })}
            </Text>
          ) : onCancel ? (
            <TouchableOpacity
              onPress={onCancel}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              accessibilityHint={t('share.importCancelHint', {
                defaultValue: 'Stops after the current step finishes. Steps already done are kept.',
              })}
              style={[s.cancel, {borderColor: T.border}]}>
              <Text style={[s.cancelText, {color: T.dim, fontSize: fs(13)}]}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28},
  card: {width: '100%', maxWidth: 380, borderRadius: 16, borderWidth: 1, padding: 20},
  title: {fontWeight: '700', marginBottom: 6},
  label: {marginTop: 4, marginBottom: 4},
  track: {height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 12, marginBottom: 6},
  fill: {height: '100%', borderRadius: 4},
  metaRow: {flexDirection: 'row', justifyContent: 'space-between'},
  meta: {fontVariant: ['tabular-nums']},
  cancel: {alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginTop: 14},
  cancelText: {fontWeight: '600'},
});
