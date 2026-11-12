import { emptyRefs, withSources } from '../../references';
import type { BrickRefs } from '../../references';

import type { ClozePayload } from './schema';

export function clozeReferences(payload: ClozePayload): BrickRefs {
  return withSources(emptyRefs(), payload.sources);
}
