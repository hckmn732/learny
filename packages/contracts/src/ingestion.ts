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
  'RESOURCE_URL_MISSING',
  'RESOURCE_UNSUPPORTED',
  'TEXT_EMPTY',
  'EXTRACTION_FAILED',
  'EMBEDDING_INVALID',
  'EMBEDDING_UNAVAILABLE',
  'EMBEDDING_KEY_INVALID',
  // SPEC-510 — remote retrieval, robots, YouTube and image reading.
  'URL_INVALID',
  'URL_BLOCKED_HOST',
  'FETCH_TIMEOUT',
  'FETCH_TOO_LARGE',
  'FETCH_HTTP_ERROR',
  'FETCH_TOO_MANY_REDIRECTS',
  'FETCH_FAILED',
  'WEB_ROBOTS_DISALLOWED',
  'ROBOTS_DISALLOWED',
  'WEB_EMPTY_TEXT',
  'WEB_UNSUPPORTED_CONTENT',
  'WEB_TOO_LARGE',
  'YOUTUBE_INVALID_URL',
  'YOUTUBE_NO_CAPTIONS',
  'YOUTUBE_UNAVAILABLE',
  'IMAGE_TOO_LARGE',
  'IMAGE_UNREADABLE',
  'IMAGE_EMPTY_TEXT',
  'IMAGE_VISION_UNAVAILABLE',
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

/** SPEC-510 — the three remote sources handled by the same pipeline as a note or a PDF. */
export const INGESTION_REMOTE_KINDS = ['web', 'youtube', 'image'] as const;
export const IngestionRemoteKind = z.enum(INGESTION_REMOTE_KINDS);
export type IngestionRemoteKind = z.infer<typeof IngestionRemoteKind>;

/** ET-2 — an anchor of a web page and the text it introduces. */
export const WebAnchor = z.strictObject({
  id: z.string().min(1).max(200),
  text: z.string().max(500).optional(),
});
export type WebAnchor = z.infer<typeof WebAnchor>;

/** ET-2 — `extractWeb` output: title, main text, anchors and the final URL after redirects. */
export const WebExtraction = z.strictObject({
  title: z.string().min(1).max(200),
  text: z.string().min(1).max(2_000_000),
  anchors: z.array(WebAnchor).max(1000),
  sourceUrl: z.url({ protocol: /^https?$/ }).max(2048),
  siteName: z.string().min(1).max(200).optional(),
  language: z.string().min(1).max(35).optional(),
});
export type WebExtraction = z.infer<typeof WebExtraction>;

/** ET-2 — one timed caption segment of a YouTube video. */
export const YoutubeSegment = z
  .strictObject({
    startSec: z.number().min(0),
    endSec: z.number().min(0),
    text: z.string().min(1).max(5000),
  })
  .refine((segment) => segment.endSec >= segment.startSec, {
    message: 'endSec doit être supérieur ou égal à startSec',
    path: ['endSec'],
  });
export type YoutubeSegment = z.infer<typeof YoutubeSegment>;

/** ET-2 — `extractYoutube` output; `NO_CAPTIONS` is thrown instead of an empty list. */
export const YoutubeExtraction = z.strictObject({
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  title: z.string().min(1).max(200),
  language: z.string().min(1).max(35),
  durationSec: z.number().min(0).optional(),
  sourceUrl: z.url({ protocol: /^https?$/ }).max(2048),
  segments: z.array(YoutubeSegment).min(1).max(5000),
});
export type YoutubeExtraction = z.infer<typeof YoutubeExtraction>;

/** ET-2, EF-3 — origin of an image reading, always the `light` task and never a learner claim. */
export const ImageModelOrigin = z.strictObject({
  task: z.literal('light'),
  provider: z.string().min(1).max(64),
  modelId: z.string().min(1).max(128),
});
export type ImageModelOrigin = z.infer<typeof ImageModelOrigin>;

/** ET-2, EF-3 — `extractImage` output; the text is a model reading, marked as such. */
export const ImageExtraction = z.strictObject({
  title: z.string().min(1).max(200),
  text: z.string().min(1).max(20_000),
  origin: ImageModelOrigin,
});
export type ImageExtraction = z.infer<typeof ImageExtraction>;
