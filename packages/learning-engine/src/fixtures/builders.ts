// Test factories of the engine (SPEC-401 ET-8). Defaults are deliberately boring and deterministic:
// the reference instant, one SAP notion and a 20-second correct answer. Every test of SPEC-402 to
// SPEC-411 starts from these builders, so a contract change breaks one place only.
import fc from 'fast-check';

import { REFERENCE_NOW } from '@learny/testing/clock';

import { addDays, daysBetween, instantAt, localDateOf, parseInstant } from '../time';
import type {
  AnswerRecord,
  Availability,
  GapState,
  Id,
  InstantIso,
  IsoDate,
  IsoWeekday,
  NotionState,
  ReviewEvent,
  SerializedFsrsCard,
  StudySlot,
} from '../types';

const DEFAULT_NOTION = 'n-s4';
const DEFAULT_USER = 'u-demo';
const DEFAULT_ATTEMPT = 'attempt-demo';
const DEFAULT_ANSWER = 'answer-demo';

/** A ts-fsrs card in its `new` state, due at the reference instant. */
export function buildCard(partial: Partial<SerializedFsrsCard> = {}): SerializedFsrsCard {
  return {
    due: REFERENCE_NOW,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
    state: 'new',
    last_review: null,
    ...partial,
  };
}

/** A notion state never seen before, with no gap and no FSRS card. */
export function buildNotionState(partial: Partial<NotionState> = {}): NotionState {
  return {
    userId: DEFAULT_USER,
    notionId: DEFAULT_NOTION,
    fsrs: buildCard(),
    dueAt: REFERENCE_NOW,
    mastery: 0,
    firstSeenAt: REFERENCE_NOW,
    lastSeenAt: REFERENCE_NOW,
    successCount: 0,
    gap: null,
    suspended: false,
    inReview: false,
    ...partial,
  };
}

/** A correct choice answer of 20 seconds on the default notion. */
export function buildAnswer(partial: Partial<AnswerRecord> = {}): AnswerRecord {
  return {
    answerId: DEFAULT_ANSWER,
    attemptId: DEFAULT_ATTEMPT,
    attemptKind: 'validation_quiz',
    attemptNo: 1,
    source: 'validation',
    notionIds: [DEFAULT_NOTION],
    format: 'choice_question',
    correct: true,
    score: 1,
    maxScore: 1,
    selfRating: null,
    timeMs: 20_000,
    answeredAt: REFERENCE_NOW,
    chosenDistractorNotionId: null,
    confusedWithNotionId: null,
    normalizedResponse: null,
    offTopic: false,
    countsForGaps: true,
    ...partial,
  };
}

/** A stored gap detected at the reference instant. */
export function buildGap(partial: Partial<GapState> = {}): GapState {
  return {
    nature: 'confusion',
    confusedWith: 'n-type',
    detectedAt: REFERENCE_NOW,
    evidence: 'Réponse erronée de test.',
    clearedAt: null,
    ...partial,
  };
}

/** An applied review event on the default notion. */
export function buildReviewEvent(partial: Partial<ReviewEvent> = {}): ReviewEvent {
  return {
    notionId: DEFAULT_NOTION,
    answerId: DEFAULT_ANSWER,
    source: 'validation',
    rating: 'good',
    correct: true,
    timeMs: 20_000,
    reviewedAt: REFERENCE_NOW,
    before: null,
    after: buildCard(),
    applied: true,
    ...partial,
  };
}

/**
 * Instant `days` civil days before `now`, at `time` (09:00 by default) in UTC. The reference
 * instant is a Thursday 13:20 in Paris; `atDaysBefore(REFERENCE_NOW, 1)` is the previous day at
 * 09:00 UTC, which keeps every fixture independent from the system clock.
 */
export function atDaysBefore(now: InstantIso, days: number, time = '09:00'): InstantIso {
  const today = localDateOf(now, 'UTC');
  return instantAt(addDays(today, -days), time, 'UTC');
}

/** Valid UTC instants with millisecond precision, uniformly spread between `min` and `max`. */
export function arbInstant(min: InstantIso, max: InstantIso): fc.Arbitrary<InstantIso> {
  const from = parseInstant(min);
  const to = parseInstant(max);
  return fc.integer({ min: from, max: to }).map((ms) => new Date(ms).toISOString());
}

/** Valid civil days between `min` and `max`, both included. */
export function arbIsoDate(min: IsoDate, max: IsoDate): fc.Arbitrary<IsoDate> {
  const span = daysBetween(min, max);
  return fc.integer({ min: 0, max: span }).map((offset) => addDays(min, offset));
}

const IDS = [
  'n-s4',
  'n-fiori',
  'n-cle',
  'n-type',
  'n-piece',
  'n-ledgers',
  'n-equilibre',
  'n-variante',
] as const;

const ATTEMPT_KINDS = [
  'validation_quiz',
  'global_quiz_session',
  'remediation',
  'exercise',
  'mock_exam',
  'warmup',
  'micro_session',
  'sprint',
  'self_test',
] as const;

