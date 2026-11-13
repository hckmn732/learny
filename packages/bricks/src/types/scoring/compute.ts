// Activity and exercise scales (SPEC-502 ET-5, ADR-0014, BR-PRA-01). Pure functions: the caller
// passes per-brick success ratios in [0, 1] and gets points, percentage and threshold verdict.
import { clampScore, round2 } from '../../grade-support';
import type { InstructionPayload } from '../instruction/schema';

import type { ScoringPayload } from './schema';

export interface ActivityScore {
  points: number;
  percent: number;
  passed: boolean;
  perItem: Array<{ brickId: string; points: number; max: number }>;
}

/** Raised when a weighted scale has no weight for an activity item (ET-5). */
export class ScoringItemUnknownError extends Error {
  override readonly name: string = 'ScoringItemUnknownError';
  readonly code = 'SCORING_ITEM_UNKNOWN' as const;

  constructor(readonly brickId: string) {
    super(`No scoring weight for brick "${brickId}".`);
  }
}

export function computeActivityScore(
  items: ReadonlyArray<{ brickId: string; score: number }>,
  scoring: ScoringPayload,
): ActivityScore {
  const weights = new Map(scoring.weights.map((weight) => [weight.brickId, weight.points]));
  const share = items.length === 0 ? 0 : scoring.total / items.length;

  let rawPoints = 0;
  const perItem = items.map((item) => {
    const max = scoring.mode === 'equal' ? share : weights.get(item.brickId);
    if (max === undefined) throw new ScoringItemUnknownError(item.brickId);
    rawPoints += max * clampScore(item.score);
    return {
      brickId: item.brickId,
      points: round2(max * clampScore(item.score)),
      max: round2(max),
    };
  });

  const points = round2(rawPoints);
  const percent = scoring.total === 0 ? 0 : Math.round((rawPoints / scoring.total) * 100);
  return {
    points,
    percent: Math.min(100, Math.max(0, percent)),
    passed: points >= scoring.threshold,
    perItem,
  };
}

export interface ExerciseScore {
  points: number;
  max: 10;
  passed: boolean;
  verdict: 'Réussi' | 'À retravailler';
}

export function computeExerciseScore(
  criteria: ReadonlyArray<{ key: string; ok: boolean }>,
  hintsUsed: number,
  brick: InstructionPayload,
): ExerciseScore {
  const succeeded = new Set(criteria.filter((criterion) => criterion.ok).map((c) => c.key));
  const earned = brick.criteria.reduce(
    (sum, criterion) => sum + (succeeded.has(criterion.key) ? criterion.points : 0),
    0,
  );
  const count = Number.isFinite(hintsUsed) ? Math.trunc(hintsUsed) : 0;
  const hints = Math.min(Math.max(count, 0), brick.hints.length);
  const points = round2(Math.max(0, earned - hints));
  const passed = points >= brick.passPoints;
  return {
    points,
    max: 10,
    passed,
    verdict: passed ? 'Réussi' : 'À retravailler',
  };
}
