// Zod schemas of the JSON columns of the resource domain (SPEC-104 ET-4).
//
// They are the single source of truth for `resource_chunks.location` (BR-APP-06) and
// `resources.metadata` (pages, duration, language, YouTube identifier, site name, Anthropic file
// identifier). `packages/contracts` reuses them from SPEC-201 onwards; nothing here depends on
// Drizzle.
import { z } from 'zod';

/**
 * BR-APP-06 — location of a passage: page for a PDF, timestamps for a video/audio, anchor for a web
 * page, character range for a note. `charStart`/`charEnd` are always present (ET-2 constraint) and
 * `charEnd` is strictly greater than `charStart`.
 */
export const chunkLocationSchema = z
  .strictObject({
    page: z.number().int().min(1).optional(),
    startSec: z.number().min(0).optional(),
    endSec: z.number().min(0).optional(),
    anchor: z.string().max(200).optional(),
    charStart: z.number().int().min(0),
    charEnd: z.number().int().min(0),
  })
  .refine((location) => location.charEnd > location.charStart, {
    message: 'charEnd doit être supérieur à charStart',
    path: ['charEnd'],
  })
  .refine(
    (location) =>
      location.startSec === undefined ||
      location.endSec === undefined ||
      location.endSec >= location.startSec,
    { message: 'endSec doit être supérieur ou égal à startSec', path: ['endSec'] },
  );

const utcInstant = z.iso.datetime({ offset: true });

/**
 * `resources.metadata.upload` — bookkeeping of a private file upload (SPEC-206 ET-3, ET-5, ET-6).
 * A file resource is created `queued` with its declared size and a reservation window; the
 * finalization adds the measured fingerprint; the event and blob-removal markers make both
 * follow-up effects exactly-once and resumable. Every key is optional because a resource created
 * before SPEC-206 (or by another path) has none of them. It never holds a signed URL (ET-4).
 */
export const resourceUploadSchema = z.strictObject({
  /** Size announced when the upload URL was requested: counted as a reservation until finalized. */
  declaredBytes: z.number().int().min(0).optional(),
  declaredMime: z.string().min(1).max(127).optional(),
  /** End of the reservation window, computed with the injected clock (ADR-0047). */
  reservedUntil: utcInstant.optional(),
  /** Client key of the creation request: a replay returns the same resource (SPEC-206 ET-4). */
  idempotencyKey: z.string().min(8).max(128).optional(),
  finalizedAt: utcInstant.optional(),
  /** SHA-256 of the measured bytes and Storage `etag` at finalization (SPEC-206 ET-5). */
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  etag: z.string().min(1).max(200).optional(),
  /** Claim and completion of the single `resource/uploaded` emission (SPEC-206 EF-2, CL-4). */
  eventClaimedAt: utcInstant.optional(),
  eventEmittedAt: utcInstant.optional(),
  /** Set once the blob of a deleted resource has been removed from Storage (SPEC-206 ET-6). */
  blobRemovedAt: utcInstant.optional(),
});

/**
 * `resources.metadata.ingestion` — bookkeeping of the ingestion pipeline (SPEC-509 ET-1, ET-3,
 * ADR-0297). The marker of a completed run makes a duplicate delivery a no-op; the event claims
 * make `resource/ready` and `resource/failed` exactly-once. It never holds the text of the
 * contribution.
 */
export const resourceIngestionSchema = z.strictObject({
  /** First run that saw the resource, and the number of started runs. */
  startedAt: utcInstant.optional(),
  attempts: z.number().int().min(1).optional(),
  /** Successful run: SHA-256 of the extracted content, passage count and embedding metadata. */
  contentHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  completedAt: utcInstant.optional(),
  failedAt: utcInstant.optional(),
  chunkCount: z.number().int().min(0).optional(),
  embeddingModel: z.string().min(1).max(64).optional(),
  embeddingDim: z.number().int().min(1).max(8192).optional(),
  /** Claims and completion of the single `resource/ready` / `resource/failed` emission. */
  readyEventClaimedAt: utcInstant.optional(),
  readyEventEmittedAt: utcInstant.optional(),
  failedEventClaimedAt: utcInstant.optional(),
  failedEventEmittedAt: utcInstant.optional(),
});

/** `resources.metadata` — every key is optional and filled by the ingestion (SPEC-509/510). */
export const resourceMetadataSchema = z.strictObject({
  pages: z.number().int().min(1).optional(),
  durationSec: z.number().min(0).optional(),
  language: z.string().min(1).optional(),
  youtubeId: z.string().min(1).optional(),
  siteName: z.string().min(1).optional(),
  anthropicFileId: z.string().min(1).optional(),
  upload: resourceUploadSchema.optional(),
  ingestion: resourceIngestionSchema.optional(),
});

export type ChunkLocation = z.infer<typeof chunkLocationSchema>;
export type ResourceMetadata = z.infer<typeof resourceMetadataSchema>;
export type ResourceUpload = z.infer<typeof resourceUploadSchema>;
export type ResourceIngestion = z.infer<typeof resourceIngestionSchema>;
