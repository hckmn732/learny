import { emptyRefs, withSources } from '../../references';
import type { BrickRefs } from '../../references';

import type { MatchingPayload } from './schema';

export function matchingReferences(payload: MatchingPayload): BrickRefs {
  const refs = withSources(emptyRefs(), payload.sources);
  payload.pairs.forEach((pair, index) => {
    refs.notions.push({ id: pair.notionId, path: `payload.pairs.${String(index)}.notionId` });
  });
  return refs;
}
