// Zod schemas and the persistence adapter of the memory/gap domain (SPEC-107 ET-2, ET-6, CL-1).
//
// `notion_states.fsrs` and the `fsrs_before`/`fsrs_after` snapshots of `review_logs` keep the
// serialised `ts-fsrs` card. The library stores `due` and `last_review` as `Date`; JSON.stringify
// turns them into ISO strings and omits an undefined `last_review`. The adapter below canonicalises
// both dates to ISO UTC and keeps `last_review: null` explicit, then validates the result before it
// reaches Postgres. Non-finite numbers are refused (CL-1). `learning_steps` is accepted as the
// fifth ts-fsrs 5 field even though ET-2 lists the nine pedagogical fields; ts-fsrs 6 removes it.
import { z } from 'zod';

/** A finite number; JSON cannot carry NaN or Infinity and the database must never receive one. */
const finiteNumber = z.number().refine(Number.isFinite, { message: 'un nombre fini est attendu' });

const nonNegative = finiteNumber.refine((value) => value >= 0, {
  message: 'une valeur positive ou nulle est attendue',
});

const nonNegativeInteger = z.int().refine((value) => value >= 0, {
  message: 'un entier positif ou nul est attendu',
});

/** State values of `ts-fsrs` (`State.New|Learning|Review|Relearning`). */
export const FSRS_STATES = [0, 1, 2, 3] as const;

/** A canonical UTC instant: `new Date(value).toISOString()` must round-trip exactly. */
export const utcInstantSchema = z.string().refine(
  (value) => {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.toISOString() === value;
  },
  { message: 'un instant UTC ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ) est attendu' },
);

/**
 * ET-2 — serialised `ts-fsrs` card. The nine fields named by the specification are required;
 * `learning_steps` is optional so that a card serialised by ts-fsrs 5 validates unchanged.
 */
export const fsrsCardSchema = z.object({
  due: utcInstantSchema,
  stability: nonNegative,
  difficulty: nonNegative,
  elapsed_days: nonNegativeInteger,
  scheduled_days: nonNegativeInteger,
  reps: nonNegativeInteger,
  lapses: nonNegativeInteger,
  state: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  last_review: utcInstantSchema.nullable(),
  learning_steps: nonNegativeInteger.optional(),
});

export type FsrsCardJson = z.infer<typeof fsrsCardSchema>;
export type FsrsState = (typeof FSRS_STATES)[number];

/** Input accepted by the persistence adapter: the card shape with `Date` or ISO instants. */
export interface FsrsCardInput {
  due: Date | string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: FsrsState;
  last_review?: Date | string | null;
  learning_steps?: number | undefined;
}

/** Converts one instant to its canonical ISO UTC form; an invalid date yields `null`. */
export function toUtcIso(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * ET-2 — persistence adapter: turns a `ts-fsrs` card (or its already serialised form) into the
 * canonical JSON stored in Postgres. Dates become ISO UTC; a non-finite number or an invalid date
 * is refused by the schema, so nothing is written for CL-1.
 */
export function toFsrsCardJson(card: FsrsCardInput): FsrsCardJson {
  const due = toUtcIso(card.due);
  if (due === null) throw new Error('fsrs.due : instant invalide');
  let lastReview: string | null = null;
  if (card.last_review !== null && card.last_review !== undefined) {
    const iso = toUtcIso(card.last_review);
    if (iso === null) throw new Error('fsrs.last_review : instant invalide');
    lastReview = iso;
  }
  const json: FsrsCardJson = {
    due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: lastReview,
  };
  if (card.learning_steps !== undefined) json.learning_steps = card.learning_steps;
  return fsrsCardSchema.parse(json);
}

/** ET-2 — validates an already serialised card (read from JSON or a test fixture). */
export function parseFsrsCard(value: unknown): FsrsCardJson {
  return fsrsCardSchema.parse(value);
}

/** ET-3 — mastery is a percentage with `numeric(5,2)` precision. */
export const masterySchema = finiteNumber
  .min(0)
  .max(100)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: 'au plus deux décimales sont acceptées',
  });

/** EF-1 — a number of successful reviews, never negative. */
export const successCountSchema = nonNegativeInteger;

/** EF-3, ET-3 — a response duration in milliseconds, never negative. */
export const timeMsSchema = nonNegativeInteger;

/** ET-5 — optimistic concurrency token of a `notion_states` row. */
export const revisionSchema = nonNegativeInteger;

/** EF-2, EF-4 — a free JSON evidence object, bounded to keep one event row reasonable. */
export const gapEvidenceSchema = z.record(z.string(), z.unknown());

export type GapEvidence = z.infer<typeof gapEvidenceSchema>;

/** EF-2, EF-4 — the four gap natures of ADR-0024. */
export const GAP_NATURES = ['forgetting', 'confusion', 'misunderstanding', 'application'] as const;
export type GapNatureValue = (typeof GAP_NATURES)[number];

/** EF-3 — the FSRS grades of BR-MEM-02. */
export const FSRS_GRADES = ['again', 'hard', 'good', 'easy'] as const;
export type FsrsGrade = (typeof FSRS_GRADES)[number];

/** EF-3 — the activity that produced a review. */
export const REVIEW_SOURCES = [
  'validation',
  'global_quiz',
  'warmup',
  'exercise',
  'exam',
  'self_test',
  'micro_session',
  'sprint',
  'offline',
] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];

/** EF-4 — the three lifecycle events of a gap. */
export const GAP_EVENT_KINDS = ['detected', 'nature_changed', 'cleared'] as const;
export type GapEventKind = (typeof GAP_EVENT_KINDS)[number];
