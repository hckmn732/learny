// Detection, nature and clearance of gaps (SPEC-404, BR-LAC-02 to BR-LAC-06, ADR-0024, ADR-0282).
// Every function is pure and deterministic: the current instant, the answers and the business
// bounds are explicit inputs. Nothing here reads the clock, the database, the network or
// `@learny/config`; services pass `ENGINE.gaps` and `ENGINE.mastery.threshold` as `params`.
import { z } from 'zod';

import { EngineError, assertValid } from '../errors';
import { parseInstant } from '../time';
import {
  AnswerRecordSchema,
  AttemptKindSchema,
  GapStateSchema,
  IdSchema,
  InstantIsoSchema,
} from '../types';
import type {
  AnswerRecord,
  AttemptKind,
  BrickFormat,
  GapNature,
  GapState,
  Id,
  InstantIso,
} from '../types';

import { normalizeError } from './normalize-error';

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

/** ET-3 — kinds persisted in `gap_events` by SPEC-411. */
export type GapEventKind = 'detected' | 'nature_changed' | 'cleared';

/** BR-LAC-04 — recommended remediation, one action per nature. */
export type GapRecommendedAction =
  'global_quiz' | 'confrontation' | 'alternative_explanation' | 'practice_exercise';

export const RECOMMENDED_ACTION_BY_NATURE: Readonly<Record<GapNature, GapRecommendedAction>> = {
  forgetting: 'global_quiz',
  confusion: 'confrontation',
  misunderstanding: 'alternative_explanation',
  application: 'practice_exercise',
};

/** Detection triggers, in stable display order. */
export type GapTrigger = 'qualifying_attempt' | 'repeated_error';

/** BR-LAC-02 — attempt kinds whose failure qualifies the notion for a gap. */
export const QUALIFYING_ATTEMPT_KINDS = [
  'validation_quiz',
  'exercise',
  'mock_exam',
] as const satisfies readonly AttemptKind[];

const QUALIFYING_ATTEMPTS: ReadonlySet<AttemptKind> = new Set(QUALIFYING_ATTEMPT_KINDS);

/** A definition question is a knowledge format asked outside an exercise (ADR-0282). */
const DEFINITION_FORMATS: ReadonlySet<BrickFormat> = new Set([
  'choice_question',
  'open_question',
  'cloze',
]);

/** BR-LAC-03 — `incompréhension` requires at least two failures on the notion. */
export const MISUNDERSTANDING_MIN_FAILURES = 2;

/** Domain order of BR-LAC-03: smaller wins (confusion > application > misunderstanding > forgetting). */
const NATURE_PRIORITY: Readonly<Record<GapNature, number>> = {
  confusion: 0,
  application: 1,
  misunderstanding: 2,
  forgetting: 3,
};

const finiteNumber = () =>
  z.number().refine((value) => Number.isFinite(value) && !Object.is(value, -0), {
    message: 'Nombre fini requis, -0 refusé.',
  });

const percentNumber = () =>
  finiteNumber().refine((value) => value >= 0 && value <= 100, 'Pourcentage hors de 0..100.');

const ratioNumber = () =>
  finiteNumber().refine((value) => value > 0 && value <= 1, 'Ratio hors de 0..1.');

const nonNegativeNumber = () => finiteNumber().refine((value) => value >= 0, 'Valeur négative.');

const positiveInteger = () =>
  finiteNumber()
    .refine((value) => Number.isInteger(value), 'Entier requis.')
    .refine((value) => value >= 1, 'Entier positif requis.');

/**
 * Business bounds of gap detection and clearance. The service builds them from `ENGINE.gaps` and
 * `ENGINE.mastery.threshold`; the defaults mirror those normative values (ADR-0282).
 */
export interface GapParams {
  readonly masteryThreshold: number;
  readonly failureRatio: number;
  readonly forgettingMinDays: number;
  readonly repeatedErrorAttempts: number;
  readonly clearSuccesses: number;
  readonly clearMinDaysApart: number;
}

