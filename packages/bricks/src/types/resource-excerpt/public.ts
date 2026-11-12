// Public payload of a `resource_excerpt` brick: everything is safe to send to the browser.
import type { SourceRef } from '../../common';

import type { ResourceExcerptLocation, ResourceExcerptPayload } from './schema';

export interface ResourceExcerptPublic {
  resourceId: string;
  chunkId: string | null;
  location: ResourceExcerptLocation;
  quote: string;
  label: string;
  sources: SourceRef[];
}

export function resourceExcerptPublic(payload: ResourceExcerptPayload): ResourceExcerptPublic {
  return {
    resourceId: payload.resourceId,
    chunkId: payload.chunkId,
    location: { ...payload.location },
    quote: payload.quote,
    label: payload.label,
    sources: payload.sources.map((source) => ({ ...source })),
  };
}
