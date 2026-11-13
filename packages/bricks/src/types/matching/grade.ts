// Code grading of a matching (SPEC-502 ET-3, BR-MEM-05). Opaque ids are rebuilt with the version
// seed through `opaqueMapping`, the same function that built the public payload. An error between
// two different notions becomes a confusion (CA-2); an extra right or null never does (CL-5).
import { err, ok, type Result } from '@learny/core';

import { dedupeConfusions, outcome, round4 } from '../../grade-support';
import type { Confusion, GradeError, GradeOutcome } from '../../grade-types';
import { normalizeText } from '../../normalize';

import { opaqueMapping } from './public';
import { parseMatchingResponse } from './response';
import type { MatchingPayload } from './schema';

export function gradeMatching(
  payload: MatchingPayload,
  response: unknown,
  seed: string,
): Result<GradeOutcome<'matching'>, GradeError> {
  const parsed = parseMatchingResponse(payload, response, seed);
  if (!parsed.ok) return err(parsed.error);

  const rights = opaqueMapping(payload, seed);
  const rightById = new Map(rights.map((right) => [right.id, right]));
  const pairById = new Map(payload.pairs.map((pair) => [pair.id, pair]));
  const confusions: Confusion[] = [];

  const results = payload.pairs.map((pair) => {
    const givenRightId = parsed.value.pairs[pair.id] ?? null;
    const givenRight = givenRightId === null ? undefined : rightById.get(givenRightId);
    const correct = givenRight?.pairId === pair.id;
    if (!correct && givenRight !== undefined && givenRight.pairId !== null) {
      const target = pairById.get(givenRight.pairId);
      if (target !== undefined && target.notionId !== pair.notionId) {
        confusions.push({
          notionId: pair.notionId,
          confusedWithNotionId: target.notionId,
        });
      }
    }
    return {
      pair,
      givenRightId,
      givenRight,
      correct,
    };
  });

  const correctCount = results.filter((result) => result.correct).length;

  return ok(
    outcome<'matching'>({
      isCorrect: correctCount === payload.pairs.length,
      score: round4(correctCount / payload.pairs.length),
      chosenDistractorNotionId: null,
      confusions: dedupeConfusions(confusions),
      normalizedResponse: results
        .map((result) =>
          result.givenRight === undefined ? '' : normalizeText(result.givenRight.text),
        )
        .join('|'),
      correction: {
        kind: 'matching',
        explanation: payload.explanation,
        pairs: results.map((result) => ({
          pairId: result.pair.id,
          left: result.pair.left,
          expectedRight: result.pair.right,
          givenRight: result.givenRight?.text ?? null,
          correct: result.correct,
        })),
      },
    }),
  );
}