export const GapParamsSchema = z
  .object({
    masteryThreshold: percentNumber(),
    failureRatio: ratioNumber(),
    forgettingMinDays: nonNegativeNumber(),
    repeatedErrorAttempts: positiveInteger(),
    clearSuccesses: positiveInteger(),
    clearMinDaysApart: nonNegativeNumber(),
  })
  .strict() as z.ZodType<GapParams>;

/** Defaults mirror `ENGINE.gaps` and `ENGINE.mastery.threshold` (checked by the integration test). */
export const DEFAULT_GAP_PARAMS = {
  masteryThreshold: 80,
  failureRatio: 0.5,
  forgettingMinDays: 7,
  repeatedErrorAttempts: 2,
  clearSuccesses: 2,
  clearMinDaysApart: 1,
} as const satisfies GapParams;

/** One attempt of the history, with the answers relevant to the evaluated notion. */
export interface GapAttempt {
  readonly attemptId: Id;
  readonly attemptKind: AttemptKind;
  readonly answers: readonly AnswerRecord[];
}

export const GapAttemptSchema = z
  .object({
    attemptId: IdSchema,
    attemptKind: AttemptKindSchema,
    answers: z.array(AnswerRecordSchema).min(1),
  })
  .strict() as z.ZodType<GapAttempt>;

/** ET-1 — explicit input of the detection. `existingGap` carries the last stored gap state. */
export interface DetectGapInput {
  readonly notion: Id;
  readonly attempts: readonly GapAttempt[];
  readonly mastery: number;
  readonly now: InstantIso;
  readonly existingGap?: GapState | null;
  /** Set by the service when the triggering review is an FSRS lapse (BR-LAC-03). */
  readonly fsrsLapsed?: boolean;
  readonly params?: GapParams;
}

export const DetectGapInputSchema = z
  .object({
    notion: IdSchema,
    attempts: z.array(GapAttemptSchema),
    mastery: percentNumber(),
    now: InstantIsoSchema,
    existingGap: GapStateSchema.nullable().optional(),
    fsrsLapsed: z.boolean().optional(),
    params: GapParamsSchema.optional(),
  })
  .strict() as z.ZodType<DetectGapInput>;

/** Structured trace of one repeated error (same key on distinct attempts). */
export interface RepeatedErrorEvidence {
  readonly key: string;
  readonly attemptIds: readonly Id[];
}

/** ET-1, ET-3 — stable result of the detection, ready for SPEC-411 persistence. */
export interface GapDetectionResult {
  readonly active: boolean;
  readonly nature: GapNature | null;
  readonly confusedWith: Id | null;
  readonly evidence: string;
  readonly recommendedAction: GapRecommendedAction | null;
  readonly event: GapEventKind | null;
  readonly triggers: readonly GapTrigger[];
  readonly repeatedErrors: readonly RepeatedErrorEvidence[];
  /** Next stored state: null when the notion never had a gap. */
  readonly gap: GapState | null;
}

/** ET-2 — answer of the notion used as a success for the clearance. */
export interface ClearGapInput {
  readonly gap: GapState;
  readonly successes: readonly AnswerRecord[];
  readonly mastery: number;
  readonly now: InstantIso;
  /** When present, successes of another notion are ignored (ET-2). */
  readonly notion?: Id;
  readonly params?: GapParams;
}

export const ClearGapInputSchema = z
  .object({
    gap: GapStateSchema,
    successes: z.array(AnswerRecordSchema),
    mastery: percentNumber(),
    now: InstantIsoSchema,
    notion: IdSchema.optional(),
    params: GapParamsSchema.optional(),
  })
  .strict() as z.ZodType<ClearGapInput>;

export interface GapClearanceChecks {
  readonly activeGap: boolean;
  readonly enoughSuccesses: boolean;
  readonly spaced: boolean;
  readonly masteryReached: boolean;
}

