// « Le tuteur a reporté N notions à jeudi… Annuler » (SPEC-3305 BR-AUT-07, CA-4; SPEC-718 ET-5).
//
// The sentence and the day come from the server notice (`smoothing`). « Annuler » reopens the
// deferred notions through the automation journal; offline the action is disabled (CL-4).
import { Pressable, StyleSheet, View } from 'react-native';

import type { QuizSmoothingNotice } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { formatLongDay } from '../../lib/dates';
import { radius, theme } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Text } from '../../ui/Text';

const t = fr.mobile.reviser.tutor;

export interface TutorNoteProps {
  readonly smoothing: QuizSmoothingNotice;
  readonly online: boolean;
  readonly pending: boolean;
  readonly onUndo: (actionId: string) => void;
}

/** Civil day of the deferral, as a French weekday (« jeudi »), from the server civil date. */
export function deferredDayLabel(day: string | null): string {
  if (day === null) return '';
  const label = formatLongDay(`${day}T12:00:00.000Z`);
  return label.split(' ')[0]?.toLowerCase() ?? '';
}

/** Box of the tutor's deferral and its « Annuler » (BR-AUT-07). */
export function TutorNote({ smoothing, online, pending, onUndo }: TutorNoteProps) {
  const day = deferredDayLabel(smoothing.deferredTo);
  const sentence = t.deferred(smoothing.deferredCount, day, smoothing.capMinutes);
  const canUndo = online && smoothing.actionId !== null;
  return (
    <View style={styles.box} testID="review-tutor-note">
      <Icon name="sparkles" size={16} color={theme.colors.inkMuted} />
      <View style={styles.body}>
        <Text variant="caption" tone="secondary">
          {sentence}
        </Text>
        {smoothing.actionId === null ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.undo}
            accessibilityState={{ disabled: !canUndo || pending }}
            disabled={!canUndo || pending}
            onPress={() => {
              onUndo(smoothing.actionId as string);
            }}
            testID="review-tutor-undo"
          >
            <Text variant="caption" tone={canUndo ? 'primary' : 'muted'}>
              {pending ? t.undoPending : t.undo}
            </Text>
          </Pressable>
        )}
        {online ? null : (
          <Text variant="caption" tone="muted">
            {t.offline}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.handle,
    backgroundColor: theme.colors.surface,
  },
  body: { flex: 1, gap: 2 },
});
