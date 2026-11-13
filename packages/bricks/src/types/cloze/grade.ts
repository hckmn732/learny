// Code grading of a cloze (SPEC-502 ET-3, BR-MEM-05): every gap is compared through `normalizeText`
// against the accepted variants; no spelling tolerance beyond that (CL-3, CL-4).
import { err, ok, type Result } from '@learny/core';

import { outcome, round4 } from '../../grade-support';
import type { GradeError, GradeOutcome } from '../../grade-types';
import { normalizeText } from '../../normalize';

import { parseClozeResponse } from './response';
import type { ClozePayload } from './schema';

export function gradeCloze(
  payload: ClozePayload,
  response: unknown,
): Result<GradeOutcome<'cloze'>, GradeError> {
  const parsed = parseClozeResponse(payload, response);
  if (!parsed.ok) return err(parsed.error);

  const gaps = [...payload.gaps].sort((left, right) => left.id - right.id);
  const results = gaps.map((gap) => {
    const given = parsed.value.gaps[String(gap.id)] ?? '';
    const accepted = new Set(gap.answers.map((answer) => normalizeText(answer)));
    return {
      gap,
      given,
      expected: gap.answers[0] ?? '',
      correct: accepted.has(normalizeText(given)),
    };
  });
  const correctCount = results.filter((result) => result.correct).length;
  const isCorrect = correctCount === gaps.length;

  return ok(
    outcome<'cloze'>({
      isCorrect,
      score: round4(correctCount / gaps.length),
      chosenDistractorNotionId: null,
      confusions: [],
      normalizedResponse: results.map((result) => normalizeText(result.given)).join('|'),
      correction: {
        kind: 'cloze',
        explanation: payload.explanation,
        gaps: results.map((result) => ({
          id: result.gap.id,
          given: result.given,
          expected: result.expected,
          correct: result.correct,
        })),
      },
    }),
  );
}
