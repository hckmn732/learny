import {
  CADRAGE_RUBRIC_KEYS,
  type CadrageProfileValue,
  type CadrageRubricKey,
} from '@learny/contracts';
import { AppError } from '@learny/core';

import {
  CADRAGE_MAX_PROFILE_VALUE,
  type CadrageObjective,
  type CadrageQuestionKey,
  type CadrageSuggestion,
  type CadrageTurn,
} from './schema';

// Pure rules of the cadrage (SPEC-604 ET-3, BR-FOR-01, BR-FOR-02, ADR-0164). The tutor proposes;
// this function decides what is stored: the question ceiling, the waiting rubric, the profile
// values and the deduplicated objectives. It never touches the database or the clock.

export type CadrageProfile = Record<CadrageRubricKey, CadrageProfileValue>;

export interface ApplyTutorTurnConstraints {
  /** Number of questions already asked before this turn (0..5). */
  questionsAsked: number;
  /** True when the tutor already concluded: a later answer may update the profile, never ask. */
  finished?: boolean;
  /** Rubric of the question the learner just answered. */
  pendingQuestionKey?: CadrageQuestionKey | null;
  /** Raw answer of the learner, used when the tutor forgets to update the answered rubric. */
  learnerAnswer?: string | null;
  maxQuestions?: number;
  doneFallback: string;
}

export interface AppliedTutorTurn {
  profile: CadrageProfile;
  objectives: CadrageObjective[];
  questionsAsked: number;
  finished: boolean;
  /** Question number (1..5) when the turn ends with a question. */
  questionNumber: number | null;
  questionKey: CadrageQuestionKey | null;
  multi: boolean;
  suggestions: CadrageSuggestion[] | null;
  content: string;
}

const RUBRIC_KEYS = new Set<string>(CADRAGE_RUBRIC_KEYS);

function isRubricKey(key: CadrageQuestionKey): key is CadrageRubricKey {
  return RUBRIC_KEYS.has(key);
}

function initialProfile(profile: CadrageProfile): CadrageProfile {
  const next = {} as CadrageProfile;
  for (const key of CADRAGE_RUBRIC_KEYS) {
    next[key] = profile[key] ?? { value: null, state: 'todo' };
  }
  return next;
}

function invalid(detail: string): AppError {
  return new AppError('INVALID_OUTPUT', detail);
}

/**
 * A question must remain answerable: multiple choice needs two suggestions, values are unique,
 * and a question outside the five rubrics is allowed (`other`).
 */
function validQuestion(turn: Extract<CadrageTurn['next'], { kind: 'question' }>): void {
  const values = turn.suggestions.map((suggestion) => suggestion.value);
  if (new Set(values).size !== values.length) {
    throw invalid('Les valeurs des suggestions doivent être uniques.');
  }
  if (turn.multi && turn.suggestions.length < 2) {
    throw invalid('Une question à choix multiple exige au moins deux suggestions.');
  }
}

/** `done` overwrites only through an explicit update; the answered rubric is completed first. */
function applyUpdates(
  profile: CadrageProfile,
  turn: CadrageTurn,
  constraints: ApplyTutorTurnConstraints,
): CadrageProfile {
  const next = initialProfile(profile);
  const answeredKey = constraints.pendingQuestionKey ?? null;
  if (
    answeredKey !== null &&
    isRubricKey(answeredKey) &&
    (constraints.learnerAnswer ?? '').trim() !== '' &&
    !turn.profileUpdates.some((update) => update.key === answeredKey)
  ) {
    // CL-1 — the tutor may forget the update after an interruption; the learner's answer is kept.
    next[answeredKey] = {
      value: (constraints.learnerAnswer ?? '').trim().slice(0, CADRAGE_MAX_PROFILE_VALUE),
      state: 'done',
    };
  }
  for (const update of turn.profileUpdates) {
    next[update.key] = {
      value: update.value.slice(0, CADRAGE_MAX_PROFILE_VALUE),
      state: 'done',
    };
  }
  return next;
}

/**
 * Applies one validated turn. A sixth question is replaced by the default conclusion, a finished
 * cadrage never asks again, and the rubric of the new question becomes `waiting`.
 */
export function applyTutorTurn(
  profile: CadrageProfile,
  turn: CadrageTurn,
  constraints: ApplyTutorTurnConstraints,
): AppliedTutorTurn {
  const maxQuestions = constraints.maxQuestions ?? 5;
  const questionsAsked = Math.min(constraints.questionsAsked, maxQuestions);
  const nextProfile = applyUpdates(profile, turn, constraints);
  const objectives = [...new Set(turn.objectives)];

  if (turn.next.kind === 'question') validQuestion(turn.next);

  const forcedDone =
    turn.next.kind === 'question' &&
    (constraints.finished === true || questionsAsked >= maxQuestions);

  if (turn.next.kind === 'done' || forcedDone) {
    return {
      profile: nextProfile,
      objectives,
      questionsAsked,
      finished: true,
      questionNumber: null,
      questionKey: null,
      multi: false,
      suggestions: null,
      content: turn.next.kind === 'done' ? turn.next.text : constraints.doneFallback,
    };
  }

  const question = turn.next as Extract<CadrageTurn['next'], { kind: 'question' }>;
  const questionNumber = questionsAsked + 1;
  if (isRubricKey(question.questionKey) && nextProfile[question.questionKey].state !== 'done') {
    nextProfile[question.questionKey] = {
      ...nextProfile[question.questionKey],
      state: 'waiting',
    };
  }
  return {
    profile: nextProfile,
    objectives,
    questionsAsked: questionNumber,
    finished: false,
    questionNumber,
    questionKey: question.questionKey,
    multi: question.multi,
    suggestions: question.suggestions,
    content: question.text,
  };
}
