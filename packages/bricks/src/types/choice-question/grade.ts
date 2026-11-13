// Code grading of a choice question (SPEC-502 ET-3, EF-2, EF-3). Single mode is all-or-nothing;
// multiple mode applies `max(0, (TP - FP) / C)` and is correct only on the exact set.
import { err, ok, type Result } from '@learny/core';

import { clampScore, outcome, round4 } from '../../grade-support';
import type { GradeError, GradeOutcome } from '../../grade-types';

import { parseChoiceResponse } from './response';
import type { ChoiceQuestionPayload } from './schema';

export function gradeChoiceQuestion(
  payload: ChoiceQuestionPayload,
  response: unknown,
): Result<GradeOutcome<'choice_question'>, GradeError> {
  const parsed = parseChoiceResponse(payload, response);
  if (!parsed.ok) return err(parsed.error);

  const chosen = new Set(parsed.value.optionIds);
  const correctIds = new Set(
    payload.options.filter((option) => option.correct).map((option) => option.id),
  );
  const truePositives = [...chosen].filter((id) => correctIds.has(id)).length;
  const falsePositives = chosen.size - truePositives;

  const isCorrect =
    chosen.size === correctIds.size && [...correctIds].every((id) => chosen.has(id));
  const score =
    payload.mode === 'single'
      ? isCorrect
        ? 1
        : 0
      : round4(
          clampScore(
            Math.max(0, truePositives - falsePositives) /
              (correctIds.size === 0 ? 1 : correctIds.size),
          ),
        );

  // EF-3: the notion of the first chosen distractor in the option order, even when it is null.
  const distractor = payload.options.find((option) => !option.correct && chosen.has(option.id));

  return ok(
    outcome<'choice_question'>({
      isCorrect,
      score,
      chosenDistractorNotionId: distractor?.notionId ?? null,
      confusions: [],
      normalizedResponse: [...chosen].sort().join(','),
      correction: {
        kind: 'choice_question',
        explanation: payload.explanation,
        options: payload.options.map((option) => ({
          id: option.id,
          text: option.text,
          correct: option.correct,
          chosen: chosen.has(option.id),
        })),
      },
    }),
  );
}
