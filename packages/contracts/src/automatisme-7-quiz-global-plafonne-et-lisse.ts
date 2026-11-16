import { z } from 'zod';

import { CivilDate, Uuid } from './common';
import { PlafondQuizParams } from './parametres-automatismes';

// « Quiz global plafonné et lissé » (SPEC-718, BR-AUT-07, ADR-0190).
//
// The parameters are the canonical `plafond_quiz` object of SPEC-710; this module adds the
// vocabulary of the draw and of the journal action so the service, the automation definition and
// the interface share one schema. Nothing here fixes a business value: the six admitted choices
// and their defaults come from `@learny/config` and `PlafondQuizParams`.

/** SPEC-710 / SPEC-718 — the canonical settings of the automation. */
export const QuizSmoothingParams = PlafondQuizParams;
export type QuizSmoothingParams = z.infer<typeof QuizSmoothingParams>;

/** ET-4 — the single kind written to the automation journal by this capacity. */
export const QUIZ_SMOOTHED_KIND = 'quiz_smoothed' as const;

/** EF-2 — why a notion leaves the day: the cap, or a bank variant still missing. */
export const QUIZ_SMOOTHING_DEFERRED_REASONS = [
  'cap',
  'awaiting_variant',
  'module_not_eligible',
  'maintenance_validated_only',
] as const;
export const QuizSmoothingDeferredReason = z.enum(QUIZ_SMOOTHING_DEFERRED_REASONS);
export type QuizSmoothingDeferredReason = z.infer<typeof QuizSmoothingDeferredReason>;

/** ET-3 — one notion deferred by the pure draw, with its reason and proposed local day. */
export const QuizSmoothingDeferredNotion = z
  .object({
    notionId: Uuid,
    reason: QuizSmoothingDeferredReason,
    proposedFor: CivilDate.nullable(),
  })
  .strict();
export type QuizSmoothingDeferredNotion = z.infer<typeof QuizSmoothingDeferredNotion>;

/**
 * ET-3 — result of the pure draw exposed by the automation: the selected notions, the deferred
 * ones and the estimated duration. `deferredReason` explains why the cap produced a deferral.
 */
export const QuizSmoothingPlan = z
  .object({
    selected: z.array(Uuid),
    deferred: z.array(QuizSmoothingDeferredNotion),
    estimatedMinutes: z.number().int().min(0),
    maxMinutes: z.number().int().min(1),
    targetRetention: z.number().min(0).max(1),
    deferredReason: z.literal('cap').nullable(),
  })
  .strict();
export type QuizSmoothingPlan = z.infer<typeof QuizSmoothingPlan>;

/** ET-4 — payload of the `quiz_smoothed` action: IDs, local date, cap and undo material. */
export const QuizSmoothedActionPayload = z
  .object({
    dedupeKey: z.string().min(1).max(200),
    formationId: Uuid,
    localDate: CivilDate,
    deferredTo: CivilDate,
    dueCount: z.number().int().min(0),
    selectedCount: z.number().int().min(0),
    deferredNotionIds: z.array(Uuid),
    estimatedMinutes: z.number().int().min(0),
    maxMinutes: z.number().int().min(1),
    targetRetention: z.number().min(0).max(1),
    reason: z.literal('cap'),
  })
  .strict();
export type QuizSmoothedActionPayload = z.infer<typeof QuizSmoothedActionPayload>;

/** ET-4 — `undoPayload` lets the learner reopen every deferred notion without a fake review log. */
export const QuizSmoothedUndoPayload = z
  .object({
    formationId: Uuid,
    localDate: CivilDate,
    deferredNotionIds: z.array(Uuid),
  })
  .strict();
export type QuizSmoothedUndoPayload = z.infer<typeof QuizSmoothedUndoPayload>;

/** ET-5, section 10 — the « Réglé par le tuteur » block of SCR-10. */
export const QuizSmoothingNotice = z
  .object({
    /** Null only when the journal row is not available yet; the notice stays informative. */
    actionId: Uuid.nullable(),
    capMinutes: z.number().int().min(1),
    targetRetention: z.number().min(0).max(1),
    deferredCount: z.number().int().min(0),
    deferredTo: CivilDate.nullable(),
    estimatedMinutes: z.number().int().min(0),
  })
  .strict();
export type QuizSmoothingNotice = z.infer<typeof QuizSmoothingNotice>;

/** Direct trigger carried by the session creation (ADR-0190: no event is invented for this draw). */
export const QuizSmoothingTrigger = z
  .object({
    formationId: Uuid,
    localDate: CivilDate,
    deferredTo: CivilDate,
    dueCount: z.number().int().min(0),
    selectedCount: z.number().int().min(0),
    deferredNotionIds: z.array(Uuid).min(1),
    estimatedMinutes: z.number().int().min(0),
    maxMinutes: z.number().int().min(1),
    targetRetention: z.number().min(0).max(1),
  })
  .strict();
export type QuizSmoothingTrigger = z.infer<typeof QuizSmoothingTrigger>;

/** Stable, replay-safe identity of the day's smoothing action. */
export function quizSmoothingDedupeKey(formationId: string, localDate: string): string {
  return `smooth:${formationId}:${localDate}`;
}
