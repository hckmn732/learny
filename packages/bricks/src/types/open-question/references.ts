import { emptyRefs, withSources } from '../../references';
import type { BrickRefs } from '../../references';

import type { OpenQuestionPayload } from './schema';

export function openQuestionReferences(payload: OpenQuestionPayload): BrickRefs {
  return withSources(emptyRefs(), payload.sources);
}
