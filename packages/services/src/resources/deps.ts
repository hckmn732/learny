// Ports of the file service (SPEC-206): everything that talks to the outside world is injected, so
// the integration tests run the real Storage and the unit tests none of it.
import type { StorageGateway } from '@learny/db';

import type { ObjectReader } from './storage';

/** Payload of `resource/uploaded` (docs/architecture/overview.md §5, SPEC-203 catalogue). */
export interface ResourceUploadedEvent {
  userId: string;
  resourceId: string;
  formationId: string;
  chapterId: string | null;
  kind: string;
}

export interface ResourceEventSink {
  /**
   * Sends `resource/uploaded`. `id` is stable per resource, so the platform deduplicates a second
   * delivery (SPEC-203 ADR-0122). The service calls it once per resource (CL-4).
   */
  emitUploaded(event: ResourceUploadedEvent, options: { id: string }): Promise<void>;
}

export interface ResourceDeps {
  /** SPEC-114 signatures and removals. */
  gateway: StorageGateway;
  /** Measures and reads an uploaded object (EF-2). */
  reader: ObjectReader;
  events: ResourceEventSink;
  /** Short-lived token presented to Storage on behalf of one user (ET-4); never logged. */
  accessToken(userId: string): string;
}

/** Stable event identifier of the single `resource/uploaded` emission of a resource. */
export function uploadedEventId(resourceId: string): string {
  return `resource-uploaded:${resourceId}`;
}
