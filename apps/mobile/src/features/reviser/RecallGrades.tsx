// Self-assessment of the recall card (SPEC-3305 EF-3, BR-MEM-02): four buttons with their previewed
// due date. The date comes from the server (`intervals`), is formatted in the learner's zone and is
// never computed on the device; offline, no FSRS date is shown (BR-MEM-02).
import { Pressable, StyleSheet, View } from 'react-native';

import type { ReviewIntervals } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { formatIsoDay, formatShortDay, formatTime } from '../../lib/dates';
import { radius, theme } from '../../theme';
import { Text } from '../../ui/Text';

const t = fr.mobile.reviser.grades;

const GRADES = ['again', 'hard', 'good', 'easy'] as const;
export type SelfGradeKey = (typeof GRADES)[number];

export interface RecallGradesProps {
  readonly intervals: ReviewIntervals | null;
  readonly timeZone: string;
  readonly now: Date;
  readonly disabled: boolean;
  readonly onGrade: (grade: SelfGradeKey) => void;
}

/** « aujourd'hui », « demain », or « jeu. 13 nov. » in the learner's zone (BR-ACC-07). */
export function dueDayLabel(instant: string, timeZone: string, now: Date): string {
  const day = formatIsoDay(instant, timeZone);
  const today = formatIsoDay(now, timeZone);
  if (day === today) return 'aujourd’hui';
  const tomorrow = formatIsoDay(new Date(now.getTime() + 86_400_000), timeZone);
  if (day === tomorrow) return 'demain';
  return formatShortDay(instant, timeZone);
}

/** Label of one button: grade, then its due date (EF-3). */
export function dueLabelFor(
  grade: SelfGradeKey,
  intervals: ReviewIntervals | null,
  timeZone: string,
  now: Date,
): string {
  if (intervals === null) return '';
  return t.due(
    `${dueDayLabel(intervals[grade], timeZone, now)} · ${formatTime(intervals[grade], timeZone)}`,
  );
}

/** Four self-assessment buttons of the recall card (EF-3). */
export function RecallGrades({ intervals, timeZone, now, disabled, onGrade }: RecallGradesProps) {
  return (
    <View style={styles.wrap}>
      <Text variant="label" tone="muted" testID="review-grade-prompt">
        {t.prompt}
      </Text>
      <View style={styles.grid}>
        {GRADES.map((grade) => (
          <Pressable
            key={grade}
            accessibilityRole="button"
            accessibilityLabel={`${t[grade]}. ${dueLabelFor(grade, intervals, timeZone, now)}`}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => {
              onGrade(grade);
            }}
            style={({ pressed }) => [
              styles.button,
              grade === 'good' ? styles.recommended : null,
              pressed ? styles.pressed : null,
              disabled ? styles.disabled : null,
            ]}
            testID={`review-grade-${grade}`}
          >
            <Text variant="buttonSmall">{t[grade]}</Text>
            {intervals === null ? null : (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {dueDayLabel(intervals[grade], timeZone, now)}
              </Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.sm, marginTop: theme.spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  button: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: theme.minTouchTarget.height,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
  },
  recommended: { backgroundColor: theme.colors.limeSoft, borderColor: theme.colors.lime },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.5 },
});
