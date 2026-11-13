// `open_question` brick (SPEC-501 ET-3): a tutor-graded answer with expected elements and criteria.
import { z } from 'zod';

import { criterionKey, integer, sourcesSchema, text } from '../../common';

export const openCriterionSchema = z
  .object({
    key: criterionKey,
    label: text(2, 120),
    points: integer(1, 10),
    description: z.string().trim().max(300),
  })
  .strict();

export type OpenCriterion = z.infer<typeof openCriterionSchema>;

export const openQuestionSchema = z
  .object({
    stem: text(3, 600),
    expectedElements: z.array(text(2, 200)).min(1).max(8),
    criteria: z.array(openCriterionSchema).min(1).max(6),
    answerMaxChars: integer(50, 4000).default(1500),
    modelAnswer: text(10, 2000),
    explanation: text(10, 1200),
    objective: text(3, 200),
    sources: sourcesSchema,
  })
  .strict();

export type OpenQuestionPayload = z.infer<typeof openQuestionSchema>;
