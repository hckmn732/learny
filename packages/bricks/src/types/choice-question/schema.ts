// `choice_question` brick (SPEC-501 ET-3): 2 to 6 options, at least one correct, every distractor
// carrying the notion it represents (BR-BRI-07).
import { z } from 'zod';

import { itemId, optionalText, sourcesSchema, text, uuid } from '../../common';

export const choiceOptionSchema = z
  .object({
    id: itemId,
    text: text(1, 200),
    correct: z.boolean(),
    notionId: uuid.nullable(),
    rationale: optionalText(1, 300),
  })
  .strict();

export type ChoiceOption = z.infer<typeof choiceOptionSchema>;

export const choiceQuestionSchema = z
  .object({
    stem: text(3, 600),
    mode: z.enum(['single', 'multiple']),
    options: z.array(choiceOptionSchema).min(2).max(6),
    explanation: text(10, 1200),
    objective: text(3, 200),
    sources: sourcesSchema,
  })
  .strict();

export type ChoiceQuestionPayload = z.infer<typeof choiceQuestionSchema>;
