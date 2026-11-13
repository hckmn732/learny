import { emptyRefs, withSources } from '../../references';
import type { BrickRefs } from '../../references';

import type { ChoiceQuestionPayload } from './schema';

export function choiceQuestionReferences(payload: ChoiceQuestionPayload): BrickRefs {
  const refs = withSources(emptyRefs(), payload.sources);
  payload.options.forEach((option, index) => {
    if (option.notionId !== null) {
      refs.notions.push({
        id: option.notionId,
        path: `payload.options.${String(index)}.notionId`,
      });
    }
  });
  return refs;
}
