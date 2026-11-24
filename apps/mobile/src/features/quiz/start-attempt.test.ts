// Vitest [SPEC-3304] — démarrage d'une tentative et attente de la banque (EF-1, EF-8, CL-5).
import { describe, expect, it } from 'vitest';

import type { CreateQuizAttemptOutput } from '@learny/contracts';

import { startQuizAttemptLoop, type StartQuizRound } from './start-attempt';

function preparing(seconds = 3): StartQuizRound {
  return { status: 202, body: { preparing: true, retryAfterSec: seconds } };
}

function created(attemptId = 'a1'): StartQuizRound {
  return { status: 201, body: { attemptId } };
}

const noWait = (): Promise<void> => Promise.resolve();

describe('[SPEC-3304] démarrage de la tentative', () => {
  it('crée la tentative au premier essai quand la banque est prête', async () => {
    const waits: number[] = [];
    const outcome = await startQuizAttemptLoop({
      start: () => Promise.resolve(created('attempt-1')),
      wait: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });
    expect(outcome).toEqual({ kind: 'attempt', attemptId: 'attempt-1', resumed: false });
    expect(waits).toEqual([]);
  });

  it('attend le délai annoncé puis recommence quand le tuteur prépare les questions (EF-8)', async () => {
    const answers = [preparing(2), preparing(3), created('attempt-2')];
    const waits: number[] = [];
    const announced: number[] = [];
    const outcome = await startQuizAttemptLoop({
      start: () => {
        const next = answers.shift();
        if (next === undefined) return Promise.reject(new Error('trop d’essais'));
        return Promise.resolve(next);
      },
      wait: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
      onPreparing: (seconds) => {
        announced.push(seconds);
      },
      maxRounds: 5,
    });
    expect(outcome).toEqual({ kind: 'attempt', attemptId: 'attempt-2', resumed: false });
    expect(waits).toEqual([2000, 3000]);
    expect(announced).toEqual([2, 3]);
  });

  it('reprend la tentative en cours (200 resumed)', async () => {
    const outcome = await startQuizAttemptLoop({
      start: () => Promise.resolve({ status: 200, body: { attemptId: 'a3', resumed: true } }),
      wait: noWait,
    });
    expect(outcome).toEqual({ kind: 'attempt', attemptId: 'a3', resumed: true });
  });

  it('renonce après le nombre maximal d’essais', async () => {
    let rounds = 0;
    const outcome = await startQuizAttemptLoop({
      start: () => {
        rounds += 1;
        return Promise.resolve(preparing(1));
      },
      wait: noWait,
      maxRounds: 3,
    });
    expect(outcome).toEqual({ kind: 'timeout' });
    expect(rounds).toBe(3);
  });

  it('ne confond pas une réponse sans identifiant avec une tentative créée', async () => {
    const body: CreateQuizAttemptOutput = { preparing: true, retryAfterSec: 1 };
    const outcome = await startQuizAttemptLoop({
      start: () => Promise.resolve({ status: 201, body }),
      wait: noWait,
      maxRounds: 1,
    });
    expect(outcome).toEqual({ kind: 'timeout' });
  });
});
