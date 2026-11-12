// Public API of the file service (SPEC-206).
export { createUpload } from './create-upload';
export type { CreateUploadInput } from './create-upload';
export { createResource } from './create-resource';
export { finalizeUpload } from './finalize';
export { getSignedReadUrl } from './read';
export { deleteResource, purgeDeletedBlobs } from './delete';
export type { PurgeResult } from './delete';
export { ensureUploadedEvent, EVENT_CLAIM_STALE_MS } from './uploaded-event';
export { uploadedEventId } from './deps';
export type { ResourceDeps, ResourceEventSink, ResourceUploadedEvent } from './deps';
export { detectUpload } from './detect';
export type { DetectedFile } from './detect';
export {
  DELETED_SOURCE_LABEL,
  IMAGE_MIME_TYPES,
  PDF_MIME_TYPE,
  assertCapacity,
  assertDeclaredUpload,
  assertFileSize,
  assertNoteText,
  assertPdfPages,
  countCharacters,
  evaluateUpload,
  kindForDeclaredMime,
  sizeLimitBytes,
} from './limits';
export type { Capacity, DeclaredUpload, UploadSimulation } from './limits';
export { SupabaseObjectReader, fingerprint, mintUserAccessToken } from './storage';
export type { ObjectContent, ObjectInfo, ObjectReader } from './storage';
