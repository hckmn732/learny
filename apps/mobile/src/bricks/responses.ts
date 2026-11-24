// Responses of the auto-corrected bricks, built on the device (SPEC-3301 EF-2 to EF-6, BR-BRI-08,
// CA-2).
//
// The shapes are exactly the ones of `@learny/bricks` (`choiceResponseSchema`,
// `clozeResponseSchema`, `matchingResponseSchema`, `orderingResponseSchema`,
// `categorizationResponseSchema`, `recallCardResponseSchema`): `toBrickResponse` of
// `@learny/domain` is the *server* bridge of the same contract, and it is not needed here — the
// public charge already keys the games by the opaque ids the response speaks.
//
// `localGrade` is the offline path of SPEC-3305: it wraps `gradeBrick` so that a caller never
// re-implements the correction of a game. Pure: no React Native import.
import type { ZodType } from 'zod';

import type { AutoGradedType, GradeError, GradeOutcome, RecallSelfGrade } from '@learny/bricks';
import {
  categorizationResponseSchema,
  choiceResponseSchema,
  clozeResponseSchema,
  gradeBrick,
  matchingResponseSchema,
  orderingResponseSchema,
  recallCardResponseSchema,
  RECALL_SELF_GRADES,
} from '@learny/bricks';
import { err, ok, type Result } from '@learny/core';

/** Response schema of each type corrected by the code (CA-2). */
export const RESPONSE_SCHEMAS: Record<AutoGradedType, ZodType> = {
  choice_question: choiceResponseSchema,
  cloze: clozeResponseSchema,
  matching: matchingResponseSchema,
  ordering: orderingResponseSchema,
  categorization: categorizationResponseSchema,
  recall_card: recallCardResponseSchema,
};

/** Response of a choice question: one option in single mode, one or more in multiple mode. */
export function choiceResponse(optionIds: readonly string[]): unknown {
  return { optionIds: [...optionIds] };
}

/**
 * Adds or removes one option, in the mode of the charge. A single-choice question replaces the
 * selection, a multiple one toggles it (EF-2).
 */
export function toggleChoiceOption(
  mode: 'single' | 'multiple',
  selected: readonly string[],
  optionId: string,
): readonly string[] {
  if (mode === 'single') return selected.includes(optionId) ? [] : [optionId];
  return selected.includes(optionId)
    ? selected.filter((id) => id !== optionId)
    : [...selected, optionId];
}

/** Response of a cloze: one entry per gap, the empty string included. */
export function clozeResponse(values: Readonly<Record<string, string>>): unknown {
  return { gaps: { ...values } };
}

/** Response of a matching: one right id (or null) per left id. */
export function matchingResponse(pairs: Readonly<Record<string, string | null>>): unknown {
  return { pairs: { ...pairs } };
}

/** Response of an ordering: every item id, in the order of the screen. */
export function orderingResponse(order: readonly string[]): unknown {
  return { order: [...order] };
}

/** Response of a categorization: one category id (or null) per item id. */
export function categorizationResponse(
  assignments: Readonly<Record<string, string | null>>,
): unknown {
  return { assignments: { ...assignments } };
}

/** Response of a recall card: the learner's self-assessment (EF-6). */
export function recallResponse(selfGrade: RecallSelfGrade): unknown {
  return { selfGrade };
}

/** True when the response matches the response schema of its type (CA-2). */
export function isValidResponse(type: AutoGradedType, response: unknown): boolean {
  return RESPONSE_SCHEMAS[type].safeParse(response).success;
}

/**
 * Local correction of a stored brick version (BR-BRI-08, SPEC-3305). The payload is the full
 * version payload, which only an offline store keeps; the seed is the version id, as on the server.
 */
export function localGrade(
  type: AutoGradedType,
  payload: unknown,
  response: unknown,
  seed: string,
): Result<GradeOutcome, GradeError> {
  const result = gradeBrick(type, payload, response, seed);
  if (result.ok) return ok(result.value);
  return err(result.error);
}
/** Record view of a response received as `unknown` (a component never trusts its caller). */
function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Selected option ids of a choice response, tolerant of a missing or partial response. */
export function selectedOptionIds(response: unknown): readonly string[] {
  const value = asRecord(response)['optionIds'];
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

/** Values of a cloze response, keyed by gap id. */
export function clozeValues(response: unknown): Readonly<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const [id, value] of Object.entries(asRecord(asRecord(response)['gaps']))) {
    if (typeof value === 'string') values[id] = value;
  }
  return values;
}

/** Placements of a matching response, keyed by left id. */
export function matchingPairs(response: unknown): Readonly<Record<string, string | null>> {
  const pairs: Record<string, string | null> = {};
  for (const [id, value] of Object.entries(asRecord(asRecord(response)['pairs']))) {
    if (typeof value === 'string' || value === null) pairs[id] = value;
  }
  return pairs;
}

/** Order of an ordering response. */
export function orderingIds(response: unknown): readonly string[] {
  const value = asRecord(response)['order'];
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

/** Assignments of a categorization response, keyed by item id. */
export function categorizationAssignments(
  response: unknown,
): Readonly<Record<string, string | null>> {
  const assignments: Record<string, string | null> = {};
  for (const [id, value] of Object.entries(asRecord(asRecord(response)['assignments']))) {
    if (typeof value === 'string' || value === null) assignments[id] = value;
  }
  return assignments;
}

/** Self-assessment of a recall card, or null before the learner answered. */
export function recallSelfGrade(response: unknown): RecallSelfGrade | null {
  const value = asRecord(response)['selfGrade'];
  return typeof value === 'string' && (RECALL_SELF_GRADES as readonly string[]).includes(value)
    ? (value as RecallSelfGrade)
    : null;
}
