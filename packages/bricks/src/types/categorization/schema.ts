// `categorization` brick (SPEC-501 ET-3): 2 to 4 categories and 4 to 12 items to classify.
import { z } from 'zod';

import { itemId, sourcesSchema, text, uuid } from '../../common';

export const categorizationCategorySchema = z
  .object({
    id: itemId,
    label: text(1, 60),
    notionId: uuid.nullable(),
  })
  .strict();

export type CategorizationCategory = z.infer<typeof categorizationCategorySchema>;

export const categorizationItemSchema = z
  .object({
    id: itemId,
    text: text(1, 120),
    categoryId: itemId,
  })
  .strict();

export type CategorizationItem = z.infer<typeof categorizationItemSchema>;

export const categorizationSchema = z
  .object({
    instruction: text(3, 300),
    categories: z.array(categorizationCategorySchema).min(2).max(4),
    items: z.array(categorizationItemSchema).min(4).max(12),
    explanation: text(10, 1200),
    sources: sourcesSchema,
  })
  .strict();

export type CategorizationPayload = z.infer<typeof categorizationSchema>;
