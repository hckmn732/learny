import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';
import { LEARNING_GAP_NATURES } from './learning';

// Contracts of the « Mes lacunes » page (SPEC-615 EF-1 to EF-3, ET-3 to ET-5; BR-LAC-05).
//
// The DTO is the exact view model of SCR-13: three statistics, one counter per nature computed on
// every open gap, one card per gap and the next review instant. Links are built server-side from
// the stored nature (ET-4) and only a section that actually exists is exposed (ET-5), so the
// browser never guesses a remediation or a broken course anchor.

export const GapNature = z.enum(LEARNING_GAP_NATURES);
export type GapNature = z.infer<typeof GapNature>;

/** BR-LAC-04 — remediation families, derived from the stored nature, never from model text. */
export const GAP_RECOMMENDED_ACTIONS = [
  'global_quiz',
  'confrontation',
  'alternative_explanation',
  'practice_exercise',
] as const;
export const GapRecommendedAction = z.enum(GAP_RECOMMENDED_ACTIONS);
export type GapRecommendedAction = z.infer<typeof GapRecommendedAction>;

export const GAP_TRAINING_KINDS = ['quiz', 'exercise'] as const;
export const GapTrainingKind = z.enum(GAP_TRAINING_KINDS);
export type GapTrainingKind = z.infer<typeof GapTrainingKind>;

/** Counters of the filter row: one entry per nature, always all four keys. */
export const GapCountsByNature = z
  .object({
    forgetting: z.number().int().min(0),
    confusion: z.number().int().min(0),
    misunderstanding: z.number().int().min(0),
    application: z.number().int().min(0),
  })
  .strict();
export type GapCountsByNature = z.infer<typeof GapCountsByNature>;

/** EF-1 — the three statistics, computed on every open gap of the formation. */
export const GapSummary = z
  .object({
    openGaps: z.number().int().min(0),
    masteredNotions: z.number().int().min(0),
    /** Distinct module positions holding an open gap, ascending. */
    gapModules: z.array(z.number().int().min(1)),
    /** Distinct module positions holding a mastered notion, ascending. */
    masteredModules: z.array(z.number().int().min(1)),
  })
  .strict();
export type GapSummary = z.infer<typeof GapSummary>;

/** EF-3, ET-4 — target of « S'entraîner », already resolved for the stored nature. */
export const GapTrainingLink = z
  .object({
    kind: GapTrainingKind,
    href: z.string().min(1).max(2048),
  })
  .strict();
export type GapTrainingLink = z.infer<typeof GapTrainingLink>;

/** EF-3, ET-5 — precise course section; null when no live section anchors the notion. */
export const GapCourseLink = z
  .object({
    sectionId: Uuid,
    anchor: z.string().min(1).max(200),
    href: z.string().min(1).max(2048),
  })
  .strict();
export type GapCourseLink = z.infer<typeof GapCourseLink>;

/** BR-LAC-05 — one card of the list, with its mastery and its module threshold. */
export const GapCard = z
  .object({
    notionId: Uuid,
    notionLabel: z.string().min(1).max(120),
    nature: GapNature,
    recommendedAction: GapRecommendedAction,
    /** Label of the notion this gap is confused with, for `confusion` only. */
    confusedWithLabel: z.string().min(1).max(120).nullable(),
    moduleId: Uuid,
    modulePosition: z.number().int().min(1),
    moduleTitle: z.string().min(1).max(160),
    chapterId: Uuid,
    chapterTitle: z.string().min(1).max(160),
    /** EF-2, ET-5 — what revealed the gap, from the gap event (state evidence as fallback). */
    revealedBy: z.string().max(2000),
    detectedAt: IsoDateTime,
    mastery: z.number().min(0).max(100),
    threshold: z.number().int().min(60).max(95),
    training: GapTrainingLink,
    course: GapCourseLink.nullable(),
  })
  .strict();
export type GapCard = z.infer<typeof GapCard>;

/** `?nature=` — an unknown value is a 400; the page falls back to « Toutes » (CL-4). */
export const GapListQuery = z
  .object({
    nature: GapNature.optional(),
  })
  .strict();
export type GapListQuery = z.infer<typeof GapListQuery>;

export const GapListDto = z
  .object({
    formationId: Uuid,
    formationTitle: z.string().min(1).max(160),
    /** Echo of the applied filter; null for « Toutes ». */
    nature: GapNature.nullable(),
    summary: GapSummary,
    countsByNature: GapCountsByNature,
    items: z.array(GapCard),
    nextReviewAt: IsoDateTime.nullable(),
    timezone: z.string().min(1),
    /** Instant of the read, so the page renders « 17:00 » deterministically. */
    generatedAt: IsoDateTime,
  })
  .strict();
export type GapListDto = z.infer<typeof GapListDto>;

export const gapListParams = z.object({ fid: Uuid });

/** ET-3 — read of the open gaps of one formation, with the filter and the independent counters. */
export const gapsList = defineRoute({
  id: 'gaps.list',
  method: 'GET',
  path: '/api/v1/formations/:fid/gaps',
  auth: 'user',
  params: gapListParams,
  query: GapListQuery,
  output: GapListDto,
  successStatus: 200,
  summary:
    'Lacunes ouvertes d’une formation avec statistiques, compteurs par nature, cartes et prochaine révision (SPEC-615).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'UNAUTHENTICATED', 'INTERNAL_ERROR'],
});

export const gapRoutes = { gapsList } as const;
