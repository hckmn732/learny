import { z } from 'zod';

import { CivilDate, IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';
import { LEARNING_GAP_NATURES } from './learning';
import { MilestoneItem } from './serie-regularite-et-jalons-interface';

// Final review of a completed formation (SCR-16, SPEC-617 EF-1 to EF-4, ET-1 to ET-5;
// BR-FOR-12, BR-PRO-03, ADR-0015).
//
// One read returns everything the screen shows: the acquisitions, the fragile notions, the notion
// map frozen at the completion instant, the hours actually worked, the retention indicators and
// the current memory-interview mode. The mode is chosen or changed with one idempotent POST; a
// stopped interview cancels future slots and reminders without deleting any history.

/** BR-FOR-12 — the two memory-interview modes of a completed formation. */
export const FINAL_REVIEW_MODES = ['light', 'stopped'] as const;
export const FinalReviewMode = z.enum(FINAL_REVIEW_MODES);
export type FinalReviewMode = z.infer<typeof FinalReviewMode>;

export const FinalReviewGap = z
  .strictObject({
    notionId: Uuid,
    label: z.string().min(1).max(120),
    nature: z.enum(LEARNING_GAP_NATURES),
    natureLabel: z.string().min(1).max(40),
    /** What revealed the gap, from its persisted evidence. */
    evidence: z.string().max(2000),
    mastery: z.number().min(0).max(100),
    moduleId: Uuid,
    modulePosition: z.number().int().min(1),
    moduleTitle: z.string().min(1).max(160),
    /** BR-LAC-04 — targeted global quiz or practice exercise, resolved server-side. */
    trainingHref: z.string().min(1).max(2048),
  })
  .describe('Une notion fragile au moment du bilan final (BR-FOR-12).');
export type FinalReviewGap = z.infer<typeof FinalReviewGap>;

export const FinalReviewNotion = z
  .strictObject({
    notionId: Uuid,
    label: z.string().min(1).max(120),
    modulePosition: z.number().int().min(1),
    mastery: z.number().min(0).max(100).nullable(),
    gapNature: z.enum(LEARNING_GAP_NATURES).nullable(),
  })
  .describe('Un point de la carte des notions, à la date de fin.');
export type FinalReviewNotion = z.infer<typeof FinalReviewNotion>;

export const FinalReviewModule = z
  .strictObject({
    moduleId: Uuid,
    position: z.number().int().min(1),
    title: z.string().min(1).max(160),
    threshold: z.number().int().min(60).max(95),
    masteredCount: z.number().int().min(0),
    notions: z.array(FinalReviewNotion).max(500),
  })
  .describe('Un module du programme et ses notions, pour la carte du bilan.');
export type FinalReviewModule = z.infer<typeof FinalReviewModule>;

export const FinalReviewStats = z
  .strictObject({
    /** EF-1 — notions with `mastery >= threshold` and no active gap. */
    masteredNotions: z.number().int().min(0),
    fragileNotions: z.number().int().min(0),
    totalNotions: z.number().int().min(0),
    /** CA-3 — minutes of `done` slots only. */
    completedMinutes: z.number().int().min(0),
    /** Final result: rounded average of the validated modules' best scores. */
    resultPercent: z.number().int().min(0).max(100).nullable(),
  })
  .describe('Cartes statistiques du bilan final (EF-1, CA-3).');
export type FinalReviewStats = z.infer<typeof FinalReviewStats>;

export const FinalReviewRetention = z
  .strictObject({
    /** Null when the horizon is not measurable yet: the screen prints « Pas encore disponible ». */
    oneMonth: z.number().int().min(0).max(100).nullable(),
    twoMonths: z.number().int().min(0).max(100).nullable(),
  })
  .describe('Rétention à 1 et 2 mois, jamais 0 % par défaut (CA-3).');
export type FinalReviewRetention = z.infer<typeof FinalReviewRetention>;

export const FinalReviewMaintenance = z
  .strictObject({
    /** Null until the learner chooses; `light` keeps a five-minute daily interview. */
    mode: FinalReviewMode.nullable(),
    /** BR-FOR-12, ADR-0015 — a light interview is capped at five minutes per day. */
    dailyMinutes: z.number().int().min(1).max(60),
    /** The light interview only draws notions that are due. */
    dueOnly: z.boolean(),
    /** False once the interview is stopped: no reminder is planned for this formation. */
    reminders: z.boolean(),
  })
  .describe('Effets du mode d’entretien sur le quiz global et les notifications (EF-2).');
export type FinalReviewMaintenance = z.infer<typeof FinalReviewMaintenance>;

export const FinalReviewDto = z
  .strictObject({
    formationId: Uuid,
    formationTitle: z.string().min(1).max(160),
    monogram: z.string().min(1).max(3),
    accent: z.enum(['indigo', 'green', 'orange', 'violet', 'teal']),
    status: z.literal('completed'),
    /** ET-5 — the programme version the bilan refers to; null for a pre-versioned programme. */
    programVersion: z.number().int().min(1).nullable(),
    /** ET-5 — completion instant and civil date, in the learner's IANA zone. */
    completedAt: IsoDateTime,
    completedOn: CivilDate,
    /** Whole weeks from the start date to the completion date, minimum 1. */
    weeks: z.number().int().min(1).nullable(),
    timezone: z.string().min(1),
    stats: FinalReviewStats,
    retention: FinalReviewRetention,
    gaps: z.array(FinalReviewGap).max(500),
    modules: z.array(FinalReviewModule).max(100),
    /** BR-PRO-03 — notions still due in a light interview, zero after stop. */
    dueCount: z.number().int().min(0),
    maintenance: FinalReviewMaintenance,
    /** SPEC-723 EF-3 — every milestone actually reached, with its local date (BR-GAM-03). */
    milestones: z.array(MilestoneItem).max(500),
    /** Stable link to the full notion map (SPEC-616), frozen at the completion instant. */
    mapHref: z.string().min(1).max(2048),
    /** Optimistic guard of POST /maintenance (CL-2). */
    updatedAt: IsoDateTime,
    /** Instant of the read, through the injectable clock (ADR-0047). */
    generatedAt: IsoDateTime,
  })
  .describe('Bilan final d’une formation terminée, prêt pour SCR-16 (BR-FOR-12).');
export type FinalReviewDto = z.infer<typeof FinalReviewDto>;

/** ET-3 — `fid` is an UUID; a malformed identifier is a 400, a foreign one a 404. */
export const finalReviewParams = z.strictObject({ fid: Uuid });

/** ET-2, CL-2 — one mode transition, optionally guarded by the object version last read. */
export const MaintenanceInput = z
  .strictObject({
    mode: FinalReviewMode,
    expectedUpdatedAt: IsoDateTime.optional(),
  })
  .describe('Choix ou changement de l’entretien de mémoire (BR-FOR-12).');
export type MaintenanceInput = z.infer<typeof MaintenanceInput>;

const FINAL_REVIEW_ERRORS = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'UNAUTHENTICATED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export const getFinalReview = defineRoute({
  id: 'formations.finalReview',
  method: 'GET',
  path: '/api/v1/formations/:fid/final-review',
  auth: 'user',
  params: finalReviewParams,
  output: FinalReviewDto,
  successStatus: 200,
  rateLimit: 'default',
  summary:
    'Renvoie le bilan final d’une formation terminée : acquis, notions fragiles, carte, heures, rétention et entretien (SPEC-617).',
  errors: [...FINAL_REVIEW_ERRORS],
});

export const setMaintenance = defineRoute({
  id: 'formations.maintenance',
  method: 'POST',
  path: '/api/v1/formations/:fid/maintenance',
  auth: 'user',
  params: finalReviewParams,
  body: MaintenanceInput,
  output: FinalReviewDto,
  successStatus: 200,
  idempotent: true,
  rateLimit: 'default',
  summary:
    'Choisit ou change l’entretien de mémoire d’une formation terminée (light ou stopped) et renvoie le bilan à jour (SPEC-617).',
  errors: [...FINAL_REVIEW_ERRORS, 'IDEMPOTENCY_KEY_REQUIRED'],
});

export const finalReviewRoutes = { getFinalReview, setMaintenance } as const;
