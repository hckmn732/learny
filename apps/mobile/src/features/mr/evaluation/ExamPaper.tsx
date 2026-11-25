// Épreuve de l'examen blanc (zone C, maquette ExamenBlanc.dc.html, phase 2).
//
// Plein écran sombre, sans aide : progression, chronomètre, question, marqueur « à revoir » et
// navigation. Le chronomètre part du temps restant serveur (`ExamAttemptDto.remainingSeconds`) et
// décroît d'une seconde par seconde ; il ne lit jamais l'horloge murale pour éviter une dérive
// entre l'échéance du serveur et l'appareil. La remise à zéro déclenche la remise automatique.
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AnyPublicPayload } from '@learny/bricks';
import type { ExamAttemptDto, ExamQuestionDto } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { BrickView } from '../../../bricks/BrickView';
import { clock } from '../../../lib/clock';
import { Glow, Rise } from '../motion';
import { theme } from '../../../theme';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Icon } from '../../../ui/Icon';
import { IconButton } from '../../../ui/IconButton';
import { ProgressBar } from '../../../ui/ProgressBar';
import { Sheet } from '../../../ui/Sheet';
import { Text } from '../../../ui/Text';

const m = fr.mockExam;
const t = fr.mr.evaluation.examenBlanc;

/** `mm:ss`, ou `h:mm:ss` au-delà d'une heure. */
function formatRemaining(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${String(hours)}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** True when the response is non-empty, whatever the brick type (miroir de `isAnswered` du web). */
function isAnswered(question: ExamQuestionDto, value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Record<string, unknown>;
  if (question.type === 'choice_question') {
    return Array.isArray(data.optionIds) && data.optionIds.length > 0;
  }
  if (question.type === 'cloze') {
    const gaps = data.gaps;
    return (
      typeof gaps === 'object' &&
      gaps !== null &&
      Object.values(gaps).some((entry) => String(entry).trim() !== '')
    );
  }
  if (question.type === 'matching') {
    const pairs = data.pairs;
    return (
      typeof pairs === 'object' &&
      pairs !== null &&
      Object.values(pairs).some((entry) => entry !== null && entry !== '')
    );
  }
  return typeof data.text === 'string' && data.text.trim() !== '';
}

export interface ExamPaperProps {
  readonly attempt: ExamAttemptDto;
  readonly submitting: boolean;
  readonly error: string | null;
  readonly onSave: (position: number, response: unknown, timeMs: number) => void;
  readonly onMark: (position: number, marked: boolean) => void;
  readonly onSubmit: () => Promise<void>;
  readonly onQuit: () => void;
}

/** Écran de l'épreuve : une question à la fois, sans correction avant la remise. */
export function ExamPaper({
  attempt,
  submitting,
  error,
  onSave,
  onMark,
  onSubmit,
  onQuit,
}: ExamPaperProps) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, unknown>>(() => {
    const initial: Record<number, unknown> = {};
    for (const question of attempt.questions) {
      if (question.response !== undefined) initial[question.position] = question.response;
    }
    return initial;
  });
  const [marked, setMarked] = useState<ReadonlySet<number>>(
    () => new Set(attempt.questions.filter((question) => question.marked).map((q) => q.position)),
  );
  const [receivedAt] = useState<number>(() => clock.now().getTime());
  const [now, setNow] = useState<number>(() => clock.now().getTime());
  const [confirming, setConfirming] = useState(false);
  const submitted = useRef(false);
  const questionStartedAt = useRef<number>(clock.now().getTime());

  const question = attempt.questions[index];
  const total = attempt.questions.length;
  const isLast = index >= total - 1;

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(clock.now().getTime());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const elapsed = Math.max(0, Math.floor((now - receivedAt) / 1000));
  const remaining = Math.max(0, attempt.remainingSeconds - elapsed);

  useEffect(() => {
    questionStartedAt.current = clock.now().getTime();
  }, [index]);

  // Le temps écoulé remet l'examen sans intervention (BR-PRA-02).
  useEffect(() => {
    if (remaining > 0 || submitted.current) return;
    submitted.current = true;
    void onSubmit().catch(() => {
      submitted.current = false;
    });
  }, [onSubmit, remaining]);

  if (question === undefined) {
    return (
      <View
        style={[styles.screen, { paddingTop: insets.top + theme.spacing.xl }]}
        testID="qf-examen-blanc-paper"
      >
        <Text variant="body" tone="inverse" align="center">
          {m.errorTitle}
        </Text>
      </View>
    );
  }

  const answeredCount = attempt.questions.filter((entry) =>
    isAnswered(entry, answers[entry.position]),
  ).length;
  const isMarked = marked.has(question.position);
  const time = formatRemaining(remaining);

  function change(response: unknown): void {
    if (question === undefined) return;
    setAnswers((current) => ({ ...current, [question.position]: response }));
    const timeMs = Math.max(0, clock.now().getTime() - questionStartedAt.current);
    onSave(question.position, response, timeMs);
  }

  function toggleMark(): void {
    if (question === undefined) return;
    const next = !marked.has(question.position);
    setMarked((current) => {
      const copy = new Set(current);
      if (next) copy.add(question.position);
      else copy.delete(question.position);
      return copy;
    });
    onMark(question.position, next);
  }

  function go(delta: number): void {
    setIndex((current) => Math.min(total - 1, Math.max(0, current + delta)));
  }

  function askQuit(): void {
    Alert.alert(t.quitTitle, t.quitBody, [
      { text: t.quitStay, style: 'cancel' },
      { text: t.quitLeave, style: 'destructive', onPress: onQuit },
    ]);
  }

  async function confirmSubmit(): Promise<void> {
    if (submitted.current) return;
    submitted.current = true;
    try {
      await onSubmit();
    } catch {
      submitted.current = false;
    }
  }

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: insets.top + theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.md,
        },
      ]}
      testID="qf-examen-blanc-paper"
    >
      <View style={styles.header}>
        <IconButton
          name="close"
          accessibilityLabel={t.quit}
          variant="surface"
          onPress={askQuit}
          testID="qf-examen-blanc-quit"
        />
        <View style={styles.grow}>
          <Text variant="bodySmall" tone="onDarkSecondary" testID="qf-examen-blanc-counter">
            {`${m.examTitle} · ${m.questionCounter(index + 1, total)}`}
          </Text>
          <Text variant="caption" tone="onDarkMuted">
            {m.answered(answeredCount, total)}
          </Text>
        </View>
        <Glow spread={4}>
          <View
            style={styles.timer}
            accessibilityLabel={t.timerAria(time)}
            accessibilityRole="text"
            testID="qf-examen-blanc-timer"
          >
            <Text variant="buttonSmall" style={styles.timerText}>
              {time}
            </Text>
          </View>
        </Glow>
      </View>

      <ProgressBar
        value={(index + 1) / total}
        label={t.progress}
        onDark
        testID="qf-examen-blanc-progress"
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="eyebrow" tone="onDarkMuted">
          {`${question.typeLabel.toUpperCase()} · ${question.notionLabel.toUpperCase()}`}
        </Text>

        <Rise key={question.position} distance={20}>
          <Card testID="qf-examen-blanc-question">
            <BrickView
              brick={{
                brickId: question.brickVersionId,
                versionId: question.brickVersionId,
                type: question.type,
                notionIds: [],
                publicPayload: question.payload as AnyPublicPayload,
              }}
              mode="play"
              response={answers[question.position] ?? null}
              onResponse={change}
              disabled={false}
              testID="qf-examen-blanc-brick"
            />
          </Card>
        </Rise>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={isMarked ? m.unmark : m.mark}
          accessibilityState={{ checked: isMarked }}
          onPress={toggleMark}
          style={styles.markRow}
          testID="qf-examen-blanc-mark"
        >
          <View style={[styles.checkbox, isMarked ? styles.checkboxOn : null]}>
            {isMarked ? <Icon name="check" size={14} color={theme.colors.ink} /> : null}
          </View>
          <Text variant="bodySmall" tone="onDarkSecondary">
            {isMarked ? m.unmark : m.mark}
          </Text>
        </Pressable>

        {error === null ? null : (
          <Text variant="caption" style={styles.error} testID="qf-examen-blanc-paper-error">
            {error}
          </Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerItem}>
          <Button
            label={m.previous}
            variant="outline"
            block
            disabled={index === 0 || submitting}
            onPress={() => {
              go(-1);
            }}
            testID="qf-examen-blanc-previous"
          />
        </View>
        <View style={styles.footerItem}>
          <Button
            label={isLast ? m.finish : m.next}
            block
            disabled={submitting}
            onPress={() => {
              if (isLast) setConfirming(true);
              else go(1);
            }}
            testID={isLast ? 'qf-examen-blanc-finish' : 'qf-examen-blanc-next'}
          />
        </View>
      </View>

      <Sheet
        visible={confirming}
        onClose={() => {
          setConfirming(false);
        }}
        title={m.confirmTitle}
        testID="qf-examen-blanc-confirm"
      >
        <Text variant="bodySmall" tone="secondary">
          {m.confirmText(total - answeredCount, marked.size, Math.ceil(remaining / 60))}
        </Text>
        <Button
          label={m.cancelFinish}
          variant="outline"
          block
          disabled={submitting}
          onPress={() => {
            setConfirming(false);
          }}
          testID="qf-examen-blanc-confirm-cancel"
        />
        <Button
          label={submitting ? m.saving : m.confirmFinish}
          block
          loading={submitting}
          onPress={() => {
            void confirmSubmit();
          }}
          testID="qf-examen-blanc-confirm-submit"
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.ink,
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  grow: { flex: 1, gap: 2 },
  timer: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.darkSurface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  timerText: { color: theme.colors.lime },
  content: { gap: theme.spacing.md, paddingBottom: theme.spacing.xxxl },
  markRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: theme.minTouchTarget.height,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.badge,
    borderWidth: 1,
    borderColor: theme.colors.onDarkFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: theme.colors.lime, borderColor: theme.colors.lime },
  error: { color: theme.colors.orange },
  footer: { flexDirection: 'row', gap: theme.spacing.sm },
  footerItem: { flex: 1 },
});
