// `scripted_dialogue` brick (SPEC-501 ET-3): a tutor-played dialogue with explicit criteria.
import { z } from 'zod';

import { criterionKey, integer, sourcesSchema, text } from '../../common';

export const dialogueCriterionSchema = z
  .object({
    key: criterionKey,
    label: text(2, 120),
    points: integer(1, 10),
    description: z.string().trim().max(300),
  })
  .strict();

export type DialogueCriterion = z.infer<typeof dialogueCriterionSchema>;

export const scriptedDialogueSchema = z
  .object({
    role: text(3, 120),
    context: text(10, 1500),
    learnerGoal: text(10, 400),
    endCondition: text(10, 300),
    openingLine: text(1, 600),
    maxTurns: integer(4, 30).default(12),
    criteria: z.array(dialogueCriterionSchema).min(1).max(6),
    sources: sourcesSchema,
  })
  .strict();

export type ScriptedDialoguePayload = z.infer<typeof scriptedDialogueSchema>;
