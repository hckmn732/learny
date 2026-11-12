import { emptyRefs, withSources } from '../../references';
import type { BrickRefs } from '../../references';

import type { CategorizationPayload } from './schema';

export function categorizationReferences(payload: CategorizationPayload): BrickRefs {
  const refs = withSources(emptyRefs(), payload.sources);
  payload.categories.forEach((category, index) => {
    if (category.notionId !== null) {
      refs.notions.push({
        id: category.notionId,
        path: `payload.categories.${String(index)}.notionId`,
      });
    }
  });
  return refs;
}
