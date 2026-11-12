// Mastery of a notion (SPEC-403, BR-LAC-01, ADR-0024). The function is pure: the evaluation
// instant, the mastery parameters and every dated answer come from the caller. Nothing is read
// from a clock, a database, the network or an AI provider, and the input is never mutated.
import { z } from 'zod';

import { EngineError, assertValid } from '../errors';
import { parseInstant } from '../time';
import { IdSchema, InstantIsoSchema, type Id, type InstantIso } from '../types';

const MS_PER_DAY = 86_400_000;

/** BR-LAC-01 — default mastery threshold, in percent. Callers pass `ENGINE.mastery.threshold`. */
export const DEFAULT_MASTERY_THRESHOLD = 80;
/** BR-LAC-01 — default half-life of the exponentially decaying weight, in days. */
export const DEFAULT_MASTERY_HALF_LIFE_DAYS = 14;

const finiteNumber = () =>
  z.number().refine((value) => Number.isFinite(value) && !Object.is(value, -0), {
    message: 'Nombre fini requis, -0 refusé.',
  });

const scoreSchema = () =>
  finiteNumber().refine((value) => value >= 0 && value <= 1, 'Score hors de 0..1.');

const percentSchema = () =>
  finiteNumber().refine((value) => value >= 0 && value <= 100, 'Seuil hors de 0..100.');

const halfLifeSchema = () =>
  finiteNumber().refine((value) => value > 0, 'Demi-vie strictement positive requise.');

/** One graded answer of the notion; `score` is the partial success already normalised in [0, 1]. */
export interface MasteryAnswer {
  answerId: Id;
  attemptId: Id;
  score: number;
  answeredAt: InstantIso;
}

export const MasteryAnswerSchema = z
  .object({
    answerId: IdSchema,
    attemptId: IdSchema,
    score: scoreSchema(),
    answeredAt: InstantIsoSchema,
  })
  .strict() as z.ZodType<MasteryAnswer>;

/** Explicit input of the mastery computation (ET-1): `threshold` and `halfLifeDays` are optional. */
export interface MasteryInput {
  answers: readonly MasteryAnswer[];
  at: InstantIso;
  threshold?: number;
  halfLifeDays?: number;
}

export const MasteryInputSchema = z
  .object({
    answers: z.array(MasteryAnswerSchema),
    at: InstantIsoSchema,
    threshold: percentSchema().optional(),
    halfLifeDays: halfLifeSchema().optional(),
  })
  .strict() as z.ZodType<MasteryInput>;

/** Per-answer explanation detail (EF-4): its age at `at` and the weight derived from it. */
export interface MasteryAnswerWeight {
  answerId: Id;
  attemptId: Id;
  score: number;
  answeredAt: InstantIso;
  ageDays: number;
  weight: number;
}

/** Result of the computation, with the aggregates needed by the explanation (EF-4). */
export interface MasteryResult {
  /** Weighted mean in [0, 100], in double precision; only the display rounds (ET-2). */
  mastery: number;
  threshold: number;
  mastered: boolean;
  answerCount: number;
  weightSum: number;
  weightedScore: number;
  weights: readonly MasteryAnswerWeight[];
}

interface DatedAnswer extends MasteryAnswer {
  answeredAtMs: number;
}

/** Stable order independent of the caller order: date first, then identifier tie-breakers. */
function compareAnswers(left: DatedAnswer, right: DatedAnswer): number {
  if (left.answeredAt !== right.answeredAt) return left.answeredAt < right.answeredAt ? -1 : 1;
  if (left.answerId !== right.answerId) return left.answerId < right.answerId ? -1 : 1;
  if (left.attemptId !== right.attemptId) return left.attemptId < right.attemptId ? -1 : 1;
  return 0;
}

/**
 * Weighted mastery of one notion (BR-LAC-01): each graded answer contributes `score` with the
 * weight `0.5^(ageDays / halfLifeDays)`, where `ageDays = (at − answeredAt) / 86 400 000`.
 * Answers after `at`, scores outside [0, 1] and invalid parameters are refused at the contract
 * boundary. An empty history (or a null total weight) yields 0 % and is never mastered.
 */
export function calculateMastery(input: MasteryInput): MasteryResult {
  const parsed = assertValid(MasteryInputSchema, input);
  const threshold = parsed.threshold ?? DEFAULT_MASTERY_THRESHOLD;
  const halfLifeDays = parsed.halfLifeDays ?? DEFAULT_MASTERY_HALF_LIFE_DAYS;
  const atMs = parseInstant(parsed.at);

  const dated: DatedAnswer[] = parsed.answers.map((answer, index) => {
    const answeredAtMs = parseInstant(answer.answeredAt);
    if (answeredAtMs > atMs) {
      throw new EngineError(
        'INVALID_INPUT',
        'Une réponse ne peut pas être postérieure à la date d’évaluation.',
        { path: `answers.${String(index)}.answeredAt` },
      );
    }
    return { ...answer, answeredAtMs };
  });
  // Sorting first makes the summation order canonical: a permutation of the input returns the
  // exact same doubles, not merely a close value (CL-5, CA-3).
  dated.sort(compareAnswers);

  const weights: MasteryAnswerWeight[] = [];
  let weightSum = 0;
  let weightedScore = 0;
  for (const answer of dated) {
    const ageDays = (atMs - answer.answeredAtMs) / MS_PER_DAY;
    const weight = Math.pow(0.5, ageDays / halfLifeDays);
    weightSum += weight;
    weightedScore += weight * answer.score;
    weights.push({
      answerId: answer.answerId,
      attemptId: answer.attemptId,
      score: answer.score,
      answeredAt: answer.answeredAt,
      ageDays,
      weight,
    });
  }

  // A history whose weights all underflow to zero must not divide by zero (ET-3).
  const mastery = weightSum === 0 ? 0 : (weightedScore / weightSum) * 100;
  return {
    mastery,
    threshold,
    mastered: weightSum > 0 && mastery >= threshold,
    answerCount: dated.length,
    weightSum,
    weightedScore,
    weights,
  };
}
