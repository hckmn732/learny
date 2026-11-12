// Progress indicators of one formation (SPEC-408 ET-2, BR-PRO-01, ADR-0283). The function is pure:
// modules, slots and notion states come from the caller. A slot is counted from its two instants,
// so daylight-saving changes never alter its elapsed duration. Nothing is read from a clock, a
// database, the network or the configuration package.
import { z } from 'zod';

import { assertValid } from '../errors';
import { DEFAULT_MASTERY_THRESHOLD } from '../mastery/calculate';
import { parseInstant } from '../time';
import {
  IdSchema,
  InstantIsoSchema,
  ModuleStatusSchema,
  SlotKindSchema,
  SlotStatusSchema,
} from '../types';
import type { Id, InstantIso, ModuleStatus, SlotKind, SlotStatus } from '../types';

const MS_PER_MINUTE = 60_000;

const finiteNumber = () =>
  z.number().refine((value) => Number.isFinite(value) && !Object.is(value, -0), {
    message: 'Nombre fini requis, -0 refusé.',
  });

const masteryValue = () =>
  finiteNumber().refine((value) => value >= 0 && value <= 100, 'Maîtrise hors de 0..100.');

/** A module of the formation; only its status drives BR-PRO-01. */
export interface ProgressModule {
  readonly moduleId: Id;
  readonly status: ModuleStatus;
}

export const ProgressModuleSchema = z
  .object({
    moduleId: IdSchema,
    status: ModuleStatusSchema,
  })
  .strict() as z.ZodType<ProgressModule>;

/**
 * A schedule slot of the formation. `movedFromId` links a replacement to the slot it replaces;
 * the superseded slot never counts, even if its status was not updated to `moved` (CL-5).
 */
export interface ProgressSlot {
  readonly slotId: Id;
  readonly formationId?: Id | null;
  readonly moduleId?: Id | null;
  readonly kind: SlotKind;
  readonly status: SlotStatus;
  readonly startsAt: InstantIso;
  readonly endsAt: InstantIso;
  readonly movedFromId?: Id | null;
}

export const ProgressSlotSchema = z
  .object({
    slotId: IdSchema,
    formationId: IdSchema.nullable().optional(),
    moduleId: IdSchema.nullable().optional(),
    kind: SlotKindSchema,
    status: SlotStatusSchema,
    startsAt: InstantIsoSchema,
    endsAt: InstantIsoSchema,
    movedFromId: IdSchema.nullable().optional(),
  })
  .strict()
  .superRefine((slot, ctx) => {
    if (parseInstant(slot.endsAt) <= parseInstant(slot.startsAt)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Un créneau doit finir après son début.',
        path: ['endsAt'],
      });
    }
  }) as z.ZodType<ProgressSlot>;

/** The mastery of one notion, as persisted by SPEC-107. */
export interface ProgressNotionState {
  readonly notionId: Id;
  readonly mastery: number;
}

export const ProgressNotionStateSchema = z
  .object({
    notionId: IdSchema,
    mastery: masteryValue(),
  })
  .strict() as z.ZodType<ProgressNotionState>;

export interface CalculateProgressInput {
  readonly modules: readonly ProgressModule[];
  readonly slots: readonly ProgressSlot[];
  readonly notionStates: readonly ProgressNotionState[];
  /** BR-LAC-01 — 80 % by default; the service passes `ENGINE.mastery.threshold`. */
  readonly masteryThreshold?: number;
}

export const CalculateProgressInputSchema = z
  .object({
    modules: z.array(ProgressModuleSchema),
    slots: z.array(ProgressSlotSchema),
    notionStates: z.array(ProgressNotionStateSchema),
    masteryThreshold: masteryValue().optional(),
  })
  .strict() as z.ZodType<CalculateProgressInput>;

/** Explicit state of a formation without any module (EF-3, CL-4). */
export type ProgressStatus = 'no_modules' | 'in_progress' | 'complete';

export const ProgressStatusSchema = z.enum([
  'no_modules',
  'in_progress',
  'complete',
]) as z.ZodType<ProgressStatus>;