const SOURCES = [
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

const FORMATS = [
  'choice_question',
  'open_question',
  'cloze',
  'matching',
  'ordering',
  'categorization',
  'recall_card',
  'instruction',
  'scripted_dialogue',
  'timer',
] as const;

const RATINGS = ['again', 'hard', 'good', 'easy'] as const;
const STATES = ['new', 'learning', 'review', 'relearning'] as const;
const ID_ARB = fc.constantFrom<Id>(...IDS);
const INSTANT_ARB = arbInstant('2026-01-01T00:00:00.000Z', '2027-12-31T23:59:59.999Z');

/** Arbitrary ts-fsrs card, valid for `SerializedFsrsCardSchema`. */
export function arbCard(): fc.Arbitrary<SerializedFsrsCard> {
  return fc
    .record({
      due: INSTANT_ARB,
      stability: fc.integer({ min: 0, max: 3650 }),
      difficulty: fc.integer({ min: 0, max: 10 }),
      elapsed_days: fc.integer({ min: 0, max: 3650 }),
      scheduled_days: fc.integer({ min: 0, max: 3650 }),
      learning_steps: fc.integer({ min: 0, max: 10 }),
      reps: fc.integer({ min: 0, max: 10_000 }),
      lapses: fc.integer({ min: 0, max: 10_000 }),
      state: fc.constantFrom(...STATES),
      last_review: fc.oneof(fc.constant(null), INSTANT_ARB),
    })
    .map((card) => buildCard(card));
}

/** Arbitrary gap state with a real nature and an optional confused notion. */
export function arbGap(): fc.Arbitrary<GapState> {
  return fc
    .record({
      nature: fc.constantFrom('forgetting', 'confusion', 'misunderstanding', 'application'),
      confusedWith: fc.oneof(fc.constant(null), ID_ARB),
      detectedAt: INSTANT_ARB,
      evidence: fc.string({ minLength: 1, maxLength: 80 }),
      clearedAt: fc.oneof(fc.constant(null), INSTANT_ARB),
    })
    .map((gap) => buildGap(gap));
}

/** Arbitrary answer record; `notionIds` always contains at least one identifier. */
export function arbAnswer(): fc.Arbitrary<AnswerRecord> {
  return fc
    .record({
      answerId: fc.uuid(),
      attemptId: fc.uuid(),
      attemptKind: fc.constantFrom(...ATTEMPT_KINDS),
      attemptNo: fc.integer({ min: 1, max: 10 }),
      source: fc.constantFrom(...SOURCES),
      notionIds: fc.array(ID_ARB, { minLength: 1, maxLength: 4 }),
      format: fc.constantFrom(...FORMATS),
      correct: fc.oneof(fc.constant(null), fc.boolean()),
      score: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 100 })),
      maxScore: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 100 })),
      selfRating: fc.oneof(fc.constant(null), fc.constantFrom(...RATINGS)),
      timeMs: fc.integer({ min: 0, max: 120_000 }),
      answeredAt: INSTANT_ARB,
      chosenDistractorNotionId: fc.oneof(fc.constant(null), ID_ARB),
      confusedWithNotionId: fc.oneof(fc.constant(null), ID_ARB),
      normalizedResponse: fc.oneof(fc.constant(null), fc.string({ maxLength: 120 })),
      offTopic: fc.boolean(),
      countsForGaps: fc.boolean(),
    })
    .map((answer) => buildAnswer(answer));
}

/** Arbitrary notion state; half of the samples carry a gap. */
export function arbNotionState(): fc.Arbitrary<NotionState> {
  return fc
    .record({
      userId: fc.uuid(),
      notionId: ID_ARB,
      fsrs: fc.oneof(fc.constant(null), arbCard()),
      dueAt: fc.oneof(fc.constant(null), INSTANT_ARB),
      mastery: fc.integer({ min: 0, max: 100 }),
      firstSeenAt: fc.oneof(fc.constant(null), INSTANT_ARB),
      lastSeenAt: fc.oneof(fc.constant(null), INSTANT_ARB),
      successCount: fc.integer({ min: 0, max: 1000 }),
      gap: fc.oneof(fc.constant(null), arbGap()),
      suspended: fc.boolean(),
      inReview: fc.boolean(),
    })
    .map((state) => buildNotionState(state));
}

/** Arbitrary applied review event. */
export function arbReviewEvent(): fc.Arbitrary<ReviewEvent> {
  return fc
    .record({
      notionId: ID_ARB,
      answerId: fc.oneof(fc.constant(null), fc.uuid()),
      source: fc.constantFrom(...SOURCES),
      rating: fc.constantFrom(...RATINGS),
      correct: fc.boolean(),
      timeMs: fc.integer({ min: 0, max: 120_000 }),
      reviewedAt: INSTANT_ARB,
      before: fc.oneof(fc.constant(null), arbCard()),
      after: arbCard(),
      applied: fc.boolean(),
    })
    .map((event) => buildReviewEvent(event));
}

/** Arbitrary valid availability: sorted weekdays and slots, 1 to 6 hours per day. */
export function arbAvailability(): fc.Arbitrary<Availability> {
  const weekday = fc.constantFrom<IsoWeekday>(1, 2, 3, 4, 5, 6, 7);
  const slot = fc.constantFrom<StudySlot>('matin', 'apres_midi', 'soir');
  return fc
    .record({
      hoursPerDay: fc.integer({ min: 1, max: 6 }),
      studyDays: fc
        .uniqueArray(weekday, { minLength: 1, maxLength: 7 })
        .map((days) => [...days].sort((left, right) => left - right)),
      preferredSlots: fc
        .uniqueArray(slot, {
          minLength: 1,
          maxLength: 3,
        })
        .map((slots) =>
          [...slots].sort(
            (left, right) =>
              ['matin', 'apres_midi', 'soir'].indexOf(left) -
              ['matin', 'apres_midi', 'soir'].indexOf(right),
          ),
        ),
    })
    .map((availability) => availability);
}
