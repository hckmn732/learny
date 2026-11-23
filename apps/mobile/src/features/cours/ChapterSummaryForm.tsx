// « Résumez ce chapitre avec vos mots » (SPEC-3302 EF-4, BR-COU-07; CL-1, CL-4).
//
// The learner writes three or four sentences, the tutor answers with a verdict, a message and what is
// missing. When the tutor could not answer, the text is kept as a draft and the screen says so: no
// feedback is ever invented (CL-4). Offline, the field is disabled and says why (CL-1).
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import type { CourseSummaryView } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { radius, theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';

const m = fr.mobile.cours;
const t = fr.course;

export interface ChapterSummaryFormProps {
  /** The prompt written by the tutor in the `summary_prompt` section, when there is one. */
  readonly prompt: string | null;
  readonly initial: CourseSummaryView | null;
  readonly online: boolean;
  readonly pending: boolean;
  readonly failed: boolean;
  readonly onSubmit: (text: string) => void;
}

/** Summary of the chapter and the tutor's correction (BR-COU-07). */
export function ChapterSummaryForm({
  prompt,
  initial,
  online,
  pending,
  failed,
  onSubmit,
}: ChapterSummaryFormProps) {
  const [text, setText] = useState(initial?.text ?? '');
  const [notice, setNotice] = useState<string | null>(null);
  const feedback = initial?.feedback ?? null;

  return (
    <View style={styles.root} testID="chapter-summary">
      <Text variant="sectionTitle">{t.summaryTitle}</Text>
      <Text tone="muted" variant="bodySmall">
        {t.summaryIntro}
      </Text>
      {prompt === null || prompt === '' ? null : (
        <Text testID="chapter-summary-prompt" tone="secondary" variant="bodySmall">
          {prompt}
        </Text>
      )}
      <TextInput
        accessibilityLabel={t.summaryTitle}
        editable={online}
        multiline
        onChangeText={(value) => {
          setText(value);
          setNotice(null);
        }}
        placeholder={t.summaryPlaceholder}
        placeholderTextColor={theme.colors.inkMuted}
        style={styles.input}
        testID="course-summary-input"
        value={text}
      />
      {notice === null ? null : (
        <Text testID="chapter-summary-notice" tone="danger" variant="caption">
          {notice}
        </Text>
      )}
      {online ? null : (
        <Text testID="chapter-summary-offline" tone="secondary" variant="caption">
          {m.offline.write}
        </Text>
      )}
      <Button
        disabled={!online || pending}
        label={t.summaryAction}
        loading={pending}
        onPress={() => {
          if (text.trim() === '') {
            setNotice(t.summaryEmpty);
            return;
          }
          onSubmit(text.trim());
        }}
        testID="course-summary-submit"
        variant="ink"
      />
      {failed ? (
        <Text testID="chapter-summary-error" tone="danger" variant="caption">
          {t.summaryError}
        </Text>
      ) : null}
      {initial === null ? null : feedback === null ? (
        <Text testID="chapter-summary-deferred" tone="danger" variant="bodySmall">
          {t.summaryDeferred}
        </Text>
      ) : (
        <View testID="chapter-summary-feedback" style={styles.feedback}>
          <Text variant="title">{t.summaryFeedbackTitle}</Text>
          <Text tone="secondary" variant="bodySmall">
            {feedback.message}
          </Text>
          {feedback.missing.length === 0 ? null : (
            <View style={styles.missing}>
              <Text variant="label">{t.summaryMissing}</Text>
              {feedback.missing.map((point) => (
                <Text key={point} tone="secondary" variant="caption">
                  • {point}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: radius.card,
    padding: theme.spacing.lg,
  },
  input: {
    ...theme.type.body,
    color: theme.colors.ink,
    minHeight: 96,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: radius.control,
    padding: theme.spacing.md,
    textAlignVertical: 'top',
  },
  feedback: {
    backgroundColor: theme.colors.greenSoft,
    borderRadius: radius.control,
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
  },
  missing: { gap: theme.spacing.xs },
});
