'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { CadrageMessageCreateInput, CadrageStateDto } from '@learny/contracts';
import { AppError } from '@learny/core';

import { api } from '../../lib/api-client';

// TanStack Query state of one cadrage (SPEC-604 ET-6, §9). The learner message is shown
// optimistically; the server state replaces it after the turn. A network failure keeps the same
// body and idempotency key for its retry (CL-6, CL-8); a failed tutor turn retries with
// `{ retry: true }` so the stored answer is not duplicated.

export interface SendOptions {
  body: CadrageMessageCreateInput;
  optimisticContent?: string;
}

interface Attempt extends SendOptions {
  key: string;
}

export interface UseCadrageResult {
  state: CadrageStateDto | undefined;
  loading: boolean;
  error: AppError | null;
  sending: boolean;
  sendContent: (content: string) => void;
  sendSelections: (values: string[], optimisticContent: string) => void;
  retryTutor: () => void;
  retryLast: () => void;
  canRetryLast: boolean;
  clearError: () => void;
}

function asAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError('INTERNAL_ERROR', 'Une erreur est survenue. Réessayez.');
}

export function useCadrage(
  fid: string,
  initialData?: CadrageStateDto,
): UseCadrageResult {
  const queryClient = useQueryClient();
  const queryKey = ['cadrage', fid] as const;
  const [error, setError] = useState<AppError | null>(null);
  const [lastAttempt, setLastAttempt] = useState<Attempt | null>(null);

  const query = useQuery<CadrageStateDto>({
    queryKey,
    queryFn: () => api.cadrageGet({ params: { fid } }),
    ...(initialData === undefined ? {} : { initialData }),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (attempt: Attempt) =>
      api.cadrageMessageCreate(
        { params: { fid }, body: attempt.body },
        { idempotencyKey: attempt.key },
      ),
    onMutate: (attempt) => {
      setError(null);
      if (attempt.optimisticContent === undefined) return;
      queryClient.setQueryData<CadrageStateDto>(queryKey, (current) =>
        current === undefined
          ? current
          : {
              ...current,
              messages: [
                ...current.messages,
                {
                  id: `optimistic-${attempt.key}`,
                  role: 'learner',
                  content: attempt.optimisticContent ?? '',
                  questionNumber: null,
                  suggestions: null,
                  multi: false,
                  createdAt: new Date(0).toISOString(),
                },
              ],
            },
      );
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      setLastAttempt(null);
    },
    onError: (cause) => {
      setError(asAppError(cause));
    },
  });

  const run = (attempt: Attempt) => {
    setLastAttempt(attempt);
    mutation.mutate(attempt);
  };

  return {
    state: query.data,
    loading: query.isPending,
    error,
    sending: mutation.isPending,
    sendContent: (content) => {
      const trimmed = content.trim();
      run({
        body: { content: trimmed },
        optimisticContent: trimmed,
        key: crypto.randomUUID(),
      });
    },
    sendSelections: (values, optimisticContent) => {
      run({
        body: { selections: values },
        optimisticContent,
        key: crypto.randomUUID(),
      });
    },
    retryTutor: () => {
      run({ body: { retry: true }, key: crypto.randomUUID() });
    },
    retryLast: () => {
      if (lastAttempt !== null) run(lastAttempt);
    },
    canRetryLast: lastAttempt !== null,
    clearError: () => {
      setError(null);
    },
  };
}
