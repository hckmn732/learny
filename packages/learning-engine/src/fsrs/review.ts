// FSRS by notion (SPEC-402, ADR-0025). Pure, deterministic entry points of the learning engine:
// the caller supplies the instant, the retention and the personal-median bounds; nothing here
// reads the clock, the configuration, the database or the network. `ts-fsrs` 5 maps one card per
// notion and four grades, and every date leaves this module as a canonical ISO UTC string.
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';
import type { Card, Grade, RecordLogItem } from 'ts-fsrs';

import { EngineError, assertValid } from '../errors';
import { formatInstant, parseInstant } from '../time';
import { BrickFormatSchema, FsrsRatingSchema, SerializedFsrsCardSchema } from '../types';
import type {
  BrickFormat,
  FsrsCardStateName,
  FsrsRating,
  InstantIso,
  SerializedFsrsCard,
} from '../types';

import { assertMedianSettings, personalMedianMs } from './median';
import type { MedianSettings, TimedResponse } from './median';

/** BR-MEM-02 — stable order of the four grades exposed to the recall-card buttons. */
export const FSRS_RATINGS = [
  'again',
  'hard',
  'good',
  'easy',
] as const satisfies readonly FsrsRating[];

/** Business bounds of the automatic grade, completed from the median settings by the caller. */
export interface GradeSettings extends MedianSettings {
  /** A correct answer slower than `hardFactor × median` is Hard (strict comparison). */
  hardFactor: number;
  /** A correct answer faster than `easyFactor × median` is Easy (strict comparison). */
  easyFactor: number;
}

export interface GradeReviewInput {
  /** `false` → Again; `true` → duration decides; `null` → no automatic grade. */
  correct: boolean | null;
  /** Duration of the current answer in milliseconds; ignored for a recall card. */
  timeMs: number | null;
  format: BrickFormat;
  /** Answers of the learner, any format; only the given format is used. */
  history?: readonly TimedResponse[];
  /** Recall-card self-assessment (Raté/Difficile/Bon/Facile mapped by the caller). */
  selfRating?: FsrsRating | null;
  settings: GradeSettings;
}

export type GradeReason =
  'self_rating' | 'incorrect' | 'too_slow' | 'too_fast' | 'within_median' | 'incomplete';

/** A missing rating (`null`) means an incomplete response: no card update (CL-4). */
export interface GradeDecision {
  rating: FsrsRating | null;
  reason: GradeReason;
  medianMs: number;
}

export interface AppliedReview {
  card: SerializedFsrsCard;
  dueAt: InstantIso;
}

export type GradePreview = Readonly<Record<FsrsRating, InstantIso>>;

const GRADE_BY_RATING: Readonly<Record<FsrsRating, Grade>> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const STATE_NAME_BY_STATE: Readonly<Record<State, FsrsCardStateName>> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

const STATE_BY_NAME: Readonly<Record<FsrsCardStateName, State>> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

function invalidInput(path: string, message: string): EngineError {
  return new EngineError('INVALID_INPUT', message, { path });
}

function invalidParam(path: string, message: string): EngineError {
  return new EngineError('INVALID_PARAM', message, { path });
}

function assertRetention(retention: number): number {
  if (!Number.isFinite(retention) || retention <= 0 || retention >= 1) {
    throw invalidParam('retention', 'La rétention demandée doit être comprise entre 0 et 1.');
  }
  return retention;
}

function assertGradeSettings(settings: GradeSettings): GradeSettings {
  assertMedianSettings(settings);
  if (!Number.isFinite(settings.hardFactor) || settings.hardFactor <= 0) {
    throw invalidParam('hardFactor', 'Le facteur Hard doit être strictement positif.');
  }
  if (!Number.isFinite(settings.easyFactor) || settings.easyFactor <= 0) {
    throw invalidParam('easyFactor', 'Le facteur Easy doit être strictement positif.');
  }
  if (settings.easyFactor >= settings.hardFactor) {
    throw invalidParam('easyFactor', 'Le facteur Easy doit être inférieur au facteur Hard.');
  }
  return settings;
}

function assertFormat(format: unknown): BrickFormat {
  const parsed = BrickFormatSchema.safeParse(format);
  if (!parsed.success) throw invalidInput('format', 'Format de brique inconnu.');
  return parsed.data;
}

function assertRating(value: unknown, path: string): FsrsRating {
  const parsed = FsrsRatingSchema.safeParse(value);
  if (!parsed.success) throw invalidInput(path, 'Note FSRS inconnue.');
  return parsed.data;
}

function checkCurrentTime(timeMs: number | null): number | null {
  if (timeMs === null) return null;
  if (!Number.isFinite(timeMs) || timeMs < 0) {
    throw invalidInput('timeMs', 'La durée de réponse doit être positive ou nulle.');
  }
  return timeMs;
}

