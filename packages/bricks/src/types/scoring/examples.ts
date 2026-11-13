// Reference examples of the `scoring` type. The invalid one has weights totaling 15 for a total of
// 20 (SCORING_SUM_MISMATCH).
import type { BrickExample } from '../../payloads';
import { BRICK_A, BRICK_B } from '../example-ids';

import type { ScoringPayload } from './schema';

export const scoringExample: BrickExample<'scoring'> = {
  valid: {
    total: 20,
    threshold: 12,
    mode: 'weighted',
    weights: [
      { brickId: BRICK_A, points: 5 },
      { brickId: BRICK_B, points: 15 },
    ],
    display: 'points',
    sources: [],
  },
  invalid: {
    total: 20,
    threshold: 12,
    mode: 'weighted',
    weights: [
      { brickId: BRICK_A, points: 5 },
      { brickId: BRICK_B, points: 10 },
    ],
    display: 'points',
    sources: [],
  },
  invalidCode: 'SCORING_SUM_MISMATCH',
};

export type ScoringExamplePayload = ScoringPayload;
