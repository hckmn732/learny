import { z } from 'zod';

import { Uuid } from './common';

// Contracts of the ingestion pipeline (SPEC-509 EF-1 to EF-5, ET-2, ET-4).
//
// A note or a private PDF is consumed from `resource/uploaded`, extracted, split into located
// passages and embedded. The service validates these schemas before writing anything; the
// demonstration and the later UI (SPEC-607) read the same shapes.

/** Stable business codes written in `resources.error_code` (BR-APP-07). */
export const INGESTION_ERROR_CODES = [
  'NOTE_EMPTY',
  'NOTE_TOO_LARGE',
  'PDF_EMPTY_TEXT',
  'PDF_ENCRYPTED',
  'PDF_CORRUPTED',
  'PDF_TOO_LARGE',
  'PDF_TOO_MANY_PAGES',
  'RESOURCE_FILE_MISSING',
  'RESOURCE_UNSUPPORTED',
  'TEXT_EMPTY',
  'EXTRACTION_FAILED',
  'EMBEDDING_INVALID',
  'EMBEDDING_UNAVAILABLE',
  'EMBEDDING_KEY_INVALID',
] as const;

export const IngestionErrorCode = z.enum(INGESTION_ERROR_CODES);
export type IngestionErrorCode = z.infer<typeof IngestionErrorCode>;

/**
 * BR-APP-06 — citation coordinates of a passage: page for a PDF, character range for a note.
 * `charStart`/`charEnd` are always present and `charEnd` is strictly greater than `charStart`.
 */
export const IngestionChunkLocation = z
  .strictObject({
    page: z.number().int().min(1).optional(),
    anchor: z.string().max(200).optional(),
    startSec: z.number().min(0).optional(),
    endSec: z.number().min(0).optional(),
    charStart: z.number().int().min(0),
    charEnd: z.number().int().min(0),
  })
  .refine((location) => location.charEnd > location.charStart, {
    message: 'charEnd doit être supérieur à charStart',
    path: ['charEnd'],
  });
export type IngestionChunkLocation = z.infer<typeof IngestionChunkLocation>;

/** One passage produced by `chunkText`, with its embedding dimension and token estimate. */
export const IngestionChunk = z.strictObject({
  position: z.number().int().min(0),
  text: z.string().min(1).max(20_000),
  location: IngestionChunkLocation,
  tokenCount: z.number().int().min(0),
});
export type IngestionChunk = z.infer<typeof IngestionChunk>;

/** State read by the UI after one processing run (BR-APP-07). */
export const IngestionOutcome = z.strictObject({
  resourceId: Uuid,
  outcome: z.enum(['ready', 'failed', 'skipped']),
  chunkCount: z.number().int().min(0),
  embeddingCount: z.number().int().min(0),
  errorCode: IngestionErrorCode.nullable(),
  errorMessage: z.string().max(1000).nullable(),
});
export type IngestionOutcome = z.infer<typeof IngestionOutcome>;

/** Input of the public service, validated before any database read. */
export const ProcessResourceInput = z.strictObject({ resourceId: Uuid });
export type ProcessResourceInput = z.infer<typeof ProcessResourceInput>;
