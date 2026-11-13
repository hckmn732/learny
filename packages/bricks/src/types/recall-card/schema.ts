// `recall_card` brick (SPEC-501 ET-3): front and back; the back is the only answer kept in the
// public payload because the learner self-assesses (ADR-0150 §3).
import { z } from 'zod';

import { optionalText, sourcesSchema, text } from '../../common';

export const recallCardSchema = z
  .object({
    front: text(3, 300),
    back: text(1, 600),
    sourceLabel: optionalText(1, 120),
    mnemonic: optionalText(1, 200),
    sources: sourcesSchema,
  })
  .strict();

export type RecallCardPayload = z.infer<typeof recallCardSchema>;
