// Exercice pratique plein écran (zone C, maquette Exercice.dc.html).
//
// Consigne, barème, saisie de la production, indices, soumission et correction par critère. Le
// rendu ne calcule rien : le score, le verdict, les points et la maîtrise viennent de
// `exercises.submit` (SPEC-613 EF-2). Le chronomètre lit l'horloge injectable (`src/lib/clock.ts`,
// ADR-0047) et jamais `Date.now()`.
import { useCallback, useEffect, useState } from 'react';
import { Alert, BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  ExerciseCorrection,
  ExerciseSubmission,
  PracticeExerciseDto,
} from '@learny/contracts';
import { fr } from '@learny/i18n';

import { messageFor } from '../../../api/errors';
import { clock } from '../../../lib/clock';
import { Glow, Pop, Rise } from '../motion';
import { theme } from '../../../theme';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Chip } from '../../../ui/Chip';
import { Icon } from '../../../ui/Icon';
import { IconButton } from '../../../ui/IconButton';
import { Markdown } from '../../../ui/Markdown';
import { ProgressBar } from '../../../ui/ProgressBar';
import { Text } from '../../../ui/Text';

import { ProductionInput } from './ProductionInput';
import { requestExerciseHint, submitExercise } from './use-exercise';

const t = fr.mr.evaluation.exercice;
const ex = fr.exercises;

function emptySubmissionOf(exercise: PracticeExerciseDto): ExerciseSubmission {
  const production = exercise.instruction.production;
  if (production.kind === 'table') {
    return {
      kind: 'table',
      fields: {},
      rows: Array.from({ length: production.initialRows }, () => ({})),
      explanation: '',
    };
  }
  if (production.kind === 'link') return { kind: 'link', url: '', explanation: '' };
  if (production.kind === 'file') return { kind: 'file', resourceId: '', explanation: '' };
  return { kind: 'text', text: '', explanation: '' };
}

function hasProduction(submission: ExerciseSubmission): boolean {
  if (submission.kind === 'text') return submission.text.trim() !== '';
  if (submission.kind === 'link') return submission.url.trim() !== '';
  if (submission.kind === 'file') return submission.resourceId.trim() !== '';
  const filled = (row: Record<string, string>): boolean =>
    Object.values(row).some((value) => value.trim() !== '');
  return (
    Object.values(submission.fields).some((value) => value.trim() !== '') ||
    submission.rows.some(filled)
  );
}