/** ET-2, ET-5 — outcome of the clearance check; `clearedAt` is kept for the history. */
export interface GapClearanceResult {
  readonly cleared: boolean;
  readonly event: GapEventKind | null;
  readonly clearedAt: InstantIso | null;
  readonly evidence: string;
  readonly gap: GapState | null;
  readonly successCount: number;
  readonly intervalHours: number | null;
  readonly checks: GapClearanceChecks;
}

interface FlattenedAnswer {
  readonly answer: AnswerRecord;
  readonly answeredAtMs: number;
}

interface FlattenedAttempt {
  readonly attemptId: Id;
  readonly attemptKind: AttemptKind;
  readonly answers: readonly FlattenedAnswer[];
  readonly latestMs: number;
}

interface ConfusionSignal {
  readonly confusedWith: Id;
  readonly count: number;
  readonly latestMs: number;
  readonly latestAnswerId: Id;
}

interface MisunderstandingSignal {
  readonly failures: number;
  readonly offTopic: number;
}

interface ForgettingSignal {
  readonly success: FlattenedAnswer;
  readonly failure: FlattenedAnswer;
  readonly days: number;
}

interface GapClassification {
  readonly nature: GapNature;
  /** False when the nature is the residual default, not a BR-LAC-03 signal. */
  readonly explicit: boolean;
  readonly confusedWith: Id | null;
  readonly confusion: ConfusionSignal | null;
  readonly application: boolean;
  readonly misunderstanding: MisunderstandingSignal | null;
  readonly forgetting: ForgettingSignal | null;
  readonly fsrsLapsed: boolean;
}

function invalidInput(path: string, message: string): EngineError {
  return new EngineError('INVALID_INPUT', message, { path });
}

function resolveParams(params: GapParams | undefined): GapParams {
  return assertValid(GapParamsSchema, params ?? DEFAULT_GAP_PARAMS);
}

function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100).replace('.', ',');
}

/**
 * BR-LAC-02 — a failed answer. An explicitly wrong answer always fails; a graded answer without
 * an explicit verdict fails when its score ratio is under `failureRatio` (ADR-0282).
 */
export function isGapFailure(
  answer: AnswerRecord,
  failureRatio: number = DEFAULT_GAP_PARAMS.failureRatio,
): boolean {
  if (answer.correct === false) return true;
  if (answer.correct === true) return false;
  if (answer.score === null || answer.maxScore === null || answer.maxScore <= 0) return false;
  return answer.score / answer.maxScore < failureRatio;
}

/** BR-LAC-06 — a successful answer, dual of `isGapFailure` for graded answers (ADR-0282). */
export function isGapSuccess(
  answer: AnswerRecord,
  failureRatio: number = DEFAULT_GAP_PARAMS.failureRatio,
): boolean {
  if (answer.correct === true) return true;
  if (answer.correct === false) return false;
  if (answer.score === null || answer.maxScore === null || answer.maxScore <= 0) return false;
  return answer.score / answer.maxScore >= failureRatio;
}

/**
 * EF-2 — identity of an error. A choice error is identified by its distractor notion, an
 * association error by the confused notion and an open error by its normalised response. Two
 * failures with no identity never form a repetition.
 */
export function gapErrorKey(answer: AnswerRecord): string | null {
  if (answer.chosenDistractorNotionId !== null) {
    return `distractor:${answer.chosenDistractorNotionId}`;
  }
  if (answer.confusedWithNotionId !== null) {
    return `confusion:${answer.confusedWithNotionId}`;
  }
  if (answer.normalizedResponse === null || answer.format === 'choice_question') return null;
  const normalized = normalizeError(answer.normalizedResponse);
  return normalized === '' ? null : `response:${normalized}`;
}

function assertGapConsistency(gap: GapState, notion: Id | null, path: string): void {
  if (gap.confusedWith === null) return;
  if (gap.nature !== 'confusion') {
    throw invalidInput(
      `${path}.confusedWith`,
      'Une notion confondue n’est portée que par la nature confusion.',
    );
  }
  if (notion !== null && gap.confusedWith === notion) {
    throw invalidInput(
      `${path}.confusedWith`,
      'Une notion ne peut pas se confondre avec elle-même.',
    );
  }
}

