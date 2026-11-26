// `choice_question` brick (SPEC-3301 EF-2, BR-MEM-10): single or multiple choice, options A to F,
// radius 20 and the circled letter of the mockup `*-05-quiz.png`.
//
// The view reads only the public charge: no option carries `correct`, `rationale` or the objective
// before the server sends a correction back (ET-2, CA-3).
import { Pressable, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { selectionFeedback } from '../../../lib/haptics';
import { withReadableMath } from '../../../lib/latex-text';
import { radius, theme } from '../../../theme';
import { Icon, Text } from '../../../ui';
import { parsePublicPayload } from '../../public-schemas';
import type { NativeBrickViewProps } from '../../registry';
import { choiceResponse, selectedOptionIds, toggleChoiceOption } from '../../responses';
import { BrickCard, Feedback, InvalidCharge, QuestionHeader, Sources } from '../../shared';
import { correctionIsCorrect } from '../../verdict';

const t = fr.mobile.bricks;
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/** One choice question, in reading or playing mode, with or without its correction. */
export function ChoiceQuestionView({
  brick,
  mode,
  correction,
  response,
  onResponse,
  disabled,
  testID,
}: NativeBrickViewProps) {
  const parsed = parsePublicPayload('choice_question', brick.publicPayload);
  if (!parsed.ok) return <InvalidCharge type="choice_question" testID={testID} />;
  const payload = parsed.payload;
  const graded = correction?.kind === 'choice_question' ? correction : undefined;
  const selected = selectedOptionIds(response);
  const multiple = payload.mode === 'multiple';
  const locked = mode === 'read' || disabled === true || graded !== undefined;

  function choose(optionId: string): void {
    if (locked || onResponse === undefined) return;
    selectionFeedback();
    onResponse(choiceResponse(toggleChoiceOption(payload.mode, selected, optionId)));
  }

  return (
    <BrickCard type="choice_question" testID={testID}>
      <QuestionHeader stem={payload.stem} type="choice_question" />
      <Text variant="caption" tone="muted" testID="brick-consigne">
        {multiple ? t.multipleAnswer : t.singleAnswer}
      </Text>
      <View style={styles.options}>
        {payload.options.map((option, index) => {
          const letter = LETTERS[index] ?? String(index + 1);
          const checked = selected.includes(option.id);
          const state = graded?.options.find((candidate) => candidate.id === option.id);
          const correct = state?.correct === true;
          const wrong = state !== undefined && checked && !state.correct;
          const tone = correct
            ? styles.correct
            : wrong
              ? styles.wrong
              : checked
                ? styles.checked
                : null;
          return (
            <Pressable
              accessibilityLabel={`${letter}. ${option.text}`}
              accessibilityRole={multiple ? 'checkbox' : 'radio'}
              accessibilityState={{ checked, disabled: locked }}
              disabled={locked}
              key={option.id}
              onPress={() => {
                choose(option.id);
              }}
              style={({ pressed }) => [
                styles.option,
                tone,
                locked && graded === undefined ? styles.dimmed : null,
                pressed && !locked ? styles.pressed : null,
              ]}
              testID={`brick-option-${String(index)}`}
            >
              <View
                style={[
                  styles.letter,
                  correct
                    ? styles.letterCorrect
                    : wrong
                      ? styles.letterWrong
                      : checked
                        ? styles.letterChecked
                        : null,
                ]}
              >
                <Text
                  variant="label"
                  tone={correct || wrong ? 'primary' : checked ? 'inverse' : 'primary'}
                >
                  {letter}
                </Text>
              </View>
              <Text variant="body" style={styles.optionText}>
                {withReadableMath(option.text)}
              </Text>
              {correct ? <Icon name="check" size={18} color={theme.colors.greenInk} /> : null}
              {wrong ? <Icon name="alert" size={18} color={theme.colors.orangeInk} /> : null}
            </Pressable>
          );
        })}
      </View>
      {graded === undefined ? null : (
        <Feedback explanation={graded.explanation} isCorrect={correctionIsCorrect(graded)} />
      )}
      <Sources sources={payload.sources} />
    </BrickCard>
  );
}

const styles = StyleSheet.create({
  options: { gap: theme.spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: theme.controls.row,
    borderRadius: radius.option,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  optionText: { flex: 1 },
  checked: { borderColor: theme.colors.ink, backgroundColor: theme.colors.canvas },
  correct: { borderColor: theme.colors.green, backgroundColor: theme.colors.greenSoft },
  wrong: { borderColor: theme.colors.orange, backgroundColor: theme.colors.orangeSoft },
  dimmed: { opacity: 0.7 },
  pressed: { opacity: 0.85 },
  letter: {
    width: 32,
    height: 32,
    borderRadius: radius.badge,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.canvas,
  },
  letterChecked: { backgroundColor: theme.colors.ink },
  letterCorrect: { backgroundColor: theme.colors.green },
  letterWrong: { backgroundColor: theme.colors.orange },
});
