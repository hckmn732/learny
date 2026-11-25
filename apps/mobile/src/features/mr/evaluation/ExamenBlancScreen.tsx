// Examen blanc (zone C, maquette ExamenBlanc.dc.html).
//
// Trois phases : introduction (règles, format, diagnostic), épreuve (progression, chronomètre,
// navigation) et résultat. L'écran orchestre les lectures de `use-mock-exam.ts` et ne décide rien :
// le format, l'échéance, la correction et le verdict viennent du serveur (SPEC-614).
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { messageFor } from '../../../api/errors';
import { theme } from '../../../theme';
import { Button } from '../../../ui/Button';
import { ErrorState } from '../../../ui/ErrorState';
import { Skeleton } from '../../../ui/Skeleton';
import { Text } from '../../../ui/Text';

import { ExamIntro } from './ExamIntro';
import { ExamPaper } from './ExamPaper';
import { ExamResult } from './ExamResult';
import {
  confirmExamFormat,
  markExamQuestion,
  saveExamAnswer,
  startExam,
  submitExam,
  useExamAttempt,
  useExamIntro,
  useExamResult,
} from './use-mock-exam';

const t = fr.mr.evaluation.examenBlanc;

type Phase = 'intro' | 'paper' | 'result';

export interface ExamenBlancScreenProps {
  readonly formationId: string;
  readonly onClose: () => void;
}

/** Écran complet de l'examen blanc, de l'introduction au résultat. */
export function ExamenBlancScreen({ formationId, onClose }: ExamenBlancScreenProps) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intro = useExamIntro(formationId);
  const attempt = useExamAttempt(phase === 'paper' ? attemptId : null);
  const result = useExamResult(phase === 'result' ? attemptId : null);

  async function start(): Promise<void> {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const id = await startExam(formationId);
      setAttemptId(id);
      setPhase('paper');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setPending(false);
    }
  }

  async function confirm(): Promise<void> {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await confirmExamFormat(formationId);
      await intro.refresh();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setPending(false);
    }
  }

  async function submit(): Promise<void> {
    if (attemptId === null) return;
    setPending(true);
    setError(null);
    try {
      await submitExam(attemptId);
      setPhase('result');
    } catch (cause) {
      setError(messageFor(cause));
      throw cause;
    } finally {
      setPending(false);
    }
  }

  function save(position: number, response: unknown, timeMs: number): void {
    if (attemptId === null) return;
    void saveExamAnswer({ attemptId, position, response, timeMs }).catch((cause: unknown) => {
      setError(`${t.saveError} ${messageFor(cause)}`);
    });
  }

  function mark(position: number, marked: boolean): void {
    if (attemptId === null) return;
    void markExamQuestion({ attemptId, position, marked }).catch((cause: unknown) => {
      setError(`${t.saveError} ${messageFor(cause)}`);
    });
  }

  function restart(): void {
    setAttemptId(null);
    setPhase('intro');
    setError(null);
    intro.retry();
  }

  function seeLast(): void {
    const id = intro.data?.lastAttempt?.attemptId ?? null;
    if (id === null) return;
    setAttemptId(id);
    setPhase('result');
  }

  const loading =
    (phase === 'intro' && intro.status === 'loading') ||
    (phase === 'paper' && attempt.status === 'loading') ||
    (phase === 'result' && result.status === 'loading');

  return (
    <View style={styles.screen} testID="qf-examen-blanc">
      {phase === 'intro' && intro.status === 'error' ? (
        <View style={styles.state}>
          <ErrorState
            title={t.introError}
            onRetry={intro.retry}
            testID="qf-examen-blanc-intro-error-state"
          />
        </View>
      ) : null}

      {loading ? (
        <View style={styles.state}>
          <Skeleton animated={false} />
          <Skeleton animated={false} width="70%" />
        </View>
      ) : null}

      {phase === 'intro' && intro.data !== null ? (
        <ExamIntro
          intro={intro.data}
          pending={pending}
          error={error}
          onBack={onClose}
          onStart={() => {
            void start();
          }}
          onConfirmFormat={() => {
            void confirm();
          }}
          onSeeResult={seeLast}
        />
      ) : null}

      {phase === 'paper' && attempt.data !== null && attempt.data.status === 'in_progress' ? (
        <ExamPaper
          attempt={attempt.data}
          submitting={pending}
          error={error}
          onSave={save}
          onMark={mark}
          onSubmit={submit}
          onQuit={onClose}
        />
      ) : null}

      {phase === 'paper' && attempt.data !== null && attempt.data.status !== 'in_progress' ? (
        <View style={styles.state}>
          <Text variant="sectionTitle">{t.resultTitle}</Text>
          <Button
            label={t.seeResult}
            onPress={() => {
              setPhase('result');
            }}
            testID="qf-examen-blanc-open-result"
          />
        </View>
      ) : null}

      {phase === 'result' && result.status === 'error' ? (
        <View style={styles.state}>
          <ErrorState
            title={t.resultError}
            onRetry={result.retry}
            testID="qf-examen-blanc-result-error"
          />
        </View>
      ) : null}

      {phase === 'result' && result.data !== null ? (
        <ExamResult result={result.data} onRestart={restart} onClose={onClose} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  state: {
    flex: 1,
    justifyContent: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.xl,
  },
});