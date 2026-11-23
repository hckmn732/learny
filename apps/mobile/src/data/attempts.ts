// Data of the validation quiz and of its result (SPEC-3304 ET-1, ET-3, CA-1, CA-3; canevas § 4).
//
// One key per route: `['attempt', aid]` and `['attempt', aid, 'result']`. The attempt and its result
// are always read from the server — the client never computes a score, a threshold or a verdict
// (ET-3, ADR-3002): the only local state is the phase of a question (`question-machine.ts`).
//
// The result is provisional while an open answer waits for the tutor (CL-6): it is refreshed every
// five seconds, and the interval stops as soon as the screen leaves or every correction is in (ET-1).
import { useMutation, useQuery } from '@tanstack/react-query';

import type {
  AttemptDto,
  CheckAnswerOutput,
  CreateQuizAttemptOutput,
  QuizFeedback,
  QuizResultDto,
  SaveAnswerOutput,
  SubmitAttemptOutput,
} from '@learny/contracts';

import { requireApiClient } from '../api/registry';

import { queryKeys } from './keys';
import type { QueryStatus } from './use-programme';

function statusOf(query: { readonly isError: boolean; readonly data: unknown }): QueryStatus {
  if (query.isError) return 'error';
  return query.data === undefined ? 'loading' : 'ready';
}

/** Refresh interval of a result still waiting for the tutor (ET-1, CL-6). */
export const RESULT_POLL_INTERVAL_MS = 5_000;

export interface AttemptQuery {
  readonly status: QueryStatus;
  readonly data: AttemptDto | null;
  readonly retry: () => void;
  readonly refresh: () => Promise<void>;
}

/**
 * One attempt with its questions, as the server projects them (ET-2, CL-3).
 *
 * The read is always fresh: reopening an attempt must resume on the first unanswered question
 * (CA-4), so the cached copy of a previous mount is never trusted — `staleTime` is 0 and every
 * mount refetches, exactly as the attempt state machine expects.
 */
export function useAttempt(attemptId: string | null): AttemptQuery {
  const query = useQuery({
    queryKey: queryKeys.attempt(attemptId ?? 'none'),
    queryFn: () => requireApiClient().api.getQuizAttempt({ params: { aid: attemptId ?? '' } }),
    enabled: attemptId !== null,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  return {
    status: attemptId === null ? 'loading' : statusOf(query),
    data: query.data ?? null,
    retry: () => {
      void query.refetch();
    },
    refresh: async () => {
      await query.refetch();
    },
  };
}

export interface AttemptResultQuery {
  readonly status: QueryStatus;
  readonly data: QuizResultDto | null;
  readonly retry: () => void;
  readonly refresh: () => Promise<void>;
}

/**
 * Result of a graded attempt (BR-QUI-08). `tutorPending` (or a pending open answer) keeps the
 * query refreshing every five seconds until the tutor has corrected everything (ET-1, CL-6).
 */
export function useAttemptResult(attemptId: string | null): AttemptResultQuery {
  const query = useQuery({
    queryKey: queryKeys.attemptResult(attemptId ?? 'none'),
    queryFn: () => requireApiClient().api.getQuizResult({ params: { aid: attemptId ?? '' } }),
    enabled: attemptId !== null,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: (current) => {
      const value = current.state.data;
      if (value === undefined) return false;
      return value.pendingOpenCount > 0 ? RESULT_POLL_INTERVAL_MS : false;
    },
  });
  return {
    status: attemptId === null ? 'loading' : statusOf(query),
    data: query.data ?? null,
    retry: () => {
      void query.refetch();
    },
    refresh: async () => {
      await query.refetch();
    },
  };
}

export interface StartAttemptInput {
  readonly moduleId: string;
  readonly idempotencyKey: string;
}

/** One creation round of the attempt (SPEC-611 EF-8: the server may answer `preparing`). */
export async function startAttemptOnce(input: StartAttemptInput): Promise<{
  readonly status: number;
  readonly body: CreateQuizAttemptOutput;
}> {
  const body = await requireApiClient().api.startQuizAttempt(
    { params: { mid: input.moduleId } },
    { idempotencyKey: input.idempotencyKey },
  );
  if ('preparing' in body) return { status: 202, body };
  if ('resumed' in body) return { status: 200, body };
  return { status: 201, body };
}

/** Saves the draft of one answer with the time spent on the question (BR-QUI-02, ET-2). */
export async function saveAnswerOnce(input: {
  attemptId: string;
  position: number;
  response: unknown;
  timeMs: number;
}): Promise<SaveAnswerOutput> {
  return requireApiClient().api.saveQuizAnswer({
    params: { aid: input.attemptId, pos: input.position },
    body: { response: input.response, timeMs: Math.max(0, Math.round(input.timeMs)) },
  });
}

/** Checks one answer; the answer is locked afterwards (BR-QUI-04, CA-1). */
export async function checkAnswerOnce(input: {
  attemptId: string;
  position: number;
  response: unknown;
  timeMs: number;
}): Promise<CheckAnswerOutput> {
  return requireApiClient().api.checkQuizAnswer({
    params: { aid: input.attemptId, pos: input.position },
    body: { response: input.response, timeMs: Math.max(0, Math.round(input.timeMs)) },
  });
}

/** Submits the attempt; the server grades it and may keep open answers for the tutor (CL-6). */
export async function submitAttemptOnce(attemptId: string): Promise<SubmitAttemptOutput> {
  return requireApiClient().api.submitQuizAttempt({ params: { aid: attemptId } });
}

export interface SaveAnswerMutation {
  readonly save: (input: { position: number; response: unknown; timeMs: number }) => void;
}

/** Fire-and-forget draft save: a failure keeps the selection and the check retries it (CL-1). */
export function useSaveAnswer(attemptId: string): SaveAnswerMutation {
  const mutation = useMutation({
    mutationFn: (input: { position: number; response: unknown; timeMs: number }) =>
      saveAnswerOnce({ attemptId, ...input }),
  });
  return {
    save: (input) => {
      // The draft is best effort: an error is ignored, the selection stays on screen (CL-1).
      void mutation.mutateAsync(input).catch(() => undefined);
    },
  };
}

/** Check mutation of one answer (ET-1). */
export function useCheckAnswer(attemptId: string): {
  check: (input: { position: number; response: unknown; timeMs: number }) => Promise<QuizFeedback>;
  pending: boolean;
} {
  const mutation = useMutation({
    mutationFn: (input: { position: number; response: unknown; timeMs: number }) =>
      checkAnswerOnce({ attemptId, ...input }),
  });
  return {
    check: async (input) => {
      const checked = await mutation.mutateAsync(input);
      return checked.feedback;
    },
    pending: mutation.isPending,
  };
}

/** Submission mutation of the attempt (EF-6). */
export function useSubmitAttempt(attemptId: string): {
  submit: () => Promise<SubmitAttemptOutput>;
  pending: boolean;
} {
  const mutation = useMutation({ mutationFn: () => submitAttemptOnce(attemptId) });
  return { submit: mutation.mutateAsync, pending: mutation.isPending };
}
