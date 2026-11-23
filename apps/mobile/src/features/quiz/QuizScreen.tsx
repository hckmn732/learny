// Screen of the validation quiz (SPEC-3304 EF-2 to EF-5, ET-2 to ET-4, CA-1, CA-2, CA-4).
//
// The screen owns the local state machine of the question (choice → check → corrected) and nothing
// else: the correction comes from `…/check`, the score from the server (ET-3). The body reuses
// `BrickView` in playing mode (SPEC-3301), so the quiz renders the same bricks as the course.
//
// EF-5: the cross and the Android back gesture open « Quitter le quiz ? »; the answers are already
// saved as drafts, so leaving loses nothing and reopening resumes on the first unanswered question.
import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AnyPublicPayload } from '@learny/bricks';
import type { AttemptDto, QuizFeedback } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { BrickView } from '../../bricks/BrickView';
import { clock } from '../../lib/clock';
import { successFeedback, warningFeedback } from '../../lib/haptics';
import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Skeleton } from '../../ui/Skeleton';
import { Text } from '../../ui/Text';

import { isPendingCorrection, toCorrectionView } from './correction-view';
import { progressSegments } from './progress-segments';
import {
  applyFeedback,
  canCheck,
  failCheck,
  firstOpenIndex,
  initialStates,
  isLastQuestion,
  replaceState,
  selectAnswer,
  startCheck,
  type QuestionState,
} from './question-machine';
import { QuitConfirmSheet } from './QuitConfirmSheet';
import { QuizHeader } from './QuizHeader';

const t = fr.mobile.quiz;

export interface QuizScreenProps {
  readonly attempt: AttemptDto;
  /** Checks one answer and returns the correction of the server (ET-1, ET-2). */
  readonly onCheck: (input: {
    position: number;
    response: unknown;
    timeMs: number;
  }) => Promise<QuizFeedback>;
  /** Saves the draft of one answer, best effort (BR-QUI-02). */
  readonly onSave?: (input: { position: number; response: unknown; timeMs: number }) => void;
  /** Submits the attempt and opens the result (EF-6). */
  readonly onFinish: () => Promise<void>;
  readonly onQuit: () => void;
  readonly onOpenResource?: (resourceId: string) => void;
  readonly onOpenWeb?: () => void;
}

