// End of the chapter (SPEC-3302 EF-4, BR-COU-11).
//
// « Chapitre précédent » / « Chapitre suivant » while a neighbour exists, and on the last chapter the
// lime card « Prêt pour le quiz de validation ? » with the threshold of the module. The native quiz
// screen arrives with SPEC-3304: the action opens the web quiz for now (ADR-3002 § 3, documented).
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { radius, theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';

const t = fr.course;

export interface CourseEndProps {
  readonly previousChapterId: string | null;
  readonly nextChapterId: string | null;
  /** Validation threshold of the module, read from the server (BR-QUI-02). */
  readonly threshold: number;
  readonly onPrevious: (chapterId: string) => void;
  readonly onNext: (chapterId: string) => void;
  readonly onQuiz: () => void;
}

/** Neighbour chapters and the quiz card of the last chapter. */
export function CourseEnd({
  previousChapterId,
  nextChapterId,
  threshold,
  onPrevious,
  onNext,
  onQuiz,
}: CourseEndProps) {
  return (
    <View style={styles.root} testID="course-end">
      {nextChapterId === null ? (
        <View style={styles.quizCard} testID="course-quiz-card">
          <Text variant="sectionTitle">{t.quizTitle}</Text>
          <Text variant="bodySmall">{t.quizText.replace('{threshold}', String(threshold))}</Text>
          <Button label={t.quizAction} onPress={onQuiz} testID="course-quiz" variant="ink" />
        </View>
      ) : null}
      <View style={styles.nav}>
        {previousChapterId === null ? (
          <View />
        ) : (
          <Button
            icon="chevronLeft"
            label={t.previous}
            onPress={() => {
              onPrevious(previousChapterId);
            }}
            testID="course-previous"
            variant="outline"
          />
        )}
        {nextChapterId === null ? null : (
          <Button
            label={t.next}
            onPress={() => {
              onNext(nextChapterId);
            }}
            testID="course-next"
            variant="ink"
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: theme.spacing.lg, paddingTop: theme.spacing.lg },
  quizCard: {
    backgroundColor: theme.colors.lime,
    borderRadius: radius.card,
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.lg,
  },
});
