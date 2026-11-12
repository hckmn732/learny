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

/** `resources.metadata` — every key is optional and filled by the ingestion (SPEC-509/510). */
export const resourceMetadataSchema = z.strictObject({
  pages: z.number().int().min(1).optional(),
  durationSec: z.number().min(0).optional(),
  language: z.string().min(1).optional(),
  youtubeId: z.string().min(1).optional(),
  siteName: z.string().min(1).optional(),
  anthropicFileId: z.string().min(1).optional(),
});

export type ChunkLocation = z.infer<typeof chunkLocationSchema>;
export type ResourceMetadata = z.infer<typeof resourceMetadataSchema>;
