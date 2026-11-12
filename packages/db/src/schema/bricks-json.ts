// Zod schemas of the JSON columns of the brick/activity/attempt domain (SPEC-106 ET-4).
//
// They validate the minimal shape of `activities.config`, `activities.items`, `attempts.per_notion`,
// `attempts.review_feedback`, `answers.response`, `answers.feedback` and `brick_reports.resolution`
// at the entry of the repositories. The payload of each brick type is deliberately left opaque:
// SPEC-501 ships `packages/bricks/<type>/schema.ts` and will validate it before assembly.
//
// Nothing here depends on Drizzle, so the schema module and the repositories can import these
// schemas without a cycle.
import { z } from 'zod';

/** EF-3, ET-4 — one ordered item of an activity: brick, exact version and optional points. */
export const activityItemSchema = z.strictObject({
  brickId: z.uuid(),
  brickVersionId: z.uuid(),
  points: z.number().min(0).max(100).optional(),
});

/** EF-3 — ordered items, bounded to keep one activity readable and performant. */
export const activityItemsSchema = z.array(activityItemSchema).max(200);

/** ET-4 — a `ready` activity carries at least one item. */
export const readyActivityItemsSchema = activityItemsSchema.min(1);

/** EF-3, ET-4 — minimal shape of `activities.config`; unknown keys are kept for later specs. */
export const activityConfigSchema = z.looseObject({
  threshold: z.number().min(0).max(100).optional(),
  durationSec: z.number().int().positive().optional(),
  questionCount: z.number().int().positive().max(200).optional(),
  scoring: z.record(z.string(), z.unknown()).optional(),
  hintsMax: z.number().int().min(0).max(50).optional(),
  examFormat: z
    .looseObject({
      questions: z.number().int().positive().optional(),
      durationMin: z.number().int().positive().optional(),
      threshold: z.number().min(0).max(100).optional(),
      sourceResourceId: z.uuid().optional(),
      confirmed: z.boolean().optional(),
    })
    .optional(),
  diagnosticModuleIds: z.array(z.uuid()).max(50).optional(),
});

/** EF-4, ET-4 — per-notion detail of an attempt: correct answers, total and score. */
export const perNotionEntrySchema = z
  .strictObject({
    correct: z.number().int().min(0),
    total: z.number().int().min(0),
    score: z.number().min(0).max(100),
  })
  .refine((entry) => entry.correct <= entry.total, {
    message: 'correct ne peut pas dépasser total',
    path: ['correct'],
  });

/** EF-4 — `attempts.per_notion` keyed by notion identifier. */
export const attemptPerNotionSchema = z.record(z.uuid(), perNotionEntrySchema);

/** EF-4 — tutor synthesis attached to an attempt. */
export const attemptReviewFeedbackSchema = z.looseObject({
  summary: z.string().max(4000).optional(),
  strengths: z.array(z.string().max(500)).max(20).optional(),
  improvements: z.array(z.string().max(500)).max(20).optional(),
  nextStep: z.string().max(1000).optional(),
});

/** EF-5 — a response is a JSON object (single answer) or a JSON array (ordered/matching answers). */
export const answerResponseSchema = z.union([
  z.record(z.string(), z.unknown()),
  z.array(z.unknown()),
]);

/** EF-5 — correction criteria of an answer. */
export const answerCriterionSchema = z.strictObject({
  key: z.string().min(1).max(120),
  ok: z.boolean(),
  comment: z.string().max(1000).optional(),
});

/** EF-5, ET-4 — feedback of an answer: explanation, criteria and missing points. */
export const answerFeedbackSchema = z.looseObject({
  explanation: z.string().max(4000).optional(),
  criteria: z.array(answerCriterionSchema).max(50).optional(),
  missing: z.array(z.string().max(500)).max(50).optional(),
});

/** EF-2 — resolution of a report: action taken, note and optionally the corrected version. */
export const brickReportResolutionSchema = z.looseObject({
  action: z.enum(['corrected', 'dismissed']).optional(),
  note: z.string().max(1000).optional(),
  newVersionId: z.uuid().optional(),
});

/** EF-2 — SHA-256 fingerprint of a question (BR-BRI-07), lower-case hexadecimal. */
export const brickFingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);

/** ET-2 — a score is between 0 and 100. */
export const scoreSchema = z.number().min(0).max(100);

/** EF-4, EF-5 — a duration in milliseconds is never negative. */
export const durationMsSchema = z.number().int().min(0);

/** EF-2, ET-3 — versions and attempt numbers start at 1. */
export const positiveVersionSchema = z.number().int().min(1);

export type ActivityItem = z.infer<typeof activityItemSchema>;
export type ActivityConfig = z.infer<typeof activityConfigSchema>;
export type AttemptPerNotion = z.infer<typeof attemptPerNotionSchema>;
export type AttemptReviewFeedback = z.infer<typeof attemptReviewFeedbackSchema>;
export type AnswerResponse = z.infer<typeof answerResponseSchema>;
export type AnswerCriterion = z.infer<typeof answerCriterionSchema>;
export type AnswerFeedback = z.infer<typeof answerFeedbackSchema>;
export type BrickReportResolution = z.infer<typeof brickReportResolutionSchema>;

/**
 * Pure shape checks of an activity item list (ET-4). Returns human-readable issues; an empty list
 * means the value is valid. The database trigger `activities_ready_items` repeats the readiness
 * rule so that a direct SQL writer cannot bypass it.
 */
export function activityItemsErrors(value: unknown, options: { ready?: boolean } = {}): string[] {
  const schema = options.ready === true ? readyActivityItemsSchema : activityItemsSchema;
  const result = schema.safeParse(value);
  if (result.success) return [];
  return result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(racine)';
    return `${path} : ${issue.message}`;
  });
}
