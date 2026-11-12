import { emptyRefs, withSources } from '../../references';
import type { BrickRefs } from '../../references';

import type { OrderingPayload } from './schema';

export function orderingReferences(payload: OrderingPayload): BrickRefs {
  return withSources(emptyRefs(), payload.sources);
}
