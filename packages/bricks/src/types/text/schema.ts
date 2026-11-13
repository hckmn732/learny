// `text` brick (SPEC-501 ET-3): a Markdown course insert. Raw HTML is refused by the internal rule
// HTML_NOT_ALLOWED; a lone `<` followed by a space or a digit stays ordinary text (CL-10).
import { z } from 'zod';

import { optionalText, sourcesSchema, text } from '../../common';

export const textSchema = z
  .object({
    title: optionalText(1, 120),
    bodyMd: text(1, 20000),
    sources: sourcesSchema,
  })
  .strict();

export type TextPayload = z.infer<typeof textSchema>;
