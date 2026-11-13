// `matching` brick (SPEC-501 ET-3): 2 to 8 pairs and 0 to 3 extra right-hand distractors.
import { z } from 'zod';

import { itemId, sourcesSchema, text, uuid } from '../../common';

export const matchingPairSchema = z
  .object({
    id: itemId,
    left: text(1, 120),
    right: text(1, 200),
    notionId: uuid,
  })
  .strict();

export type MatchingPair = z.infer<typeof matchingPairSchema>;

export const matchingSchema = z
  .object({
    instruction: text(3, 300),
    pairs: z.array(matchingPairSchema).min(2).max(8),
    extraRights: z.array(text(1, 200)).max(3).default([]),
    explanation: text(10, 1200),
    sources: sourcesSchema,
  })
  .strict();

export type MatchingPayload = z.infer<typeof matchingSchema>;
