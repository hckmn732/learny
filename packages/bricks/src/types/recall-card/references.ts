import { emptyRefs, withSources } from '../../references';
import type { BrickRefs } from '../../references';

import type { RecallCardPayload } from './schema';

export function recallCardReferences(payload: RecallCardPayload): BrickRefs {
  return withSources(emptyRefs(), payload.sources);
}
