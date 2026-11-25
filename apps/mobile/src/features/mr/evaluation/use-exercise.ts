// Données de l'exercice pratique (zone C, écran `exercice/[brickId]`).
//
// Toute la correction vient du serveur : `exercises.detail` pour la consigne et la dernière
// tentative, `exercises.hint` pour les deux indices, `exercises.submit` pour la correction par
// critère et la maîtrise, `exercises.start` pour une nouvelle tentative (SPEC-613). Le client ne
// calcule ni score, ni points, ni verdict.
import { useQuery } from '@tanstack/react-query';

import type {
  ExerciseAttemptState,
  ExerciseHintResult,
  ExerciseSubmission,
  ExerciseSubmissionResult,
  PracticeExerciseDto,
} from '@learny/contracts';

import { idempotencyRegistry } from '../../../api/idempotency';
import { requireApiClient } from '../../../api/registry';

export type ExerciseStatus = 'loading' | 'error' | 'ready';

export interface ExerciseQuery {
  readonly status: ExerciseStatus;
  readonly data: PracticeExerciseDto | null;
  readonly retry: () => void;
}

/** L'exercice, sa dernière tentative, les indices révélés et la maîtrise (ET-1). */
export function useExerciseDetail(
  formationId: string | null,
  moduleId: string | null,
  exerciseId: string | null,
): ExerciseQuery {
  const enabled = formationId !== null && moduleId !== null && exerciseId !== null;
  const query = useQuery({
    queryKey: ['mr', 'exercise', exerciseId ?? 'none'],
    queryFn: () =>
      requireApiClient().api.exerciseDetail({
        params: {
          fid: formationId ?? '',
          mid: moduleId ?? '',
          aid: exerciseId ?? '',
        },
      }),
    enabled,
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

/** Révèle le prochain indice (deux au maximum, chaque indice retire un point). */
export async function requestExerciseHint(input: {
  readonly moduleId: string;
  readonly exerciseId: string;
}): Promise<ExerciseHintResult> {
  const intent = `mr-exercise-hint:${input.exerciseId}`;
  try {
    const result = await requireApiClient().api.exerciseHint(
      { params: { mid: input.moduleId, aid: input.exerciseId }, body: {} },
      { idempotencyKey: idempotencyRegistry.keyFor(intent) },
    );
    idempotencyRegistry.resolve(intent);
    return result;
  } catch (cause) {
    idempotencyRegistry.resolve(intent);
    throw cause;
  }
}

/** Envoie la production ; le serveur applique les contrôles puis la correction du tuteur. */
export async function submitExercise(input: {
  readonly exerciseId: string;
  readonly submission: ExerciseSubmission;
}): Promise<ExerciseSubmissionResult> {
  const intent = `mr-exercise-submit:${input.exerciseId}`;
  try {
    const result = await requireApiClient().api.exerciseSubmit(
      { params: { aid: input.exerciseId }, body: { submission: input.submission } },
      { idempotencyKey: idempotencyRegistry.keyFor(intent) },
    );
    idempotencyRegistry.resolve(intent);
    return result;
  } catch (cause) {
    idempotencyRegistry.resolve(intent);
    throw cause;
  }
}

/** Ouvre (ou reprend) l'unique tentative en cours d'un exercice. */
export async function startExercise(input: {
  readonly moduleId: string;
  readonly exerciseId: string;
}): Promise<ExerciseAttemptState> {
  const intent = `mr-exercise-start:${input.exerciseId}`;
  try {
    const result = await requireApiClient().api.exerciseStart(
      { params: { mid: input.moduleId, aid: input.exerciseId }, body: {} },
      { idempotencyKey: idempotencyRegistry.keyFor(intent) },
    );
    idempotencyRegistry.resolve(intent);
    return result;
  } catch (cause) {
    idempotencyRegistry.resolve(intent);
    throw cause;
  }
}