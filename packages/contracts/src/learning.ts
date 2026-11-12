import { z } from 'zod';

import { CivilDate, IsoDateTime, Uuid } from './common';

// Contracts of the learning persistence services (SPEC-411 ET-2, ET-5, ADR-0288). A service returns
// these DTOs and validates them before leaving the server: no FSRS card, no session token and no
// identifier of another learner ever appears in a payload.

export const LEARNING_MODULE_STATUSES = ['locked', 'open', 'validated'] as const;
export const LEARNING_GAP_NATURES = [
  'forgetting',
  'confusion',
  'misunderstanding',
  'application',
] as const;
export const LEARNING_GAP_EVENT_KINDS = ['detected', 'nature_changed', 'cleared'] as const;
export const LEARNING_APPLICATION_STATUSES = [
  'applied',
  'already_applied',
  'pending_correction',
  'not_applicable',
] as const;

/** Stored gap state, without the internal revision token of `notion_states`. */
export const LearningGapStateSchema = z
  .object({
    nature: z.enum(LEARNING_GAP_NATURES),
    confusedWith: Uuid.nullable(),
    detectedAt: IsoDateTime,
    evidence: z.string(),
    clearedAt: IsoDateTime.nullable(),
  })
  .strict();
export type LearningGapState = z.infer<typeof LearningGapStateSchema>;

/** ET-2 — one due notion of a formation, ready for the SPEC-406 session builder. */
export const DueNotionSchema = z
  .object({
    notionId: Uuid,
    label: z.string().min(1).max(120),
    chapterId: Uuid,
    moduleId: Uuid,
    modulePosition: z.number().int().min(1),
    moduleStatus: z.enum(LEARNING_MODULE_STATUSES),
    /** True when the module already has a graded attempt for this learner (BR-MEM-03). */
    evaluated: z.boolean(),
    dueAt: IsoDateTime,
    mastery: z.number().min(0).max(100),
    gapNature: z.enum(LEARNING_GAP_NATURES).nullable(),
  })
  .strict();
export type DueNotion = z.infer<typeof DueNotionSchema>;

export const DueNotionsSchema = z
  .object({
    formationId: Uuid,
    at: IsoDateTime,
    notions: z.array(DueNotionSchema),
    gaps: z.array(z.object({ notionId: Uuid, nature: z.enum(LEARNING_GAP_NATURES) }).strict()),
  })
  .strict();
export type DueNotions = z.infer<typeof DueNotionsSchema>;

/** CA-2 — one gap transition persisted in `gap_events` and emitted after commit. */
export const LearningGapEventSchema = z
  .object({
    notionId: Uuid,
    kind: z.enum(LEARNING_GAP_EVENT_KINDS),
    nature: z.enum(LEARNING_GAP_NATURES).nullable(),
  })
  .strict();
export type LearningGapEvent = z.infer<typeof LearningGapEventSchema>;

export const LearningStateTransitionSchema = z
  .object({
    notionId: Uuid,
    masteryBefore: z.number().min(0).max(100),
    masteryAfter: z.number().min(0).max(100),
    dueAtBefore: IsoDateTime.nullable(),
    dueAtAfter: IsoDateTime.nullable(),
    gapBefore: LearningGapStateSchema.nullable(),
    gapAfter: LearningGapStateSchema.nullable(),
  })
  .strict();
export type LearningStateTransition = z.infer<typeof LearningStateTransitionSchema>;

/** EF-1, EF-2 — result of one transactional application of a graded attempt. */
export const LearningApplicationSummarySchema = z
  .object({
    attemptId: Uuid,
    status: z.enum(LEARNING_APPLICATION_STATUSES),
    reviewCount: z.number().int().min(0),
    notionIds: z.array(Uuid),
    pendingAnswers: z.number().int().min(0),
    gapEvents: z.array(LearningGapEventSchema),
    events: z.array(z.string().min(1)),
    dailyActivity: z
      .object({ day: CivilDate, minutes: z.number().int().min(0), qualifying: z.boolean() })
      .strict()
      .nullable(),
    states: z.array(LearningStateTransitionSchema),
  })
  .strict();
export type LearningApplicationSummary = z.infer<typeof LearningApplicationSummarySchema>;

/** ET-3 — idempotent reconciliation of a planner result with `schedule_slots`. */
export const PlanPersistenceSummarySchema = z
  .object({
    formationId: Uuid,
    revisionKey: z.string().min(1).max(120),
    created: z.number().int().min(0),
    updated: z.number().int().min(0),
    unchanged: z.number().int().min(0),
    cancelled: z.number().int().min(0),
    preserved: z.number().int().min(0),
  })
  .strict();
export type PlanPersistenceSummary = z.infer<typeof PlanPersistenceSummarySchema>;
