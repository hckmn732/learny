import { emptyRefs, withSources } from '../../references';
import type { BrickRefs } from '../../references';

import type { ResourceExcerptPayload } from './schema';

export function resourceExcerptReferences(payload: ResourceExcerptPayload): BrickRefs {
  const refs = withSources(emptyRefs(), payload.sources);
  if (payload.chunkId !== null) {
    refs.chunks.push({ id: payload.chunkId, path: 'payload.chunkId' });
  }
  refs.resources.push({ id: payload.resourceId, path: 'payload.resourceId' });
  return refs;
}