function readGapInstants(
  gap: GapState,
  nowMs: number,
  path: string,
): {
  detectedAtMs: number;
  clearedAtMs: number | null;
} {
  const detectedAtMs = parseInstant(gap.detectedAt);
  if (detectedAtMs > nowMs) {
    throw invalidInput(
      `${path}.detectedAt`,
      'La détection ne peut pas être postérieure à l’instant.',
    );
  }
  if (gap.clearedAt === null) return { detectedAtMs, clearedAtMs: null };
  const clearedAtMs = parseInstant(gap.clearedAt);
  if (clearedAtMs > nowMs) {
    throw invalidInput(`${path}.clearedAt`, 'La levée ne peut pas être postérieure à l’instant.');
  }
  if (clearedAtMs < detectedAtMs) {
    throw invalidInput(`${path}.clearedAt`, 'La levée précède la détection.');
  }
  return { detectedAtMs, clearedAtMs };
}

function flattenAttempts(
  attempts: readonly GapAttempt[],
  notion: Id,
  nowMs: number,
): FlattenedAttempt[] {
  const seen = new Set<Id>();
  const flattened: FlattenedAttempt[] = [];
  attempts.forEach((attempt, attemptIndex) => {
    if (seen.has(attempt.attemptId)) {
      throw invalidInput(`attempts.${String(attemptIndex)}.attemptId`, 'Tentative en double.');
    }
    seen.add(attempt.attemptId);
    const answers: FlattenedAnswer[] = [];
    attempt.answers.forEach((answer, answerIndex) => {
      const at = `attempts.${String(attemptIndex)}.answers.${String(answerIndex)}`;
      if (answer.attemptId !== attempt.attemptId) {
        throw invalidInput(`${at}.attemptId`, 'La réponse n’appartient pas à la tentative.');
      }
      if (answer.attemptKind !== attempt.attemptKind) {
        throw invalidInput(`${at}.attemptKind`, 'Le type de la réponse diffère de la tentative.');
      }
      const answeredAtMs = parseInstant(answer.answeredAt);
      if (answeredAtMs > nowMs) {
        throw invalidInput(
          `${at}.answeredAt`,
          'Une réponse ne peut pas être postérieure à l’instant.',
        );
      }
      if (!answer.notionIds.includes(notion) || !answer.countsForGaps) return;
      answers.push({ answer, answeredAtMs });
    });
    if (answers.length === 0) return;
    const latestMs = Math.max(...answers.map((answer) => answer.answeredAtMs));
    flattened.push({
      attemptId: attempt.attemptId,
      attemptKind: attempt.attemptKind,
      answers,
      latestMs,
    });
  });
  return flattened.sort((left, right) => {
    if (left.latestMs !== right.latestMs) return left.latestMs - right.latestMs;
    return left.attemptId < right.attemptId ? -1 : left.attemptId > right.attemptId ? 1 : 0;
  });
}

function afterClearance(
  attempts: readonly FlattenedAttempt[],
  clearedAtMs: number | null,
): readonly FlattenedAttempt[] {
  if (clearedAtMs === null) return attempts;
  return attempts.flatMap((attempt) => {
    const answers = attempt.answers.filter((answer) => answer.answeredAtMs > clearedAtMs);
    if (answers.length === 0) return [];
    const latestMs = Math.max(...answers.map((answer) => answer.answeredAtMs));
    return [{ ...attempt, answers, latestMs }];
  });
}

function compareAnswers(left: FlattenedAnswer, right: FlattenedAnswer): number {
  if (left.answeredAtMs !== right.answeredAtMs) return left.answeredAtMs - right.answeredAtMs;
  return left.answer.answerId < right.answer.answerId
    ? -1
    : left.answer.answerId > right.answer.answerId
      ? 1
      : 0;
}

