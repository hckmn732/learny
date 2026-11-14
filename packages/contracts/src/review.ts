import { z } from 'zod';

import { CivilDate, IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';

// Contracts of the daily global quiz session (SPEC-701 ET-1). The DTO carries only client-safe
// data: the payloads are the public projections of `@learny/bricks` (solutions withheld until the
// answer, ADR-0150 §3) and the FSRS card itself never leaves the server.

/** Session mode: the full daily session or the short backup micro-session (SPEC-703). */
export const GlobalQuizModeSchema = z.enum(['full', 'micro']);
export type GlobalQuizMode = z.infer<typeof GlobalQuizModeSchema>;

/** Brick formats the global quiz draws from (SPEC-701 ET-8 durations). */
export const REVIEW_BRICK_FORMATS = [
  'recall_card',
  'choice_question',
  'cloze',
  'matching',
  'ordering',
  'categorization',
  'open_question',
] as const;
export const ReviewBrickFormatSchema = z.enum(REVIEW_BRICK_FORMATS);
export type ReviewBrickFormat = z.infer<typeof ReviewBrickFormatSchema>;

/** Client state of one game item: not played, answered, skipped or withdrawn (BR-MEM-09). */
export const ReviewItemStateSchema = z.enum(['todo', 'answered', 'skipped', 'withdrawn']);
export type ReviewItemState = z.infer<typeof ReviewItemStateSchema>;

/** Self-assessment grades of the recall card (BR-MEM-02), with their previewed due date. */
export const ReviewIntervalsSchema = z
  .object({
    again: IsoDateTime,
    hard: IsoDateTime,
    good: IsoDateTime,
    easy: IsoDateTime,
  })
  .strict();
export type ReviewIntervals = z.infer<typeof ReviewIntervalsSchema>;

/** One game of the session. `payload` is the client-safe projection of the brick version. */
export const ReviewItemDtoSchema = z
  .object({
    position: z.number().int().min(0),
    brickId: Uuid,
    brickVersionId: Uuid,
    type: ReviewBrickFormatSchema,
    /** Game name (« Carte de rappel », « Association »…). */
    name: z.string().min(1),
    /** Technique badge of the game header (EF-8). */
    tech: z.string().min(1),
    /** Rail label: notion label, or the game label of a multi-notion brick. */
    displayLabel: z.string().min(1),
    /** Sub-title scope: « Module 2 » or « Modules 1 et 2 mêlés ». */
    scopeLabel: z.string().min(1),
    /** Tutor reason of the choice, when the item answers a gap (EF-7). */
    reason: z.string().nullable(),
    notionIds: z.array(Uuid).min(1),
    payload: z.unknown(),
    /** Previewed due dates per self-assessment grade, recall card only. */
    intervals: ReviewIntervalsSchema.nullable(),
    state: ReviewItemStateSchema,
    result: z.unknown().nullable(),
  })
  .strict();
export type ReviewItemDto = z.infer<typeof ReviewItemDtoSchema>;

/** Header pills of the session screen (EF-3). */
export const GlobalQuizHeaderSchema = z
  .object({
    notionCount: z.number().int().min(0),
    /** Empty strings when nothing is due: the header is not rendered in that state. */
    modulesLabel: z.string(),
    estimatedMinutes: z.number().int().min(0),
    subtitle: z.string(),
  })
  .strict();
export type GlobalQuizHeader = z.infer<typeof GlobalQuizHeaderSchema>;

/** Generated at creation and frozen in `activities.config` (ET-5, ADR-0180). */
export const ReviewRationaleSchema = z
  .object({ label: z.string().min(1), text: z.string().min(1) })
  .strict();
export type ReviewRationale = z.infer<typeof ReviewRationaleSchema>;

/** Session of the day: an existing one (idempotent read) or a freshly created one (EF-2). */
export const GlobalQuizSessionDtoSchema = z
  .object({
    /** Null in the `empty` and `paused` states: no activity and no attempt exist (CL-1, EF-12). */
    sessionId: Uuid.nullable(),
    attemptId: Uuid.nullable(),
    formationId: Uuid,
    forDate: CivilDate,
    mode: GlobalQuizModeSchema,
    status: z.enum(['in_progress', 'completed', 'empty', 'paused']),
    header: GlobalQuizHeaderSchema,
    modeOptions: z
      .object({ fullMinutes: z.number().int().min(0), microMinutes: z.number().int().min(1) })
      .strict(),
    /** Note right of the duration switch (EF-4); empty when nothing is due. */
    note: z.string(),
    rationale: z.array(ReviewRationaleSchema).max(3),
    items: z.array(ReviewItemDtoSchema),
    currentPosition: z.number().int().min(0),
    summary: z.unknown().nullable(),
  })
  .strict();
export type GlobalQuizSessionDto = z.infer<typeof GlobalQuizSessionDtoSchema>;

/** Answer of one game: a recall-card self-assessment, or the game response of SPEC-702. */
export const ReviewAnswerInputSchema = z
  .object({
    position: z.number().int().min(0),
    clientAnswerId: Uuid,
    timeMs: z.number().int().min(0).max(3_600_000),
    skipped: z.literal(true).optional(),
    response: z.unknown().optional(),
  })
  .strict()
  .refine((input) => (input.skipped === true) !== (input.response !== undefined), {
    message: 'Exactement l’un de skipped ou response est requis.',
  });
export type ReviewAnswerInput = z.infer<typeof ReviewAnswerInputSchema>;

/**
 * Response schemas of the four games (SPEC-702 ET-1). Ids are the opaque ids of the public
 * payload (`p1`, `r3`, `o2`, `c1`): they carry no solution. The service validates the shape
 * before grading and maps it to the brick response schema of SPEC-502.
 */
export const ReviewMatchingResponseSchema = z
  .object({
    pairs: z
      .array(
        z
          .object({ leftId: z.string().min(1).max(32), rightId: z.string().min(1).max(32) })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();
export type ReviewMatchingResponse = z.infer<typeof ReviewMatchingResponseSchema>;

export const ReviewOrderingResponseSchema = z
  .object({
    order: z
      .array(z.string().min(1).max(32))
      .min(1)
      .max(10)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Les identifiants d’ordre doivent être uniques.',
      }),
  })
  .strict();
export type ReviewOrderingResponse = z.infer<typeof ReviewOrderingResponseSchema>;

export const ReviewCategorizationResponseSchema = z
  .object({
    assignments: z
      .array(
        z
          .object({ itemId: z.string().min(1).max(32), categoryId: z.string().min(1).max(32) })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();
export type ReviewCategorizationResponse = z.infer<typeof ReviewCategorizationResponseSchema>;

export const ReviewClozeResponseSchema = z
  .object({
    gaps: z
      .array(
        z
          .object({
            gapId: z.string().regex(/^\d+$/u, 'Identifiant de trou numérique attendu.'),
            value: z.string().max(120),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();
export type ReviewClozeResponse = z.infer<typeof ReviewClozeResponseSchema>;

/** Per-type schema table: the service picks the entry from the brick type. */
export const REVIEW_GAME_RESPONSE_SCHEMAS = {
  matching: ReviewMatchingResponseSchema,
  ordering: ReviewOrderingResponseSchema,
  categorization: ReviewCategorizationResponseSchema,
  cloze: ReviewClozeResponseSchema,
} as const;

export type ReviewGameFormat = keyof typeof REVIEW_GAME_RESPONSE_SCHEMAS;

export type ReviewGameResponse =
  | ReviewMatchingResponse
  | ReviewOrderingResponse
  | ReviewCategorizationResponse
  | ReviewClozeResponse;

/**
 * Correction schemas of the four games (SPEC-702 ET-2). `kind` discriminates the union so a
 * browser can validate `ReviewAnswerResultDto.correction` without knowing the item type.
 */
export const ReviewMatchingCorrectionSchema = z
  .object({
    kind: z.literal('matching'),
    pairs: z
      .array(
        z
          .object({
            leftId: z.string().min(1).max(32),
            rightId: z.string().min(1).max(32).nullable(),
            ok: z.boolean(),
            expectedRightId: z.string().min(1).max(32),
            expectedLeftLabel: z.string().min(1).max(200),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export type ReviewMatchingCorrection = z.infer<typeof ReviewMatchingCorrectionSchema>;

export const ReviewOrderingCorrectionSchema = z
  .object({
    kind: z.literal('ordering'),
    rows: z
      .array(
        z
          .object({
            stepId: z.string().min(1).max(32),
            position: z.number().int().min(1).max(10),
            ok: z.boolean(),
            expectedPosition: z.number().int().min(1).max(10),
          })
          .strict(),
      )
      .max(10),
  })
  .strict();
export type ReviewOrderingCorrection = z.infer<typeof ReviewOrderingCorrectionSchema>;

export const ReviewCategorizationCorrectionSchema = z
  .object({
    kind: z.literal('categorization'),
    rows: z
      .array(
        z
          .object({
            itemId: z.string().min(1).max(32),
            categoryId: z.string().min(1).max(32).nullable(),
            ok: z.boolean(),
            expectedCategoryId: z.string().min(1).max(32),
            expectedCategoryLabel: z.string().min(1).max(60),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();
export type ReviewCategorizationCorrection = z.infer<typeof ReviewCategorizationCorrectionSchema>;

export const ReviewClozeCorrectionSchema = z
  .object({
    kind: z.literal('cloze'),
    gaps: z
      .array(
        z
          .object({
            gapId: z.string().min(1).max(4),
            ok: z.boolean(),
            expected: z.string().min(1).max(120),
            /** Answer given by the learner, replayed read-only after a reload (EF-7). */
            given: z.string().max(120).optional(),
          })
          .strict(),
      )
      .max(10),
  })
  .strict();
export type ReviewClozeCorrection = z.infer<typeof ReviewClozeCorrectionSchema>;

export const ReviewGameCorrectionSchema = z.discriminatedUnion('kind', [
  ReviewMatchingCorrectionSchema,
  ReviewOrderingCorrectionSchema,
  ReviewCategorizationCorrectionSchema,
  ReviewClozeCorrectionSchema,
]);
export type ReviewGameCorrection = z.infer<typeof ReviewGameCorrectionSchema>;

/** Immediate result of an answer (BR-MEM-10): correction, explanation and FSRS outcomes. */
export const ReviewNotionOutcomeSchema = z
  .object({ notionId: Uuid, rating: z.string(), nextDueAt: IsoDateTime.nullable() })
  .strict();
export type ReviewNotionOutcome = z.infer<typeof ReviewNotionOutcomeSchema>;

export const ReviewAnswerResultDtoSchema = z
  .object({
    position: z.number().int().min(0),
    skipped: z.boolean(),
    isCorrect: z.boolean().nullable(),
    correction: z.unknown().nullable(),
    explanation: z.string().nullable(),
    notions: z.array(ReviewNotionOutcomeSchema),
  })
  .strict();
export type ReviewAnswerResultDto = z.infer<typeof ReviewAnswerResultDtoSchema>;

/** End screen of the session (EF-11). */
export const ReviewSummaryDtoSchema = z
  .object({
    reviewedCount: z.number().int().min(0),
    minutes: z.number().int().min(1),
    okCount: z.number().int().min(0),
    soonCount: z.number().int().min(0),
    streakDays: z.number().int().min(0),
    nextSessionAt: IsoDateTime.nullable(),
  })
  .strict();
export type ReviewSummaryDto = z.infer<typeof ReviewSummaryDtoSchema>;

const GlobalQuizTodayParams = z.object({ fid: Uuid }).strict();
const GlobalQuizTodayQuery = z.object({ mode: GlobalQuizModeSchema.default('full') }).strict();
const ReviewSessionParams = z.object({ sid: Uuid }).strict();

export const globalQuizToday = defineRoute({
  id: 'review.globalQuizToday',
  method: 'GET',
  path: '/api/v1/formations/:fid/global-quiz/today',
  auth: 'user',
  params: GlobalQuizTodayParams,
  query: GlobalQuizTodayQuery,
  output: GlobalQuizSessionDtoSchema,
  successStatus: 200,
  rateLimit: 'default',
  summary:
    'Session du jour du quiz global d’une formation, créée au premier chargement du jour (SPEC-701).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'UNAUTHENTICATED', 'INTERNAL_ERROR'],
});

export const reviewAnswer = defineRoute({
  id: 'review.answer',
  method: 'POST',
  path: '/api/v1/review-sessions/:sid/answers',
  auth: 'user',
  params: ReviewSessionParams,
  body: ReviewAnswerInputSchema,
  output: ReviewAnswerResultDtoSchema,
  successStatus: 200,
  rateLimit: 'default',
  summary:
    'Enregistre la réponse d’un jeu de la session du jour, idempotente par clientAnswerId (SPEC-701).',
  errors: [
    'VALIDATION_FAILED',
    'NOT_FOUND',
    'CONFLICT',
    'SESSION_CLOSED',
    'UNAUTHENTICATED',
    'INTERNAL_ERROR',
  ],
});

export const reviewComplete = defineRoute({
  id: 'review.complete',
  method: 'POST',
  path: '/api/v1/review-sessions/:sid/complete',
  auth: 'user',
  params: ReviewSessionParams,
  output: ReviewSummaryDtoSchema,
  successStatus: 200,
  rateLimit: 'default',
  summary: 'Clôture la session du jour et renvoie son résumé, idempotent (SPEC-701).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'SESSION_CLOSED', 'UNAUTHENTICATED', 'INTERNAL_ERROR'],
});

export const reviewRoutes = {
  globalQuizToday,
  reviewAnswer,
  reviewComplete,
} as const;
