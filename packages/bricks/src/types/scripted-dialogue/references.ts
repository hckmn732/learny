import { emptyRefs, withSources } from '../../references';
import type { BrickRefs } from '../../references';

import type { ScriptedDialoguePayload } from './schema';

export function scriptedDialogueReferences(payload: ScriptedDialoguePayload): BrickRefs {
  return withSources(emptyRefs(), payload.sources);
}
