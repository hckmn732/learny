// Correction of a practice exercise by the tutor (SPEC-613 EF-2, ET-4, ET-5, CL-5; BR-PRA-01).
//
// The deterministic `mockTutor` is the committed `LLM_MODE=mock` fixture: it receives only the
// validated production and the immutable instruction, never another learner's data. The raw
// sub-scores are bounded by `normalizeTutorCorrection` before anything is persisted or displayed:
// a score above a criterion, a negative value or a missing key is clamped to the barème.
import {
  ExerciseCorrectionSchema,
  type ExerciseCorrection,
  type ExerciseCriterion,
  type ExerciseCriterionResult,
  type ExerciseInstruction,
  type ExerciseNextStep,
  type ExerciseSubmission,
} from '@learny/contracts';
import { err, ok, type Result } from '@learny/core';

import { validateProduction, type ProductionIssue } from './validate-production';

export interface TutorCriterionScore {
  key: string;
  earned: number;
  comment: string;
}

export interface TutorCorrection {
  scores: readonly TutorCriterionScore[];
  summary: string;
}

export interface ExerciseTutor {
  correct(input: {
    instruction: ExerciseInstruction;
    submission: ExerciseSubmission;
  }): TutorCorrection;
}

export interface GradeExerciseOptions {
  hintsUsed: number;
  nextStep: ExerciseNextStep;
  tutor?: ExerciseTutor;
}

export interface GradeExerciseError {
  code: 'RESPONSE_INVALID';
  issues: ProductionIssue[];
}

export interface NormalizedTutorCorrection {
  criteria: ExerciseCriterionResult[];
  rejectedKeys: string[];
  summary: string;
}

function roundScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.trunc(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** CL-5 — bounds every tutor sub-score before persistence; overshoots are clamped, not shown. */
export function normalizeTutorCorrection(
  instruction: ExerciseInstruction,
  raw: TutorCorrection,
): NormalizedTutorCorrection {
  const byKey = new Map(raw.scores.map((score) => [score.key, score]));
  const rejectedKeys: string[] = [];
  const criteria: ExerciseCriterionResult[] = instruction.criteria.map((criterion) => {
    const candidate = byKey.get(criterion.key);
    const value = candidate?.earned ?? 0;
    const bounded = clamp(roundScore(value), 0, criterion.points);
    if (
      candidate !== undefined &&
      (!Number.isFinite(candidate.earned) ||
        candidate.earned < 0 ||
        candidate.earned > criterion.points)
    ) {
      rejectedKeys.push(criterion.key);
    }
    const ok = bounded === criterion.points;
    return {
      key: criterion.key,
      label: criterion.label,
      points: criterion.points,
      earned: bounded,
      ok,
      comment:
        candidate?.comment ??
        (ok ? 'Critère respecté.' : 'Critère à retravailler : relisez la consigne.'),
    };
  });
  return { criteria, rejectedKeys, summary: raw.summary };
}

function isExplanationCriterion(criterion: ExerciseCriterion): boolean {
  return /explication|explanation|démarche|demarche/iu.test(`${criterion.key} ${criterion.label}`);
}

function validExplanation(value: string | undefined): boolean {
  if (value === undefined) return false;
  const text = value.trim();
  if (text.length < 20) return false;
  return /d[ée]bit|cr[ée]dit|[ée]quilibr|partie double|compensation/iu.test(text);
}

function productionComplete(
  instruction: ExerciseInstruction,
  submission: ExerciseSubmission,
): boolean {
  if (submission.kind === 'table') {
    const table = instruction.production;
    if (table.kind !== 'table') return false;
    if (Object.values(submission.fields).some((value) => value.trim() === '')) return false;
    if (submission.rows.length < table.minRows) return false;
    return submission.rows.every((row) =>
      table.columns.every((column) => (row[column.key] ?? '').trim() !== ''),
    );
  }
  if (submission.kind === 'text') {
    const production = instruction.production;
    return production.kind === 'text' && submission.text.trim().length >= production.minChars;
  }
  if (submission.kind === 'file') return instruction.production.kind === 'file';
  return instruction.production.kind === 'link';
}

/**
 * Deterministic tutor fixture (`LLM_MODE=mock`): complete, well-explained productions pass every
 * criterion; a missing explanation loses its own criterion, never the others.
 */
export const mockTutor: ExerciseTutor = {
  correct({ instruction, submission }) {
    const complete = productionComplete(instruction, submission);
    const explained = validExplanation(submission.explanation);
    const scores = instruction.criteria.map((criterion) => {
      if (isExplanationCriterion(criterion)) {
        return {
          key: criterion.key,
          earned: explained ? criterion.points : 0,
          comment: explained
            ? 'Votre explication reprend la règle essentielle.'
            : 'Il manque l’idée clé : reliez la règle du cours à votre production.',
        };
      }
      return {
        key: criterion.key,
        earned: complete ? criterion.points : 0,
        comment: complete
          ? `${criterion.label} est conforme à la consigne.`
          : `${criterion.label} doit être complété conformément à la consigne.`,
      };
    });
    return {
      scores,
      summary: complete
        ? 'Production complète et cohérente : la règle est appliquée.'
        : 'Reprenez la consigne et complétez chaque poste avant de soumettre à nouveau.',
    };
  },
};

/**
 * ET-4 — validates the production, asks the tutor fixture, bounds the sub-scores and applies the
 * hint penalty before persistence. The returned correction is the only score ever displayed.
 */
export function gradeExercise(
  instruction: ExerciseInstruction,
  input: unknown,
  options: GradeExerciseOptions,
): Result<ExerciseCorrection, GradeExerciseError> {
  const validated = validateProduction(instruction, input);
  if (!validated.ok) {
    return err({ code: 'RESPONSE_INVALID', issues: validated.error });
  }
  const hintsUsed = clamp(roundScore(options.hintsUsed), 0, 2);
  const maxScore = Math.max(0, 10 - hintsUsed);
  const tutor = options.tutor ?? mockTutor;
  const raw = tutor.correct({ instruction, submission: validated.value });
  const normalized = normalizeTutorCorrection(instruction, raw);
  const sum = normalized.criteria.reduce((total, criterion) => total + criterion.earned, 0);
  const score = Math.min(sum, maxScore);
  const verdict = score >= instruction.passPoints ? 'passed' : 'retry';
  return ok(
    ExerciseCorrectionSchema.parse({
      score,
      maxScore,
      verdict,
      criteria: normalized.criteria,
      summary: normalized.summary,
      nextStep: options.nextStep,
    }),
  );
}
