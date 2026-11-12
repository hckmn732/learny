// Retention at one and two months (SPEC-408 ET-1, BR-MEM-06, ADR-0210, ADR-0283). The function is
// pure: the evaluation instant, the learner's time zone and the business bounds come from the
// caller. Nothing is read from a clock, a database, the network or the configuration package.
import { z } from 'zod';

import { assertValid } from '../errors';
import { daysBetween, localDateOf } from '../time';
import { IdSchema, InstantIsoSchema, TimeZoneSchema } from '../types';
import type { Id, InstantIso, IsoDate, TimeZone } from '../types';

/** BR-MEM-06 — the two displayed horizons, mirroring `ENGINE.retention.horizonsDays`. */
export const DEFAULT_RETENTION_HORIZONS = [30, 60] as const;

/** BR-MEM-06 — the ± 3-day tolerance, mirroring `ENGINE.retention.toleranceDays`. */
export const DEFAULT_RETENTION_TOLERANCE_DAYS = 3;

const finiteNumber = () =>
  z.number().refine((value) => Number.isFinite(value) && !Object.is(value, -0), {
    message: 'Nombre fini requis, -0 refusé.',
  });
const positiveInteger = () =>
  finiteNumber().refine((value) => Number.isInteger(value) && value >= 1, {
    message: 'Entier strictement positif requis.',
  });
const nonNegativeInteger = () =>
  finiteNumber().refine((value) => Number.isInteger(value) && value >= 0, {
    message: 'Entier positif ou nul requis.',
  });

/**
 * A validated module and the notions it taught. `validatedAt` is the validation instant of the
 * module; a null value marks a module that is not validated yet (CL-4 of SPEC-407, BR-FOR-06).
 */
export interface RetentionModule {
  readonly moduleId: Id;
  readonly validatedAt: InstantIso | null;
  readonly notionIds: readonly Id[];
}

export const RetentionModuleSchema = z
  .object({
    moduleId: IdSchema,
    validatedAt: InstantIsoSchema.nullable(),
    notionIds: z.array(IdSchema),
  })
  .strict() as z.ZodType<RetentionModule>;

/** One review log line: the notion reviewed, its instant and whether the recall succeeded. */
export interface RetentionReview {
  readonly reviewId: Id;
  readonly notionId: Id;
  readonly reviewedAt: InstantIso;
  readonly correct: boolean;
}

export const RetentionReviewSchema = z
  .object({
    reviewId: IdSchema,
    notionId: IdSchema,
    reviewedAt: InstantIsoSchema,
    correct: z.boolean(),
  })
  .strict() as z.ZodType<RetentionReview>;

/** Business bounds supplied by the caller (`ENGINE.retention` in the application). */
export interface RetentionParams {
  readonly horizonsDays: readonly number[];
  readonly toleranceDays: number;
}

export const RetentionParamsSchema = z
  .object({
    horizonsDays: z.array(positiveInteger()).min(1),
    toleranceDays: nonNegativeInteger(),
  })
  .strict()
  .refine(
    (params) => params.toleranceDays < Math.min(...params.horizonsDays),
    'La tolérance doit rester inférieure au plus petit horizon.',
  ) as z.ZodType<RetentionParams>;

export interface CalculateRetentionInput {
  readonly modules: readonly RetentionModule[];
  readonly reviews: readonly RetentionReview[];
  readonly at: InstantIso;
  /** Learner's IANA zone; the service always passes it, `UTC` is the neutral fallback. */
  readonly timeZone?: TimeZone;
  /** Business bounds; the service passes `ENGINE.retention`, the defaults mirror it. */
  readonly params?: RetentionParams;
}

export const CalculateRetentionInputSchema = z
  .object({
    modules: z.array(RetentionModuleSchema),
    reviews: z.array(RetentionReviewSchema),
    at: InstantIsoSchema,
    timeZone: TimeZoneSchema.optional(),
    params: RetentionParamsSchema.optional(),
  })
  .strict() as z.ZodType<CalculateRetentionInput>;

/** One horizon (30 or 60 days) after module validation, with its inclusive window in days. */
export interface RetentionHorizon {
  readonly horizonDays: number;
  /** First day counted after validation, inclusive (`horizonDays − toleranceDays`). */
  readonly windowStartDays: number;
  /** Last day counted after validation, inclusive (`horizonDays + toleranceDays`). */
  readonly windowEndDays: number;
  /**
   * Notions of validated modules whose window has opened at the evaluation instant. A notion can
   * be eligible and still absent from the denominator when no review fell inside the window.
   */
  readonly eligible: number;
  /** Distinct notions with a selected review inside the window (the denominator). */
  readonly reviewed: number;
  /** Reviewed notions whose selected review succeeded (the numerator). */
  readonly successful: number;
  /** `successful / reviewed` in percent, in double precision; null when nothing was reviewed. */
  readonly rate: number | null;
}

