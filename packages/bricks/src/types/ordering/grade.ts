// Code grading of an ordering (SPEC-502 ET-3): one point per item left in its expected position,
// with the expected and given index of every item in the correction ("écarts").
import { err, ok, type Result } from '@learny/core';

import { outcome, round4 } from '../../grade-support';
import type { GradeError, GradeOutcome } from '../../grade-types';

import { parseOrderingResponse } from './response';
import type { OrderingPayload } from './schema';

export function gradeOrdering(
  payload: OrderingPayload,
  response: unknown,
): Result<GradeOutcome<'ordering'>, GradeError> {
  const parsed = parseOrderingResponse(payload, response);
  if (!parsed.ok) return err(parsed.error);

  const order = parsed.value.order;
  const positions = payload.items.map((item, expectedIndex) => {
    const givenIndex = order.indexOf(item.id);
    return {
      id: item.id,
      text: item.text,
      expectedIndex,
      givenIndex,
      correct: givenIndex === expectedIndex,
    };
  });
  const correctCount = positions.filter((position) => position.correct).length;

  return ok(
    outcome<'ordering'>({
      isCorrect: correctCount === payload.items.length,
      score: round4(correctCount / payload.items.length),
      chosenDistractorNotionId: null,
      confusions: [],
      normalizedResponse: order.join('|'),
      correction: {
        kind: 'ordering',
        explanation: payload.explanation,
        positions,
      },
    }),
  );
}
