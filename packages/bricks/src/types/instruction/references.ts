import { emptyRefs, withSources } from '../../references';
import type { BrickRefs } from '../../references';

import type { InstructionPayload } from './schema';

export function instructionReferences(payload: InstructionPayload): BrickRefs {
  return withSources(emptyRefs(), payload.sources);
}
