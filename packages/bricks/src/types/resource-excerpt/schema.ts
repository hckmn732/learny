// `resource_excerpt` brick (SPEC-501 ET-3): a cited passage with its location in the source.
import { z } from 'zod';

import { integer, optionalText, sourcesSchema, text, uuid } from '../../common';

const locationSchema = z
  .object({
    page: integer(1, Number.MAX_SAFE_INTEGER).optional(),
    startSec: z.number().min(0).optional(),
    endSec: z.number().min(0).optional(),
    anchor: optionalText(1, 200),
    charStart: integer(0, Number.MAX_SAFE_INTEGER).optional(),
    charEnd: integer(0, Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict()
  .refine((location) => Object.keys(location).length > 0, {
    message: 'At least one location key is required.',
  })
  .refine(
    (location) =>
      location.startSec === undefined ||
      location.endSec === undefined ||
      location.endSec >= location.startSec,
    { message: 'endSec must be greater than or equal to startSec.', path: ['endSec'] },
  )
  .refine(
    (location) =>
      location.charStart === undefined ||
      location.charEnd === undefined ||
      location.charEnd > location.charStart,
    { message: 'charEnd must be greater than charStart.', path: ['charEnd'] },
  );

export type ResourceExcerptLocation = z.infer<typeof locationSchema>;

export const resourceExcerptSchema = z
  .object({
    resourceId: uuid,
    chunkId: uuid.nullable(),
    location: locationSchema,
    quote: text(1, 1000),
    label: text(1, 80),
    sources: sourcesSchema,
  })
  .strict();

export type ResourceExcerptPayload = z.infer<typeof resourceExcerptSchema>;