/** One attempt being played, question by question. */
export function QuizScreen({
  attempt,
  onCheck,
  onSave,
  onFinish,
  onQuit,
  onOpenResource,
  onOpenWeb,
}: QuizScreenProps) {
  const insets = useSafeAreaInsets();
  const [states, setStates] = useState<QuestionState[]>(() => initialStates(attempt.questions));
  const [index, setIndex] = useState<number>(() => firstOpenIndex(states));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quitVisible, setQuitVisible] = useState(false);
  const startedAt = useRef<number>(clock.now().getTime());

  const state = states[index];
  const question = attempt.questions[index];
  const total = attempt.questions.length;
  const segments = useMemo(() => progressSegments(states, index), [states, index]);
  const last = isLastQuestion(states, index);
  const correction = useMemo(() => toCorrectionView(state?.feedback ?? null), [state?.feedback]);

  // A new question restarts the per-question timer (ET-2). The clock is the injected one (ADR-0047).
  useEffect(() => {
    startedAt.current = clock.now().getTime();
  }, [index]);

  // ET-4 — the Android back gesture asks the same question as the cross (EF-5).
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setQuitVisible(true);
      return true;
    });
    return () => {
      subscription.remove();
    };
  }, []);

  if (state === undefined || question === undefined) {
    return (
      <View style={styles.screen}>
        <Skeleton animated={false} />
      </View>
    );
  }

  // ET-2 — the time spent on the question is read when the answer is chosen or checked, never
  // during the render (a ref is not a render value).
  function elapsedMs(): number {
    return Math.max(0, clock.now().getTime() - startedAt.current);
  }

  function choose(response: unknown): void {
    if (busy || state === undefined) return;
    const next = selectAnswer(state, response);
    if (next === state) return;
    setStates((current) => replaceState(current, next.position, next));
    onSave?.({ position: next.position, response, timeMs: elapsedMs() });
  }

  async function check(): Promise<void> {
    if (busy || state === undefined || !canCheck(state)) return;
    setBusy(true);
    setError(null);
    const checking = startCheck(state);
    setStates((current) => replaceState(current, checking.position, checking));
    try {
      const feedback = await onCheck({
        position: checking.position,
        response: checking.response,
        timeMs: elapsedMs(),
      });
      setStates((current) =>
        replaceState(current, checking.position, applyFeedback(checking, feedback)),
      );
      if (feedback.isCorrect === true) successFeedback();
      if (feedback.isCorrect === false) warningFeedback();
    } catch {
      // CL-1 — the selection is kept and « Réessayer » replays the same check.
      setStates((current) => replaceState(current, checking.position, failCheck(checking)));
      setError(t.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function next(): Promise<void> {
    if (last) {
      setBusy(true);
      try {
        await onFinish();
      } catch {
        setError(t.saveFailed);
        setBusy(false);
      }
      return;
    }
    setIndex((current) => Math.min(current + 1, total - 1));
  }

  const checked = state.phase === 'checked';
  const pending = checked && isPendingCorrection(state.feedback);
  const label = question.type === 'open_question' ? `${t.open} ${t.consigne}` : t.consigne;

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + theme.spacing.md }]}>
      <QuizHeader
        position={index + 1}
        total={total}
        attemptNo={attempt.attemptNo}
        threshold={attempt.threshold}
        segments={segments}
        onQuit={() => {
          setQuitVisible(true);
        }}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.tagRow}>
          <View style={styles.tag}>
            <Text variant="label" tone="muted" testID="quiz-question-type">
              {`${question.typeLabel.toUpperCase()} · ${question.notionLabel.toUpperCase()}`}
            </Text>
          </View>
        </View>

        <View testID="quiz-question" style={styles.question}>
          <BrickView
            brick={{
              brickId: question.brickVersionId,
              versionId: question.brickVersionId,
              type: question.type,
              notionIds: [],
              publicPayload: question.payload as AnyPublicPayload,
            }}
            mode="play"
            {...(correction === undefined ? {} : { correction })}
            response={state.response}
            onResponse={choose}
            disabled={checked || busy}
            {...(onOpenResource === undefined ? {} : { onOpenResource })}
            {...(onOpenWeb === undefined ? {} : { onOpenWeb })}
            testID="quiz-brick"
          />
        </View>

        <Text variant="caption" tone="muted" testID="quiz-consigne">
          {label}
        </Text>

        {pending ? (
          <Text variant="caption" tone="secondary" testID="quiz-open-pending">
            {t.openPending}
          </Text>
        ) : null}

        <Text variant="caption" tone="muted" testID="quiz-mention">
          {t.mention}
        </Text>

        {error === null ? null : (
          <View style={styles.errorBox} testID="quiz-error">
            <Text variant="bodySmall" tone="danger" testID="quiz-error-message">
              {error}
            </Text>
            <Button
              label={t.retry}
              variant="outline"
              size="sm"
              onPress={() => void check()}
              testID="quiz-error-retry"
            />
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {checked ? (
          <Button
            label={last ? t.finish : t.next}
            variant="ink"
            block
            loading={busy}
            onPress={() => void next()}
            testID={last ? 'quiz-finish' : 'quiz-next'}
          />
        ) : (
          <Button
            label={t.check}
            block
            loading={busy}
            disabled={!canCheck(state)}
            onPress={() => void check()}
            testID="quiz-check"
          />
        )}
      </View>

      <QuitConfirmSheet
        visible={quitVisible}
        onQuit={() => {
          setQuitVisible(false);
          onQuit();
        }}
        onCancel={() => {
          setQuitVisible(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  content: {
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  tagRow: { flexDirection: 'row' },
  tag: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.indigoSoft,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  question: { gap: theme.spacing.md },
  errorBox: {
    gap: theme.spacing.sm,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.dangerSoft,
    padding: theme.spacing.md,
  },
  footer: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
  },
});