export const RetentionHorizonSchema = z
  .object({
    horizonDays: positiveInteger(),
    windowStartDays: nonNegativeInteger(),
    windowEndDays: positiveInteger(),
    eligible: nonNegativeInteger(),
    reviewed: nonNegativeInteger(),
    successful: nonNegativeInteger(),
    rate: z
      .number()
      .refine((value) => Number.isFinite(value) && value >= 0 && value <= 100, {
        message: 'Taux hors de 0..100.',
      })
      .nullable(),
  })
  .strict() as z.ZodType<RetentionHorizon>;

interface NotionValidation {
  readonly notionId: Id;
  readonly moduleId: Id;
  readonly validatedOn: IsoDate;
}

/** Stable order independent of the caller order: identifier first, then the tie-breakers. */
function compareModules(left: RetentionModule, right: RetentionModule): number {
  return left.moduleId < right.moduleId ? -1 : left.moduleId > right.moduleId ? 1 : 0;
}

function compareReviews(left: RetentionReview, right: RetentionReview): number {
  if (left.reviewedAt !== right.reviewedAt) return left.reviewedAt < right.reviewedAt ? -1 : 1;
  if (left.reviewId !== right.reviewId) return left.reviewId < right.reviewId ? -1 : 1;
  if (left.notionId !== right.notionId) return left.notionId < right.notionId ? -1 : 1;
  return Number(left.correct) - Number(right.correct);
}

/**
 * Maps each notion to the earliest validated module that teaches it. A duplicated notion across
 * modules is a data anomaly: the earliest validation wins, then the smallest module identifier,
 * so the result never depends on the row order (ADR-0283).
 */
function notionValidations(
  modules: readonly RetentionModule[],
  timeZone: TimeZone,
): Map<Id, NotionValidation> {
  const result = new Map<Id, NotionValidation>();
  const sorted = [...modules].sort(compareModules);
  for (const module of sorted) {
    if (module.validatedAt === null) continue;
    const validatedOn = localDateOf(module.validatedAt, timeZone);
    for (const notionId of [...new Set(module.notionIds)].sort()) {
      const current = result.get(notionId);
      if (
        current === undefined ||
        validatedOn < current.validatedOn ||
        (validatedOn === current.validatedOn && module.moduleId < current.moduleId)
      ) {
        result.set(notionId, { notionId, moduleId: module.moduleId, validatedOn });
      }
    }
  }
  return result;
}

/** Drops a replayed review identifier, keeping the canonically first line (ET-3). */
function uniqueReviews(reviews: readonly RetentionReview[]): RetentionReview[] {
  const seen = new Set<string>();
  const result: RetentionReview[] = [];
  for (const review of [...reviews].sort(compareReviews)) {
    if (seen.has(review.reviewId)) continue;
    seen.add(review.reviewId);
    result.push(review);
  }
  return result;
}

/**
 * BR-MEM-06 — share of successful notions among those reviewed inside the ± tolerance window after
 * their module validation. Each notion contributes at most once per horizon: its first review in
 * the window is retained (ADR-0210), which measures recall before the repetitions of the window.
 * A horizon without any reviewed notion returns `rate: null`, never a misleading 0 % (EF-2, CL-1).
 */
export function calculateRetention(input: CalculateRetentionInput): RetentionHorizon[] {
  const parsed = assertValid(CalculateRetentionInputSchema, input);
  const timeZone = parsed.timeZone ?? 'UTC';
  const params: RetentionParams = parsed.params ?? {
    horizonsDays: DEFAULT_RETENTION_HORIZONS,
    toleranceDays: DEFAULT_RETENTION_TOLERANCE_DAYS,
  };
  const horizons = [...new Set(params.horizonsDays)].sort((left, right) => left - right);
  const validations = notionValidations(parsed.modules, timeZone);
  const atDay = localDateOf(parsed.at, timeZone);
  const reviews = uniqueReviews(parsed.reviews);

  return horizons.map((horizonDays) => {
    const windowStartDays = horizonDays - params.toleranceDays;
    const windowEndDays = horizonDays + params.toleranceDays;

    let eligible = 0;
    for (const validation of validations.values()) {
      if (daysBetween(validation.validatedOn, atDay) >= windowStartDays) eligible += 1;
    }

    const selected = new Map<Id, RetentionReview>();
    for (const review of reviews) {
      if (review.reviewedAt > parsed.at) continue;
      const validation = validations.get(review.notionId);
      if (validation === undefined) continue;
      const ageDays = daysBetween(validation.validatedOn, localDateOf(review.reviewedAt, timeZone));
      if (ageDays < windowStartDays || ageDays > windowEndDays) continue;
      // Reviews are sorted, so the first line kept per notion is the first of the window.
      if (!selected.has(review.notionId)) selected.set(review.notionId, review);
    }

    let successful = 0;
    for (const review of selected.values()) if (review.correct) successful += 1;
    const reviewed = selected.size;
    return {
      horizonDays,
      windowStartDays,
      windowEndDays,
      eligible,
      reviewed,
      successful,
      rate: reviewed === 0 ? null : (successful / reviewed) * 100,
    };
  });
}
