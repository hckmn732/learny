// `open_question` brick (SPEC-3301 EF-3): a multiline answer, its bound and the tutor note.
//
// The answer is sent exactly as typed (`answerMaxChars` bounds it); the correction comes back from
// the tutor at the end of the attempt (BR-BRI-08), never from the device.
import { StyleSheet, TextInput, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme, type as typeScale } from '../../../theme';
import { Text } from '../../../ui';
import { parsePublicPayload } from '../../public-schemas';
import type { NativeBrickViewProps } from '../../registry';
import { BrickCard, InvalidCharge, QuestionHeader, Sources } from '../../shared';

const t = fr.mobile.bricks;

/** Answer typed by the learner, as the parent screen keeps it. */
function answerOf(response: unknown): string {
  return typeof response === 'string' ? response : '';
}

/** One open question: the field, the counter and the tutor note of the correction. */
export function OpenQuestionView({
  brick,
  mode,
  correction,
  response,
  onResponse,
  disabled,
  testID,
}: NativeBrickViewProps) {
  const parsed = parsePublicPayload('open_question', brick.publicPayload);
  if (!parsed.ok) return <InvalidCharge type="open_question" testID={testID} />;
  const payload = parsed.payload;
  const graded = correction?.kind === 'open_question' ? correction : undefined;
  const answer = answerOf(response);
  const locked = mode === 'read' || disabled === true || graded !== undefined;

  return (
    <BrickCard type="open_question" testID={testID}>
      <QuestionHeader stem={payload.stem} type="open_question" />
      <Text variant="label" tone="muted">
        {t.yourAnswer}
      </Text>
      <TextInput
        accessibilityLabel={t.yourAnswer}
        editable={!locked}
        maxLength={payload.answerMaxChars}
        multiline
        onChangeText={(value) => {
          onResponse?.(value);
        }}
        placeholder={t.yourAnswer}
        placeholderTextColor={theme.colors.inkMuted}
        style={styles.field}
        testID="brick-open_question-input"
        value={answer}
      />
      <Text variant="caption" tone="muted" testID="brick-open_question-counter">
        {t.characters(answer.length, payload.answerMaxChars)}
      </Text>
      {graded === undefined ? (
        <Text variant="caption" tone="secondary" testID="brick-open_question-tutor">
          {t.tutorCorrection}
        </Text>
      ) : (
        <View style={styles.graded} testID="brick-open_question-feedback">
          <Text variant="buttonSmall">
            {`${String(graded.points)} / ${String(graded.maxPoints)}`}
          </Text>
          {graded.criteria.map((criterion) => (
            <Text key={criterion.label} variant="caption" tone="secondary">
              {`${criterion.ok ? '✓' : '✗'} ${criterion.label}${criterion.comment === null ? '' : ` — ${criterion.comment}`}`}
            </Text>
          ))}
          {graded.comment === null ? null : (
            <Text variant="bodySmall" tone="secondary">
              {graded.comment}
            </Text>
          )}
          {graded.explanation === null ? null : (
            <Text variant="bodySmall" tone="secondary">
              {graded.explanation}
            </Text>
          )}
        </View>
      )}
      <Sources sources={payload.sources} />
    </BrickCard>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 120,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    color: theme.colors.ink,
    fontFamily: theme.fontFamilies.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    textAlignVertical: 'top',
  },
  graded: { gap: theme.spacing.xs },
});
