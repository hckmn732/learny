// Segmented progress bar of the validation quiz (SPEC-3304 EF-2, CA-2; maquette `*-05-quiz.png`).
//
// One segment per question of the attempt: lime for a correct answer, orange for a wrong one, ink
// for the current question and grey for the next ones. The bar is decorative for the reader — the
// count « Question n sur N » carries the same information — so it is exposed as one image with a
// French label instead of sixteen anonymous nodes (BR-ACC-05, ET-5).
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme } from '../../theme';

import type { SegmentTone } from './progress-segments';

const t = fr.mobile.quiz;

const TONE = StyleSheet.create({
  correct: { backgroundColor: theme.colors.lime },
  wrong: { backgroundColor: theme.colors.orange },
  pending: { backgroundColor: theme.colors.inkSecondary },
  current: { backgroundColor: theme.colors.ink },
  upcoming: { backgroundColor: theme.colors.border },
});

export interface ProgressSegmentsProps {
  readonly segments: readonly SegmentTone[];
  readonly testID?: string;
}

/** One rounded segment per question (EF-2). */
export function ProgressSegments({ segments, testID }: ProgressSegmentsProps) {
  const corrected = segments.filter(
    (tone) => tone === 'correct' || tone === 'wrong' || tone === 'pending',
  ).length;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={t.progress(corrected, segments.length)}
      style={styles.row}
      testID={testID}
    >
      {segments.map((tone, index) => (
        <View
          key={index}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.segment, TONE[tone]]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing.xs },
  segment: {
    flex: 1,
    height: theme.controls.progressSegment,
    borderRadius: theme.radius.pill,
  },
});
