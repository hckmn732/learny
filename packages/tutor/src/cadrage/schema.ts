import { z } from 'zod';

import { CadrageRubricKey, type CadrageRubricKey as RubricKey } from '@learny/contracts';

// Structured turn of the cadrage (SPEC-604 ET-3). The schema is the contract sent to the model;
// the code rules of `applyTutorTurn` complement it (question ceiling, multi choice, trimming).
// Values longer than 200 characters are accepted here so the server can truncate them explicitly
// rather than losing a whole turn to a correctable formatting issue.

export const CADRAGE_OBJECTIVES = ['operational', 'exam', 'dialogue', 'project'] as const;
export const CadrageObjective = z.enum(CADRAGE_OBJECTIVES);
export type CadrageObjective = z.infer<typeof CadrageObjective>;

export const CADRAGE_MAX_QUESTIONS = 5;
export const CADRAGE_MAX_PROFILE_VALUE = 200;
export const CADRAGE_MAX_SUGGESTIONS = 6;
export const CADRAGE_MAX_CORRECTIONS = 2;

export const CadrageQuestionKey = z.enum([...CadrageRubricKey.options, 'other']);
export type CadrageQuestionKey = z.infer<typeof CadrageQuestionKey>;

export const CadrageProfileUpdate = z.strictObject({
  key: CadrageRubricKey,
  value: z.string().trim().min(1).max(1000),
});
export type CadrageProfileUpdate = z.infer<typeof CadrageProfileUpdate>;

export const CadrageSuggestion = z.strictObject({
  label: z.string().trim().min(1).max(60),
  description: z.string().trim().max(120).optional(),
  value: z.string().trim().min(1).max(60),
});
export type CadrageSuggestion = z.infer<typeof CadrageSuggestion>;

export const CadrageQuestion = z.strictObject({
  kind: z.literal('question'),
  questionKey: CadrageQuestionKey,
  text: z.string().trim().min(1).max(400),
  multi: z.boolean(),
  suggestions: z.array(CadrageSuggestion).max(CADRAGE_MAX_SUGGESTIONS).default([]),
});
export type CadrageQuestion = z.infer<typeof CadrageQuestion>;

export const CadrageDone = z.strictObject({
  kind: z.literal('done'),
  text: z.string().trim().min(1).max(400),
});
export type CadrageDone = z.infer<typeof CadrageDone>;

export const CadrageTurnSchema = z.strictObject({
  profileUpdates: z.array(CadrageProfileUpdate).max(5).default([]),
  objectives: z.array(CadrageObjective).max(4).default([]),
  next: z.discriminatedUnion('kind', [CadrageQuestion, CadrageDone]),
});
export type CadrageTurn = z.infer<typeof CadrageTurnSchema>;

export type CadrageProfileKey = RubricKey;

export const CADRAGE_DONE_FALLBACK =
  'Merci, j’ai ce qu’il me faut. Générez le programme quand vous voulez.';
