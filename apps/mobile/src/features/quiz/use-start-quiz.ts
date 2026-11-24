// Start of a validation attempt from a screen (SPEC-3304 EF-1, EF-6, CL-5).
//
// The hook wires the pure loop of `start-attempt.ts` to the API client and to the user-facing
// messages: it shows « Le tuteur prépare vos questions… » while the bank is regenerating (202) and
// turns a `RETRY_NOT_YET_ALLOWED` refusal into the date of the next attempt, in the learner's zone
// (CL-5, BR-QUI-06). The idempotency key is per intent and resolved after every round: a 202 is not
// a success and must not be replayed (SPEC-3003 ET-3, canevas § 4).
import { useCallback, useState } from 'react';

import { isAppError } from '@learny/core';
import { fr } from '@learny/i18n';

import { messageFor } from '../../api/errors';
import { idempotencyRegistry } from '../../api/idempotency';
import { startAttemptOnce } from '../../data/attempts';
import { formatDateTime } from '../../lib/dates';

import { startQuizAttemptLoop } from './start-attempt';

const t = fr.mobile.quiz;

export type StartQuizOutcome =
  | { readonly ok: true; readonly attemptId: string; readonly resumed: boolean }
  | { readonly ok: false; readonly message: string };

export interface StartQuizHandle {
  readonly start: (moduleId: string) => Promise<StartQuizOutcome>;
  readonly pending: boolean;
  readonly preparing: boolean;
}

/** Starts (or resumes) the attempt of `moduleId`, waiting for the question bank when needed. */
export function useStartQuiz(): StartQuizHandle {
  const [pending, setPending] = useState(false);
  const [preparing, setPreparing] = useState(false);

  const start = useCallback(async (moduleId: string): Promise<StartQuizOutcome> => {
    setPending(true);
    setPreparing(false);
    const intent = `quiz-start:${moduleId}`;
    try {
      const outcome = await startQuizAttemptLoop({
        start: async () => {
          const key = idempotencyRegistry.keyFor(intent);
          try {
            return await startAttemptOnce({ moduleId, idempotencyKey: key });
          } finally {
            // A 202 answers the same body on replay: the key must never survive the round.
            idempotencyRegistry.resolve(intent);
          }
        },
        onPreparing: () => {
          setPreparing(true);
        },
      });
      if (outcome.kind === 'timeout') return { ok: false, message: t.startError };
      return { ok: true, attemptId: outcome.attemptId, resumed: outcome.resumed };
    } catch (error) {
      if (isAppError(error) && error.code === 'RETRY_NOT_YET_ALLOWED') {
        const at =
          error.availableAt === undefined
            ? null
            : formatDateTime(error.availableAt, 'Europe/Paris');
        return {
          ok: false,
          message: at === null ? t.startError : `${t.retryNotAllowed} ${at}.`,
        };
      }
      return { ok: false, message: messageFor(error) };
    } finally {
      setPending(false);
      setPreparing(false);
    }
  }, []);

  return { start, pending, preparing };
}