/** Aggregates of one formation. Minutes are exact elapsed minutes in double precision. */
export interface ProgressResult {
  readonly validatedModules: number;
  readonly totalModules: number;
  /** BR-PRO-01 — validated / total in percent, bounded 0–100, not rounded (ET-2, CA-3). */
  readonly progressPercent: number;
  readonly plannedMinutes: number;
  readonly completedMinutes: number;
  /** Distinct notions with `mastery >= masteryThreshold` (EF-4). */
  readonly masteredNotions: number;
  readonly status: ProgressStatus;
}

export const ProgressResultSchema = z
  .object({
    validatedModules: z.number().int().nonnegative(),
    totalModules: z.number().int().nonnegative(),
    progressPercent: finiteNumber().refine(
      (value) => value >= 0 && value <= 100,
      'Avancement hors de 0..100.',
    ),
    plannedMinutes: finiteNumber().refine((value) => value >= 0, 'Volume négatif.'),
    completedMinutes: finiteNumber().refine((value) => value >= 0, 'Volume négatif.'),
    masteredNotions: z.number().int().nonnegative(),
    status: ProgressStatusSchema,
  })
  .strict() as z.ZodType<ProgressResult>;

const STATUS_RANK: Readonly<Record<ModuleStatus, number>> = {
  locked: 0,
  open: 1,
  validated: 2,
};

/**
 * One status per module identifier. A duplicated module line keeps the strongest status
 * (`validated` > `open` > `locked`) so the count is stable whatever the row order (ADR-0283).
 */
function moduleStatuses(modules: readonly ProgressModule[]): Map<Id, ModuleStatus> {
  const result = new Map<Id, ModuleStatus>();
  for (const module of [...modules].sort((left, right) =>
    left.moduleId < right.moduleId ? -1 : left.moduleId > right.moduleId ? 1 : 0,
  )) {
    const current = result.get(module.moduleId);
    if (current === undefined || STATUS_RANK[module.status] > STATUS_RANK[current]) {
      result.set(module.moduleId, module.status);
    }
  }
  return result;
}

/** Keeps the best mastery seen for a notion identifier (ADR-0283). */
function masteryByNotion(notionStates: readonly ProgressNotionState[]): Map<Id, number> {
  const result = new Map<Id, number>();
  for (const state of notionStates) {
    const current = result.get(state.notionId);
    if (current === undefined || state.mastery > current) result.set(state.notionId, state.mastery);
  }
  return result;
}

/**
 * BR-PRO-01 — validated modules over total modules, planned and completed minutes from the
 * schedule, mastered notions from `mastery >= threshold`. Cancelled and moved slots never count as
 * planned or completed, a superseded slot is counted once through its replacement, and only a
 * `done` slot counts as completed (EF-3, EF-4, CL-4, CL-5).
 */
export function calculateProgress(input: CalculateProgressInput): ProgressResult {
  const parsed = assertValid(CalculateProgressInputSchema, input);
  const threshold = parsed.masteryThreshold ?? DEFAULT_MASTERY_THRESHOLD;
  const statuses = moduleStatuses(parsed.modules);
  const totalModules = statuses.size;
  let validatedModules = 0;
  for (const status of statuses.values()) if (status === 'validated') validatedModules += 1;

  const superseded = new Set<Id>();
  for (const slot of parsed.slots) {
    if (slot.movedFromId !== undefined && slot.movedFromId !== null) {
      superseded.add(slot.movedFromId);
    }
  }

  let plannedMs = 0;
  let completedMs = 0;
  for (const slot of parsed.slots) {
    if (slot.status === 'cancelled' || slot.status === 'moved') continue;
    if (superseded.has(slot.slotId)) continue;
    const durationMs = parseInstant(slot.endsAt) - parseInstant(slot.startsAt);
    plannedMs += durationMs;
    if (slot.status === 'done') completedMs += durationMs;
  }

  const masteredNotions = [...masteryByNotion(parsed.notionStates).values()].filter(
    (mastery) => mastery >= threshold,
  ).length;

  const progressPercent =
    totalModules === 0 ? 0 : Math.min(100, Math.max(0, (validatedModules / totalModules) * 100));
  const status: ProgressStatus =
    totalModules === 0
      ? 'no_modules'
      : validatedModules === totalModules
        ? 'complete'
        : 'in_progress';

  return {
    validatedModules,
    totalModules,
    progressPercent,
    plannedMinutes: plannedMs / MS_PER_MINUTE,
    completedMinutes: completedMs / MS_PER_MINUTE,
    masteredNotions,
    status,
  };
}
