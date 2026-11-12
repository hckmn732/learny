import { emptyRefs, withSources } from '../../references';
import type { BrickRefs } from '../../references';

import type { TimerPayload } from './schema';

export function timerReferences(payload: TimerPayload): BrickRefs {
  const refs = withSources(emptyRefs(), payload.sources);
  payload.itemBrickIds.forEach((brickId, index) => {
    refs.bricks.push({ id: brickId, path: `payload.itemBrickIds.${String(index)}` });
  });
  return refs;
}
