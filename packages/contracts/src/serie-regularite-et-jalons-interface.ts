import { z } from 'zod';

import { CivilDate, IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';
import { StreakDay } from './sidebar';

// Contracts of the streak, regularity and milestone interface (SPEC-723 ET-3, BR-GAM-02,
// BR-GAM-03, ADR-0321). The regularity boxes reuse the `StreakDay` schema of the sidebar
// (SPEC-304): the two screens always describe the same 14 local civil days with the same three
// states (`done`, `none`, `neutral`). No field ever compares two learners: a milestone is a
// personal, sober achievement.

/** BR-GAM-03 — the three sober milestones of V1. */
export const SERIES_MILESTONE_KINDS = ['module_validated', 'notions_100', 'streak_30'] as const;
export const SeriesMilestoneKind = z.enum(SERIES_MILESTONE_KINDS);
export type SeriesMilestoneKind = z.infer<typeof SeriesMilestoneKind>;

/**
 * ET-3 — the next milestone the learner can reach. `remaining` is the number of units left
 * (notions, streak days or the single module to validate); `label` is already a sober French
 * phrase, never a ranking.
 */
export const NextMilestone = z
  .object({
    kind: SeriesMilestoneKind,
    /** Stable key shared with the engine and `milestones` (`notions_100`, `streak_30`, …). */
    key: z.string().min(1).max(120),
    remaining: z.number().int().min(0),
    label: z.string().min(1).max(120),
  })
  .describe('Prochain jalon atteignable, sans classement ni récompense de vitesse (BR-GAM-03).');
export type NextMilestone = z.infer<typeof NextMilestone>;

/** ET-3 — `GET /api/v1/streak`: streak days, the 14 local boxes and the next milestone. */
export const StreakDto = z
  .strictObject({
    days: z.number().int().min(0),
    /** Oldest first, the reference local day last (BR-GAM-02). */
    regularity: z.array(StreakDay).length(14),
    /** IANA zone of the profile, used for every civil day of the strip (BR-ACC-07). */
    timezone: z.string().min(1),
    /** Reference local day of the read, through the injected clock (ADR-0047). */
    computedOn: CivilDate,
    nextMilestone: NextMilestone.nullable(),
  })
  .describe('Série et régularité des 14 derniers jours locaux (BR-GAM-02).');
export type StreakDto = z.infer<typeof StreakDto>;

/** ET-3 — one achieved milestone; the formation is optional (streak / 100 notions are global). */
export const MilestoneItem = z
  .strictObject({
    id: Uuid,
    /** Stable identity stored in `milestones` (`module_validated:<id>`, `notions_100`, `streak_30`). */
    key: z.string().min(1).max(120),
    kind: SeriesMilestoneKind,
    /** Sober French label, for example « 100 notions retenues » or « Module 2 validé ». */
    label: z.string().min(1).max(160),
    formationId: Uuid.nullable(),
    formationTitle: z.string().min(1).max(160).nullable(),
    achievedAt: IsoDateTime,
    /** Local civil day of the achievement, in the profile IANA zone. */
    achievedOn: CivilDate,
  })
  .describe('Jalon réellement acquis, avec sa date locale et sa formation éventuelle.');
export type MilestoneItem = z.infer<typeof MilestoneItem>;

/** ET-3 — `GET /api/v1/milestones`, newest first, bounded by the screen. */
export const MilestoneListDto = z
  .strictObject({
    items: z.array(MilestoneItem).max(500),
    nextMilestone: NextMilestone.nullable(),
    timezone: z.string().min(1),
  })
  .describe('Jalons acquis par le seul apprenant connecté (RLS), sans comparaison.');
export type MilestoneListDto = z.infer<typeof MilestoneListDto>;

/**
 * CA-3 — optional `formationId` narrows the list to one formation; a malformed UUID is a 400 and
 * a formation of another learner a 404, never a 403 revealing its existence.
 */
export const MilestoneListQuery = z.strictObject({ formationId: Uuid.optional() });
export type MilestoneListQuery = z.infer<typeof MilestoneListQuery>;

const SERIES_ERRORS = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'UNAUTHENTICATED',
  'INTERNAL_ERROR',
] as const;

export const streakGet = defineRoute({
  id: 'series.streak',
  method: 'GET',
  path: '/api/v1/streak',
  auth: 'user',
  output: StreakDto,
  successStatus: 200,
  summary:
    'Série, 14 cases de régularité, fuseau et prochain jalon du seul apprenant connecté (SPEC-723).',
  errors: [...SERIES_ERRORS],
});

export const milestonesList = defineRoute({
  id: 'series.milestones',
  method: 'GET',
  path: '/api/v1/milestones',
  auth: 'user',
  query: MilestoneListQuery,
  output: MilestoneListDto,
  successStatus: 200,
  summary:
    'Jalons réellement acquis (module validé, 100 notions, 30 jours) avec leur date et leur formation (SPEC-723).',
  errors: [...SERIES_ERRORS],
});

export const seriesMilestoneRoutes = { streakGet, milestonesList } as const;
