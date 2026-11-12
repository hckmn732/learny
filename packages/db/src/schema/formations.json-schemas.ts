// Zod schemas of the JSON columns of the formation domain (SPEC-103 ET-5).
//
// They are the single source of truth for the shapes stored in `formations.cadrage_profile`,
// `formations.study_override`, `formations.exam_format` and `cadrage_messages.suggestions`.
// `packages/contracts` reuses them from SPEC-201 onwards; nothing here may depend on Drizzle.
import { z } from 'zod';

/** One key of the cadrage profile: a value plus its collection state (BR-FOR-01, BR-FOR-02). */
export const cadrageProfileValueSchema = z.strictObject({
  value: z.string().nullable(),
  state: z.enum(['todo', 'waiting', 'done']),
});

/** `formations.cadrage_profile` — every key is optional until the tutor collected it. */
export const cadrageProfileSchema = z.strictObject({
  scope: cadrageProfileValueSchema.optional(),
  starting_point: cadrageProfileValueSchema.optional(),
  target_level: cadrageProfileValueSchema.optional(),
  volume: cadrageProfileValueSchema.optional(),
  dates: cadrageProfileValueSchema.optional(),
});

/** `formations.study_override` — rhythm that differs from the profile for one formation. */
export const studyOverrideSchema = z.strictObject({
  hoursPerDay: z.number().int().min(1).max(6),
  studyDays: z.array(z.number().int().min(1).max(7)).min(1),
  preferredSlots: z.array(z.enum(['matin', 'apres_midi', 'soir'])).min(1),
});

/** `formations.exam_format` — target exam supplied by the learner (SPEC-615 owns the behaviour). */
export const examFormatSchema = z.strictObject({
  questions: z.number().int().min(1).max(200),
  durationMin: z.number().int().min(1).max(600),
  threshold: z.number().int().min(1).max(100),
  sourceResourceId: z.uuid().optional(),
  confirmed: z.boolean(),
});

/** `cadrage_messages.suggestions` — at most eight tappable answers to the tutor question. */
export const cadrageSuggestionSchema = z.strictObject({
  label: z.string().max(80),
  value: z.string().max(200),
  multi: z.boolean().optional(),
});

export const cadrageSuggestionsSchema = z.array(cadrageSuggestionSchema).max(8);

export type CadrageProfileValue = z.infer<typeof cadrageProfileValueSchema>;
export type CadrageProfile = z.infer<typeof cadrageProfileSchema>;
export type StudyOverride = z.infer<typeof studyOverrideSchema>;
export type ExamFormat = z.infer<typeof examFormatSchema>;
export type CadrageSuggestion = z.infer<typeof cadrageSuggestionSchema>;
export type CadrageSuggestions = z.infer<typeof cadrageSuggestionsSchema>;
