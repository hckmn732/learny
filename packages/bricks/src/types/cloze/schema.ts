// `cloze` brick (SPEC-501 ET-3): `{{n}}` tokens in the template, 1 to 10 gaps and accepted answers.
// Comparison is always case- and accent-insensitive (BR-MEM-05): no sensitivity field exists.
import { z } from 'zod';

import { integer, optionalText, sourcesSchema, text } from '../../common';

export const clozeGapSchema = z
  .object({
    id: integer(1, 10),
    answers: z.array(text(1, 60)).min(1).max(10),
    hint: optionalText(1, 60),
  })
  .strict();

export type ClozeGap = z.infer<typeof clozeGapSchema>;

export const clozeSchema = z
  .object({
    template: text(10, 1000),
    gaps: z.array(clozeGapSchema).min(1).max(10),
    explanation: text(10, 1200),
    sources: sourcesSchema,
  })
  .strict();

export type ClozePayload = z.infer<typeof clozeSchema>;