function latestAttempt(attempts: readonly FlattenedAttempt[]): FlattenedAttempt | null {
  let best: FlattenedAttempt | null = null;
  for (const attempt of attempts) {
    if (
      best === null ||
      attempt.latestMs > best.latestMs ||
      (attempt.latestMs === best.latestMs && attempt.attemptId < best.attemptId)
    ) {
      best = attempt;
    }
  }
  return best;
}

function repeatErrors(
  attempts: readonly FlattenedAttempt[],
  params: GapParams,
): RepeatedErrorEvidence[] {
  const attemptsByKey = new Map<string, Set<Id>>();
  for (const attempt of attempts) {
    const keys = new Set<string>();
    for (const answer of attempt.answers) {
      if (!isGapFailure(answer.answer, params.failureRatio)) continue;
      const key = gapErrorKey(answer.answer);
      if (key !== null) keys.add(key);
    }
    for (const key of keys) {
      const ids = attemptsByKey.get(key) ?? new Set<Id>();
      ids.add(attempt.attemptId);
      attemptsByKey.set(key, ids);
    }
  }
  return [...attemptsByKey.entries()]
    .filter(([, ids]) => ids.size >= params.repeatedErrorAttempts)
    .map(([key, ids]) => ({ key, attemptIds: [...ids].sort() }))
    .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
}

