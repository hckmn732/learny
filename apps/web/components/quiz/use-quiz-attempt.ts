'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import type { AttemptDto } from '@learny/contracts';

import { api, ApiError } from '../../lib/api-client';
import { fr } from '../../messages/fr/quiz';

// SPEC-611 EF-1, EF-8 — the client creates the attempt on mount, resumes an in-progress one and
// retries the preparation every three seconds, at most forty times (two minutes). The count is a
// deterministic bound; no wall clock is read in the component (ADR-0047).

export const PREPARATION_RETRY_MS = 3_000;
export const PREPARATION_MAX_ATTEMPTS = 40;

export function preparationTimedOut(attempts: number): boolean {
  return attempts >= PREPARATION_MAX_ATTEMPTS;
}

/** Load failure of the attempt, with its machine-readable code for dedicated states (SPEC-611). */
export interface QuizLoadError {
  code: string | null;
  message: string;
}

export function quizLoadErrorOf(error: unknown): QuizLoadError {
  if (error instanceof ApiError) {
    return { code: error.code, message: error.detail === '' ? fr.quiz.errorTitle : error.detail };
  }
  return { code: null, message: fr.quiz.errorTitle };
}

export interface UseQuizAttempt {
  attempt: AttemptDto | null;
  attemptId: string | null;
  loading: boolean;
  preparing: boolean;
  timedOut: boolean;
  error: QuizLoadError | null;
  retryPreparation: () => void;
  refetch: () => Promise<void>;
}

export function useQuizAttempt(moduleId: string): UseQuizAttempt {
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<QuizLoadError | null>(null);

  const create = useMutation({
    mutationFn: (idempotencyKey: string) =>
      api.startQuizAttempt({ params: { mid: moduleId } }, { idempotencyKey }),
    onSuccess: (data) => {
      setError(null);
      if ('preparing' in data) {
        setPreparing(true);
        return;
      }
      setPreparing(false);
      setAttemptId(data.attemptId);
    },
    onError: (cause) => {
      setPreparing(false);
      setError(quizLoadErrorOf(cause));
    },
  });

  const launch = useCallback(() => {
    create.mutate(crypto.randomUUID());
  }, [create]);

  useEffect(() => {
    launch();
    // A single creation per mounted screen; the retry effect owns the preparation loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId]);

  useEffect(() => {
    if (!preparing || preparationTimedOut(attempts)) return;
    const timer = setTimeout(() => {
      setAttempts((current) => current + 1);
      launch();
    }, PREPARATION_RETRY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [attempts, launch, preparing]);

  const query = useQuery({
    queryKey: ['attempt', attemptId],
    queryFn: () => api.getQuizAttempt({ params: { aid: attemptId ?? '' } }),
    enabled: attemptId !== null,
  });

  const refetch = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    attempt: query.data ?? null,
    attemptId,
    loading: attemptId === null && !preparing && error === null && query.isFetching,
    preparing,
    timedOut: preparing && preparationTimedOut(attempts),
    error: error ?? (query.error === null ? null : quizLoadErrorOf(query.error)),
    retryPreparation: () => {
      setAttempts(0);
      setPreparing(true);
      launch();
    },
    refetch,
  };
}
