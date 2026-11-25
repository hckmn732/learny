// Données de l'examen blanc (zone C, écran `aujourdhui/examen-blanc/[activityId]`).
//
// Le format et l'échéance viennent du serveur (SPEC-614) : `exam.intro` pour l'introduction,
// `exam.attempts.create` pour lancer ou reprendre, `exam.attempts.get` pour l'épreuve et son temps
// restant, `exam.answers.save` et `exam.questions.mark` pour les écritures, `exam.attempts.submit`
// puis `exam.attempts.result` pour la correction. Aucune bonne réponse n'est présente avant la
// remise : la correction est lue, jamais recalculée.
import { useQuery } from '@tanstack/react-query';

import type {
  ExamAttemptDto,
  ExamFormatSchema,
  ExamIntroDto,
  ExamResultDto,
  ExamSubmitOutput,
  MarkExamQuestionOutput,
} from '@learny/contracts';

import { requireApiClient } from '../../../api/registry';

export type ExamStatus = 'loading' | 'error' | 'ready';

export interface ExamIntroQuery {
  readonly status: ExamStatus;
  readonly data: ExamIntroDto | null;
  readonly retry: () => void;
  readonly refresh: () => Promise<void>;
}

/** Format, modules étudiés, diagnostic et prochains examens (SPEC-614 EF-1). */
export function useExamIntro(formationId: string | null): ExamIntroQuery {
  const query = useQuery({
    queryKey: ['mr', 'exam-intro', formationId ?? 'none'],
    queryFn: () =>
      requireApiClient().api.getExamIntro({ params: { fid: formationId ?? '' } }),
    enabled: formationId !== null,
    staleTime: 0,
  });
  return {
    status: query.isError ? 'error' : query.data === undefined ? 'loading' : 'ready',
    data: query.data ?? null,
    retry: () => {
      void query.refetch();
    },
    refresh: async () => {
      await query.refetch();
    },
  };
}

export interface ExamAttemptQuery {
  readonly status: ExamStatus;
  readonly data: ExamAttemptDto | null;
  readonly retry: () => void;
}

/** La tentative d'examen, ses réponses, ses marqueurs et le temps restant serveur (ET-4). */
export function useExamAttempt(attemptId: string | null): ExamAttemptQuery {
  const query = useQuery({
    queryKey: ['mr', 'exam-attempt', attemptId ?? 'none'],
    queryFn: () =>
      requireApiClient().api.getExamAttempt({ params: { aid: attemptId ?? '' } }),
    enabled: attemptId !== null,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  return {
    status: query.isError ? 'error' : query.data === undefined ? 'loading' : 'ready',
    data: query.data ?? null,
    retry: () => {
      void query.refetch();
    },
  };
}

export interface ExamResultQuery {
  readonly status: ExamStatus;
  readonly data: ExamResultDto | null;
  readonly retry: () => void;
}

/** Les résultats, les lacunes des modules étudiés et la revue (ET-5). */
export function useExamResult(attemptId: string | null): ExamResultQuery {
  const query = useQuery({
    queryKey: ['mr', 'exam-result', attemptId ?? 'none'],
    queryFn: () =>
      requireApiClient().api.getExamResult({ params: { aid: attemptId ?? '' } }),
    enabled: attemptId !== null,
    staleTime: 0,
  });
  return {
    status: query.isError ? 'error' : query.data === undefined ? 'loading' : 'ready',
    data: query.data ?? null,
    retry: () => {
      void query.refetch();
    },
  };
}

/** Confirme le format extrait d'un guide avant la première épreuve (ET-3, CA-1). */
export async function confirmExamFormat(formationId: string): Promise<ExamFormatSchema> {
  return requireApiClient().api.confirmExamFormatRoute({
    params: { fid: formationId },
    body: { confirmed: true },
  });
}

/** Lance un examen ou reprend la tentative en cours avec son temps restant. */
export async function startExam(formationId: string): Promise<string> {
  const started = await requireApiClient().api.startExamAttempt({
    params: { fid: formationId },
  });
  return started.attemptId;
}

/** Enregistre une réponse sans révéler sa correction. */
export async function saveExamAnswer(input: {
  readonly attemptId: string;
  readonly position: number;
  readonly response: unknown;
  readonly timeMs: number;
}): Promise<void> {
  await requireApiClient().api.saveExamAnswer({
    params: { aid: input.attemptId, pos: input.position },
    body: {
      response: input.response,
      timeMs: Math.min(1_800_000, Math.max(0, Math.round(input.timeMs))),
    },
  });
}

/** Marque ou démarque une question « à revoir » (BR-PRA-03). */
export async function markExamQuestion(input: {
  readonly attemptId: string;
  readonly position: number;
  readonly marked: boolean;
}): Promise<MarkExamQuestionOutput> {
  return requireApiClient().api.markExamQuestion({
    params: { aid: input.attemptId, pos: input.position },
    body: { marked: input.marked },
  });
}

/** Termine l'examen ; la correction est immédiate côté serveur. */
export async function submitExam(attemptId: string): Promise<ExamSubmitOutput> {
  return requireApiClient().api.submitExamAttempt({ params: { aid: attemptId } });
}