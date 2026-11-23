// Header of the validation quiz (SPEC-3304 EF-2, CA-2; BR-QUI-07, ADR-3003 § 2).
//
// « Quitter », « Question n sur N » and nothing else: the mockup shows a timer on the right, which
// ADR-3003 § 2 removes from the validation quiz (BR-QUI-07 has no duration). The line under the
// header carries the attempt number and the threshold; the segmented bar shows the whole attempt.
// The quiz header is not a native navigation bar: it belongs to the content and is compared as such.
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { IconButton } from '../../ui/IconButton';
import { Text } from '../../ui/Text';

import type { SegmentTone } from './progress-segments';
import { ProgressSegments } from './ProgressSegments';

const t = fr.mobile.quiz;

export interface QuizHeaderProps {
  readonly position: number;
  readonly total: number;
  readonly attemptNo: number;
  readonly threshold: number;
  readonly segments: readonly SegmentTone[];
  readonly onQuit: () => void;
}

/** Close button, question counter, attempt meta and progress bar (EF-2). */
export function QuizHeader({
  position,
  total,
  attemptNo,
  threshold,
  segments,
  onQuit,
}: QuizHeaderProps) {
  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <IconButton name="x" accessibilityLabel={t.close} onPress={onQuit} testID="quiz-close" />
        <Text variant="title" testID="quiz-count">
          {t.count(position, total)}
        </Text>
        {/* ADR-3003 § 2 — no timer: the row keeps the counter centred. */}
        <View style={styles.spacer} />
      </View>
      <Text variant="caption" tone="muted" testID="quiz-attempt-meta">
        {t.attemptMeta(attemptNo, threshold)}
      </Text>
      <ProgressSegments segments={segments} testID="quiz-progress" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  spacer: { width: theme.controls.iconButton },
});
