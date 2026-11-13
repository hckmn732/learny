// Public payload of a scoring: everything, including weights (the learner sees the barème).
import type { SourceRef } from '../../common';

import type { ScoringPayload } from './schema';

export interface ScoringPublic {
  total: number;
  threshold: number;
  mode: 'equal' | 'weighted';
  weights: { brickId: string; points: number }[];
  display: 'percent' | 'points';
  sources: SourceRef[];
}

export function scoringPublic(payload: ScoringPayload): ScoringPublic {
  return {
    total: payload.total,
    threshold: payload.threshold,
    mode: payload.mode,
    weights: payload.weights.map((weight) => ({ ...weight })),
    display: payload.display,
    sources: payload.sources.map((source) => ({ ...source })),
  };
}
