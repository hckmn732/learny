// Code grading of a recall card (SPEC-502 EF-8, BR-MEM-02): the learner self-assesses and the same
// grade feeds FSRS. `again` is incorrect, the three other grades are correct.
import { err, ok, type Result } from '@learny/core';

import { outcome } from '../../grade-support';
import type { GradeError, GradeOutcome } from '../../grade-types';

import { parseRecallCardResponse } from './response';
import type { RecallCardPayload } from './schema';

export function gradeRecallCard(
  payload: RecallCardPayload,
  response: unknown,
): Result<GradeOutcome<'recall_card'>, GradeError> {
  const parsed = parseRecallCardResponse(response);
  if (!parsed.ok) return err(parsed.error);

  const { selfGrade } = parsed.value;
  const isCorrect = selfGrade !== 'again';

  return ok(
    outcome<'recall_card'>({
      isCorrect,
      score: isCorrect ? 1 : 0,
      chosenDistractorNotionId: null,
      confusions: [],
      normalizedResponse: selfGrade,
      correction: {
        kind: 'recall_card',
        front: payload.front,
        back: payload.back,
        selfGrade,
        fsrsGrade: selfGrade,
        correct: isCorrect,
        explanation: null,
      },
    }),
  );
}
