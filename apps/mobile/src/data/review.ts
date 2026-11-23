// Data of the Réviser tab (SPEC-3305 ET-1, ET-2, ET-3, BR-MEM-02, BR-MEM-03).
//
// One key per route, as the canvas requires: `['global-quiz', fid, 'today']` for the session of the
// day, re-read after every answer (the server owns the states, the corrections and the FSRS). The
// writes carry the `clientAnswerId` of the intention (ET-3); a 409 is treated as success by the
// caller, never replayed with a new identifier.
import { useMutation, useQuery } from '@tanstack/react-query';

import type {
  GlobalQuizSessionDto,
  ReviewAnswerInput,
  ReviewAnswerResultDto,
  ReviewSummaryDto,
} from '@learny/contracts';

import { idempotencyRegistry } from '../api/idempotency';
import { requireApiClient } from '../api/registry';

import { queryKeys } from './keys';

export type QueryStatus = 'loading' | 'error' | 'ready';

function statusOf(query: { readonly isError: boolean; readonly data: unknown }): QueryStatus {
  if (query.isError) return 'error';
  return query.data === undefined ? 'loading' : 'ready';
}

export interface GlobalQuizQuery {
  readonly status: QueryStatus;
  readonly data: GlobalQuizSessionDto | null;
  readonly refetch: () => Promise<void>;
}

/** Session of the day of one formation; `null` while no formation is known (BR-MEM-03). */
export function useGlobalQuizToday(formationId: string | null): GlobalQuizQuery {
  const query = useQuery({
    queryKey: queryKeys.globalQuizToday(formationId ?? 'none'),
    queryFn: () => requireApiClient().api.globalQuizToday({ params: { fid: formationId ?? '' } }),
    enabled: formationId !== null,
    staleTime: 0,
    retry: 1,
  });
  return {
    status: formationId === null ? 'loading' : statusOf(query),
    data: query.data ?? null,
    refetch: async () => {
      await query.refetch();
    },
  };
}

export interface AnswerVariables {
  readonly sessionId: string;
  readonly input: ReviewAnswerInput;
}

/** `POST /review-sessions/:sid/answers` (ET-3): one intent, one `clientAnswerId`. */
export function useReviewAnswer() {
  return useMutation({
    mutationFn: (variables: AnswerVariables): Promise<ReviewAnswerResultDto> =>
      requireApiClient().api.reviewAnswer({
        params: { sid: variables.sessionId },
        body: variables.input,
      }),
  });
}

/** `POST /review-sessions/:sid/complete` (EF-4): idempotent closure of the session. */
export function useReviewComplete() {
  return useMutation({
    mutationFn: (sessionId: string): Promise<ReviewSummaryDto> =>
      requireApiClient().api.reviewComplete({ params: { sid: sessionId } }),
  });
}

/** « Annuler » the deferral of the tutor (BR-AUT-07, SPEC-718 ET-4). */
export function useUndoSmoothing() {
  return useMutation({
    mutationFn: (actionId: string) => {
      const intent = `smoothing-undo:${actionId}`;
      return requireApiClient()
        .api.meAutomationActionUndo(
          { params: { id: actionId } },
          { idempotencyKey: idempotencyRegistry.keyFor(intent) },
        )
        .then((result) => {
          idempotencyRegistry.resolve(intent);
          return result;
        });
    },
  });
}