function serializeCard(card: Card): SerializedFsrsCard {
  const serialized: SerializedFsrsCard = {
    due: formatInstant(card.due.getTime()),
    stability: card.stability,
    difficulty: card.difficulty,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- ET-2 names elapsed_days; ts-fsrs 6 removes it (ADR-0242).
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_NAME_BY_STATE[card.state],
    last_review: card.last_review === undefined ? null : formatInstant(card.last_review.getTime()),
  };
  return assertValid(SerializedFsrsCardSchema, serialized);
}

/** A fresh `ts-fsrs` card, so the library never mutates the caller's serialized card. */
function toLibraryCard(card: SerializedFsrsCard): Card {
  const valid = assertValid(SerializedFsrsCardSchema, card);
  const libraryCard: Card = {
    due: new Date(parseInstant(valid.due)),
    stability: valid.stability,
    difficulty: valid.difficulty,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- ET-2 names elapsed_days; ts-fsrs 6 removes it (ADR-0242).
    elapsed_days: valid.elapsed_days,
    scheduled_days: valid.scheduled_days,
    learning_steps: valid.learning_steps,
    reps: valid.reps,
    lapses: valid.lapses,
    state: STATE_BY_NAME[valid.state],
  };
  if (valid.last_review !== null) {
    libraryCard.last_review = new Date(parseInstant(valid.last_review));
  }
  return libraryCard;
}

function schedulerFor(retention: number) {
  // `enable_fuzz` stays false and `enable_short_term` keeps the ts-fsrs default: two calls with
  // the same inputs always schedule the same instants (CL-5).
  return fsrs({ request_retention: assertRetention(retention) });
}

/**
 * EF-1, ET-1 — one new FSRS card at the supplied instant. The caller owns the unique
 * (user, notion) pair; this function only builds the pure card value.
 */
export function createNotionCard(now: InstantIso, retention: number): SerializedFsrsCard {
  const at = parseInstant(now);
  schedulerFor(retention);
  return serializeCard(createEmptyCard(new Date(at)));
}

/**
 * ET-1 — grade of an answer. A recall card keeps its self-assessment (BR-MEM-02, EF-4); every
 * other format derives the grade from correctness and the personal median (EF-2). Comparisons at
 * exactly half or twice the median stay Good because both bounds are strict (CL-2).
 */
export function gradeReview(input: GradeReviewInput): GradeDecision {
  const format = assertFormat(input.format);
  const settings = assertGradeSettings(input.settings);
  const history = input.history === undefined ? [] : input.history;
  if (!Array.isArray(history)) {
    throw invalidInput('history', 'Un historique de réponses est attendu.');
  }
  const medianMs = personalMedianMs(history, format, settings);
  const selfRating =
    input.selfRating === undefined || input.selfRating === null
      ? null
      : assertRating(input.selfRating, 'selfRating');
  const timeMs = checkCurrentTime(input.timeMs);

  if (format === 'recall_card') {
    if (selfRating === null) {
      return { rating: null, reason: 'incomplete', medianMs };
    }
    return { rating: selfRating, reason: 'self_rating', medianMs };
  }

  if (input.correct === false) {
    return { rating: 'again', reason: 'incorrect', medianMs };
  }
  if (input.correct !== true || timeMs === null) {
    return { rating: null, reason: 'incomplete', medianMs };
  }
  if (timeMs > settings.hardFactor * medianMs) {
    return { rating: 'hard', reason: 'too_slow', medianMs };
  }
  if (timeMs < settings.easyFactor * medianMs) {
    return { rating: 'easy', reason: 'too_fast', medianMs };
  }
  return { rating: 'good', reason: 'within_median', medianMs };
}

/**
 * ET-2, EF-5 — applies one grade to the current card with `ts-fsrs`, at the supplied instant and
 * retention. The input card is only read: a fresh library card is built from it, then serialized.
 */
export function applyReview(
  card: SerializedFsrsCard,
  grade: FsrsRating,
  now: InstantIso,
  retention: number,
): AppliedReview {
  const rating = assertRating(grade, 'grade');
  const at = parseInstant(now);
  const libraryCard = toLibraryCard(card);
  const record: RecordLogItem = schedulerFor(retention).next(
    libraryCard,
    new Date(at),
    GRADE_BY_RATING[rating],
  );
  return { card: serializeCard(record.card), dueAt: formatInstant(record.card.due.getTime()) };
}

/**
 * ET-2 — the four due dates of the next review, in the stable `again, hard, good, easy` order.
 * The card is not mutated and no review is persisted: this is the recall-card preview (EF-4).
 */
export function previewGrades(
  card: SerializedFsrsCard,
  now: InstantIso,
  retention: number,
): GradePreview {
  const at = parseInstant(now);
  const libraryCard = toLibraryCard(card);
  const preview = schedulerFor(retention).repeat(libraryCard, new Date(at));
  return {
    again: formatInstant(preview[Rating.Again].card.due.getTime()),
    hard: formatInstant(preview[Rating.Hard].card.due.getTime()),
    good: formatInstant(preview[Rating.Good].card.due.getTime()),
    easy: formatInstant(preview[Rating.Easy].card.due.getTime()),
  };
}
