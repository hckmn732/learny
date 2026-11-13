// Root grading entry point (SPEC-502 ET-2, BR-BRI-08). `gradeBrick` dispatches to the pure module
// of each auto-corrected type and explicitly refuses the three tutor-graded types. No I/O, no
// model call: the architecture test proves that no grade module imports an AI SDK (CA-7).
import { AppError, err, type Result } from '@learny/core';

import type { BrickType } from './brick-types';
import { gradedByTutor, invalidResponse, round2 } from './grade-support';
import type { AutoGradedType, GradeError, GradeOutcome } from './grade-types';
import type { BrickPayload } from './payloads';
import { gradeCategorization } from './types/categorization/grade';
import type { CategorizationPayload } from './types/categorization/schema';
import { gradeChoiceQuestion } from './types/choice-question/grade';
import type { ChoiceQuestionPayload } from './types/choice-question/schema';
import { gradeCloze } from './types/cloze/grade';
import type { ClozePayload } from './types/cloze/schema';
import { gradeMatching } from './types/matching/grade';
import type { MatchingPayload } from './types/matching/schema';
import { gradeOrdering } from './types/ordering/grade';
import type { OrderingPayload } from './types/ordering/schema';
import { gradeRecallCard } from './types/recall-card/grade';
import type { RecallCardPayload } from './types/recall-card/schema';

export function gradeBrick<T extends AutoGradedType>(
  type: T,
  payload: BrickPayload<T>,
  response: unknown,
  seed: string,
): Result<GradeOutcome, GradeError>;
export function gradeBrick(
  type: BrickType,
  payload: unknown,
  response: unknown,
  seed: string,
): Result<GradeOutcome, GradeError>;
/**
 * Grades one response against the version payload. `seed` is the version id: it rebuilds the
 * opaque ids of the public payload (ADR-0150). The payload is assumed schema-valid (stored
 * versions were validated when written).
 */
export function gradeBrick(
  type: BrickType,
  payload: unknown,
  response: unknown,
  seed: string,
): Result<GradeOutcome, GradeError> {
  switch (type) {
    case 'choice_question':
      return gradeChoiceQuestion(payload as ChoiceQuestionPayload, response);
    case 'cloze':
      return gradeCloze(payload as ClozePayload, response);
    case 'matching':
      return gradeMatching(payload as MatchingPayload, response, seed);
    case 'ordering':
      return gradeOrdering(payload as OrderingPayload, response);
    case 'categorization':
      return gradeCategorization(payload as CategorizationPayload, response);
    case 'recall_card':
      return gradeRecallCard(payload as RecallCardPayload, response);
    case 'open_question':
    case 'instruction':
    case 'scripted_dialogue':
      return err(gradedByTutor(type)); // CL-12, BR-BRI-08
    default:
      return err(
        invalidResponse([
          { path: 'type', message: `Brick type "${type}" has no code correction.` },
        ]),
      );
  }
}

/**
 * Bounds a tutor score to the scale fixed at creation and rounds it to 2 decimals (CL-10).
 * A non-finite input is a programming error and raises `RESPONSE_INVALID` (422).
 */
export function clampTutorScore(points: number, maxPoints: number): number {
  if (!Number.isFinite(points) || !Number.isFinite(maxPoints) || maxPoints < 0) {
    throw new AppError('RESPONSE_INVALID', 'La note du tuteur doit être un nombre fini.', {
      errors: [{ path: 'points', message: 'A finite number is required.' }],
    });
  }
  return round2(Math.min(Math.max(points, 0), maxPoints));
}