/** `mm:ss`, ou `h:mm:ss` au-delà d'une heure. */
function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${String(hours)}:${mm}:${ss}` : `${mm}:${ss}`;
}

export interface ExerciceScreenProps {
  readonly exercise: PracticeExerciseDto;
  readonly onClose: () => void;
  /** Ouvre le tuteur (`/tuteur`) pour poser une question. */
  readonly onAskTutor: () => void;
  /** Ouvre la suite proposée par la correction (chemin web). */
  readonly onOpenNextStep: (href: string) => void;
}

/** Écran d'un exercice pratique, de la consigne à la correction. */
export function ExerciceScreen({
  exercise,
  onClose,
  onAskTutor,
  onOpenNextStep,
}: ExerciceScreenProps) {
  const insets = useSafeAreaInsets();
  const instruction = exercise.instruction;
  const [submission, setSubmission] = useState<ExerciseSubmission>(
    exercise.attempt?.submission ?? emptySubmissionOf(exercise),
  );
  const [correction, setCorrection] = useState<ExerciseCorrection | null>(
    exercise.attempt?.correction ?? null,
  );
  const [hintsUsed, setHintsUsed] = useState(exercise.hintsUsed);
  const [revealedHints, setRevealedHints] = useState<readonly string[]>(exercise.revealedHints);
  const [maxScore, setMaxScore] = useState(exercise.maxScore);
  const [masteryAfter, setMasteryAfter] = useState<number | null>(
    exercise.attempt?.masteryAfter ?? null,
  );
  const [busy, setBusy] = useState<'hint' | 'submit' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt] = useState<number>(() => clock.now().getTime());
  const [now, setNow] = useState<number>(() => clock.now().getTime());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(clock.now().getTime());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const time = formatElapsed(elapsed);
  const mastery = correction === null ? exercise.mastery : (masteryAfter ?? exercise.mastery);
  const hintsLeft = Math.max(0, 2 - hintsUsed);
  const latestHint = revealedHints[revealedHints.length - 1];

  const requestQuit = useCallback((): void => {
    if (correction !== null || !hasProduction(submission)) {
      onClose();
      return;
    }
    Alert.alert(t.quitTitle, t.quitBody, [
      { text: t.quitStay, style: 'cancel' },
      { text: t.quitLeave, style: 'destructive', onPress: onClose },
    ]);
  }, [correction, onClose, submission]);

  // Le geste « retour » d'Android pose la même question que la croix (comme le quiz).
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      requestQuit();
      return true;
    });
    return () => {
      subscription.remove();
    };
  }, [requestQuit]);

  async function askHint(): Promise<void> {
    if (busy !== null || correction !== null) return;
    setBusy('hint');
    setError(null);
    try {
      const result = await requestExerciseHint({
        moduleId: exercise.moduleId,
        exerciseId: exercise.exerciseId,
      });
      setHintsUsed(result.hintsUsed);
      setRevealedHints((previous) => [...previous, result.hintText]);
      setMaxScore(result.maxScore);
    } catch (cause) {
      setError(`${t.hintError} ${messageFor(cause)}`);
    } finally {
      setBusy(null);
    }
  }

  async function submit(): Promise<void> {
    if (busy !== null || correction !== null) return;
    if (!hasProduction(submission)) {
      setError(t.emptyProduction);
      return;
    }
    setBusy('submit');
    setError(null);
    try {
      const result = await submitExercise({
        exerciseId: exercise.exerciseId,
        submission,
      });
      setCorrection(result.correction);
      setMasteryAfter(result.masteryAfter);
    } catch (cause) {
      setError(`${t.submitError} ${messageFor(cause)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.screen} testID="qf-exercice">
      <View style={[styles.nav, { paddingTop: insets.top + theme.spacing.lg }]}>
        <IconButton
          name="x"
          accessibilityLabel={t.quit}
          onPress={requestQuit}
          testID="qf-exercice-close"
        />
        <Text variant="bodySmall" tone="secondary" numberOfLines={1} style={styles.grow}>
          {t.header(instruction.title)}
        </Text>
        <Glow spread={4}>
          <View
            style={styles.timer}
            accessibilityLabel={t.timerAria(time)}
            accessibilityRole="text"
            testID="qf-exercice-timer"
          >
            <Icon name="clock" size={16} color={theme.colors.lime} />
            <Text variant="buttonSmall" style={styles.timerText}>
              {time}
            </Text>
          </View>
        </Glow>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        testID="qf-exercice-scroll"
      >
        <Rise index={0}>
          <Card testID="qf-exercice-brief">
            <Text variant="label" tone="indigo">
              {t.consigne}
            </Text>
            <Markdown markdown={instruction.taskMd} />
            {instruction.data.length === 0 ? null : (
              <View style={styles.chips}>
                {instruction.data.map((entry) => (
                  <Chip key={entry} label={entry} tone="neutral" />
                ))}
              </View>
            )}
            <Text variant="caption" tone="secondary">
              {t.deliverable(instruction.deliverable)}
            </Text>
          </Card>
        </Rise>

        <Rise index={1}>
          <Card testID="qf-exercice-scale">
            <Text variant="sectionTitle">{t.scoresTitle(maxScore)}</Text>
            {instruction.criteria.map((criterion) => (
              <View key={criterion.key} style={styles.criterion}>
                <Text variant="bodySmall" style={styles.grow}>
                  {criterion.label}
                </Text>
                <Text variant="bodySmall" tone="secondary">
                  {t.points(criterion.points)}
                </Text>
              </View>
            ))}
            <Text variant="caption" tone="muted">
              {ex.scaleHint}
            </Text>
          </Card>
        </Rise>

        <Card testID="qf-exercice-entry">
          <Text variant="sectionTitle">{t.entry}</Text>
          <ProductionInput
            instruction={instruction}
            submission={submission}
            onChange={setSubmission}
            disabled={correction !== null || busy !== null}
          />
        </Card>

        {latestHint === undefined ? null : (
          <View style={styles.hint} testID="qf-exercice-hint-box">
            <Text variant="label" tone="limeInk">
              {t.hintUsed(hintsUsed)}
            </Text>
            <Text variant="bodySmall" tone="limeInk">
              {latestHint}
            </Text>
          </View>
        )}

        {correction === null ? (
          <Button
            label={hintsLeft === 0 ? t.noHints : ex.hint}
            variant="outline"
            size="sm"
            loading={busy === 'hint'}
            disabled={busy !== null || hintsLeft === 0 || instruction.hints.length <= hintsUsed}
            onPress={() => {
              void askHint();
            }}
            testID="qf-exercice-hint"
          />
        ) : null}

        {error === null ? null : (
          <Text variant="caption" tone="danger" testID="qf-exercice-error">
            {error}
          </Text>
        )}

        {correction === null ? null : (
          <Card testID="qf-exercice-correction">
            <View style={styles.correctionHead}>
              <View style={styles.grow}>
                <Text variant="label" tone="muted">
                  {t.correctionTitle}
                </Text>
                <Pop delay={200}>
                  <Text variant="figure" testID="qf-exercice-score">
                    {t.scoreLine(correction.score, correction.maxScore)}
                  </Text>
                </Pop>
              </View>
              <Chip
                label={correction.verdict === 'passed' ? ex.verdictPassed : ex.verdictRetry}
                tone={correction.verdict === 'passed' ? 'green' : 'orange'}
                testID="qf-exercice-verdict"
              />
            </View>

            {correction.criteria.map((criterion) => (
              <View
                key={criterion.key}
                style={styles.criterionResult}
                testID={`qf-exercice-criterion-${criterion.key}`}
              >
                <Chip label={criterion.ok ? '✓' : '✗'} tone={criterion.ok ? 'green' : 'orange'} />
                <View style={styles.grow}>
                  <Text variant="bodySmall">
                    {`${criterion.label} · ${t.points(criterion.earned)} / ${t.points(criterion.points)}`}
                  </Text>
                  <Text variant="caption" tone="secondary">
                    {criterion.comment}
                  </Text>
                </View>
              </View>
            ))}

            <Text variant="caption" tone="secondary">
              {`${t.summary} : ${correction.summary}`}
            </Text>

            <ProgressBar
              value={Math.max(0, Math.min(1, mastery / 100))}
              label={t.mastery(mastery)}
              testID="qf-exercice-mastery"
            />
            <Text variant="caption" tone="muted">
              {t.mastery(mastery)}
            </Text>
          </Card>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
        {correction === null ? (
          <View style={styles.footerRow}>
            <View style={styles.footerItem}>
              <Button
                label={t.askTutor}
                variant="outline"
                block
                onPress={onAskTutor}
                testID="qf-exercice-tutor"
              />
            </View>
            <View style={styles.footerItem}>
              <Button
                label={busy === 'submit' ? ex.submitting : ex.submit}
                block
                loading={busy === 'submit'}
                disabled={busy !== null}
                onPress={() => {
                  void submit();
                }}
                testID="qf-exercice-submit"
              />
            </View>
          </View>
        ) : (
          <View style={styles.footerRow}>
            <View style={styles.footerItem}>
              <Button
                label={t.nextStep}
                variant="outline"
                block
                onPress={() => {
                  onOpenNextStep(correction.nextStep.href);
                }}
                testID="qf-exercice-next"
              />
            </View>
            <View style={styles.footerItem}>
              <Button label={t.finish} block onPress={onClose} testID="qf-exercice-finish" />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.sm,
  },
  grow: { flex: 1 },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.ink,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  timerText: { color: theme.colors.lime },
  content: {
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xxxl,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  criterion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  criterionResult: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  correctionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  hint: {
    gap: theme.spacing.xs,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.limeSoft,
    padding: theme.spacing.md,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
  },
  footerRow: { flexDirection: 'row', gap: theme.spacing.sm },
  footerItem: { flex: 1 },
});
