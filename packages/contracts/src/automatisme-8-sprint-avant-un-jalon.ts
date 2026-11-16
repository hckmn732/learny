import { z } from 'zod';

import { CivilDate, IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';
import { SprintParams } from './parametres-automatismes';

// « Sprint avant un jalon » (SPEC-719, BR-AUT-08, ADR-0190).
//
// The parameters are the canonical `sprint` settings of SPEC-710; this module adds the vocabulary
// of the action, the pure placement and the API result so the definition, the service, the route
// and the tests share one schema. Nothing here invents a business value: the admitted K values and
// the 30-minute duration come from `@learny/config` through `SprintParams`.

/** SPEC-710 / SPEC-719 — the canonical settings of the automation. */
export const SprintPlanningParams = SprintParams;
export type SprintPlanningParams = z.infer<typeof SprintPlanningParams>;

/** ET-4 — the single kind written to the automation journal by this capacity. */
export const SPRINT_PLANNED_KIND = 'sprint_planned' as const;

/** ET-3 — the two milestones that trigger the sprints. */
export const SPRINT_MILESTONE_KINDS = ['validation_quiz', 'mock_exam'] as const;
export const SprintMilestoneKind = z.enum(SPRINT_MILESTONE_KINDS);
export type SprintMilestoneKind = z.infer<typeof SprintMilestoneKind>;

/** EF-1 — a relative target day: J-K or J-1, always a local civil day (ET-5). */
export const SPRINT_TARGET_LABELS = ['J-K', 'J-1'] as const;
export const SprintTargetLabel = z.enum(SPRINT_TARGET_LABELS);
export type SprintTargetLabel = z.infer<typeof SprintTargetLabel>;

/** EF-2 — one placed sprint, expressed as a local day and the chosen local instant. */
export const SprintPlannedSlot = z
  .object({
    label: SprintTargetLabel,
    day: CivilDate,
    slotId: Uuid.nullable(),
    startsAt: IsoDateTime,
    endsAt: IsoDateTime,
    durationMin: z.number().int().min(5).max(120),
  })
  .strict();
export type SprintPlannedSlot = z.infer<typeof SprintPlannedSlot>;

/** CL-3 — a target day that could not receive a sprint, with the reason shown in the journal. */
export const SPRINT_IMPOSSIBLE_REASONS = ['past', 'no_study_day', 'no_slot'] as const;
export const SprintImpossibleReason = z.enum(SPRINT_IMPOSSIBLE_REASONS);
export type SprintImpossibleReason = z.infer<typeof SprintImpossibleReason>;

export const SprintImpossibleTarget = z
  .object({
    label: SprintTargetLabel,
    day: CivilDate,
    reason: SprintImpossibleReason,
  })
  .strict();
export type SprintImpossibleTarget = z.infer<typeof SprintImpossibleTarget>;

/** ET-4 — `payload` of the `sprint_planned` action, including the undo material. */
export const SprintActionPayload = z
  .object({
    dedupeKey: z.string().min(1).max(200),
    formationId: Uuid,
    examSlotId: Uuid,
    examKind: SprintMilestoneKind,
    examDate: CivilDate,
    examTitle: z.string().min(1).max(200),
    moduleId: Uuid.nullable(),
    moduleTitle: z.string().min(1).max(200).nullable(),
    daysBefore: z.union([z.literal(2), z.literal(3), z.literal(5)]),
    durationMin: z.number().int().min(5).max(120),
    notionIds: z.array(Uuid).min(1),
    notionLabels: z.array(z.string().min(1).max(200)),
    targets: z.array(SprintPlannedSlot),
    impossible: z.array(SprintImpossibleTarget),
  })
  .strict();
export type SprintActionPayload = z.infer<typeof SprintActionPayload>;

/** ET-4 — cancelling the effect only removes the future, not-yet-done sprint slots. */
export const SprintUndoPayload = z
  .object({
    examSlotId: Uuid,
    slotIds: z.array(Uuid),
  })
  .strict();
export type SprintUndoPayload = z.infer<typeof SprintUndoPayload>;

/** Direct or event trigger read by the definition. */
export const SprintTrigger = z
  .object({
    formationId: Uuid,
    examSlotId: Uuid.optional(),
  })
  .strict();
export type SprintTrigger = z.infer<typeof SprintTrigger>;

/** A stable identity: one action per milestone slot, exam local date and K (ET-4). */
export function sprintDedupeKey(examSlotId: string, examDate: string, daysBefore: number): string {
  return `sprint:${examSlotId}:${examDate}:${String(daysBefore)}`;
}

/** One plan returned by the service and rendered by the agenda/journal. */
export const SprintPlanView = z
  .object({
    actionId: Uuid.nullable(),
    formationId: Uuid,
    examSlotId: Uuid,
    examKind: SprintMilestoneKind,
    examDate: CivilDate,
    examTitle: z.string().min(1).max(200),
    daysBefore: z.number().int().min(1).max(31),
    durationMin: z.number().int().min(5).max(120),
    notionIds: z.array(Uuid),
    notionLabels: z.array(z.string().min(1).max(200)),
    targets: z.array(SprintPlannedSlot),
    impossible: z.array(SprintImpossibleTarget),
    summary: z.string().min(1).max(300),
  })
  .strict();
export type SprintPlanView = z.infer<typeof SprintPlanView>;

/** ET-1 — result of the planning service and of the idempotent route. */
export const SprintPlanResult = z
  .object({
    created: z.number().int().min(0),
    skipped: z.enum(['disabled', 'paused']).nullable(),
    plans: z.array(SprintPlanView),
  })
  .strict();
export type SprintPlanResult = z.infer<typeof SprintPlanResult>;

/** ET-1 — body of the planning route; the exam slot narrows the run to one milestone. */
export const SprintPlanInput = z
  .object({
    examSlotId: Uuid.optional(),
  })
  .strict();
export type SprintPlanInput = z.infer<typeof SprintPlanInput>;

export const sprintPlanRoute = defineRoute({
  id: 'formations.sprints.plan',
  method: 'POST',
  path: '/api/v1/formations/:fid/sprints',
  auth: 'user',
  params: z.object({ fid: Uuid }),
  body: SprintPlanInput,
  output: SprintPlanResult,
  successStatus: 200,
  idempotent: true,
  summary:
    'Planifie les deux sprints de 30 minutes avant les quiz de validation et examens blancs à venir (SPEC-719).',
  errors: [
    'VALIDATION_FAILED',
    'IDEMPOTENCY_KEY_REQUIRED',
    'UNAUTHENTICATED',
    'NOT_FOUND',
    'CONFLICT',
    'INTERNAL_ERROR',
  ],
});
