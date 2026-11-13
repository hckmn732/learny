import { emptyRefs, withSources } from '../../references';
import type { BrickRefs } from '../../references';

import type { ScoringPayload } from './schema';

export function scoringReferences(payload: ScoringPayload): BrickRefs {
  const refs = withSources(emptyRefs(), payload.sources);
  payload.weights.forEach((weight, index) => {
    refs.bricks.push({ id: weight.brickId, path: `payload.weights.${String(index)}.brickId` });
  });
  return refs;
}
