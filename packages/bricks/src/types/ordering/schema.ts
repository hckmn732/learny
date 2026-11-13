// `ordering` brick (SPEC-501 ET-3): 3 to 10 items stored in their correct order.
import { z } from 'zod';

import { itemId, sourcesSchema, text } from '../../common';

export const orderingItemSchema = z
  .object({
    id: itemId,
    text: text(1, 160),
  })
  .strict();

export type OrderingItem = z.infer<typeof orderingItemSchema>;

export const orderingSchema = z
  .object({
    instruction: text(3, 300),
    items: z.array(orderingItemSchema).min(3).max(10),
    explanation: text(10, 1200),
    sources: sourcesSchema,
  })
  .strict();

export type OrderingPayload = z.infer<typeof orderingSchema>;
