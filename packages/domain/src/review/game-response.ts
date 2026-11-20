// Bridge between the game contracts of SPEC-702 and the brick grading of SPEC-502. The contract
// speaks arrays of pairs/assignments/gaps; `gradeBrick` speaks records keyed by the opaque ids of
// the public payload. Both directions stay server-side: the correction sent back is the contract
// shape of ET-2, the brick one never reaches the browser.

import {
  opaqueMapping,
  type BrickPayload,
  type CorrectionView,
  type GradeOutcome,
} from '@learny/bricks';
import type {
  ReviewCategorizationCorrection,
  ReviewCategorizationResponse,
  ReviewClozeCorrection,
  ReviewClozeResponse,
  ReviewGameCorrection,
  ReviewGameFormat,
  ReviewGameResponse,
  ReviewMatchingCorrection,
  ReviewMatchingResponse,
  ReviewOrderingCorrection,
  ReviewOrderingResponse,
} from '@learny/contracts';

/** ET-1 — contract response → response schema of the brick (records of opaque ids). */
export function toBrickResponse(type: ReviewGameFormat, response: ReviewGameResponse): unknown {
  switch (type) {
    case 'matching': {
      const pairs: Record<string, string> = {};
      for (const pair of (response as ReviewMatchingResponse).pairs) {
        pairs[pair.leftId] = pair.rightId;
      }
      return { pairs };
    }
    case 'ordering':
      return { order: (response as ReviewOrderingResponse).order };
    case 'categorization': {
      const assignments: Record<string, string> = {};
      for (const assignment of (response as ReviewCategorizationResponse).assignments) {
        assignments[assignment.itemId] = assignment.categoryId;
      }
      return { assignments };
    }
    case 'cloze': {
      const gaps: Record<string, string> = {};
      for (const gap of (response as ReviewClozeResponse).gaps) {
        gaps[gap.gapId] = gap.value;
      }
      return { gaps };
    }
  }
}

function matchingCorrection(
  payload: BrickPayload<'matching'>,
  correction: CorrectionView<'matching'>,
  seed: string,
): ReviewMatchingCorrection {
  const rightIdByText = new Map(
    opaqueMapping(payload, seed).map((right) => [right.text, right.id]),
  );
  return {
    kind: 'matching',
    pairs: correction.pairs.map((pair) => ({
      leftId: pair.pairId,
      rightId: pair.givenRight === null ? null : (rightIdByText.get(pair.givenRight) ?? null),
      ok: pair.correct,
      expectedRightId: rightIdByText.get(pair.expectedRight) ?? '',
      expectedLeftLabel: pair.left,
    })),
  };
}

function orderingCorrection(correction: CorrectionView<'ordering'>): ReviewOrderingCorrection {
  return {
    kind: 'ordering',
    rows: correction.positions.map((position) => ({
      stepId: position.id,
      position: position.givenIndex + 1,
      ok: position.correct,
      expectedPosition: position.expectedIndex + 1,
    })),
  };
}

function categorizationCorrection(
  correction: CorrectionView<'categorization'>,
): ReviewCategorizationCorrection {
  return {
    kind: 'categorization',
    rows: correction.items.map((item) => ({
      itemId: item.id,
      categoryId: item.givenCategoryId,
      ok: item.correct,
      expectedCategoryId: item.expectedCategoryId,
      expectedCategoryLabel: item.expectedCategoryLabel,
    })),
  };
}

function clozeCorrection(correction: CorrectionView<'cloze'>): ReviewClozeCorrection {
  return {
    kind: 'cloze',
    gaps: correction.gaps.map((gap) => ({
      gapId: String(gap.id),
      ok: gap.correct,
      expected: gap.expected,
      given: gap.given,
    })),
  };
}

/** ET-2 — correction of `gradeBrick` → contract correction (stable, serialisable). */
export function toGameCorrection(
  type: ReviewGameFormat,
  payload: unknown,
  outcome: GradeOutcome,
  seed: string,
): ReviewGameCorrection {
  switch (type) {
    case 'matching':
      return matchingCorrection(
        payload as BrickPayload<'matching'>,
        outcome.correction as CorrectionView<'matching'>,
        seed,
      );
    case 'ordering':
      return orderingCorrection(outcome.correction as CorrectionView<'ordering'>);
    case 'categorization':
      return categorizationCorrection(outcome.correction as CorrectionView<'categorization'>);
    case 'cloze':
      return clozeCorrection(outcome.correction as CorrectionView<'cloze'>);
  }
}

/** ET-2 — explanation attached to a correction (always a string for the four games). */
export function correctionExplanation(outcome: GradeOutcome): string | null {
  const correction = outcome.correction as { explanation?: unknown };
  return typeof correction.explanation === 'string' ? correction.explanation : null;
}
