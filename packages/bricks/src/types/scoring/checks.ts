// Internal rules of a scoring (ET-4): weighted mode requires weights whose points total the brick
// total.
import { brickIssue, type BrickIssue } from '../../issues';

import type { ScoringPayload } from './schema';

export function scoringChecks(payload: ScoringPayload): BrickIssue[] {
  if (payload.mode !== 'weighted') return [];
  const sum = payload.weights.reduce((total, weight) => total + weight.points, 0);
  if (payload.weights.length > 0 && sum === payload.total) return [];
  return [
    brickIssue(
      'SCORING_SUM_MISMATCH',
      'payload.weights',
      `Weighted scoring requires weights totaling ${String(payload.total)} (found ${String(sum)}).`,
    ),
  ];
}
