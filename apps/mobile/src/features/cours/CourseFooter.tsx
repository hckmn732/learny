// Bottom bar of the course (SPEC-3302 EF-3, § 10).
//
// The ink button « Demander au tuteur » and the square icon button of the validation quiz, with the
// accessible label « Ouvrir le quiz de validation ». Both destinations belong to SPEC-3303 and
// SPEC-3304: until they land, the screen hands the action to the web page of the course (ADR-3002 § 3),
// which the route implements - this bar only raises the intent.
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';

const m = fr.mobile.cours;

export interface CourseFooterProps {
  readonly onAskTutor: () => void;
  readonly onQuiz: () => void;
}

/** Actions always reachable while reading (EF-3). */
export function CourseFooter({ onAskTutor, onQuiz }: CourseFooterProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.root, { paddingBottom: insets.bottom + theme.spacing.sm }]}
      testID="course-footer"
    >
      <View style={styles.grow}>
        <Button
          block
          icon="sparkles"
          label={m.footer.askTutor}
          onPress={onAskTutor}
          testID="course-ask-tutor"
          variant="ink"
        />
      </View>
      <IconButton
        accessibilityLabel={m.footer.quiz}
        name="cards"
        onPress={onQuiz}
        testID="course-open-quiz"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  grow: { flex: 1, minWidth: 0 },
});
