// Code grading of a categorization (SPEC-502 ET-3, BR-MEM-05). An item placed in the category of
// another notion becomes a confusion (CA-2); an unknown or notion-less category only an error.
import { err, ok, type Result } from '@learny/core';

import { dedupeConfusions, outcome, round4 } from '../../grade-support';
import type { Confusion, GradeError, GradeOutcome } from '../../grade-types';

import { parseCategorizationResponse } from './response';
import type { CategorizationPayload } from './schema';

export function gradeCategorization(
  payload: CategorizationPayload,
  response: unknown,
): Result<GradeOutcome<'categorization'>, GradeError> {
  const parsed = parseCategorizationResponse(payload, response);
  if (!parsed.ok) return err(parsed.error);

  const categories = new Map(payload.categories.map((category) => [category.id, category]));
  const confusions: Confusion[] = [];

  const results = payload.items.map((item) => {
    const givenCategoryId = parsed.value.assignments[item.id] ?? null;
    const expectedCategory = categories.get(item.categoryId);
    const givenCategory = givenCategoryId === null ? undefined : categories.get(givenCategoryId);
    const correct = givenCategoryId === item.categoryId;
    if (
      !correct &&
      expectedCategory !== undefined &&
      givenCategory !== undefined &&
      expectedCategory.notionId !== null &&
      givenCategory.notionId !== null &&
      expectedCategory.notionId !== givenCategory.notionId
    ) {
      confusions.push({
        notionId: expectedCategory.notionId,
        confusedWithNotionId: givenCategory.notionId,
      });
    }
    return {
      item,
      givenCategoryId,
      expectedCategory,
      givenCategory,
      correct,
    };
  });

  const correctCount = results.filter((result) => result.correct).length;

  return ok(
    outcome<'categorization'>({
      isCorrect: correctCount === payload.items.length,
      score: round4(correctCount / payload.items.length),
      chosenDistractorNotionId: null,
      confusions: dedupeConfusions(confusions),
      normalizedResponse: results
        .map((result) => `${result.item.id}=${result.givenCategoryId ?? ''}`)
        .join('|'),
      correction: {
        kind: 'categorization',
        explanation: payload.explanation,
        items: results.map((result) => ({
          id: result.item.id,
          text: result.item.text,
          expectedCategoryId: result.item.categoryId,
          expectedCategoryLabel: result.expectedCategory?.label ?? result.item.categoryId,
          givenCategoryId: result.givenCategoryId,
          givenCategoryLabel: result.givenCategory?.label ?? null,
          correct: result.correct,
        })),
      },
    }),
  );
}
