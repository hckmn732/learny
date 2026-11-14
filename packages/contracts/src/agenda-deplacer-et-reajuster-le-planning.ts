import { z } from 'zod';

import { AgendaDto, AgendaSlot } from './agenda';
import { CivilDate, IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';

// Contracts of the agenda move and BR-FOR-14 replanning (SPEC-705 EF-1 to EF-4, ET-1, ET-3,
// ET-4; BR-AGE-05, BR-FOR-14, ADR-0326). Every date, minute and compatibility reason is computed
// server-side by SPEC-407; the browser only displays the answer and sends the learner's explicit
// choice with the version it received (optimistic concurrency, CL-2).

/** BR-AGE-05 — « Déplacer » proposes the three next compatible free windows. */
export const SLOT_ALTERNATIVE_COUNT = 3;

/** Study moment of a compatible window; the label stays in the interface. */
export const SlotAlternativeMoment = z.enum(['matin', 'apres_midi', 'soir']);
export type SlotAlternativeMoment = z.infer<typeof SlotAlternativeMoment>;

export const SlotAlternative = z.object({
  /** Civil day of the start in the learner's zone (ET-5). */
  date: CivilDate,
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  /** Local minutes since 00:00 of the start, in the learner's zone. */
  startMinutes: z.number().int().min(0).max(1439),
  endMinutes: z.number().int().min(0).max(1439),
  moment: SlotAlternativeMoment,
  /** Why the planner retained this window (BR-AGE-05, ET-3). */
  reasons: z.array(z.string().min(1).max(120)).min(1).max(5),
});
export type SlotAlternative = z.infer<typeof SlotAlternative>;

/** ET-3 — at most three alternatives for one future slot, plus its concurrency version. */
export const SlotAlternativesDto = z.object({
  slotId: Uuid,
  /** CL-2 — content version of the slot the learner selected. */
  version: z.string().min(1).max(120),
  timezone: z.string().min(1),
  durationMinutes: z.number().int().min(1),
  /** Civil day of the current slot in the learner's zone. */
  day: CivilDate,
  alternatives: z.array(SlotAlternative).max(SLOT_ALTERNATIVE_COUNT),
});
export type SlotAlternativesDto = z.infer<typeof SlotAlternativesDto>;

/** ET-3 — the move only accepts the version that was read and a future window. */
export const SlotMoveInput = z
  .strictObject({
    expectedVersion: z.string().min(1).max(120),
    startsAt: IsoDateTime,
    endsAt: IsoDateTime,
  })
  .refine((input) => input.endsAt > input.startsAt, {
    message: 'La fin du créneau doit suivre son début.',
    path: ['endsAt'],
  });
export type SlotMoveInput = z.input<typeof SlotMoveInput>;

/** ET-3 — one moved activity and the refreshed agenda around its new day. */
export const SlotMoveOutput = z.object({
  /** The new planned slot; its `movedFromId` is not exposed by the agenda DTO. */
  movedSlot: AgendaSlot,
  /** The slot that was replaced and now carries the `moved` status. */
  replacedSlotId: Uuid,
  /** Version of the new slot, ready for another move. */
  version: z.string().min(1).max(120),
  /** Tutor explanation shown immediately under the detail panel (EF-3). */
  explanation: z.string().min(1).max(300),
  agenda: AgendaDto,
});
export type SlotMoveOutput = z.infer<typeof SlotMoveOutput>;

/** BR-FOR-14 — the three options, in the order they are presented. */
export const ReplanChoice = z.enum(['shift_end', 'increase_volume', 'lighten']);
export type ReplanChoice = z.infer<typeof ReplanChoice>;

export const ReplanOption = z.object({
  kind: ReplanChoice,
  feasible: z.boolean(),
  /** Reason when the option cannot meet the deadline; `null` when feasible. */
  reason: z.string().min(1).max(200).nullable(),
  currentEndDate: CivilDate,
  projectedEndDate: CivilDate.nullable(),
  /** Days added to the current end date (shift_end). */
  extraDays: z.number().int().min(0).nullable(),
  currentHoursPerDay: z.number().min(1).max(24),
  /** Daily volume after the option (increase_volume). */
  newHoursPerDay: z.number().min(1).max(24).nullable(),
  /** Minutes removed from the programme (lighten). */
  removedMinutes: z.number().int().min(0).nullable(),
});
export type ReplanOption = z.infer<typeof ReplanOption>;

export const BlockedModuleReason = z.enum(['delayed', 'quiz_failed']);
export type BlockedModuleReason = z.infer<typeof BlockedModuleReason>;

/** EF-2 — the module whose validation is late enough for BR-FOR-14. */
export const BlockedModule = z.object({
  formationId: Uuid,
  moduleId: Uuid,
  moduleNumber: z.number().int().min(1),
  title: z.string().min(1).max(160),
  reason: BlockedModuleReason,
});
export type BlockedModule = z.infer<typeof BlockedModule>;

/** ET-4 — three scenarios computed without mutation, bound to the plan version read. */
export const ReplanOptionsDto = z.object({
  formationId: Uuid,
  planVersion: z.string().min(1).max(120),
  blocked: BlockedModule.nullable(),
  currentEndDate: CivilDate,
  currentHoursPerDay: z.number().min(1).max(24),
  options: z.array(ReplanOption).max(SLOT_ALTERNATIVE_COUNT),
});
export type ReplanOptionsDto = z.infer<typeof ReplanOptionsDto>;

/** ET-4 — the explicit choice and the plan version the learner saw. */
export const ReplanApplyInput = z.strictObject({
  choice: ReplanChoice,
  expectedPlanVersion: z.string().min(1).max(120),
});
export type ReplanApplyInput = z.input<typeof ReplanApplyInput>;

export const ReplanOutcome = z.enum(['applied', 'unchanged', 'consent_required']);
export type ReplanOutcome = z.infer<typeof ReplanOutcome>;

/** ET-4 — an applied change, or the pending lightening action waiting for consent. */
export const ReplanOutput = z.object({
  outcome: ReplanOutcome,
  formationId: Uuid,
  planVersion: z.string().min(1).max(120),
  explanation: z.string().min(1).max(300),
  endDate: CivilDate.nullable(),
  hoursPerDay: z.number().min(1).max(24),
  /** BR-AUT-11 — pending action created by « alléger »; `null` for an applied change. */
  consentActionId: Uuid.nullable(),
});
export type ReplanOutput = z.infer<typeof ReplanOutput>;

const slotParams = z.object({ sid: Uuid });
const formationParams = z.object({ fid: Uuid });

export const agendaReplanRoutes = {
  slotAlternativesGet: defineRoute({
    id: 'slots.alternatives',
    method: 'GET',
    path: '/api/v1/slots/:sid/alternatives',
    auth: 'user',
    params: slotParams,
    output: SlotAlternativesDto,
    successStatus: 200,
    summary:
      'Trois prochains créneaux libres compatibles avec une activité future, calculés par le planificateur (SPEC-705).',
    errors: ['VALIDATION_FAILED', 'UNAUTHENTICATED', 'NOT_FOUND', 'CONFLICT', 'INTERNAL_ERROR'],
  }),
  slotMove: defineRoute({
    id: 'slots.move',
    method: 'POST',
    path: '/api/v1/slots/:sid/move',
    auth: 'user',
    params: slotParams,
    body: SlotMoveInput,
    output: SlotMoveOutput,
    successStatus: 200,
    idempotent: true,
    summary:
      'Déplace une seule activité vers un créneau choisi, marque l’ancien créneau et renvoie l’agenda recalculé (SPEC-705).',
    errors: [
      'VALIDATION_FAILED',
      'IDEMPOTENCY_KEY_REQUIRED',
      'UNAUTHENTICATED',
      'NOT_FOUND',
      'CONFLICT',
      'INTERNAL_ERROR',
    ],
  }),
  formationReplanOptions: defineRoute({
    id: 'formations.replan-options',
    method: 'POST',
    path: '/api/v1/formations/:fid/replan-options',
    auth: 'user',
    params: formationParams,
    output: ReplanOptionsDto,
    successStatus: 200,
    summary:
      'Calcule les trois options BR-FOR-14 d’un module bloqué sans modifier le planning (SPEC-705).',
    errors: ['VALIDATION_FAILED', 'UNAUTHENTICATED', 'NOT_FOUND', 'CONFLICT', 'INTERNAL_ERROR'],
  }),
  formationReplan: defineRoute({
    id: 'formations.replan',
    method: 'POST',
    path: '/api/v1/formations/:fid/replan',
    auth: 'user',
    params: formationParams,
    body: ReplanApplyInput,
    output: ReplanOutput,
    successStatus: 200,
    idempotent: true,
    summary:
      'Applique le réajustement explicitement choisi et replanifie les créneaux futurs ; « alléger » attend l’accord (SPEC-705).',
    errors: [
      'VALIDATION_FAILED',
      'IDEMPOTENCY_KEY_REQUIRED',
      'UNAUTHENTICATED',
      'NOT_FOUND',
      'CONFLICT',
      'INTERNAL_ERROR',
    ],
  }),
} as const;
