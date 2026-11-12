// Sober milestones of the pure engine (SPEC-409 ET-2, BR-GAM-03, ADR-0281). Detection is a pure
// set difference: the caller supplies every occurrence already awarded in `previousKeys`, so a
// recalculation never emits the same milestone twice (CL-5).
import { z } from 'zod';

import { assertValid } from '../errors';
import { IdSchema } from '../types';
import type { Id } from '../types';

export const MILESTONE_KINDS = ['module_validated', 'notions_100', 'streak_30'] as const;

export type MilestoneKind = (typeof MILESTONE_KINDS)[number];

export const MilestoneKindSchema = z.enum(MILESTONE_KINDS) as z.ZodType<MilestoneKind>;

/** Business bounds supplied by the caller (`ENGINE.milestones` in the application). */
export interface MilestoneParams {
  notionsRetained: number;
  streakDays: number;
}

export const MilestoneParamsSchema = z
  .object({
    notionsRetained: z.number().refine((value) => Number.isInteger(value) && value >= 1, {
      message: 'Entier positif requis.',
    }),
    streakDays: z.number().refine((value) => Number.isInteger(value) && value >= 1, {
      message: 'Entier positif requis.',
    }),
  })
  .strict() as z.ZodType<MilestoneParams>;

export interface DetectMilestonesInput {
  previousKeys: readonly string[];
  validatedModules: readonly Id[];
  /** Count of notions whose mastery already reached the configured threshold (80 % by default). */
  masteredNotions: number;
  streakDays: number;
  params: MilestoneParams;
}

const nonNegativeInteger = () =>
  z.number().refine((value) => Number.isInteger(value) && value >= 0, {
    message: 'Entier positif ou nul requis.',
  });

export const DetectMilestonesInputSchema = z
  .object({
    previousKeys: z.array(z.string().min(1).max(120)),
    validatedModules: z.array(IdSchema),
    masteredNotions: nonNegativeInteger(),
    streakDays: nonNegativeInteger(),
    params: MilestoneParamsSchema,
  })
  .strict() as z.ZodType<DetectMilestonesInput>;

/**
 * A new milestone. `key` is the stable identity stored by the service
 * (`module_validated:<moduleId>`, `notions_100`, `streak_30`); `moduleId` is set only for a module.
 */
export interface Milestone {
  key: string;
  kind: MilestoneKind;
  moduleId: Id | null;
}

export const MilestoneSchema = z
  .object({
    key: z.string().min(1).max(120),
    kind: MilestoneKindSchema,
    moduleId: IdSchema.nullable(),
  })
  .strict() as z.ZodType<Milestone>;

export const MILESTONE_KEY = {
  notions: 'notions_100',
  streak: 'streak_30',
} as const;

/** Stable key of a validated module, shared with the persistence service (SPEC-411). */
export function moduleMilestoneKey(moduleId: Id): string {
  return `module_validated:${moduleId}`;
}

/**
 * New milestones, in a stable order: validated modules (sorted by id), then 100 retained notions,
 * then the 30-day streak. A threshold reached exactly triggers its milestone (BR-GAM-03).
 */
export function detectMilestones(input: DetectMilestonesInput): Milestone[] {
  const parsed = assertValid(DetectMilestonesInputSchema, input);
  const previous = new Set(parsed.previousKeys);
  const milestones: Milestone[] = [];

  const modules = [...new Set(parsed.validatedModules)].sort();
  for (const moduleId of modules) {
    const key = moduleMilestoneKey(moduleId);
    if (!previous.has(key)) {
      milestones.push({ key, kind: 'module_validated', moduleId });
    }
  }

  if (
    parsed.masteredNotions >= parsed.params.notionsRetained &&
    !previous.has(MILESTONE_KEY.notions)
  ) {
    milestones.push({ key: MILESTONE_KEY.notions, kind: 'notions_100', moduleId: null });
  }

  if (parsed.streakDays >= parsed.params.streakDays && !previous.has(MILESTONE_KEY.streak)) {
    milestones.push({ key: MILESTONE_KEY.streak, kind: 'streak_30', moduleId: null });
  }

  return milestones;
}
