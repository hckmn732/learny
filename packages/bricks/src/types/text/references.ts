import { withSources, emptyRefs } from '../../references';
import type { BrickRefs } from '../../references';

import type { TextPayload } from './schema';

export function textReferences(payload: TextPayload): BrickRefs {
  return withSources(emptyRefs(), payload.sources);
}
