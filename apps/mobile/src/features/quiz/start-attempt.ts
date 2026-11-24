// Start of a validation attempt, with the regeneration wait of SPEC-611 EF-8 (SPEC-3304 EF-1, CL-5).
//
// `POST /modules/:mid/quiz/attempts` answers 202 `{ preparing, retryAfterSec }` while the tutor
// regenerates an exhausted bank: the screen shows « Le tuteur prépare vos questions… » and asks
// again after the delay. Every round carries a *new* `Idempotency-Key` — the 202 is not a success,
// and replaying it with the same key returns the cached answer instead of creating the attempt.
//
// The loop is pure and injected (`start`, `wait`, `key`), so `start-attempt.test.ts` proves the
// retries, the delay and the refusal path without a network nor a real timer.
import type { CreateQuizAttemptOutput } from '@learny/contracts';

/** Outcome of one creation round, narrowed to what the loop needs. */
export interface StartQuizRound {
  /** Status of the answer: 200 (resumed), 201 (created) or 202 (preparing). */
  readonly status: number;
  readonly body: CreateQuizAttemptOutput;
}

export type StartQuizOutcome =
  | { readonly kind: 'attempt'; readonly attemptId: string; readonly resumed: boolean }
  | { readonly kind: 'timeout' };

export interface StartQuizLoopOptions {
  /** One creation round with a fresh idempotency key. */
  readonly start: () => Promise<StartQuizRound>;
  /** Waits `ms` milliseconds; injected so a test never sleeps. */
  readonly wait?: (ms: number) => Promise<void>;
  /** Maximum number of rounds before giving up (default 40, i.e. about two minutes). */
  readonly maxRounds?: number;
  /** Called before each wait, with the delay announced by the server. */
  readonly onPreparing?: (retryAfterSec: number) => void;
}

const DEFAULT_MAX_ROUNDS = 40;

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** True when the body carries the identifier of the attempt (200 or 201). */
export function attemptIdOf(body: CreateQuizAttemptOutput | undefined): string | null {
  if (body === undefined) return null;
  if ('attemptId' in body && typeof body.attemptId === 'string') return body.attemptId;
  return null;
}

/**
 * Starts the attempt, waiting for the bank regeneration at most `maxRounds` times. A `preparing`
 * answer never creates anything: the loop is the only path that produces an attempt (SPEC-611).
 */
export async function startQuizAttemptLoop(
  options: StartQuizLoopOptions,
): Promise<StartQuizOutcome> {
  const wait = options.wait ?? defaultWait;
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
  for (let round = 0; round < maxRounds; round += 1) {
    const answer = await options.start();
    const attemptId = attemptIdOf(answer.body);
    if (attemptId !== null) {
      return {
        kind: 'attempt',
        attemptId,
        resumed: answer.status === 200 || ('resumed' in answer.body && answer.body.resumed),
      };
    }
    const retryAfterSec =
      'preparing' in answer.body && typeof answer.body.retryAfterSec === 'number'
        ? answer.body.retryAfterSec
        : 3;
    options.onPreparing?.(retryAfterSec);
    await wait(Math.max(1, retryAfterSec) * 1000);
  }
  return { kind: 'timeout' };
}