function confusionSignal(
  answers: readonly FlattenedAnswer[],
  notion: Id,
  params: GapParams,
): ConfusionSignal | null {
  const entries = new Map<Id, { count: number; latestMs: number; latestAnswerId: Id }>();
  for (const { answer, answeredAtMs } of answers) {
    if (!isGapFailure(answer, params.failureRatio)) continue;
    const confusedWith = answer.chosenDistractorNotionId ?? answer.confusedWithNotionId;
    if (confusedWith === null || confusedWith === notion) continue;
    const current = entries.get(confusedWith);
    entries.set(confusedWith, {
      count: (current?.count ?? 0) + 1,
      latestMs: Math.max(current?.latestMs ?? Number.NEGATIVE_INFINITY, answeredAtMs),
      latestAnswerId:
        current === undefined || answeredAtMs >= current.latestMs
          ? answer.answerId
          : current.latestAnswerId,
    });
  }
  const ranked = [...entries.entries()].sort(([leftId, left], [rightId, right]) => {
    if (left.count !== right.count) return right.count - left.count;
    if (left.latestMs !== right.latestMs) return right.latestMs - left.latestMs;
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
  const best = ranked[0];
  if (best === undefined) return null;
  return {
    confusedWith: best[0],
    count: best[1].count,
    latestMs: best[1].latestMs,
    latestAnswerId: best[1].latestAnswerId,
  };
}

function forgettingSignal(
  answers: readonly FlattenedAnswer[],
  params: GapParams,
): ForgettingSignal | null {
  const sorted = [...answers].sort(compareAnswers);
  let firstSuccess: FlattenedAnswer | null = null;
  for (const answer of sorted) {
    if (isGapSuccess(answer.answer, params.failureRatio)) {
      if (firstSuccess === null) firstSuccess = answer;
      continue;
    }
    if (!isGapFailure(answer.answer, params.failureRatio) || firstSuccess === null) continue;
    const elapsedDays = (answer.answeredAtMs - firstSuccess.answeredAtMs) / MS_PER_DAY;
    if (elapsedDays >= params.forgettingMinDays) {
      return { success: firstSuccess, failure: answer, days: elapsedDays };
    }
  }
  return null;
}

function classifyGap(
  attempts: readonly FlattenedAttempt[],
  notion: Id,
  params: GapParams,
  fsrsLapsed: boolean,
): GapClassification {
  const answers = attempts.flatMap((attempt) =>
    attempt.answers.map((answer) => ({ ...answer, attemptKind: attempt.attemptKind })),
  );
  const failures = answers.filter((answer) => isGapFailure(answer.answer, params.failureRatio));
  const successes = answers.filter((answer) => isGapSuccess(answer.answer, params.failureRatio));

  const confusion = confusionSignal(answers, notion, params);
  const application =
    successes.some(
      (answer) => answer.attemptKind !== 'exercise' && DEFINITION_FORMATS.has(answer.answer.format),
    ) && failures.some((answer) => answer.attemptKind === 'exercise');
  const offTopic = failures.filter(
    (answer) => answer.answer.offTopic && answer.answer.format === 'open_question',
  ).length;
  const misunderstanding: MisunderstandingSignal | null =
    failures.length >= MISUNDERSTANDING_MIN_FAILURES && offTopic > 0
      ? { failures: failures.length, offTopic }
      : null;
  const forgetting = forgettingSignal(answers, params);
  const forgettingCandidate = forgetting !== null || (fsrsLapsed && failures.length > 0);

  const candidates: GapNature[] = [];
  if (confusion !== null) candidates.push('confusion');
  if (application) candidates.push('application');
  if (misunderstanding !== null) candidates.push('misunderstanding');
  if (forgettingCandidate) candidates.push('forgetting');
  const nature = candidates[0] ?? 'misunderstanding';
  return {
    nature,
    explicit: candidates.length > 0,
    confusedWith: nature === 'confusion' ? (confusion?.confusedWith ?? null) : null,
    confusion,
    application,
    misunderstanding,
    forgetting,
    fsrsLapsed,
  };
}

function natureEvidence(
  classification: GapClassification,
  mastery: number,
  params: GapParams,
): string {
  switch (classification.nature) {
    case 'confusion': {
      const signal = classification.confusion;
      if (signal === null) return 'Confusion entre deux notions.';
      return `${String(signal.count)} réponse(s) erronée(s) avec le distracteur « ${signal.confusedWith} ».`;
    }
    case 'application':
      return 'Questions de définition réussies mais exercice échoué.';
    case 'misunderstanding': {
      const signal = classification.misunderstanding;
      if (signal === null) {
        return `Maîtrise ${formatNumber(mastery)} % sous le seuil ${formatNumber(params.masteryThreshold)} %.`;
      }
      return `${String(signal.failures)} échecs sur la notion, dont une réponse ouverte hors sujet.`;
    }
    case 'forgetting': {
      const signal = classification.forgetting;
      if (signal === null) return 'Lapse FSRS signalé sur la notion.';
      return `Notion réussie le ${signal.success.answer.answeredAt.slice(0, 10)}, échouée ${formatNumber(signal.days)} jours plus tard.`;
    }
  }
}

function triggerEvidence(
  attempts: readonly FlattenedAttempt[],
  repeatedErrors: readonly RepeatedErrorEvidence[],
  mastery: number,
  params: GapParams,
): { triggers: GapTrigger[]; parts: string[] } {
  const triggers: GapTrigger[] = [];
  const parts: string[] = [];
  const latest = latestAttempt(attempts);
  if (
    mastery < params.masteryThreshold &&
    latest !== null &&
    QUALIFYING_ATTEMPTS.has(latest.attemptKind) &&
    latest.answers.some((answer) => isGapFailure(answer.answer, params.failureRatio))
  ) {
    triggers.push('qualifying_attempt');
    parts.push(
      `Tentative qualifiante « ${latest.attemptKind} » sous le seuil de ${formatNumber(params.masteryThreshold)} %.`,
    );
  }
  if (repeatedErrors.length > 0) {
    triggers.push('repeated_error');
    for (const repeated of repeatedErrors) {
      parts.push(
        `Erreur « ${repeated.key} » répétée sur ${String(repeated.attemptIds.length)} tentatives.`,
      );
    }
  }
  return { triggers, parts };
}

function inactiveEvidence(
  attempts: readonly FlattenedAttempt[],
  mastery: number,
  params: GapParams,
): string {
  if (attempts.length === 0) return 'Aucune tentative qualifiante pour cette notion.';
  if (mastery >= params.masteryThreshold) {
    return `Maîtrise ${formatNumber(mastery)} % au seuil de ${formatNumber(params.masteryThreshold)} %, aucune erreur répétée.`;
  }
  return 'Aucune tentative qualifiante échouée sous le seuil, aucune erreur répétée.';
}

/**
 * ET-1, EF-1 to EF-4, CL-1 to CL-5 — deterministic gap detection. A gap appears when the latest
 * qualifying attempt of the notion fails while mastery stays under the threshold, or when the same
 * error is found on two distinct attempts. The nature follows BR-LAC-03 and never downgrades an
 * existing active gap; a stricter nature raises `nature_changed` instead of a second gap.
 */
export function detectGap(input: DetectGapInput): GapDetectionResult {
  const parsed = assertValid(DetectGapInputSchema, input);
  const params = resolveParams(parsed.params);
  const nowMs = parseInstant(parsed.now);
  const existingGap = parsed.existingGap ?? null;
  if (existingGap !== null) {
    assertGapConsistency(existingGap, parsed.notion, 'existingGap');
  }
  const gapInstants =
    existingGap === null ? null : readGapInstants(existingGap, nowMs, 'existingGap');

  const attempts = flattenAttempts(parsed.attempts, parsed.notion, nowMs);
  const activeGap = existingGap !== null && existingGap.clearedAt === null ? existingGap : null;
  const evaluated =
    activeGap !== null ? attempts : afterClearance(attempts, gapInstants?.clearedAtMs ?? null);
  const repeatedErrors = repeatErrors(evaluated, params);
  const classification = classifyGap(evaluated, parsed.notion, params, parsed.fsrsLapsed ?? false);
  const triggers = triggerEvidence(evaluated, repeatedErrors, parsed.mastery, params);

  if (activeGap !== null) {
    const changed =
      classification.explicit &&
      NATURE_PRIORITY[classification.nature] < NATURE_PRIORITY[activeGap.nature];
    if (!changed) {
      return {
        active: true,
        nature: activeGap.nature,
        confusedWith: activeGap.confusedWith,
        evidence: activeGap.evidence,
        recommendedAction: RECOMMENDED_ACTION_BY_NATURE[activeGap.nature],
        event: null,
        triggers: triggers.triggers,
        repeatedErrors,
        gap: activeGap,
      };
    }
    const evidence = [
      natureEvidence(classification, parsed.mastery, params),
      ...triggers.parts,
    ].join(' ');
    const gap: GapState = {
      nature: classification.nature,
      confusedWith: classification.confusedWith,
      detectedAt: activeGap.detectedAt,
      evidence,
      clearedAt: null,
    };
    return {
      active: true,
      nature: gap.nature,
      confusedWith: gap.confusedWith,
      evidence: gap.evidence,
      recommendedAction: RECOMMENDED_ACTION_BY_NATURE[gap.nature],
      event: 'nature_changed',
      triggers: triggers.triggers,
      repeatedErrors,
      gap,
    };
  }

  const detected = triggers.triggers.length > 0;
  if (!detected) {
    return {
      active: false,
      nature: null,
      confusedWith: null,
      evidence: inactiveEvidence(evaluated, parsed.mastery, params),
      recommendedAction: null,
      event: null,
      triggers: [],
      repeatedErrors,
      gap: existingGap,
    };
  }

  const natureParts = classification.explicit
    ? [natureEvidence(classification, parsed.mastery, params)]
    : [];
  const evidence = [...natureParts, ...triggers.parts].join(' ');
  const gap: GapState = {
    nature: classification.nature,
    confusedWith: classification.confusedWith,
    detectedAt: parsed.now,
    evidence,
    clearedAt: null,
  };
  return {
    active: true,
    nature: gap.nature,
    confusedWith: gap.confusedWith,
    evidence: gap.evidence,
    recommendedAction: RECOMMENDED_ACTION_BY_NATURE[gap.nature],
    event: 'detected',
    triggers: triggers.triggers,
    repeatedErrors,
    gap,
  };
}

function clearanceEvidence(
  cleared: boolean,
  checks: GapClearanceChecks,
  successCount: number,
  intervalHours: number | null,
  mastery: number,
  params: GapParams,
): string {
  if (!checks.activeGap) return 'Aucune lacune active à lever.';
  if (!checks.enoughSuccesses) {
    return `Lacune maintenue : ${String(successCount)} réussite(s) sur ${String(params.clearSuccesses)} requises.`;
  }
  if (!checks.spaced) {
    const minimumHours = params.clearMinDaysApart * 24;
    const observed = intervalHours === null ? '0' : formatNumber(intervalHours);
    return `Lacune maintenue : ${observed} h entre les réussites, minimum ${formatNumber(minimumHours)} h.`;
  }
  if (!checks.masteryReached) {
    return `Lacune maintenue : maîtrise ${formatNumber(mastery)} % sous le seuil ${formatNumber(params.masteryThreshold)} %.`;
  }
  if (!cleared) return 'Lacune maintenue.';
  return `Lacune levée : ${String(successCount)} réussites espacées de ${formatNumber(intervalHours ?? 0)} h, maîtrise ${formatNumber(mastery)} % ≥ ${formatNumber(params.masteryThreshold)} %.`;
}

/**
 * ET-2, EF-5, CL-4 — a gap is cleared only by `clearSuccesses` successes of the notion, after its
 * detection, at least `clearMinDaysApart` days apart (absolute 24 h, hence 23 h 59 keeps the gap)
 * and with mastery at or above the threshold. The returned `gap` carries `clearedAt` for history.
 */
export function clearGap(input: ClearGapInput): GapClearanceResult {
  const parsed = assertValid(ClearGapInputSchema, input);
  const params = resolveParams(parsed.params);
  const nowMs = parseInstant(parsed.now);
  assertGapConsistency(parsed.gap, parsed.notion ?? null, 'gap');
  const { detectedAtMs } = readGapInstants(parsed.gap, nowMs, 'gap');
  const activeGap = parsed.gap.clearedAt === null;

  const successes = parsed.successes
    .map((answer, index) => {
      const answeredAtMs = parseInstant(answer.answeredAt);
      if (answeredAtMs > nowMs) {
        throw invalidInput(
          `successes.${String(index)}.answeredAt`,
          'Une réussite ne peut pas être postérieure à l’instant.',
        );
      }
      return { answer, answeredAtMs };
    })
    .filter(
      ({ answer, answeredAtMs }) =>
        answeredAtMs >= detectedAtMs &&
        (parsed.notion === undefined || answer.notionIds.includes(parsed.notion)) &&
        isGapSuccess(answer, params.failureRatio),
    )
    .sort(compareAnswers);

  const successCount = successes.length;
  const first = successes[0];
  const last = successes[successes.length - 1];
  const intervalMs =
    successCount >= 2 && first !== undefined && last !== undefined
      ? last.answeredAtMs - first.answeredAtMs
      : null;
  const intervalHours = intervalMs === null ? null : intervalMs / MS_PER_HOUR;
  const checks: GapClearanceChecks = {
    activeGap,
    enoughSuccesses: successCount >= params.clearSuccesses,
    spaced: intervalMs !== null && intervalMs >= params.clearMinDaysApart * MS_PER_DAY,
    masteryReached: parsed.mastery >= params.masteryThreshold,
  };
  const cleared =
    checks.activeGap && checks.enoughSuccesses && checks.spaced && checks.masteryReached;
  const clearedAt = cleared ? parsed.now : null;
  const gap = cleared ? { ...parsed.gap, clearedAt: parsed.now } : parsed.gap;
  return {
    cleared,
    event: cleared ? 'cleared' : null,
    clearedAt,
    evidence: clearanceEvidence(
      cleared,
      checks,
      successCount,
      intervalHours,
      parsed.mastery,
      params,
    ),
    gap,
    successCount,
    intervalHours,
    checks,
  };
}
